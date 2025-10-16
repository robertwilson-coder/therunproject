import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface WorkoutReminder {
  id: string;
  user_id: string;
  training_plan_id: string;
  reminder_type: string;
  reminder_time: string;
  is_active: boolean;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing environment variables");
    }

    const currentTime = new Date();
    const currentHour = currentTime.getHours();
    const currentMinute = currentTime.getMinutes();
    const currentDay = currentTime.getDay();
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    const response = await fetch(`${supabaseUrl}/rest/v1/workout_reminders?is_active=eq.true`, {
      headers: {
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`,
      },
    });

    const reminders: WorkoutReminder[] = await response.json();

    const remindersToSend = reminders.filter((reminder) => {
      const [hours, minutes] = reminder.reminder_time.split(':').map(Number);

      if (Math.abs(hours - currentHour) > 1 || Math.abs(minutes - currentMinute) > 30) {
        return false;
      }

      if (reminder.reminder_type === 'daily') {
        return true;
      }

      if (reminder.reminder_type === 'weekly' && currentDay === 1) {
        return true;
      }

      return false;
    });

    const notificationResults = await Promise.all(
      remindersToSend.map(async (reminder) => {
        const planResponse = await fetch(
          `${supabaseUrl}/rest/v1/training_plans?id=eq.${reminder.training_plan_id}`,
          {
            headers: {
              'apikey': supabaseServiceKey,
              'Authorization': `Bearer ${supabaseServiceKey}`,
            },
          }
        );

        const plans = await planResponse.json();
        const plan = plans[0];

        if (!plan) {
          return { success: false, reminder_id: reminder.id, reason: 'Plan not found' };
        }

        const weekNumber = Math.floor(
          (currentTime.getTime() - new Date(plan.created_at).getTime()) /
          (7 * 24 * 60 * 60 * 1000)
        );

        const currentDayName = dayNames[currentDay];
        const week = plan.plan_data.plan[weekNumber];

        let workoutText = 'Check your training plan for today\'s workout!';
        if (week && week.days[currentDayName]) {
          const dayData = week.days[currentDayName];
          workoutText = typeof dayData === 'string' ? dayData : dayData.workout;
        }

        console.log(`Would send reminder to user ${reminder.user_id}: ${workoutText}`);

        return {
          success: true,
          reminder_id: reminder.id,
          user_id: reminder.user_id,
          workout: workoutText,
        };
      })
    );

    const data = {
      message: 'Reminder check completed',
      timestamp: currentTime.toISOString(),
      reminders_checked: reminders.length,
      reminders_sent: notificationResults.filter(r => r.success).length,
      results: notificationResults,
    };

    return new Response(JSON.stringify(data), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.error('Error processing reminders:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});