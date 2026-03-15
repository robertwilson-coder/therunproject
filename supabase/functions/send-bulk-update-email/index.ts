import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

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
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const resendApiKey = Deno.env.get('RESEND_API_KEY');

    if (!supabaseUrl || !supabaseServiceKey || !resendApiKey) {
      console.error('Missing required environment variables');
      return new Response(
        JSON.stringify({ error: "Service not configured properly" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: users, error: usersError } = await supabase.auth.admin.listUsers();

    if (usersError) {
      console.error('Error fetching users:', usersError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch users", details: usersError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

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
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: bold;">Chat just got smarter</h1>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <p style="color: #4b5563; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">Hey! How are you? I hope you're doing well and enjoying your training!</p>

              <p style="color: #4b5563; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">I've been busy working on the coach chat and it's now significantly better. Responses are faster, plan modifications are handled more intelligently, and rescheduling or load changes works more reliably.</p>

              <p style="color: #4b5563; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">If you haven't used the chat in a while, now's a good time to try it. Log in and open the coach chat from your training plan.</p>

              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;" />

              <p style="color: #4b5563; font-size: 15px; line-height: 1.6; margin: 0 0 15px 0;"><strong>Note for Android users:</strong> If you use the app version on Android, you may need to uninstall and reinstall to see these updates.</p>

              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;" />

              <p style="color: #4b5563; font-size: 15px; line-height: 1.6; margin: 0 0 15px 0;">As always, please feel free to share any feedback you might have — anything you like a lot or don't like, or something that seems not to work very well. All feedback is good feedback!</p>

              <!-- Button -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 30px 0;">
                <tr>
                  <td align="center" style="padding: 0;">
                    <table cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td align="center" style="background-color: #2563eb; border-radius: 6px;">
                          <a href="https://therunproject.app" style="display: inline-block; padding: 16px 40px; color: #ffffff; text-decoration: none; font-weight: bold; font-size: 16px;">Open the coach chat</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <p style="color: #4b5563; font-size: 15px; line-height: 1.6; margin: 20px 0 0 0;">Thanks a lot,</p>
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
Chat just got smarter

Hey! How are you? I hope you're doing well and enjoying your training!

I've been busy working on the coach chat and it's now significantly better. Responses are faster, plan modifications are handled more intelligently, and rescheduling or load changes works more reliably.

If you haven't used the chat in a while, now's a good time to try it. Log in and open the coach chat from your training plan.

---

Note for Android users: If you use the app version on Android, you may need to uninstall and reinstall to see these updates.

---

As always, please feel free to share any feedback you might have — anything you like a lot or don't like, or something that seems not to work very well. All feedback is good feedback!

Open the coach chat: https://therunproject.app

Thanks a lot,
Rob

---
The Run Project
Your personalized training companion
`;

    const emailResults = {
      sent: 0,
      failed: 0,
      errors: [] as string[],
    };

    for (const user of users.users) {
      if (user.email) {
        try {
          const resendResponse = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${resendApiKey}`,
            },
            body: JSON.stringify({
              from: 'The Run Project <updates@resend.dev>',
              to: user.email,
              subject: 'Chat just got smarter',
              html: htmlEmail,
              text: textEmail,
            }),
          });

          if (resendResponse.ok) {
            emailResults.sent++;
            console.log(`Email sent successfully to ${user.email}`);
          } else {
            const errorData = await resendResponse.json();
            emailResults.failed++;
            emailResults.errors.push(`${user.email}: ${JSON.stringify(errorData)}`);
            console.error(`Failed to send to ${user.email}:`, errorData);
          }

          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          emailResults.failed++;
          emailResults.errors.push(`${user.email}: ${error.message}`);
          console.error(`Error sending to ${user.email}:`, error);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Bulk email sending completed`,
        results: {
          totalUsers: users.users.length,
          sent: emailResults.sent,
          failed: emailResults.failed,
          errors: emailResults.errors.slice(0, 10),
        }
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error('Error in send-bulk-update-email:', error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
