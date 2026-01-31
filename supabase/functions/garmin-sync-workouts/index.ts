import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface WorkoutData {
  date: string;
  description: string;
  workoutType: string;
  distance?: number;
  duration?: number;
}

interface TokenRefreshResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

async function refreshGarminToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<TokenRefreshResponse> {
  const response = await fetch(
    "https://connectapi.garmin.com/oauth-service/oauth/token",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token refresh failed: ${errorText}`);
  }

  return await response.json();
}

function convertToGarminWorkout(workout: WorkoutData) {
  const workoutSteps = [];
  const description = workout.description.toLowerCase();

  if (description.includes('easy') || description.includes('recovery')) {
    workoutSteps.push({
      type: 'WorkoutStep',
      stepOrder: 1,
      intensity: 'ACTIVE',
      durationType: 'TIME',
      durationValue: workout.duration || 1800,
      targetType: 'PACE',
      targetValueOne: 'ZONE_1',
      targetValueTwo: 'ZONE_2',
    });
  } else if (description.includes('tempo') || description.includes('threshold')) {
    workoutSteps.push({
      type: 'WorkoutStep',
      stepOrder: 1,
      intensity: 'ACTIVE',
      durationType: 'TIME',
      durationValue: workout.duration || 2400,
      targetType: 'PACE',
      targetValueOne: 'ZONE_4',
      targetValueTwo: 'ZONE_4',
    });
  } else if (description.includes('interval') || description.includes('repeat')) {
    workoutSteps.push({
      type: 'WorkoutRepeatStep',
      stepOrder: 1,
      numberOfIterations: 6,
      steps: [
        {
          type: 'WorkoutStep',
          stepOrder: 1,
          intensity: 'ACTIVE',
          durationType: 'TIME',
          durationValue: 300,
          targetType: 'PACE',
          targetValueOne: 'ZONE_5',
        },
        {
          type: 'WorkoutStep',
          stepOrder: 2,
          intensity: 'REST',
          durationType: 'TIME',
          durationValue: 180,
          targetType: 'PACE',
          targetValueOne: 'ZONE_1',
        },
      ],
    });
  } else if (description.includes('long') || description.includes('distance')) {
    workoutSteps.push({
      type: 'WorkoutStep',
      stepOrder: 1,
      intensity: 'ACTIVE',
      durationType: workout.distance ? 'DISTANCE' : 'TIME',
      durationValue: workout.distance || workout.duration || 3600,
      targetType: 'PACE',
      targetValueOne: 'ZONE_2',
      targetValueTwo: 'ZONE_3',
    });
  } else {
    workoutSteps.push({
      type: 'WorkoutStep',
      stepOrder: 1,
      intensity: 'ACTIVE',
      durationType: 'OPEN',
      targetType: 'NO_TARGET',
    });
  }

  return {
    workoutName: workout.description.substring(0, 100),
    description: workout.description,
    sportType: {
      sportTypeId: 1,
      sportTypeKey: 'running',
    },
    workoutSegments: [
      {
        segmentOrder: 1,
        sportType: {
          sportTypeId: 1,
          sportTypeKey: 'running',
        },
        workoutSteps: workoutSteps,
      },
    ],
  };
}

async function createGarminWorkout(
  accessToken: string,
  workoutData: any,
  scheduledDate: string
) {
  const response = await fetch(
    "https://connectapi.garmin.com/workout-service/workout",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(workoutData),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Garmin API error: ${errorText}`);
  }

  const workout = await response.json();

  const scheduleResponse = await fetch(
    `https://connectapi.garmin.com/workout-service/schedule/${workout.workoutId}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        date: scheduledDate,
      }),
    }
  );

  if (!scheduleResponse.ok) {
    console.warn(`Failed to schedule workout: ${await scheduleResponse.text()}`);
  }

  return workout;
}

async function syncWorkoutsToGarmin(
  accessToken: string,
  workouts: WorkoutData[],
  userId: string,
  trainingPlanId: string,
  supabase: any
) {
  const syncedWorkouts = [];
  const errors = [];

  for (const workout of workouts) {
    try {
      const existingSync = await supabase
        .from('garmin_synced_workouts')
        .select('id, garmin_workout_id')
        .eq('user_id', userId)
        .eq('training_plan_id', trainingPlanId)
        .eq('workout_date', workout.date)
        .maybeSingle();

      if (existingSync.data?.garmin_workout_id) {
        console.log(`Workout for ${workout.date} already synced`);
        syncedWorkouts.push({
          date: workout.date,
          description: workout.description,
          status: 'already_synced',
        });
        continue;
      }

      const garminWorkoutData = convertToGarminWorkout(workout);
      const garminWorkout = await createGarminWorkout(
        accessToken,
        garminWorkoutData,
        workout.date
      );

      await supabase
        .from('garmin_synced_workouts')
        .upsert(
          {
            user_id: userId,
            training_plan_id: trainingPlanId,
            workout_date: workout.date,
            workout_description: workout.description,
            garmin_workout_id: garminWorkout.workoutId?.toString(),
            sync_status: 'completed',
            synced_at: new Date().toISOString(),
          },
          {
            onConflict: 'user_id,training_plan_id,workout_date',
          }
        );

      syncedWorkouts.push({
        date: workout.date,
        description: workout.description,
        status: 'synced',
        garmin_id: garminWorkout.workoutId,
      });
    } catch (error) {
      console.error(`Error syncing workout for ${workout.date}:`, error);
      
      await supabase
        .from('garmin_synced_workouts')
        .upsert(
          {
            user_id: userId,
            training_plan_id: trainingPlanId,
            workout_date: workout.date,
            workout_description: workout.description,
            sync_status: 'failed',
            error_message: error instanceof Error ? error.message : 'Unknown error',
            synced_at: new Date().toISOString(),
          },
          {
            onConflict: 'user_id,training_plan_id,workout_date',
          }
        );

      errors.push({
        date: workout.date,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return { syncedWorkouts, errors };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const garminClientId = Deno.env.get("GARMIN_CLIENT_ID");
    const garminClientSecret = Deno.env.get("GARMIN_CLIENT_SECRET");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Supabase credentials not configured");
    }

    if (!garminClientId || !garminClientSecret) {
      throw new Error("Garmin credentials not configured");
    }

    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    
    if (userError || !user) {
      throw new Error("Unauthorized");
    }

    const { trainingPlanId } = await req.json();

    if (!trainingPlanId) {
      throw new Error("Training plan ID is required");
    }

    const { data: connection, error: connectionError } = await supabaseClient
      .from("garmin_connections")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (connectionError) {
      throw connectionError;
    }

    if (!connection) {
      return new Response(
        JSON.stringify({ 
          error: "No Garmin connection found. Please connect your Garmin account first.",
          needsConnection: true 
        }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    let accessToken = connection.access_token;
    const expiresAt = new Date(connection.expires_at);
    
    if (expiresAt <= new Date()) {
      const refreshedTokens = await refreshGarminToken(
        connection.refresh_token,
        garminClientId,
        garminClientSecret
      );

      accessToken = refreshedTokens.access_token;

      await supabaseClient
        .from("garmin_connections")
        .update({
          access_token: refreshedTokens.access_token,
          refresh_token: refreshedTokens.refresh_token,
          expires_at: new Date(Date.now() + refreshedTokens.expires_in * 1000).toISOString(),
        })
        .eq("user_id", user.id);
    }

    const { data: trainingPlan, error: planError } = await supabaseClient
      .from("training_plans")
      .select("*")
      .eq("id", trainingPlanId)
      .eq("user_id", user.id)
      .single();

    if (planError || !trainingPlan) {
      throw new Error("Training plan not found");
    }

    const workouts: WorkoutData[] = [];
    const planData = trainingPlan.plan_data;

    if (planData && planData.weeks) {
      const startDate = new Date(trainingPlan.start_date || trainingPlan.created_at);
      
      planData.weeks.forEach((week: any, weekIndex: number) => {
        week.days.forEach((day: any, dayIndex: number) => {
          if (day.workout && day.workout.trim()) {
            const workoutDate = new Date(startDate);
            workoutDate.setDate(startDate.getDate() + (weekIndex * 7) + dayIndex);
            
            if (workoutDate >= new Date()) {
              workouts.push({
                date: workoutDate.toISOString().split('T')[0],
                description: day.workout,
                workoutType: day.type || 'run',
                distance: day.distance,
                duration: day.duration,
              });
            }
          }
        });
      });
    }

    if (workouts.length === 0) {
      return new Response(
        JSON.stringify({ 
          message: "No future workouts found to sync",
          synced_count: 0 
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const result = await syncWorkoutsToGarmin(
      accessToken,
      workouts,
      user.id,
      trainingPlanId,
      supabaseClient
    );

    await supabaseClient
      .from("garmin_connections")
      .update({
        last_sync_at: new Date().toISOString()
      })
      .eq("user_id", user.id);

    const successCount = result.syncedWorkouts.filter(w => w.status === 'synced').length;

    return new Response(
      JSON.stringify({
        success: true,
        synced_count: result.syncedWorkouts.length,
        pushed_to_garmin: successCount,
        workouts: result.syncedWorkouts,
        errors: result.errors,
        message: `Successfully pushed ${successCount} workouts to Garmin Connect! They will sync to your device on the next sync.`,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error) {
    console.error("Garmin workout sync error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
