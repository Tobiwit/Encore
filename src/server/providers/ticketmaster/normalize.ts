import { createHash } from "node:crypto";
import { slugify } from "@/lib/text";
import type {
  LifecycleStatus,
  NormalizedEvent,
  NormalizedOffer,
  NormalizedSale,
  NormalizedVenue,
  ProviderAttraction,
} from "../types";

/**
 * Subset of the Ticketmaster Discovery API v2 event shape that we rely on.
 * https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/
 * Every field is optional: the API omits fields freely, and we must never invent values.
 */
export type TmImage = { url?: string; ratio?: string; width?: number; height?: number; fallback?: boolean };

export type TmEvent = {
  id: string;
  name?: string;
  url?: string;
  images?: TmImage[];
  dates?: {
    start?: {
      localDate?: string;
      localTime?: string;
      dateTime?: string;
      dateTBD?: boolean;
      dateTBA?: boolean;
      timeTBA?: boolean;
      noSpecificTime?: boolean;
    };
    end?: { dateTime?: string };
    timezone?: string;
    status?: { code?: string };
  };
  sales?: {
    public?: { startDateTime?: string; endDateTime?: string; startTBD?: boolean; startTBA?: boolean };
    presales?: { name?: string; description?: string; startDateTime?: string; endDateTime?: string }[];
  };
  priceRanges?: { type?: string; currency?: string; min?: number; max?: number }[];
  _embedded?: {
    venues?: {
      id: string;
      name?: string;
      postalCode?: string;
      timezone?: string;
      city?: { name?: string };
      country?: { countryCode?: string };
      address?: { line1?: string };
      location?: { latitude?: string; longitude?: string };
    }[];
    attractions?: { id: string; name?: string }[];
  };
};

export type TmAttraction = {
  id: string;
  name?: string;
  url?: string;
  externalLinks?: Record<string, { url?: string }[] | undefined>;
};

const VARIANT_PATTERN = /\b(vip|package|paket|upgrade|platinum|hospitality|meet\s*&?\s*greet)\b/i;

/** Ticketmaster uses placeholder timestamps (e.g. 1900-01-01) for unknown sale starts. */
function validTimestamp(value: string | undefined): string | null {
  if (!value) return null;
  const t = Date.parse(value);
  if (Number.isNaN(t)) return null;
  if (new Date(t).getUTCFullYear() < 2000) return null;
  return new Date(t).toISOString();
}

export function mapStatus(code: string | undefined, startsAt: string | null, now: Date): LifecycleStatus {
  const c = (code ?? "").toLowerCase();
  if (c === "cancelled" || c === "canceled") return "cancelled";
  if (c === "postponed") return "postponed";
  if (c === "rescheduled") return "rescheduled";
  if (startsAt && Date.parse(startsAt) < now.getTime() - 24 * 3600 * 1000) return "ended";
  if (c === "offsale") return "offsale";
  if (c === "onsale") return "on_sale";
  if (!c) return "unknown";
  return "announced";
}

function pickImage(images: TmImage[] | undefined): string | null {
  if (!images?.length) return null;
  const usable = images.filter((i) => i.url && !i.fallback);
  const pool = usable.length ? usable : images.filter((i) => i.url);
  const wide = pool.filter((i) => i.ratio === "16_9");
  const sorted = (wide.length ? wide : pool).sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
  return sorted[0]?.url ?? null;
}

function parseCoordinate(value: string | undefined, limit: number): number | null {
  if (value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) && Math.abs(n) <= limit && n !== 0 ? n : null;
}

function normalizeVenue(event: TmEvent): NormalizedVenue | null {
  const v = event._embedded?.venues?.[0];
  if (!v?.id || !v.name) return null;
  return {
    external_venue_id: v.id,
    name: v.name,
    address: v.address?.line1 ?? null,
    postal_code: v.postalCode ?? null,
    city: v.city?.name ?? null,
    country_code: v.country?.countryCode?.toUpperCase() ?? null,
    latitude: parseCoordinate(v.location?.latitude, 90),
    longitude: parseCoordinate(v.location?.longitude, 180),
    timezone: v.timezone ?? null,
  };
}

function normalizeSales(event: TmEvent): NormalizedSale[] {
  const sales: NormalizedSale[] = [];
  const pub = event.sales?.public;
  if (pub) {
    const startsAt = pub.startTBD || pub.startTBA ? null : validTimestamp(pub.startDateTime);
    sales.push({
      sale_key: "public",
      sale_type: "general",
      sale_name: "General sale",
      starts_at: startsAt,
      ends_at: validTimestamp(pub.endDateTime),
      start_time_unknown: startsAt === null,
    });
  }

  const seen = new Map<string, number>();
  for (const presale of event.sales?.presales ?? []) {
    const name = presale.name?.trim() || "Presale";
    const base = `presale:${slugify(name)}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    const startsAt = validTimestamp(presale.startDateTime);
    sales.push({
      sale_key: n === 1 ? base : `${base}:${n}`,
      sale_type: "presale",
      sale_name: name,
      starts_at: startsAt,
      ends_at: validTimestamp(presale.endDateTime),
      start_time_unknown: startsAt === null,
    });
  }
  return sales;
}

function normalizeOffers(event: TmEvent, isVariant: boolean): NormalizedOffer[] {
  const offers: NormalizedOffer[] = [];
  const keys = new Set<string>();
  for (const range of event.priceRanges ?? []) {
    const currency = range.currency?.toUpperCase();
    if (!currency || !/^[A-Z]{3}$/.test(currency)) continue;
    const min = typeof range.min === "number" && range.min >= 0 ? range.min : null;
    const max = typeof range.max === "number" && range.max >= 0 ? range.max : null;
    if (min === null && max === null) continue;
    const key = `${slugify(range.type ?? "standard")}:${currency}`;
    if (keys.has(key)) continue;
    keys.add(key);
    offers.push({
      offer_key: key,
      offer_type: isVariant ? (/vip/i.test(event.name ?? "") ? "vip" : "package") : "standard",
      min_price: min ?? max,
      max_price: max ?? min,
      currency,
      destination_url: event.url ?? null,
      is_resale: false,
    });
  }
  return offers;
}

export function normalizeTicketmasterEvent(event: TmEvent, now = new Date()): NormalizedEvent | null {
  if (!event.id || !event.name) return null;

  const start = event.dates?.start;
  const dateUnknown = Boolean(start?.dateTBD || start?.dateTBA);
  const timeUnknown = Boolean(start?.timeTBA || start?.noSpecificTime || !start?.dateTime);
  const startsAt = dateUnknown ? null : validTimestamp(start?.dateTime);
  const startDateLocal = !dateUnknown && start?.localDate && /^\d{4}-\d{2}-\d{2}$/.test(start.localDate) ? start.localDate : null;
  const isVariant = VARIANT_PATTERN.test(event.name);

  return {
    provider: "ticketmaster",
    external_event_id: event.id,
    title: event.name.trim(),
    source_status: event.dates?.status?.code ?? null,
    lifecycle_status: mapStatus(event.dates?.status?.code, startsAt, now),
    source_url: event.url ?? null,
    raw_payload_hash: createHash("sha256").update(JSON.stringify(event)).digest("hex"),
    is_variant_hint: isVariant,
    starts_at: startsAt,
    start_date_local: startDateLocal,
    start_time_tba: startsAt === null ? true : timeUnknown,
    ends_at: validTimestamp(event.dates?.end?.dateTime),
    timezone: event.dates?.timezone ?? event._embedded?.venues?.[0]?.timezone ?? null,
    image_url: pickImage(event.images),
    venue: normalizeVenue(event),
    attraction_ids: (event._embedded?.attractions ?? []).map((a) => a.id).filter(Boolean),
    sales: normalizeSales(event),
    offers: normalizeOffers(event, isVariant),
  };
}

export function normalizeTicketmasterAttraction(a: TmAttraction): ProviderAttraction | null {
  if (!a.id || !a.name) return null;
  return {
    id: a.id,
    name: a.name,
    url: a.url ?? null,
    spotifyUrls: (a.externalLinks?.spotify ?? []).map((l) => l.url).filter((u): u is string => Boolean(u)),
  };
}
