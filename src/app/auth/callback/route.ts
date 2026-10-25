import { NextResponse, type NextRequest } from "next/server";
import { publicEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { safeRedirectPath } from "@/lib/text";
import { encryptSecret } from "@/server/crypto";
import { SPOTIFY_SCOPES } from "@/server/spotify/client";

/**
 * OAuth callback. Exchanges the code (PKCE verifier from this browser's cookie), then stores the
 * Spotify provider tokens encrypted server-side. Provider tokens are never sent to the browser.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const base = publicEnv.appUrl;
  const next = safeRedirectPath(url.searchParams.get("next"), "/onboarding");

  if (url.searchParams.get("error")) {
    // e.g. the user pressed "Cancel" on Spotify's consent screen.
    const reason = url.searchParams.get("error") === "access_denied" ? "denied" : "oauth";
    return NextResponse.redirect(`${base}/?error=${reason}`);
  }

  const code = url.searchParams.get("code");
  if (!code) return NextResponse.redirect(`${base}/?error=oauth`);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.session) return NextResponse.redirect(`${base}/?error=oauth`);

  const { session, user } = data;
  const identity = user.identities?.find((i) => i.provider === "spotify");
  const spotifyUserId = (identity?.identity_data?.provider_id as string | undefined) ?? identity?.id;

  if (spotifyUserId && session.provider_token) {
    const admin = createAdminClient();
    const { data: existing } = await admin
      .from("connected_accounts")
      .select("id, last_successful_sync_at")
      .eq("user_id", user.id)
      .eq("provider", "spotify")
      .maybeSingle();

    const { error: upsertError } = await admin.from("connected_accounts").upsert(
      {
        user_id: user.id,
        provider: "spotify",
        provider_user_id: spotifyUserId,
        access_token_encrypted: encryptSecret(session.provider_token),
        refresh_token_encrypted: session.provider_refresh_token ? encryptSecret(session.provider_refresh_token) : null,
        // Spotify access tokens last one hour; refresh slightly early.
        expires_at: new Date(Date.now() + 55 * 60_000).toISOString(),
        scopes: [...SPOTIFY_SCOPES],
        status: "active",
        sync_failure_count: 0,
        last_sync_error: null,
        // A reconnect makes the account due for a sync straight away.
        next_sync_at: new Date().toISOString(),
      },
      { onConflict: "user_id,provider" },
    );
    if (upsertError) return NextResponse.redirect(`${base}/?error=account`);

    await admin.from("users").update({ spotify_user_id: spotifyUserId }).eq("id", user.id);

    // Returning users with a completed import skip onboarding unless they asked to go there.
    if (existing?.last_successful_sync_at && next === "/onboarding") {
      const { data: profile } = await admin.from("users").select("onboarding_completed_at").eq("id", user.id).single();
      if (profile?.onboarding_completed_at) return NextResponse.redirect(`${base}/discover`);
    }
  }

  return NextResponse.redirect(`${base}${next}`);
}
