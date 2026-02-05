import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@^2.57.4';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface RequestBody {
  userId?: string;
  email?: string;
  emailText?: string;
  name?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { userId, email: providedEmail, emailText, name }: RequestBody = await req.json();

    let email = providedEmail;

    // If userId is provided, look up the email from auth.users
    if (userId && !email) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      });

      const { data: user, error: userError } = await supabase.auth.admin.getUserById(userId);

      if (userError || !user) {
        console.error('Failed to fetch user:', userError);
        return new Response(
          JSON.stringify({ error: "User not found" }),
          {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      email = user.user.email;
    }

    if (!email || !email.includes('@')) {
      return new Response(
        JSON.stringify({ error: "Valid email address is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const resendApiKey = Deno.env.get('RESEND_API_KEY');

    if (!resendApiKey) {
      console.error('RESEND_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: "Email service not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const greeting = name ? `Hi ${name}` : 'Hello';

    // Use provided emailText if available, otherwise use default template
    const htmlEmail = emailText || `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f4f4f4; padding: 40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; max-width: 600px;">
          <!-- Header -->
          <tr>
            <td style="background-color: #2563eb; padding: 40px 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: bold;">Welcome to The Run Project</h1>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <p style="color: #4b5563; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">Thanks for joining! We're excited to help you work toward your running goals with a personalized, flexible training plan powered by AI.</p>

              <p style="color: #4b5563; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">The Run Project is still evolving, and you're getting early access. During this stage, your feedback is incredibly valuable to us. You'll find a Give Feedback button at the top of every page. If something isn't working as expected or you think something could be improved, let us know and we'll get on it as quickly as possible.</p>

              <h3 style="color: #1f2937; font-size: 18px; margin-top: 30px; margin-bottom: 15px; font-weight: bold;">Getting Started</h3>

              <h4 style="color: #1f2937; font-size: 16px; margin-top: 20px; margin-bottom: 10px; font-weight: bold;">Chat with the Coach</h4>

              <p style="color: #4b5563; font-size: 15px; line-height: 1.6; margin: 0 0 10px 0;">Use the chat feature to tailor your plan to your life. You can:</p>
              <ul style="color: #4b5563; font-size: 15px; line-height: 1.8; margin: 0 0 15px 0; padding-left: 20px;">
                <li>Adjust workouts and intensities</li>
                <li>Move rest days or sessions</li>
                <li>Ask for advice, feedback, or answers to any running-related questions</li>
              </ul>

              <p style="color: #4b5563; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">You can adapt your plan at any time, for the entire duration — the coach is available 24/7 with instant responses.</p>

              <h4 style="color: #1f2937; font-size: 16px; margin-top: 20px; margin-bottom: 10px; font-weight: bold;">Flexible Training Schedule</h4>

              <p style="color: #4b5563; font-size: 15px; line-height: 1.6; margin: 0 0 10px 0;">In the plan view, use the shortcut arrows to:</p>
              <ul style="color: #4b5563; font-size: 15px; line-height: 1.8; margin: 0 0 15px 0; padding-left: 20px;">
                <li>Move workouts to a different day</li>
                <li>Adjust workout difficulty when needed</li>
              </ul>

              <p style="color: #4b5563; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">Your training should work with your schedule, not against it.</p>

              <h3 style="color: #1f2937; font-size: 18px; margin-top: 30px; margin-bottom: 15px; font-weight: bold;">Your Dashboard</h3>

              <p style="color: #4b5563; font-size: 15px; line-height: 1.6; margin: 0 0 15px 0;">Your dashboard brings everything together in one place.</p>

              <p style="color: #4b5563; font-size: 15px; line-height: 1.6; margin: 0 0 10px 0;"><strong>Track your progress with:</strong></p>
              <ul style="color: #4b5563; font-size: 15px; line-height: 1.8; margin: 0 0 15px 0; padding-left: 20px;">
                <li>Workout completion and consistency tracking</li>
                <li>Progress charts showing training volume over time</li>
                <li>Streaks and badges to reward consistency</li>
                <li>Performance analytics with deeper training insights</li>
              </ul>

              <p style="color: #4b5563; font-size: 15px; line-height: 1.6; margin: 0 0 10px 0;"><strong>Fine-tune your training with:</strong></p>
              <ul style="color: #4b5563; font-size: 15px; line-height: 1.8; margin: 0 0 20px 0; padding-left: 20px;">
                <li>Pace calculator for races and training zones</li>
                <li>Heart rate zone setup and tracking</li>
                <li>Recovery tools to monitor sleep, injuries, and overall load</li>
              </ul>

              <h3 style="color: #1f2937; font-size: 18px; margin-top: 30px; margin-bottom: 15px; font-weight: bold;">Other Available Features</h3>
              <ul style="color: #4b5563; font-size: 15px; line-height: 1.8; margin: 0 0 20px 0; padding-left: 20px;">
                <li><strong>Nutrition Lab:</strong> Explore fueling strategies that work for you</li>
                <li><strong>Race Day Planning:</strong> Build, test, and refine your race strategy during training</li>
              </ul>

              <h3 style="color: #1f2937; font-size: 18px; margin-top: 30px; margin-bottom: 15px; font-weight: bold;">Coming Soon</h3>
              <ul style="color: #4b5563; font-size: 15px; line-height: 1.8; margin: 0 0 20px 0; padding-left: 20px;">
                <li>Garmin Connect integration</li>
                <li>TrainingPeaks plan syncing</li>
              </ul>

              <!-- Button -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 30px 0;">
                <tr>
                  <td align="center" style="padding: 0;">
                    <table cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td align="center" style="background-color: #2563eb; border-radius: 6px;">
                          <a href="https://therunproject.app" style="display: inline-block; padding: 16px 40px; color: #ffffff; text-decoration: none; font-weight: bold; font-size: 16px;">Start Training</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 20px 0;">
                <tr>
                  <td style="background-color: #f0f9ff; border-left: 4px solid #0284c7; padding: 15px;">
                    <p style="margin: 0; color: #075985; font-size: 14px; line-height: 1.5;">If you need help or have ideas to share, the <strong>Feedback</strong> button is the fastest way to reach us.</p>
                  </td>
                </tr>
              </table>

              <p style="color: #4b5563; font-size: 15px; line-height: 1.6; margin: 20px 0 0 0;">We're glad you're here! Happy running ❤️</p>
              <p style="color: #4b5563; font-size: 15px; line-height: 1.6; margin: 10px 0 0 0; font-weight: bold;">The Run Project Team</p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 30px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0 0 5px 0; color: #1f2937; font-size: 14px; font-weight: bold;">The Run Project</p>
              <p style="margin: 5px 0 0 0; color: #6b7280; font-size: 14px;">Your personalized training companion</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const textEmail = `
Welcome to The Run Project

Thanks for joining! We're excited to help you work toward your running goals with a personalized, flexible training plan powered by AI.

The Run Project is still evolving, and you're getting early access. During this stage, your feedback is incredibly valuable to us. You'll find a Give Feedback button at the top of every page. If something isn't working as expected or you think something could be improved, let us know and we'll get on it as quickly as possible.

GETTING STARTED

Chat with the Coach

Use the chat feature to tailor your plan to your life. You can:
- Adjust workouts and intensities
- Move rest days or sessions
- Ask for advice, feedback, or answers to any running-related questions

You can adapt your plan at any time, for the entire duration — the coach is available 24/7 with instant responses.

Flexible Training Schedule

In the plan view, use the shortcut arrows to:
- Move workouts to a different day
- Adjust workout difficulty when needed

Your training should work with your schedule, not against it.

YOUR DASHBOARD

Your dashboard brings everything together in one place.

Track your progress with:
- Workout completion and consistency tracking
- Progress charts showing training volume over time
- Streaks and badges to reward consistency
- Performance analytics with deeper training insights

Fine-tune your training with:
- Pace calculator for races and training zones
- Heart rate zone setup and tracking
- Recovery tools to monitor sleep, injuries, and overall load

OTHER AVAILABLE FEATURES
- Nutrition Lab: Explore fueling strategies that work for you
- Race Day Planning: Build, test, and refine your race strategy during training

COMING SOON
- Garmin Connect integration
- TrainingPeaks plan syncing

If you need help or have ideas to share, the Feedback button is the fastest way to reach us.

We're glad you're here! Happy running

The Run Project Team

---
The Run Project
Your personalized training companion
`;

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: 'The Run Project <onboarding@resend.dev>',
        to: email,
        subject: 'Welcome to The Run Project - Let\'s Start Your Training!',
        html: htmlEmail,
        text: textEmail,
      }),
    });

    const resendData = await resendResponse.json();

    if (!resendResponse.ok) {
      console.error('Resend API error:', resendData);
      return new Response(
        JSON.stringify({ error: "Failed to send email", details: resendData }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Welcome email sent successfully",
        emailId: resendData.id
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error('Error in send-welcome-email:', error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
