import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';
import { DateResolver } from '../_shared/dateResolverBackend.ts';
import { logger } from '../_shared/logger.ts';
import { extractDatePhrases, hasAmbiguousDateReference } from '../_shared/phraseAnalyzer.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

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
}

interface CommitRequestBody {
  mode: 'commit';
  previewId: string;
  planId: string;
  planVersion: number;
  userTimezone?: string;
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

type RequestBody = DraftRequestBody | CommitRequestBody | ClarificationResponseBody;

interface WorkoutModification {
  operation: 'cancel' | 'reschedule' | 'modify' | 'swap';
  target_date: string;
  new_date?: string;
  new_workout?: string;
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

  if (hasAmbiguousDateReference(message)) {
    const phrases = extractDatePhrases(message);
    const ambiguousPhrase = phrases.find(p => p.isAmbiguous);

    if (ambiguousPhrase) {
      // Check if this phrase has already been resolved (by normalizedPhrase)
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

  const draftProposal = await analyzeDraftFromAI(
    message,
    resolvedDates,
    chatHistory,
    workouts,
    userProfile,
    dateResolver
  );

  logger.info('[ChatV2Draft] AI proposal:', draftProposal);

  if (draftProposal.requires_clarification) {
    return new Response(
      JSON.stringify({
        mode: 'intervention',
        coachMessage: draftProposal.clarification_question || "Could you be more specific about which workout you'd like to modify?"
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  let modifications = buildModifications(draftProposal, workouts);

  // Filter out no-op modifications
  modifications = filterNoOpModifications(modifications, workouts);

  if (modifications.length === 0) {
    const responseData: any = {
      mode: 'info',
      coachMessage: draftProposal.reasoning || "No changes needed. Your plan looks good!"
    };

    if (diagnostics) {
      responseData.diagnostics = {
        functionName: 'chat-training-plan-v2',
        mode: 'draft',
        timezoneUsed: timezone,
        todayISOComputed: dateResolver.getTodayISO(),
        planId,
        planVersionInRequest: planVersion,
        planVersionInDB,
        modificationsCount: 0,
        modifiedDates: [],
        noChangesReason: 'All modifications filtered as no-ops'
      };
    }

    return new Response(
      JSON.stringify(responseData),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const previewId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  // Create a hash of modifications for validation
  const previewHash = await hashModifications(modifications, planId, planVersion);

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
        scheduled_for: mod.new_date || mod.target_date
      } : undefined
    })),
    preview_hash: previewHash,
    summary: draftProposal.reasoning || 'Changes prepared',
    expires_at: expiresAt
  };

  const { error: insertError } = await supabase
    .from('preview_sets')
    .insert({
      preview_id: previewId,
      user_id: userId,
      plan_id: planId,
      plan_version: planVersion,
      modifications: modifications,
      preview_hash: previewHash,
      expires_at: expiresAt,
    });

  if (insertError) {
    logger.error('[ChatV2Draft] Failed to save preview:', insertError);
  }

  const responseData: any = {
    mode: 'preview',
    previewSet,
    coachMessage: generateCoachMessage(previewSet, dateResolver),
  };

  if (diagnostics) {
    responseData.diagnostics = {
      functionName: 'chat-training-plan-v2',
      mode: 'draft',
      timezoneUsed: timezone,
      todayISOComputed: dateResolver.getTodayISO(),
      planId,
      planVersionInRequest: planVersion,
      planVersionInDB,
      previewId,
      modificationsCount: modifications.length,
      modifiedDates: modifications.map(m => m.target_date),
      previewCreated: !insertError,
      previewInsertError: insertError ? insertError.message : null
    };
  }

  return new Response(
    JSON.stringify(responseData),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
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

async function analyzeDraftFromAI(
  message: string,
  resolvedDates: Record<string, string>,
  chatHistory: ChatMessage[],
  workouts: Workout[],
  userProfile: any,
  dateResolver: DateResolver
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

  const systemPrompt = `You are a running coach analyzing a user's request to modify their training plan.

CRITICAL DATE CONTEXT (Do NOT recalculate - this is authoritative):
- Today: ${todayISO} (${todayDayName}, ${todayDisplay})
- User timezone: ${dateResolver['timezone']}
- All dates provided are in the user's local timezone

User's upcoming workouts:
${workoutsContext}

Date references resolved from user message:
${resolvedDatesContext || 'None'}

GOLD STANDARD RULES (NON-NEGOTIABLE):
1. ONLY target workouts using ISO dates (YYYY-MM-DD format) - NEVER use week numbers or weekday names
2. When moving a workout, PRESERVE the exact workout content unless explicitly asked to change it
3. Format all dates in coach messages as UK format: "7 Feb 26"
4. "move X to Y" means reschedule the workout on date X to date Y, keeping same workout content
5. "cancel X" means cancel the workout on date X (soft cancel - mark as rest)
6. "swap X and Y" means exchange the workouts on dates X and Y
7. If ANY ambiguity exists about which date/workout, set requires_clarification=true
8. Use only the dates provided in "Date references resolved" - DO NOT calculate new dates yourself

Return JSON with this structure:
{
  "operation": "cancel" | "reschedule" | "modify" | "swap",
  "target_dates": ["YYYY-MM-DD"],
  "new_dates": ["YYYY-MM-DD"],
  "modifications": [
    {
      "operation": "cancel" | "reschedule" | "modify" | "swap",
      "target_date": "YYYY-MM-DD",
      "new_date": "YYYY-MM-DD (if reschedule/swap)",
      "new_workout": "workout description (only if explicit change requested)",
      "swap_with_date": "YYYY-MM-DD (only if swap)"
    }
  ],
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
        workout.workout = mod.new_workout;
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
