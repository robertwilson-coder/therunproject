import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

interface GarminUserProfile {
  userId: string;
  displayName?: string;
  emailAddress?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    if (error) {
      console.error("OAuth error:", error);
      const errorReturnUrl = state ? JSON.parse(decodeURIComponent(state)).returnUrl : "/";
      return Response.redirect(
        `${errorReturnUrl}?garmin=error&message=${encodeURIComponent(error)}`
      );
    }

    if (!code || !state) {
      throw new Error("Missing required parameters");
    }

    const stateData = JSON.parse(decodeURIComponent(state));
    const { userId, returnUrl, codeVerifier } = stateData;

    if (!userId || !codeVerifier) {
      throw new Error("Invalid state data");
    }

    const garminClientId = Deno.env.get("GARMIN_CLIENT_ID");
    const garminClientSecret = Deno.env.get("GARMIN_CLIENT_SECRET");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!garminClientId || !garminClientSecret) {
      throw new Error("Garmin credentials not configured");
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Supabase credentials not configured");
    }

    const redirectUri = `${supabaseUrl}/functions/v1/garmin-oauth-callback`;

    const tokenResponse = await fetch(
      "https://connectapi.garmin.com/oauth-service/oauth/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: garminClientId,
          client_secret: garminClientSecret,
          code: code,
          code_verifier: codeVerifier,
          redirect_uri: redirectUri,
        }),
      }
    );

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error("Token exchange failed:", errorText);
      throw new Error(`Token exchange failed: ${errorText}`);
    }

    const tokens: TokenResponse = await tokenResponse.json();

    const userProfileResponse = await fetch(
      "https://connectapi.garmin.com/oauth-service/oauth/user/profile",
      {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
        },
      }
    );

    if (!userProfileResponse.ok) {
      console.error("Failed to fetch user profile");
    }

    const userProfile: GarminUserProfile = userProfileResponse.ok
      ? await userProfileResponse.json()
      : { userId: "unknown" };

    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + tokens.expires_in);

    const { error: upsertError } = await supabaseClient
      .from("garmin_connections")
      .upsert(
        {
          user_id: userId,
          garmin_user_id: userProfile.userId,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_at: expiresAt.toISOString(),
          connected_at: new Date().toISOString(),
          auto_sync_workouts: true,
        },
        {
          onConflict: "user_id",
        }
      );

    if (upsertError) {
      console.error("Database error:", upsertError);
      throw new Error(`Failed to save connection: ${upsertError.message}`);
    }

    return Response.redirect(
      `${returnUrl || "/"}?garmin=connected&message=${encodeURIComponent("Successfully connected to Garmin Connect!")}`
    );
  } catch (error) {
    console.error("Garmin OAuth callback error:", error);
    return Response.redirect(
      `/?garmin=error&message=${encodeURIComponent(error instanceof Error ? error.message : "Unknown error")}`
    );
  }
});
