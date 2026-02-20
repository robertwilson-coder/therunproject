import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@^2.57.4';
import { buildEliteCoachSystemPrompt } from '../_shared/promptBuilder.ts';

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

function build14DaySkeleton(startDate: string, availableDays: string[], raceDate?: string): DayWorkout[] {
  const skeleton: DayWorkout[] = [];
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);

  for (let i = 0; i < 14; i++) {
    const currentDate = new Date(start);
    currentDate.setDate(start.getDate() + i);
    const dateStr = currentDate.toISOString().split('T')[0];
    const dayOfWeek = DAYS_OF_WEEK[currentDate.getDay()];

    if (raceDate && dateStr === raceDate) {
      skeleton.push({ date: dateStr, dow: dayOfWeek, workout: '', tips: [], workout_type: 'RACE' });
    } else if (availableDays.includes(dayOfWeek)) {
      skeleton.push({ date: dateStr, dow: dayOfWeek, workout: '', tips: [], workout_type: 'TRAIN' });
    } else {
      skeleton.push({ date: dateStr, dow: dayOfWeek, workout: '', tips: [], workout_type: 'REST' });
    }
  }

  return skeleton;
}

function assignRestWorkouts(skeleton: DayWorkout[]): void {
  skeleton.forEach((day, index) => {
    if (day.workout_type === 'REST') {
      day.workout = 'Rest';
      day.tips = [
        'Rest is when your body adapts and gets stronger',
        'Stay hydrated and eat well',
        'Get 7-9 hours of quality sleep'
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
  const normalizedDistance = raceDistance.toLowerCase();
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

  // Find earliest training day in first 14 days (preview period)
  let earliestTrainingDay: any = null;
  let earliestDate: Date | null = null;

  for (const day of skeleton) {
    const dayDate = new Date(day.date);
    const dayOfWeek = DAYS_OF_WEEK[dayDate.getDay()];

    // Check if this is a training day
    if (day.workout_type === 'TRAIN' && availableDays.includes(dayOfWeek)) {
      if (!earliestDate || dayDate < earliestDate) {
        earliestDate = dayDate;
        earliestTrainingDay = day;
      }
    }
  }

  if (!earliestTrainingDay) {
    console.error('No training day found for calibration workout');
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

  // Tag with metadata
  (earliestTrainingDay as any).workoutType = 'calibration';
  (earliestTrainingDay as any).calibrationTag = {
    kind: 'calibration',
    testType: testType
  };

  console.log(`Calibration workout inserted on ${earliestTrainingDay.date}`);
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    console.log('Preview generation started');
    const { answers, startDate, trainingPaces } = await req.json();
    console.log('Request parsed:', { startDate, hasAnswers: !!answers, hasPaces: !!trainingPaces });

    if (!startDate) {
      throw new Error("startDate is required for preview generation");
    }

    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiApiKey) {
      console.error('OPENAI_API_KEY not found in environment');
      throw new Error("OPENAI_API_KEY not configured");
    }
    console.log('OpenAI API key found');

    const availableDays = answers.availableDays || ['Mon', 'Wed', 'Fri', 'Sat'];
    console.log('Building skeleton with:', { startDate, availableDays, raceDate: answers.raceDate });
    const skeleton = build14DaySkeleton(startDate, availableDays, answers.raceDate);
    console.log(`Skeleton built: ${skeleton.length} days`);

    assignRestWorkouts(skeleton);
    if (skeleton.some(d => d.workout_type === 'RACE')) {
      assignRaceWorkout(skeleton, answers.raceDistance || 'Unknown Distance');
    }

    const trainDates = skeleton.filter(d => d.workout_type === 'TRAIN');
    console.log(`Training dates: ${trainDates.length}`);

    if (trainDates.length === 0) {
      const weeks = convertToWeeks(skeleton, startDate);
      return new Response(JSON.stringify({
        plan_type: 'date_based_preview',
        start_date: startDate,
        race_date: answers.raceDate,
        preview_range_days: 14,
        days: skeleton,
        plan: weeks
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const isBeginnerPlan = answers.experience?.toLowerCase() === 'beginner';
    const hasPaceData = trainingPaces !== null && trainingPaces !== undefined;

    const start = new Date(startDate);
    let totalDays: number;
    let totalWeeks: number;

    if (answers.raceDate) {
      const race = new Date(answers.raceDate);
      totalDays = Math.ceil((race.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      totalWeeks = Math.ceil(totalDays / 7);
    } else {
      totalWeeks = answers.planWeeks || 12;
      totalDays = totalWeeks * 7;
    }

    const systemPrompt = buildEliteCoachSystemPrompt({
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

    const dateListStr = trainDates.map(d => `${d.date} (${d.dow})`).join('\n');

    const prompt = `${systemPrompt}

CRITICAL: This is a PREVIEW. Generate the FIRST 2 WEEKS ONLY of the ${totalWeeks}-week plan.

Generate workouts ONLY for these ${trainDates.length} training dates:
${dateListStr}

Return a JSON object with a "workouts" array containing objects with: date, workout, tips`;

    console.log('Calling OpenAI API...');
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
            name: "preview_workouts",
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
      console.error('OpenAI API error:', error);
      throw new Error(`OpenAI API error: ${error}`);
    }

    console.log('OpenAI response received');
    const data = await openaiResponse.json();
    const gptWorkouts = data.choices[0].message.content;
    console.log('Parsing GPT workouts...');
    const parsedWorkouts = JSON.parse(gptWorkouts);
    console.log(`Parsed ${parsedWorkouts.workouts?.length || 0} workouts`);

    const workoutMap = new Map(parsedWorkouts.workouts.map((w: any) => [w.date, w]));

    skeleton.forEach(day => {
      if (day.workout_type === 'TRAIN') {
        const gptWorkout = workoutMap.get(day.date);
        if (gptWorkout) {
          day.workout = gptWorkout.workout;
          day.tips = gptWorkout.tips;
        }
      }
    });

    // CRITICAL: Insert calibration workout if enabled (deterministic approach)
    if (answers.includeCalibrationRun) {
      console.log('Inserting calibration workout');
      insertCalibrationWorkout(skeleton, startDate, availableDays, answers.raceDistance || 'Marathon');
    }

    console.log('Converting to weeks structure...');
    const weeks = convertToWeeks(skeleton, startDate);
    console.log(`Created ${weeks.length} weeks`);

    // VALIDATION: Ensure weeks were created
    if (!weeks || weeks.length === 0) {
      throw new Error(`Failed to create week structure for preview. Generated ${skeleton.length} days but 0 weeks.`);
    }

    const authHeader = req.headers.get('Authorization');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let userId = null;
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user } } = await supabase.auth.getUser(token);
      userId = user?.id || null;
    }

    const planData = {
      plan_type: 'date_based_preview',
      start_date: startDate,
      race_date: answers.raceDate || null,
      preview_range_days: 14,
      days: skeleton,
      plan: weeks
    };

    console.log('Saving plan to database...');
    const { data: savedPlan, error: saveError } = await supabase
      .from('training_plans')
      .insert({
        user_id: userId,
        answers: answers,
        plan_data: planData,
        plan_type: 'date_based_preview',
        start_date: startDate,
        race_date: answers.raceDate || null,
        race_name: answers.raceName || null,
        race_location: answers.raceLocation || null,
        preview_range_days: 14,
        final_preferences: answers,
        training_paces: trainingPaces,
        plan_duration_weeks: totalWeeks,
        is_active: true
      })
      .select()
      .single();

    if (saveError) {
      console.error('Database save error:', saveError);
      throw saveError;
    }

    console.log('Preview plan generated successfully:', savedPlan.id);
    return new Response(JSON.stringify({
      ...planData,
      plan_id: savedPlan.id
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error generating preview:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
