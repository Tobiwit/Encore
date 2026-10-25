"use server";

import { redirect } from "next/navigation";
import { publicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { safeRedirectPath } from "@/lib/text";
import { SPOTIFY_SCOPES } from "@/server/spotify/client";

/**
 * Starts the Spotify authorisation-code flow via Supabase Auth (PKCE). The PKCE verifier and
 * OAuth state are bound to this browser's cookies, which protects the callback against CSRF.
 */
export async function signInWithSpotify(formData: FormData) {
  const next = safeRedirectPath(String(formData.get("next") ?? ""), "/onboarding");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "spotify",
    options: {
      scopes: SPOTIFY_SCOPES.join(" "),
      redirectTo: `${publicEnv.appUrl}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });
  if (error || !data.url) redirect("/?error=oauth_start");
  redirect(data.url);
}
