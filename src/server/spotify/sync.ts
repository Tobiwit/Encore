import "server-only";
import { randomUUID } from "node:crypto";
import { spotifyConfig } from "@/lib/env";
import type { AdminClient } from "@/lib/supabase/admin";
import { decryptSecret, encryptSecret } from "@/server/crypto";
import { bestImage, getTopArtists, refreshAccessToken, SpotifyAuthError, TIME_RANGES, type TimeRange } from "./client";

type Account = {
  id: string;
  user_id: string;
  access_token_encrypted: string | null;
  refresh_token_encrypted: string | null;
  expires_at: string | null;
};

export type SyncOutcome =
  | { ok: true; newArtists: number; ranges: Record<TimeRange, number | "failed"> }
  | { ok: false; revoked: boolean; error: string };

/** Returns a valid access token, refreshing (and persisting the refreshed tokens) when needed. */
export async function getValidAccessToken(admin: AdminClient, account: Account): Promise<string> {
  if (!account.refresh_token_encrypted && !account.access_token_encrypted) {
    throw new SpotifyAuthError("No stored Spotify credentials", true);
  }
  const fresh = account.expires_at && Date.parse(account.expires_at) > Date.now() + 60_000;
  if (fresh && account.access_token_encrypted) return decryptSecret(account.access_token_encrypted);
  if (!account.refresh_token_encrypted) throw new SpotifyAuthError("Access expired and no refresh token stored", true);

  const spotify = spotifyConfig();
  if (!spotify) throw new Error("SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET are not configured");
  const tokens = await refreshAccessToken(decryptSecret(account.refresh_token_encrypted), spotify.clientId, spotify.clientSecret);
  await admin
    .from("connected_accounts")
    .update({
      access_token_encrypted: encryptSecret(tokens.accessToken),
      refresh_token_encrypted: tokens.refreshToken ? encryptSecret(tokens.refreshToken) : account.refresh_token_encrypted,
      expires_at: tokens.expiresAt.toISOString(),
    })
    .eq("id", account.id);
  return tokens.accessToken;
}

/**
 * Imports top artists for every supported range. A failing or empty range does not fail the
 * whole sync; user curation is preserved by import_spotify_top_artists().
 */
export async function syncSpotifyAccount(admin: AdminClient, account: Account): Promise<SyncOutcome> {
  let accessToken: string;
  try {
    accessToken = await getValidAccessToken(admin, account);
  } catch (error) {
    const revoked = error instanceof SpotifyAuthError && error.revoked;
    await admin.rpc("record_spotify_sync_result", { p_account_id: account.id, p_success: false, p_error: String(error), p_revoked: revoked });
    return { ok: false, revoked, error: String(error) };
  }

  const ranges = {} as Record<TimeRange, number | "failed">;
  const items: { time_range: TimeRange; rank: number; spotify_id: string; name: string; image_url: string | null; genres: string[]; external_url: string | null }[] = [];
  let authFailure: SpotifyAuthError | null = null;

  for (const range of TIME_RANGES) {
    try {
      const artists = await getTopArtists(accessToken, range);
      ranges[range] = artists.length;
      artists.forEach((a, i) =>
        items.push({
          time_range: range,
          rank: i + 1,
          spotify_id: a.id,
          name: a.name,
          image_url: bestImage(a.images),
          genres: a.genres ?? [],
          external_url: a.external_urls?.spotify ?? null,
        }),
      );
    } catch (error) {
      ranges[range] = "failed";
      if (error instanceof SpotifyAuthError) {
        authFailure = error;
        break;
      }
    }
  }

  if (authFailure || Object.values(ranges).every((r) => r === "failed")) {
    const error = authFailure ? authFailure.message : "All time ranges failed";
    const revoked = authFailure?.revoked ?? false;
    await admin.rpc("record_spotify_sync_result", { p_account_id: account.id, p_success: false, p_error: error, p_revoked: revoked });
    return { ok: false, revoked, error };
  }

  const { data, error } = await admin.rpc("import_spotify_top_artists", {
    p_user_id: account.user_id,
    p_batch_id: randomUUID(),
    p_items: items,
  });
  if (error) {
    await admin.rpc("record_spotify_sync_result", { p_account_id: account.id, p_success: false, p_error: error.message });
    return { ok: false, revoked: false, error: error.message };
  }

  await admin.rpc("record_spotify_sync_result", { p_account_id: account.id, p_success: true, p_error: "" });
  const newArtists = Number((data as { new_artists?: number } | null)?.new_artists ?? 0);
  return { ok: true, newArtists, ranges };
}
