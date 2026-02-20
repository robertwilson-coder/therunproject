import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@^2.57.4';
import { buildCoreTrainingGuidance, buildPaceInstructions, buildWorkoutStructureRules, buildSpecificDaysInstructions, REST_DAY_RULES, buildTaperProtocol } from '../_shared/promptBuilder.ts';

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

function buildFullSkeleton(startDate: string, raceDate: string | null, availableDays: string[], planDurationWeeks?: number): DayWorkout[] {
  const skeleton: DayWorkout[] = [];
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);

  let end: Date;

  if (raceDate) {
    // Date-based plan: use race date
    end = new Date(raceDate);
    end.setHours(0, 0, 0, 0);
  } else if (planDurationWeeks) {
    // Weeks-based plan: calculate end date from duration
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

function insertCalibrationWorkout(skeleton: DayWorkout[], startDate: string, availableDays: string[], raceDistance: string): void {
  console.log('Inserting calibration workout for race distance:', raceDistance);

  // Determine calibration workout format based on race distance
  const normalizedDistance = (raceDistance || '').toLowerCase();
  let calibrationWorkout = '';
  let testType = 'MARATHON';

  if (normalizedDistance.includes('5k') || normalizedDistance.includes('10k')) {
    testType = normalizedDistance.includes('5k') ? '5K' : '10K';
    calibrationWorkout = `**Warm up:** 10–15 min easy (RPE 2–3)\n**Work:** 15 min continuous at controlled hard effort (RPE ~8)\n**Cool down:** 10 min easy\n\nThis calibration test will help determine your optimal training paces. Run at a steady, controlled hard effort for the 15-minute work segment. Avoid sprinting or surging - aim for even pacing throughout.`;
  } else if (normalizedDistance.includes('half')) {
    testType = 'HM';
    calibrationWorkout = `**Warm up:** 10–15 min easy\n**Work:** 30 min continuous steady progression (RPE 5 → 7)\n**Cool down:** 10 min easy\n\nThis calibration test will help determine your optimal training paces. Start at a comfortable pace (RPE 5) and gradually build to comfortably hard (RPE 7) by the end. No sharp surges - keep the effort progression smooth and controlled.`;
  } else if (normalizedDistance.includes('ultra')) {
    testType = 'ULTRA';
    calibrationWorkout = `**Warm up:** 10 min easy\n**Work:** 60–120 min easy continuous (RPE 2–3)\n**Cool down:** 5–10 min easy\n\nThis calibration assessment helps us understand your aerobic endurance. Run at a genuinely easy, conversational pace throughout. The goal is time on feet, not intensity.`;
  } else {
    testType = 'MARATHON';
    calibrationWorkout = `**Warm up:** 10–15 min easy\n**Work:** 20 min continuous controlled hard effort (RPE ~7.5–8)\n**Cool down:** 10 min easy\n\nThis calibration test will help determine your optimal training paces. Run at a controlled hard effort for the 20-minute work segment. Aim for steady, even pacing - not a race effort, but a strong sustained push.`;
  }

  // Find Week 1 training days (first 7 days)
  const start = new Date(startDate);
  const weekOneEnd = new Date(start);
  weekOneEnd.setDate(start.getDate() + 6);
  weekOneEnd.setHours(23, 59, 59, 999);

  // Find earliest training day in Week 1
  let earliestTrainingDay: DayWorkout | null = null;
  for (const day of skeleton) {
    const dayDate = new Date(day.date);
    if (dayDate >= start && dayDate <= weekOneEnd && day.workout_type === 'TRAIN') {
      earliestTrainingDay = day;
      break;
    }
  }

  if (!earliestTrainingDay) {
    console.error('No training day found in Week 1 for calibration workout');
    return;
  }

  // Replace that workout with calibration
  earliestTrainingDay.workout = calibrationWorkout;
  earliestTrainingDay.tips = [
    'Record data from the work segment only - exclude warm-up and cool-down',
    'Aim for even pacing throughout the effort - avoid starting too fast',
    'Choose a flat course if possible to get accurate baseline data',
    'Use a GPS watch or app to track distance, pace, and heart rate',
    'After completing, you will be prompted to enter your test results'
  ];

  // Tag with metadata (stored as extended property, backward compatible)
  (earliestTrainingDay as any).workoutType = 'calibration';
  (earliestTrainingDay as any).calibrationTag = {
    kind: 'calibration',
    testType: testType
  };

  console.log(`Calibration workout inserted on ${earliestTrainingDay.date} (${earliestTrainingDay.dow})`);
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

  const coreGuidance = buildCoreTrainingGuidance({
    totalWeeks,
    totalDays,
    raceDistance: answers.raceDistance || 'Unknown',
    longestRun: answers.longestRun || 0,
    currentWeeklyKm: answers.currentWeeklyKm || 'unknown',
    experience: answers.experience || 'Not specified',
    availableDays,
    daysPerWeek: availableDays.length,
    isBeginnerPlan,
    hasPaceData,
    includeCalibrationRun: answers.includeCalibrationRun || false,
    trainingPaces
  });

  const paceInstructions = buildPaceInstructions(hasPaceData, trainingPaces, isBeginnerPlan);
  const workoutRules = buildWorkoutStructureRules(isBeginnerPlan);
  const daysInstructions = buildSpecificDaysInstructions(availableDays, availableDays.length);
  const taperProtocol = buildTaperProtocol(totalWeeks, answers.raceDistance || 'Unknown');

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

  return new Map(parsedWorkouts.workouts.map((w: any) => [w.date, { workout: w.workout, tips: w.tips }]));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  let job: any = null;
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    console.log('=== PROCESS PLAN JOB STARTED ===');

    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiApiKey) {
      throw new Error("OPENAI_API_KEY not configured");
    }

    let jobId: string | null = null;

    try {
      const body = await req.json();
      jobId = body.jobId || null;
      console.log('Received job ID:', jobId);
    } catch {
      jobId = null;
      console.log('No job ID provided, will fetch oldest pending job');
    }

    if (jobId) {
      console.log('Fetching job by ID:', jobId);
      const { data, error } = await supabase
        .from('plan_generation_jobs')
        .select('*')
        .eq('id', jobId)
        .eq('status', 'pending')
        .single();

      if (error) {
        console.error('Error fetching job:', error);
      }
      if (!data) {
        console.log('No job found with ID:', jobId);
      }

      if (error || !data) {
        return new Response(JSON.stringify({ message: 'Job not found or already processed', jobId, error: error?.message }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      job = data;
      console.log('Job found:', { id: job.id, plan_id: job.plan_id, status: job.status });
    } else {
      console.log('Fetching oldest pending job');
      const { data, error } = await supabase
        .from('plan_generation_jobs')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(1)
        .single();

      if (error || !data) {
        console.log('No pending jobs found');
        return new Response(JSON.stringify({ message: 'No pending jobs' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      job = data;
      console.log('Job found:', { id: job.id, plan_id: job.plan_id, status: job.status });
    }

    console.log('Updating job status to processing');
    await supabase
      .from('plan_generation_jobs')
      .update({ status: 'processing', started_at: new Date().toISOString() })
      .eq('id', job.id);

    console.log('Fetching training plan:', job.plan_id);
    const { data: plan, error: planError } = await supabase
      .from('training_plans')
      .select('*')
      .eq('id', job.plan_id)
      .single();

    if (planError || !plan) {
      console.error('Plan not found or error:', planError);
      await supabase
        .from('plan_generation_jobs')
        .update({
          status: 'failed',
          error_message: 'Plan not found',
          completed_at: new Date().toISOString()
        })
        .eq('id', job.id);

      return new Response(JSON.stringify({ error: 'Plan not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('Plan found:', { id: plan.id, type: plan.plan_type, start_date: plan.start_date, race_date: plan.race_date, plan_duration_weeks: plan.plan_duration_weeks });

    const startDate = plan.start_date;
    const raceDate = plan.race_date;
    const answers = plan.final_preferences || plan.answers;
    const trainingPaces = plan.training_paces;
    const availableDays = answers.availableDays || ['Mon', 'Wed', 'Fri', 'Sat'];
    const planDurationWeeks = plan.plan_duration_weeks || answers.planWeeks || 12;

    console.log('Building skeleton:', { startDate, raceDate, planDurationWeeks, availableDays });

    const skeleton = buildFullSkeleton(startDate, raceDate, availableDays, planDurationWeeks);

    console.log(`Skeleton built with ${skeleton.length} days`);

    if (skeleton.length === 0) {
      throw new Error(`Failed to generate plan weeks. Skeleton has 0 days, start: ${startDate}, race: ${raceDate}, weeks: ${planDurationWeeks}`);
    }

    assignRestWorkouts(skeleton);
    assignRaceWorkout(skeleton, answers.raceDistance || 'Unknown Distance');

    // CRITICAL: Preserve preview workouts from the first 14 days
    const previewDays = plan.plan_data?.days || [];
    const previewDateMap = new Map(
      previewDays.map((d: DayWorkout) => [d.date, { workout: d.workout, tips: d.tips }])
    );

    // Copy preview workouts to skeleton (first 14 days)
    skeleton.forEach(day => {
      const previewData = previewDateMap.get(day.date);
      if (previewData && day.workout_type === 'TRAIN') {
        day.workout = previewData.workout;
        day.tips = previewData.tips;
      }
    });

    const trainDates = skeleton.filter(d => d.workout_type === 'TRAIN');
    const totalTrainDays = trainDates.length;

    // Filter to only generate workouts AFTER the preview period (after day 14)
    const start = new Date(startDate);
    const previewEndDate = new Date(start);
    previewEndDate.setDate(start.getDate() + 14);

    const trainDatesAfterPreview = trainDates.filter(d => {
      const dayDate = new Date(d.date);
      return dayDate >= previewEndDate;
    });

    const start_date = new Date(startDate);
    const race_date = new Date(raceDate);
    const totalDays = Math.ceil((race_date.getTime() - start_date.getTime()) / (1000 * 60 * 60 * 24));
    const totalWeeks = Math.ceil(totalDays / 7);

    if (trainDatesAfterPreview.length > 0) {
      const batchSize = 18;
      const batches: DayWorkout[][] = [];

      for (let i = 0; i < trainDatesAfterPreview.length; i += batchSize) {
        batches.push(trainDatesAfterPreview.slice(i, i + batchSize));
      }

      // Calculate how many training days are in the preview (first 14 days)
      const previewTrainDays = trainDates.filter(d => {
        const dayDate = new Date(d.date);
        return dayDate < previewEndDate;
      }).length;

      let processedDays = previewTrainDays; // Start counting from after preview

      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        const batchStartIndex = previewTrainDays + (batchIndex * batchSize);

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
              skeletonDay.workout = gptWorkout.workout;
              skeletonDay.tips = gptWorkout.tips;
            }
          }
        });

        processedDays += batch.length;
        const progress = Math.floor((processedDays / totalTrainDays) * 100);

        await supabase
          .from('plan_generation_jobs')
          .update({ progress })
          .eq('id', job.id);
      }
    } else {
      // If preview covers entire plan, mark as complete
      await supabase
        .from('plan_generation_jobs')
        .update({ progress: 100 })
        .eq('id', job.id);
    }

    // CRITICAL: Insert calibration workout if enabled
    if (answers.includeCalibrationRun) {
      insertCalibrationWorkout(skeleton, startDate, availableDays, answers.raceDistance);
    }

    const weeks = convertToWeeks(skeleton, startDate);

    // CRITICAL VALIDATION: Ensure weeks array is not empty
    if (!weeks || weeks.length === 0) {
      const errorMsg = `Failed to generate plan weeks. Skeleton has ${skeleton.length} days, start: ${startDate}, race: ${raceDate}`;
      console.error(errorMsg);

      await supabase
        .from('plan_generation_jobs')
        .update({
          status: 'failed',
          error_message: errorMsg,
          completed_at: new Date().toISOString()
        })
        .eq('id', job.id);

      throw new Error(errorMsg);
    }

    console.log(`Plan generated successfully: ${weeks.length} weeks, ${skeleton.length} total days`);

    const planData = {
      plan_type: 'date_based_full',
      start_date: startDate,
      race_date: raceDate,
      days: skeleton,
      plan: weeks
    };

    await supabase
      .from('training_plans')
      .update({
        plan_data: planData,
        plan_type: 'date_based_full'
      })
      .eq('id', job.plan_id);

    await supabase
      .from('plan_generation_jobs')
      .update({
        status: 'completed',
        progress: 100,
        completed_at: new Date().toISOString()
      })
      .eq('id', job.id);

    // Create notification for plan completion
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

PREPARE FOR SUCCESS
- Review the race day planning tools
- Set up your heart rate zones
- Explore nutrition strategies in the Nutrition Lab
- Connect with training partners in Race Buddies

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

    try {
      const body = await req.clone().json();
      const jobId = body.jobId;

      if (jobId) {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        await supabase
          .from('plan_generation_jobs')
          .update({
            status: 'failed',
            error_message: error.message,
            completed_at: new Date().toISOString()
          })
          .eq('id', jobId);
      }
    } catch {}

    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
