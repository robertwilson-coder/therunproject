import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface FeedbackPayload {
  type: 'INSERT';
  table: string;
  record: {
    id: string;
    user_id: string | null;
    most_useful: string;
    confusing_frustrating: string;
    comparison: string;
    improvements: string;
    other_remarks: string;
    created_at: string;
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const payload: FeedbackPayload = await req.json();
    const { record } = payload;

    const discordWebhookUrl = Deno.env.get("DISCORD_WEBHOOK_URL");

    if (!discordWebhookUrl) {
      console.error("DISCORD_WEBHOOK_URL not configured");
      return new Response(
        JSON.stringify({ error: "Discord webhook not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const userLabel = record.user_id ? `User ID: ${record.user_id}` : "Anonymous";

    const embed = {
      title: "🎯 New Beta Feedback Received!",
      color: 0x5865F2,
      fields: [
        {
          name: "👤 Submitted By",
          value: userLabel,
          inline: false,
        },
        {
          name: "✨ Most Useful",
          value: record.most_useful || "_No response_",
          inline: false,
        },
        {
          name: "😕 Confusing/Frustrating",
          value: record.confusing_frustrating || "_No response_",
          inline: false,
        },
        {
          name: "📊 Comparison to Other Plans",
          value: record.comparison || "_No response_",
          inline: false,
        },
        {
          name: "💡 Suggested Improvements",
          value: record.improvements || "_No response_",
          inline: false,
        },
        {
          name: "💬 Other Remarks",
          value: record.other_remarks || "_No response_",
          inline: false,
        },
      ],
      timestamp: record.created_at,
      footer: {
        text: `Feedback ID: ${record.id}`,
      },
    };

    const discordResponse = await fetch(discordWebhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        embeds: [embed],
      }),
    });

    if (!discordResponse.ok) {
      const errorText = await discordResponse.text();
      console.error("Discord API error:", errorText);
      throw new Error(`Discord API returned ${discordResponse.status}`);
    }

    return new Response(
      JSON.stringify({ success: true }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error sending Discord notification:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
