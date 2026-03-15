/**
 * Builds a coaching-ready context block from post-workout feedback data.
 * Queries both workout_completions (raw telemetry) and training_plan_workout_feedback
 * (structured key-workout feedback) and synthesises them into a prompt section the
 * AI coach can reason about directly.
 */

interface CompletionRow {
  scheduled_date: string | null;
  rating: number | null;
  distance_km: number | null;
  duration_minutes: number | null;
  enjoyment: number | null;
  notes: string | null;
  week_number: number | null;
  day_name: string | null;
}

interface FeedbackRow {
  workout_date: string;
  week_number: number | null;
  dow: string | null;
  completion_status: 'completed' | 'modified' | 'missed';
  effort_vs_expected: 'easier' | 'as_expected' | 'harder' | null;
  hr_matched_target: 'yes' | 'no' | 'unsure' | null;
  notes: string | null;
  is_key_workout: boolean | null;
  workout_type: string | null;
  workout_role: string | null;
}

export interface WorkoutFeedbackContext {
  promptSection: string;
  hasFeedback: boolean;
  suggestedActions: string[];
  recentMissedCount: number;
  recentHarderCount: number;
  recentEasierCount: number;
  keyWorkoutStruggleRate: number | null;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function rpeLabel(rpe: number): string {
  if (rpe <= 3) return 'easy';
  if (rpe <= 5) return 'moderate';
  if (rpe <= 7) return 'controlled hard';
  if (rpe <= 8) return 'hard';
  return 'very hard';
}

export async function buildWorkoutFeedbackContext(
  supabase: any,
  planId: string,
  windowDays = 28
): Promise<WorkoutFeedbackContext> {
  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - windowDays);
  const windowStartISO = windowStart.toISOString().split('T')[0];

  const [completionsResult, feedbackResult] = await Promise.all([
    supabase
      .from('workout_completions')
      .select('scheduled_date, rating, distance_km, duration_minutes, enjoyment, notes, week_number, day_name')
      .eq('training_plan_id', planId)
      .gte('scheduled_date', windowStartISO)
      .order('scheduled_date', { ascending: false })
      .limit(40),
    supabase
      .from('training_plan_workout_feedback')
      .select('workout_date, week_number, dow, completion_status, effort_vs_expected, hr_matched_target, notes, is_key_workout, workout_type, workout_role')
      .eq('training_plan_id', planId)
      .gte('workout_date', windowStartISO)
      .order('workout_date', { ascending: false })
      .limit(30),
  ]);

  const completions: CompletionRow[] = completionsResult.data || [];
  const feedbackRows: FeedbackRow[] = feedbackResult.data || [];

  if (completions.length === 0 && feedbackRows.length === 0) {
    return {
      promptSection: '',
      hasFeedback: false,
      suggestedActions: [],
      recentMissedCount: 0,
      recentHarderCount: 0,
      recentEasierCount: 0,
      keyWorkoutStruggleRate: null,
    };
  }

  const completedCount = completions.filter(c => c.rating != null).length;
  const missedCount = 0;
  const totalWithCompletion = completedCount;
  const completionRate = totalWithCompletion > 0
    ? 100
    : null;

  const completedWithRpe = completions.filter(c => c.rating != null);
  const avgRpe = completedWithRpe.length > 0
    ? Math.round((completedWithRpe.reduce((s, c) => s + (c.rating ?? 0), 0) / completedWithRpe.length) * 10) / 10
    : null;

  const rpeByType: Record<string, number[]> = {};
  for (const c of completedWithRpe) {
    const dayName = (c.day_name ?? '').toLowerCase();
    let type = 'easy';
    if (dayName.includes('tempo') || dayName.includes('threshold')) type = 'tempo';
    else if (dayName.includes('interval') || dayName.includes('repeat')) type = 'interval';
    else if (dayName.includes('long')) type = 'long_run';
    if (!rpeByType[type]) rpeByType[type] = [];
    rpeByType[type].push(c.rating!);
  }

  const easyRpes = rpeByType['easy'] ?? [];
  const avgEasyRpe = easyRpes.length > 0
    ? Math.round((easyRpes.reduce((s, v) => s + v, 0) / easyRpes.length) * 10) / 10
    : null;

  const enjoymentScores = completions.filter(c => c.enjoyment != null).map(c => c.enjoyment!);
  const avgEnjoyment = enjoymentScores.length > 0
    ? Math.round((enjoymentScores.reduce((s, v) => s + v, 0) / enjoymentScores.length) * 10) / 10
    : null;

  const recentNotes = completions
    .filter(c => c.notes && c.notes.trim().length > 0)
    .slice(0, 5)
    .map(c => `  - ${c.scheduled_date ? fmtDate(c.scheduled_date) : '?'} (W${c.week_number ?? '?'} ${c.day_name ?? ''}): "${c.notes!.trim().substring(0, 120)}"`)
    .join('\n');

  const harder = feedbackRows.filter(f => f.effort_vs_expected === 'harder');
  const easier = feedbackRows.filter(f => f.effort_vs_expected === 'easier');
  const keyWorkouts = feedbackRows.filter(f => f.is_key_workout);
  const keyStruggled = keyWorkouts.filter(f => f.effort_vs_expected === 'harder' || f.completion_status === 'missed');
  const keyWorkoutStruggleRate = keyWorkouts.length > 0
    ? Math.round((keyStruggled.length / keyWorkouts.length) * 100)
    : null;

  const hrMismatch = feedbackRows.filter(f => f.hr_matched_target === 'no');

  const missedKeyWorkouts = feedbackRows.filter(f => f.is_key_workout && f.completion_status === 'missed');

  const recentFeedbackNotes = feedbackRows
    .filter(f => f.notes && f.notes.trim().length > 0)
    .slice(0, 4)
    .map(f => `  - ${fmtDate(f.workout_date)} ${f.workout_type ?? ''} (${f.completion_status}${f.effort_vs_expected ? ', felt ' + f.effort_vs_expected : ''}): "${f.notes!.trim().substring(0, 100)}"`)
    .join('\n');

  const suggestedActions: string[] = [];

  if (harder.length >= 2) {
    suggestedActions.push('Multiple workouts felt harder than expected — consider whether intensity should be reviewed.');
  }
  if (easier.length >= 3) {
    suggestedActions.push('Several workouts felt easier than expected — runner may be ready for a progression.');
  }
  if (missedCount >= 3) {
    suggestedActions.push(`${missedCount} workouts missed in last ${windowDays} days — explore whether scheduling changes or load reduction would help.`);
  }
  if (missedKeyWorkouts.length >= 2) {
    suggestedActions.push('Key workouts (long run, tempo, intervals) are being missed — flag this pattern proactively.');
  }
  if (avgEasyRpe !== null && avgEasyRpe > 5) {
    suggestedActions.push(`Easy runs averaging RPE ${avgEasyRpe} — pace may need to be reduced to protect aerobic base.`);
  }
  if (hrMismatch.length >= 2) {
    suggestedActions.push('Heart rate not matching targets on multiple sessions — could indicate fatigue, heat, or pacing issues.');
  }
  if (keyWorkoutStruggleRate !== null && keyWorkoutStruggleRate > 50) {
    suggestedActions.push(`${keyWorkoutStruggleRate}% of key workouts are being struggled with or missed — structural load review warranted.`);
  }

  const lines: string[] = [];
  lines.push('## POST-WORKOUT FEEDBACK CONTEXT');
  lines.push(`Window: last ${windowDays} days`);
  lines.push('');

  lines.push('### Completion Summary');
  if (completionRate !== null) lines.push(`- Completion rate: ${completionRate}% (${completedCount} completed, ${missedCount} missed)`);
  if (avgRpe !== null) lines.push(`- Average RPE across all completed workouts: ${avgRpe}/10 (${rpeLabel(avgRpe)})`);
  if (avgEasyRpe !== null) lines.push(`- Average RPE on easy runs: ${avgEasyRpe}/10${avgEasyRpe > 5 ? ' ⚠ above expected easy effort' : ''}`);
  if (avgEnjoyment !== null) lines.push(`- Average enjoyment: ${avgEnjoyment}/5`);

  const longRuns = completions.filter(c => c.rating != null && (c.day_name ?? '').toLowerCase().includes('long'));
  if (longRuns.length > 0) {
    const lr = longRuns[0];
    lines.push(`- Most recent long run: ${lr.scheduled_date ? fmtDate(lr.scheduled_date) : '?'} — ${lr.distance_km ? lr.distance_km + ' km' : 'distance not recorded'}, RPE ${lr.rating ?? 'not recorded'}`);
  }

  lines.push('');
  lines.push('### Key Workout Effort Feedback');
  lines.push(`- Felt harder than expected: ${harder.length} session(s)`);
  lines.push(`- Felt as expected: ${feedbackRows.filter(f => f.effort_vs_expected === 'as_expected').length} session(s)`);
  lines.push(`- Felt easier than expected: ${easier.length} session(s)`);
  if (keyWorkoutStruggleRate !== null) {
    lines.push(`- Key workout struggle rate: ${keyWorkoutStruggleRate}%`);
  }
  if (hrMismatch.length > 0) {
    lines.push(`- Sessions where HR did not match target: ${hrMismatch.length}`);
  }

  if (recentFeedbackNotes) {
    lines.push('');
    lines.push('### Runner Notes (from feedback forms)');
    lines.push(recentFeedbackNotes);
  }

  if (recentNotes) {
    lines.push('');
    lines.push('### Completion Notes');
    lines.push(recentNotes);
  }

  if (suggestedActions.length > 0) {
    lines.push('');
    lines.push('### Coaching Signals (act on these if relevant)');
    for (const action of suggestedActions) {
      lines.push(`- ${action}`);
    }
  }

  lines.push('');
  lines.push('USE THIS DATA: Reference the above when advising on intensity, load, scheduling, or plan modifications. If the runner asks why you\'re suggesting a change, ground it in this data. Proactively flag patterns you see — do not wait to be asked.');

  return {
    promptSection: lines.join('\n'),
    hasFeedback: true,
    suggestedActions,
    recentMissedCount: missedCount,
    recentHarderCount: harder.length,
    recentEasierCount: easier.length,
    keyWorkoutStruggleRate,
  };
}
