import "server-only";
import { ticketmasterConfig } from "@/lib/env";
import type { AdminClient } from "@/lib/supabase/admin";
import { matchAttraction } from "@/server/providers/matching";
import { createTicketmasterAdapter } from "@/server/providers/ticketmaster/client";
import type { TicketProviderAdapter } from "@/server/providers/types";
import { ProviderError } from "@/server/http";

/** Work is processed artist by artist until the batch or the time budget runs out. */
export type Budget = { limit: number; deadline: number };

function adapter(): TicketProviderAdapter | null {
  const config = ticketmasterConfig();
  return config ? createTicketmasterAdapter(config) : null;
}

function describe(error: unknown) {
  if (error instanceof ProviderError) return error.message;
  return error instanceof Error ? error.message : String(error);
}

/** Quota exhausted or credentials rejected: further calls in this run would fail the same way. */
function isFatal(error: unknown) {
  return error instanceof ProviderError && [401, 403, 429].includes(error.status);
}

type LookupTarget = { artist_id: string; canonical_name: string; spotify_id: string | null };
type RefreshTarget = { artist_id: string; external_artist_id: string; first_fetch: boolean };

/** Finds one artist on the provider. Returns the linked attraction id, or null when not found. */
async function matchOne(admin: AdminClient, provider: TicketProviderAdapter, artist: LookupTarget) {
  const candidates = await provider.searchAttractions(artist.canonical_name);
  const match = matchAttraction({ name: artist.canonical_name, spotifyId: artist.spotify_id }, candidates);
  if (match.kind !== "linked") {
    // Record the lookup so we back off (14 days) before trying again.
    await admin.from("artists").update({ provider_lookup_at: new Date().toISOString() }).eq("id", artist.artist_id);
    return null;
  }
  await admin.rpc("link_artist_provider", {
    p_artist_id: artist.artist_id,
    p_provider: provider.provider,
    p_external_id: match.attraction.id,
    p_external_url: match.attraction.url ?? "",
    p_method: match.method,
    p_confidence: match.confidence,
  });
  return { attractionId: match.attraction.id, nameOnly: match.method === "exact_name" };
}

/**
 * Fetches and stores one artist's events. On an artist's first fetch every existing show is
 * back-fill: stored, but not "just announced" and no "new concert" alerts.
 */
async function refreshOne(admin: AdminClient, provider: TicketProviderAdapter, artist: RefreshTarget) {
  const stats = { events: 0, created: 0, changed: 0, scheduled: 0, cancelled: 0, errors: 0, lastError: undefined as string | undefined };
  const events = await provider.eventsForAttraction(artist.external_artist_id);
  for (const event of events) {
    const { data: result, error: ingestError } = await admin.rpc("ingest_provider_event", { p: { ...event, is_backfill: artist.first_fetch } });
    if (ingestError) {
      stats.errors++;
      stats.lastError = `Could not store an event: ${ingestError.message}`;
      continue;
    }
    const r = result as { event_id: string; created: boolean; changes: unknown[] };
    stats.events++;
    if (r.created) stats.created++;
    if (r.changes.length) stats.changed++;
    const { data: sched } = await admin.rpc("schedule_event_notifications", {
      p_event_id: r.event_id,
      p_is_new: r.created && !artist.first_fetch,
      p_changes: r.changes as never,
    });
    stats.scheduled += Number((sched as { scheduled?: number } | null)?.scheduled ?? 0);
    stats.cancelled += Number((sched as { cancelled?: number } | null)?.cancelled ?? 0);
  }
  await admin.rpc("mark_artist_events_refreshed", { p_artist_id: artist.artist_id });
  return stats;
}

/** Links followed artists to provider attractions (Spotify link first, unique exact name as fallback). */
export async function matchArtistsToProvider(admin: AdminClient, budget: Budget = { limit: 40, deadline: Infinity }) {
  const provider = adapter();
  if (!provider) return { skipped: "Ticketmaster is not configured (TICKETMASTER_API_KEY)" };

  const { data: artists, error } = await admin.rpc("artists_needing_provider_lookup", { p_provider: provider.provider, p_limit: budget.limit });
  if (error) throw new Error(error.message);

  const stats = { pending: artists?.length ?? 0, checked: 0, linked: 0, nameOnly: 0, unmatched: 0, errors: 0, lastError: undefined as string | undefined };
  for (const artist of artists ?? []) {
    if (Date.now() > budget.deadline) break;
    try {
      const linked = await matchOne(admin, provider, artist);
      if (linked) {
        stats.linked++;
        if (linked.nameOnly) stats.nameOnly++;
      } else {
        stats.unmatched++;
      }
      stats.checked++;
    } catch (error) {
      stats.errors++;
      stats.lastError = describe(error);
      if (isFatal(error)) break;
    }
  }
  return stats;
}

/** Fetches events for linked artists, ingests them atomically and (re)schedules notifications. */
export async function refreshArtistEvents(admin: AdminClient, budget: Budget = { limit: 25, deadline: Infinity }) {
  const provider = adapter();
  if (!provider) return { skipped: "Ticketmaster is not configured (TICKETMASTER_API_KEY)" };

  const { data: artists, error } = await admin.rpc("artists_due_for_event_refresh", { p_provider: provider.provider, p_limit: budget.limit });
  if (error) throw new Error(error.message);

  const stats = { pending: artists?.length ?? 0, artists: 0, backfilled: 0, events: 0, created: 0, changed: 0, scheduled: 0, cancelled: 0, errors: 0, lastError: undefined as string | undefined };
  for (const artist of artists ?? []) {
    if (Date.now() > budget.deadline) break;
    try {
      const r = await refreshOne(admin, provider, artist);
      stats.artists++;
      if (artist.first_fetch) stats.backfilled++;
      stats.events += r.events;
      stats.created += r.created;
      stats.changed += r.changed;
      stats.scheduled += r.scheduled;
      stats.cancelled += r.cancelled;
      stats.errors += r.errors;
      stats.lastError = r.lastError ?? stats.lastError;
    } catch (error) {
      stats.errors++;
      stats.lastError = describe(error);
      if (isFatal(error)) break;
    }
  }
  return stats;
}

/**
 * Matching then event refresh within one time budget. Matching gets at most ~45% of it so
 * already-linked artists always get their concert lists refreshed too.
 */
export async function searchConcerts(admin: AdminClient, deadline: number, limit = 500) {
  const now = Date.now();
  const matchDeadline = now + Math.max(0, (deadline - now) * 0.45);
  const matching = await matchArtistsToProvider(admin, { limit, deadline: matchDeadline });
  const refresh = await refreshArtistEvents(admin, { limit, deadline });
  return { matching, refresh };
}

/**
 * Immediate lookup for one artist the user just added by hand: find them on Ticketmaster and,
 * if found, fetch their concerts right away (a few requests, a few seconds).
 */
export async function searchConcertsForArtist(admin: AdminClient, artistId: string) {
  const provider = adapter();
  if (!provider) return { skipped: "Ticketmaster is not configured" };

  const [{ data: artist }, { data: links }] = await Promise.all([
    admin.from("artists").select("id, canonical_name, events_refreshed_at, provider_lookup_at").eq("id", artistId).maybeSingle(),
    admin.from("artist_provider_ids").select("provider, external_artist_id").eq("artist_id", artistId),
  ]);
  if (!artist) return { skipped: "artist not found" };

  let attractionId = links?.find((l) => l.provider === provider.provider)?.external_artist_id ?? null;
  try {
    if (!attractionId) {
      // Respect the 14-day back-off for artists we already failed to find.
      if (artist.provider_lookup_at && Date.parse(artist.provider_lookup_at) > Date.now() - 14 * 24 * 3600_000) return { found: false };
      const spotifyId = links?.find((l) => l.provider === "spotify")?.external_artist_id ?? null;
      const linked = await matchOne(admin, provider, { artist_id: artist.id, canonical_name: artist.canonical_name, spotify_id: spotifyId });
      if (!linked) return { found: false };
      attractionId = linked.attractionId;
    } else if (artist.events_refreshed_at && Date.parse(artist.events_refreshed_at) > Date.now() - 20 * 3600_000) {
      return { found: true, fresh: true };
    }
    const refresh = await refreshOne(admin, provider, { artist_id: artist.id, external_artist_id: attractionId, first_fetch: !artist.events_refreshed_at });
    return { found: true, ...refresh };
  } catch (error) {
    console.error(JSON.stringify({ level: "error", job: "artist-search", artistId, error: describe(error) }));
    return { found: false, error: describe(error) };
  }
}
