import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';
import { sanitizePlanWorkouts } from '../_shared/validator.ts';
import { logger } from '../_shared/logger.ts';
import { DateResolver } from '../_shared/dateResolverBackend.ts';
import {
  createClarificationRequest,
  createCoachMessage,
  createModificationIntentResponse,
  type ClarificationOption,
  type ModificationIntent,
} from '../_shared/clarificationWorkflow.ts';
import { extractDatePhrases, hasAmbiguousDateReference, detectTierChangeRequest, extractTierFromPlanData, type PlanTier } from '../_shared/phraseAnalyzer.ts';
import { computeFatigueSignals, formatFatigueSignalsForPrompt, type WorkoutHistoryEntry } from '../_shared/fatigueEngine.ts';
import { buildWorkoutFeedbackContext } from '../_shared/workoutFeedbackContext.ts';
import {
  isFatigueRequest,
  isFatigueOptionsFollowUp,
  isExplicitRecoveryWeekRequest,
  isMarathonDistance,
  generateFatigueOptions,
  generateLongRunPreservationChoices,
  buildFatigueInterventionMessage,
  buildLongRunPreservationMessage,
  parseLongRunPreservationResponse,
  mapPreservationOptionToLevel,
  type FatigueInterventionContext,
  type FatigueInterventionOption,
  type LongRunPreservationOption,
} from '../_shared/fatigueInterventionPlanner.ts';
import {
  checkAmbitionFeasibility,
  buildAmbitionAdvisoryResponse,
  parseAmbitionAdvisoryResponse,
  type AmbitionTier,
} from '../_shared/ambitionFeasibilityCheck.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface RequestBody {
  mode?: 'draft' | 'confirm' | 'confirm_intent' | 'confirm_advisory' | 'commit' | 'clarification_response' | 'select_fatigue_option' | 'select_long_run_option' | 'select_ambition_option' | 'confirm_tier_change' | 'select_tier';
  message?: string;
  selectedTier?: string;
  selectedFatigueLevel?: string;
  selectedLongRunOption?: LongRunPreservationOption;
  selectedAmbitionOption?: number;
  chatHistory?: Array<{ role: string; content: string }>;
  planId?: string;
  planVersion?: number;
  userTimezone?: string;
  todayISO?: string;
  proposal_id?: string;
  intent?: string;
  reasoning?: string;
  advisoryId?: string;
  previewId?: string;
  clarificationId?: string;
  selectedDate?: string;
  detectedPhrase?: string;
  originalMessage?: string;
  planData?: any;
  userProfile?: any;
  resolvedDates?: Record<string, string>;
  previousProposal?: any;
  pendingRecoveryWeekProposalId?: string;
  insertionWeekOffset?: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    const body: RequestBody = await req.json();
    const { mode = 'draft', planId, planVersion, userTimezone, message, chatHistory } = body;

    logger.info('[Gold Chat] Request received', { mode, planId, planVersion, userTimezone });

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const userClient = authHeader
      ? createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: authHeader } } })
      : null;

    const userId = userClient
      ? (await userClient.auth.getUser()).data.user?.id
      : null;

    if (mode === 'confirm') {
      return await handleConfirm(body, supabase, userId);
    }

    if (mode === 'confirm_intent') {
      return await handleConfirmIntent(body, supabase, userId);
    }

    if (mode === 'select_fatigue_option') {
      return await handleSelectFatigueOption(body, supabase, userId);
    }

    if (mode === 'select_long_run_option') {
      return await handleSelectLongRunOption(body, supabase, userId);
    }

    if (mode === 'select_ambition_option') {
      return await handleSelectAmbitionOption(body, supabase, userId);
    }

    if (mode === 'confirm_tier_change') {
      return await handleConfirmTierChange(body, supabase, userId);
    }

    if (mode === 'select_tier') {
      return await handleSelectTier(body, supabase, userId);
    }

    const { data: plan, error: planError } = await supabase
      .from('training_plans')
      .select('*')
      .eq('id', planId)
      .single();

    if (planError || !plan) {
      logger.error('[Gold Chat] Plan not found', { planId, error: planError });
      return Response.json(
        createCoachMessage('Sorry, I could not find your training plan.'),
        { headers: corsHeaders }
      );
    }

    const timezone = userTimezone || plan.timezone || 'Europe/Paris';
    const resolver = new DateResolver(body.todayISO, timezone);
    const todayISO = resolver.getTodayISO();

    if (mode === 'confirm_advisory' || mode === 'commit') {
      return Response.json(
        createCoachMessage('This mode is not supported in V1. Please use the draft mode.'),
        { headers: corsHeaders }
      );
    }

    if (mode === 'clarification_response') {
      const { selectedDate, detectedPhrase, originalMessage, chatHistory: clHistory, planData, planVersion: clPlanVersion, userProfile } = body;

      const SESSION_EDIT_RE = /\b(cancel|skip|remove|delete|move|swap|shift|reschedule|change)\b/i;
      const isSessionEdit = originalMessage && SESSION_EDIT_RE.test(originalMessage);

      if (isSessionEdit) {
        logger.info('[Gold Chat] Clarification response for session-level edit — forwarding to chat-training-plan-v2', { originalMessage, selectedDate });

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const v2Body = {
          mode: 'clarification_response',
          clarificationId: body.clarificationId,
          selectedDate,
          detectedPhrase,
          originalMessage,
          chatHistory: clHistory,
          planId,
          planData,
          planVersion: clPlanVersion,
          userProfile,
          userTimezone,
          todayISO: body.todayISO,
        };

        const authHeader = req.headers.get('Authorization');
        const v2Response = await fetch(`${supabaseUrl}/functions/v1/chat-training-plan-v2`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': authHeader ?? '',
            'apikey': Deno.env.get('SUPABASE_ANON_KEY') ?? '',
          },
          body: JSON.stringify(v2Body),
        });

        const v2Data = await v2Response.json();
        return Response.json(v2Data, { headers: corsHeaders });
      }

      // Structural clarification: substitute the resolved date into the message and re-run draft
      if (selectedDate && detectedPhrase && originalMessage) {
        const resolvedMessage = originalMessage.replace(new RegExp(detectedPhrase, 'i'), selectedDate);
        logger.info('[Gold Chat] Clarification response for structural edit — re-running draft with resolved date', { resolvedMessage });

        const [completionsResult, feedbackContext] = await Promise.all([
          supabase
            .from('workout_completions')
            .select('scheduled_date, rating, distance_km, duration_minutes, enjoyment, notes')
            .eq('training_plan_id', planId)
            .order('scheduled_date', { ascending: false })
            .limit(60),
          buildWorkoutFeedbackContext(supabase, planId, 28),
        ]);

        const completions = completionsResult.data || [];
        const workoutHistory: WorkoutHistoryEntry[] = completions.map((c: any) => ({
          date: c.scheduled_date,
          rpe: c.rating ?? 5,
          distanceKm: c.distance_km ?? 0,
          durationMin: c.duration_minutes ?? 0,
          completed: true,
          enjoyment: c.enjoyment ?? undefined,
          notes: c.notes ?? undefined,
        }));
        const fatigueSignals = computeFatigueSignals(workoutHistory, todayISO);
        const feedbackCtx = await buildWorkoutFeedbackContext(supabase, planId, 28);

        return await handleDraft(resolvedMessage, clHistory || [], plan, resolver, todayISO, supabase, userId, fatigueSignals, feedbackCtx);
      }

      return Response.json(
        createCoachMessage('I could not process that selection. Please try again.'),
        { headers: corsHeaders }
      );
    }

    if (!message) {
      return Response.json(
        createCoachMessage('Please send a message.'),
        { headers: corsHeaders }
      );
    }

    logger.info('[Gold Chat] Date context', { timezone, todayISO, providedToday: body.todayISO });

    if (hasAmbiguousDateReference(message)) {
      const phrases = extractDatePhrases(message);
      const ambiguousPhrase = phrases.find(p => p.isAmbiguous);

      if (ambiguousPhrase) {
        const resolution = resolver.resolveRelativeDay(ambiguousPhrase.phrase);

        if (resolution.isAmbiguous && resolution.options) {
          logger.info('[Gold Chat] Ambiguous date detected', {
            phrase: ambiguousPhrase.phrase,
            options: resolution.options
          });

          const clarificationOptions: ClarificationOption[] = resolution.options.map((opt, idx) => ({
            id: `opt-${idx}`,
            isoDate: opt.isoDate,
            displayDate: opt.displayDate,
            label: opt.label,
          }));

          return Response.json(
            createClarificationRequest(
              resolution.requiresClarification || `Which ${ambiguousPhrase.phrase} did you mean?`,
              clarificationOptions,
              message,
              ambiguousPhrase.phrase
            ),
            { headers: corsHeaders }
          );
        }
      }
    }

    const [completionsResult, feedbackContext] = await Promise.all([
      supabase
        .from('workout_completions')
        .select('scheduled_date, rating, distance_km, duration_minutes, enjoyment, notes')
        .eq('training_plan_id', planId)
        .order('scheduled_date', { ascending: false })
        .limit(60),
      buildWorkoutFeedbackContext(supabase, planId, 28),
    ]);

    const completions = completionsResult.data || [];

    const workoutHistory: WorkoutHistoryEntry[] = completions.map((c: any) => ({
      date: c.scheduled_date,
      rpe: c.rating ?? 5,
      distanceKm: c.distance_km ?? 0,
      durationMin: c.duration_minutes ?? 0,
      completed: true,
      enjoyment: c.enjoyment ?? undefined,
      notes: c.notes ?? undefined,
    }));

    const fatigueSignals = computeFatigueSignals(workoutHistory, todayISO);

    logger.info('[Gold Chat] Feedback context built', {
      hasFeedback: feedbackContext.hasFeedback,
      suggestedActionsCount: feedbackContext.suggestedActions.length,
      recentMissed: feedbackContext.recentMissedCount,
      recentHarder: feedbackContext.recentHarderCount,
    });

    return await handleDraft(message, chatHistory || [], plan, resolver, todayISO, supabase, userId, fatigueSignals, feedbackContext);

  } catch (error) {
    logger.error('[Gold Chat] Unhandled error', {
      message: error?.message,
      name: error?.name,
      stack: error?.stack,
      cause: error?.cause,
    });
    console.error('[Gold Chat] FULL ERROR:', error);
    return Response.json(
      createCoachMessage('Sorry, something went wrong. Please try again.'),
      { status: 500, headers: corsHeaders }
    );
  }
});

async function handleSelectFatigueOption(
  body: RequestBody,
  supabase: ReturnType<typeof createClient>,
  userId: string | null | undefined
): Promise<Response> {
  const { selectedFatigueLevel, planId, userTimezone } = body;

  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
  }

  if (!selectedFatigueLevel || !planId) {
    return Response.json({ error: 'selectedFatigueLevel and planId are required' }, { status: 400, headers: corsHeaders });
  }

  // L4 routes through the existing recovery rebuild pathway with feasibility check
  if (selectedFatigueLevel === 'L4') {
    const { data: proposal, error: proposalError } = await supabase
      .from('plan_edit_proposals')
      .insert({
        training_plan_id: planId,
        user_id: userId,
        intent: 'insert_recovery_week',
        reference_phrases: [],
        llm_explanation: 'Runner selected full recovery week from fatigue intervention options.',
        raw_llm_response: { reasoning: 'Fatigue intervention L4 selected by runner.' },
        status: 'pending_resolution',
      })
      .select('id')
      .single();

    if (proposalError || !proposal) {
      logger.error('[Gold Chat] Failed to store L4 fatigue proposal', proposalError);
      return Response.json({ error: 'Failed to store proposal' }, { status: 500, headers: corsHeaders });
    }

    // Route through feasibility check for competitive tier warning
    return await handleConfirmWithFeasibilityCheck(
      { ...body, proposal_id: proposal.id, mode: 'confirm' },
      supabase,
      userId
    );
  }

  // L1–L3: fetch plan, apply session-level patches, save updated plan_data
  const { data: plan, error: planError } = await supabase
    .from('training_plans')
    .select('plan_data, workout_version, start_date')
    .eq('id', planId)
    .eq('user_id', userId)
    .single();

  if (planError || !plan) {
    logger.error('[Gold Chat] Plan not found for fatigue patch', { planId, planError });
    return Response.json({ error: 'Plan not found' }, { status: 404, headers: corsHeaders });
  }

  const todayISO = body.todayISO || new Date().toISOString().slice(0, 10);
  const planDays: any[] = plan.plan_data?.days ?? [];

  // Determine current week bounds (Monday–Sunday)
  const dow = new Date(todayISO + 'T12:00:00Z').getUTCDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const mondayMs = new Date(todayISO + 'T00:00:00Z').getTime() + mondayOffset * 86400000;
  const sundayMs = mondayMs + 7 * 86400000;

  const isThisWeek = (dateStr: string) => {
    const t = new Date(dateStr + 'T00:00:00Z').getTime();
    return t >= mondayMs && t < sundayMs;
  };

  const KM_RE = /(\d+(?:\.\d+)?)\s*km/i;

  const isQualityWorkout = (workout: string) => {
    const lower = workout.toLowerCase();
    return lower.includes('interval') || lower.includes('tempo') || lower.includes('threshold') ||
      lower.includes('speed') || lower.includes('fartlek') || lower.includes('repeat') ||
      lower.includes('progression') || lower.includes('race pace');
  };

  const isLongRun = (workout: string) => workout.toLowerCase().includes('long run');

  const scaleKmInText = (text: string, factor: number): string => {
    return text.replace(KM_RE, (match, km) => {
      const scaled = Math.round(parseFloat(km) * factor * 2) / 2;
      return `${scaled} km`;
    });
  };

  let updatedDays = planDays.map((day: any) => ({ ...day }));
  let modifiedCount = 0;
  let message = '';

  if (selectedFatigueLevel === 'L1') {
    // Convert the next upcoming training day to rest
    const nextTrainIdx = updatedDays.findIndex(
      (d: any) => d.date >= todayISO && d.workout_type === 'TRAIN'
    );
    if (nextTrainIdx !== -1) {
      const skipped = updatedDays[nextTrainIdx];
      const title = skipped.workout?.split('\n')[0]?.slice(0, 50) || 'your next workout';
      updatedDays[nextTrainIdx] = {
        ...skipped,
        workout_type: 'REST',
        workout: 'Rest day (recovery — skipped session)',
      };
      modifiedCount = 1;
      message = `Done. "${title}" has been converted to a rest day. All other sessions remain unchanged. Check back in after a day or two — if you're still feeling flat, we can look at more options.`;
    } else {
      message = "There are no upcoming training sessions left to skip this week. If you need more rest, let me know.";
    }

  } else if (selectedFatigueLevel === 'L2') {
    // Convert quality session → easy run; reduce long run ~12%
    const thisWeekTrainDays = updatedDays.filter(
      (d: any) => isThisWeek(d.date) && d.workout_type === 'TRAIN'
    );
    for (const day of thisWeekTrainDays) {
      const idx = updatedDays.findIndex((d: any) => d.date === day.date);
      if (idx === -1) continue;
      if (isLongRun(day.workout || '')) {
        updatedDays[idx] = {
          ...day,
          workout: scaleKmInText(day.workout, 0.88),
        };
        modifiedCount++;
      } else if (isQualityWorkout(day.workout || '')) {
        const distanceMatch = (day.workout || '').match(KM_RE);
        const easyDistance = distanceMatch
          ? `${Math.round(parseFloat(distanceMatch[1]) * 2) / 2} km`
          : '5–8 km';
        updatedDays[idx] = {
          ...day,
          workout: `Easy run — ${easyDistance} at comfortable, conversational pace\n(Softened from quality session for recovery)`,
        };
        modifiedCount++;
      }
    }
    message = `Done. Your quality session has been converted to an easy run and your long run reduced by ~12% this week. All other sessions remain as planned. You should recover well without losing momentum.`;

  } else if (selectedFatigueLevel === 'L3') {
    // Reduce all this-week training distances ~15%; ease quality session intensity
    const thisWeekTrainDays = updatedDays.filter(
      (d: any) => isThisWeek(d.date) && d.workout_type === 'TRAIN'
    );
    for (const day of thisWeekTrainDays) {
      const idx = updatedDays.findIndex((d: any) => d.date === day.date);
      if (idx === -1) continue;
      if (isQualityWorkout(day.workout || '')) {
        updatedDays[idx] = {
          ...day,
          workout: scaleKmInText(day.workout, 0.85) + '\n(Reduced intensity — easy-moderate effort for recovery)',
        };
      } else {
        updatedDays[idx] = {
          ...day,
          workout: scaleKmInText(day.workout, 0.85),
        };
      }
      modifiedCount++;
    }
    message = `Done. This week's training has been reduced by ~15% across all sessions. Your quality session is kept but at easy-moderate effort. The plan will continue building from next week.`;

  } else {
    return Response.json({ error: 'Invalid fatigue level' }, { status: 400, headers: corsHeaders });
  }

  if (modifiedCount > 0) {
    const newPlanData = { ...plan.plan_data, days: updatedDays };
    const { error: updateError } = await supabase
      .from('training_plans')
      .update({
        plan_data: newPlanData,
        workout_version: (plan.workout_version ?? 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', planId)
      .eq('user_id', userId);

    if (updateError) {
      logger.error('[Gold Chat] Failed to save fatigue patch', { selectedFatigueLevel, updateError });
      return Response.json({ error: 'Failed to save changes' }, { status: 500, headers: corsHeaders });
    }
  }

  logger.info('[Gold Chat] Fatigue intervention applied', { selectedFatigueLevel, planId, modifiedCount });

  return Response.json({
    mode: 'fatigue_plan_updated',
    level: selectedFatigueLevel,
    message,
    modifiedCount,
  }, { headers: corsHeaders });
}

async function handleSelectLongRunOption(
  body: RequestBody,
  supabase: ReturnType<typeof createClient>,
  userId: string | null | undefined
): Promise<Response> {
  const { selectedLongRunOption, planId, userTimezone } = body;

  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
  }

  if (!selectedLongRunOption || !planId) {
    return Response.json({ error: 'selectedLongRunOption and planId are required' }, { status: 400, headers: corsHeaders });
  }

  const optionNum = typeof selectedLongRunOption === 'number'
    ? selectedLongRunOption
    : parseInt(String(selectedLongRunOption), 10);

  if (![1, 2, 3, 4].includes(optionNum)) {
    return Response.json({ error: 'Invalid long run option' }, { status: 400, headers: corsHeaders });
  }

  const mapping = mapPreservationOptionToLevel(optionNum as LongRunPreservationOption);

  if (mapping.level === 'L4') {
    const { data: proposal, error: proposalError } = await supabase
      .from('plan_edit_proposals')
      .insert({
        training_plan_id: planId,
        user_id: userId,
        intent: 'insert_recovery_week',
        reference_phrases: [],
        llm_explanation: 'Runner selected full recovery week from long run preservation options.',
        raw_llm_response: { reasoning: 'Long run preservation option 4 selected — full recovery week.' },
        status: 'pending_resolution',
      })
      .select('id')
      .single();

    if (proposalError || !proposal) {
      logger.error('[Gold Chat] Failed to store L4 proposal from long run option', proposalError);
      return Response.json({ error: 'Failed to store proposal' }, { status: 500, headers: corsHeaders });
    }

    return await handleConfirmWithFeasibilityCheck(
      { ...body, proposal_id: proposal.id, mode: 'confirm' },
      supabase,
      userId
    );
  }

  const { data: plan, error: planError } = await supabase
    .from('training_plans')
    .select('plan_data, workout_version, start_date, training_paces')
    .eq('id', planId)
    .eq('user_id', userId)
    .single();

  if (planError || !plan) {
    logger.error('[Gold Chat] Plan not found for long run option', { planId, planError });
    return Response.json({ error: 'Plan not found' }, { status: 404, headers: corsHeaders });
  }

  const todayISO = body.todayISO || new Date().toISOString().slice(0, 10);
  const planDays: any[] = plan.plan_data?.days ?? [];

  const dow = new Date(todayISO + 'T12:00:00Z').getUTCDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const mondayMs = new Date(todayISO + 'T00:00:00Z').getTime() + mondayOffset * 86400000;
  const sundayMs = mondayMs + 7 * 86400000;

  const isThisWeek = (dateStr: string) => {
    const t = new Date(dateStr + 'T00:00:00Z').getTime();
    return t >= mondayMs && t < sundayMs;
  };

  const KM_RE = /(\d+(?:\.\d+)?)\s*km/i;

  const isQualityWorkout = (workout: string) => {
    const lower = workout.toLowerCase();
    return lower.includes('interval') || lower.includes('tempo') || lower.includes('threshold') ||
      lower.includes('speed') || lower.includes('fartlek') || lower.includes('repeat') ||
      lower.includes('progression') || lower.includes('race pace');
  };

  const isLongRun = (workout: string) => workout.toLowerCase().includes('long run');

  const scaleKmInText = (text: string, factor: number): string => {
    return text.replace(KM_RE, (match, km) => {
      const scaled = Math.round(parseFloat(km) * factor * 2) / 2;
      return `${scaled} km`;
    });
  };

  let updatedDays = planDays.map((day: any) => ({ ...day }));
  let modifiedCount = 0;
  let message = '';

  const thisWeekTrainDays = updatedDays.filter(
    (d: any) => isThisWeek(d.date) && d.workout_type === 'TRAIN' && d.date >= todayISO
  );

  if (optionNum === 1) {
    for (const day of thisWeekTrainDays) {
      const idx = updatedDays.findIndex((d: any) => d.date === day.date);
      if (idx === -1) continue;
      if (isLongRun(day.workout || '')) {
        continue;
      }
      if (isQualityWorkout(day.workout || '')) {
        const distanceMatch = (day.workout || '').match(KM_RE);
        const easyDistance = distanceMatch
          ? `${Math.round(parseFloat(distanceMatch[1]) * 2) / 2} km`
          : '5-8 km';
        const easyPace = plan.training_paces?.easyPace ?? '6:00';
        updatedDays[idx] = {
          ...day,
          workout: `Easy run — ${easyDistance} at comfortable, conversational pace (${easyPace} /km)\n(Softened from quality session for recovery)`,
        };
        modifiedCount++;
      }
    }
    message = 'Done. Quality sessions have been converted to easy runs. Your long run is unchanged. You should recover well without losing momentum.';

  } else if (optionNum === 2) {
    for (const day of thisWeekTrainDays) {
      const idx = updatedDays.findIndex((d: any) => d.date === day.date);
      if (idx === -1) continue;
      if (isLongRun(day.workout || '')) {
        updatedDays[idx] = {
          ...day,
          workout: scaleKmInText(day.workout, 0.90),
        };
        modifiedCount++;
      } else if (isQualityWorkout(day.workout || '')) {
        updatedDays[idx] = {
          ...day,
          workout: scaleKmInText(day.workout, 0.85) + '\n(Reduced intensity — easy-moderate effort for recovery)',
        };
        modifiedCount++;
      } else {
        updatedDays[idx] = {
          ...day,
          workout: scaleKmInText(day.workout, 0.85),
        };
        modifiedCount++;
      }
    }
    message = 'Done. Your long run has been shortened by 10% and other sessions reduced. This gives you recovery while maintaining your long run habit.';

  } else if (optionNum === 3) {
    for (const day of thisWeekTrainDays) {
      const idx = updatedDays.findIndex((d: any) => d.date === day.date);
      if (idx === -1) continue;
      if (isLongRun(day.workout || '')) {
        const easyPace = plan.training_paces?.easyPace ?? '6:00';
        updatedDays[idx] = {
          ...day,
          workout: `Easy run: 5 km at ${easyPace} /km\n(Long run skipped for recovery — replaced with short easy run)`,
        };
        modifiedCount++;
      } else if (isQualityWorkout(day.workout || '')) {
        updatedDays[idx] = {
          ...day,
          workout: scaleKmInText(day.workout, 0.85) + '\n(Reduced intensity — easy-moderate effort for recovery)',
        };
        modifiedCount++;
      } else {
        updatedDays[idx] = {
          ...day,
          workout: scaleKmInText(day.workout, 0.85),
        };
        modifiedCount++;
      }
    }
    message = 'Done. Your long run has been replaced with a short easy run, and other sessions reduced. This is a significant cutback — use it if you really need the rest.';
  }

  if (modifiedCount > 0) {
    const newPlanData = { ...plan.plan_data, days: updatedDays };
    const { error: updateError } = await supabase
      .from('training_plans')
      .update({
        plan_data: newPlanData,
        workout_version: (plan.workout_version ?? 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', planId)
      .eq('user_id', userId);

    if (updateError) {
      logger.error('[Gold Chat] Failed to save long run option patch', { optionNum, updateError });
      return Response.json({ error: 'Failed to save changes' }, { status: 500, headers: corsHeaders });
    }
  }

  logger.info('[Gold Chat] Long run preservation option applied', { optionNum, planId, modifiedCount });

  return Response.json({
    mode: 'fatigue_plan_updated',
    level: `long_run_option_${optionNum}`,
    message,
    modifiedCount,
  }, { headers: corsHeaders });
}

async function handleSelectAmbitionOption(
  body: RequestBody,
  supabase: ReturnType<typeof createClient>,
  userId: string | null | undefined
): Promise<Response> {
  const { selectedAmbitionOption, planId, pendingRecoveryWeekProposalId } = body;

  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
  }

  if (!selectedAmbitionOption || !planId) {
    return Response.json({ error: 'selectedAmbitionOption and planId are required' }, { status: 400, headers: corsHeaders });
  }

  const optionNum = typeof selectedAmbitionOption === 'number'
    ? selectedAmbitionOption
    : parseInt(String(selectedAmbitionOption), 10);

  if (![1, 2, 3, 4].includes(optionNum)) {
    return Response.json({ error: 'Invalid ambition option' }, { status: 400, headers: corsHeaders });
  }

  if (optionNum === 1) {
    const { data: planForTier } = await supabase
      .from('training_plans')
      .select('answers, plan_data')
      .eq('id', planId)
      .eq('user_id', userId)
      .single();
    const currentTier = planForTier?.answers?.ambitionTier ?? planForTier?.plan_data?.meta?.ambitionTier ?? 'base';
    const tierName = currentTier.charAt(0).toUpperCase() + currentTier.slice(1);
    logger.info('[Gold Chat] User chose to keep current tier despite warning', { planId, currentTier });
    return Response.json({
      mode: 'ambition_kept',
      message: 'Got it. Your plan stays at ' + tierName + ' tier. You may not reach the ideal peak volume, but with good execution you can still have a strong race. Stay consistent and listen to your body.',
    }, { headers: corsHeaders });
  }

  if (optionNum === 4) {
    if (pendingRecoveryWeekProposalId) {
      await supabase
        .from('plan_edit_proposals')
        .update({ status: 'rejected' })
        .eq('id', pendingRecoveryWeekProposalId);
    }

    logger.info('[Gold Chat] User chose to undo recovery week — offering L2/L3 instead', { planId });
    return Response.json({
      mode: 'fatigue_options',
      message: "No problem. Instead of a full recovery week, let's try a lighter adjustment. Here are your options:",
      options: [
        {
          level: 'L2',
          label: 'Soften this week',
          shortLabel: 'Soften the week',
          description: 'Convert quality workout to easy run. Long run preserved.',
          consequence: 'Training load decreases slightly this week. Peak long run potential remains similar.',
          intent: 'soften_week',
          requiresStructuralRebuild: false,
        },
        {
          level: 'L3',
          label: 'Reduce this week',
          shortLabel: 'Reduced week',
          description: 'Weekly volume reduced ~15%. Long run shortened by 10%. Quality session kept but at lower intensity.',
          consequence: 'Small reduction in trajectory impact.',
          intent: 'reduced_week',
          requiresStructuralRebuild: false,
        },
      ],
      isInTaper: false,
    }, { headers: corsHeaders });
  }

  const newTier: AmbitionTier = optionNum === 2 ? 'performance' : 'base';

  const { data: plan, error: planError } = await supabase
    .from('training_plans')
    .select('answers')
    .eq('id', planId)
    .eq('user_id', userId)
    .single();

  if (planError || !plan) {
    return Response.json({ error: 'Plan not found' }, { status: 404, headers: corsHeaders });
  }

  const updatedAnswers = { ...plan.answers, ambitionTier: newTier };

  const { error: updateError } = await supabase
    .from('training_plans')
    .update({
      answers: updatedAnswers,
      updated_at: new Date().toISOString(),
    })
    .eq('id', planId)
    .eq('user_id', userId);

  if (updateError) {
    logger.error('[Gold Chat] Failed to update ambition tier', { newTier, updateError });
    return Response.json({ error: 'Failed to update ambition tier' }, { status: 500, headers: corsHeaders });
  }

  logger.info('[Gold Chat] Ambition tier downgraded', { planId, newTier });

  return Response.json({
    mode: 'ambition_downgraded',
    newTier,
    message: `Your plan has been updated to ${newTier === 'performance' ? 'Performance' : 'Base'} tier. The targets are now more achievable with your current timeline. Your recovery week has been applied.`,
  }, { headers: corsHeaders });
}

async function handleTierChangeRequest(
  message: string,
  plan: any,
  currentTier: PlanTier | undefined,
  targetTier: PlanTier | undefined,
  supabase: ReturnType<typeof createClient>,
  userId: string | null | undefined
): Promise<Response> {
  const TIER_DISPLAY_NAMES: Record<PlanTier, string> = {
    base: 'Base',
    performance: 'Performance',
    competitive: 'Competitive',
  };

  const currentTierDisplay = currentTier ? TIER_DISPLAY_NAMES[currentTier] : 'unknown';

  if (!targetTier) {
    const availableTiers = (['base', 'performance', 'competitive'] as PlanTier[])
      .filter(t => t !== currentTier)
      .map(t => TIER_DISPLAY_NAMES[t])
      .join(' or ');

    return Response.json({
      mode: 'tier_change_clarification',
      message: `I can help you change your plan tier. You're currently on the ${currentTierDisplay} tier. Would you like to move to ${availableTiers}?`,
      currentTier,
      availableTiers: (['base', 'performance', 'competitive'] as PlanTier[]).filter(t => t !== currentTier),
    }, { headers: corsHeaders });
  }

  if (targetTier === currentTier) {
    return Response.json(
      createCoachMessage(`You're already on the ${currentTierDisplay} tier. No changes needed.`),
      { headers: corsHeaders }
    );
  }

  const isUpgrade = (
    (currentTier === 'base' && (targetTier === 'performance' || targetTier === 'competitive')) ||
    (currentTier === 'performance' && targetTier === 'competitive')
  );

  const targetTierDisplay = TIER_DISPLAY_NAMES[targetTier];

  const tierDescriptions: Record<PlanTier, string> = {
    base: 'focuses on building a strong aerobic foundation with manageable weekly volume',
    performance: 'adds more quality sessions and higher weekly mileage for runners seeking improvement',
    competitive: 'maximizes training stimulus with higher volume and intensity for experienced runners targeting PRs',
  };

  const coachMessage = isUpgrade
    ? `Moving from ${currentTierDisplay} to ${targetTierDisplay} tier will increase your training load. The ${targetTierDisplay} tier ${tierDescriptions[targetTier]}.\n\nThis change requires regenerating your plan to recalculate weekly volumes, long run progression, and workout intensities. Your completed workouts will be preserved, but future weeks will be rebuilt.\n\nWould you like me to proceed with this change?`
    : `Moving from ${currentTierDisplay} to ${targetTierDisplay} tier will reduce your training load. The ${targetTierDisplay} tier ${tierDescriptions[targetTier]}.\n\nThis change requires regenerating your plan. Your completed workouts will be preserved.\n\nWould you like me to proceed?`;

  if (!userId || !plan?.id) {
    return Response.json(
      createCoachMessage('I cannot process tier changes without authentication. Please try again.'),
      { headers: corsHeaders }
    );
  }

  const { data: proposal, error: proposalError } = await supabase
    .from('plan_edit_proposals')
    .insert({
      training_plan_id: plan.id,
      user_id: userId,
      intent: 'change_plan_tier',
      reference_phrases: [message],
      llm_explanation: coachMessage,
      raw_llm_response: {
        currentTier,
        targetTier,
        isUpgrade,
      },
      status: 'pending_resolution',
    })
    .select('id')
    .single();

  if (proposalError) {
    logger.error('[Gold Chat] Failed to store tier change proposal', proposalError);
  }

  logger.info('[Gold Chat] Tier change proposal created', {
    proposalId: proposal?.id,
    currentTier,
    targetTier,
    isUpgrade,
  });

  return Response.json({
    mode: 'tier_change_proposal',
    proposal_id: proposal?.id,
    intent: 'change_plan_tier',
    currentTier,
    targetTier,
    isUpgrade,
    message: coachMessage,
    awaitingConfirmation: true,
  }, { headers: corsHeaders });
}

function rescaleWorkoutDistance(workoutText: string, scaleFactor: number): string {
  const kmPattern = /(\d+(?:\.\d+)?)\s*km/gi;
  return workoutText.replace(kmPattern, (match, numStr) => {
    const original = parseFloat(numStr);
    const scaled = Math.round(original * scaleFactor * 10) / 10;
    return `${scaled} km`;
  });
}

function getWeekNumber(dayDate: string, startDate: string): number {
  const start = new Date(startDate + 'T00:00:00Z');
  const day = new Date(dayDate + 'T00:00:00Z');
  const diffMs = day.getTime() - start.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return Math.floor(diffDays / 7) + 1;
}

async function handleConfirmTierChange(
  body: RequestBody,
  supabase: ReturnType<typeof createClient>,
  userId: string | null | undefined
): Promise<Response> {
  const { proposal_id, userTimezone, todayISO } = body;

  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
  }

  if (!proposal_id) {
    return Response.json({ error: 'proposal_id is required' }, { status: 400, headers: corsHeaders });
  }

  const { data: proposal, error: proposalError } = await supabase
    .from('plan_edit_proposals')
    .select('id, training_plan_id, user_id, intent, raw_llm_response, status')
    .eq('id', proposal_id)
    .eq('user_id', userId)
    .maybeSingle();

  if (proposalError || !proposal) {
    logger.error('[Gold Chat] Tier change proposal not found', { proposal_id, proposalError });
    return Response.json({ error: 'Proposal not found' }, { status: 404, headers: corsHeaders });
  }

  if (proposal.intent !== 'change_plan_tier') {
    return Response.json({ error: 'Invalid proposal type' }, { status: 400, headers: corsHeaders });
  }

  if (proposal.status === 'applied') {
    return Response.json({ error: 'This tier change has already been applied' }, { status: 409, headers: corsHeaders });
  }

  const { targetTier, currentTier } = proposal.raw_llm_response as { targetTier: PlanTier; currentTier?: PlanTier };

  const { data: plan, error: planError } = await supabase
    .from('training_plans')
    .select('id, answers, plan_data, start_date, race_date, duration_weeks, training_paces')
    .eq('id', proposal.training_plan_id)
    .eq('user_id', userId)
    .single();

  if (planError || !plan) {
    return Response.json({ error: 'Plan not found' }, { status: 404, headers: corsHeaders });
  }

  const oldPlanData = plan.plan_data;
  const updatedAnswers = { ...plan.answers, ambitionTier: targetTier };

  const { buildStructuralGuidance, parseRaceDistanceKm } = await import('../_shared/planStructureBuilder.ts');

  const raceDistanceKm = parseRaceDistanceKm(plan.answers?.raceDistance || '');
  const startingWeeklyKm = parseFloat(plan.answers?.currentWeeklyKm || '0') || 0;
  const startingLongestRun = plan.answers?.longestRun || 0;
  const daysPerWeek = plan.answers?.daysPerWeek || plan.answers?.availableDays?.length || 4;
  const numberOfWeeks = plan.duration_weeks || 12;
  const effectiveCurrentTier = currentTier || oldPlanData?.meta?.ambitionTier || 'performance';

  let oldStructuralGuidance;
  try {
    oldStructuralGuidance = buildStructuralGuidance({
      startingWeeklyKm,
      startingLongestRunKm: startingLongestRun,
      totalWeeks: numberOfWeeks,
      raceDistanceKm,
      daysPerWeek,
      ambitionTier: effectiveCurrentTier,
    });
  } catch (sgErr) {
    logger.warn('[Gold Chat] Failed to build old structural guidance, using defaults', sgErr);
    oldStructuralGuidance = null;
  }

  let newStructuralGuidance;
  try {
    newStructuralGuidance = buildStructuralGuidance({
      startingWeeklyKm,
      startingLongestRunKm: startingLongestRun,
      totalWeeks: numberOfWeeks,
      raceDistanceKm,
      daysPerWeek,
      ambitionTier: targetTier,
    });
  } catch (sgErr) {
    logger.error('[Gold Chat] Failed to build structural guidance for tier change', sgErr);
    return Response.json({
      error: 'Failed to calculate new training targets for tier change',
    }, { status: 500, headers: corsHeaders });
  }

  const today = todayISO || new Date().toISOString().split('T')[0];
  const startDate = plan.start_date;

  const rebuildDays = (oldPlanData?.days || []).map((day: any) => {
    const dayDate = day.date;
    if (!dayDate || dayDate < today) {
      return day;
    }

    const weekNum = getWeekNumber(dayDate, startDate);
    const weekIdx = weekNum - 1;

    if (weekIdx < 0 || weekIdx >= newStructuralGuidance.weeklyVolumes.length) {
      return day;
    }

    const oldWeeklyVol = oldStructuralGuidance?.weeklyVolumes?.[weekIdx] || newStructuralGuidance.weeklyVolumes[weekIdx];
    const newWeeklyVol = newStructuralGuidance.weeklyVolumes[weekIdx];
    const scaleFactor = oldWeeklyVol > 0 ? newWeeklyVol / oldWeeklyVol : 1;

    if (Math.abs(scaleFactor - 1) < 0.01) {
      return day;
    }

    const updatedWorkout = rescaleWorkoutDistance(day.workout || '', scaleFactor);

    let updatedDistance = day.distance;
    if (typeof day.distance === 'number' && day.distance > 0) {
      updatedDistance = Math.round(day.distance * scaleFactor * 10) / 10;
    }

    return {
      ...day,
      workout: updatedWorkout,
      distance: updatedDistance,
    };
  });

  const oldPeakVolume = oldPlanData?.meta?.peakWeeklyVolume ||
    (oldPlanData?.days ? Math.max(...Object.values(
      oldPlanData.days.reduce((acc: Record<number, number>, day: any) => {
        const week = day.week || 1;
        acc[week] = (acc[week] || 0) + (day.distance || 0);
        return acc;
      }, {})
    )) : 0);

  const newPeakVolume = Math.max(...newStructuralGuidance.weeklyVolumes);
  const newPeakLongRun = Math.max(...newStructuralGuidance.longRunTargets);

  const volumeDiffPct = oldPeakVolume > 0
    ? Math.round(((newPeakVolume - oldPeakVolume) / oldPeakVolume) * 100)
    : 0;

  const updatedMeta = {
    ...(oldPlanData?.meta || {}),
    ambitionTier: targetTier,
    peakWeeklyVolume: newPeakVolume,
    peakLongRun: newPeakLongRun,
    qualitySessionsPerWeek: newStructuralGuidance.qualitySessionsPerWeek,
    tierChangedAt: new Date().toISOString(),
    previousTier: effectiveCurrentTier,
    structuralGuidance: {
      weeklyVolumes: newStructuralGuidance.weeklyVolumes,
      longRunTargets: newStructuralGuidance.longRunTargets,
      cutbackWeeks: newStructuralGuidance.cutbackWeeks,
      peakWeek: newStructuralGuidance.peakWeek,
      taperStartWeek: newStructuralGuidance.taperStartWeek,
      planArchetype: newStructuralGuidance.planArchetype,
      weeklyMeta: newStructuralGuidance.weeklyMeta,
    },
  };

  const updatedPlanData = {
    ...oldPlanData,
    days: rebuildDays,
    meta: updatedMeta,
  };

  const { error: updateError } = await supabase
    .from('training_plans')
    .update({
      answers: updatedAnswers,
      plan_data: updatedPlanData,
      updated_at: new Date().toISOString(),
    })
    .eq('id', plan.id)
    .eq('user_id', userId);

  if (updateError) {
    logger.error('[Gold Chat] Failed to update plan tier', { targetTier, updateError });
    return Response.json({ error: 'Failed to update plan tier' }, { status: 500, headers: corsHeaders });
  }

  await supabase
    .from('plan_edit_proposals')
    .update({ status: 'applied' })
    .eq('id', proposal_id);

  const daysRescaled = rebuildDays.filter((d: any, i: number) =>
    d.workout !== oldPlanData?.days?.[i]?.workout
  ).length;

  logger.info('[Gold Chat] Plan tier changed with workout rescaling', {
    planId: plan.id,
    targetTier,
    previousTier: effectiveCurrentTier,
    oldPeakVolume,
    newPeakVolume,
    volumeDiffPct,
    newPeakLongRun,
    qualitySessionsPerWeek: newStructuralGuidance.qualitySessionsPerWeek,
    daysRescaled,
  });

  const TIER_DISPLAY_NAMES: Record<string, string> = {
    base: 'Base',
    performance: 'Performance',
    competitive: 'Competitive',
  };

  const tierDisplay = TIER_DISPLAY_NAMES[targetTier] || targetTier;
  const volumeChangeText = volumeDiffPct > 0
    ? `Peak weekly volume increases by ${volumeDiffPct}% to ${newPeakVolume} km.`
    : volumeDiffPct < 0
      ? `Peak weekly volume decreases by ${Math.abs(volumeDiffPct)}% to ${newPeakVolume} km.`
      : '';

  const qualitySessionText = newStructuralGuidance.qualitySessionsPerWeek === 2
    ? 'You will now have 2 quality sessions per week.'
    : 'You will have 1 quality session per week.';

  return Response.json({
    mode: 'tier_change_applied',
    proposal_id,
    newTier: targetTier,
    structuralChanges: {
      oldPeakVolume,
      newPeakVolume,
      volumeDiffPct,
      newPeakLongRun,
      qualitySessionsPerWeek: newStructuralGuidance.qualitySessionsPerWeek,
      weeklyVolumes: newStructuralGuidance.weeklyVolumes,
      longRunTargets: newStructuralGuidance.longRunTargets,
      daysRescaled,
    },
    message: `Your plan has been updated to the ${tierDisplay} tier. ${volumeChangeText} ${qualitySessionText} Peak long run: ${newPeakLongRun} km. All future workouts have been adjusted to match your new training level.`,
    requiresRegeneration: false,
  }, { headers: corsHeaders });
}

async function handleSelectTier(
  body: RequestBody,
  supabase: ReturnType<typeof createClient>,
  userId: string | null | undefined
): Promise<Response> {
  const { selectedTier, planId } = body;

  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
  }

  if (!selectedTier || !planId) {
    return Response.json({ error: 'selectedTier and planId are required' }, { status: 400, headers: corsHeaders });
  }

  const validTiers: PlanTier[] = ['base', 'performance', 'competitive'];
  const normalizedTier = selectedTier.toLowerCase() as PlanTier;

  if (!validTiers.includes(normalizedTier)) {
    return Response.json({ error: 'Invalid tier. Must be base, performance, or competitive.' }, { status: 400, headers: corsHeaders });
  }

  const { data: plan, error: planError } = await supabase
    .from('training_plans')
    .select('id, answers, plan_data')
    .eq('id', planId)
    .eq('user_id', userId)
    .single();

  if (planError || !plan) {
    return Response.json({ error: 'Plan not found' }, { status: 404, headers: corsHeaders });
  }

  const currentTier = extractTierFromPlanData(plan.plan_data) || plan.answers?.ambitionTier;

  if (currentTier === normalizedTier) {
    const TIER_DISPLAY_NAMES: Record<string, string> = {
      base: 'Base',
      performance: 'Performance',
      competitive: 'Competitive',
    };
    return Response.json(
      createCoachMessage(`You're already on the ${TIER_DISPLAY_NAMES[normalizedTier]} tier. No changes needed.`),
      { headers: corsHeaders }
    );
  }

  return await handleTierChangeRequest(
    `Change to ${selectedTier} tier`,
    plan,
    currentTier as PlanTier,
    normalizedTier,
    supabase,
    userId
  );
}

async function handleConfirmWithFeasibilityCheck(
  body: RequestBody,
  supabase: ReturnType<typeof createClient>,
  userId: string | null | undefined
): Promise<Response> {
  const { proposal_id } = body;

  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
  }

  if (!proposal_id) {
    return Response.json({ error: 'proposal_id is required' }, { status: 400, headers: corsHeaders });
  }

  const { data: proposal, error: proposalError } = await supabase
    .from('plan_edit_proposals')
    .select('id, training_plan_id, user_id, intent, status')
    .eq('id', proposal_id)
    .eq('user_id', userId)
    .maybeSingle();

  if (proposalError || !proposal) {
    logger.error('[Gold Chat] Proposal not found', { proposal_id, proposalError });
    return Response.json({ error: 'Proposal not found' }, { status: 404, headers: corsHeaders });
  }

  const { data: plan, error: planError } = await supabase
    .from('training_plans')
    .select('id, race_date, duration_weeks, answers, plan_data, start_date, training_paces')
    .eq('id', proposal.training_plan_id)
    .eq('user_id', userId)
    .single();

  if (planError || !plan) {
    return Response.json({ error: 'Training plan not found' }, { status: 404, headers: corsHeaders });
  }

  const { parseRaceDistanceKm } = await import('../_shared/planStructureBuilder.ts');
  const { validateStructuralRebuild } = await import('../_shared/safetyInvariants.ts');
  const { executeRecoveryRebuild } = await import('../_shared/recoveryRebuild.ts');

  const userTimezone = body.userTimezone || 'Europe/Paris';
  const resolver = new DateResolver(body.todayISO, userTimezone);
  const todayISO = resolver.getTodayISO();
  const raceDistanceKm = parseRaceDistanceKm(plan.answers?.raceDistance ?? '');

  const structuralCheck = validateStructuralRebuild(
    {
      raceDateISO: plan.race_date,
      raceDistanceKm,
      totalWeeks: plan.duration_weeks ?? 0,
      currentWeekStartISO: todayISO,
      todayISO,
    },
    []
  );

  if (!structuralCheck.valid) {
    return Response.json(
      { mode: 'intent_blocked', message: `This change cannot be applied: ${structuralCheck.errors[0]}` },
      { headers: corsHeaders }
    );
  }

  const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiApiKey) {
    return Response.json({ error: 'OpenAI API key not configured' }, { status: 500, headers: corsHeaders });
  }

  let rebuildResult;
  try {
    rebuildResult = await executeRecoveryRebuild({
      plan: {
        id: plan.id,
        plan_data: plan.plan_data,
        start_date: plan.start_date,
        race_date: plan.race_date,
        duration_weeks: plan.duration_weeks,
        answers: plan.answers ?? {},
        training_paces: plan.training_paces,
      },
      todayISO,
      openaiApiKey,
    });
  } catch (rebuildErr: any) {
    logger.error('[Gold Chat] Recovery rebuild failed', rebuildErr);
    return Response.json(
      { mode: 'intent_blocked', message: `Recovery rebuild blocked: ${rebuildErr.message}` },
      { headers: corsHeaders }
    );
  }

  const currentTier = (plan.answers?.ambitionTier ?? plan.plan_data?.meta?.ambitionTier ?? 'base') as AmbitionTier;

  if (raceDistanceKm >= 21) {
    const startingWeeklyVolumeKm = plan.answers?.startingWeeklyKm ?? 30;

    const feasibilityResult = checkAmbitionFeasibility(
      rebuildResult.updatedPlanData.days,
      plan.start_date,
      todayISO,
      plan.race_date,
      currentTier,
      startingWeeklyVolumeKm
    );

    if (!feasibilityResult.stillSupported) {
      logger.info('[Gold Chat] Mode no longer feasible after L4 — showing advisory', {
        planId: plan.id,
        currentTier,
        reasonCodes: feasibilityResult.reasonCodes,
        metrics: feasibilityResult.metrics,
      });

      const { error: tempSaveError } = await supabase
        .from('training_plans')
        .update({
          plan_data: rebuildResult.updatedPlanData,
          updated_at: new Date().toISOString(),
        })
        .eq('id', plan.id);

      if (tempSaveError) {
        logger.error('[Gold Chat] Failed to save rebuilt plan before advisory', tempSaveError);
      }

      await supabase
        .from('plan_edit_proposals')
        .update({ status: 'applied' })
        .eq('id', proposal_id);

      const advisoryResponse = buildAmbitionAdvisoryResponse(feasibilityResult);

      return Response.json({
        ...advisoryResponse,
        pendingRecoveryWeekProposalId: proposal_id,
        summary: rebuildResult.summary,
      }, { headers: corsHeaders });
    }
  }

  const { sanitizePlanWorkouts } = await import('../_shared/validator.ts');
  if (rebuildResult.updatedPlanData?.days) sanitizePlanWorkouts(rebuildResult.updatedPlanData.days);

  const { error: updateError } = await supabase
    .from('training_plans')
    .update({
      plan_data: rebuildResult.updatedPlanData,
      updated_at: new Date().toISOString(),
    })
    .eq('id', plan.id);

  if (updateError) {
    logger.error('[Gold Chat] Failed to persist rebuilt plan_data', updateError);
    return Response.json({ error: 'Failed to save rebuilt plan' }, { status: 500, headers: corsHeaders });
  }

  await supabase
    .from('plan_edit_proposals')
    .update({ status: 'applied' })
    .eq('id', proposal_id);

  const { recoveryWeekVolume, nextWeekVolume, peakWeekVolume, weeksRebuilt } = rebuildResult.summary;

  return Response.json({
    mode: 'intent_applied',
    proposal_id,
    intent: 'insert_recovery_week',
    message: `Your recovery week has been inserted. This week: ~${recoveryWeekVolume} km. Next build week: ~${nextWeekVolume} km. Plan rebuilt across ${weeksRebuilt} weeks with peak ~${peakWeekVolume} km — ramp rate, deload rhythm, and taper timing preserved.`,
    summary: rebuildResult.summary,
  }, { headers: corsHeaders });
}

function isAggressiveRampRequest(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('increase ramp') ||
    lower.includes('faster ramp') ||
    lower.includes('higher ramp') ||
    lower.includes('more aggressive') ||
    lower.includes('get to peak quicker') ||
    lower.includes('peak faster') ||
    lower.includes('build faster') ||
    lower.includes('increase intensity') ||
    lower.includes('higher intensity') ||
    lower.includes('more volume') ||
    lower.includes('increase volume') ||
    lower.includes('push harder') ||
    lower.includes('ramp up faster') ||
    lower.includes('steeper progression') ||
    lower.includes('quicker progression') ||
    lower.includes('faster progression') ||
    (lower.includes('ramp') && (lower.includes('more') || lower.includes('increase') || lower.includes('higher'))) ||
    (lower.includes('ambitious') && (lower.includes('more') || lower.includes('plan'))) ||
    (lower.includes('aggressive') && !lower.includes('less'))
  );
}

async function handleDraft(
  message: string,
  chatHistory: Array<{ role: string; content: string }>,
  plan: any,
  resolver: DateResolver,
  todayISO: string,
  supabase: ReturnType<typeof createClient>,
  userId: string | null | undefined,
  fatigueSignals?: ReturnType<typeof computeFatigueSignals>,
  feedbackContext?: Awaited<ReturnType<typeof buildWorkoutFeedbackContext>>
): Promise<Response> {
  logger.info('[Gold Chat] Handling draft', { message, todayISO });

  const isPreviewPlan = plan.plan_type === 'date_based_preview';

  if (isPreviewPlan && isAggressiveRampRequest(message)) {
    logger.info('[Gold Chat] Aggressive ramp request in preview mode — refusing directly');

    const { parseRaceDistanceKm, buildStructuralGuidance } = await import('../_shared/planStructureBuilder.ts');

    let buildInfoText = '';
    const startingWeeklyKm = parseFloat(plan.answers?.currentWeeklyKm || '0') || 0;
    const startingLongestRun = parseFloat(plan.answers?.longestRun || '0') || 0;
    const raceDistanceKm = parseRaceDistanceKm(plan.answers?.raceDistance || '');

    const daysPerWeek = plan.answers?.daysPerWeek || plan.answers?.availableDays?.length || 4;
    if (startingWeeklyKm > 0 && plan.plan_duration_weeks) {
      try {
        const sg = buildStructuralGuidance({
          startingWeeklyKm,
          startingLongestRunKm: startingLongestRun || startingWeeklyKm * 0.35,
          totalWeeks: plan.plan_duration_weeks,
          raceDistanceKm,
          daysPerWeek,
        });
        const peakWeeklyKm = Math.round(Math.max(...sg.weeklyVolumes));
        const peakLongRunKm = Math.round(Math.max(...sg.longRunTargets) * 2) / 2;
        const peakWeek = sg.peakWeek + 1;
        buildInfoText = ` Based on this preview, you'd be building toward around ${peakWeeklyKm} km per week with a longest run of about ${peakLongRunKm} km by around week ${peakWeek}.`;
      } catch (e) {
        logger.warn('[Gold Chat] Failed to compute build info for refusal message', e);
      }
    }

    const refusalMessage = `I can't increase the ramp for this preview. It uses our standard 6% progression approach so the build stays aligned with our coaching philosophy.${buildInfoText}\n\nThis approach is designed to help you build fitness sustainably while reducing injury risk. The 6% weekly increase is the sweet spot backed by sports science for safe, effective progression.`;

    return Response.json(
      createCoachMessage(refusalMessage),
      { headers: corsHeaders }
    );
  }

  // --- Tier change intercept: detect and handle tier migration requests BEFORE LLM ---
  const currentTier = extractTierFromPlanData(plan.plan_data) || (plan.answers?.ambitionTier as PlanTier);
  const tierDetection = detectTierChangeRequest(message, currentTier);

  if (tierDetection.isTierChangeRequest && tierDetection.confidence >= 0.6) {
    logger.info('[Gold Chat] Tier change request detected', {
      currentTier,
      targetTier: tierDetection.targetTier,
      confidence: tierDetection.confidence,
    });

    return await handleTierChangeRequest(
      message,
      plan,
      currentTier,
      tierDetection.targetTier,
      supabase,
      userId
    );
  }

  // --- Fatigue intercept: present graded options before calling the LLM ---
  if (isFatigueRequest(message) || isFatigueOptionsFollowUp(message, chatHistory)) {
    logger.info('[Gold Chat] Fatigue request detected — presenting graded intervention options');

    const raceDate = plan.race_date;
    const weeksToRace = raceDate
      ? Math.max(0, Math.round(
          (new Date(raceDate + 'T00:00:00Z').getTime() - new Date(todayISO + 'T00:00:00Z').getTime()) /
          (7 * 24 * 60 * 60 * 1000)
        ))
      : undefined;

    const { parseRaceDistanceKm } = await import('../_shared/planStructureBuilder.ts');
    const { validateStructuralRebuild } = await import('../_shared/safetyInvariants.ts');
    const raceDistanceKm = parseRaceDistanceKm(plan.answers?.raceDistance ?? '');
    const structuralCheck = validateStructuralRebuild(
      { raceDateISO: raceDate, raceDistanceKm, totalWeeks: plan.duration_weeks ?? 0, currentWeekStartISO: todayISO, todayISO },
      []
    );
    const isInTaper = !structuralCheck.valid;

    const planDays: any[] = plan.plan_data?.days ?? [];
    const futureDays = planDays.filter((d: any) => d.date >= todayISO && d.workout_type === 'TRAIN');
    const nextWorkout = futureDays[0];
    const nextWorkoutTitle = nextWorkout?.workout
      ? nextWorkout.workout.split('\n')[0].slice(0, 60)
      : undefined;

    const weekStartMs = new Date(todayISO + 'T00:00:00Z').getTime();
    const dow = new Date(todayISO + 'T12:00:00Z').getUTCDay();
    const mondayOffset = dow === 0 ? -6 : 1 - dow;
    const mondayMs = weekStartMs + mondayOffset * 86400000;
    const sundayMs = mondayMs + 7 * 86400000;

    const thisWeekDays = planDays.filter((d: any) => {
      const t = new Date(d.date + 'T00:00:00Z').getTime();
      return t >= mondayMs && t < sundayMs && d.workout_type === 'TRAIN';
    });

    const KM_RE = /(\d+(?:\.\d+)?)\s*km/i;
    const currentWeekVolume = thisWeekDays.reduce((sum: number, d: any) => {
      const m = (d.workout ?? '').match(KM_RE);
      return sum + (m ? parseFloat(m[1]) : 0);
    }, 0);

    const longRunDay = thisWeekDays.find((d: any) =>
      (d.workout ?? '').toLowerCase().includes('long run')
    );
    const currentLongRunKm = longRunDay
      ? (() => { const m = (longRunDay.workout ?? '').match(KM_RE); return m ? parseFloat(m[1]) : undefined; })()
      : undefined;

    const ctx: FatigueInterventionContext = {
      currentWeekVolume: currentWeekVolume > 0 ? Math.round(currentWeekVolume * 10) / 10 : undefined,
      currentLongRunKm,
      nextWorkoutTitle,
      weeksToRace,
      isInTaper,
      raceDistanceKm,
    };

    const isMarathon = isMarathonDistance(raceDistanceKm);
    const isExplicitRecovery = isExplicitRecoveryWeekRequest(message);

    if (isMarathon && !isExplicitRecovery && !isInTaper) {
      logger.info('[Gold Chat] Marathon fatigue request without explicit recovery week — showing long run preservation options');

      const longRunChoices = generateLongRunPreservationChoices(ctx);
      const longRunMessage = buildLongRunPreservationMessage(ctx);

      return Response.json({
        mode: 'fatigue_long_run_choice',
        message: longRunMessage,
        options: longRunChoices,
        context: {
          currentLongRunKm,
          isMarathon: true,
        },
      }, { headers: corsHeaders });
    }

    const options = generateFatigueOptions(ctx);
    const coachMessage = buildFatigueInterventionMessage(options, ctx);

    return Response.json({
      mode: 'fatigue_options',
      message: coachMessage,
      options,
      isInTaper,
    }, { headers: corsHeaders });
  }

  const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiApiKey) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  const systemPrompt = buildSystemPrompt(plan, resolver, todayISO, fatigueSignals, feedbackContext);

  const messages = [
    { role: 'system', content: systemPrompt },
    ...chatHistory,
    { role: 'user', content: message },
  ];

  logger.info('[Gold Chat] Calling OpenAI', { messageCount: messages.length });

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4',
      messages,
      temperature: 0.7,
      max_tokens: 2000,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error('[Gold Chat] OpenAI error', { status: response.status, error: errorText });
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const result = await response.json();
  const aiRaw = result.choices[0]?.message?.content || '';

  logger.info('[Gold Chat] OpenAI response received', { length: aiRaw.length });

  console.log("LLM raw response:", aiRaw);

  const parsed = parseAIResponse(aiRaw);

  console.log("Parsed intent:", parsed.intent);

  if (parsed.intent !== 'none') {
    logger.info('[Gold Chat] Structural intent detected — storing pending proposal', { intent: parsed.intent });

    let proposalId: string | null = null;

    if (userId && plan?.id) {
      const { data: proposal, error: proposalError } = await supabase
        .from('plan_edit_proposals')
        .insert({
          training_plan_id: plan.id,
          user_id: userId,
          intent: parsed.intent,
          reference_phrases: [],
          llm_explanation: parsed.message,
          raw_llm_response: { reasoning: parsed.reasoning },
          status: 'pending_resolution',
        })
        .select('id')
        .single();

      if (proposalError) {
        logger.error('[Gold Chat] Failed to store pending proposal (non-fatal)', proposalError);
      } else {
        proposalId = proposal?.id ?? null;
        logger.info('[Gold Chat] Pending proposal stored', { proposalId, intent: parsed.intent });
      }
    }

    return Response.json(
      {
        mode: 'proposal',
        intent: parsed.intent,
        proposal_id: proposalId,
        message: parsed.message,
        reasoning: parsed.reasoning,
        modificationIntents: [],
        awaitingConfirmation: true,
      },
      { headers: corsHeaders }
    );
  }

  return Response.json(
    createCoachMessage(parsed.message, parsed.reasoning || undefined),
    { headers: corsHeaders }
  );
}

async function handleConfirm(
  body: RequestBody,
  supabase: ReturnType<typeof createClient>,
  userId: string | null | undefined
): Promise<Response> {
  const { proposal_id } = body;

  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
  }

  if (!proposal_id) {
    return Response.json({ error: 'proposal_id is required' }, { status: 400, headers: corsHeaders });
  }

  const { data: proposal, error: proposalError } = await supabase
    .from('plan_edit_proposals')
    .select('id, training_plan_id, user_id, intent, llm_explanation, raw_llm_response, status')
    .eq('id', proposal_id)
    .eq('user_id', userId)
    .maybeSingle();

  if (proposalError || !proposal) {
    logger.error('[Gold Chat] Proposal not found', { proposal_id, proposalError });
    return Response.json({ error: 'Proposal not found' }, { status: 404, headers: corsHeaders });
  }

  if (proposal.status === 'applied') {
    return Response.json({ error: 'This proposal has already been applied' }, { status: 409, headers: corsHeaders });
  }

  if (proposal.status === 'rejected') {
    return Response.json({ error: 'This proposal was rejected' }, { status: 410, headers: corsHeaders });
  }

  const intent = proposal.intent as string;
  const allowedIntents = ['insert_recovery_week', 'suggest_pause'];
  if (!allowedIntents.includes(intent)) {
    return Response.json(
      { mode: 'intent_blocked', message: 'This type of change is not supported in V1.' },
      { headers: corsHeaders }
    );
  }

  if (intent === 'suggest_pause') {
    await supabase
      .from('plan_edit_proposals')
      .update({ status: 'applied' })
      .eq('id', proposal_id);

    return Response.json({
      mode: 'intent_applied',
      proposal_id,
      intent,
      message: 'To pause your plan, use the pause option in the plan header. This will preserve your progress and resume from where you left off.',
    }, { headers: corsHeaders });
  }

  const { data: plan, error: planError } = await supabase
    .from('training_plans')
    .select('id, race_date, duration_weeks, answers, plan_data, start_date, training_paces')
    .eq('id', proposal.training_plan_id)
    .eq('user_id', userId)
    .single();

  if (planError || !plan) {
    return Response.json({ error: 'Training plan not found' }, { status: 404, headers: corsHeaders });
  }

  if (!plan.plan_data?.days || !Array.isArray(plan.plan_data.days)) {
    return Response.json({ error: 'Invalid plan structure: missing days array' }, { status: 500, headers: corsHeaders });
  }

  const { parseRaceDistanceKm } = await import('../_shared/planStructureBuilder.ts');
  const { validateStructuralRebuild } = await import('../_shared/safetyInvariants.ts');

  const userTimezone = body.userTimezone || 'Europe/Paris';
  const resolver = new DateResolver(body.todayISO, userTimezone);
  const todayISO = resolver.getTodayISO();
  const raceDistanceKm = parseRaceDistanceKm(plan.answers?.raceDistance ?? '');

  const structuralCheck = validateStructuralRebuild(
    {
      raceDateISO: plan.race_date,
      raceDistanceKm,
      totalWeeks: plan.duration_weeks ?? 0,
      currentWeekStartISO: todayISO,
      todayISO,
    },
    []
  );
  if (!structuralCheck.valid) {
    logger.warn('[Gold Chat] confirm blocked by taper guard', structuralCheck.errors);
    return Response.json(
      { mode: 'intent_blocked', message: `This change cannot be applied: ${structuralCheck.errors[0]}` },
      { headers: corsHeaders }
    );
  }

  const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiApiKey) {
    return Response.json({ error: 'OpenAI API key not configured' }, { status: 500, headers: corsHeaders });
  }

  const { executeRecoveryRebuild } = await import('../_shared/recoveryRebuild.ts');

  const insertionWeekOffset = body.insertionWeekOffset ?? 0;
  logger.info('[Gold Chat] Starting deterministic recovery rebuild via confirm', { proposalId: proposal_id, todayISO, insertionWeekOffset });

  let rebuildResult;
  try {
    rebuildResult = await executeRecoveryRebuild({
      plan: {
        id: plan.id,
        plan_data: plan.plan_data,
        start_date: plan.start_date,
        race_date: plan.race_date,
        duration_weeks: plan.duration_weeks,
        answers: plan.answers ?? {},
        training_paces: plan.training_paces,
      },
      todayISO,
      openaiApiKey,
      insertionWeekOffset,
    });
  } catch (rebuildErr) {
    logger.error('[Gold Chat] Recovery rebuild invariant violation or LLM error', rebuildErr);
    return Response.json(
      { mode: 'intent_blocked', message: `Recovery rebuild blocked: ${rebuildErr.message}` },
      { headers: corsHeaders }
    );
  }

  if (rebuildResult.updatedPlanData?.days) sanitizePlanWorkouts(rebuildResult.updatedPlanData.days);

  const { error: updateError } = await supabase
    .from('training_plans')
    .update({
      plan_data: rebuildResult.updatedPlanData,
      updated_at: new Date().toISOString(),
    })
    .eq('id', plan.id);

  if (updateError) {
    logger.error('[Gold Chat] Failed to persist rebuilt plan_data', updateError);
    return Response.json({ error: 'Failed to save rebuilt plan' }, { status: 500, headers: corsHeaders });
  }

  await supabase
    .from('plan_edit_proposals')
    .update({ status: 'applied' })
    .eq('id', proposal_id);

  logger.info('[Gold Chat] Recovery rebuild persisted via confirm', {
    proposalId: proposal_id,
    summary: rebuildResult.summary,
  });

  const { recoveryWeekVolume, nextWeekVolume, peakWeekVolume, weeksRebuilt } = rebuildResult.summary;

  return Response.json({
    mode: 'intent_applied',
    proposal_id,
    intent,
    message: `Your recovery week has been inserted. This week: ~${recoveryWeekVolume} km. Next build week: ~${nextWeekVolume} km. Plan rebuilt across ${weeksRebuilt} weeks with peak ~${peakWeekVolume} km — ramp rate, deload rhythm, and taper timing preserved.`,
    summary: rebuildResult.summary,
  }, { headers: corsHeaders });
}

interface ParsedAIResponse {
  intent: ModificationIntent;
  message: string;
  reasoning: string;
}

function parseAIResponse(raw: string): ParsedAIResponse {
  const structuralIntentPattern = /MODIFICATION_INTENT:\s*(none|insert_recovery_week|suggest_pause|suggest_recalibration|change_plan_tier)/i;
  const reasoningPattern = /REASONING:\s*([\s\S]*?)(?=MESSAGE:|$)/i;
  const messagePattern = /MESSAGE:\s*([\s\S]*?)(?=MODIFICATION_INTENT:|REASONING:|$)/i;

  const structuralMatch = raw.match(structuralIntentPattern);
  const reasoningMatch = raw.match(reasoningPattern);
  const messageMatch = raw.match(messagePattern);

  const intent = structuralMatch
    ? (structuralMatch[1].toLowerCase() as ModificationIntent)
    : 'none';
  const reasoning = reasoningMatch ? reasoningMatch[1].trim() : '';
  const message = messageMatch
    ? messageMatch[1].trim()
    : raw
        .replace(structuralIntentPattern, '')
        .replace(reasoningPattern, '')
        .trim();

  return { intent, message: message || raw, reasoning };
}

async function handleConfirmIntent(
  body: RequestBody,
  supabase: ReturnType<typeof createClient>,
  userId: string | null | undefined
): Promise<Response> {
  const { intent, message, reasoning, planId, userTimezone } = body;

  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
  }

  if (!intent || intent === 'none') {
    return Response.json({ mode: 'intent_blocked', message: 'No structural change was requested.' }, { headers: corsHeaders });
  }

  const allowedIntents: ModificationIntent[] = ['insert_recovery_week', 'suggest_pause'];
  if (!allowedIntents.includes(intent as ModificationIntent)) {
    logger.warn('[Gold Chat] confirm_intent blocked — not an allowed V1 structural intent', { intent });
    return Response.json(
      { mode: 'intent_blocked', message: 'This type of change is not supported in V1.' },
      { headers: corsHeaders }
    );
  }

  if (intent === 'suggest_pause') {
    return Response.json({
      mode: 'intent_applied',
      intent,
      message: 'To pause your plan, use the pause option in the plan header. This will preserve your progress and resume from where you left off.',
    }, { headers: corsHeaders });
  }

  const { data: plan, error: planError } = await supabase
    .from('training_plans')
    .select('id, race_date, duration_weeks, answers, plan_data, start_date, training_paces')
    .eq('id', planId)
    .eq('user_id', userId)
    .single();

  if (planError || !plan) {
    return Response.json({ error: 'Training plan not found' }, { status: 404, headers: corsHeaders });
  }

  if (!plan.plan_data?.days || !Array.isArray(plan.plan_data.days)) {
    return Response.json({ error: 'Invalid plan structure: missing days array' }, { status: 500, headers: corsHeaders });
  }

  const { parseRaceDistanceKm } = await import('../_shared/planStructureBuilder.ts');
  const { validateStructuralRebuild } = await import('../_shared/safetyInvariants.ts');

  const timezone = userTimezone || 'Europe/Paris';
  const resolver = new DateResolver(body.todayISO, timezone);
  const todayISO = resolver.getTodayISO();
  const raceDistanceKm = parseRaceDistanceKm(plan.answers?.raceDistance ?? '');

  const structuralCheck = validateStructuralRebuild(
    {
      raceDateISO: plan.race_date,
      raceDistanceKm,
      totalWeeks: plan.duration_weeks ?? 0,
      currentWeekStartISO: todayISO,
      todayISO,
    },
    []
  );
  if (!structuralCheck.valid) {
    logger.warn('[Gold Chat] confirm_intent blocked by taper guard', structuralCheck.errors);
    return Response.json(
      { mode: 'intent_blocked', message: `This change cannot be applied: ${structuralCheck.errors[0]}` },
      { headers: corsHeaders }
    );
  }

  const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiApiKey) {
    return Response.json({ error: 'OpenAI API key not configured' }, { status: 500, headers: corsHeaders });
  }

  const { executeRecoveryRebuild } = await import('../_shared/recoveryRebuild.ts');

  const insertionWeekOffsetIntent = body.insertionWeekOffset ?? 0;
  logger.info('[Gold Chat] Starting deterministic recovery rebuild', { planId, todayISO, intent, insertionWeekOffset: insertionWeekOffsetIntent });

  let rebuildResult;
  try {
    rebuildResult = await executeRecoveryRebuild({
      plan: {
        id: plan.id,
        plan_data: plan.plan_data,
        start_date: plan.start_date,
        race_date: plan.race_date,
        duration_weeks: plan.duration_weeks,
        answers: plan.answers ?? {},
        training_paces: plan.training_paces,
      },
      todayISO,
      openaiApiKey,
      insertionWeekOffset: insertionWeekOffsetIntent,
    });
  } catch (rebuildErr) {
    logger.error('[Gold Chat] Recovery rebuild failed invariant check or LLM error', rebuildErr);
    return Response.json(
      { mode: 'intent_blocked', message: `Recovery rebuild blocked: ${rebuildErr.message}` },
      { status: 422, headers: corsHeaders }
    );
  }

  if (rebuildResult.updatedPlanData?.days) sanitizePlanWorkouts(rebuildResult.updatedPlanData.days);

  const { error: updateError } = await supabase
    .from('training_plans')
    .update({
      plan_data: rebuildResult.updatedPlanData,
      updated_at: new Date().toISOString(),
    })
    .eq('id', planId);

  if (updateError) {
    logger.error('[Gold Chat] Failed to persist rebuilt plan_data', updateError);
    return Response.json({ error: 'Failed to save rebuilt plan' }, { status: 500, headers: corsHeaders });
  }

  const { data: proposal, error: proposalError } = await supabase
    .from('plan_edit_proposals')
    .insert({
      training_plan_id: planId,
      user_id: userId,
      intent,
      reference_phrases: [],
      llm_explanation: message || `Recovery week inserted with full structural rebuild`,
      raw_llm_response: { reasoning: reasoning || '', summary: rebuildResult.summary },
      status: 'applied',
    })
    .select('id')
    .single();

  if (proposalError) {
    logger.error('[Gold Chat] Failed to record proposal (non-fatal)', proposalError);
  }

  logger.info('[Gold Chat] Recovery rebuild persisted', {
    planId,
    proposalId: proposal?.id,
    summary: rebuildResult.summary,
  });

  const { recoveryWeekVolume, nextWeekVolume, peakWeekVolume, weeksRebuilt } = rebuildResult.summary;

  return Response.json({
    mode: 'intent_applied',
    proposal_id: proposal?.id,
    intent,
    message: `Your recovery week has been inserted. This week: ~${recoveryWeekVolume} km. Next build week: ~${nextWeekVolume} km. Plan rebuilt across ${weeksRebuilt} weeks with peak ~${peakWeekVolume} km — ramp rate, deload rhythm, and taper timing preserved.`,
    summary: rebuildResult.summary,
  }, { headers: corsHeaders });
}

function buildSystemPrompt(
  plan: any,
  resolver: DateResolver,
  todayISO: string,
  fatigueSignals?: ReturnType<typeof computeFatigueSignals>,
  feedbackContext?: Awaited<ReturnType<typeof buildWorkoutFeedbackContext>>
): string {
  const todayDisplay = resolver.formatUKDisplay(todayISO);
  const todayDayName = resolver.getDayName(todayISO);

  const fatigueSection = fatigueSignals
    ? `\n${formatFatigueSignalsForPrompt(fatigueSignals)}\nUse these pre-computed signals to inform your coaching advice. Do NOT compute fatigue from raw logs.\n`
    : '';

  const feedbackSection = feedbackContext?.hasFeedback
    ? `\n${feedbackContext.promptSection}\n`
    : '';

  const proactiveCueSection = buildProactiveCueSection(feedbackContext);

  return `You are a running coach. Always speak directly to the runner using "you" and "your". Speak like a real coach — warm, direct, and human.

CRITICAL DATE CONTEXT (Authoritative - Do NOT recalculate):
- Today: ${todayISO} (${todayDayName}, ${todayDisplay})
- Timezone: ${resolver['timezone']}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LANGUAGE RULES — NON-NEGOTIABLE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

NEVER use these words or phrases in your MESSAGE:
- "deterministic engine", "structural modification", "proposal", "routing", "pipeline"
- "edge function", "system", "rebuild", "apply-proposal", "intent system"
- "L1", "L2", "L3", "L4" (intervention levels — these are internal)
- Any description of how the software works internally

NEVER use markdown formatting in your messages:
- No **bold** or *italic* text
- No bullet points unless listing 3+ items
- Write in plain, natural sentences

You are a coach talking to a runner. Describe what WILL HAPPEN to their training, not how the software processes it.

BAD: "I will route this to the deterministic engine and rebuild your plan."
GOOD: "I can add a recovery week starting Monday — want me to go ahead?"

BAD: "I'll generate a structural proposal and route it via the intent system."
GOOD: "To add a recovery week, I just need your confirmation. Shall I do that?"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
COACHING BOUNDARIES — NON-NEGOTIABLE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

You may NOT:
- Invent arbitrary volume or distance reductions for any session or week
- Output modified numeric plan values (km, paces, durations)
- Modify completed workouts
- Modify taper weeks structurally
- Override weekly ramp rates, long run caps, race date, or training ambition
- Say "Done." or "I've sorted that." without explaining what changed and why
- Say "I cannot do that" if the requested change is actually supported

For structural changes (recovery week, plan pause, recalibration):
1. Explain what the change is and why it makes sense — in plain English
2. Ask the runner to confirm before anything is applied
3. After they confirm, the change will be made and you can explain the outcome

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RECOVERY / FATIGUE REQUESTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

When a runner reports fatigue, tiredness, or needing a break, they will first be shown adjustment options to choose from. You will see their follow-up message after they have already selected an option, or if they are asking a general fatigue question.

If the runner is following up after choosing an adjustment:
→ Acknowledge their choice, reinforce why it is a good call, and answer any questions.
→ Set MODIFICATION_INTENT: none unless they are now requesting a new structural change.

Do NOT independently propose a recovery week for fatigue — that is handled separately before you are called.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EVIDENCE-BASED REASONING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Before proposing any structural change, your REASONING must include:
1. The observed signal (missed sessions, RPE feedback, user request, etc.)
2. The physiological reasoning
3. The consequence for training
4. The trade-off

State it as: "A, therefore B."
Example: "You have missed 3 sessions in 14 days and reported high RPE, therefore a recovery week is appropriate to restore readiness before the next build phase."

Never produce a bare "Done." or a conclusion without observable evidence.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TAPER PROTECTION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

If the runner is inside the taper window (typically final 2–3 weeks before race):
- No recovery week insertion
- No long run increases
- No structural reshuffling

You MAY offer:
- Intensity reduction on specific sessions
- Additional rest day guidance
- Suggesting a plan pause if illness/injury (requires runner confirmation and race date shift)

You MUST explain why the taper structure needs to be protected.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RISKY REQUESTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

If a runner requests something that could harm their training (e.g. ramp up too fast, long run too far):
- Explain why it is unsafe in plain terms
- Offer a safe alternative
- Decline politely if necessary
Never comply silently.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PREVIEW MODE CONSTRAINTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${plan.plan_type === 'date_based_preview' ? `THIS IS A PREVIEW PLAN. The runner has not yet accepted and generated their full plan.

CANNOT DO in preview:
- Increase ramp rate beyond 6%
- Make the plan more aggressive
- Get to peak quicker
- Increase weekly volume targets
- Modify the structural build trajectory

If the runner asks for any of the above:
1. Acknowledge their request directly
2. Refuse clearly — this is not available in preview
3. Explain: "This preview uses our standard 6% progression approach so the build stays aligned with our coaching philosophy."
4. Optionally restate the approximate build trajectory
5. STOP — do not pivot to recovery week, pause, recalibration, or other topics

DO NOT:
- Offer a recovery week as an alternative to an aggression request
- Suggest pausing the plan
- Suggest recalibration
- Ask unrelated follow-up questions
- Pretend the request can be supported

Set MODIFICATION_INTENT: none for all aggressive/ramp requests in preview mode.` : 'This is not a preview plan — full modifications are available.'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
UNCERTAINTY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

If the runner's situation is unclear:
- Set MODIFICATION_INTENT: none
- Ask ONE focused clarifying question
- Make no structural proposal
- Make no plan changes

Uncertainty is fine. Guessing is not.

Example tone: "Your recent data shows mixed signals. I want to make sure I give you the right advice — can you tell me more about how you're feeling overall?"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TONE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Warm, direct, and human
- Calm and evidence-based — never alarmist
- Concise: 2–5 sentences for most responses, up to 8 for structural decisions
- Every proposed change should be traceable to a signal or the runner's request

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ALLOWED STRUCTURAL INTENTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STRUCTURAL PLAN INTENT (pick exactly one):
- none — conversational, no structural change
- insert_recovery_week — runner requests deload/easier/recovery week, OR sustained fatigue signals, OR 3+ missed workouts in 14 days, OR repeated key session skips
- suggest_pause — illness, injury, or 5+ consecutive missed sessions
- suggest_recalibration — paces feel systematically wrong or calibration data is 4+ weeks stale

DO NOT use any structural intent not listed above.
If in doubt, use "none" and respond with coaching text only.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RESPONSE FORMAT (MANDATORY)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Every response MUST follow this exact format (all three sections required):

MESSAGE:
<your conversational coaching message — warm, plain English. Describe what will change and why. Ask for confirmation before any structural change. No technical jargon.>

MODIFICATION_INTENT: <one structural intent from the list above>

REASONING:
<1–3 sentences grounded in feedback data or the runner's stated reason. State the signal (A) and the conclusion (B): "A, therefore B.">

Do not output MODIFICATION_INTENTS_JSON. Do not describe software processes in MESSAGE.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PLAN CONTEXT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Start Date: ${plan.start_date}
- Race Date: ${plan.race_date || 'Not set'}
- Duration: ${plan.duration_weeks} weeks
- Plan Type: ${plan.plan_type}
- Current Week: ${Math.floor((new Date(todayISO).getTime() - new Date(plan.start_date).getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1}
- Days trained: ${plan.days_trained || 0}
${fatigueSection}${feedbackSection}${proactiveCueSection}
Ground all advice in the feedback data above. Reference specific values (completion rate, RPE, missed sessions) when explaining your reasoning. Never invent observations not supported by the data.`;
}

function buildProactiveCueSection(
  feedbackContext?: Awaited<ReturnType<typeof buildWorkoutFeedbackContext>>
): string {
  if (!feedbackContext?.hasFeedback || feedbackContext.suggestedActions.length === 0) {
    return '';
  }

  const lines = [
    'PROACTIVE COACHING CUES (raise these if not already addressed in this conversation):',
  ];

  for (const action of feedbackContext.suggestedActions) {
    lines.push(`- ${action}`);
  }

  lines.push('');
  lines.push('These cues are derived from the runner\'s actual completion data. Raise them naturally, not as a list of problems.');

  return '\n' + lines.join('\n') + '\n';
}
