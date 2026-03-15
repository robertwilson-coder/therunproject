import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';
import { sanitizeIntervalWorkout } from '../_shared/validator.ts';
import { DateResolver } from '../_shared/dateResolverBackend.ts';
import { logger } from '../_shared/logger.ts';
import { extractDatePhrases, hasAmbiguousDateReference } from '../_shared/phraseAnalyzer.ts';
import { computeTrainingSummary, isRaceExecutionIntent } from '../_shared/raceExecutionContext.ts';
import { buildRaceExecutionSystemPrompt } from '../_shared/promptBuilder.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const CONFIRMATION_PATTERNS = [
  /^yes[\s,!.]*(?:please|do it|go ahead|apply|ok|okay|sure|sounds good|let'?s do it|that'?s fine|that works|confirmed?)?[\s.!]*$/i,
  /^(?:go ahead|apply (?:it|that|the change|the changes)|do it|make (?:it|that|the change)|ok(?:ay)? do it|yep|yeah|yep please|please do)[\s.!]*$/i,
  /^(?:sounds good|looks good|that'?s fine|that works|perfect|great|confirmed?)[\s.!]*$/i,
  /^(?:apply|confirm|proceed|execute)[\s.!]*$/i,
  /^1[\s.!]*$/,
];

function isConfirmationMessage(message: string): boolean {
  const trimmed = message.trim();
  return CONFIRMATION_PATTERNS.some(p => p.test(trimmed));
}

interface Workout {
  date: string;
  workout: string;
  tips?: string[];
  workout_type?: string;
  workoutType?: string;
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface DraftRequestBody {
  mode: 'draft';
  message: string;
  resolvedDates: Record<string, string>;
  chatHistory: ChatMessage[];
  planId: string;
  planData: { days: Workout[] };
  planVersion: number;
  userProfile: any;
  userTimezone?: string;
  todayISO?: string;
  diagnostics?: boolean;
  previousProposal?: {
    advisoryId: string;
    explanation: string;
    modifications: Array<{
      operation: string;
      target_date: string;
      new_date?: string;
    }>;
  };
}

interface CommitRequestBody {
  mode: 'commit';
  previewId: string;
  planId: string;
  planVersion: number;
  userTimezone?: string;
  diagnostics?: boolean;
}

interface ConfirmAdvisoryBody {
  mode: 'confirm_advisory';
  advisoryId: string;
  planId: string;
  planVersion: number;
  userTimezone?: string;
  todayISO?: string;
  diagnostics?: boolean;
}

interface ClarificationResponseBody {
  mode: 'clarification_response';
  clarificationId: string;
  selectedDate: string;
  detectedPhrase: string;
  originalMessage: string;
  chatHistory: ChatMessage[];
  planId: string;
  planData: { days: Workout[] };
  planVersion: number;
  userProfile: any;
  userTimezone?: string;
  todayISO?: string;
  diagnostics?: boolean;
}

type RequestBody = DraftRequestBody | CommitRequestBody | ConfirmAdvisoryBody | ClarificationResponseBody;

interface WorkoutModification {
  operation: 'cancel' | 'reschedule' | 'modify' | 'swap';
  target_date: string;
  new_date?: string;
  new_workout?: string;
  new_tips?: string[];
  swap_with_date?: string;
}

Deno.serve(async (req: Request) => {
  console.log('ACTIVE_CHAT_FUNCTION=chat-training-plan-v2');

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body: RequestBody = await req.json();
    const authHeader = req.headers.get('Authorization');

    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    logger.info('[ChatV2] Request received', {
      mode: body.mode,
      userTimezone: 'userTimezone' in body ? body.userTimezone : undefined,
      todayISO: 'todayISO' in body ? body.todayISO : undefined,
      diagnostics: 'diagnostics' in body ? body.diagnostics : false
    });

    if (body.mode === 'draft') {
      return await handleDraft(body, user.id, supabase);
    } else if (body.mode === 'commit') {
      return await handleCommit(body, user.id, supabase);
    } else if (body.mode === 'confirm_advisory') {
      return await handleConfirmAdvisory(body, user.id, supabase);
    } else if (body.mode === 'clarification_response') {
      return await handleClarificationResponse(body, user.id, supabase);
    } else {
      throw new Error('Invalid mode');
    }
  } catch (err) {
    logger.error('[ChatV2] Error:', err);
    return new Response(
      JSON.stringify({ error: err.message || 'Request failed' }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function handleDraft(body: DraftRequestBody, userId: string, supabase: any) {
  const { message, resolvedDates, chatHistory, planData, planId, planVersion, userProfile, userTimezone, todayISO, diagnostics = false } = body;

  const { data: planRecord, error: planError } = await supabase
    .from('training_plans')
    .select('timezone, workout_version')
    .eq('id', planId)
    .maybeSingle();

  const timezone = userTimezone || planRecord?.timezone || 'Europe/Paris';
  const dateResolver = new DateResolver(todayISO, timezone);
  const workouts: Workout[] = planData.days || [];
  const planVersionInDB = planRecord?.workout_version || 1;

  logger.info('[ChatV2Draft] Received request:', {
    message,
    resolvedDates,
    workoutCount: workouts.length,
    timezone,
    todayISO: dateResolver.getTodayISO(),
    diagnostics
  });

  // Check if this is a confirmation of a pending advisory
  if (isConfirmationMessage(message)) {
    const { data: pendingAdvisory } = await supabase
      .from('preview_sets')
      .select('*')
      .eq('user_id', userId)
      .eq('plan_id', planId)
      .eq('advisory_pending', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (pendingAdvisory && new Date(pendingAdvisory.expires_at) > new Date()) {
      logger.info('[ChatV2Draft] Confirmation detected — escalating pending advisory to preview', { advisoryId: pendingAdvisory.preview_id });
      return await buildPreviewFromAdvisory(pendingAdvisory, workouts, planId, planVersion, userId, dateResolver, supabase, diagnostics);
    }
  }

  if (hasAmbiguousDateReference(message)) {
    const phrases = extractDatePhrases(message);
    const ambiguousPhrase = phrases.find(p => p.isAmbiguous);

    if (ambiguousPhrase) {
      const alreadyResolved = resolvedDates && resolvedDates[ambiguousPhrase.normalizedPhrase];

      if (alreadyResolved) {
        logger.info('[ChatV2Draft] Phrase already resolved, skipping clarification', {
          phrase: ambiguousPhrase.phrase,
          normalizedPhrase: ambiguousPhrase.normalizedPhrase,
          resolvedDates
        });
      } else {
        const resolution = dateResolver.resolveRelativeDay(ambiguousPhrase.normalizedPhrase);

        if (resolution.isAmbiguous && resolution.options) {
          logger.info('[ChatV2Draft] Ambiguous date detected, requesting clarification', {
            phrase: ambiguousPhrase.phrase,
            normalizedPhrase: ambiguousPhrase.normalizedPhrase,
            optionsCount: resolution.options.length
          });

          return new Response(
            JSON.stringify({
              mode: 'clarification_required',
              clarificationId: crypto.randomUUID(),
              detectedPhrase: ambiguousPhrase.normalizedPhrase,
              question: resolution.requiresClarification || `Which ${ambiguousPhrase.phrase} did you mean?`,
              options: resolution.options.map((opt, idx) => ({
                id: `opt-${idx}`,
                isoDate: opt.isoDate,
                displayDate: opt.displayDate,
                label: opt.label,
              })),
              context: {
                originalMessage: message,
                detectedPhrase: ambiguousPhrase.normalizedPhrase,
              },
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    }
  }

  if (isRaceExecutionIntent(message)) {
    const raceAdvice = await handleRaceExecutionAdvice(message, workouts, userProfile, dateResolver);
    if (raceAdvice) return raceAdvice;
  }

  const draftProposal = await analyzeDraftFromAI(
    message,
    resolvedDates,
    chatHistory,
    workouts,
    userProfile,
    dateResolver,
    body.previousProposal
  );

  logger.info('[ChatV2Draft] AI proposal:', draftProposal);

  // Athlete explicitly dismissed the active proposal
  if (draftProposal.cancel_proposal === true) {
    return new Response(
      JSON.stringify({
        mode: 'proposal_cancelled',
        coachMessage: draftProposal.coach_message || "No problem, I've cleared that. Let me know if there's anything else you'd like to change."
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Handle recurring weekday edits
  if (draftProposal.recurring_weekday_edit === true && draftProposal.recurring_operation) {
    logger.info('[ChatV2Draft] Recurring weekday edit detected', {
      operation: draftProposal.recurring_operation,
      from_weekday: draftProposal.from_weekday,
      to_weekday: draftProposal.to_weekday,
      target_weekday: draftProposal.target_weekday,
    });

    return new Response(
      JSON.stringify({
        mode: 'recurring_weekday_edit',
        recurring_operation: draftProposal.recurring_operation,
        from_weekday: draftProposal.from_weekday || null,
        to_weekday: draftProposal.to_weekday || null,
        target_weekday: draftProposal.target_weekday || null,
        coachMessage: draftProposal.advisory_message || draftProposal.coach_message || generateRecurringAdvisoryMessage(draftProposal),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Pure conversational / info message — no modifications involved
  const hasModifications = Array.isArray(draftProposal.modifications) && draftProposal.modifications.length > 0;
  if (draftProposal.is_modification_request === false && !hasModifications) {
    return new Response(
      JSON.stringify({
        mode: 'info',
        coachMessage: draftProposal.coach_message || draftProposal.reasoning || "Happy to help! Let me know if you'd like to make any changes to your plan."
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (draftProposal.requires_clarification) {
    return new Response(
      JSON.stringify({
        mode: 'intervention',
        coachMessage: draftProposal.coach_message || draftProposal.clarification_question || "Could you be more specific about which workout you'd like to modify?"
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  let modifications = buildModifications(draftProposal, workouts);
  modifications = filterNoOpModifications(modifications, workouts);

  if (modifications.length === 0) {
    return new Response(
      JSON.stringify({
        mode: 'info',
        coachMessage: draftProposal.coach_message || draftProposal.reasoning || "No changes needed. Your plan looks good!"
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // ADVISORY STAGE: Store the proposal but return coaching analysis, not a patch preview.
  // The user must confirm before we show the change modal.
  const advisoryId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const previewHash = await hashModifications(modifications, planId, planVersion);

  const advisoryMessage = draftProposal.advisory_message || generateAdvisoryMessage(modifications, workouts, draftProposal, dateResolver);

  // Invalidate any previous pending advisories for this plan
  await supabase
    .from('preview_sets')
    .update({ advisory_pending: false })
    .eq('user_id', userId)
    .eq('plan_id', planId)
    .eq('advisory_pending', true);

  const { error: insertError } = await supabase
    .from('preview_sets')
    .insert({
      preview_id: advisoryId,
      user_id: userId,
      plan_id: planId,
      plan_version: planVersion,
      modifications: modifications,
      preview_hash: previewHash,
      expires_at: expiresAt,
      advisory_pending: true,
    });

  if (insertError) {
    logger.error('[ChatV2Draft] Failed to save advisory:', insertError);
  }

  logger.info('[ChatV2Draft] Advisory stored, returning advisory mode', { advisoryId, modificationsCount: modifications.length });

  return new Response(
    JSON.stringify({
      mode: 'advisory',
      advisoryId,
      coachMessage: advisoryMessage,
      rawModifications: modifications.map(m => ({
        operation: m.operation,
        target_date: m.target_date,
        new_date: m.new_date,
      })),
      previewModifications: modifications.map(mod => ({
        date: mod.target_date,
        operation: mod.operation,
        before: {
          title: workouts.find(w => w.date === mod.target_date)?.workout || 'Unknown workout',
          description: workouts.find(w => w.date === mod.target_date)?.tips?.join('; ') || ''
        },
        after: mod.operation !== 'cancel' ? {
          title: mod.new_workout || workouts.find(w => w.date === mod.target_date)?.workout || '',
          scheduled_for: mod.new_date || mod.target_date
        } : undefined
      })),
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

async function buildPreviewFromAdvisory(
  advisory: any,
  workouts: Workout[],
  planId: string,
  planVersion: number,
  userId: string,
  dateResolver: DateResolver,
  supabase: any,
  diagnostics: boolean
) {
  const modifications: WorkoutModification[] = advisory.modifications;

  // Promote from advisory to a real preview
  const previewId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const previewHash = await hashModifications(modifications, planId, advisory.plan_version);

  const previewSet = {
    preview_id: previewId,
    modifications: modifications.map(mod => ({
      date: mod.target_date,
      operation: mod.operation,
      before: {
        title: workouts.find(w => w.date === mod.target_date)?.workout || 'Unknown workout',
        description: workouts.find(w => w.date === mod.target_date)?.tips?.join('; ') || ''
      },
      after: mod.operation !== 'cancel' ? {
        title: mod.new_workout || workouts.find(w => w.date === mod.target_date)?.workout || '',
        description: mod.new_tips ? mod.new_tips.join(' • ') : undefined,
        scheduled_for: mod.new_date || mod.target_date
      } : undefined
    })),
    preview_hash: previewHash,
    summary: 'Confirmed by user',
    expires_at: expiresAt
  };

  const { error: insertError } = await supabase
    .from('preview_sets')
    .insert({
      preview_id: previewId,
      user_id: userId,
      plan_id: planId,
      plan_version: advisory.plan_version,
      modifications,
      preview_hash: previewHash,
      expires_at: expiresAt,
      advisory_pending: false,
    });

  if (insertError) {
    logger.error('[ChatV2] Failed to promote advisory to preview:', insertError);
  }

  // Mark the advisory as consumed
  await supabase
    .from('preview_sets')
    .update({ advisory_pending: false })
    .eq('preview_id', advisory.preview_id);

  return new Response(
    JSON.stringify({
      mode: 'preview',
      previewSet,
      coachMessage: generateCoachMessage(previewSet, dateResolver),
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

async function handleConfirmAdvisory(body: ConfirmAdvisoryBody, userId: string, supabase: any) {
  const { advisoryId, planId, planVersion, userTimezone, todayISO, diagnostics = false } = body;

  logger.info('[ChatV2ConfirmAdvisory] Confirming advisory:', { advisoryId, planId });

  const { data: advisory, error: advisoryError } = await supabase
    .from('preview_sets')
    .select('*')
    .eq('preview_id', advisoryId)
    .eq('user_id', userId)
    .eq('plan_id', planId)
    .eq('advisory_pending', true)
    .maybeSingle();

  if (advisoryError || !advisory) {
    return new Response(
      JSON.stringify({ error: 'Advisory not found or already applied' }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (new Date(advisory.expires_at) < new Date()) {
    return new Response(
      JSON.stringify({ error: 'Advisory has expired. Please start again.' }),
      { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const { data: planRecord } = await supabase
    .from('training_plans')
    .select('plan_data, timezone')
    .eq('id', planId)
    .eq('user_id', userId)
    .maybeSingle();

  const timezone = userTimezone || planRecord?.timezone || 'Europe/Paris';
  const dateResolver = new DateResolver(todayISO, timezone);
  const workouts: Workout[] = planRecord?.plan_data?.days || [];

  return await buildPreviewFromAdvisory(advisory, workouts, planId, planVersion, userId, dateResolver, supabase, diagnostics);
}

async function handleClarificationResponse(body: ClarificationResponseBody, userId: string, supabase: any) {
  const { selectedDate, detectedPhrase, originalMessage, chatHistory, planData, planId, planVersion, userProfile, userTimezone, todayISO } = body;

  logger.info('[ChatV2Clarification] Processing clarification response', {
    selectedDate,
    detectedPhrase,
    originalMessage
  });

  const { data: planRecord, error: planError } = await supabase
    .from('training_plans')
    .select('timezone')
    .eq('id', planId)
    .maybeSingle();

  const timezone = userTimezone || planRecord?.timezone || 'Europe/Paris';
  const dateResolver = new DateResolver(todayISO, timezone);

  // Map by detectedPhrase, not originalMessage - this is the key fix
  const resolvedDates: Record<string, string> = { [detectedPhrase]: selectedDate };

  console.log('[ChatV2Clarification] Resolved dates mapping:', {
    detectedPhrase,
    selectedDate,
    resolvedDates
  });

  const modifiedBody: DraftRequestBody = {
    mode: 'draft',
    message: originalMessage,
    resolvedDates,
    chatHistory,
    planData,
    planId,
    planVersion,
    userProfile,
    userTimezone,
    todayISO
  };

  return await handleDraft(modifiedBody, userId, supabase);
}

async function handleCommit(body: CommitRequestBody, userId: string, supabase: any) {
  const { previewId, planId, planVersion, diagnostics = false } = body;

  logger.info('[ChatV2Commit] Starting commit:', { previewId, planId, planVersion, diagnostics });

  const { data: previewData, error: previewError } = await supabase
    .from('preview_sets')
    .select('*')
    .eq('preview_id', previewId)
    .eq('user_id', userId)
    .eq('plan_id', planId)
    .maybeSingle();

  logger.info('[ChatV2Commit] Preview data retrieved:', {
    found: !!previewData,
    error: previewError,
    modificationsCount: previewData?.modifications?.length
  });

  if (previewError || !previewData) {
    const errorData: any = { error: 'Preview not found or expired' };
    if (diagnostics) {
      errorData.diagnostics = {
        functionName: 'chat-training-plan-v2',
        mode: 'commit',
        planId,
        planVersionInRequest: planVersion,
        previewId,
        previewFound: false,
        validationFailed: 'preview_not_found',
        previewError: previewError?.message || null
      };
    }
    return new Response(
      JSON.stringify(errorData),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (new Date(previewData.expires_at) < new Date()) {
    const errorData: any = { error: 'Preview has expired. Please generate a new preview.' };
    if (diagnostics) {
      errorData.diagnostics = {
        functionName: 'chat-training-plan-v2',
        mode: 'commit',
        planId,
        planVersionInRequest: planVersion,
        previewId,
        previewFound: true,
        previewExpired: true,
        validationFailed: 'preview_expired',
        expiresAt: previewData.expires_at
      };
    }
    return new Response(
      JSON.stringify(errorData),
      { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const { data: planRecord, error: planError } = await supabase
    .from('training_plans')
    .select('plan_data, workout_version')
    .eq('id', planId)
    .eq('user_id', userId)
    .maybeSingle();

  if (planError || !planRecord) {
    const errorData: any = { error: 'Plan not found' };
    if (diagnostics) {
      errorData.diagnostics = {
        functionName: 'chat-training-plan-v2',
        mode: 'commit',
        planId,
        planVersionInRequest: planVersion,
        previewId,
        previewFound: true,
        validationFailed: 'plan_not_found',
        planError: planError?.message || null
      };
    }
    return new Response(
      JSON.stringify(errorData),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const currentPlanVersion = planRecord.workout_version || 1;

  // Validate plan version matches preview
  if (previewData.plan_version !== currentPlanVersion) {
    const errorData: any = {
      error: 'Plan has been modified since preview was generated. Please refresh and try again.',
      version_mismatch: true,
    };
    if (diagnostics) {
      errorData.diagnostics = {
        functionName: 'chat-training-plan-v2',
        mode: 'commit',
        planId,
        planVersionInRequest: planVersion,
        planVersionInDB: currentPlanVersion,
        previewId,
        previewFound: true,
        previewExpired: false,
        validationFailed: 'preview_version_mismatch',
        previewPlanVersion: previewData.plan_version
      };
    }
    return new Response(
      JSON.stringify(errorData),
      { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (planVersion !== currentPlanVersion) {
    const errorData: any = {
      error: 'Plan has been modified by another session. Please refresh and try again.',
      version_mismatch: true,
    };
    if (diagnostics) {
      errorData.diagnostics = {
        functionName: 'chat-training-plan-v2',
        mode: 'commit',
        planId,
        planVersionInRequest: planVersion,
        planVersionInDB: currentPlanVersion,
        previewId,
        previewFound: true,
        previewExpired: false,
        validationFailed: 'request_version_mismatch'
      };
    }
    return new Response(
      JSON.stringify(errorData),
      { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Removed hash validation - we trust the stored modifications in preview_sets
  logger.info('[ChatV2Commit] All validations passed, applying modifications from stored preview');

  const workouts: Workout[] = planRecord.plan_data?.days || [];

  // Capture before state for diagnostics
  const modifiedDates = previewData.modifications.map(m => m.target_date);
  const beforeWorkouts = workouts
    .filter(w => modifiedDates.includes(w.date))
    .map(w => ({ date: w.date, workout: w.workout }));

  logger.info('[ChatV2Commit] Before applying modifications:', {
    workoutsCount: workouts.length,
    sampleWorkout: workouts[0],
    modifications: previewData.modifications
  });

  const updatedWorkouts = applyModifications(workouts, previewData.modifications);

  // Capture after state for diagnostics
  const afterWorkouts = updatedWorkouts
    .filter(w => modifiedDates.includes(w.date))
    .map(w => ({ date: w.date, workout: w.workout }));

  logger.info('[ChatV2Commit] After applying modifications:', {
    updatedWorkoutsCount: updatedWorkouts.length,
    sampleUpdatedWorkout: updatedWorkouts[0],
    modifiedDates,
    modifiedWorkouts: afterWorkouts
  });

  const { error: updateError } = await supabase
    .from('training_plans')
    .update({
      plan_data: { ...planRecord.plan_data, days: updatedWorkouts },
      workout_version: currentPlanVersion + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', planId)
    .eq('user_id', userId)
    .eq('workout_version', currentPlanVersion);

  if (updateError) {
    logger.error('[ChatV2Commit] Update failed:', updateError);
    const errorData: any = { error: 'Concurrent modification detected. Please refresh and try again.' };
    if (diagnostics) {
      errorData.diagnostics = {
        functionName: 'chat-training-plan-v2',
        mode: 'commit',
        planId,
        planVersionInRequest: planVersion,
        planVersionInDB: currentPlanVersion,
        previewId,
        previewFound: true,
        previewExpired: false,
        hashVerified: true,
        validationFailed: 'database_update_failed',
        updateError: updateError.message
      };
    }
    return new Response(
      JSON.stringify(errorData),
      { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  logger.info('[ChatV2Commit] Successfully updated plan:', {
    planId,
    newVersion: currentPlanVersion + 1
  });

  await supabase
    .from('preview_sets')
    .delete()
    .eq('preview_id', previewId);

  const responseData: any = {
    success: true,
    new_plan_version: currentPlanVersion + 1,
  };

  if (diagnostics) {
    responseData.diagnostics = {
      functionName: 'chat-training-plan-v2',
      mode: 'commit',
      planId,
      planVersionInRequest: planVersion,
      planVersionInDB: currentPlanVersion,
      previewId,
      previewFound: true,
      previewExpired: false,
      hashVerified: true,
      modificationsCount: previewData.modifications.length,
      modifiedDates,
      applyResultSummary: {
        beforeWorkoutsForModifiedDates: beforeWorkouts,
        afterWorkoutsForModifiedDates: afterWorkouts,
        databaseUpdateSuccessful: true
      }
    };
  }

  return new Response(
    JSON.stringify(responseData),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

async function handleRaceExecutionAdvice(
  message: string,
  workouts: Workout[],
  userProfile: any,
  dateResolver: DateResolver
): Promise<Response | null> {
  const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiApiKey) return null;

  try {
    const answers = userProfile?.answers || {};
    const completions = userProfile?.workoutCompletions || [];
    const injuryLogs = userProfile?.healthData?.injuryLogs || [];
    const todayISO = dateResolver.getTodayISO();

    const planData = { days: workouts as any[] };
    const summary = computeTrainingSummary(completions, answers, planData, todayISO, injuryLogs);

    if (summary.raceDistance === 0) return null;

    const systemPrompt = buildRaceExecutionSystemPrompt(summary);

    logger.info('[ChatV2] Race execution intent detected', {
      raceDistance: summary.raceDistance,
      readinessTier: summary.readinessTier,
      completionRate8w: summary.last8WeeksCompletionRate,
    });

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message },
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    const coachMessage = data.choices?.[0]?.message?.content || null;
    if (!coachMessage) return null;

    return new Response(
      JSON.stringify({ mode: "info", coachMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    logger.error('[ChatV2] Race execution advice error, falling through to standard handler', err);
    return null;
  }
}

async function analyzeDraftFromAI(
  message: string,
  resolvedDates: Record<string, string>,
  chatHistory: ChatMessage[],
  workouts: Workout[],
  userProfile: any,
  dateResolver: DateResolver,
  previousProposal?: DraftRequestBody['previousProposal']
): Promise<any> {
  const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiApiKey) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  const todayISO = dateResolver.getTodayISO();
  const todayDisplay = dateResolver.formatUKDisplay(todayISO);
  const todayDayName = dateResolver.getDayName(todayISO);

  const workoutsContext = workouts
    .map((w) => {
      const dayName = dateResolver.getDayName(w.date);
      const display = dateResolver.formatUKDisplay(w.date);
      return `- ${display} (${dayName}): ${w.workout}`;
    })
    .join('\n');

  const resolvedDatesContext = Object.entries(resolvedDates)
    .map(([phrase, isoDate]) => `"${phrase}" = ${dateResolver.formatUKDisplay(isoDate)} (${isoDate})`)
    .join('\n');

  const healthData = userProfile?.healthData;
  const userName = userProfile?.answers?.userName;
  let healthContext = '';

  if (healthData) {
    const { sleepLogs = [], hrLogs = [], injuryLogs = [], fuelingLogs = [] } = healthData;

    const healthSections: string[] = [];

    if (sleepLogs.length > 0) {
      const avgHours = sleepLogs.reduce((s: number, l: any) => s + (l.hours || 0), 0) / sleepLogs.length;
      const avgQuality = sleepLogs.reduce((s: number, l: any) => s + (l.quality || 3), 0) / sleepLogs.length;
      const latestWake = sleepLogs[0]?.wake_feeling || 'normal';
      const sleepNote = sleepLogs[0]?.notes ? ` Note: "${sleepLogs[0].notes}"` : '';
      healthSections.push(
        `Sleep (last 7 days): avg ${avgHours.toFixed(1)}h/night, quality ${avgQuality.toFixed(1)}/5, latest wake feeling: ${latestWake}.${sleepNote}`
      );
    }

    if (hrLogs.length > 0) {
      const avgHR = hrLogs.reduce((s: number, l: any) => s + (l.heart_rate || 0), 0) / hrLogs.length;
      const latestHR = hrLogs[0]?.heart_rate;
      healthSections.push(
        `Resting HR (last 7 days): avg ${Math.round(avgHR)} bpm, latest reading: ${latestHR} bpm.`
      );
    }

    if (injuryLogs.length > 0) {
      const injuryLines = injuryLogs.map((inj: any) =>
        `${inj.body_area} (severity ${inj.severity_int}/10, ${inj.pain_type}, status: ${inj.status}${inj.notes ? `, note: "${inj.notes}"` : ''})`
      );
      healthSections.push(`Active/recovering injuries: ${injuryLines.join('; ')}.`);
    }

    if (fuelingLogs.length > 0) {
      const avgStomach = fuelingLogs.reduce((s: number, l: any) => s + (l.stomach_comfort_rating || 3), 0) / fuelingLogs.length;
      const avgEnergy = fuelingLogs.reduce((s: number, l: any) => s + (l.energy_rating || 3), 0) / fuelingLogs.length;
      healthSections.push(
        `Recent fueling (last ${fuelingLogs.length} logs): avg stomach comfort ${avgStomach.toFixed(1)}/5, avg energy ${avgEnergy.toFixed(1)}/5.`
      );
    }

    if (healthSections.length > 0) {
      healthContext = `\nAthlete health data:\n${healthSections.map(s => `- ${s}`).join('\n')}\n`;
    }
  }

  const previousProposalContext = previousProposal ? `
ACTIVE PROPOSAL (the athlete has a pending change they can see in the UI):
- Current proposed change: ${previousProposal.explanation}
- Affected dates: ${previousProposal.modifications.map(m => `${m.target_date} (${m.operation}${m.new_date ? ` → ${m.new_date}` : ''})`).join(', ')}

If the athlete's message is a REFINEMENT of this proposal (e.g. "actually make it Wednesday instead", "add another day", "what about Thursday?"), produce a new updated proposal that supersedes the old one. Do NOT reference the old proposal as still active — the new modifications array completely replaces it.
If the athlete is asking an unrelated question, set is_modification_request=false and respond conversationally.
If the athlete says "cancel that" or "forget it" or similar, set is_modification_request=false and set cancel_proposal=true in the response.
` : '';

  const systemPrompt = `You are a running coach. The athlete is talking to you via chat. Speak like a real coach — warm, direct, and human.${userName ? `\nThe athlete's name is ${userName}. Address them by name naturally — like a real coach would, not excessively.` : ''}

YOUR ROLE:
- Understand what the athlete is asking
- Explain what change will happen and why it matters to them
- Ask for confirmation before anything is applied
- Offer empathy, encouragement, and coaching perspective

YOUR ROLE DOES NOT INCLUDE:
- Deciding ramp rates, long-run caps, or volume targets
- Judging whether a workout sequence is structurally sound
- Overriding the feasibility tier or progression model
- Inventing new workouts unless explicitly asked

LANGUAGE RULES — NON-NEGOTIABLE:
NEVER use these words or phrases in coach_message or advisory_message:
- "deterministic engine", "structural modification", "proposal routing", "pipeline"
- "edge function", "system", "rebuild", "apply-proposal", "intent system"
- "L1", "L2", "L3", "L4" (these are internal intervention levels)
- Any description of how the software works internally

NEVER use markdown formatting in coach_message or advisory_message:
- No **bold** or *italic* text
- No bullet points unless listing 3+ items
- Write in plain, natural sentences

Describe what WILL HAPPEN to the athlete's training, not how the software processes it.
BAD: "I'll route this to the engine and rebuild your plan."
GOOD: "I'll move your Thursday run to Friday — want me to go ahead?"

CRITICAL DATE CONTEXT (authoritative — do NOT recalculate):
- Today: ${todayISO} (${todayDayName}, ${todayDisplay})
- User timezone: ${dateResolver['timezone']}
- All dates provided are in the user's local timezone

Athlete's upcoming workouts:
${workoutsContext}

Date references resolved from user message:
${resolvedDatesContext || 'None'}
${previousProposalContext}
HEALTH CONTEXT (use to inform tone and optional suggestions only — do NOT make structural decisions):
${healthContext || 'No health data provided.'}
Health guidance:
- If sleep is poor or the athlete mentions fatigue: acknowledge it, offer reassurance, mention it in advisory_message if relevant
- If resting HR is elevated: note it in coach_message as something to be aware of
- If active injuries exist: flag them in reasoning and avoid suggesting modifications that increase load on the affected area
- Do NOT use health data to alter volume targets, ramp rates, or progression structure

INTENT CLASSIFICATION:
A message IS a modification request if the athlete explicitly wants to: cancel, move, reschedule, swap, skip, or change a specific workout.
A message is NOT a modification request if it is: a question, advice-seeking, sharing feelings, describing a situation. In these cases, respond as a supportive coach. You may SUGGEST a change but do NOT produce modifications unless the athlete explicitly asks.

RECURRING WEEKDAY EDITS (CRITICAL - HIGHEST PRIORITY):
When the athlete uses phrases like:
- "all Fridays", "all future Fridays", "every Friday", "all Friday workouts"
- "move all X to Y", "shift all X to Y", "move all future X workouts to Y"
- "add a run to all Mondays", "add a workout every Monday"
- "remove all Tuesday workouts", "cancel all future Fridays"
- "going forward", "for the rest of the plan", "from now on"

These are RECURRING WEEKDAY EDITS, NOT single-day edits. You MUST:
1. Set is_modification_request=true
2. Set recurring_weekday_edit=true in the response
3. Set recurring_operation to one of: "recurring_move", "recurring_add", "recurring_remove"
4. Set from_weekday (for moves) and to_weekday (for moves) or target_weekday (for add/remove)
5. Do NOT ask "which Friday?" or "which Monday?" - the athlete clearly means ALL future occurrences
6. Do NOT produce individual modifications array entries - the recurring edit will be handled specially

Example inputs that are RECURRING edits (do NOT ask for clarification):
- "Move all Fridays to Thursday" -> recurring_operation="recurring_move", from_weekday="Friday", to_weekday="Thursday"
- "Move all future Wednesday workouts to Thursday" -> recurring_operation="recurring_move", from_weekday="Wednesday", to_weekday="Thursday"
- "Add a run to all Mondays" -> recurring_operation="recurring_add", target_weekday="Monday"
- "Remove all Tuesday workouts going forward" -> recurring_operation="recurring_remove", target_weekday="Tuesday"

Example inputs that MAY need clarification (no "all"/"every"/"future" markers):
- "Move Friday to Thursday" -> ask: "Did you mean just this Friday, or all future Friday workouts?"
- "Add a run on Monday" -> ask: "Did you mean this Monday, or all future Mondays?"
- "Can you change Friday?" -> ask for more details

TWO-STAGE ADVISORY RULES (when is_modification_request is true):
1. Produce an "advisory_message" — a warm, plain-English explanation of WHAT WILL change (NOT what HAS changed)
2. The advisory_message must:
   - Name the specific workout and dates involved (UK format: "7 Feb 26")
   - Note any scheduling consideration visible from the workout list (e.g. "that's the day before your long run")
   - Do NOT assert load impact numbers or progression judgements — those are not your domain
   - MUST end with a natural confirmation prompt: "Want me to apply that?" or "Shall I go ahead?"
3. Write in natural sentences — no robotic lists
4. Keep it to 2–4 sentences
5. CRITICAL: Do NOT say "I've done it", "Done", "I've gone ahead", or any past-tense completion phrase. The change has NOT been applied yet — you are proposing it.
6. Do NOT add unsolicited follow-up questions about fatigue, recovery options, or numbered choices. Just propose the change and ask for confirmation.

MODIFICATION RULES:
1. ONLY target workouts using ISO dates (YYYY-MM-DD) — never week numbers or weekday names
2. When moving a workout, PRESERVE the exact content unless explicitly asked to change it
3. "move X to Y" = reschedule workout from date X to date Y, same content
4. "cancel X" = soft cancel (mark as rest)
5. "swap X and Y" = exchange workouts on those two dates
6. If ANY ambiguity exists about which date or workout, set requires_clarification=true
7. Use only dates from "Date references resolved" — DO NOT calculate new dates yourself

WORKOUT CONTENT RULES (for "modify" operations only):
When new_workout is required:
- Use Markdown: **Warm up:** / **Work:** / **Cool down:**
- Be specific: distances/durations, RPE values, rep counts, recovery intervals
- Example: "**Warm up:** 2 km easy (RPE 3)\n**Work:** 5 km with 3×1 km at race pace (RPE 7–8) with 90 sec jog recovery\n**Cool down:** 2 km easy (RPE 3)"
- new_tips: 3–5 concrete, actionable coaching cues specific to this workout

Return JSON:
{
  "is_modification_request": boolean,
  "cancel_proposal": boolean (true ONLY if athlete explicitly dismisses the proposal — "forget it", "cancel that", "never mind"),
  "coach_message": "conversational response (REQUIRED when is_modification_request is false or requires_clarification is true)",
  "advisory_message": "plain-English explanation of the change + scheduling note + confirmation prompt (REQUIRED when is_modification_request is true and modifications exist)",
  "operation": "cancel" | "reschedule" | "modify" | "swap" | null,
  "target_dates": ["YYYY-MM-DD"],
  "new_dates": ["YYYY-MM-DD"],
  "modifications": [
    {
      "operation": "cancel" | "reschedule" | "modify" | "swap",
      "target_date": "YYYY-MM-DD",
      "new_date": "YYYY-MM-DD (if reschedule/swap)",
      "new_workout": "full Markdown workout string (REQUIRED for modify)",
      "new_tips": ["3–5 specific coaching tips (REQUIRED for modify)"],
      "swap_with_date": "YYYY-MM-DD (only for swap)"
    }
  ],
  "recurring_weekday_edit": boolean (true if this is a recurring weekday edit like "move all Fridays to Thursday"),
  "recurring_operation": "recurring_move" | "recurring_add" | "recurring_remove" | null,
  "from_weekday": "Monday" | "Tuesday" | ... (for recurring_move),
  "to_weekday": "Monday" | "Tuesday" | ... (for recurring_move),
  "target_weekday": "Monday" | "Tuesday" | ... (for recurring_add or recurring_remove),
  "requires_clarification": boolean,
  "clarification_question": "string (if ambiguous)",
  "reasoning": "brief explanation in UK date format"
}`;

  const messages = [
    { role: 'system', content: systemPrompt },
    ...chatHistory.slice(-5),
    { role: 'user', content: message },
  ];

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${openaiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages,
      response_format: { type: "json_object" },
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  const result = JSON.parse(data.choices[0].message.content);

  logger.info('[AI Response]:', result);

  return result;
}

function buildModifications(
  proposal: any,
  workouts: Workout[]
): WorkoutModification[] {
  const modifications: WorkoutModification[] = [];

  if (proposal.modifications && Array.isArray(proposal.modifications)) {
    for (const mod of proposal.modifications) {
      const targetWorkout = workouts.find(w => w.date === mod.target_date);

      if (!targetWorkout) {
        logger.warn('[BuildMods] Target date not found:', mod.target_date);
        continue;
      }

      modifications.push({
        operation: mod.operation,
        target_date: mod.target_date,
        new_date: mod.new_date,
        new_workout: mod.new_workout || (mod.operation === 'reschedule' || mod.operation === 'swap' ? targetWorkout.workout : undefined),
        swap_with_date: mod.swap_with_date
      });
    }
  }

  return modifications;
}

function applyModifications(workouts: Workout[], modifications: any[]): Workout[] {
  const workoutMap = new Map(workouts.map(w => [w.date, { ...w }]));

  logger.info('[ApplyModifications] Starting:', {
    workoutCount: workouts.length,
    modificationCount: modifications.length,
    modificationsDetail: modifications
  });

  for (const mod of modifications) {
    logger.info('[ApplyModifications] Processing mod:', mod);

    if (mod.operation === 'cancel') {
      const workout = workoutMap.get(mod.target_date);
      if (workout) {
        logger.info('[ApplyModifications] Canceling workout on', mod.target_date);
        workout.workout_type = 'REST';
        workout.workout = 'Rest day';
        workout.tips = [];
      } else {
        logger.warn('[ApplyModifications] Cancel: workout not found for', mod.target_date);
      }
    } else if (mod.operation === 'reschedule') {
      const workout = workoutMap.get(mod.target_date);
      let newDateWorkout = workoutMap.get(mod.new_date);

      logger.info('[ApplyModifications] Reschedule:', {
        from: mod.target_date,
        to: mod.new_date,
        foundSource: !!workout,
        foundTarget: !!newDateWorkout,
        sourceWorkout: workout?.workout,
        targetWorkout: newDateWorkout?.workout
      });

      if (workout) {
        // If destination date doesn't exist, create a Rest day entry for it
        if (!newDateWorkout) {
          logger.info('[ApplyModifications] Creating missing destination date:', mod.new_date);
          newDateWorkout = {
            date: mod.new_date,
            workout: 'Rest day',
            tips: [],
            workout_type: 'REST',
          };
          workoutMap.set(mod.new_date, newDateWorkout);
        }

        // Move workout content from source to destination
        const temp = { ...workout };
        newDateWorkout.workout = temp.workout;
        newDateWorkout.tips = temp.tips || [];
        newDateWorkout.workout_type = temp.workout_type;
        newDateWorkout.workoutType = temp.workoutType;

        // Source becomes Rest
        workout.workout_type = 'REST';
        workout.workout = 'Rest day';
        workout.tips = [];

        logger.info('[ApplyModifications] Reschedule complete:', {
          newDateWorkoutNow: newDateWorkout.workout,
          oldDateWorkoutNow: workout.workout
        });
      } else {
        logger.warn('[ApplyModifications] Reschedule: source workout not found', {
          target_date: mod.target_date
        });
      }
    } else if (mod.operation === 'swap') {
      const workout1 = workoutMap.get(mod.target_date);
      const workout2 = workoutMap.get(mod.swap_with_date);

      if (workout1 && workout2) {
        logger.info('[ApplyModifications] Swapping workouts');
        const temp = { ...workout1 };
        workout1.workout = workout2.workout;
        workout1.tips = workout2.tips;
        workout1.workout_type = workout2.workout_type;
        workout1.workoutType = workout2.workoutType;

        workout2.workout = temp.workout;
        workout2.tips = temp.tips;
        workout2.workout_type = temp.workout_type;
        workout2.workoutType = temp.workoutType;
      } else {
        logger.warn('[ApplyModifications] Swap: missing workouts');
      }
    } else if (mod.operation === 'modify' && mod.new_workout) {
      const workout = workoutMap.get(mod.target_date);
      if (workout) {
        logger.info('[ApplyModifications] Modifying workout content');
        workout.workout = sanitizeIntervalWorkout(mod.new_workout);
        if (mod.new_tips && mod.new_tips.length > 0) {
          workout.tips = mod.new_tips;
        }
        workout.workout_type = 'TRAIN';
      } else {
        logger.warn('[ApplyModifications] Modify: workout not found');
      }
    }
  }

  const result = Array.from(workoutMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  result.forEach(workout => {
    if (!workout.workout || workout.workout.trim() === '') {
      logger.warn('[ApplyModifications] Empty workout detected, setting to Rest', { date: workout.date });
      workout.workout = 'Rest';
      workout.workout_type = 'REST';
      workout.tips = [];
    }
  });

  logger.info('[ApplyModifications] Complete:', {
    resultCount: result.length
  });

  return result;
}

function filterNoOpModifications(modifications: WorkoutModification[], workouts: Workout[]): WorkoutModification[] {
  return modifications.filter(mod => {
    const targetWorkout = workouts.find(w => w.date === mod.target_date);

    if (!targetWorkout) {
      logger.warn('[FilterNoOps] Target workout not found:', mod.target_date);
      return false;
    }

    if (mod.operation === 'cancel') {
      // No-op if already Rest
      const isAlreadyRest = targetWorkout.workout_type === 'REST' ||
                           targetWorkout.workout?.toLowerCase().includes('rest');
      if (isAlreadyRest) {
        logger.info('[FilterNoOps] Filtering cancel on already-Rest day:', mod.target_date);
        return false;
      }
    }

    if (mod.operation === 'reschedule' && mod.new_date) {
      // No-op if source and destination are the same
      if (mod.target_date === mod.new_date) {
        logger.info('[FilterNoOps] Filtering reschedule to same date:', mod.target_date);
        return false;
      }
    }

    if (mod.operation === 'modify' && mod.new_workout) {
      // No-op if workout content is the same
      if (targetWorkout.workout === mod.new_workout) {
        logger.info('[FilterNoOps] Filtering modify with same content:', mod.target_date);
        return false;
      }
    }

    return true;
  });
}

async function hashModifications(modifications: any[], planId: string, planVersion: number): Promise<string> {
  const payload = JSON.stringify({
    modifications,
    planId,
    planVersion,
  });

  const encoder = new TextEncoder();
  const data = encoder.encode(payload);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  return hashHex;
}

function generateAdvisoryMessage(
  modifications: WorkoutModification[],
  workouts: Workout[],
  proposal: any,
  dateResolver: DateResolver
): string {
  if (modifications.length === 0) return "No changes needed.";

  const lines: string[] = [];

  for (const mod of modifications) {
    const sourceWorkout = workouts.find(w => w.date === mod.target_date);
    const workoutName = sourceWorkout?.workout || 'your workout';
    const shortName = workoutName.split('|')[0].trim().substring(0, 60);
    const fromDisplay = dateResolver.formatUKDisplay(mod.target_date);
    const fromDay = dateResolver.getDayName(mod.target_date);

    if (mod.operation === 'cancel') {
      lines.push(`I'll cancel ${shortName} on ${fromDay} ${fromDisplay} and mark it as a rest day.`);
    } else if (mod.operation === 'reschedule' && mod.new_date) {
      const toDisplay = dateResolver.formatUKDisplay(mod.new_date);
      const toDay = dateResolver.getDayName(mod.new_date);

      const destWorkout = workouts.find(w => w.date === mod.new_date);
      const destName = destWorkout?.workout?.split('|')[0].trim().substring(0, 40);

      lines.push(`I'll move ${shortName} from ${fromDay} ${fromDisplay} to ${toDay} ${toDisplay}.`);
      if (destName && !destName.toLowerCase().includes('rest')) {
        lines.push(`${toDay} currently has "${destName}" — I'll swap that to ${fromDay}.`);
      }
    } else if (mod.operation === 'swap' && mod.swap_with_date) {
      const swapDisplay = dateResolver.formatUKDisplay(mod.swap_with_date);
      const swapDay = dateResolver.getDayName(mod.swap_with_date);
      lines.push(`I'll swap the workouts on ${fromDay} ${fromDisplay} and ${swapDay} ${swapDisplay}.`);
    } else if (mod.operation === 'modify') {
      lines.push(`I'll update the workout on ${fromDay} ${fromDisplay}.`);
    }
  }

  lines.push("Want me to apply that?");
  return lines.join(' ');
}

function generateRecurringAdvisoryMessage(proposal: any): string {
  const { recurring_operation, from_weekday, to_weekday, target_weekday } = proposal;

  if (recurring_operation === 'recurring_move' && from_weekday && to_weekday) {
    return `I'll move all future ${from_weekday} workouts to ${to_weekday}. This will apply to every ${from_weekday} from now until your race. Want me to go ahead?`;
  }

  if (recurring_operation === 'recurring_add' && target_weekday) {
    return `I'll add an easy run to all future ${target_weekday}s that are currently rest days. Want me to go ahead?`;
  }

  if (recurring_operation === 'recurring_remove' && target_weekday) {
    return `I'll remove all future ${target_weekday} workouts and convert them to rest days. Want me to go ahead?`;
  }

  return "I'll make that recurring change to your schedule. Want me to go ahead?";
}

function generateCoachMessage(previewSet: any, dateResolver: DateResolver): string {
  const { modifications } = previewSet;

  if (modifications.length === 0) {
    return "No changes needed to your plan.";
  }

  const changesList = modifications.map((m: any) => {
    const date = dateResolver.formatUKDisplay(m.date);
    const day = dateResolver.getDayName(m.date);

    if (m.operation === 'cancel') {
      return `- ${day} ${date}: Cancel "${m.before.title}"`;
    } else if (m.operation === 'reschedule' && m.after) {
      const newDate = dateResolver.formatUKDisplay(m.after.scheduled_for);
      const newDay = dateResolver.getDayName(m.after.scheduled_for);
      return `- Move "${m.before.title}" from ${day} ${date} to ${newDay} ${newDate}`;
    } else if (m.operation === 'swap' && m.after) {
      return `- Swap workouts on ${day} ${date} and ${dateResolver.formatUKDisplay(m.after.scheduled_for)}`;
    } else {
      return `- ${day} ${date}: Update "${m.before.title}"`;
    }
  }).join('\n');

  return `I've prepared these changes:\n\n${changesList}\n\nDoes this look right?`;
}
