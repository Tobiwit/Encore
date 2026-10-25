import "server-only";
import { ticketmasterConfig } from "@/lib/env";
import type { AdminClient } from "@/lib/supabase/admin";
import { matchAttraction } from "@/server/providers/matching";
import { createTicketmasterAdapter } from "@/server/providers/ticketmaster/client";
import type { TicketProviderAdapter } from "@/server/providers/types";
import { ProviderError } from "@/server/http";

function adapter(): TicketProviderAdapter | null {
  const config = ticketmasterConfig();
  return config ? createTicketmasterAdapter(config) : null;
}

/** Links followed artists to provider attractions (Spotify link first, unique exact name as fallback). */
export async function matchArtistsToProvider(admin: AdminClient, limit = 40) {
  const provider = adapter();
  if (!provider) return { skipped: "TICKETMASTER_API_KEY not configured" };

  const { data: artists, error } = await admin.rpc("artists_needing_provider_lookup", { p_provider: provider.provider, p_limit: limit });
  if (error) throw new Error(error.message);

  const stats = { checked: 0, linked: 0, nameOnly: 0, unmatched: 0, errors: 0 };
  for (const artist of artists ?? []) {
    stats.checked++;
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
    } catch (error) {
      stats.errors++;
      if (error instanceof ProviderError && error.status === 429) break; // quota: stop this run
    }
  }
  return stats;
}

/** Fetches events for linked artists, ingests them atomically and (re)schedules notifications. */
export async function refreshArtistEvents(admin: AdminClient, limit = 25) {
  const provider = adapter();
  if (!provider) return { skipped: "TICKETMASTER_API_KEY not configured" };

  const { data: artists, error } = await admin.rpc("artists_due_for_event_refresh", { p_provider: provider.provider, p_limit: limit });
  if (error) throw new Error(error.message);

  const stats = { artists: 0, events: 0, created: 0, changed: 0, scheduled: 0, cancelled: 0, errors: 0 };
  for (const artist of artists ?? []) {
    try {
      const events = await provider.eventsForAttraction(artist.external_artist_id);
      for (const event of events) {
        const { data: result, error: ingestError } = await admin.rpc("ingest_provider_event", { p: event });
        if (ingestError) {
          stats.errors++;
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
      if (error instanceof ProviderError && error.status === 429) break;
    }
  }
  return stats;
}
