/**
 * actionExecutor.ts
 *
 * Routes a classified PlanAction to the correct deterministic function.
 * The LLM never touches plan logic here — this layer is purely deterministic.
 */

import { type PlanAction, type ActionResult, isStructuralAction, isRecurringWeekdayAction } from './planAction.ts';
import { type ClassifiedIntent } from './intentClassifier.ts';
import { logger } from './logger.ts';

const DOW_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const DOW_SHORT_MAP: Record<string, string> = {
  sunday: 'Sun', sun: 'Sun',
  monday: 'Mon', mon: 'Mon',
  tuesday: 'Tue', tue: 'Tue',
  wednesday: 'Wed', wed: 'Wed',
  thursday: 'Thu', thu: 'Thu',
  friday: 'Fri', fri: 'Fri',
  saturday: 'Sat', sat: 'Sat',
};

const KM_RE = /(\d+(?:\.\d+)?)\s*km/i;

const ACTION_REQUIRED_PARAMS: Partial<Record<PlanAction, { params: string[]; clarificationQuestion: string }>> = {
  CANCEL_SESSION: {
    params: ['date'],
    clarificationQuestion: 'Which date would you like to cancel? Please specify the date (e.g., "March 10th" or "2024-03-10").',
  },
  SKIP_SESSION: {
    params: ['date'],
    clarificationQuestion: 'Which date would you like to skip? Please specify the date.',
  },
  MOVE_SESSION: {
    params: ['from_date', 'to_date'],
    clarificationQuestion: 'I need both the date you want to move FROM and the date you want to move TO. Which dates did you have in mind?',
  },
  SWAP_SESSIONS: {
    params: ['from_date', 'to_date'],
    clarificationQuestion: 'Which two dates would you like to swap? Please specify both dates.',
  },
  CONVERT_TO_EASY_RUN: {
    params: ['date'],
    clarificationQuestion: 'Which workout would you like to convert to an easy run? Please specify the date.',
  },
  ADD_EXTRA_RUN: {
    params: ['date'],
    clarificationQuestion: 'Which date would you like to add an extra run? Please specify a rest day.',
  },
  RECURRING_MOVE_WEEKDAY: {
    params: ['from_weekday', 'to_weekday'],
    clarificationQuestion: 'Which weekday would you like to move workouts FROM, and which weekday should they move TO? (e.g., "move all Fridays to Thursday")',
  },
  RECURRING_ADD_WEEKDAY: {
    params: ['target_weekday'],
    clarificationQuestion: 'Which weekday would you like to add workouts to? (e.g., "add a run to all Mondays")',
  },
  RECURRING_REMOVE_WEEKDAY: {
    params: ['target_weekday'],
    clarificationQuestion: 'Which weekday would you like to remove workouts from? (e.g., "remove all Tuesday workouts")',
  },
};

function isParamMissing(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string' && value.trim() === '') return true;
  return false;
}

function getMissingParamsClarification(
  action: PlanAction,
  params: Record<string, string | number | boolean | null>,
): string | null {
  const requirements = ACTION_REQUIRED_PARAMS[action];
  if (!requirements) return null;

  const missing = requirements.params.filter((p) => isParamMissing(params[p]));
  if (missing.length > 0) {
    return requirements.clarificationQuestion;
  }
  return null;
}

function extractKm(workout: string): number {
  const m = workout.match(KM_RE);
  return m ? parseFloat(m[1]) : 0;
}

function scaleKmInText(text: string, factor: number): string {
  return text.replace(KM_RE, (_, km) => {
    const scaled = Math.round(parseFloat(km) * factor * 2) / 2;
    return `${scaled} km`;
  });
}

function isQualityWorkout(workout: string): boolean {
  const lower = workout.toLowerCase();
  return lower.includes('interval') || lower.includes('tempo') || lower.includes('threshold') ||
    lower.includes('speed') || lower.includes('fartlek') || lower.includes('repeat') ||
    lower.includes('progression') || lower.includes('race pace');
}

function isLongRun(workout: string): boolean {
  return workout.toLowerCase().includes('long run');
}

function getWeekBounds(todayISO: string): { mondayMs: number; sundayMs: number } {
  const dow = new Date(todayISO + 'T12:00:00Z').getUTCDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const mondayMs = new Date(todayISO + 'T00:00:00Z').getTime() + mondayOffset * 86400000;
  const sundayMs = mondayMs + 7 * 86400000;
  return { mondayMs, sundayMs };
}

function isThisWeek(dateStr: string, mondayMs: number, sundayMs: number): boolean {
  const t = new Date(dateStr + 'T00:00:00Z').getTime();
  return t >= mondayMs && t < sundayMs;
}

export interface ExecutionContext {
  plan: {
    id: string;
    plan_data: { days: any[] };
    start_date: string;
    race_date: string | null;
    duration_weeks: number;
    answers: Record<string, any>;
    training_paces?: Record<string, string> | null;
    workout_version: number;
  };
  todayISO: string;
  openaiApiKey: string;
  insertionWeekOffset?: number;
}

export async function executePlanAction(
  intent: ClassifiedIntent,
  ctx: ExecutionContext,
): Promise<ActionResult> {
  const { action, parameters, needs_clarification, clarification_question } = intent;
  const { plan, todayISO } = ctx;
  const days: any[] = plan.plan_data?.days ?? [];

  console.log('ACTION:', action);
  console.log('PARAMS:', JSON.stringify(parameters));
  console.log('TODAY:', todayISO);
  console.log('DAYS_COUNT:', days.length);
  logger.info('[ActionExecutor] Executing action', { action, parameters });

  if (needs_clarification) {
    const fallbackQuestion = getMissingParamsClarification(action, parameters)
      ?? 'Can you clarify which date you mean?';
    const question = clarification_question || fallbackQuestion;

    return {
      success: true,
      message: question,
      planUpdated: false,
      blocked: true,
      blockedReason: 'needs_clarification',
    };
  }

  const missingParamQuestion = getMissingParamsClarification(action, parameters);
  if (missingParamQuestion) {
    return {
      success: true,
      message: missingParamQuestion,
      planUpdated: false,
      blocked: true,
      blockedReason: 'needs_clarification',
    };
  }

  try {
    switch (action) {
      case 'CANCEL_SESSION':
      case 'SKIP_SESSION':
        return executeCancelSession(parameters, days, plan, todayISO);

      case 'MOVE_SESSION':
        return executeMoveSession(parameters, days, plan, todayISO);

      case 'SWAP_SESSIONS':
        return executeSwapSessions(parameters, days, plan, todayISO);

      case 'CONVERT_TO_EASY_RUN':
        return executeConvertToEasyRun(parameters, days, plan, todayISO);

      case 'SOFTEN_WEEK':
      case 'L2_SOFTEN_WEEK':
        return executeSoftenWeek(days, plan, todayISO);

      case 'REDUCE_WEEK_VOLUME':
      case 'L3_REDUCE_WEEK':
        return executeReduceWeekVolume(days, plan, todayISO);

      case 'TRAVEL_WEEK':
        return executeTravelWeek(parameters, days, plan, todayISO);

      case 'REPEAT_WEEK':
        return executeRepeatWeek(days, plan, todayISO);

      case 'L1_SKIP_WORKOUT':
        return executeL1SkipWorkout(days, plan, todayISO);

      case 'L4_INSERT_RECOVERY_WEEK':
        return await executeL4RecoveryWeek(ctx, parameters);

      case 'REBUILD_PLAN':
        return {
          success: true,
          message: 'A full plan rebuild requires updating your plan settings. Please go to your plan settings to modify your race date, training days, or goals, which will regenerate your plan.',
          planUpdated: false,
          blocked: true,
          blockedReason: 'requires_plan_settings',
        };

      case 'ADD_EXTRA_RUN':
        return executeAddExtraRun(parameters, days, plan, todayISO);

      case 'RECURRING_MOVE_WEEKDAY':
        return executeRecurringMoveWeekday(parameters, days, plan, todayISO);

      case 'RECURRING_ADD_WEEKDAY':
        return executeRecurringAddWeekday(parameters, days, plan, todayISO);

      case 'RECURRING_REMOVE_WEEKDAY':
        return executeRecurringRemoveWeekday(parameters, days, plan, todayISO);

      case 'EXPLAIN_WORKOUT':
      case 'GENERAL_QUESTION':
      case 'CHANGE_RACE_GOAL':
        return { success: true, message: '', planUpdated: false };

      case 'CHANGE_TRAINING_DAYS':
      case 'MOVE_LONG_RUN_DAY':
      case 'REMOVE_TRAINING_DAY':
      case 'CHANGE_RACE_DATE':
      case 'ADJUST_TARGET_PACE':
        return {
          success: true,
          message: 'This change requires updating your plan settings. Please use the plan settings to make this change, which will regenerate your plan accordingly.',
          planUpdated: false,
          blocked: true,
          blockedReason: 'requires_plan_settings',
        };

      default:
        logger.warn('[ActionExecutor] Unknown action received', { action });
        return {
          success: false,
          message: `I didn't understand that request. Could you rephrase what you'd like to do with your training plan?`,
          planUpdated: false,
          blocked: true,
          blockedReason: 'unknown_action',
        };
    }
  } catch (err: any) {
    logger.error('[ActionExecutor] Action failed', { action, error: err?.message });
    return {
      success: false,
      message: err?.message ?? 'An unexpected error occurred.',
      planUpdated: false,
    };
  }
}

function saveDays(days: any[], plan: ExecutionContext['plan']): ActionResult['updatedPlanData'] {
  return { ...plan.plan_data, days };
}

function executeCancelSession(
  params: ClassifiedIntent['parameters'],
  days: any[],
  plan: ExecutionContext['plan'],
  todayISO: string,
): ActionResult {
  const targetDate = params.date as string | null;

  if (isParamMissing(targetDate)) {
    return {
      success: true,
      message: 'Which date would you like to cancel? Please specify the date (e.g., "March 10th" or "2024-03-10").',
      planUpdated: false,
      blocked: true,
      blockedReason: 'needs_clarification',
    };
  }

  const idx = days.findIndex((d: any) => d.date === targetDate);
  if (idx === -1) {
    return { success: false, message: `No session found on ${targetDate}.`, planUpdated: false };
  }

  if (days[idx].workout_type === 'REST') {
    return { success: false, message: `${targetDate} is already a rest day.`, planUpdated: false };
  }

  if (days[idx].date < todayISO) {
    return { success: false, message: `Cannot modify a past session (${targetDate}).`, planUpdated: false, blocked: true, blockedReason: 'past_session' };
  }

  const updated = days.map((d: any, i: number) =>
    i === idx
      ? { ...d, workout_type: 'REST', workout: 'Rest day', tips: ['Rest and recovery is where adaptation happens'] }
      : d
  );

  return {
    success: true,
    message: `session_cancelled:${targetDate}`,
    planUpdated: true,
    updatedPlanData: saveDays(updated, plan),
  };
}

function executeMoveSession(
  params: ClassifiedIntent['parameters'],
  days: any[],
  plan: ExecutionContext['plan'],
  todayISO: string,
): ActionResult {
  const fromDate = params.from_date as string | null;
  const toDate = params.to_date as string | null;

  if (isParamMissing(fromDate) || isParamMissing(toDate)) {
    return {
      success: true,
      message: 'I need both the date you want to move FROM and the date you want to move TO. Which dates did you have in mind?',
      planUpdated: false,
      blocked: true,
      blockedReason: 'needs_clarification',
    };
  }

  if (fromDate! < todayISO) {
    return {
      success: false,
      message: `Cannot move a past session (${fromDate}). You can only move upcoming workouts.`,
      planUpdated: false,
      blocked: true,
      blockedReason: 'past_session',
    };
  }

  if (toDate! < todayISO) {
    return {
      success: false,
      message: `Cannot move a session to a past date (${toDate}). Please choose an upcoming date.`,
      planUpdated: false,
      blocked: true,
      blockedReason: 'past_session',
    };
  }

  const fromIdx = days.findIndex((d: any) => d.date === fromDate);
  const toIdx = days.findIndex((d: any) => d.date === toDate);

  if (fromIdx === -1) {
    return { success: false, message: `No session found on ${fromDate}.`, planUpdated: false };
  }
  if (toIdx === -1) {
    return { success: false, message: `No plan day found for ${toDate}.`, planUpdated: false };
  }

  const fromDay = days[fromIdx];
  const toDay = days[toIdx];

  if (fromDay.workout_type === 'REST') {
    return { success: false, message: `${fromDate} is already a rest day — nothing to move.`, planUpdated: false };
  }

  if (toDay.workout_type !== 'REST') {
    const toLabel = toDay.workout?.split('\n')[0]?.slice(0, 40) || 'a workout';
    return {
      success: true,
      message: `${toDate} already has ${toLabel}. Would you like to swap the two sessions instead, or choose a different (rest) day to move to?`,
      planUpdated: false,
      blocked: true,
      blockedReason: 'target_has_workout',
    };
  }

  const updated = days.map((d: any, i: number) => {
    if (i === fromIdx) {
      return { ...d, workout_type: 'REST', workout: 'Rest day', tips: ['Rest and recovery is where adaptation happens'] };
    }
    if (i === toIdx) {
      return { ...d, workout_type: fromDay.workout_type, workout: fromDay.workout, tips: fromDay.tips ?? [] };
    }
    return d;
  });

  return {
    success: true,
    message: `session_moved:${fromDate}:${toDate}`,
    planUpdated: true,
    updatedPlanData: saveDays(updated, plan),
  };
}

function executeSwapSessions(
  params: ClassifiedIntent['parameters'],
  days: any[],
  plan: ExecutionContext['plan'],
  todayISO: string,
): ActionResult {
  const dateA = params.from_date as string | null;
  const dateB = params.to_date as string | null;

  if (isParamMissing(dateA) || isParamMissing(dateB)) {
    return {
      success: true,
      message: 'Which two dates would you like to swap? Please specify both dates.',
      planUpdated: false,
      blocked: true,
      blockedReason: 'needs_clarification',
    };
  }

  if (dateA! < todayISO || dateB! < todayISO) {
    return {
      success: false,
      message: 'Cannot swap sessions involving a past date. You can only swap upcoming workouts.',
      planUpdated: false,
      blocked: true,
      blockedReason: 'past_session',
    };
  }

  const idxA = days.findIndex((d: any) => d.date === dateA);
  const idxB = days.findIndex((d: any) => d.date === dateB);

  if (idxA === -1 || idxB === -1) {
    return { success: false, message: `Could not find both sessions to swap.`, planUpdated: false };
  }

  const dayA = days[idxA];
  const dayB = days[idxB];

  const updated = days.map((d: any, i: number) => {
    if (i === idxA) {
      return { ...d, workout_type: dayB.workout_type, workout: dayB.workout, tips: dayB.tips ?? [] };
    }
    if (i === idxB) {
      return { ...d, workout_type: dayA.workout_type, workout: dayA.workout, tips: dayA.tips ?? [] };
    }
    return d;
  });

  return {
    success: true,
    message: `sessions_swapped:${dateA}:${dateB}`,
    planUpdated: true,
    updatedPlanData: saveDays(updated, plan),
  };
}

function executeConvertToEasyRun(
  params: ClassifiedIntent['parameters'],
  days: any[],
  plan: ExecutionContext['plan'],
  todayISO: string,
): ActionResult {
  const targetDate = params.date as string | null;

  if (isParamMissing(targetDate)) {
    return {
      success: true,
      message: 'Which workout would you like to convert to an easy run? Please specify the date.',
      planUpdated: false,
      blocked: true,
      blockedReason: 'needs_clarification',
    };
  }

  if (targetDate! < todayISO) {
    return {
      success: false,
      message: `Cannot modify a past session (${targetDate}).`,
      planUpdated: false,
      blocked: true,
      blockedReason: 'past_session',
    };
  }

  const idx = days.findIndex((d: any) => d.date === targetDate);
  if (idx === -1) {
    return { success: false, message: `No session found on ${targetDate}.`, planUpdated: false };
  }

  const day = days[idx];
  if (day.workout_type === 'REST') {
    return { success: false, message: `${targetDate} is already a rest day.`, planUpdated: false };
  }

  const distanceMatch = (day.workout || '').match(KM_RE);
  const easyDistance = distanceMatch ? `${distanceMatch[1]} km` : '5–8 km';
  const easyPace = plan.training_paces?.easyPace ?? '6:00';

  const updated = days.map((d: any, i: number) =>
    i === idx
      ? {
          ...d,
          workout: `Easy run — ${easyDistance} at comfortable, conversational pace (${easyPace} /km)\n(Converted from quality session for recovery)`,
          tips: ['Keep effort fully conversational', 'This is active recovery — resist the urge to push', 'RPE 3–4 maximum'],
        }
      : d
  );

  return {
    success: true,
    message: `converted_to_easy:${targetDate}`,
    planUpdated: true,
    updatedPlanData: saveDays(updated, plan),
  };
}

function executeSoftenWeek(
  days: any[],
  plan: ExecutionContext['plan'],
  todayISO: string,
  options?: { preserveLongRun?: boolean },
): ActionResult {
  const { mondayMs, sundayMs } = getWeekBounds(todayISO);
  let modifiedCount = 0;
  const preserveLongRun = options?.preserveLongRun ?? true;

  const updated = days.map((d: any) => {
    if (!isThisWeek(d.date, mondayMs, sundayMs) || d.workout_type !== 'TRAIN') return d;
    if (d.date < todayISO) return d;

    if (isLongRun(d.workout ?? '')) {
      if (preserveLongRun) {
        return d;
      }
      modifiedCount++;
      return { ...d, workout: scaleKmInText(d.workout, 0.88) };
    }
    if (isQualityWorkout(d.workout ?? '')) {
      const distanceMatch = (d.workout || '').match(KM_RE);
      const easyDistance = distanceMatch ? `${distanceMatch[1]} km` : '5–8 km';
      const easyPace = plan.training_paces?.easyPace ?? '6:00';
      modifiedCount++;
      return {
        ...d,
        workout: `Easy run — ${easyDistance} at comfortable, conversational pace (${easyPace} /km)\n(Softened from quality session for recovery)`,
        tips: ['Keep effort fully conversational', 'Focus on easy aerobic effort', 'RPE 3–4 maximum'],
      };
    }
    return d;
  });

  if (modifiedCount === 0) {
    return { success: false, message: 'No quality sessions found to soften this week.', planUpdated: false };
  }

  const longRunNote = preserveLongRun ? ' Long run preserved.' : '';
  return {
    success: true,
    message: `week_softened:${modifiedCount}:preserve_long_run=${preserveLongRun}`,
    planUpdated: true,
    updatedPlanData: saveDays(updated, plan),
  };
}

function executeReduceWeekVolume(
  days: any[],
  plan: ExecutionContext['plan'],
  todayISO: string,
  options?: { preserveLongRun?: boolean; skipLongRun?: boolean },
): ActionResult {
  const { mondayMs, sundayMs } = getWeekBounds(todayISO);
  let modifiedCount = 0;
  const preserveLongRun = options?.preserveLongRun ?? true;
  const skipLongRun = options?.skipLongRun ?? false;

  const updated = days.map((d: any) => {
    if (!isThisWeek(d.date, mondayMs, sundayMs) || d.workout_type !== 'TRAIN') return d;
    if (d.date < todayISO) return d;

    if (isLongRun(d.workout ?? '')) {
      if (skipLongRun) {
        modifiedCount++;
        const easyPace = plan.training_paces?.easyPace ?? '6:00';
        return {
          ...d,
          workout: `Easy run: 5 km at ${easyPace} /km\n(Long run skipped for recovery — replaced with short easy run)`,
          tips: ['This replaces your long run for recovery', 'Keep effort fully conversational', 'Focus on rest this week'],
        };
      }
      if (preserveLongRun) {
        modifiedCount++;
        return { ...d, workout: scaleKmInText(d.workout, 0.90) };
      }
      modifiedCount++;
      return { ...d, workout: scaleKmInText(d.workout, 0.85) };
    }

    modifiedCount++;
    if (isQualityWorkout(d.workout ?? '')) {
      return { ...d, workout: scaleKmInText(d.workout, 0.85) + '\n(Reduced intensity — easy-moderate effort for recovery)' };
    }
    return { ...d, workout: scaleKmInText(d.workout, 0.85) };
  });

  if (modifiedCount === 0) {
    return { success: false, message: 'No upcoming training sessions found this week.', planUpdated: false };
  }

  const modeNote = skipLongRun ? 'long_run_skipped' : preserveLongRun ? 'long_run_preserved_10pct' : 'full_reduction';
  return {
    success: true,
    message: `week_reduced:${modifiedCount}:${modeNote}`,
    planUpdated: true,
    updatedPlanData: saveDays(updated, plan),
  };
}

function executeTravelWeek(
  params: ClassifiedIntent['parameters'],
  days: any[],
  plan: ExecutionContext['plan'],
  todayISO: string,
): ActionResult {
  const weekOffset = typeof params.week_offset === 'number' ? params.week_offset : 0;
  const refDate = weekOffset === 0 ? todayISO : addDays(todayISO, weekOffset * 7);
  const { mondayMs, sundayMs } = getWeekBounds(refDate);
  let modifiedCount = 0;

  const updated = days.map((d: any) => {
    if (!isThisWeek(d.date, mondayMs, sundayMs) || d.workout_type !== 'TRAIN') return d;
    if (d.date < todayISO) return d;

    modifiedCount++;
    if (isLongRun(d.workout ?? '')) {
      const easyPace = plan.training_paces?.easyPace ?? '6:00';
      const km = extractKm(d.workout) || 10;
      const reducedKm = Math.round(km * 0.70 * 2) / 2;
      return {
        ...d,
        workout: `Easy run: ${reducedKm} km at ${easyPace} /km\n(Travel week — reduced long run replaced with easy effort)`,
        tips: ['Travel week — keep effort easy', 'Focus on maintaining routine, not performance', 'Any movement counts'],
      };
    }
    if (isQualityWorkout(d.workout ?? '')) {
      return {
        ...d,
        workout: scaleKmInText(d.workout, 0.70) + '\n(Travel week — reduced intensity)',
        tips: ['Travel week — easy effort only', 'Skip if logistics are difficult', 'Consistency over quality this week'],
      };
    }
    return { ...d, workout: scaleKmInText(d.workout, 0.80) };
  });

  return {
    success: true,
    message: `travel_week_adjusted:${modifiedCount}`,
    planUpdated: modifiedCount > 0,
    updatedPlanData: modifiedCount > 0 ? saveDays(updated, plan) : undefined,
  };
}

function executeRepeatWeek(
  days: any[],
  plan: ExecutionContext['plan'],
  todayISO: string,
): ActionResult {
  const { mondayMs, sundayMs } = getWeekBounds(todayISO);
  const nextMondayMs = sundayMs;
  const nextSundayMs = nextMondayMs + 7 * 86400000;

  const thisWeekDays = days.filter((d: any) => isThisWeek(d.date, mondayMs, sundayMs));
  const nextWeekDays = days.filter((d: any) => isThisWeek(d.date, nextMondayMs, nextSundayMs));

  if (thisWeekDays.length === 0 || nextWeekDays.length === 0) {
    return { success: false, message: 'Could not find this week or next week in your plan.', planUpdated: false };
  }

  const thisWeekByDow = new Map<number, any>();
  for (const d of thisWeekDays) {
    const dow = new Date(d.date + 'T12:00:00Z').getUTCDay();
    thisWeekByDow.set(dow, d);
  }

  const updated = days.map((d: any) => {
    if (!isThisWeek(d.date, nextMondayMs, nextSundayMs)) return d;
    const dow = new Date(d.date + 'T12:00:00Z').getUTCDay();
    const template = thisWeekByDow.get(dow);
    if (!template) return d;
    return { ...d, workout_type: template.workout_type, workout: template.workout, tips: template.tips ?? [] };
  });

  return {
    success: true,
    message: `week_repeated`,
    planUpdated: true,
    updatedPlanData: saveDays(updated, plan),
  };
}

function executeL1SkipWorkout(
  days: any[],
  plan: ExecutionContext['plan'],
  todayISO: string,
): ActionResult {
  const nextTrainIdx = days.findIndex(
    (d: any) => d.date >= todayISO && d.workout_type === 'TRAIN'
  );

  if (nextTrainIdx === -1) {
    return { success: false, message: 'No upcoming training sessions found to skip.', planUpdated: false };
  }

  const skipped = days[nextTrainIdx];
  const title = skipped.workout?.split('\n')[0]?.slice(0, 50) || 'your next workout';

  const updated = days.map((d: any, i: number) =>
    i === nextTrainIdx
      ? { ...d, workout_type: 'REST', workout: 'Rest day (recovery — skipped session)', tips: ['Rest and recovery is where adaptation happens'] }
      : d
  );

  return {
    success: true,
    message: `l1_skipped:${skipped.date}:${title}`,
    planUpdated: true,
    updatedPlanData: saveDays(updated, plan),
  };
}

async function executeL4RecoveryWeek(
  ctx: ExecutionContext,
  params: ClassifiedIntent['parameters']
): Promise<ActionResult> {
  const { executeRecoveryRebuild } = await import('./recoveryRebuild.ts');
  const { validateStructuralRebuild } = await import('./safetyInvariants.ts');
  const { parseRaceDistanceKm } = await import('./planStructureBuilder.ts');

  const { plan, todayISO, openaiApiKey } = ctx;
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
    return {
      success: false,
      message: structuralCheck.errors[0] ?? 'Recovery week cannot be applied right now.',
      planUpdated: false,
      blocked: true,
      blockedReason: 'taper_guard',
    };
  }

  const insertionWeekOffset = typeof params.week_offset === 'number' ? params.week_offset : (ctx.insertionWeekOffset ?? 0);
  logger.info('[ActionExecutor] L4 recovery week offset', { paramWeekOffset: params.week_offset, ctxOffset: ctx.insertionWeekOffset, resolved: insertionWeekOffset });
  const rebuildResult = await executeRecoveryRebuild({ plan, todayISO, openaiApiKey, insertionWeekOffset });

  return {
    success: true,
    message: `l4_recovery_rebuilt:${rebuildResult.summary.recoveryWeekVolume}:${rebuildResult.summary.nextWeekVolume}:${rebuildResult.summary.weeksRebuilt}`,
    planUpdated: true,
    updatedPlanData: rebuildResult.updatedPlanData,
  };
}

function executeAddExtraRun(
  params: ClassifiedIntent['parameters'],
  days: any[],
  plan: ExecutionContext['plan'],
  todayISO: string,
): ActionResult {
  const targetDate = params.date as string | null;
  if (isParamMissing(targetDate)) {
    return {
      success: true,
      message: 'Which date would you like to add an extra run? Please specify a rest day.',
      planUpdated: false,
      blocked: true,
      blockedReason: 'needs_clarification',
    };
  }

  if (targetDate! < todayISO) {
    return {
      success: false,
      message: `Cannot add a run to a past date (${targetDate}).`,
      planUpdated: false,
      blocked: true,
      blockedReason: 'past_session',
    };
  }

  const idx = days.findIndex((d: any) => d.date === targetDate);
  if (idx === -1) {
    return { success: false, message: `No plan day found for ${targetDate}.`, planUpdated: false };
  }

  if (days[idx].workout_type === 'TRAIN') {
    return { success: false, message: `${targetDate} already has a training session.`, planUpdated: false };
  }

  const easyPace = plan.training_paces?.easyPace ?? '6:00';
  const updated = days.map((d: any, i: number) =>
    i === idx
      ? {
          ...d,
          workout_type: 'TRAIN',
          workout: `Easy run: 5 km at ${easyPace} /km\nWarm up: 5 min walk | Work: 5 km easy (conversational) | Cool down: 5 min walk`,
          tips: ['Keep effort fully conversational', 'This is an extra easy run — keep it short and relaxed'],
        }
      : d
  );

  return {
    success: true,
    message: `extra_run_added:${targetDate}`,
    planUpdated: true,
    updatedPlanData: saveDays(updated, plan),
  };
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

function normalizeWeekday(weekday: string | null | undefined): string | null {
  if (!weekday) return null;
  const lower = weekday.toLowerCase().trim();
  return DOW_SHORT_MAP[lower] ?? null;
}

function getDayOfWeekShort(dateStr: string): string {
  const dow = new Date(dateStr + 'T12:00:00Z').getUTCDay();
  return DOW_NAMES[dow];
}

function getDayDelta(fromWeekday: string, toWeekday: string): number {
  const fromIdx = DOW_NAMES.indexOf(fromWeekday as typeof DOW_NAMES[number]);
  const toIdx = DOW_NAMES.indexOf(toWeekday as typeof DOW_NAMES[number]);
  if (fromIdx === -1 || toIdx === -1) return 0;
  return toIdx - fromIdx;
}

function executeRecurringMoveWeekday(
  params: ClassifiedIntent['parameters'],
  days: any[],
  plan: ExecutionContext['plan'],
  todayISO: string,
): ActionResult {
  const fromWeekday = normalizeWeekday(params.from_weekday as string | null);
  const toWeekday = normalizeWeekday(params.to_weekday as string | null);

  if (!fromWeekday || !toWeekday) {
    return {
      success: true,
      message: 'Which weekday would you like to move workouts FROM, and which weekday should they move TO? (e.g., "move all Fridays to Thursday")',
      planUpdated: false,
      blocked: true,
      blockedReason: 'needs_clarification',
    };
  }

  if (fromWeekday === toWeekday) {
    return {
      success: false,
      message: `The source and destination weekday are the same (${fromWeekday}). No changes needed.`,
      planUpdated: false,
    };
  }

  const dayDelta = getDayDelta(fromWeekday, toWeekday);
  const daysToMove: { originalIdx: number; originalDate: string; newDate: string; day: any }[] = [];

  for (let i = 0; i < days.length; i++) {
    const day = days[i];
    if (!day.date || day.date < todayISO) continue;

    const dayOfWeek = getDayOfWeekShort(day.date);
    if (dayOfWeek !== fromWeekday) continue;

    const workout = (day.workout || '').toLowerCase();
    if (day.workout_type === 'REST' || workout === 'rest' || workout === 'rest day') continue;

    const newDate = addDays(day.date, dayDelta);
    daysToMove.push({
      originalIdx: i,
      originalDate: day.date,
      newDate,
      day: { ...day },
    });
  }

  if (daysToMove.length === 0) {
    return {
      success: false,
      message: `No future workouts found on ${fromWeekday}s to move.`,
      planUpdated: false,
    };
  }

  logger.info('[ActionExecutor] Recurring move weekday', {
    fromWeekday,
    toWeekday,
    count: daysToMove.length,
  });

  const existingDatesMap = new Map<string, number>();
  for (let i = 0; i < days.length; i++) {
    if (days[i].date) {
      existingDatesMap.set(days[i].date, i);
    }
  }

  const updated = [...days];
  const conflicts: string[] = [];

  for (const moveItem of daysToMove) {
    const targetIdx = existingDatesMap.get(moveItem.newDate);

    if (targetIdx !== undefined) {
      const targetDay = updated[targetIdx];
      const targetWorkout = (targetDay.workout || '').toLowerCase();
      const hasWorkout = targetDay.workout_type === 'TRAIN' && targetWorkout !== 'rest' && targetWorkout !== 'rest day';

      if (hasWorkout) {
        updated[targetIdx] = {
          ...targetDay,
          workout_type: moveItem.day.workout_type,
          workout: moveItem.day.workout,
          tips: moveItem.day.tips ?? [],
        };
        updated[moveItem.originalIdx] = {
          ...updated[moveItem.originalIdx],
          workout_type: targetDay.workout_type,
          workout: targetDay.workout,
          tips: targetDay.tips ?? [],
        };
        conflicts.push(moveItem.newDate);
      } else {
        updated[targetIdx] = {
          ...targetDay,
          workout_type: moveItem.day.workout_type,
          workout: moveItem.day.workout,
          tips: moveItem.day.tips ?? [],
        };
        updated[moveItem.originalIdx] = {
          ...updated[moveItem.originalIdx],
          workout_type: 'REST',
          workout: 'Rest day',
          tips: ['Rest and recovery is where adaptation happens'],
        };
      }
    } else {
      updated[moveItem.originalIdx] = {
        ...updated[moveItem.originalIdx],
        workout_type: 'REST',
        workout: 'Rest day',
        tips: ['Rest and recovery is where adaptation happens'],
      };
    }
  }

  const conflictNote = conflicts.length > 0 ? `:swapped=${conflicts.length}` : '';

  return {
    success: true,
    message: `recurring_move_weekday:${fromWeekday}:${toWeekday}:${daysToMove.length}${conflictNote}`,
    planUpdated: true,
    updatedPlanData: saveDays(updated, plan),
  };
}

function executeRecurringAddWeekday(
  params: ClassifiedIntent['parameters'],
  days: any[],
  plan: ExecutionContext['plan'],
  todayISO: string,
): ActionResult {
  const targetWeekday = normalizeWeekday(params.target_weekday as string | null);

  if (!targetWeekday) {
    return {
      success: true,
      message: 'Which weekday would you like to add workouts to? (e.g., "add a run to all Mondays")',
      planUpdated: false,
      blocked: true,
      blockedReason: 'needs_clarification',
    };
  }

  const daysToAdd: number[] = [];

  for (let i = 0; i < days.length; i++) {
    const day = days[i];
    if (!day.date || day.date < todayISO) continue;

    const dayOfWeek = getDayOfWeekShort(day.date);
    if (dayOfWeek !== targetWeekday) continue;

    const workout = (day.workout || '').toLowerCase();
    const isRest = day.workout_type === 'REST' || workout === 'rest' || workout === 'rest day' || workout === '';

    if (isRest) {
      daysToAdd.push(i);
    }
  }

  if (daysToAdd.length === 0) {
    return {
      success: false,
      message: `No available rest days found on future ${targetWeekday}s. All ${targetWeekday}s already have workouts scheduled.`,
      planUpdated: false,
    };
  }

  logger.info('[ActionExecutor] Recurring add weekday', {
    targetWeekday,
    count: daysToAdd.length,
  });

  const easyPace = plan.training_paces?.easyPace ?? '6:00';
  const updated = days.map((d: any, i: number) => {
    if (!daysToAdd.includes(i)) return d;
    return {
      ...d,
      workout_type: 'TRAIN',
      workout: `Easy run: 5 km at ${easyPace} /km\nWarm up: 5 min walk | Work: 5 km easy (conversational) | Cool down: 5 min walk`,
      tips: ['Keep effort fully conversational', 'This is an added easy run — keep it short and relaxed'],
    };
  });

  return {
    success: true,
    message: `recurring_add_weekday:${targetWeekday}:${daysToAdd.length}`,
    planUpdated: true,
    updatedPlanData: saveDays(updated, plan),
  };
}

function executeRecurringRemoveWeekday(
  params: ClassifiedIntent['parameters'],
  days: any[],
  plan: ExecutionContext['plan'],
  todayISO: string,
): ActionResult {
  const targetWeekday = normalizeWeekday(params.target_weekday as string | null);

  if (!targetWeekday) {
    return {
      success: true,
      message: 'Which weekday would you like to remove workouts from? (e.g., "remove all Tuesday workouts")',
      planUpdated: false,
      blocked: true,
      blockedReason: 'needs_clarification',
    };
  }

  const daysToRemove: number[] = [];

  for (let i = 0; i < days.length; i++) {
    const day = days[i];
    if (!day.date || day.date < todayISO) continue;

    const dayOfWeek = getDayOfWeekShort(day.date);
    if (dayOfWeek !== targetWeekday) continue;

    const workout = (day.workout || '').toLowerCase();
    const isRest = day.workout_type === 'REST' || workout === 'rest' || workout === 'rest day' || workout === '';

    if (!isRest) {
      daysToRemove.push(i);
    }
  }

  if (daysToRemove.length === 0) {
    return {
      success: false,
      message: `No workouts found on future ${targetWeekday}s to remove. All ${targetWeekday}s are already rest days.`,
      planUpdated: false,
    };
  }

  logger.info('[ActionExecutor] Recurring remove weekday', {
    targetWeekday,
    count: daysToRemove.length,
  });

  const updated = days.map((d: any, i: number) => {
    if (!daysToRemove.includes(i)) return d;
    return {
      ...d,
      workout_type: 'REST',
      workout: 'Rest day',
      tips: ['Rest and recovery is where adaptation happens'],
    };
  });

  return {
    success: true,
    message: `recurring_remove_weekday:${targetWeekday}:${daysToRemove.length}`,
    planUpdated: true,
    updatedPlanData: saveDays(updated, plan),
  };
}
