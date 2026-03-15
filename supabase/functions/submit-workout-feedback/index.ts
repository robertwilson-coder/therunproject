import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface WorkoutFeedbackRequest {
  training_plan_id: string;
  workout_date: string;
  week_number?: number;
  dow?: string;
  workout_text: string;
  workout_type?: string;
  workoutType?: string;
  rpe?: number;
  completed: boolean;
  notes?: string;
}

function generateNormalizedWorkoutId(
  trainingPlanId: string,
  isoDate: string,
  workoutType: string = 'normal',
  workout_type: string = 'TRAIN'
): string {
  return `${trainingPlanId}:${isoDate}:${workoutType}:${workout_type}`;
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
    'fartlek',
    'hills',
    'vo2',
    'strides',
  ];
  return keyWorkoutIndicators.some(indicator => lowerWorkout.includes(indicator));
}

function inferWorkoutRole(workoutText: string): string | null {
  const lowerWorkout = workoutText.toLowerCase();

  if (lowerWorkout.includes('rest') || lowerWorkout.includes(' off')) {
    return 'recovery';
  }
  if (lowerWorkout.includes('race day') || lowerWorkout.includes('race:')) {
    return 'race_specific';
  }
  if (lowerWorkout.includes('race pace') || lowerWorkout.includes('marathon pace')) {
    return 'race_specific';
  }
  if (lowerWorkout.includes('calibration') || lowerWorkout.includes('time trial')) {
    return 'calibration';
  }
  if (lowerWorkout.includes('tempo') || lowerWorkout.includes('threshold') || lowerWorkout.includes('lactate')) {
    return 'threshold';
  }
  if (lowerWorkout.includes('interval') || lowerWorkout.includes('repeat') || lowerWorkout.includes('strides') || lowerWorkout.includes('vo2')) {
    return 'economy';
  }
  if (lowerWorkout.includes('easy') || lowerWorkout.includes('recovery run') || lowerWorkout.includes('long run')) {
    return 'base';
  }
  return null;
}

function rpeToEffortLevel(rpe: number | undefined): string {
  if (rpe == null) return 'as_expected';

  if (rpe <= 4) return 'easier';
  if (rpe >= 8) return 'harder';
  return 'as_expected';
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization")!;

    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body: WorkoutFeedbackRequest = await req.json();

    const {
      training_plan_id,
      workout_date,
      week_number,
      dow,
      workout_text,
      workout_type,
      workoutType,
      rpe,
      completed,
      notes,
    } = body;

    if (!training_plan_id || !workout_date || !workout_text) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: training_plan_id, workout_date, workout_text" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const isKey = isKeyWorkout(workout_text);
    const normalizedId = generateNormalizedWorkoutId(
      training_plan_id,
      workout_date,
      workoutType || 'normal',
      workout_type || 'TRAIN'
    );

    const completionStatus = completed ? 'completed' : 'missed';
    const effortVsExpected = rpeToEffortLevel(rpe);
    const workoutRole = inferWorkoutRole(workout_text);

    const feedbackData = {
      training_plan_id,
      user_id: user.id,
      normalized_workout_id: normalizedId,
      workout_date,
      week_number: week_number ?? null,
      dow: dow ?? null,
      completion_status: completionStatus,
      effort_vs_expected: effortVsExpected,
      hr_matched_target: null,
      notes: notes ?? null,
      is_key_workout: isKey,
      workout_type: workout_type ?? 'TRAIN',
      workout_role: workoutRole,
    };

    const { data, error } = await supabase
      .from('training_plan_workout_feedback')
      .upsert(feedbackData, {
        onConflict: 'training_plan_id,normalized_workout_id',
        ignoreDuplicates: false,
      })
      .select()
      .single();

    if (error) {
      console.error('Error storing workout feedback:', error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, feedback: data, is_key_workout: isKey }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
