import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@^2.57.4';
import { buildCoreTrainingGuidance, buildPaceInstructions, buildWorkoutStructureRules, buildSpecificDaysInstructions, REST_DAY_RULES, buildTaperProtocol } from '../_shared/promptBuilder.ts';
import { buildStructuralGuidance, parseRaceDistanceKm, StructuralGuidance } from '../_shared/planStructureBuilder.ts';
import { normalizePlanToStructure } from '../_shared/planNormalizer.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface DayWorkout {
  date: string;
  dow: string;
  workout: string;
  tips: string[];
  workout_type: 'TRAIN' | 'REST' | 'RACE';
}

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const INTERVAL_REP_RE = /(\d+)\s*[×x]\s*(\d+(?:\.\d+)?)\s*km/gi;

function sanitizeIntervalWorkout(workout: string): string {
  if (!workout || workout.toLowerCase() === 'rest') return workout;
  INTERVAL_REP_RE.lastIndex = 0;
  return workout.replace(INTERVAL_REP_RE, (match, repCountStr, repKmStr) => {
    const repCount = parseInt(repCountStr, 10);
    const repDistanceKm = parseFloat(repKmStr);
    if (repDistanceKm > 3 && repCount >= 2) {
      const totalKm = Math.round(repCount * repDistanceKm);
      console.error(`[IntervalGuard] Rejected "${match}" — rep distance ${repDistanceKm} km > 3 km. Converting to ${totalKm} km tempo run.`);
      return `${totalKm} km tempo run`;
    }
    return match;
  });
}

function buildFullSkeleton(startDate: string, raceDate: string | null, availableDays: string[], planDurationWeeks?: number): DayWorkout[] {
  const skeleton: DayWorkout[] = [];
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);

  let end: Date;

  if (raceDate) {
    end = new Date(raceDate);
    end.setHours(0, 0, 0, 0);
  } else if (planDurationWeeks) {
    end = new Date(start);
    end.setDate(end.getDate() + (planDurationWeeks * 7));
  } else {
    throw new Error('Either raceDate or planDurationWeeks must be provided');
  }

  const currentDate = new Date(start);
  while (currentDate <= end) {
    const dateStr = currentDate.toISOString().split('T')[0];
    const dayOfWeek = DAYS_OF_WEEK[currentDate.getDay()];

    if (raceDate && dateStr === raceDate) {
      skeleton.push({ date: dateStr, dow: dayOfWeek, workout: '', tips: [], workout_type: 'RACE' });
    } else if (availableDays.includes(dayOfWeek)) {
      skeleton.push({ date: dateStr, dow: dayOfWeek, workout: '', tips: [], workout_type: 'TRAIN' });
    } else {
      skeleton.push({ date: dateStr, dow: dayOfWeek, workout: '', tips: [], workout_type: 'REST' });
    }

    currentDate.setDate(currentDate.getDate() + 1);
  }

  return skeleton;
}

function assignRestWorkouts(skeleton: DayWorkout[]): void {
  skeleton.forEach((day) => {
    if (day.workout_type === 'REST') {
      day.workout = 'Rest';
      day.tips = [
        'Complete rest is essential for adaptation - this is when your body actually gets stronger. Training breaks down muscle fibers; rest rebuilds them stronger.',
        'Light stretching, foam rolling, or walking (under 20 minutes) is fine if you feel restless, but avoid any cardiovascular stress.',
        'Prioritize 8+ hours of quality sleep. Consider going to bed 30-60 minutes earlier than usual. Sleep is when growth hormone peaks and muscle repair happens.',
        'Focus on anti-inflammatory nutrition: lean proteins for muscle repair, colorful vegetables for antioxidants, and omega-3 rich foods like salmon or walnuts.',
        'Mental recovery is just as important as physical. Use this day to visualize your goals, review your progress, and reconnect with why you\'re training.',
        'If you feel overly fatigued or notice persistent soreness, this may indicate you need additional rest. Don\'t hesitate to convert an easy run day to rest.'
      ];
    }
  });
}

function assignRaceWorkout(skeleton: DayWorkout[], raceDistance: string): void {
  skeleton.forEach(day => {
    if (day.workout_type === 'RACE') {
      day.workout = `RACE DAY: ${raceDistance}\n\nThis is your goal race! Trust your training, stick to your race plan, and enjoy the experience.`;
      day.tips = [
        'Start conservatively and build into your pace',
        'Stick to your fueling and hydration plan',
        'Stay mentally positive throughout',
        'Remember why you trained for this!'
      ];
    }
  });
}

function insertCalibrationWorkout(skeleton: DayWorkout[], startDate: string, availableDays: string[], raceDistance: string, longRunDay?: string): void {
  console.log('Inserting calibration workout for race distance:', raceDistance, 'longRunDay:', longRunDay);

  const normalizedDistance = (raceDistance || '').toLowerCase();
  let calibrationWorkout = '';
  let testType = 'MARATHON';

  if (normalizedDistance.includes('5k') || normalizedDistance.includes('10k')) {
    testType = normalizedDistance.includes('5k') ? '5K' : '10K';
    calibrationWorkout = `**Warm up:** 10–15 min easy (RPE 2–3)\n**Work:** 15 min continuous at controlled hard effort (RPE ~8)\n**Cool down:** 10 min easy\n\nThis calibration test will help determine your optimal training paces. Run at a steady, controlled hard effort for the 15-minute work segment. Avoid sprinting or surging - aim for even pacing throughout.`;
  } else if (normalizedDistance.includes('half')) {
    testType = 'HM';
    calibrationWorkout = `**Warm up:** 10–15 min easy\n**Work:** 30 min continuous steady progression (RPE 5 → 7)\n**Cool down:** 10 min easy\n\nThis calibration test will help determine your optimal training paces. Start at a comfortable pace (RPE 5) and gradually build to comfortably hard (RPE 7) by the end. No sharp surges - keep the effort progression smooth and controlled.`;
  } else {
    testType = 'MARATHON';
    calibrationWorkout = `**Warm up:** 10–15 min easy\n**Work:** 20 min continuous controlled hard effort (RPE ~7.5–8)\n**Cool down:** 10 min easy\n\nThis calibration test will help determine your optimal training paces. Run at a controlled hard effort for the 20-minute work segment. Aim for steady, even pacing - not a race effort, but a strong sustained push.`;
  }

  const start = new Date(startDate);
  const weekOneEnd = new Date(start);
  weekOneEnd.setDate(start.getDate() + 6);
  weekOneEnd.setHours(23, 59, 59, 999);

  const weekTwoEnd = new Date(start);
  weekTwoEnd.setDate(start.getDate() + 13);
  weekTwoEnd.setHours(23, 59, 59, 999);

  const longRunDowShort = longRunDay ? longRunDay.slice(0, 3) : null;

  const week1TrainDays: DayWorkout[] = [];
  const week2TrainDays: DayWorkout[] = [];

  for (const day of skeleton) {
    const dayDate = new Date(day.date);
    if (day.workout_type === 'TRAIN') {
      if (dayDate >= start && dayDate <= weekOneEnd) {
        week1TrainDays.push(day);
      } else if (dayDate > weekOneEnd && dayDate <= weekTwoEnd) {
        week2TrainDays.push(day);
      }
    }
  }

  let targetDay: DayWorkout | null = null;

  const nonLongRunDaysWeek1 = week1TrainDays.filter(d => d.dow !== longRunDowShort);
  const nonLongRunDaysWeek2 = week2TrainDays.filter(d => d.dow !== longRunDowShort);

  if (nonLongRunDaysWeek1.length > 0) {
    if (nonLongRunDaysWeek1.length >= 2) {
      targetDay = nonLongRunDaysWeek1[1];
    } else {
      targetDay = nonLongRunDaysWeek1[0];
    }
    console.log(`[Calibration Placement] Selected non-long-run day in Week 1: ${targetDay.date} (${targetDay.dow})`);
  } else if (nonLongRunDaysWeek2.length > 0) {
    targetDay = nonLongRunDaysWeek2[0];
    console.log(`[Calibration Placement] No suitable day in Week 1, using Week 2: ${targetDay.date} (${targetDay.dow})`);
  } else if (week1TrainDays.length > 0) {
    targetDay = week1TrainDays[0];
    console.log(`[Calibration Placement] Fallback to first available training day: ${targetDay.date} (${targetDay.dow})`);
  }

  if (!targetDay) {
    console.error('No training day found in first 2 weeks for calibration workout');
    return;
  }

  targetDay.workout = calibrationWorkout;
  targetDay.tips = [
    'Record data from the work segment only - exclude warm-up and cool-down',
    'Aim for even pacing throughout the effort - avoid starting too fast',
    'Choose a flat course if possible to get accurate baseline data',
    'Use a GPS watch or app to track distance, pace, and heart rate',
    'After completing, you will be prompted to enter your test results'
  ];

  (targetDay as any).workoutType = 'calibration';
  (targetDay as any).calibrationTag = {
    kind: 'calibration',
    testType: testType
  };

  console.log(`Calibration workout inserted on ${targetDay.date} (${targetDay.dow})`);
}

function convertToWeeks(skeleton: DayWorkout[], startDate: string): any[] {
  const weeks: any[] = [];
  const groupedByWeek = new Map<number, DayWorkout[]>();

  skeleton.forEach(day => {
    const date = new Date(day.date);
    const start = new Date(startDate);
    date.setHours(0, 0, 0, 0);
    start.setHours(0, 0, 0, 0);

    const daysSinceStart = Math.floor((date.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const weekNumber = Math.floor(daysSinceStart / 7) + 1;

    if (!groupedByWeek.has(weekNumber)) {
      groupedByWeek.set(weekNumber, []);
    }
    groupedByWeek.get(weekNumber)!.push(day);
  });

  groupedByWeek.forEach((days, weekNumber) => {
    const weekDays: any = {
      Mon: { workout: '', tips: [], date: '' },
      Tue: { workout: '', tips: [], date: '' },
      Wed: { workout: '', tips: [], date: '' },
      Thu: { workout: '', tips: [], date: '' },
      Fri: { workout: '', tips: [], date: '' },
      Sat: { workout: '', tips: [], date: '' },
      Sun: { workout: '', tips: [], date: '' }
    };

    days.forEach(day => {
      weekDays[day.dow] = {
        workout: day.workout,
        tips: day.tips,
        date: day.date,
        workoutType: (day as any).workoutType,
        calibrationTag: (day as any).calibrationTag
      };
    });

    weeks.push({ week: weekNumber, days: weekDays });
  });

  return weeks.sort((a, b) => a.week - b.week);
}

async function generateWorkoutsForBatch(
  trainDates: DayWorkout[],
  answers: any,
  trainingPaces: any,
  openaiApiKey: string,
  totalDays: number,
  totalWeeks: number,
  batchStartIndex: number,
  availableDays: string[]
): Promise<Map<string, { workout: string; tips: string[] }>> {
  const isBeginnerPlan = answers.experience?.toLowerCase() === 'beginner';
  const hasPaceData = trainingPaces !== null && trainingPaces !== undefined;

  const raceKm = parseRaceDistanceKm(answers.raceDistance || 'Unknown');
  const startLR = typeof answers.longestRun === 'number' ? answers.longestRun : parseFloat(answers.longestRun) || 0;
  const startVol = parseFloat(answers.currentWeeklyKm) || 0;
  const ambitionTier: 'base' | 'performance' | 'competitive' = answers.ambitionTier || 'base';
  const structuralGuidance = raceKm > 0 && startVol > 0
    ? buildStructuralGuidance({ startingWeeklyKm: startVol, startingLongestRunKm: startLR, totalWeeks, raceDistanceKm: raceKm, ambitionTier, daysPerWeek: availableDays.length })
    : undefined;

  const coreGuidance = buildCoreTrainingGuidance({
    totalWeeks,
    totalDays,
    raceDistance: answers.raceDistance || 'Unknown',
    longestRun: answers.longestRun || 0,
    currentWeeklyKm: answers.currentWeeklyKm || 'unknown',
    experience: answers.experience || 'Not specified',
    availableDays,
    daysPerWeek: availableDays.length,
    longRunDay: answers.longRunDay,
    isBeginnerPlan,
    hasPaceData,
    includeCalibrationRun: answers.includeCalibrationRun || false,
    trainingPaces,
    structuralGuidance,
    ambitionTier,
  });

  const paceInstructions = buildPaceInstructions(hasPaceData, trainingPaces, isBeginnerPlan);
  const workoutRules = buildWorkoutStructureRules(isBeginnerPlan);
  const daysInstructions = buildSpecificDaysInstructions(availableDays, availableDays.length, answers.longRunDay);
  const taperProtocol = buildTaperProtocol(totalWeeks, answers.raceDistance || 'Unknown', availableDays.length, availableDays);

  const currentWeekNumber = Math.floor(batchStartIndex / availableDays.length) + 1;
  const dateListStr = trainDates.map((d, idx) => {
    const dayNum = batchStartIndex + idx + 1;
    return `${d.date} (${d.dow}) - Training Day ${dayNum}/${totalDays}`;
  }).join('\n');

  const prompt = `You are an experienced running coach creating a comprehensive ${totalWeeks}-week training plan.

${coreGuidance}
${taperProtocol}
${paceInstructions}
${daysInstructions}

CURRENT BATCH: Week ${currentWeekNumber} area (days ${batchStartIndex + 1}-${batchStartIndex + trainDates.length} of ${totalDays} total training days)

Generate workouts ONLY for these ${trainDates.length} training dates:
${dateListStr}

${REST_DAY_RULES}

${workoutRules}

Return a JSON object with a "workouts" array containing objects with: date, workout, tips`;

  const callOpenAI = async () => {
    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        temperature: 0.3,
        messages: [{ role: "user", content: prompt }],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "batch_workouts",
            strict: true,
            schema: {
              type: "object",
              properties: {
                workouts: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      date: { type: "string" },
                      workout: { type: "string" },
                      tips: { type: "array", items: { type: "string" } }
                    },
                    required: ["date", "workout", "tips"],
                    additionalProperties: false
                  }
                }
              },
              required: ["workouts"],
              additionalProperties: false
            }
          }
        }
      })
    });

    if (!openaiResponse.ok) {
      const error = await openaiResponse.text();
      throw new Error(`OpenAI API error: ${error}`);
    }

    const data = await openaiResponse.json();
    const gptWorkouts = data.choices[0].message.content;
    const parsedWorkouts = JSON.parse(gptWorkouts);
    return parsedWorkouts.workouts as Array<{ date: string; workout: string; tips: string[] }>;
  };

  let workouts: Array<{ date: string; workout: string; tips: string[] }>;
  try {
    workouts = await callOpenAI();
    if (workouts.length < trainDates.length) {
      console.warn(`Batch returned ${workouts.length} workouts but expected ${trainDates.length}. Retrying...`);
      workouts = await callOpenAI();
    }
  } catch (err) {
    console.warn(`OpenAI batch call failed (${err}). Retrying once...`);
    workouts = await callOpenAI();
  }

  return new Map(workouts.map((w) => [w.date, { workout: w.workout, tips: w.tips }]));
}

async function finalizePlan(
  skeleton: DayWorkout[],
  job: any,
  plan: any,
  answers: any,
  startDate: string,
  raceDate: string | null,
  availableDays: string[],
  planDurationWeeks: number,
  supabase: any
): Promise<void> {
  const calibrationAlreadyInSkeleton = skeleton.some(d => (d as any).workoutType === 'calibration' || (d as any).calibrationTag);
  const previewDays = plan.plan_data?.days || [];
  const calibrationAlreadyInPreview = previewDays.some((d: DayWorkout) =>
    d.workout && (
      d.workout.toLowerCase().includes('calibration') ||
      (d as any).workoutType === 'calibration' ||
      (d as any).calibrationTag
    )
  );
  if (answers.includeCalibrationRun && !calibrationAlreadyInSkeleton && !calibrationAlreadyInPreview) {
    insertCalibrationWorkout(skeleton, startDate, availableDays, answers.raceDistance, answers.longRunDay);
  } else if (answers.includeCalibrationRun && (calibrationAlreadyInSkeleton || calibrationAlreadyInPreview)) {
    console.log('Calibration workout already present in preview — skipping re-injection');
  }

  const planRaceKm = parseRaceDistanceKm(answers.raceDistance || 'Unknown');
  const planStartLR = typeof answers.longestRun === 'number' ? answers.longestRun : parseFloat(answers.longestRun) || 0;
  const planStartVol = parseFloat(answers.currentWeeklyKm) || 0;
  let planStructuralGuidance: StructuralGuidance | null = null;
  if (planRaceKm > 0 && planStartVol > 0) {
    planStructuralGuidance = buildStructuralGuidance({
      startingWeeklyKm: planStartVol,
      startingLongestRunKm: planStartLR,
      totalWeeks: planDurationWeeks,
      raceDistanceKm: planRaceKm,
      trainingFocus: answers.trainingFocus || 'durability',
      daysPerWeek: availableDays.length,
    });
  }

  let normalizationDebug: any = null;
  if (planStructuralGuidance) {
    try {
      const normResult = normalizePlanToStructure(
        skeleton as any,
        planStructuralGuidance,
        startDate,
        { softLongRunShareEnforcement: true }
      );
      normalizationDebug = normResult.debug;
      console.log('Normalization complete:', {
        preNormalizePeakLongRun: normResult.debug.preNormalizePeakLongRun,
        postNormalizePeakLongRun: normResult.debug.postNormalizePeakLongRun,
        needsRegeneration: normResult.needsRegeneration,
        adjustments: normResult.debug.weeklyAdjustments.length,
      });
    } catch (normErr) {
      console.error('Normalization error (non-fatal):', normErr);
    }
  }

  const weeks = convertToWeeks(skeleton, startDate);

  if (!weeks || weeks.length === 0) {
    const errorMsg = `Failed to generate plan weeks. Skeleton has ${skeleton.length} days, start: ${startDate}, race: ${raceDate}`;
    console.error(errorMsg);
    await supabase
      .from('plan_generation_jobs')
      .update({ status: 'failed', error_message: errorMsg, completed_at: new Date().toISOString() })
      .eq('id', job.id);
    throw new Error(errorMsg);
  }

  const daysPerWeek = availableDays.length;
  const allowedDowSet = new Set(availableDays);
  const frequencyViolations: string[] = [];

  for (const week of weeks) {
    const trainDaysInWeek: string[] = [];
    for (const [dow, dayData] of Object.entries(week.days)) {
      const data = dayData as { workout: string; date: string };
      if (data.workout && data.workout !== 'Rest' && data.workout !== '' && data.date) {
        trainDaysInWeek.push(dow);
        if (!allowedDowSet.has(dow)) {
          frequencyViolations.push(`Week ${week.week}: Training scheduled on ${dow} which is not in user-selected days [${availableDays.join(', ')}]`);
        }
      }
    }
    if (trainDaysInWeek.length > daysPerWeek) {
      frequencyViolations.push(`Week ${week.week}: ${trainDaysInWeek.length} training days but user selected ${daysPerWeek} days/week`);
    }
  }

  if (frequencyViolations.length > 0) {
    console.error(`[FREQUENCY INVARIANT VIOLATION] Plan violates user-selected training frequency:`);
    frequencyViolations.forEach(v => console.error(`  - ${v}`));
  }

  console.log(`Plan generated successfully: ${weeks.length} weeks, ${skeleton.length} total days`);

  const ambitionTier = answers.ambitionTier || 'base';
  const existingMeta = plan.plan_data?.meta || {};

  const planData = {
    plan_type: 'date_based_full',
    start_date: startDate,
    race_date: raceDate,
    days: skeleton,
    plan: weeks,
    meta: {
      ...existingMeta,
      ambitionTier,
      generatorVersion: 'v1.5',
      createdAtISO: existingMeta.createdAtISO || new Date().toISOString().split('T')[0],
      frequencyInvariant: { daysPerWeek, availableDays, violations: frequencyViolations },
    },
    ...(normalizationDebug ? { normalization_debug: normalizationDebug } : {})
  };

  await supabase
    .from('training_plans')
    .update({ plan_data: planData, plan_type: 'date_based_full' })
    .eq('id', job.plan_id);

  await supabase
    .from('plan_generation_jobs')
    .update({ status: 'completed', progress: 100, completed_at: new Date().toISOString() })
    .eq('id', job.id);

  const planEmailText = `Your Training Plan is Ready!

Your personalized training plan has been generated and is ready to view. Here's what you can do now:

REVIEW YOUR PLAN
- Check out your complete training schedule
- Review the weekly progression and key workouts
- Note your target paces for different workout types

CUSTOMIZE AS NEEDED
Use the chat feature to:
- Adjust specific workouts to fit your schedule
- Ask questions about any workout or training concept
- Request modifications based on how you're feeling
- Get advice on pacing, nutrition, or race strategy

STAY ON TRACK
- Mark workouts as complete to track your progress
- Earn badges and maintain training streaks
- View your progress charts in the dashboard
- Use the workout modification tools to adapt on the go

Your plan is designed to adapt to your life. Don't hesitate to use the chat feature whenever you need adjustments or have questions.

Ready to start? Click to view your plan and begin your journey!

Good luck with your training!
The Run Project Team`;

  await supabase.from('notifications').insert({
    user_id: plan.user_id,
    title: 'Training Plan Ready!',
    message: 'Your personalized training plan has been generated and is ready to view.',
    type: 'success',
    action_url: `#plan-${job.plan_id}`,
    email_text: planEmailText,
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    console.log('=== PROCESS PLAN JOB STARTED ===');

    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiApiKey) throw new Error("OPENAI_API_KEY not configured");

    let jobId: string | null = null;

    try {
      const body = await req.json();
      jobId = body.jobId || null;
      console.log('Received job ID:', jobId);
    } catch {
      jobId = null;
      console.log('No job ID provided, will fetch oldest pending job');
    }

    let job: any = null;

    if (jobId) {
      const { data, error } = await supabase
        .from('plan_generation_jobs')
        .select('*')
        .eq('id', jobId)
        .in('status', ['pending', 'processing'])
        .maybeSingle();

      if (error || !data) {
        console.log('No job found with ID:', jobId);
        return new Response(JSON.stringify({ message: 'Job not found or already processed', jobId }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      job = data;
    } else {
      const { data, error } = await supabase
        .from('plan_generation_jobs')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (error || !data) {
        console.log('No pending jobs found');
        return new Response(JSON.stringify({ message: 'No pending jobs' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      job = data;
    }

    console.log('Job found:', { id: job.id, plan_id: job.plan_id, status: job.status });

    const batchIndex: number = job.batch_index || 0;

    await supabase
      .from('plan_generation_jobs')
      .update({ status: 'processing', started_at: batchIndex === 0 ? new Date().toISOString() : undefined })
      .eq('id', job.id);

    const { data: plan, error: planError } = await supabase
      .from('training_plans')
      .select('*')
      .eq('id', job.plan_id)
      .single();

    if (planError || !plan) {
      await supabase
        .from('plan_generation_jobs')
        .update({ status: 'failed', error_message: 'Plan not found', completed_at: new Date().toISOString() })
        .eq('id', job.id);
      return new Response(JSON.stringify({ error: 'Plan not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const startDate = plan.start_date;
    const raceDate = plan.race_date;

    const startDateObj = new Date(startDate);
    if (isNaN(startDateObj.getTime()) || startDateObj.getFullYear() < 2000) {
      const errorMsg = `Invalid start date: ${startDate}. Please create a new plan with a valid date.`;
      await supabase
        .from('plan_generation_jobs')
        .update({ status: 'failed', error_message: errorMsg, completed_at: new Date().toISOString() })
        .eq('id', job.id);
      return new Response(JSON.stringify({ error: errorMsg }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const answers = plan.final_preferences || plan.answers;
    const trainingPaces = plan.training_paces;

    const MIN_TRAINING_DAYS = 2;
    const availableDays = answers.availableDays;
    if (!availableDays || !Array.isArray(availableDays) || availableDays.length === 0) {
      const errorMsg = `INVARIANT VIOLATION: availableDays is missing or invalid. Got: ${JSON.stringify(availableDays)}`;
      console.error(errorMsg);
      await supabase
        .from('plan_generation_jobs')
        .update({ status: 'failed', error_message: errorMsg, completed_at: new Date().toISOString() })
        .eq('id', job.id);
      return new Response(JSON.stringify({ error: errorMsg }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const daysPerWeek = availableDays.length;
    if (daysPerWeek < MIN_TRAINING_DAYS) {
      const errorMsg = `Plan generation requires at least ${MIN_TRAINING_DAYS} training days per week. You selected ${daysPerWeek}.`;
      await supabase
        .from('plan_generation_jobs')
        .update({ status: 'failed', error_message: errorMsg, completed_at: new Date().toISOString() })
        .eq('id', job.id);
      return new Response(JSON.stringify({ error: errorMsg }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const planDurationWeeks = plan.plan_duration_weeks || answers.planWeeks || 12;

    let skeleton: DayWorkout[];

    if (batchIndex > 0 && job.skeleton_state && job.skeleton_state.length > 0) {
      skeleton = job.skeleton_state;
      console.log(`[Resume] Resuming from batch ${batchIndex} with ${skeleton.length} skeleton days`);
    } else {
      skeleton = buildFullSkeleton(startDate, raceDate, availableDays, planDurationWeeks);
      console.log(`Skeleton built with ${skeleton.length} days`);

      if (skeleton.length === 0) {
        throw new Error(`Failed to generate plan weeks. Skeleton has 0 days, start: ${startDate}, race: ${raceDate}`);
      }

      assignRestWorkouts(skeleton);
      assignRaceWorkout(skeleton, answers.raceDistance || 'Unknown Distance');

      const previewDays = plan.plan_data?.days || [];
      const previewDateMap = new Map(
        previewDays.map((d: DayWorkout) => [d.date, { workout: d.workout, tips: d.tips, workout_type: d.workout_type }])
      );

      skeleton.forEach(day => {
        const previewData = previewDateMap.get(day.date);
        if (!previewData) return;
        if (day.workout_type === 'TRAIN') {
          day.workout = previewData.workout;
          day.tips = previewData.tips;
        }
      });
    }

    const trainDates = skeleton.filter(d => d.workout_type === 'TRAIN');
    const totalTrainDays = trainDates.length;

    const start = new Date(startDate);
    const previewEndDate = new Date(start);
    previewEndDate.setDate(start.getDate() + 14);

    const trainDatesAfterPreview = trainDates.filter(d => {
      const dayDate = new Date(d.date);
      return dayDate >= previewEndDate;
    });

    const start_date = new Date(startDate);
    let totalDays: number;
    let totalWeeks: number;

    if (raceDate) {
      const race_date = new Date(raceDate);
      totalDays = Math.ceil((race_date.getTime() - start_date.getTime()) / (1000 * 60 * 60 * 24));
      totalWeeks = Math.ceil(totalDays / 7);
    } else {
      totalWeeks = planDurationWeeks;
      totalDays = totalWeeks * 7;
    }

    const previewTrainDays = trainDates.filter(d => {
      const dayDate = new Date(d.date);
      return dayDate < previewEndDate;
    }).length;

    const BATCH_SIZE = 14;

    if (trainDatesAfterPreview.length === 0) {
      await finalizePlan(skeleton, job, plan, answers, startDate, raceDate, availableDays, planDurationWeeks, supabase);
      return new Response(JSON.stringify({ success: true, job_id: job.id, plan_id: job.plan_id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const currentBatchStart = batchIndex * BATCH_SIZE;
    const batch = trainDatesAfterPreview.slice(currentBatchStart, currentBatchStart + BATCH_SIZE);

    if (batch.length === 0) {
      await finalizePlan(skeleton, job, plan, answers, startDate, raceDate, availableDays, planDurationWeeks, supabase);
      return new Response(JSON.stringify({ success: true, job_id: job.id, plan_id: job.plan_id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`Processing batch ${batchIndex}: days ${currentBatchStart + 1}-${currentBatchStart + batch.length} of ${trainDatesAfterPreview.length} post-preview training days`);

    const batchStartIndex = previewTrainDays + currentBatchStart;

    const workoutMap = await generateWorkoutsForBatch(
      batch,
      answers,
      trainingPaces,
      openaiApiKey,
      totalTrainDays,
      totalWeeks,
      batchStartIndex,
      availableDays
    );

    batch.forEach(day => {
      const gptWorkout = workoutMap.get(day.date);
      if (gptWorkout) {
        const skeletonDay = skeleton.find(d => d.date === day.date);
        if (skeletonDay) {
          skeletonDay.workout = sanitizeIntervalWorkout(gptWorkout.workout);
          skeletonDay.tips = gptWorkout.tips;
        }
      }
    });

    const processedDays = previewTrainDays + currentBatchStart + batch.length;
    const progress = Math.min(99, Math.floor((processedDays / totalTrainDays) * 100));

    const nextBatchStart = (batchIndex + 1) * BATCH_SIZE;
    const hasMoreBatches = nextBatchStart < trainDatesAfterPreview.length;

    if (hasMoreBatches) {
      await supabase
        .from('plan_generation_jobs')
        .update({ progress, skeleton_state: skeleton, batch_index: batchIndex + 1 })
        .eq('id', job.id);

      console.log(`Triggering next batch ${batchIndex + 1}`);
      const functionUrl = `${supabaseUrl}/functions/v1/process-plan-job`;

      const triggerNextBatch = fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ jobId: job.id })
      }).then(r => console.log(`Next batch triggered, status: ${r.status}`))
        .catch(err => console.error('Failed to trigger next batch:', err));

      EdgeRuntime.waitUntil(triggerNextBatch);

      return new Response(JSON.stringify({
        success: true,
        job_id: job.id,
        batch: batchIndex,
        progress,
        continuing: true
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    await supabase
      .from('plan_generation_jobs')
      .update({ progress })
      .eq('id', job.id);

    await finalizePlan(skeleton, job, plan, answers, startDate, raceDate, availableDays, planDurationWeeks, supabase);

    return new Response(JSON.stringify({
      success: true,
      job_id: job.id,
      plan_id: job.plan_id,
      total_days: skeleton.length,
      train_days: totalTrainDays
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error processing job:', error);

    if (error && typeof error === 'object' && 'message' in error) {
      try {
        const body = await req.clone().json().catch(() => ({}));
        const errorJobId = body?.jobId;
        if (errorJobId) {
          await supabase
            .from('plan_generation_jobs')
            .update({
              status: 'failed',
              error_message: (error as Error).message,
              completed_at: new Date().toISOString()
            })
            .eq('id', errorJobId);
        }
      } catch {}
    }

    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
