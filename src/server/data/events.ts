import "server-only";
import type { Lifecycle, SalePhase } from "@/lib/events";
import { haversineKm } from "@/lib/format";
import { rankEvents, type InterestLevel, type Ranked } from "@/lib/ranking";
import type { createClient } from "@/lib/supabase/server";
import type { EventSummary, FriendFace, PriceSummary } from "@/lib/types";

type Client = Awaited<ReturnType<typeof createClient>>;

export const EVENT_SELECT = `
  id, canonical_title, starts_at, start_date_local, start_time_tba, timezone, lifecycle_status, image_url,
  last_verified_at, created_at, event_url,
  venue:venues(name, city, country_code, latitude, longitude, address, postal_code),
  event_sales(id, sale_type, sale_name, starts_at, ends_at, start_time_unknown, record:event_provider_records(is_primary)),
  ticket_offers(min_price, max_price, currency, offer_type, is_resale, destination_url, provider),
  event_artists(artist_id, match_confidence, artist:artists(id, canonical_name, image_url))
` as const;

type RawEvent = {
  id: string;
  canonical_title: string;
  starts_at: string | null;
  start_date_local: string | null;
  start_time_tba: boolean;
  timezone: string | null;
  lifecycle_status: string;
  image_url: string | null;
  last_verified_at: string;
  created_at: string;
  event_url: string | null;
  venue: { name: string; city: string | null; country_code: string | null; latitude: number | null; longitude: number | null; address: string | null; postal_code: string | null } | null;
  event_sales: { id: string; sale_type: SalePhase["sale_type"]; sale_name: string | null; starts_at: string | null; ends_at: string | null; start_time_unknown: boolean; record: { is_primary: boolean } | null }[];
  ticket_offers: { min_price: number | null; max_price: number | null; currency: string | null; offer_type: string; is_resale: boolean; destination_url: string | null; provider: string }[];
  event_artists: { artist_id: string; match_confidence: number; artist: { id: string; canonical_name: string; image_url: string | null } | null }[];
};

export type UserLocation = { id: string; cityName: string; lat: number; lon: number; radiusKm: number; isHome: boolean };

export async function getUserLocations(supabase: Client, userId: string): Promise<UserLocation[]> {
  const [{ data: rows }, { data: profile }] = await Promise.all([
    supabase.from("user_locations").select("id, radius_km, city:cities(name, latitude, longitude)").eq("user_id", userId).order("created_at"),
    supabase.from("users").select("home_location_id").eq("id", userId).single(),
  ]);
  return (rows ?? [])
    .filter((r) => r.city)
    .map((r) => ({
      id: r.id,
      cityName: r.city!.name,
      lat: r.city!.latitude,
      lon: r.city!.longitude,
      radiusKm: r.radius_km,
      isHome: r.id === profile?.home_location_id,
    }))
    .sort((a, b) => Number(b.isHome) - Number(a.isHome));
}

function primaryPrice(offers: RawEvent["ticket_offers"]): PriceSummary | null {
  const priced = offers.filter((o) => o.currency && (o.min_price !== null || o.max_price !== null));
  // Prefer official standard tickets; resale and packages are shown separately on the detail page.
  const pick = priced.find((o) => !o.is_resale && o.offer_type === "standard") ?? priced.find((o) => !o.is_resale) ?? null;
  return pick ? { min: pick.min_price, max: pick.max_price, currency: pick.currency!, offerType: pick.offer_type, isResale: pick.is_resale } : null;
}

export function nearest(locations: UserLocation[], venue: RawEvent["venue"]) {
  if (!venue?.latitude || !venue?.longitude || !locations.length) return null;
  let best: { km: number; radiusKm: number } | null = null;
  for (const l of locations) {
    const km = haversineKm({ lat: l.lat, lon: l.lon }, { lat: venue.latitude, lon: venue.longitude });
    if (!best || km - l.radiusKm < best.km - best.radiusKm) best = { km, radiusKm: l.radiusKm };
  }
  return best;
}

export function toSummary(
  e: RawEvent,
  ctx: {
    locations: UserLocation[];
    interests: Map<string, { interest: InterestLevel; pinned: boolean }>;
    saved: Set<string>;
    friends: Map<string, FriendFace[]>;
  },
): EventSummary {
  const near = nearest(ctx.locations, e.venue);
  return {
    id: e.id,
    title: e.canonical_title,
    startsAt: e.starts_at,
    startDateLocal: e.start_date_local,
    startTimeTba: e.start_time_tba,
    timezone: e.timezone,
    lifecycle: e.lifecycle_status as Lifecycle,
    imageUrl: e.image_url,
    venueName: e.venue?.name ?? null,
    city: e.venue?.city ?? null,
    distanceKm: near?.km ?? null,
    lastVerifiedAt: e.last_verified_at,
    createdAt: e.created_at,
    sales: e.event_sales.map((s) => ({
      id: s.id,
      sale_type: s.sale_type,
      sale_name: s.sale_name,
      starts_at: s.starts_at,
      ends_at: s.ends_at,
      start_time_unknown: s.start_time_unknown,
      is_primary: s.record?.is_primary ?? true,
    })),
    price: primaryPrice(e.ticket_offers),
    artists: e.event_artists
      .filter((ea) => ea.artist)
      .map((ea) => ({
        id: ea.artist!.id,
        name: ea.artist!.canonical_name,
        imageUrl: ea.artist!.image_url,
        interest: ctx.interests.get(ea.artist_id)?.interest ?? null,
        pinned: ctx.interests.get(ea.artist_id)?.pinned ?? false,
        matchConfidence: Number(ea.match_confidence),
      })),
    friends: ctx.friends.get(e.id) ?? [],
    saved: ctx.saved.has(e.id),
  };
}

/** Friends' visible intentions for a set of events (RLS limits rows to accepted, unblocked friends). */
export async function friendInterestsFor(supabase: Client, userId: string, eventIds: string[]): Promise<Map<string, FriendFace[]>> {
  const map = new Map<string, FriendFace[]>();
  if (!eventIds.length) return map;
  const { data: rows } = await supabase
    .from("event_interests")
    .select("user_id, event_id, intention")
    .in("event_id", eventIds)
    .neq("user_id", userId)
    .eq("visibility", "friends");
  if (!rows?.length) return map;
  const { data: profiles } = await supabase.rpc("get_profiles", { p_ids: [...new Set(rows.map((r) => r.user_id))] });
  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
  for (const r of rows) {
    const p = byId.get(r.user_id);
    if (!p) continue;
    const list = map.get(r.event_id) ?? [];
    list.push({ id: p.id, name: p.display_name, avatarUrl: p.avatar_url, intention: r.intention });
    map.set(r.event_id, list);
  }
  return map;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export type DiscoverFeed = {
  locations: UserLocation[];
  followedCount: number;
  saleSoon: EventSummary[];
  newlyAnnounced: EventSummary[];
  upcoming: EventSummary[];
  inactive: EventSummary[];
  lastEventRefresh: string | null;
};

export async function getDiscoverFeed(supabase: Client, userId: string): Promise<DiscoverFeed> {
  const now = new Date();
  const [{ data: follows }, locations, { data: savedRows }, { data: dismissedRows }] = await Promise.all([
    supabase.from("user_artists").select("artist_id, interest_level, is_pinned").eq("user_id", userId).eq("is_dismissed", false),
    getUserLocations(supabase, userId),
    supabase.from("saved_events").select("event_id").eq("user_id", userId),
    supabase.from("event_dismissals").select("event_id").eq("user_id", userId),
  ]);

  const interests = new Map((follows ?? []).map((f) => [f.artist_id, { interest: f.interest_level as InterestLevel, pinned: f.is_pinned }]));
  const empty: DiscoverFeed = { locations, followedCount: interests.size, saleSoon: [], newlyAnnounced: [], upcoming: [], inactive: [], lastEventRefresh: null };
  if (!interests.size) return empty;

  // Candidate events: linked to followed artists (verified or name-matched), not long past.
  const since = new Date(now.getTime() - 12 * 3600_000).toISOString();
  const eventIds = new Set<string>();
  for (const ids of chunk([...interests.keys()], 100)) {
    const { data } = await supabase
      .from("event_artists")
      .select("event_id, event:events!inner(starts_at)")
      .in("artist_id", ids)
      .gte("match_confidence", 0.7)
      .or(`starts_at.gte.${since},starts_at.is.null`, { referencedTable: "event" });
    for (const row of data ?? []) eventIds.add(row.event_id);
  }
  if (!eventIds.size) return empty;

  const raw: RawEvent[] = [];
  for (const ids of chunk([...eventIds], 100)) {
    const { data, error } = await supabase.from("events").select(EVENT_SELECT).in("id", ids);
    if (error) throw new Error(`Could not load events: ${error.message}`);
    raw.push(...((data ?? []) as unknown as RawEvent[]));
  }

  // Location filter: inside any followed city's radius. Without locations, show everything.
  const inArea = locations.length
    ? raw.filter((e) => {
        const n = nearest(locations, e.venue);
        return n !== null && n.km <= n.radiusKm;
      })
    : raw;

  const saved = new Set((savedRows ?? []).map((r) => r.event_id));
  const dismissed = new Set((dismissedRows ?? []).map((r) => r.event_id));
  const friends = await friendInterestsFor(supabase, userId, inArea.map((e) => e.id));
  const summaries = new Map(inArea.map((e) => [e.id, toSummary(e, { locations, interests, saved, friends })]));

  const ranked: Ranked[] = rankEvents(
    [...summaries.values()].map((s) => ({
      eventId: s.id,
      lifecycle: s.lifecycle,
      startsAt: s.startsAt,
      createdAt: s.createdAt,
      lastVerifiedAt: s.lastVerifiedAt,
      sales: s.sales,
      artists: s.artists.filter((a) => a.interest).map((a) => ({ interest: a.interest!, pinned: a.pinned, matchConfidence: a.matchConfidence })),
      distanceKm: s.distanceKm,
      radiusKm: nearest(locations, raw.find((r) => r.id === s.id)!.venue)?.radiusKm ?? null,
      friendCount: s.friends.length,
      saved: s.saved,
      dismissed: dismissed.has(s.id),
    })),
    now,
  );

  const feed: DiscoverFeed = { ...empty };
  for (const r of ranked) {
    const s = { ...summaries.get(r.eventId)!, reasons: r.reasons };
    if (r.section === "sale_soon") feed.saleSoon.push(s);
    else if (r.section === "new") feed.newlyAnnounced.push(s);
    else if (r.section === "inactive") feed.inactive.push(s);
    else feed.upcoming.push(s);
  }
  // Chronological within "upcoming" reads more naturally than score order.
  feed.upcoming.sort((a, b) => (a.startsAt ? Date.parse(a.startsAt) : Infinity) - (b.startsAt ? Date.parse(b.startsAt) : Infinity));
  feed.lastEventRefresh = raw.reduce<string | null>((max, e) => (!max || e.last_verified_at > max ? e.last_verified_at : max), null);
  return feed;
}

/** Load summaries for arbitrary event ids (saved list, friend activity, artist pages). */
export async function getEventSummaries(supabase: Client, userId: string, ids: string[]): Promise<EventSummary[]> {
  if (!ids.length) return [];
  const [{ data: follows }, locations, { data: savedRows }] = await Promise.all([
    supabase.from("user_artists").select("artist_id, interest_level, is_pinned").eq("user_id", userId).eq("is_dismissed", false),
    getUserLocations(supabase, userId),
    supabase.from("saved_events").select("event_id").eq("user_id", userId).in("event_id", ids),
  ]);
  const raw: RawEvent[] = [];
  for (const part of chunk(ids, 100)) {
    const { data } = await supabase.from("events").select(EVENT_SELECT).in("id", part);
    raw.push(...((data ?? []) as unknown as RawEvent[]));
  }
  const interests = new Map((follows ?? []).map((f) => [f.artist_id, { interest: f.interest_level as InterestLevel, pinned: f.is_pinned }]));
  const friends = await friendInterestsFor(supabase, userId, ids);
  const saved = new Set((savedRows ?? []).map((r) => r.event_id));
  const byId = new Map(raw.map((e) => [e.id, toSummary(e, { locations, interests, saved, friends })]));
  return ids.map((id) => byId.get(id)).filter((e): e is EventSummary => Boolean(e));
}

export type EventDetail = EventSummary & {
  eventUrl: string | null;
  address: string | null;
  offers: RawEvent["ticket_offers"];
  providers: { provider: string; source_url: string | null; last_synced_at: string; is_primary: boolean }[];
  changes: { field: string; old_value: string | null; new_value: string | null; detected_at: string }[];
  myIntention: { intention: "interested" | "going" | "looking_for_company"; visibility: "friends" | "private" } | null;
  defaultVisibility: "friends" | "private";
};

export async function getEventDetail(supabase: Client, userId: string, eventId: string): Promise<EventDetail | null> {
  const { data, error } = await supabase.from("events").select(EVENT_SELECT).eq("id", eventId).maybeSingle();
  if (error) throw new Error(`Could not load event: ${error.message}`);
  if (!data) return null;
  const e = data as unknown as RawEvent;

  const [summary, { data: providers }, { data: changes }, { data: mine }, { data: me }] = await Promise.all([
    getEventSummaries(supabase, userId, [eventId]).then((s) => s[0]),
    supabase.from("event_provider_records").select("provider, source_url, last_synced_at, is_primary").eq("event_id", eventId),
    supabase.from("event_changes").select("field, old_value, new_value, detected_at").eq("event_id", eventId).order("detected_at", { ascending: false }).limit(10),
    supabase.from("event_interests").select("intention, visibility").eq("event_id", eventId).eq("user_id", userId).maybeSingle(),
    supabase.from("users").select("default_intention_visibility").eq("id", userId).single(),
  ]);

  // Friends via the RPC so names/avatars only come back for permitted relationships.
  const { data: friendRows } = await supabase.rpc("get_event_friend_interests", { p_event_id: eventId });

  return {
    ...summary,
    friends: (friendRows ?? []).map((f) => ({ id: f.user_id, name: f.display_name, avatarUrl: f.avatar_url, intention: f.intention })),
    eventUrl: providers?.find((p) => p.is_primary)?.source_url ?? e.event_url,
    address: [e.venue?.address, e.venue?.postal_code, e.venue?.city].filter(Boolean).join(", ") || null,
    offers: e.ticket_offers,
    providers: providers ?? [],
    changes: changes ?? [],
    myIntention: mine ? { intention: mine.intention, visibility: mine.visibility } : null,
    defaultVisibility: me?.default_intention_visibility ?? "friends",
  };
}
