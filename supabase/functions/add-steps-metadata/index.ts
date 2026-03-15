import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface StepsMeta {
  steps_enabled: boolean;
  allowed_steps?: string[];
  plan_steps?: any[];
  week_focus?: any[];
  workout_roles?: Record<string, string>;
  reason?: string;
  current_focus_only?: boolean;
  generated_at: string;
  generator_version: string;
}

const STEP_DEFINITIONS = {
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

function calculateWeeksToRace(raceDateStr?: string): number | null {
  if (!raceDateStr) return null;

  const today = new Date();
  const raceDate = new Date(raceDateStr);
  const diffTime = raceDate.getTime() - today.getTime();
  const diffWeeks = Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 7));

  return diffWeeks;
}

function determineStepUsage(durationWeeks: number, weeksToRace: number | null): {
  stepsEnabled: boolean;
  allowedSteps: string[];
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

function generateWeekFocus(allowedSteps: string[], durationWeeks: number, weeksToRace: number | null): any[] {
  const weekFocus: any[] = [];

  if (durationWeeks <= 4) {
    for (let week = 1; week <= durationWeeks; week++) {
      weekFocus.push({ week_number: week, focus_step_id: 'race_specific' });
    }
    return weekFocus;
  }

  if (durationWeeks <= 7) {
    const baseWeeks = Math.ceil(durationWeeks * 0.5);
    for (let week = 1; week <= baseWeeks; week++) {
      weekFocus.push({ week_number: week, focus_step_id: 'aerobic_base' });
    }
    for (let week = baseWeeks + 1; week <= durationWeeks; week++) {
      weekFocus.push({ week_number: week, focus_step_id: 'race_specific' });
    }
    return weekFocus;
  }

  if (durationWeeks >= 12) {
    const baseWeeks = 4;
    const thresholdWeeks = 3;
    const economyWeeks = 2;

    for (let week = 1; week <= baseWeeks; week++) {
      weekFocus.push({ week_number: week, focus_step_id: 'aerobic_base' });
    }

    for (let week = baseWeeks + 1; week <= baseWeeks + thresholdWeeks; week++) {
      weekFocus.push({ week_number: week, focus_step_id: 'threshold' });
    }

    for (let week = baseWeeks + thresholdWeeks + 1; week <= baseWeeks + thresholdWeeks + economyWeeks; week++) {
      weekFocus.push({ week_number: week, focus_step_id: 'economy' });
    }

    for (let week = baseWeeks + thresholdWeeks + economyWeeks + 1; week <= durationWeeks; week++) {
      weekFocus.push({ week_number: week, focus_step_id: 'race_specific' });
    }

    return weekFocus;
  }

  const baseWeeks = Math.ceil(durationWeeks * 0.35);
  const thresholdWeeks = Math.ceil(durationWeeks * 0.25);

  for (let week = 1; week <= baseWeeks; week++) {
    weekFocus.push({ week_number: week, focus_step_id: 'aerobic_base' });
  }

  for (let week = baseWeeks + 1; week <= baseWeeks + thresholdWeeks; week++) {
    weekFocus.push({ week_number: week, focus_step_id: 'threshold' });
  }

  for (let week = baseWeeks + thresholdWeeks + 1; week <= durationWeeks; week++) {
    weekFocus.push({ week_number: week, focus_step_id: 'race_specific' });
  }

  return weekFocus;
}

function isKeyWorkout(workoutText: string): boolean {
  const lowerWorkout = workoutText.toLowerCase();

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

function inferRoleFromWorkout(
  workoutText: string,
  workoutType: string | undefined,
  weekFocus: any[],
  weekNumber?: number
): string | null {
  const lowerWorkout = workoutText.toLowerCase();

  if (workoutType === 'calibration') {
    return 'calibration';
  }

  if (lowerWorkout.includes('rest') || lowerWorkout.includes('off')) {
    return 'recovery';
  }

  if (lowerWorkout.includes('race day') || lowerWorkout.includes('race:')) {
    return 'race_specific';
  }

  if (lowerWorkout.includes('race pace') || lowerWorkout.includes('marathon pace')) {
    return 'race_specific';
  }

  if (lowerWorkout.includes('tempo') || lowerWorkout.includes('threshold') || lowerWorkout.includes('lactate')) {
    return 'threshold';
  }

  if (lowerWorkout.includes('interval') || lowerWorkout.includes('repeat') || lowerWorkout.includes('strides')) {
    return 'economy';
  }

  if (lowerWorkout.includes('easy') || lowerWorkout.includes('recovery run')) {
    return 'base';
  }

  if (lowerWorkout.includes('long run')) {
    return 'base';
  }

  if (weekNumber) {
    const focus = weekFocus.find(wf => wf.week_number === weekNumber);
    if (focus) {
      return focus.focus_step_id;
    }
  }

  if (isKeyWorkout(workoutText)) {
    return 'base';
  }

  return null;
}

function inferWorkoutRoles(planData: any, weekFocus: any[]): Record<string, string> {
  const workoutRoles: Record<string, string> = {};

  if (planData.days && Array.isArray(planData.days)) {
    planData.days.forEach((day: any) => {
      const role = inferRoleFromWorkout(day.workout, day.workoutType, weekFocus);
      if (role && day.date) {
        const normalizedId = `${day.date}:${day.workoutType || 'normal'}:${day.workout_type || 'TRAIN'}`;
        workoutRoles[normalizedId] = role;
      }
    });
  }

  if (planData.plan && Array.isArray(planData.plan)) {
    planData.plan.forEach((week: any) => {
      const weekNumber = week.week;
      const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

      days.forEach(dow => {
        const dayData = week.days?.[dow];
        if (dayData) {
          const workoutText = typeof dayData === 'string' ? dayData : dayData.workout;
          const workoutType = typeof dayData === 'object' ? dayData.workoutType : 'normal';
          const role = inferRoleFromWorkout(workoutText, workoutType, weekFocus, weekNumber);

          if (role) {
            const normalizedId = `${weekNumber}:${dow}:${workoutType || 'normal'}:TRAIN`;
            workoutRoles[normalizedId] = role;
          }
        }
      });
    });
  }

  return workoutRoles;
}

function getCurrentWeekNumber(startDate: string | null, timezone: string = 'Europe/Paris'): number {
  if (!startDate) return 1;

  try {
    const start = new Date(startDate);
    const now = new Date();

    const diffTime = now.getTime() - start.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const weekNumber = Math.floor(diffDays / 7) + 1;

    return Math.max(1, weekNumber);
  } catch {
    return 1;
  }
}

function calculateInitialProgress(
  currentWeek: number,
  weekFocus: any[],
  workoutRoles: Record<string, string>,
  completedWorkouts: any[]
): { progress_percent: number; confidence: 'low' | 'med' | 'high' } {
  if (currentWeek <= 1) {
    return { progress_percent: 0, confidence: 'low' };
  }

  const currentPhase = weekFocus.find(wf => wf.week_number === currentWeek)?.focus_step_id || 'aerobic_base';

  const phaseWeeks = weekFocus.filter(wf => wf.focus_step_id === currentPhase);
  const phaseStartWeek = phaseWeeks[0]?.week_number || 1;
  const phaseEndWeek = phaseWeeks[phaseWeeks.length - 1]?.week_number || currentWeek;
  const phaseDuration = phaseEndWeek - phaseStartWeek + 1;

  const weeksIntoPhase = currentWeek - phaseStartWeek + 1;

  const keyWorkoutsInPhase = Object.entries(workoutRoles).filter(([id, role]) => {
    const weekNum = parseInt(id.split(':')[0]);
    return !isNaN(weekNum) && weekNum >= phaseStartWeek && weekNum <= currentWeek && role === currentPhase;
  });

  const completedInPhase = completedWorkouts.filter(cw => {
    const cwDate = cw.workout_date || cw.date;
    if (!cwDate) return false;

    const matchingRole = Object.entries(workoutRoles).find(([id, _role]) => {
      return id.includes(cwDate);
    });

    return matchingRole && matchingRole[1] === currentPhase;
  });

  const baseProgress = Math.min(95, (weeksIntoPhase / phaseDuration) * 100);

  let confidence: 'low' | 'med' | 'high' = 'low';
  const completedCount = completedInPhase.length;

  if (completedCount >= weeksIntoPhase * 2) {
    confidence = 'high';
  } else if (completedCount >= weeksIntoPhase) {
    confidence = 'med';
  }

  return {
    progress_percent: Math.round(baseProgress),
    confidence
  };
}

function generateStepsMeta(
  planData: any,
  durationWeeks: number,
  raceDate?: string,
  startDate?: string | null,
  timezone?: string,
  completedWorkouts: any[] = []
): StepsMeta {
  const weeksToRace = calculateWeeksToRace(raceDate);
  const stepUsage = determineStepUsage(durationWeeks, weeksToRace);

  if (!stepUsage.stepsEnabled) {
    return {
      steps_enabled: false,
      reason: stepUsage.reason,
      current_focus_only: true,
      generated_at: new Date().toISOString(),
      generator_version: 'v1.0.0'
    };
  }

  const planSteps = stepUsage.allowedSteps.map(stepId => ({
    ...(STEP_DEFINITIONS as any)[stepId]
  }));

  const weekFocus = generateWeekFocus(stepUsage.allowedSteps, durationWeeks, weeksToRace);
  const workoutRoles = inferWorkoutRoles(planData, weekFocus);

  const currentWeek = getCurrentWeekNumber(startDate || null, timezone);
  const initialProgress = calculateInitialProgress(currentWeek, weekFocus, workoutRoles, completedWorkouts);

  return {
    steps_enabled: true,
    allowed_steps: stepUsage.allowedSteps,
    plan_steps: planSteps,
    week_focus: weekFocus,
    workout_roles: workoutRoles,
    initial_progress_percent: initialProgress.progress_percent,
    initial_confidence: initialProgress.confidence,
    calculated_from_week: currentWeek,
    generated_at: new Date().toISOString(),
    generator_version: 'v1.1.0'
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    const { planId, force } = await req.json();

    if (!planId) {
      throw new Error('Missing planId parameter');
    }

    const { data: plan, error: fetchError } = await supabase
      .from('training_plans')
      .select('*')
      .eq('id', planId)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !plan) {
      throw new Error('Plan not found or access denied');
    }

    if (plan.plan_data.steps_meta && !force) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Plan already has steps metadata',
          alreadyHadMetadata: true
        }),
        {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    const durationWeeks = plan.duration_weeks || plan.plan_duration_weeks || plan.plan_data.plan?.length || 0;
    const raceDate = plan.race_date;
    const startDate = plan.start_date;
    const timezone = plan.timezone || 'Europe/Paris';

    const { data: completedWorkouts, error: completionsError } = await supabase
      .from('workout_completions')
      .select('workout_date, date, completed_at, rpe')
      .eq('plan_id', planId)
      .eq('user_id', user.id);

    if (completionsError) {
      console.error('Error fetching completions:', completionsError);
    }

    const stepsMeta = generateStepsMeta(
      plan.plan_data,
      durationWeeks,
      raceDate,
      startDate,
      timezone,
      completedWorkouts || []
    );

    const updatedPlanData = {
      ...plan.plan_data,
      steps_meta: stepsMeta
    };

    const { error: updateError } = await supabase
      .from('training_plans')
      .update({
        plan_data: updatedPlanData,
        updated_at: new Date().toISOString()
      })
      .eq('id', planId)
      .eq('user_id', user.id);

    if (updateError) {
      throw new Error(`Failed to update plan: ${updateError.message}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Steps metadata added successfully',
        stepsMeta,
        durationWeeks,
        stepsEnabled: stepsMeta.steps_enabled
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );

  } catch (err) {
    console.error('Error in add-steps-metadata:', err);
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : 'An error occurred'
      }),
      {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});
