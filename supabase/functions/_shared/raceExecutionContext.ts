export interface WorkoutCompletion {
  week_number?: number;
  day_name?: string;
  rating?: number;
  distance_km?: number;
  duration_minutes?: number;
  completed_at?: string;
  scheduled_date?: string;
  enjoyment?: number;
  notes?: string;
  rpe?: number;
}

export interface RecentWorkoutEntry {
  date: string;
  distanceKm: number | null;
  durationMinutes: number | null;
  avgRPE: number | null;
  notes: string | null;
}

export interface TrainingSummary {
  raceDistance: number;
  raceDate: string | null;
  readinessTier: string;
  planDesignedPeakWeeklyKm: number | null;
  planDesignedPeakLongRunKm: number | null;
  last8WeeksCompletionRate: number | null;
  last4WeeksCompletionRate: number | null;
  peakWeeklyKmAchieved: number | null;
  peakLongRunAchievedKm: number | null;
  lastLongRun: RecentWorkoutEntry | null;
  lastTempoLikeSession: RecentWorkoutEntry | null;
  lastIntervalSession: RecentWorkoutEntry | null;
  easyRunRPETrend: { direction: 'up' | 'flat' | 'down'; value: number } | null;
  qualitySessionStruggleRate: number | null;
  daysSinceLastRun: number | null;
  maxGapDaysLast8Weeks: number | null;
  injuryFlagLast8Weeks: boolean;
  representativeRecentWorkouts: RecentWorkoutEntry[];
}

function daysBetween(isoA: string, isoB: string): number {
  const a = new Date(isoA).getTime();
  const b = new Date(isoB).getTime();
  return Math.round(Math.abs(a - b) / 86400000);
}

function weeksAgo(isoDate: string, todayISO: string): number {
  return daysBetween(isoDate, todayISO) / 7;
}

function inferReadinessTier(
  completionRate8w: number | null,
  peakLongRun: number | null,
  planPeakLongRun: number | null,
  injuryFlag: boolean
): string {
  if (injuryFlag) return 'conservative';
  if (completionRate8w === null) return 'standard';

  const longRunRatio = (peakLongRun && planPeakLongRun && planPeakLongRun > 0)
    ? peakLongRun / planPeakLongRun
    : null;

  if (completionRate8w >= 0.85 && (!longRunRatio || longRunRatio >= 0.85)) return 'performance';
  if (completionRate8w >= 0.65) return 'standard';
  return 'conservative';
}

export function computeTrainingSummary(
  completions: WorkoutCompletion[],
  answers: Record<string, any>,
  planData: { days?: Array<{ workout: string; distance_km?: number; date?: string }> },
  todayISO: string,
  injuryLogs?: Array<{ created_at?: string; status?: string }>
): TrainingSummary {
  const raceDistanceRaw = answers?.raceDistance || '';
  const raceDate: string | null = answers?.raceDate || null;

  const raceDistanceKm = parseRaceDistanceKm(raceDistanceRaw);

  const sorted = [...completions]
    .filter(c => !!c.completed_at)
    .sort((a, b) => new Date(b.completed_at!).getTime() - new Date(a.completed_at!).getTime());

  const cutoff8w = new Date(todayISO);
  cutoff8w.setDate(cutoff8w.getDate() - 56);
  const cutoff4w = new Date(todayISO);
  cutoff4w.setDate(cutoff4w.getDate() - 28);

  const last8w = sorted.filter(c => new Date(c.completed_at!) >= cutoff8w);
  const last4w = sorted.filter(c => new Date(c.completed_at!) >= cutoff4w);

  const planDays = planData?.days || [];
  const planDaysIn8w = planDays.filter(d => {
    if (!d.date) return false;
    const dayDate = new Date(d.date);
    return dayDate >= cutoff8w && dayDate <= new Date(todayISO);
  });
  const scheduledIn8w = planDaysIn8w.filter(d => d.workout && d.workout !== 'Rest').length;
  const scheduledIn4w = planDays.filter(d => {
    if (!d.date) return false;
    const dayDate = new Date(d.date);
    return dayDate >= cutoff4w && dayDate <= new Date(todayISO) && d.workout && d.workout !== 'Rest';
  }).length;

  const last8WeeksCompletionRate = scheduledIn8w > 0 ? Math.min(1, last8w.length / scheduledIn8w) : null;
  const last4WeeksCompletionRate = scheduledIn4w > 0 ? Math.min(1, last4w.length / scheduledIn4w) : null;

  const weeklyKmByWeek = groupByWeek(last8w);
  const peakWeeklyKmAchieved = weeklyKmByWeek.length > 0
    ? Math.max(...weeklyKmByWeek.map(wk => wk.totalKm))
    : null;

  const planDaysWithDistance = planDays.filter(d => d.distance_km && d.distance_km > 0);
  const planDesignedPeakWeeklyKm = estimatePlanPeakWeekly(planDays);
  const planDesignedPeakLongRunKm = planDaysWithDistance.length > 0
    ? Math.max(...planDaysWithDistance.map(d => d.distance_km!))
    : null;

  const peakLongRunAchievedKm = last8w.reduce((max, c) => {
    const km = c.distance_km ?? 0;
    return km > max ? km : max;
  }, 0) || null;

  const longRuns = last8w
    .filter(c => (c.distance_km ?? 0) >= 12)
    .sort((a, b) => new Date(b.completed_at!).getTime() - new Date(a.completed_at!).getTime());

  const lastLongRun = longRuns[0] ? toRecentEntry(longRuns[0]) : null;

  const tempoKeywords = /tempo|threshold|cruise|progressive|lactate/i;
  const intervalKeywords = /interval|repeat|vo2|fartlek|track|800|400|1000m/i;

  const lastTempoLikeSession = last8w
    .filter(c => tempoKeywords.test(c.notes || '') || (c.rpe && c.rpe >= 7 && (c.distance_km ?? 0) < 14 && (c.distance_km ?? 0) > 0))
    .sort((a, b) => new Date(b.completed_at!).getTime() - new Date(a.completed_at!).getTime())[0];

  const lastIntervalSession = last8w
    .filter(c => intervalKeywords.test(c.notes || ''))
    .sort((a, b) => new Date(b.completed_at!).getTime() - new Date(a.completed_at!).getTime())[0];

  const easyRuns = last8w
    .filter(c => (c.rpe ?? 0) <= 4 && (c.rpe ?? 0) > 0)
    .sort((a, b) => new Date(a.completed_at!).getTime() - new Date(b.completed_at!).getTime());

  let easyRunRPETrend: TrainingSummary['easyRunRPETrend'] = null;
  if (easyRuns.length >= 4) {
    const half = Math.floor(easyRuns.length / 2);
    const olderAvg = avg(easyRuns.slice(0, half).map(r => r.rpe ?? 0));
    const recentAvg = avg(easyRuns.slice(half).map(r => r.rpe ?? 0));
    const diff = recentAvg - olderAvg;
    easyRunRPETrend = {
      direction: diff > 0.3 ? 'up' : diff < -0.3 ? 'down' : 'flat',
      value: Math.round(recentAvg * 10) / 10,
    };
  }

  const qualitySessions = last8w.filter(c => (c.rpe ?? 0) >= 7);
  const struggledQuality = qualitySessions.filter(c => (c.rpe ?? 0) >= 9);
  const qualitySessionStruggleRate = qualitySessions.length > 0
    ? struggledQuality.length / qualitySessions.length
    : null;

  const daysSinceLastRun = sorted[0]?.completed_at
    ? daysBetween(sorted[0].completed_at, todayISO)
    : null;

  let maxGapDaysLast8Weeks: number | null = null;
  if (last8w.length >= 2) {
    const dates = [...last8w]
      .sort((a, b) => new Date(a.completed_at!).getTime() - new Date(b.completed_at!).getTime())
      .map(c => c.completed_at!);
    let maxGap = 0;
    for (let i = 1; i < dates.length; i++) {
      const gap = daysBetween(dates[i - 1], dates[i]);
      if (gap > maxGap) maxGap = gap;
    }
    maxGapDaysLast8Weeks = maxGap;
  }

  const injuryFlagLast8Weeks = (injuryLogs || []).some(inj => {
    if (!inj.created_at) return false;
    return new Date(inj.created_at) >= cutoff8w &&
      (!inj.status || inj.status !== 'resolved');
  });

  const representativeRecentWorkouts: RecentWorkoutEntry[] = sorted
    .slice(0, 5)
    .map(toRecentEntry);

  const readinessTier = inferReadinessTier(
    last8WeeksCompletionRate,
    peakLongRunAchievedKm,
    planDesignedPeakLongRunKm,
    injuryFlagLast8Weeks
  );

  return {
    raceDistance: raceDistanceKm,
    raceDate,
    readinessTier,
    planDesignedPeakWeeklyKm,
    planDesignedPeakLongRunKm,
    last8WeeksCompletionRate,
    last4WeeksCompletionRate,
    peakWeeklyKmAchieved,
    peakLongRunAchievedKm,
    lastLongRun,
    lastTempoLikeSession: lastTempoLikeSession ? toRecentEntry(lastTempoLikeSession) : null,
    lastIntervalSession: lastIntervalSession ? toRecentEntry(lastIntervalSession) : null,
    easyRunRPETrend,
    qualitySessionStruggleRate,
    daysSinceLastRun,
    maxGapDaysLast8Weeks,
    injuryFlagLast8Weeks,
    representativeRecentWorkouts,
  };
}

function toRecentEntry(c: WorkoutCompletion): RecentWorkoutEntry {
  return {
    date: c.completed_at || c.scheduled_date || '',
    distanceKm: c.distance_km ?? null,
    durationMinutes: c.duration_minutes ?? null,
    avgRPE: c.rpe ?? c.rating ?? null,
    notes: c.notes ?? null,
  };
}

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((s, n) => s + n, 0) / nums.length;
}

function groupByWeek(completions: WorkoutCompletion[]): Array<{ weekStart: string; totalKm: number }> {
  const map = new Map<string, number>();
  for (const c of completions) {
    if (!c.completed_at) continue;
    const d = new Date(c.completed_at);
    const dayOfWeek = d.getDay();
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((dayOfWeek + 6) % 7));
    const key = monday.toISOString().slice(0, 10);
    map.set(key, (map.get(key) ?? 0) + (c.distance_km ?? 0));
  }
  return Array.from(map.entries()).map(([weekStart, totalKm]) => ({ weekStart, totalKm }));
}

function estimatePlanPeakWeekly(planDays: Array<{ workout: string; distance_km?: number; date?: string }>): number | null {
  if (!planDays.length) return null;
  const weeklyMap = new Map<string, number>();
  for (const d of planDays) {
    if (!d.date || !d.distance_km) continue;
    const date = new Date(d.date);
    const dow = date.getDay();
    const monday = new Date(date);
    monday.setDate(date.getDate() - ((dow + 6) % 7));
    const key = monday.toISOString().slice(0, 10);
    weeklyMap.set(key, (weeklyMap.get(key) ?? 0) + d.distance_km);
  }
  if (weeklyMap.size === 0) return null;
  return Math.max(...Array.from(weeklyMap.values()));
}

export function parseRaceDistanceKm(raceDistance: string): number {
  if (!raceDistance) return 0;
  const lower = raceDistance.toLowerCase();
  if (lower.includes('marathon') && !lower.includes('half')) return 42.195;
  if (lower.includes('half')) return 21.1;
  if (lower.includes('10k') || lower === '10') return 10;
  if (lower.includes('5k') || lower === '5') return 5;
  const match = lower.match(/(\d+\.?\d*)/);
  return match ? parseFloat(match[1]) : 0;
}

export function isRaceExecutionIntent(message: string): boolean {
  const lower = message.toLowerCase();
  const raceExecutionPatterns = [
    /race\s+(day|plan|strategy|execution|advice|tips?|prep)/i,
    /how\s+(should\s+i|do\s+i)\s+(run|pace|execute|approach|tackle|handle)\s+(the\s+)?(race|marathon|half|10k|5k)/i,
    /race\s+(pace|effort|tactic|approach|execution)/i,
    /pacing\s+strategy/i,
    /start\s+(the\s+)?(race|marathon|half)/i,
    /run\s+the\s+race/i,
    /on\s+race\s+day/i,
    /advice\s+for\s+(the\s+)?(race|marathon|half)/i,
    /what\s+(should|pace)\s+.*(race|marathon)/i,
    /ready\s+for\s+(the\s+)?(race|marathon|half)/i,
    /fueling\s+(plan|strategy|during|race)/i,
    /negative\s+split/i,
  ];
  return raceExecutionPatterns.some(p => p.test(lower));
}
