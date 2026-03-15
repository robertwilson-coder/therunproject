import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const resendApiKey = Deno.env.get('RESEND_API_KEY');

    if (!resendApiKey) {
      console.error('Missing RESEND_API_KEY');
      return new Response(
        JSON.stringify({ error: "Service not configured properly" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const testEmail = 'rob1wilson@hotmail.com';

    const htmlEmail = `
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
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: bold;">Important Updates to The Run Project</h1>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <p style="color: #4b5563; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">Hello Runners,</p>

              <p style="color: #4b5563; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">I wanted to send a quick note to let you know about some important upgrades to <strong>The Run Project</strong>.</p>

              <p style="color: #4b5563; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">I've been working hard behind the scenes to make things better, and I'm excited to share what's new.</p>

              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;" />

              <h3 style="color: #1f2937; font-size: 18px; margin-top: 30px; margin-bottom: 15px; font-weight: bold;">🚀 What's new</h3>

              <h4 style="color: #1f2937; font-size: 16px; margin-top: 20px; margin-bottom: 10px; font-weight: bold;">Smarter, more structured training plans</h4>
              <p style="color: #4b5563; font-size: 15px; line-height: 1.6; margin: 0 0 15px 0;">Training plans are now more refined and intentional than ever. I've improved the AI to generate <strong>clearer, more structured, and more personalised workouts</strong> that better align with your goals, fitness level, and race timeline.</p>

              <h4 style="color: #1f2937; font-size: 16px; margin-top: 20px; margin-bottom: 10px; font-weight: bold;">Critical bug fixes</h4>
              <p style="color: #4b5563; font-size: 15px; line-height: 1.6; margin: 0 0 15px 0;">I've resolved several important issues that were affecting plan generation and workout tracking. You should now notice a <strong>smoother, more reliable experience</strong> across the app.</p>

              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;" />

              <h3 style="color: #1f2937; font-size: 18px; margin-top: 30px; margin-bottom: 15px; font-weight: bold;">🔄 A quick recommendation</h3>
              <p style="color: #4b5563; font-size: 15px; line-height: 1.6; margin: 0 0 15px 0;">To fully benefit from these improvements, I <strong>recommend generating a new training plan</strong>.</p>
              <p style="color: #4b5563; font-size: 15px; line-height: 1.6; margin: 0 0 15px 0;">Some of the updates — particularly those related to plan structure and workout logic — couldn't be fully applied to plans that were already generated. Creating a new plan ensures you're getting the most out of the latest changes.</p>

              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;" />

              <h3 style="color: #1f2937; font-size: 18px; margin-top: 30px; margin-bottom: 15px; font-weight: bold;">📊 Enhanced dashboard features</h3>

              <p style="color: #4b5563; font-size: 15px; line-height: 1.6; margin: 0 0 15px 0;">Your dashboard now brings everything together to help you train with confidence:</p>

              <ul style="margin: 0 0 20px 0; padding-left: 20px; color: #4b5563; font-size: 15px; line-height: 1.8;">
                <li style="margin-bottom: 12px;"><strong>Progress tracking</strong><br><span style="font-size: 14px; color: #6b7280;">Track workout completion, consistency, and training volume with clear charts and insights.</span></li>
                <li style="margin-bottom: 12px;"><strong>Streaks & badges</strong><br><span style="font-size: 14px; color: #6b7280;">Stay motivated with achievement tracking and consistency rewards.</span></li>
                <li style="margin-bottom: 12px;"><strong>Training tools</strong><br><span style="font-size: 14px; color: #6b7280;">Use built-in pace calculators, heart rate zones, and recovery tracking tools to guide your training.</span></li>
                <li style="margin-bottom: 12px;"><strong>Performance analytics</strong><br><span style="font-size: 14px; color: #6b7280;">Explore trends and insights to better understand how your fitness is progressing.</span></li>
                <li style="margin-bottom: 12px;"><strong>Nutrition Lab</strong><br><span style="font-size: 14px; color: #6b7280;">Experiment with fueling strategies and track what works best for you.</span></li>
                <li style="margin-bottom: 12px;"><strong>Race day planning</strong><br><span style="font-size: 14px; color: #6b7280;">Build and refine your race strategy during training so you're ready when it counts.</span></li>
              </ul>

              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;" />

              <p style="color: #4b5563; font-size: 15px; line-height: 1.6; margin: 0 0 15px 0;">I'm also actively working on <strong>Garmin and TrainingPeaks integrations</strong>, which should be available in the near future. A few other features — including training partners, a community feed, and groups — are also in development.</p>

              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;" />

              <h3 style="color: #1f2937; font-size: 18px; margin-top: 30px; margin-bottom: 15px; font-weight: bold;">💬 Your feedback matters</h3>
              <p style="color: #4b5563; font-size: 15px; line-height: 1.6; margin: 0 0 15px 0;">Your feedback genuinely helps shape The Run Project. If something feels off, or if you have ideas for new features, please use the <strong>Give Feedback</strong> button at the top of any page — I read every submission.</p>

              <!-- Button -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 30px 0;">
                <tr>
                  <td align="center" style="padding: 0;">
                    <table cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td align="center" style="background-color: #2563eb; border-radius: 6px;">
                          <a href="https://therunproject.app" style="display: inline-block; padding: 16px 40px; color: #ffffff; text-decoration: none; font-weight: bold; font-size: 16px;">View your training plan</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <p style="color: #4b5563; font-size: 15px; line-height: 1.6; margin: 20px 0 0 0;">Thanks for being part of The Run Project. I'm committed to helping you train smarter, race stronger, and enjoy the process along the way.</p>
              <p style="color: #4b5563; font-size: 15px; line-height: 1.6; margin: 15px 0 0 0;">Keep running strong,</p>
              <p style="color: #4b5563; font-size: 15px; line-height: 1.6; margin: 5px 0 0 0; font-weight: bold;">Rob</p>
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
Important Updates to The Run Project

Hello Runners,

I wanted to send a quick note to let you know about some important upgrades to The Run Project.

I've been working hard behind the scenes to make things better, and I'm excited to share what's new.

---

🚀 WHAT'S NEW

Smarter, more structured training plans

Training plans are now more refined and intentional than ever. I've improved the AI to generate clearer, more structured, and more personalised workouts that better align with your goals, fitness level, and race timeline.

Critical bug fixes

I've resolved several important issues that were affecting plan generation and workout tracking. You should now notice a smoother, more reliable experience across the app.

---

🔄 A QUICK RECOMMENDATION

To fully benefit from these improvements, I recommend generating a new training plan.

Some of the updates — particularly those related to plan structure and workout logic — couldn't be fully applied to plans that were already generated. Creating a new plan ensures you're getting the most out of the latest changes.

---

📊 ENHANCED DASHBOARD FEATURES

Your dashboard now brings everything together to help you train with confidence:

• Progress tracking
  Track workout completion, consistency, and training volume with clear charts and insights.

• Streaks & badges
  Stay motivated with achievement tracking and consistency rewards.

• Training tools
  Use built-in pace calculators, heart rate zones, and recovery tracking tools to guide your training.

• Performance analytics
  Explore trends and insights to better understand how your fitness is progressing.

• Nutrition Lab
  Experiment with fueling strategies and track what works best for you.

• Race day planning
  Build and refine your race strategy during training so you're ready when it counts.

---

I'm also actively working on Garmin and TrainingPeaks integrations, which should be available in the near future. A few other features — including training partners, a community feed, and groups — are also in development.

---

💬 YOUR FEEDBACK MATTERS

Your feedback genuinely helps shape The Run Project. If something feels off, or if you have ideas for new features, please use the Give Feedback button at the top of any page — I read every submission.

👉 View your training plan: https://therunproject.app

Thanks for being part of The Run Project. I'm committed to helping you train smarter, race stronger, and enjoy the process along the way.

Keep running strong,
Rob

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
        from: 'The Run Project <updates@resend.dev>',
        to: testEmail,
        subject: '[TEST] Important Updates: Enhanced Training Plans & New Features',
        html: htmlEmail,
        text: textEmail,
      }),
    });

    if (resendResponse.ok) {
      const data = await resendResponse.json();
      return new Response(
        JSON.stringify({
          success: true,
          message: `Test email sent successfully to ${testEmail}`,
          data
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    } else {
      const errorData = await resendResponse.json();
      console.error('Failed to send test email:', errorData);
      return new Response(
        JSON.stringify({
          error: "Failed to send test email",
          details: errorData
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
  } catch (error) {
    console.error('Error in send-test-email:', error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
