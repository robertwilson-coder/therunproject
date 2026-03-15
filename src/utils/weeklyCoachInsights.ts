export type InsightKey =
  | 'fuel_before_you_fade'
  | 'protect_the_easy_run'
  | 'start_slower_than_you_want_to'
  | 'recovery_is_part_of_training'
  | 'dont_race_your_workouts'
  | 'consistency_beats_hero_days'
  | 'dont_try_to_catch_up_missed_runs'
  | 'practice_race_habits'
  | 'sleep_protects_adaptation'
  | 'trust_the_taper'
  | 'pace_by_effort_when_conditions_change'
  | 'finish_with_good_form';

export type InsightCategory =
  | 'long_run'
  | 'race_prep'
  | 'foundations'
  | 'recovery'
  | 'workout_execution'
  | 'mindset'
  | 'taper';

export interface CoachInsight {
  key: InsightKey;
  title: string;
  category: InsightCategory;
  body: string;
  action: string;
  minLongRunMinutes?: number;
  maxDaysToRace?: number;
  minDaysToRace?: number;
  requiresQualityWorkout?: boolean;
  requiresElevatedRPE?: boolean;
  requiresMissedWorkouts?: boolean;
  priority: number;
}

export const INSIGHT_LIBRARY: CoachInsight[] = [
  {
    key: 'trust_the_taper',
    title: 'Trust the taper',
    category: 'taper',
    body: 'Tapering can feel strange because you\'re doing less while expecting more. Many runners mistake freshness for lost fitness, when in reality the goal is to arrive with lower fatigue and intact sharpness.',
    action: 'This week, resist adding extra work to "stay fit" and let freshness build.',
    maxDaysToRace: 14,
    minDaysToRace: 1,
    priority: 1,
  },
  {
    key: 'practice_race_habits',
    title: 'Practise race habits before race day',
    category: 'race_prep',
    body: 'Race execution improves when it feels familiar. Fueling, pacing, kit, and pre-run routine all work better when they\'ve been rehearsed in training.',
    action: 'Use this week\'s long run to practise one race-day habit exactly as you expect to do it on the day.',
    maxDaysToRace: 42,
    minDaysToRace: 15,
    priority: 2,
  },
  {
    key: 'fuel_before_you_fade',
    title: 'Fuel before you fade',
    category: 'long_run',
    body: 'Your body stores limited carbohydrate, and when that drops too low, pace often falls while effort rises. When runners underfuel, the final section of a long run can become survival rather than quality aerobic work.',
    action: 'For any run over 75-90 minutes this week, practise taking carbs early and regularly rather than waiting until you feel empty.',
    minLongRunMinutes: 90,
    priority: 3,
  },
  {
    key: 'start_slower_than_you_want_to',
    title: 'Start slower than you want to',
    category: 'long_run',
    body: 'A controlled start lowers the early cost of a run and makes it easier to hold form later. Many runners turn long runs into moderate efforts too soon and lose the real aerobic benefit.',
    action: 'For your next long run, let the first 15-20 minutes feel almost too easy.',
    minLongRunMinutes: 75,
    priority: 4,
  },
  {
    key: 'recovery_is_part_of_training',
    title: 'Recovery is part of training',
    category: 'recovery',
    body: 'Training creates stress, but adaptation happens afterward. When recovery is poor, fatigue can accumulate faster than fitness and make ordinary runs feel harder than they should.',
    action: 'Treat the day after your hardest session as part of the session: fuel well, keep effort down, and protect sleep.',
    requiresElevatedRPE: true,
    priority: 5,
  },
  {
    key: 'sleep_protects_adaptation',
    title: 'Sleep protects adaptation',
    category: 'recovery',
    body: 'Training load only becomes progress if your body can absorb it. Poor sleep can reduce recovery quality, raise perceived effort, and make pace harder to access even when fitness is improving.',
    action: 'This week, treat sleep like part of the training plan, especially after your hardest run.',
    requiresElevatedRPE: true,
    priority: 6,
  },
  {
    key: 'dont_try_to_catch_up_missed_runs',
    title: 'Don\'t try to catch up missed runs',
    category: 'mindset',
    body: 'Missed training is best handled by returning to rhythm, not by cramming. Catch-up training often increases fatigue while disrupting the logic of the plan.',
    action: 'If you miss a run this week, resume normally with the next planned session rather than stacking extra volume.',
    requiresMissedWorkouts: true,
    priority: 7,
  },
  {
    key: 'dont_race_your_workouts',
    title: 'Don\'t race your workouts',
    category: 'workout_execution',
    body: 'A workout only works if it serves its purpose. Going too hard can turn a threshold or aerobic session into something else entirely, adding fatigue without adding the intended stimulus.',
    action: 'This week, aim to finish key reps feeling controlled rather than proving fitness too early.',
    requiresQualityWorkout: true,
    priority: 8,
  },
  {
    key: 'finish_with_good_form',
    title: 'Finish with good form, not just grit',
    category: 'workout_execution',
    body: 'When fatigue rises, efficient movement matters more, not less. Runners who stay relaxed and organised late in runs often preserve pace better than those who just strain harder.',
    action: 'In the final part of one key run this week, check posture, shoulders, cadence, and relaxation before trying to push.',
    requiresQualityWorkout: true,
    priority: 9,
  },
  {
    key: 'protect_the_easy_run',
    title: 'Protect the easy run',
    category: 'foundations',
    body: 'Easy running works because it builds training load without adding too much fatigue. When easy runs drift too hard, they can quietly reduce the quality of your key sessions and long runs.',
    action: 'Choose at least one run this week where you keep effort deliberately controlled, even if you feel strong.',
    priority: 10,
  },
  {
    key: 'consistency_beats_hero_days',
    title: 'Consistency beats hero days',
    category: 'mindset',
    body: 'Fitness is usually built by repeatable weeks, not one spectacular session. Runners who chase occasional big days while missing the ordinary work often plateau.',
    action: 'Focus on completing the week steadily rather than making one run exceptional.',
    priority: 11,
  },
  {
    key: 'pace_by_effort_when_conditions_change',
    title: 'Pace by effort when conditions change',
    category: 'foundations',
    body: 'Pace is affected by terrain, heat, and fatigue, but effort reflects what the body is actually paying. Forcing the same pace in worse conditions can turn the right session into the wrong one.',
    action: 'On your next run, protect the intended effort first and let pace respond to the conditions.',
    priority: 12,
  },
];

export interface InsightSelectionContext {
  daysToRace: number | null;
  longRunMinutes: number | null;
  hasQualityWorkout: boolean;
  recentMissRate: number;
  recentRPETrend: 'normal' | 'elevated' | 'low';
  weekNumber: number;
  totalWeeks: number;
  phase: 'base' | 'build' | 'peak' | 'taper' | 'race';
}

export interface SelectedInsight {
  insight: CoachInsight;
  reason: string;
}

function getPhaseFromWeekPosition(weekNumber: number, totalWeeks: number, daysToRace: number | null): InsightSelectionContext['phase'] {
  if (daysToRace !== null && daysToRace <= 7) return 'race';
  if (daysToRace !== null && daysToRace <= 21) return 'taper';

  const progress = weekNumber / totalWeeks;
  if (progress < 0.3) return 'base';
  if (progress < 0.7) return 'build';
  return 'peak';
}

export function selectWeeklyInsight(context: InsightSelectionContext): SelectedInsight | null {
  const candidates: { insight: CoachInsight; reason: string }[] = [];

  for (const insight of INSIGHT_LIBRARY) {
    if (insight.maxDaysToRace !== undefined && insight.minDaysToRace !== undefined) {
      if (context.daysToRace !== null &&
          context.daysToRace <= insight.maxDaysToRace &&
          context.daysToRace >= insight.minDaysToRace) {
        candidates.push({ insight, reason: `Race in ${context.daysToRace} days` });
        continue;
      }
    }

    if (insight.minLongRunMinutes !== undefined) {
      if (context.longRunMinutes !== null && context.longRunMinutes >= insight.minLongRunMinutes) {
        candidates.push({ insight, reason: `Long run of ${context.longRunMinutes} minutes this week` });
        continue;
      }
    }

    if (insight.requiresElevatedRPE && context.recentRPETrend === 'elevated') {
      candidates.push({ insight, reason: 'Recent elevated effort levels detected' });
      continue;
    }

    if (insight.requiresMissedWorkouts && context.recentMissRate >= 0.3) {
      candidates.push({ insight, reason: `${Math.round(context.recentMissRate * 100)}% of recent workouts missed` });
      continue;
    }

    if (insight.requiresQualityWorkout && context.hasQualityWorkout) {
      candidates.push({ insight, reason: 'Quality workout scheduled this week' });
      continue;
    }
  }

  if (candidates.length === 0) {
    if (context.phase === 'base') {
      const protectEasy = INSIGHT_LIBRARY.find(i => i.key === 'protect_the_easy_run');
      if (protectEasy) {
        return { insight: protectEasy, reason: 'Base phase focus' };
      }
    }

    const consistency = INSIGHT_LIBRARY.find(i => i.key === 'consistency_beats_hero_days');
    if (consistency) {
      return { insight: consistency, reason: 'General training focus' };
    }

    return null;
  }

  candidates.sort((a, b) => a.insight.priority - b.insight.priority);

  return candidates[0];
}

export function estimateLongRunMinutes(
  longRunKm: number,
  easyPaceMinPerKm: number = 6.0
): number {
  return Math.round(longRunKm * easyPaceMinPerKm);
}

export function detectQualityWorkouts(workouts: string[]): boolean {
  const qualityIndicators = [
    'tempo', 'threshold', 'interval', 'vo2', 'fartlek',
    'race pace', 'speed', 'track', 'hills', 'repetition', 'cruise'
  ];

  for (const workout of workouts) {
    const lower = workout.toLowerCase();
    if (qualityIndicators.some(ind => lower.includes(ind))) {
      return true;
    }
  }

  return false;
}

export function extractLongRunKm(workouts: string[]): number {
  const longRunPatterns = ['long run', 'long slow', 'lsd', 'long easy'];
  const kmPattern = /(\d+(?:\.\d+)?)\s*km/i;

  for (const workout of workouts) {
    const lower = workout.toLowerCase();
    if (longRunPatterns.some(p => lower.includes(p))) {
      const match = workout.match(kmPattern);
      if (match) {
        return parseFloat(match[1]);
      }
    }
  }

  return 0;
}

export function calculateRecentMissRate(
  completions: { completed: boolean; date: string }[],
  lookbackDays: number = 14
): number {
  const now = new Date();
  const cutoff = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);

  const recentCompletions = completions.filter(c => {
    const date = new Date(c.date);
    return date >= cutoff && date <= now;
  });

  if (recentCompletions.length === 0) return 0;

  const missedCount = recentCompletions.filter(c => !c.completed).length;
  return missedCount / recentCompletions.length;
}

export function detectRPETrend(
  recentRPEs: { rpe: number; expectedRPE?: number }[],
  threshold: number = 2
): 'normal' | 'elevated' | 'low' {
  if (recentRPEs.length < 2) return 'normal';

  let elevatedCount = 0;
  let lowCount = 0;

  for (const entry of recentRPEs) {
    const expected = entry.expectedRPE ?? 5;
    const deviation = entry.rpe - expected;

    if (deviation >= threshold) {
      elevatedCount++;
    } else if (deviation <= -threshold) {
      lowCount++;
    }
  }

  const elevatedRatio = elevatedCount / recentRPEs.length;
  const lowRatio = lowCount / recentRPEs.length;

  if (elevatedRatio >= 0.5) return 'elevated';
  if (lowRatio >= 0.5) return 'low';

  return 'normal';
}

export function getWeekMondayISO(dateISO: string): string {
  const d = new Date(dateISO + 'T12:00:00Z');
  const dow = d.getUTCDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const mondayMs = d.getTime() + mondayOffset * 24 * 60 * 60 * 1000;
  return new Date(mondayMs).toISOString().split('T')[0];
}

export function daysBetween(date1: string, date2: string): number {
  const d1 = new Date(date1 + 'T00:00:00Z').getTime();
  const d2 = new Date(date2 + 'T00:00:00Z').getTime();
  return Math.round((d2 - d1) / (24 * 60 * 60 * 1000));
}
