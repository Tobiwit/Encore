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
      const candidates = await provider.searchAttractions(artist.canonical_name);
      const match = matchAttraction({ name: artist.canonical_name, spotifyId: artist.spotify_id }, candidates);
      if (match.kind === "linked") {
        await admin.rpc("link_artist_provider", {
          p_artist_id: artist.artist_id,
          p_provider: provider.provider,
          p_external_id: match.attraction.id,
          p_external_url: match.attraction.url ?? "",
          p_method: match.method,
          p_confidence: match.confidence,
        });
        stats.linked++;
        if (match.method === "exact_name") stats.nameOnly++;
      } else {
        // Record the lookup so we back off (14 days) before trying again.
        await admin.from("artists").update({ provider_lookup_at: new Date().toISOString() }).eq("id", artist.artist_id);
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

  const stats = {
    pending: artists?.length ?? 0,
    artists: 0,
    events: 0,
    created: 0,
    changed: 0,
    scheduled: 0,
    cancelled: 0,
    errors: 0,
    lastError: undefined as string | undefined,
  };
  for (const artist of artists ?? []) {
    if (Date.now() > budget.deadline) break;
    try {
      const events = await provider.eventsForAttraction(artist.external_artist_id);
      for (const event of events) {
        const { data: result, error: ingestError } = await admin.rpc("ingest_provider_event", { p: event });
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
          p_is_new: r.created,
          p_changes: r.changes as never,
        });
        stats.scheduled += Number((sched as { scheduled?: number } | null)?.scheduled ?? 0);
        stats.cancelled += Number((sched as { cancelled?: number } | null)?.cancelled ?? 0);
      }
      await admin.rpc("mark_artist_events_refreshed", { p_artist_id: artist.artist_id });
      stats.artists++;
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
