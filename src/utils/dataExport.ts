import { supabase } from '../lib/supabase';
import type { PlanData } from '../lib/supabase';

export interface ExportData {
  trainingPlans: any[];
  workoutCompletions: any[];
  workoutNotes: any[];
  sleepLogs: any[];
  restingHeartRateLogs: any[];
  injuryLogs: any[];
  hydrationLogs: any[];
  nutritionLogs: any[];
  racePlans: any[];
  userStreaks: any;
  heartRateZones: any;
}

export async function fetchAllUserData(userId: string): Promise<ExportData> {
  const [
    trainingPlans,
    workoutCompletions,
    workoutNotes,
    sleepLogs,
    restingHeartRateLogs,
    injuryLogs,
    hydrationLogs,
    nutritionLogs,
    racePlans,
    userStreaks,
    heartRateZones,
  ] = await Promise.all([
    supabase.from('training_plans').select('*').eq('user_id', userId),
    supabase.from('workout_completions').select('*').eq('user_id', userId),
    supabase.from('workout_notes').select('*').eq('user_id', userId),
    supabase.from('sleep_logs').select('*').eq('user_id', userId),
    supabase.from('resting_heart_rate_logs').select('*').eq('user_id', userId),
    supabase.from('injury_logs').select('*').eq('user_id', userId),
    supabase.from('hydration_logs').select('*').eq('user_id', userId),
    supabase.from('nutrition_logs').select('*').eq('user_id', userId),
    supabase.from('race_plans').select('*').eq('user_id', userId),
    supabase.from('user_streaks').select('*').eq('user_id', userId).maybeSingle(),
    supabase.from('heart_rate_zones').select('*').eq('user_id', userId).maybeSingle(),
  ]);

  return {
    trainingPlans: trainingPlans.data || [],
    workoutCompletions: workoutCompletions.data || [],
    workoutNotes: workoutNotes.data || [],
    sleepLogs: sleepLogs.data || [],
    restingHeartRateLogs: restingHeartRateLogs.data || [],
    injuryLogs: injuryLogs.data || [],
    hydrationLogs: hydrationLogs.data || [],
    nutritionLogs: nutritionLogs.data || [],
    racePlans: racePlans.data || [],
    userStreaks: userStreaks.data || null,
    heartRateZones: heartRateZones.data || null,
  };
}

export function exportToJSON(data: ExportData): void {
  const jsonString = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `training-data-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportToCSV(data: ExportData): void {
  const zip: { [key: string]: string } = {};

  if (data.workoutCompletions.length > 0) {
    const headers = ['Week', 'Day', 'Completed At', 'Rating', 'Distance (km)', 'Duration (min)'];
    const rows = data.workoutCompletions.map((w: any) => [
      w.week_number,
      w.day_name,
      new Date(w.completed_at).toLocaleDateString(),
      w.rating || '',
      w.distance_km ? w.distance_km.toFixed(2) : '',
      w.duration_minutes || '',
    ]);
    zip['workout_completions.csv'] = [headers, ...rows].map(row => row.join(',')).join('\n');
  }

  if (data.sleepLogs.length > 0) {
    const headers = ['Date', 'Hours Slept', 'Quality (1-5)', 'Notes'];
    const rows = data.sleepLogs.map((s: any) => [
      s.log_date,
      s.hours_slept,
      s.quality_rating || '',
      `"${(s.notes || '').replace(/"/g, '""')}"`,
    ]);
    zip['sleep_logs.csv'] = [headers, ...rows].map(row => row.join(',')).join('\n');
  }

  if (data.restingHeartRateLogs.length > 0) {
    const headers = ['Date', 'Resting HR (bpm)', 'Notes'];
    const rows = data.restingHeartRateLogs.map((r: any) => [
      r.log_date,
      r.resting_hr,
      `"${(r.notes || '').replace(/"/g, '""')}"`,
    ]);
    zip['resting_heart_rate_logs.csv'] = [headers, ...rows].map(row => row.join(',')).join('\n');
  }

  if (data.hydrationLogs.length > 0) {
    const headers = ['Date', 'Water (ml)', 'Electrolytes', 'Notes'];
    const rows = data.hydrationLogs.map((h: any) => [
      h.log_date,
      h.water_ml,
      h.electrolytes ? 'Yes' : 'No',
      `"${(h.notes || '').replace(/"/g, '""')}"`,
    ]);
    zip['hydration_logs.csv'] = [headers, ...rows].map(row => row.join(',')).join('\n');
  }

  if (data.nutritionLogs.length > 0) {
    const headers = ['Date', 'Meal Type', 'Description', 'Calories', 'Carbs (g)', 'Protein (g)', 'Fat (g)', 'Notes'];
    const rows = data.nutritionLogs.map((n: any) => [
      n.log_date,
      n.meal_type,
      `"${n.description.replace(/"/g, '""')}"`,
      n.calories || '',
      n.carbs_g || '',
      n.protein_g || '',
      n.fat_g || '',
      `"${(n.notes || '').replace(/"/g, '""')}"`,
    ]);
    zip['nutrition_logs.csv'] = [headers, ...rows].map(row => row.join(',')).join('\n');
  }

  if (data.injuryLogs.length > 0) {
    const headers = ['Injury Type', 'Body Part', 'Severity', 'Status', 'Start Date', 'End Date', 'Notes'];
    const rows = data.injuryLogs.map((i: any) => [
      i.injury_type,
      i.body_part,
      i.severity,
      i.status,
      i.start_date,
      i.end_date || '',
      `"${(i.notes || '').replace(/"/g, '""')}"`,
    ]);
    zip['injury_logs.csv'] = [headers, ...rows].map(row => row.join(',')).join('\n');
  }

  if (Object.keys(zip).length === 0) {
    alert('No data available to export');
    return;
  }

  if (Object.keys(zip).length === 1) {
    const [filename, content] = Object.entries(zip)[0];
    const blob = new Blob([content], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } else {
    for (const [filename, content] of Object.entries(zip)) {
      const blob = new Blob([content], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  }
}

function csvCell(value: string): string {
  const escaped = value.replace(/"/g, '""');
  return `"${escaped}"`;
}

function triggerDownload(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export interface PlanExportRow {
  week: number | string;
  day: string;
  date: string;
  workout_type: string;
  workout: string;
  tips: string;
}

export function exportPlanToCSV(planData: PlanData, answers?: any, planStartDate?: string | null): void {
  const rows: PlanExportRow[] = [];
  const DAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  if (planData.days && planData.days.length > 0) {
    planData.days.forEach((day: any, idx: number) => {
      const weekNum = Math.floor(idx / 7) + 1;
      rows.push({
        week: weekNum,
        day: day.dow || '',
        date: day.date || '',
        workout_type: day.workout_type || day.workoutType || '',
        workout: day.workout || '',
        tips: Array.isArray(day.tips) ? day.tips.join(' | ') : (day.tips || ''),
      });
    });
  } else if (planData.plan && planData.plan.length > 0) {
    planData.plan.forEach((weekPlan: any) => {
      DAY_ORDER.forEach((dow) => {
        const entry = weekPlan.days?.[dow];
        if (!entry) return;
        const workout = typeof entry === 'string' ? entry : (entry.workout || '');
        const tips = typeof entry === 'string' ? '' : (Array.isArray(entry.tips) ? entry.tips.join(' | ') : (entry.tips || ''));
        const workoutType = typeof entry === 'string' ? '' : (entry.workoutType || '');
        rows.push({
          week: weekPlan.week,
          day: dow,
          date: '',
          workout_type: workoutType,
          workout,
          tips,
        });
      });
    });
  }

  if (rows.length === 0) {
    alert('No plan data available to export');
    return;
  }

  const headers = ['Week', 'Day', 'Date', 'Workout Type', 'Workout', 'Tips'];
  const csvRows = rows.map(r => [
    String(r.week),
    r.day,
    r.date,
    r.workout_type,
    csvCell(r.workout),
    csvCell(r.tips),
  ].join(','));

  const metaLines: string[] = ['# Training Plan Export'];
  if (answers?.raceDistance) metaLines.push(`# Race Distance: ${answers.raceDistance}`);
  if (answers?.raceDate || planData.race_date) metaLines.push(`# Race Date: ${answers?.raceDate || planData.race_date}`);
  if (planStartDate || planData.start_date) metaLines.push(`# Start Date: ${planStartDate || planData.start_date}`);
  if (planData.plan_type) metaLines.push(`# Plan Type: ${planData.plan_type}`);
  metaLines.push(`# Exported: ${new Date().toISOString()}`);
  metaLines.push('');

  const csvContent = [...metaLines, headers.join(','), ...csvRows].join('\n');
  const dateStr = new Date().toISOString().split('T')[0];
  const distancePart = answers?.raceDistance ? `-${answers.raceDistance.replace(/\s+/g, '-').toLowerCase()}` : '';
  triggerDownload(csvContent, `training-plan${distancePart}-${dateStr}.csv`, 'text/csv;charset=utf-8;');
}
