/**
 * Provider adapter contract. Each ticket provider (Ticketmaster today, EVENTIM later) maps its
 * records into these shapes; persistence and deduplication happen in public.ingest_provider_event.
 */

export type LifecycleStatus =
  | "announced"
  | "on_sale"
  | "offsale"
  | "postponed"
  | "rescheduled"
  | "cancelled"
  | "ended"
  | "unknown";

export type NormalizedVenue = {
  external_venue_id: string;
  name: string;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  country_code: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
};

export type NormalizedSale = {
  sale_key: string;
  sale_type: "presale" | "general" | "other";
  sale_name: string | null;
  starts_at: string | null;
  ends_at: string | null;
  start_time_unknown: boolean;
};

export type NormalizedOffer = {
  offer_key: string;
  offer_type: "standard" | "vip" | "package" | "platinum" | "resale" | "other";
  min_price: number | null;
  max_price: number | null;
  currency: string | null;
  destination_url: string | null;
  is_resale: boolean;
};

export type NormalizedEvent = {
  provider: string;
  external_event_id: string;
  title: string;
  source_status: string | null;
  lifecycle_status: LifecycleStatus;
  source_url: string | null;
  raw_payload_hash: string;
  is_variant_hint: boolean;
  starts_at: string | null;
  start_date_local: string | null;
  start_time_tba: boolean;
  ends_at: string | null;
  timezone: string | null;
  image_url: string | null;
  venue: NormalizedVenue | null;
  attraction_ids: string[];
  sales: NormalizedSale[];
  offers: NormalizedOffer[];
};

export type ProviderAttraction = {
  id: string;
  name: string;
  url: string | null;
  spotifyUrls: string[];
};

export type ArtistMatch =
  | { kind: "linked"; attraction: ProviderAttraction; method: "provider_link" | "exact_name"; confidence: number }
  | { kind: "none"; reason: "no_candidates" | "ambiguous" | "no_exact_match" };

export interface TicketProviderAdapter {
  readonly provider: string;
  searchAttractions(name: string): Promise<ProviderAttraction[]>;
  eventsForAttraction(attractionId: string): Promise<NormalizedEvent[]>;
}
