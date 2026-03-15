import type {
  StepId,
  WorkoutRole,
  WorkoutFeedback,
  StepStatusEvaluation,
  ConfidenceLevel,
  RecommendedAction,
  ReasonCode,
  ProgressPanel,
  StepsMeta,
  PlanStep,
} from '../types';

export function generateNormalizedWorkoutId(
  trainingPlanId: string,
  isoDate: string,
  workoutType: string = 'normal',
  workout_type: string = 'TRAIN'
): string {
  return `${trainingPlanId}:${isoDate}:${workoutType}:${workout_type}`;
}

export function generateNormalizedWorkoutIdFromWeek(
  trainingPlanId: string,
  weekNumber: number,
  dow: string,
  workoutType: string = 'normal',
  workout_type: string = 'TRAIN'
): string {
  return `${trainingPlanId}:${weekNumber}:${dow}:${workoutType}:${workout_type}`;
}

export function isKeyWorkout(workoutText: string, workoutRole?: WorkoutRole): boolean {
  const lowerWorkout = workoutText.toLowerCase();

  if (workoutRole && ['threshold', 'economy', 'race_specific', 'calibration'].includes(workoutRole)) {
    return true;
  }

  const keyWorkoutIndicators = [
    'long run',
    'tempo',
    'threshold',
    'interval',
    'race pace',
    'marathon pace',
    'calibration',
    'time trial',
    'progression',
    'fartlek'
  ];

  return keyWorkoutIndicators.some(indicator => lowerWorkout.includes(indicator));
}

export function stepInfluenceDecay(weeksToRace: number): number {
  if (weeksToRace > 10) return 1.0;
  if (weeksToRace >= 6) return 0.6;
  if (weeksToRace >= 3) return 0.3;
  return 0.1;
}

export function calculateWeeksToRace(raceDateStr?: string): number | null {
  if (!raceDateStr) return null;

  const today = new Date();
  const raceDate = new Date(raceDateStr);
  const diffTime = raceDate.getTime() - today.getTime();
  const diffWeeks = Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 7));

  return diffWeeks;
}

export function determineStepUsage(durationWeeks: number, weeksToRace: number | null): {
  stepsEnabled: boolean;
  allowedSteps: StepId[];
  reason?: string;
} {
  if (durationWeeks <= 4) {
    return {
      stepsEnabled: false,
      allowedSteps: [],
      reason: 'plan_too_short'
    };
  }

  if (weeksToRace !== null && weeksToRace <= 3) {
    return {
      stepsEnabled: false,
      allowedSteps: ['race_specific'],
      reason: 'race_imminent'
    };
  }

  if (durationWeeks >= 12) {
    return {
      stepsEnabled: true,
      allowedSteps: ['aerobic_base', 'threshold', 'economy', 'race_specific']
    };
  }

  if (durationWeeks >= 8) {
    return {
      stepsEnabled: true,
      allowedSteps: ['aerobic_base', 'threshold', 'race_specific']
    };
  }

  return {
    stepsEnabled: true,
    allowedSteps: ['aerobic_base', 'race_specific']
  };
}

interface KeyWorkoutFeedback {
  completion_status: string;
  effort_vs_expected?: string;
  hr_matched_target?: string;
}

export function stepStatusEvaluator(
  currentStepId: StepId,
  currentStep: PlanStep,
  weeksSinceStepStart: number,
  keyWorkoutsFeedback: KeyWorkoutFeedback[],
  weeksToRace: number | null
): StepStatusEvaluation {
  const reasonCodes: ReasonCode[] = [];
  let confidence: ConfidenceLevel = 'med';
  let recommendedAction: RecommendedAction = 'progress';

  const totalKeyWorkouts = keyWorkoutsFeedback.length;
  const completedCount = keyWorkoutsFeedback.filter(f => f.completion_status === 'completed').length;
  const missedCount = keyWorkoutsFeedback.filter(f => f.completion_status === 'missed').length;
  const harderCount = keyWorkoutsFeedback.filter(f => f.effort_vs_expected === 'harder').length;
  const hrMismatchCount = keyWorkoutsFeedback.filter(f => f.hr_matched_target === 'no').length;

  const completionRate = totalKeyWorkouts > 0 ? completedCount / totalKeyWorkouts : 0;
  const missedRate = totalKeyWorkouts > 0 ? missedCount / totalKeyWorkouts : 0;
  const harderRate = totalKeyWorkouts > 0 ? harderCount / totalKeyWorkouts : 0;
  const hrMismatchRate = totalKeyWorkouts > 0 ? hrMismatchCount / totalKeyWorkouts : 0;

  const timeBoxEscape = weeksSinceStepStart >= currentStep.max_duration_weeks;

  if (totalKeyWorkouts < 3) {
    confidence = 'low';
    reasonCodes.push('LOW_DATA');
  }

  if (timeBoxEscape) {
    reasonCodes.push('TIME_BOX_ESCAPE');
    recommendedAction = 'progress_with_caution';
  }

  if (completionRate < 0.5) {
    reasonCodes.push('LOW_COMPLETION');
    recommendedAction = 'consolidate';
  } else if (completionRate < 0.7) {
    recommendedAction = 'hold_slightly';
  }

  if (harderRate > 0.6) {
    reasonCodes.push('HIGH_EFFORT');
    if (recommendedAction === 'progress') {
      recommendedAction = 'hold_slightly';
    } else if (recommendedAction === 'hold_slightly') {
      recommendedAction = 'consolidate';
    }
  }

  if (hrMismatchRate > 0.5 && totalKeyWorkouts >= 3) {
    reasonCodes.push('HR_MISMATCH');
    confidence = 'low';
  }

  if (completionRate >= 0.8 && harderRate < 0.3 && !timeBoxEscape) {
    reasonCodes.push('GOOD_PROGRESS');
    recommendedAction = 'progress';
    if (totalKeyWorkouts >= 6) {
      confidence = 'high';
    }
  }

  if (timeBoxEscape && confidence === 'high') {
    confidence = 'med';
  }

  if (weeksToRace !== null && weeksToRace <= 3) {
    recommendedAction = 'progress';
  }

  let progressPercent = 0;

  if (timeBoxEscape) {
    progressPercent = 100;
  } else {
    const timeProgress = (weeksSinceStepStart / currentStep.typical_duration_weeks) * 60;
    const qualityBonus = completionRate * 40;
    progressPercent = Math.min(100, Math.round(timeProgress + qualityBonus));
  }

  return {
    progress_percent: progressPercent,
    confidence,
    recommended_action: recommendedAction,
    reason_codes: reasonCodes,
    time_box_escape: timeBoxEscape
  };
}

export function computeProgressPanel(
  stepsMeta: StepsMeta | undefined,
  currentWeekNumber: number,
  allFeedback: WorkoutFeedback[],
  raceDate?: string,
  startDate?: string
): ProgressPanel {
  if (!stepsMeta || !stepsMeta.steps_enabled) {
    return {
      current_focus_name: 'Building Fitness',
      why_it_matters: 'Each workout builds your foundation and prepares you for race day.',
      this_week_strategy: 'Focus on completing workouts consistently and listening to your body.',
      steps_enabled: false,
      show_progress_bar: false,
    };
  }

  const weeksToRace = calculateWeeksToRace(raceDate);

  if (weeksToRace !== null && weeksToRace <= 3) {
    return {
      current_focus_name: 'Race Week Preparation',
      why_it_matters: 'Final preparation and taper to arrive fresh and ready on race day.',
      this_week_strategy: 'Prioritize rest, maintain sharpness with short runs, and trust your training.',
      steps_enabled: true,
      show_progress_bar: false,
      reason_codes: ['RACE_IMMINENT'],
    };
  }

  const currentFocus = stepsMeta.week_focus?.find(wf => wf.week_number === currentWeekNumber);
  const currentStepId = currentFocus?.focus_step_id || stepsMeta.allowed_steps?.[0] || 'aerobic_base';
  const currentStep = stepsMeta.plan_steps?.find(s => s.step_id === currentStepId);

  if (!currentStep) {
    return {
      current_focus_name: 'Training Progress',
      why_it_matters: 'Building your fitness systematically toward race day.',
      this_week_strategy: 'Complete workouts as planned and track your progress.',
      steps_enabled: true,
      show_progress_bar: false,
      reason_codes: ['MISSING_STEP_META'],
    };
  }

  const stepStartWeek = currentFocus?.week_number || 1;
  const weeksSinceStepStart = Math.max(0, currentWeekNumber - stepStartWeek);

  const recentWeekNumbers = Array.from(
    { length: 4 },
    (_, i) => currentWeekNumber - i
  ).filter(w => w > 0);

  const recentFeedback = allFeedback.filter(f =>
    f.is_key_workout &&
    f.week_number !== undefined &&
    recentWeekNumbers.includes(f.week_number)
  );

  const evaluation = stepStatusEvaluator(
    currentStepId,
    currentStep,
    weeksSinceStepStart,
    recentFeedback,
    weeksToRace
  );

  const hasTimeBoxEscape = evaluation.reason_codes?.includes('TIME_BOX_ESCAPE');
  const hasLowData = evaluation.reason_codes?.includes('LOW_DATA');

  const useInitialProgress = hasLowData &&
    (stepsMeta as any).initial_progress_percent !== undefined &&
    (stepsMeta as any).calculated_from_week &&
    currentWeekNumber === (stepsMeta as any).calculated_from_week;

  const finalProgressPercent = useInitialProgress
    ? (stepsMeta as any).initial_progress_percent
    : evaluation.progress_percent;

  const finalConfidence = useInitialProgress && (stepsMeta as any).initial_confidence
    ? (stepsMeta as any).initial_confidence
    : evaluation.confidence;

  let strategyText: string;

  if (hasTimeBoxEscape && hasLowData) {
    strategyText = 'We\'re moving forward to stay aligned with your race timeline. Logging a few more key workouts will help us fine-tune your training as we progress.';
  } else if (hasTimeBoxEscape) {
    strategyText = 'We\'re transitioning to the next phase to stay aligned with your race timeline. We\'ll continue reinforcing this fitness as we introduce the next focus.';
  } else if (hasLowData && evaluation.recommended_action === 'consolidate') {
    strategyText = 'Focus on consistency this week. Logging feedback on key workouts helps us understand what\'s working best for you.';
  } else {
    const strategyMap: Record<RecommendedAction, string> = {
      progress: 'Continue building on your strong foundation with this week\'s planned sessions.',
      hold_slightly: 'Consolidate your current fitness before progressing to the next phase.',
      consolidate: 'Focus on consistency and completing workouts comfortably this week.',
      reduce_load: 'Prioritize recovery and easier efforts to rebuild your capacity.',
      progress_with_caution: 'Moving forward while monitoring how your body responds to training.'
    };
    strategyText = strategyMap[evaluation.recommended_action];
  }

  const result: ProgressPanel = {
    current_focus_name: currentStep.name,
    why_it_matters: currentStep.purpose,
    steps_enabled: true,
    show_progress_bar: true,
    progress_percent: finalProgressPercent,
    confidence: finalConfidence,
    this_week_strategy: strategyText,
    reason_codes: evaluation.reason_codes
  };

  if (finalConfidence === 'low' && !hasTimeBoxEscape) {
    result.accuracy_hint = 'Track a few more key workouts to improve progress accuracy.';
  }

  return result;
}

export const STEP_DEFINITIONS: Record<StepId, PlanStep> = {
  aerobic_base: {
    step_id: 'aerobic_base',
    name: 'Aerobic Base',
    purpose: 'Build cardiovascular fitness and endurance foundation for sustained running.',
    typical_duration_weeks: 4,
    max_duration_weeks: 6
  },
  threshold: {
    step_id: 'threshold',
    name: 'Threshold Development',
    purpose: 'Improve lactate threshold and ability to sustain faster paces.',
    typical_duration_weeks: 3,
    max_duration_weeks: 5
  },
  economy: {
    step_id: 'economy',
    name: 'Efficiency / Economy',
    purpose: 'Enhance running form and neuromuscular efficiency through speed work.',
    typical_duration_weeks: 2,
    max_duration_weeks: 4
  },
  race_specific: {
    step_id: 'race_specific',
    name: 'Race-Specific Readiness',
    purpose: 'Practice race pace and build confidence for race day performance.',
    typical_duration_weeks: 3,
    max_duration_weeks: 4
  }
};
