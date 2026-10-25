import { fetchWithRetry, ProviderError } from "@/server/http";

/**
 * Spotify Web API client (server-only usage: tokens never reach the browser).
 * Top artists: GET /me/top/artists, scope user-top-read, max 50 per page.
 * https://developer.spotify.com/documentation/web-api/reference/get-users-top-artists-and-tracks
 */

export const SPOTIFY_SCOPES = ["user-top-read"] as const;
export const TIME_RANGES = ["short_term", "medium_term", "long_term"] as const;
export type TimeRange = (typeof TIME_RANGES)[number];

export type SpotifyArtist = {
  id: string;
  name: string;
  images?: { url: string; width?: number | null; height?: number | null }[];
  genres?: string[];
  external_urls?: { spotify?: string };
};

export class SpotifyAuthError extends Error {
  constructor(
    message: string,
    readonly revoked: boolean,
  ) {
    super(message);
    this.name = "SpotifyAuthError";
  }
}

export type TokenSet = { accessToken: string; refreshToken: string | null; expiresAt: Date };

export async function refreshAccessToken(refreshToken: string, clientId: string, clientSecret: string): Promise<TokenSet> {
  const res = await fetchWithRetry(
    "https://accounts.spotify.com/api/token",
    {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
    },
    { provider: "spotify" },
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    // invalid_grant: the user revoked access or the refresh token expired.
    throw new SpotifyAuthError(`Token refresh failed (${res.status} ${body.error ?? ""})`.trim(), body.error === "invalid_grant");
  }
  const data = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number };
  return {
    accessToken: data.access_token,
    // Spotify may rotate the refresh token; keep the old one when it does not.
    refreshToken: data.refresh_token ?? refreshToken,
    expiresAt: new Date(Date.now() + (data.expires_in - 60) * 1000),
  };
}

async function api<T>(accessToken: string, path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`https://api.spotify.com/v1${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetchWithRetry(url.toString(), { headers: { authorization: `Bearer ${accessToken}` } }, { provider: "spotify" });
  if (res.status === 401) throw new SpotifyAuthError("Access token rejected", false);
  if (res.status === 403) throw new SpotifyAuthError("Access forbidden (scope missing or app not authorised for this user)", true);
  if (!res.ok) throw new ProviderError(`Spotify ${path} responded ${res.status}`, res.status, "spotify", res.status === 429 || res.status >= 500);
  return (await res.json()) as T;
}

export async function getTopArtists(accessToken: string, timeRange: TimeRange): Promise<SpotifyArtist[]> {
  const data = await api<{ items?: SpotifyArtist[] }>(accessToken, "/me/top/artists", { time_range: timeRange, limit: "50" });
  return (data.items ?? []).filter((a) => a?.id && a?.name);
}

export async function searchArtists(accessToken: string, query: string): Promise<SpotifyArtist[]> {
  const data = await api<{ artists?: { items?: SpotifyArtist[] } }>(accessToken, "/search", { q: query, type: "artist", limit: "10" });
  return (data.artists?.items ?? []).filter((a) => a?.id && a?.name);
}

export function bestImage(images: SpotifyArtist["images"]): string | null {
  if (!images?.length) return null;
  // Prefer a ~640px image: large enough for heroes without pulling originals.
  const sorted = [...images].sort((a, b) => Math.abs((a.width ?? 640) - 640) - Math.abs((b.width ?? 640) - 640));
  return sorted[0]?.url ?? null;
}
