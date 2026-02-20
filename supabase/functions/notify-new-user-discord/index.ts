import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface UserPayload {
  type: 'INSERT';
  table: string;
  record: {
    id: string;
    email: string;
    created_at: string;
    confirmed_at?: string;
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
    const payload: UserPayload = await req.json();
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

    const embed = {
      title: "🎉 New User Signed Up!",
      color: 0x00D084,
      fields: [
        {
          name: "📧 Email",
          value: record.email || "No email",
          inline: false,
        },
        {
          name: "🆔 User ID",
          value: record.id,
          inline: false,
        },
        {
          name: "✅ Confirmed",
          value: record.confirmed_at ? "Yes" : "No (pending)",
          inline: true,
        },
        {
          name: "📅 Signed Up",
          value: new Date(record.created_at).toLocaleString(),
          inline: true,
        },
      ],
      timestamp: record.created_at,
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
