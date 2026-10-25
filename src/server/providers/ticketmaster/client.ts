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
      const now = new Date();
      const results: NormalizedEvent[] = [];
      const seen = new Set<string>();
      for (const countryCode of config.countries) {
        // Pagination is capped deliberately: one artist rarely has >200 shows per country.
        for (let page = 0; page < 2; page++) {
          const data = await get<{ _embedded?: { events?: TmEvent[] }; page?: { totalPages?: number } }>("/events.json", {
            attractionId,
            countryCode,
            size: "100",
            page: String(page),
            sort: "date,asc",
            locale: "*",
          });
          for (const raw of data._embedded?.events ?? []) {
            if (seen.has(raw.id)) continue;
            seen.add(raw.id);
            const normalized = normalizeTicketmasterEvent(raw, now);
            if (normalized) results.push(normalized);
          }
          if ((data.page?.totalPages ?? 1) <= page + 1) break;
        }
      }
      return results;
    },
  };
}
