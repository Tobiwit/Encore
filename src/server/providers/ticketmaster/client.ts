import { createThrottle, fetchWithRetry, ProviderError } from "@/server/http";
import type { NormalizedEvent, ProviderAttraction, TicketProviderAdapter } from "../types";
import {
  normalizeTicketmasterAttraction,
  normalizeTicketmasterEvent,
  type TmAttraction,
  type TmEvent,
} from "./normalize";

const BASE = "https://app.ticketmaster.com/discovery/v2";
// Discovery API default quota is 5 requests/second; stay below it.
const throttle = createThrottle(4);

export function filterToCountries(events: TmEvent[], countries: string[], now: Date): NormalizedEvent[] {
  const allowed = new Set(countries);
  const seen = new Set<string>();
  const results: NormalizedEvent[] = [];
  for (const raw of events) {
    if (seen.has(raw.id)) continue;
    seen.add(raw.id);
    const normalized = normalizeTicketmasterEvent(raw, now);
    if (normalized?.venue?.country_code && allowed.has(normalized.venue.country_code)) results.push(normalized);
  }
  return results;
}

export function createTicketmasterAdapter(config: { apiKey: string; countries: string[] }): TicketProviderAdapter {
  async function get<T>(path: string, params: Record<string, string>): Promise<T> {
    await throttle();
    const url = new URL(`${BASE}${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.searchParams.set("apikey", config.apiKey);
    const res = await fetchWithRetry(url.toString(), { headers: { accept: "application/json" } }, { provider: "ticketmaster" });
    if (!res.ok) {
      throw new ProviderError(`Ticketmaster ${path} responded ${res.status}`, res.status, "ticketmaster", res.status === 429 || res.status >= 500);
    }
    return (await res.json()) as T;
  }

  return {
    provider: "ticketmaster",

    async searchAttractions(name: string): Promise<ProviderAttraction[]> {
      const data = await get<{ _embedded?: { attractions?: TmAttraction[] } }>("/attractions.json", {
        keyword: name,
        classificationName: "music",
        size: "20",
        locale: "*",
      });
      return (data._embedded?.attractions ?? [])
        .map(normalizeTicketmasterAttraction)
        .filter((a): a is ProviderAttraction => a !== null);
    },

    async eventsForAttraction(attractionId: string): Promise<NormalizedEvent[]> {
      // One request per artist across all markets (max page size 200), filtered to the
      // configured countries locally. One call instead of one per country keeps daily runs
      // inside the quota and the serverless time limit.
      const data = await get<{ _embedded?: { events?: TmEvent[] } }>("/events.json", {
        attractionId,
        size: "200",
        sort: "date,asc",
        locale: "*",
      });
      return filterToCountries(data._embedded?.events ?? [], config.countries, new Date());
    },
  };
}
