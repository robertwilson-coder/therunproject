import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface TokenRefreshResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

interface GarminActivity {
  activityId: number;
  activityName: string;
  activityType: {
    typeId: number;
    typeKey: string;
  };
  startTimeLocal: string;
  distance: number;
  duration: number;
  averageHR?: number;
  maxHR?: number;
  calories?: number;
  averageSpeed?: number;
  maxSpeed?: number;
  elevationGain?: number;
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

async function fetchGarminActivities(
  accessToken: string,
  startDate: Date,
  endDate: Date
): Promise<GarminActivity[]> {
  const limit = 100;
  const start = 0;

  const response = await fetch(
    `https://connectapi.garmin.com/activitylist-service/activities/search/activities?start=${start}&limit=${limit}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch activities: ${errorText}`);
  }

  const activities: GarminActivity[] = await response.json();

  return activities.filter((activity) => {
    const activityDate = new Date(activity.startTimeLocal);
    return (
      activityDate >= startDate &&
      activityDate <= endDate &&
      (activity.activityType.typeKey === 'running' ||
        activity.activityType.typeKey === 'trail_running' ||
        activity.activityType.typeKey === 'treadmill_running')
    );
  });
}

function findMatchingWorkout(
  activity: GarminActivity,
  trainingPlans: any[]
): { planId: string; weekIndex: number; dayIndex: number } | null {
  const activityDate = new Date(activity.startTimeLocal);
  activityDate.setHours(0, 0, 0, 0);

  for (const plan of trainingPlans) {
    const startDate = new Date(plan.start_date || plan.created_at);
    startDate.setHours(0, 0, 0, 0);

    if (plan.plan_data && plan.plan_data.weeks) {
      for (let weekIndex = 0; weekIndex < plan.plan_data.weeks.length; weekIndex++) {
        const week = plan.plan_data.weeks[weekIndex];
        for (let dayIndex = 0; dayIndex < week.days.length; dayIndex++) {
          const day = week.days[dayIndex];
          if (day.workout && day.workout.trim()) {
            const workoutDate = new Date(startDate);
            workoutDate.setDate(startDate.getDate() + weekIndex * 7 + dayIndex);
            workoutDate.setHours(0, 0, 0, 0);

            if (workoutDate.getTime() === activityDate.getTime()) {
              return { planId: plan.id, weekIndex, dayIndex };
            }
          }
        }
      }
    }
  }

  return null;
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

    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser();

    if (userError || !user) {
      throw new Error("Unauthorized");
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
          error:
            "No Garmin connection found. Please connect your Garmin account first.",
          needsConnection: true,
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
          expires_at: new Date(
            Date.now() + refreshedTokens.expires_in * 1000
          ).toISOString(),
        })
        .eq("user_id", user.id);
    }

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    const activities = await fetchGarminActivities(
      accessToken,
      startDate,
      endDate
    );

    const { data: trainingPlans } = await supabaseClient
      .from("training_plans")
      .select("*")
      .eq("user_id", user.id)
      .eq("archived", false);

    let syncedCount = 0;
    const syncedActivities = [];

    for (const activity of activities) {
      const matchingWorkout = findMatchingWorkout(
        activity,
        trainingPlans || []
      );

      if (matchingWorkout) {
        const activityDate = new Date(activity.startTimeLocal);
        const completionKey = `${matchingWorkout.planId}-${matchingWorkout.weekIndex}-${matchingWorkout.dayIndex}`;

        const { data: existingCompletion } = await supabaseClient
          .from("workout_completions")
          .select("id")
          .eq("user_id", user.id)
          .eq("training_plan_id", matchingWorkout.planId)
          .eq("week_index", matchingWorkout.weekIndex)
          .eq("day_index", matchingWorkout.dayIndex)
          .maybeSingle();

        if (!existingCompletion) {
          const { error: insertError } = await supabaseClient
            .from("workout_completions")
            .insert({
              user_id: user.id,
              training_plan_id: matchingWorkout.planId,
              week_index: matchingWorkout.weekIndex,
              day_index: matchingWorkout.dayIndex,
              completed_at: activityDate.toISOString(),
              notes: `Imported from Garmin: ${activity.activityName}`,
              distance: activity.distance ? activity.distance / 1000 : null,
              duration: activity.duration
                ? Math.round(activity.duration / 60)
                : null,
            });

          if (!insertError) {
            syncedCount++;
            syncedActivities.push({
              date: activityDate.toISOString().split("T")[0],
              name: activity.activityName,
              distance: activity.distance,
              duration: activity.duration,
            });
          }
        }
      }
    }

    await supabaseClient
      .from("garmin_connections")
      .update({
        last_sync_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);

    return new Response(
      JSON.stringify({
        success: true,
        synced_count: syncedCount,
        total_activities: activities.length,
        synced_activities: syncedActivities,
        message:
          syncedCount > 0
            ? `Successfully imported ${syncedCount} activities from Garmin Connect!`
            : "No new activities to import.",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Garmin activity sync error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
