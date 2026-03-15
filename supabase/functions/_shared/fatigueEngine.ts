export interface WorkoutHistoryEntry {
  date: string;
  rpe: number;
  distanceKm: number;
  durationMin: number;
  completed: boolean;
  enjoyment?: number;
  notes?: string;
}

export type RPETrend = 'upward' | 'stable' | 'downward';
export type FatigueLevel = 'low' | 'moderate' | 'elevated';

export interface FatigueSignals {
  highRPEStreak: number;
  easyRunRPETrend: RPETrend;
  missedSessions14d: number;
  loadRatio: number;
  subjectiveStrainIndex: number;
  fatigueLevel: FatigueLevel;
}

function daysBefore(referenceISO: string, days: number): Date {
  const d = new Date(referenceISO);
  d.setDate(d.getDate() - days);
  return d;
}

function parseDate(iso: string): Date {
  return new Date(iso);
}

function computeHighRPEStreak(history: WorkoutHistoryEntry[], todayISO: string): number {
  const cutoff = daysBefore(todayISO, 7);
  return history.filter(
    (e) => e.completed && parseDate(e.date) >= cutoff && e.rpe >= 8
  ).length;
}

function isEasyRun(entry: WorkoutHistoryEntry): boolean {
  return entry.rpe <= 5;
}

function computeEasyRunRPETrend(history: WorkoutHistoryEntry[]): RPETrend {
  const easyRuns = history
    .filter((e) => e.completed && isEasyRun(e))
    .sort((a, b) => parseDate(a.date).getTime() - parseDate(b.date).getTime());

  if (easyRuns.length < 6) return 'stable';

  const recent = easyRuns.slice(-3);
  const previous = easyRuns.slice(-6, -3);

  const avgRecent = recent.reduce((s, e) => s + e.rpe, 0) / recent.length;
  const avgPrev = previous.reduce((s, e) => s + e.rpe, 0) / previous.length;

  const diff = avgRecent - avgPrev;
  if (diff >= 0.5) return 'upward';
  if (diff <= -0.5) return 'downward';
  return 'stable';
}

function computeMissedSessions14d(history: WorkoutHistoryEntry[], todayISO: string): number {
  const cutoff = daysBefore(todayISO, 14);
  return history.filter(
    (e) => !e.completed && parseDate(e.date) >= cutoff
  ).length;
}

function computeLoadRatio(history: WorkoutHistoryEntry[], todayISO: string): number {
  const last7Cutoff = daysBefore(todayISO, 7);
  const last28Cutoff = daysBefore(todayISO, 28);

  const last7Entries = history.filter(
    (e) => e.completed && parseDate(e.date) >= last7Cutoff
  );
  const prev21Entries = history.filter(
    (e) => e.completed && parseDate(e.date) >= last28Cutoff && parseDate(e.date) < last7Cutoff
  );

  const last7Total = last7Entries.reduce((s, e) => s + e.distanceKm, 0);
  const prev21Total = prev21Entries.reduce((s, e) => s + e.distanceKm, 0);
  const prev21Avg = prev21Entries.length > 0 ? prev21Total / 3 : 0;

  if (prev21Avg === 0) return last7Total > 0 ? 1.0 : 0;
  return Math.round((last7Total / prev21Avg) * 100) / 100;
}

function computeAvgRPELast7d(history: WorkoutHistoryEntry[], todayISO: string): number {
  const cutoff = daysBefore(todayISO, 7);
  const entries = history.filter(
    (e) => e.completed && parseDate(e.date) >= cutoff
  );
  if (entries.length === 0) return 0;
  return entries.reduce((s, e) => s + e.rpe, 0) / entries.length;
}

function computeSubjectiveStrainIndex(avgRPE7d: number, missedSessions14d: number): number {
  const raw = avgRPE7d * 0.6 + missedSessions14d * 0.4;
  return Math.round(raw * 100) / 100;
}

function classifyFatigueLevel(highRPEStreak: number, loadRatio: number): FatigueLevel {
  if (highRPEStreak >= 3 || loadRatio > 1.3) return 'elevated';
  if (highRPEStreak >= 1 || loadRatio > 1.1) return 'moderate';
  return 'low';
}

export function computeFatigueSignals(
  workoutHistory: WorkoutHistoryEntry[],
  todayISO?: string
): FatigueSignals {
  const today = todayISO ?? new Date().toISOString().split('T')[0];

  const highRPEStreak = computeHighRPEStreak(workoutHistory, today);
  const easyRunRPETrend = computeEasyRunRPETrend(workoutHistory);
  const missedSessions14d = computeMissedSessions14d(workoutHistory, today);
  const loadRatio = computeLoadRatio(workoutHistory, today);
  const avgRPE7d = computeAvgRPELast7d(workoutHistory, today);
  const subjectiveStrainIndex = computeSubjectiveStrainIndex(avgRPE7d, missedSessions14d);
  const fatigueLevel = classifyFatigueLevel(highRPEStreak, loadRatio);

  return {
    highRPEStreak,
    easyRunRPETrend,
    missedSessions14d,
    loadRatio,
    subjectiveStrainIndex,
    fatigueLevel,
  };
}

export function formatFatigueSignalsForPrompt(signals: FatigueSignals): string {
  return `Fatigue signals:
- High RPE streak (last 7d): ${signals.highRPEStreak}
- Easy run RPE trend: ${signals.easyRunRPETrend}
- Missed sessions (last 14d): ${signals.missedSessions14d}
- Load ratio (last 7d vs prior 3-week avg): ${signals.loadRatio}
- Subjective strain index: ${signals.subjectiveStrainIndex}
- Fatigue level: ${signals.fatigueLevel}`;
}
