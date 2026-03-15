/**
 * chat-training-plan (unified)
 *
 * Finite Action System pipeline:
 *   User message
 *   → Intent classifier (LLM, temperature 0.1, JSON only)
 *   → Finite Action selected from fixed enum
 *   → Deterministic plan modification
 *   → Coach response generation (LLM, tone/explanation only)
 *
 * The LLM never generates plan edits directly.
 * All plan logic is deterministic and lives in _shared/.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';
import { logger } from '../_shared/logger.ts';
import { DateResolver } from '../_shared/dateResolverBackend.ts';
import { sanitizePlanWorkouts } from '../_shared/validator.ts';
import {
  createClarificationRequest,
  createCoachMessage,
  type ClarificationOption,
} from '../_shared/clarificationWorkflow.ts';
import { extractDatePhrases, hasAmbiguousDateReference, isRecurringWeekdayRequest, detectTierChangeRequest, extractTierFromPlanData, type PlanTier } from '../_shared/phraseAnalyzer.ts';
import {
  isFatigueRequest,
  isFatigueOptionsFollowUp,
  generateFatigueOptions,
  buildFatigueInterventionMessage,
  type FatigueInterventionContext,
} from '../_shared/fatigueInterventionPlanner.ts';
import { classifyChatIntent, buildUpcomingDaysContext } from '../_shared/intentClassifier.ts';
import { executePlanAction, type ExecutionContext } from '../_shared/actionExecutor.ts';
import { generateCoachResponse } from '../_shared/coachResponseGenerator.ts';
import { isInformationalAction } from '../_shared/planAction.ts';
import { analyzePlanImpact, buildImpactCoachingNote } from '../_shared/planImpactAnalyzer.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface RequestBody {
  mode?: 'draft' | 'confirm_structural' | 'select_fatigue_option' | 'clarification_response' | 'confirm_tier_change' | 'select_tier';
  message?: string;
  selectedTier?: string;
  proposal_id?: string;
  chatHistory?: Array<{ role: string; content: string }>;
  planId?: string;
  planVersion?: number;
  userTimezone?: string;
  todayISO?: string;
  planData?: any;
  userProfile?: any;
  resolvedDates?: Record<string, string>;
  structuralAction?: string;
  proposal_id?: string;
  selectedFatigueLevel?: string;
  clarificationId?: string;
  selectedDate?: string;
  detectedPhrase?: string;
  originalMessage?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    const body: RequestBody = await req.json();
    const { mode = 'draft', planId, userTimezone, message, chatHistory = [] } = body;

    logger.info('[Chat] Request received', { mode, planId });

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

    if (!openaiApiKey) throw new Error('OPENAI_API_KEY not configured');

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const userClient = authHeader
      ? createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: authHeader } } })
      : null;

    const userId = userClient ? (await userClient.auth.getUser()).data.user?.id : null;

    if (mode === 'select_fatigue_option') {
      return await handleSelectFatigueOption(body, supabase, userId, openaiApiKey);
    }

    if (mode === 'confirm_structural') {
      return await handleConfirmStructural(body, supabase, userId, openaiApiKey);
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
      return Response.json(createCoachMessage('Sorry, I could not find your training plan.'), { headers: corsHeaders });
    }

    const timezone = userTimezone || plan.timezone || 'Europe/Paris';
    const resolver = new DateResolver(body.todayISO, timezone);
    const todayISO = resolver.getTodayISO();

    if (mode === 'clarification_response') {
      return await handleClarificationResponse(body, plan, resolver, todayISO, supabase, userId, openaiApiKey, chatHistory);
    }

    if (!message) {
      return Response.json(createCoachMessage('Please send a message.'), { headers: corsHeaders });
    }

    // Tier change intercept - detect and handle tier migration requests BEFORE LLM
    const currentTier = extractTierFromPlanData(plan.plan_data) || (plan.answers?.ambitionTier as PlanTier);
    const tierDetection = detectTierChangeRequest(message, currentTier);

    if (tierDetection.isTierChangeRequest && tierDetection.confidence >= 0.6) {
      logger.info('[Chat] Tier change request detected', {
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

    if (isFatigueRequest(message) || isFatigueOptionsFollowUp(message, chatHistory)) {
      return handleFatigueIntercept(plan, todayISO);
    }

    if (isRecurringWeekdayRequest(message)) {
      logger.info('[Chat] Detected recurring weekday request, bypassing date disambiguation', { message: message.slice(0, 80) });
      return await handleDraft(message, chatHistory, plan, resolver, todayISO, supabase, userId, openaiApiKey);
    }

    if (hasAmbiguousDateReference(message)) {
      const phrases = extractDatePhrases(message);
      const ambiguousPhrase = phrases.find(p => p.isAmbiguous);
      if (ambiguousPhrase) {
        const resolution = resolver.resolveRelativeDay(ambiguousPhrase.phrase);
        if (resolution.isAmbiguous && resolution.options) {
          const options: ClarificationOption[] = resolution.options.map((opt, idx) => ({
            id: `opt-${idx}`,
            isoDate: opt.isoDate,
            displayDate: opt.displayDate,
            label: opt.label,
          }));
          return Response.json(
            createClarificationRequest(
              resolution.requiresClarification || `Which ${ambiguousPhrase.phrase} did you mean?`,
              options,
              message,
              ambiguousPhrase.phrase,
            ),
            { headers: corsHeaders }
          );
        }
      }
    }

    return await handleDraft(message, chatHistory, plan, resolver, todayISO, supabase, userId, openaiApiKey);

  } catch (error: any) {
    logger.error('[Chat] Unhandled error', { message: error?.message, stack: error?.stack });
    return Response.json(
      createCoachMessage('Sorry, something went wrong. Please try again.'),
      { status: 500, headers: corsHeaders }
    );
  }
});

async function handleDraft(
  message: string,
  chatHistory: Array<{ role: string; content: string }>,
  plan: any,
  resolver: DateResolver,
  todayISO: string,
  supabase: ReturnType<typeof createClient>,
  userId: string | null | undefined,
  openaiApiKey: string,
): Promise<Response> {
  logger.info('[Chat] Classifying intent', { message: message.slice(0, 80) });

  const upcomingDays = buildUpcomingDaysContext(plan.plan_data?.days ?? [], todayISO, 21);

  const intent = await classifyChatIntent(message, chatHistory, todayISO, openaiApiKey, upcomingDays);

  logger.info('[Chat] Intent classified', {
    action: intent.action,
    confidence: intent.confidence,
    needs_clarification: intent.needs_clarification,
  });

  if (intent.needs_clarification) {
    const question = intent.clarification_question || 'Can you clarify which date you mean?';
    return Response.json(createCoachMessage(question), { headers: corsHeaders });
  }

  if (intent.action === 'L4_INSERT_RECOVERY_WEEK' || intent.action === 'REBUILD_PLAN') {
    const { parseRaceDistanceKm } = await import('../_shared/planStructureBuilder.ts');
    const { validateStructuralRebuild } = await import('../_shared/safetyInvariants.ts');

    const raceDistanceKm = parseRaceDistanceKm(plan.answers?.raceDistance ?? '');
    const structuralCheck = validateStructuralRebuild(
      { raceDateISO: plan.race_date, raceDistanceKm, totalWeeks: plan.duration_weeks ?? 0, currentWeekStartISO: todayISO, todayISO },
      []
    );

    if (!structuralCheck.valid) {
      const coachMsg = await generateCoachResponse(
        intent.action,
        intent,
        { success: false, message: structuralCheck.errors[0], planUpdated: false, blocked: true, blockedReason: 'taper_guard' },
        message,
        chatHistory,
        { raceDate: plan.race_date, raceDistance: plan.answers?.raceDistance, userName: plan.answers?.userName, todayISO },
        openaiApiKey,
      );
      return Response.json(createCoachMessage(coachMsg), { headers: corsHeaders });
    }

    let proposalId: string | null = null;
    if (userId && plan?.id) {
      const { data: proposal } = await supabase
        .from('plan_edit_proposals')
        .insert({
          training_plan_id: plan.id,
          user_id: userId,
          intent: 'insert_recovery_week',
          reference_phrases: [],
          llm_explanation: `Runner requested ${intent.action}`,
          raw_llm_response: { action: intent.action, parameters: intent.parameters },
          status: 'pending_resolution',
        })
        .select('id')
        .maybeSingle();
      proposalId = proposal?.id ?? null;
    }

    const confirmationMessage = await generateStructuralConfirmationMessage(intent.action, plan, todayISO, openaiApiKey);

    return Response.json({
      mode: 'proposal',
      intent: 'insert_recovery_week',
      proposal_id: proposalId,
      structuralAction: intent.action,
      message: confirmationMessage,
      reasoning: '',
      awaitingConfirmation: true,
    }, { headers: corsHeaders });
  }

  if (isInformationalAction(intent.action)) {
    const coachMsg = await generateCoachResponse(
      intent.action,
      intent,
      { success: true, message: '', planUpdated: false },
      message,
      chatHistory,
      { raceDate: plan.race_date, raceDistance: plan.answers?.raceDistance, userName: plan.answers?.userName, todayISO },
      openaiApiKey,
    );
    return Response.json(createCoachMessage(coachMsg), { headers: corsHeaders });
  }

  if (intent.action === 'RECURRING_MOVE_WEEKDAY' || intent.action === 'RECURRING_ADD_WEEKDAY' || intent.action === 'RECURRING_REMOVE_WEEKDAY') {
    const fromWeekday = intent.parameters.from_weekday as string | null;
    const toWeekday = intent.parameters.to_weekday as string | null;
    const targetWeekday = intent.parameters.target_weekday as string | null;

    let recurring_operation: string;
    let coachMessage: string;

    if (intent.action === 'RECURRING_MOVE_WEEKDAY') {
      if (!fromWeekday || !toWeekday) {
        return Response.json(createCoachMessage('Which weekday would you like to move workouts FROM, and which weekday should they move TO? (e.g., "move all Fridays to Thursday")'), { headers: corsHeaders });
      }
      recurring_operation = 'recurring_move';
      coachMessage = `I'll move all your future ${fromWeekday} workouts to ${toWeekday}. This will update your entire plan going forward. Ready to make this change?`;
    } else if (intent.action === 'RECURRING_ADD_WEEKDAY') {
      if (!targetWeekday) {
        return Response.json(createCoachMessage('Which weekday would you like to add workouts to? (e.g., "add a run to all Mondays")'), { headers: corsHeaders });
      }
      recurring_operation = 'recurring_add';
      coachMessage = `I'll add easy runs to all your future ${targetWeekday}s that are currently rest days. Ready to make this change?`;
    } else {
      if (!targetWeekday) {
        return Response.json(createCoachMessage('Which weekday would you like to remove workouts from? (e.g., "remove all Tuesday workouts")'), { headers: corsHeaders });
      }
      recurring_operation = 'recurring_remove';
      coachMessage = `I'll remove all your future ${targetWeekday} workouts, converting them to rest days. Ready to make this change?`;
    }

    logger.info('[Chat] Returning recurring weekday edit for confirmation', {
      action: intent.action,
      recurring_operation,
      fromWeekday,
      toWeekday,
      targetWeekday,
    });

    return Response.json({
      mode: 'recurring_weekday_edit',
      recurring_operation,
      from_weekday: fromWeekday,
      to_weekday: toWeekday,
      target_weekday: targetWeekday,
      coachMessage,
    }, { headers: corsHeaders });
  }

  const ctx: ExecutionContext = {
    plan: {
      id: plan.id,
      plan_data: plan.plan_data,
      start_date: plan.start_date,
      race_date: plan.race_date,
      duration_weeks: plan.duration_weeks,
      answers: plan.answers ?? {},
      training_paces: plan.training_paces,
      workout_version: plan.workout_version ?? 0,
    },
    todayISO,
    openaiApiKey,
  };

  const daysBefore = (plan.plan_data?.days ?? []).map((d: any) => ({ ...d }));

  const result = await executePlanAction(intent, ctx);

  if (result.blocked && result.blockedReason === 'needs_clarification') {
    return Response.json(createCoachMessage(result.message), { headers: corsHeaders });
  }

  if (result.planUpdated && result.updatedPlanData && userId) {
    if (result.updatedPlanData.days) sanitizePlanWorkouts(result.updatedPlanData.days);

    const { error: updateError } = await supabase
      .from('training_plans')
      .update({
        plan_data: result.updatedPlanData,
        workout_version: (plan.workout_version ?? 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', plan.id)
      .eq('user_id', userId);

    if (updateError) {
      logger.error('[Chat] Failed to persist plan update', { error: updateError });
      return Response.json(
        createCoachMessage('Your change was calculated but could not be saved. Please try again.'),
        { status: 500, headers: corsHeaders }
      );
    }

    logger.info('[Chat] Plan updated', { action: intent.action, planId: plan.id });
  }

  const daysAfter = result.updatedPlanData?.days ?? daysBefore;
  const affectedDate = (intent.parameters?.date ?? intent.parameters?.from_date) as string | null | undefined;

  const impact = (result.planUpdated && (intent.action === 'CANCEL_SESSION' || intent.action === 'SKIP_SESSION' || intent.action === 'L1_SKIP_WORKOUT'))
    ? analyzePlanImpact(daysBefore, daysAfter, { affectedDate: affectedDate ?? null, todayISO })
    : null;

  let impactNote = '';
  if (impact) {
    const referenceDate = affectedDate ?? todayISO;
    const dow = new Date(referenceDate + 'T12:00:00Z').getUTCDay();
    const mondayOffset = dow === 0 ? -6 : 1 - dow;
    const mondayMs = new Date(referenceDate + 'T00:00:00Z').getTime() + mondayOffset * 86400000;
    const sundayMs = mondayMs + 7 * 86400000;
    const postActionWeekDays = daysAfter.filter((d: any) => {
      const t = new Date(d.date + 'T00:00:00Z').getTime();
      return t >= mondayMs && t < sundayMs;
    });
    impactNote = buildImpactCoachingNote(impact, postActionWeekDays);
  }

  if (impact) {
    logger.info('[Chat] Plan impact analysis', {
      impactLevel: impact.impactLevel,
      signals: impact.signals,
      sessionsRemoved: impact.sessionsRemovedThisWeek,
      volumeBefore: impact.weekVolumeBeforeKm,
      volumeAfter: impact.weekVolumeAfterKm,
    });
  }

  const coachMsg = await generateCoachResponse(
    intent.action,
    intent,
    result,
    message,
    chatHistory,
    { raceDate: plan.race_date, raceDistance: plan.answers?.raceDistance, userName: plan.answers?.userName, todayISO },
    openaiApiKey,
    impactNote,
  );

  return Response.json({
    mode: result.planUpdated ? 'plan_updated' : 'coach_message_only',
    message: coachMsg,
    planUpdated: result.planUpdated,
    action: intent.action,
    impactLevel: impact?.impactLevel ?? 'none',
    updatedPlanData: result.planUpdated ? result.updatedPlanData : undefined,
  }, { headers: corsHeaders });
}

async function handleConfirmStructural(
  body: RequestBody,
  supabase: ReturnType<typeof createClient>,
  userId: string | null | undefined,
  openaiApiKey: string,
): Promise<Response> {
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });

  const { proposal_id, userTimezone } = body;

  if (!proposal_id) {
    return Response.json({ error: 'proposal_id is required' }, { status: 400, headers: corsHeaders });
  }

  const { data: proposal } = await supabase
    .from('plan_edit_proposals')
    .select('*')
    .eq('id', proposal_id)
    .eq('user_id', userId)
    .maybeSingle();

  if (!proposal) {
    return Response.json({ error: 'Proposal not found' }, { status: 404, headers: corsHeaders });
  }

  if (proposal.status === 'applied') {
    return Response.json({ error: 'This proposal has already been applied' }, { status: 409, headers: corsHeaders });
  }

  const { data: plan } = await supabase
    .from('training_plans')
    .select('*')
    .eq('id', proposal.training_plan_id)
    .eq('user_id', userId)
    .single();

  if (!plan) {
    return Response.json({ error: 'Training plan not found' }, { status: 404, headers: corsHeaders });
  }

  const timezone = userTimezone || plan.timezone || 'Europe/Paris';
  const resolver = new DateResolver(body.todayISO, timezone);
  const todayISO = resolver.getTodayISO();

  const ctx: ExecutionContext = {
    plan: {
      id: plan.id,
      plan_data: plan.plan_data,
      start_date: plan.start_date,
      race_date: plan.race_date,
      duration_weeks: plan.duration_weeks,
      answers: plan.answers ?? {},
      training_paces: plan.training_paces,
      workout_version: plan.workout_version ?? 0,
    },
    todayISO,
    openaiApiKey,
  };

  const result = await executePlanAction(
    { action: 'L4_INSERT_RECOVERY_WEEK', confidence: 1, parameters: {}, needs_clarification: false },
    ctx,
  );

  if (!result.success) {
    await supabase.from('plan_edit_proposals').update({ status: 'rejected' }).eq('id', proposal_id);
    return Response.json({
      mode: 'intent_blocked',
      message: result.message || 'This change cannot be applied right now.',
    }, { headers: corsHeaders });
  }

  if (result.updatedPlanData?.days) sanitizePlanWorkouts(result.updatedPlanData.days);

  await supabase
    .from('training_plans')
    .update({ plan_data: result.updatedPlanData, updated_at: new Date().toISOString() })
    .eq('id', plan.id);

  await supabase
    .from('plan_edit_proposals')
    .update({ status: 'applied' })
    .eq('id', proposal_id);

  const parts = result.message.split(':');

  return Response.json({
    mode: 'intent_applied',
    proposal_id,
    intent: 'insert_recovery_week',
    message: `Your recovery week has been inserted. This week: ~${parts[1] ?? '?'} km. Next build week: ~${parts[2] ?? '?'} km. Plan rebuilt across ${parts[3] ?? '?'} weeks — ramp rate, deload rhythm, and taper timing preserved.`,
  }, { headers: corsHeaders });
}

async function handleSelectFatigueOption(
  body: RequestBody,
  supabase: ReturnType<typeof createClient>,
  userId: string | null | undefined,
  openaiApiKey: string,
): Promise<Response> {
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });

  const { selectedFatigueLevel, planId, userTimezone } = body;

  if (!selectedFatigueLevel || !planId) {
    return Response.json({ error: 'selectedFatigueLevel and planId are required' }, { status: 400, headers: corsHeaders });
  }

  const { data: plan, error: planError } = await supabase
    .from('training_plans')
    .select('*')
    .eq('id', planId)
    .eq('user_id', userId)
    .single();

  if (planError || !plan) {
    return Response.json({ error: 'Plan not found' }, { status: 404, headers: corsHeaders });
  }

  const timezone = userTimezone || plan.timezone || 'Europe/Paris';
  const resolver = new DateResolver(body.todayISO, timezone);
  const todayISO = resolver.getTodayISO();

  const levelToAction: Record<string, 'L1_SKIP_WORKOUT' | 'L2_SOFTEN_WEEK' | 'L3_REDUCE_WEEK' | 'L4_INSERT_RECOVERY_WEEK'> = {
    L1: 'L1_SKIP_WORKOUT',
    L2: 'L2_SOFTEN_WEEK',
    L3: 'L3_REDUCE_WEEK',
    L4: 'L4_INSERT_RECOVERY_WEEK',
  };

  const action = levelToAction[selectedFatigueLevel];
  if (!action) {
    return Response.json({ error: 'Invalid fatigue level' }, { status: 400, headers: corsHeaders });
  }

  const ctx: ExecutionContext = {
    plan: {
      id: plan.id,
      plan_data: plan.plan_data,
      start_date: plan.start_date,
      race_date: plan.race_date,
      duration_weeks: plan.duration_weeks,
      answers: plan.answers ?? {},
      training_paces: plan.training_paces,
      workout_version: plan.workout_version ?? 0,
    },
    todayISO,
    openaiApiKey,
  };

  const result = await executePlanAction(
    { action, confidence: 1, parameters: {}, needs_clarification: false },
    ctx,
  );

  if (!result.success) {
    return Response.json({
      mode: 'intent_blocked',
      message: result.message || 'Could not apply this change right now.',
    }, { headers: corsHeaders });
  }

  if (result.planUpdated && result.updatedPlanData && userId) {
    if (result.updatedPlanData.days) sanitizePlanWorkouts(result.updatedPlanData.days);

    const { error: updateError } = await supabase
      .from('training_plans')
      .update({
        plan_data: result.updatedPlanData,
        workout_version: (plan.workout_version ?? 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', planId)
      .eq('user_id', userId);

    if (updateError) {
      logger.error('[Chat] Failed to persist fatigue patch', { selectedFatigueLevel, updateError });
      return Response.json({ error: 'Failed to save changes' }, { status: 500, headers: corsHeaders });
    }
  }

  if (selectedFatigueLevel === 'L4') {
    const parts = result.message.split(':');
    return Response.json({
      mode: 'intent_applied',
      level: 'L4',
      message: `Your recovery week has been inserted. This week: ~${parts[1] ?? '?'} km. Next build week: ~${parts[2] ?? '?'} km. Plan rebuilt across ${parts[3] ?? '?'} weeks — ramp rate, deload rhythm, and taper timing preserved.`,
    }, { headers: corsHeaders });
  }

  const fallbackMessages: Record<string, string> = {
    L1: `Done. Your next workout has been converted to a rest day. All other sessions remain unchanged. Check back in after a day or two — if you're still feeling flat, we can look at more options.`,
    L2: `Done. Your quality session has been converted to an easy run and your long run reduced by ~12% this week. All other sessions remain as planned. You should recover well without losing momentum.`,
    L3: `Done. This week's training has been reduced by ~15% across all sessions. Your quality session is kept but at easy-moderate effort. The plan will continue building from next week.`,
  };

  return Response.json({
    mode: 'fatigue_plan_updated',
    level: selectedFatigueLevel,
    message: fallbackMessages[selectedFatigueLevel] ?? 'Your plan has been updated.',
    modifiedCount: 1,
  }, { headers: corsHeaders });
}

async function handleClarificationResponse(
  body: RequestBody,
  plan: any,
  resolver: DateResolver,
  todayISO: string,
  supabase: ReturnType<typeof createClient>,
  userId: string | null | undefined,
  openaiApiKey: string,
  chatHistory: Array<{ role: string; content: string }>,
): Promise<Response> {
  const { selectedDate, detectedPhrase, originalMessage } = body;

  if (selectedDate && detectedPhrase && originalMessage) {
    const resolvedMessage = originalMessage.replace(new RegExp(detectedPhrase, 'i'), selectedDate);
    logger.info('[Chat] Clarification resolved — re-running draft', { resolvedMessage });
    return await handleDraft(resolvedMessage, chatHistory, plan, resolver, todayISO, supabase, userId, openaiApiKey);
  }

  return Response.json(
    createCoachMessage('I could not process that selection. Please try again.'),
    { headers: corsHeaders }
  );
}

function handleFatigueIntercept(plan: any, todayISO: string): Response {
  const raceDate = plan.race_date;
  const weeksToRace = raceDate
    ? Math.max(0, Math.round(
        (new Date(raceDate + 'T00:00:00Z').getTime() - new Date(todayISO + 'T00:00:00Z').getTime()) /
        (7 * 24 * 60 * 60 * 1000)
      ))
    : undefined;

  const planDays: any[] = plan.plan_data?.days ?? [];
  const futureDays = planDays.filter((d: any) => d.date >= todayISO && d.workout_type === 'TRAIN');
  const nextWorkout = futureDays[0];
  const nextWorkoutTitle = nextWorkout?.workout?.split('\n')[0]?.slice(0, 60);

  const dow = new Date(todayISO + 'T12:00:00Z').getUTCDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const mondayMs = new Date(todayISO + 'T00:00:00Z').getTime() + mondayOffset * 86400000;
  const sundayMs = mondayMs + 7 * 86400000;
  const KM_RE = /(\d+(?:\.\d+)?)\s*km/i;

  const thisWeekDays = planDays.filter((d: any) => {
    const t = new Date(d.date + 'T00:00:00Z').getTime();
    return t >= mondayMs && t < sundayMs && d.workout_type === 'TRAIN';
  });

  const currentWeekVolume = thisWeekDays.reduce((sum: number, d: any) => {
    const m = (d.workout ?? '').match(KM_RE);
    return sum + (m ? parseFloat(m[1]) : 0);
  }, 0);

  const longRunDay = thisWeekDays.find((d: any) => (d.workout ?? '').toLowerCase().includes('long run'));
  const currentLongRunKm = longRunDay
    ? (() => { const m = (longRunDay.workout ?? '').match(KM_RE); return m ? parseFloat(m[1]) : undefined; })()
    : undefined;

  const isInTaper = !!(weeksToRace !== undefined && weeksToRace <= 3);

  const ctx: FatigueInterventionContext = {
    currentWeekVolume: currentWeekVolume > 0 ? Math.round(currentWeekVolume * 10) / 10 : undefined,
    currentLongRunKm,
    nextWorkoutTitle,
    weeksToRace,
    isInTaper,
  };

  const options = generateFatigueOptions(ctx);
  const coachMessage = buildFatigueInterventionMessage(options, ctx);

  return Response.json({
    mode: 'fatigue_options',
    message: coachMessage,
    options,
    isInTaper,
  }, { headers: corsHeaders });
}

async function generateStructuralConfirmationMessage(
  action: string,
  plan: any,
  todayISO: string,
  openaiApiKey: string,
): Promise<string> {
  const raceDate = plan.race_date;
  const weeksToRace = raceDate
    ? Math.max(0, Math.round(
        (new Date(raceDate + 'T00:00:00Z').getTime() - new Date(todayISO + 'T00:00:00Z').getTime()) /
        (7 * 24 * 60 * 60 * 1000)
      ))
    : null;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${openaiApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'You are a running coach. Write a brief confirmation message asking the runner to confirm a recovery week insertion. Be direct (2-3 sentences). No technical jargon.',
          },
          {
            role: 'user',
            content: `Action: ${action}. Race date: ${raceDate ?? 'not set'}. Weeks to race: ${weeksToRace ?? 'unknown'}. Today: ${todayISO}. Ask the runner to confirm.`,
          },
        ],
        temperature: 0.7,
        max_tokens: 150,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      return data.choices[0]?.message?.content?.trim() ?? defaultConfirmationMessage(action);
    }
  } catch {
    // fall through
  }

  return defaultConfirmationMessage(action);
}

function defaultConfirmationMessage(action: string): string {
  return action === 'REBUILD_PLAN'
    ? "I can rebuild your plan from your current position. This will recalculate the remaining weeks to keep you on track. Shall I go ahead?"
    : "I can insert a recovery week starting Monday. Your plan will be rebuilt to preserve your ramp rate and taper timing. Shall I go ahead?";
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

  if (proposalError || !proposal?.id) {
    logger.error('[Chat] Failed to store tier change proposal', proposalError);
    return Response.json({
      error: 'Failed to create tier change proposal. Please try again.',
    }, { status: 500, headers: corsHeaders });
  }

  logger.info('[Chat] Tier change proposal created', {
    proposalId: proposal.id,
    currentTier,
    targetTier,
    isUpgrade,
  });

  return Response.json({
    mode: 'tier_change_proposal',
    proposal_id: proposal.id,
    intent: 'change_plan_tier',
    currentTier,
    targetTier,
    isUpgrade,
    message: coachMessage,
    awaitingConfirmation: true,
  }, { headers: corsHeaders });
}

async function handleConfirmTierChange(
  body: RequestBody,
  supabase: ReturnType<typeof createClient>,
  userId: string | null | undefined
): Promise<Response> {
  const { proposal_id, planId } = body;

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
    logger.error('[Chat] Tier change proposal not found', { proposal_id, proposalError });
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
    logger.error('[Chat] Failed to build structural guidance for tier change', sgErr);
    return Response.json({
      error: 'Failed to calculate new training targets for tier change',
    }, { status: 500, headers: corsHeaders });
  }

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
    previousTier: currentTier,
    structuralGuidance: {
      weeklyVolumes: newStructuralGuidance.weeklyVolumes,
      longRunTargets: newStructuralGuidance.longRunTargets,
      cutbackWeeks: newStructuralGuidance.cutbackWeeks,
      peakWeek: newStructuralGuidance.peakWeek,
      taperStartWeek: newStructuralGuidance.taperStartWeek,
    },
  };

  const updatedPlanData = {
    ...oldPlanData,
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
    logger.error('[Chat] Failed to update plan tier', { targetTier, updateError });
    return Response.json({ error: 'Failed to update plan tier' }, { status: 500, headers: corsHeaders });
  }

  await supabase
    .from('plan_edit_proposals')
    .update({ status: 'applied' })
    .eq('id', proposal_id);

  logger.info('[Chat] Plan tier changed with structural update', {
    planId: plan.id,
    targetTier,
    oldPeakVolume,
    newPeakVolume,
    volumeDiffPct,
    newPeakLongRun,
    qualitySessionsPerWeek: newStructuralGuidance.qualitySessionsPerWeek,
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
    },
    message: `Your plan has been updated to the ${tierDisplay} tier. ${volumeChangeText} ${qualitySessionText} Peak long run: ${newPeakLongRun} km. The new training structure is now active.`,
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

  const currentTier = extractTierFromPlanData(plan.plan_data) || (plan.answers?.ambitionTier as PlanTier) || 'base';

  return await handleTierChangeRequest(
    `Change tier to ${selectedTier}`,
    plan,
    currentTier,
    normalizedTier,
    supabase,
    userId
  );
}
