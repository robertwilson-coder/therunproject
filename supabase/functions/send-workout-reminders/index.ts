import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

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
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing environment variables");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const currentTime = new Date();
    const currentHour = currentTime.getHours();
    const currentMinute = currentTime.getMinutes();
    const currentDay = currentTime.getDay();
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    const { data: reminders, error: remindersError } = await supabase
      .from('workout_reminders')
      .select('*')
      .eq('is_active', true);

    if (remindersError) {
      throw new Error(`Failed to fetch reminders: ${remindersError.message}`);
    }

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
        try {
          const { data: plan, error: planError } = await supabase
            .from('training_plans')
            .select('*, plan_data')
            .eq('id', reminder.training_plan_id)
            .single();

          if (planError || !plan) {
            return { success: false, reminder_id: reminder.id, reason: 'Plan not found' };
          }

          const { data: user, error: userError } = await supabase.auth.admin.getUserById(
            reminder.user_id
          );

          if (userError || !user || !user.user.email) {
            return { success: false, reminder_id: reminder.id, reason: 'User not found or no email' };
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

          const plainTextEmail = `Today's Workout Reminder

Hi there! Time to lace up your running shoes.

Today's Workout:
${workoutText}

Stay consistent, stay strong!

View your full training plan at: ${supabaseUrl.replace('supabase.co', 'therunproject.com')}`;

          if (resendApiKey) {
            const emailResponse = await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${resendApiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                from: 'The Run Project <onboarding@resend.dev>',
                to: [user.user.email],
                subject: `Today's Workout: ${plan.plan_type || 'Training Plan'}`,
                html: `
                  <html>
                    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                        <h2 style="color: #2563eb;">Today's Workout Reminder</h2>
                        <p>Hi there! Time to lace up your running shoes.</p>
                        <div style="background-color: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
                          <h3 style="margin-top: 0; color: #1f2937;">Today's Workout:</h3>
                          <p style="margin-bottom: 0;">${workoutText}</p>
                        </div>
                        <p>Stay consistent, stay strong!</p>
                        <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
                          <a href="${supabaseUrl.replace('supabase.co', 'therunproject.com')}" style="color: #2563eb;">View your full training plan</a>
                        </p>
                      </div>
                    </body>
                  </html>
                `,
              }),
            });

            const emailResult = await emailResponse.json();

            if (!emailResponse.ok) {
              console.error('Email send failed:', emailResult);
              return {
                success: false,
                reminder_id: reminder.id,
                user_id: reminder.user_id,
                reason: 'Email send failed',
              };
            }

            await supabase.from('notifications').insert({
              user_id: reminder.user_id,
              title: `Today's Workout`,
              message: workoutText,
              type: 'info',
              email_text: plainTextEmail,
            });

            console.log(`Email sent to ${user.user.email}: ${workoutText}`);
            return {
              success: true,
              reminder_id: reminder.id,
              user_id: reminder.user_id,
              email: user.user.email,
              workout: workoutText,
            };
          } else {
            await supabase.from('notifications').insert({
              user_id: reminder.user_id,
              title: `Today's Workout`,
              message: workoutText,
              type: 'info',
              email_text: plainTextEmail,
            });

            console.log(`Would send reminder to ${user.user.email}: ${workoutText}`);
            return {
              success: true,
              reminder_id: reminder.id,
              user_id: reminder.user_id,
              email: user.user.email,
              workout: workoutText,
              note: 'Resend API key not configured',
            };
          }
        } catch (error) {
          console.error(`Error processing reminder ${reminder.id}:`, error);
          return {
            success: false,
            reminder_id: reminder.id,
            reason: error instanceof Error ? error.message : 'Unknown error',
          };
        }
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