import { logger } from './logger';

export interface RPERange {
  min: number;
  max: number;
  midpoint: number;
}

export interface RPEDeviationResult {
  shouldTrigger: boolean;
  deviationType: 'much-harder' | 'much-easier' | 'consistently-high' | 'consistently-low' | 'none';
  deviation: number;
  prescribedRange: RPERange | null;
  completedValue: number;
  message: string;
}

export const DEVIATION_THRESHOLD = 2;

export function parseRPE(rpeString: string): RPERange | null {
  const match = rpeString.match(/(\d+)(?:-(\d+))?/);
  if (!match) return null;

  const min = parseInt(match[1]);
  const max = match[2] ? parseInt(match[2]) : min;

  return {
    min,
    max,
    midpoint: (min + max) / 2
  };
}

export function extractPrescribedRPE(activityDescription: string): RPERange | null {
  const rpeMatch = activityDescription.match(/(?:RPE|Effort)[:\s]+(\d+)(?:-(\d+))?/i);

  if (rpeMatch) {
    const min = parseInt(rpeMatch[1]);
    const max = rpeMatch[2] ? parseInt(rpeMatch[2]) : min;
    return {
      min,
      max,
      midpoint: (min + max) / 2
    };
  }

  const activityLower = activityDescription.toLowerCase();

  if (activityLower.includes('race day')) return { min: 9, max: 10, midpoint: 9.5 };
  if (activityLower.includes('interval') || activityLower.includes('hill')) return { min: 7, max: 9, midpoint: 8 };
  if (activityLower.includes('fartlek')) return { min: 7, max: 9, midpoint: 8 };
  if (activityLower.includes('tempo') || activityLower.includes('threshold')) return { min: 6, max: 7, midpoint: 6.5 };
  if (activityLower.includes('progressive')) return { min: 6, max: 7, midpoint: 6.5 };
  if (activityLower.includes('long run')) return { min: 4, max: 5, midpoint: 4.5 };
  if (activityLower.includes('recovery')) return { min: 2, max: 3, midpoint: 2.5 };
  if (activityLower.includes('easy')) return { min: 2, max: 3, midpoint: 2.5 };

  return null;
}

export function calculateDeviation(
  prescribedRange: RPERange | null,
  completedRPE: number
): number {
  if (!prescribedRange) return 0;

  if (completedRPE >= prescribedRange.min && completedRPE <= prescribedRange.max) {
    return 0;
  }

  if (completedRPE > prescribedRange.max) {
    return completedRPE - prescribedRange.max;
  }

  return -(prescribedRange.min - completedRPE);
}

export function evaluateWorkoutEffortDeviation(
  activityDescription: string,
  completedRPE: number,
  weekNumber: number,
  dayName: string,
  workoutKey?: string,
  lastTriggeredKey?: string
): RPEDeviationResult {
  const prescribedRange = extractPrescribedRPE(activityDescription);

  const deviation = calculateDeviation(prescribedRange, completedRPE);
  const absDeviation = Math.abs(deviation);

  const sameWorkout = workoutKey === lastTriggeredKey;

  logger.info('RPE Deviation Evaluation:', {
    weekNumber,
    dayName,
    prescribedRange,
    completedRPE,
    deviation,
    threshold: DEVIATION_THRESHOLD,
    sameWorkout,
    workoutKey,
    lastTriggeredKey
  });

  if (sameWorkout) {
    logger.info('Skipping trigger - same workout already triggered');
    return {
      shouldTrigger: false,
      deviationType: 'none',
      deviation,
      prescribedRange,
      completedValue: completedRPE,
      message: ''
    };
  }

  if (absDeviation >= DEVIATION_THRESHOLD) {
    if (deviation > 0) {
      const message = prescribedRange
        ? `Hey! I noticed you rated Week ${weekNumber}, ${dayName}'s workout as ${completedRPE}/10 - that's significantly harder than the target RPE ${prescribedRange.min}-${prescribedRange.max}. This could indicate you need more recovery. Would you like me to adjust your plan?`
        : `I see Week ${weekNumber}, ${dayName}'s workout felt really tough - you rated it ${completedRPE}/10. That's higher than expected for this session. Would you like me to review your training load?`;

      return {
        shouldTrigger: true,
        deviationType: 'much-harder',
        deviation,
        prescribedRange,
        completedValue: completedRPE,
        message
      };
    } else {
      const message = prescribedRange
        ? `Great work on Week ${weekNumber}, ${dayName}'s workout! You rated it ${completedRPE}/10 compared to the target ${prescribedRange.min}-${prescribedRange.max}. You're adapting really well! Would you like me to increase the challenge slightly?`
        : `I noticed Week ${weekNumber}, ${dayName}'s workout felt easier than expected - you rated it ${completedRPE}/10. You're making great progress! Would you like me to adjust the intensity?`;

      return {
        shouldTrigger: true,
        deviationType: 'much-easier',
        deviation,
        prescribedRange,
        completedValue: completedRPE,
        message
      };
    }
  }

  if (completedRPE >= 9 && !activityDescription.toLowerCase().includes('race')) {
    return {
      shouldTrigger: true,
      deviationType: 'much-harder',
      deviation,
      prescribedRange,
      completedValue: completedRPE,
      message: `Wow, Week ${weekNumber}, ${dayName}'s workout was really tough - you rated it ${completedRPE}/10! That's higher than ideal for a training session. Would you like me to review your training load and make some adjustments?`
    };
  }

  return {
    shouldTrigger: false,
    deviationType: 'none',
    deviation,
    prescribedRange,
    completedValue: completedRPE,
    message: ''
  };
}

export interface RecentWorkoutPattern {
  shouldTrigger: boolean;
  deviationType: 'consistently-high' | 'consistently-low' | 'none';
  averageRPE: number;
  workoutCount: number;
  message: string;
}

export function evaluateRecentWorkoutPattern(
  recentRatings: number[],
  minWorkoutsForPattern: number = 3
): RecentWorkoutPattern {
  if (!recentRatings || recentRatings.length < minWorkoutsForPattern) {
    return {
      shouldTrigger: false,
      deviationType: 'none',
      averageRPE: 0,
      workoutCount: recentRatings?.length || 0,
      message: ''
    };
  }

  const avgRating = recentRatings.reduce((sum, r) => sum + r, 0) / recentRatings.length;

  const HIGH_THRESHOLD = 7.5;
  const LOW_THRESHOLD = 3.5;

  if (avgRating >= HIGH_THRESHOLD) {
    return {
      shouldTrigger: true,
      deviationType: 'consistently-high',
      averageRPE: avgRating,
      workoutCount: recentRatings.length,
      message: `I've been monitoring your recent workouts and noticed your average RPE is ${avgRating.toFixed(1)}/10 across your last ${recentRatings.length} sessions. That's consistently high - you might be training too hard and need more recovery. Would you like me to adjust your plan to prevent overtraining?`
    };
  }

  if (avgRating <= LOW_THRESHOLD) {
    return {
      shouldTrigger: true,
      deviationType: 'consistently-low',
      averageRPE: avgRating,
      workoutCount: recentRatings.length,
      message: `Great progress! Your recent workouts have averaged ${avgRating.toFixed(1)}/10 RPE, which shows you're handling your training well. Would you like me to increase the challenge to continue your development?`
    };
  }

  return {
    shouldTrigger: false,
    deviationType: 'none',
    averageRPE: avgRating,
    workoutCount: recentRatings.length,
    message: ''
  };
}
