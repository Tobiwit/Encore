/**
 * LOCAL DEVELOPMENT ONLY: `pnpm dev:fixtures [--session-out <file>]`
 *
 * Creates two test accounts and pushes Ticketmaster-shaped payloads through the real pipeline
 * (normalizeTicketmasterEvent → ingest_provider_event → schedule_event_notifications → delivery),
 * so every screen can be exercised without Spotify/Ticketmaster credentials. Refuses to run
 * against anything but a local Supabase. Nothing here is imported by the application.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { config } from "dotenv";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) {
  console.error(`Refusing to load fixtures into ${url || "(unset)"}: local Supabase only.`);
  process.exit(1);
}

const { createClient } = await import("@supabase/supabase-js");
const { normalizeTicketmasterEvent } = await import("@/server/providers/ticketmaster/normalize");
const { deliverDueNotifications } = await import("@/server/notifications/deliver");

const admin = createClient(url, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });

const DAY = 24 * 3600_000;
const at = (ms: number) => new Date(Date.now() + ms).toISOString().replace(/\.\d{3}Z$/, "Z");
const hourAligned = (ms: number) => {
  const d = new Date(Date.now() + ms);
  d.setUTCMinutes(0, 0, 0);
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
};

async function ensureUser(email: string, name: string) {
  const password = randomBytes(18).toString("base64url");
  const { data: list } = await admin.auth.admin.listUsers();
  const existing = list.users.find((u) => u.email === email);
  if (existing) {
    await admin.auth.admin.updateUserById(existing.id, { password });
    return { id: existing.id, password };
  }
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: name } });
  if (error) throw error;
  return { id: data.user.id, password };
}

const ARTISTS = [
  { sp: "0aaaaaaaaaaaaaaaaaaaa1", tm: "KdevA1", name: "Neon Harbour", genres: ["indie pop", "synthpop"] },
  { sp: "0aaaaaaaaaaaaaaaaaaaa2", tm: "KdevA2", name: "Die Morgenröte", genres: ["post-punk", "german indie"] },
  { sp: "0aaaaaaaaaaaaaaaaaaaa3", tm: "KdevA3", name: "Lumen Field", genres: ["ambient", "electronica"] },
  { sp: "0aaaaaaaaaaaaaaaaaaaa4", tm: "KdevA4", name: "Velvet Static", genres: ["shoegaze", "dream pop"] },
  { sp: "0aaaaaaaaaaaaaaaaaaaa5", tm: null, name: "Quiet Orbit", genres: ["folk"] },
];

const VENUES = {
  berlin: { id: "KdevV1", name: "Columbiahalle", city: "Berlin", lat: "52.4838", lon: "13.3925", address: "Columbiadamm 13-21", postal: "10965" },
  hamburg: { id: "KdevV2", name: "Docks", city: "Hamburg", lat: "53.5497", lon: "9.9634", address: "Spielbudenplatz 19", postal: "20359" },
  leipzig: { id: "KdevV3", name: "Täubchenthal", city: "Leipzig", lat: "51.3226", lon: "12.3438", address: "Wachsmuthstraße 1", postal: "04229" },
};

function tmEvent(o: {
  id: string;
  name: string;
  artist: string;
  venue: (typeof VENUES)[keyof typeof VENUES];
  startsIn: number;
  publicSaleIn: number | null;
  presale?: { name: string; in: number };
  status?: string;
  price?: [number, number];
}) {
  return {
    id: o.id,
    name: o.name,
    url: `https://www.ticketmaster.de/event/${o.id}`,
    dates: {
      start: { localDate: at(o.startsIn).slice(0, 10), dateTime: hourAligned(o.startsIn) },
      timezone: "Europe/Berlin",
      status: { code: o.status ?? "onsale" },
    },
    sales: {
      public: o.publicSaleIn === null ? { startTBD: true } : { startDateTime: hourAligned(o.publicSaleIn) },
      presales: o.presale ? [{ name: o.presale.name, startDateTime: hourAligned(o.presale.in), endDateTime: hourAligned(o.presale.in + DAY) }] : [],
    },
    priceRanges: o.price ? [{ type: "standard", currency: "EUR", min: o.price[0], max: o.price[1] }] : undefined,
    _embedded: {
      venues: [
        {
          id: o.venue.id,
          name: o.venue.name,
          postalCode: o.venue.postal,
          timezone: "Europe/Berlin",
          city: { name: o.venue.city },
          country: { countryCode: "DE" },
          address: { line1: o.venue.address },
          location: { latitude: o.venue.lat, longitude: o.venue.lon },
        },
      ],
      attractions: [{ id: o.artist }],
    },
  };
}

async function main() {
  const alex = await ensureUser("alex@encore.test", "Alex Dev");
  const sam = await ensureUser("sam@encore.test", "Sam Dev");

  const { data: cities } = await admin.from("cities").select("id, name").in("name", ["Berlin", "Hamburg"]);
  const berlin = cities!.find((c) => c.name === "Berlin")!.id;
  for (const u of [alex, sam]) {
    const { data: loc } = await admin.from("user_locations").upsert({ user_id: u.id, city_id: berlin, radius_km: 50 }, { onConflict: "user_id,city_id" }).select("id").single();
    await admin.from("users").update({ home_location_id: loc!.id, onboarding_completed_at: new Date().toISOString() }).eq("id", u.id);
  }

  const items = (ranges: string[]) =>
    ARTISTS.flatMap((a, i) => ranges.map((r) => ({ time_range: r, rank: i + 1, spotify_id: a.sp, name: a.name, image_url: null, genres: a.genres, external_url: `https://open.spotify.com/artist/${a.sp}` })));
  await admin.rpc("import_spotify_top_artists", { p_user_id: alex.id, p_batch_id: randomUUID(), p_items: items(["short_term", "long_term"]) });
  await admin.rpc("import_spotify_top_artists", { p_user_id: sam.id, p_batch_id: randomUUID(), p_items: items(["medium_term"]).slice(0, 3) });

  for (const a of ARTISTS.filter((x) => x.tm)) {
    const { data } = await admin.from("artist_provider_ids").select("artist_id").eq("provider", "spotify").eq("external_artist_id", a.sp).single();
    await admin.rpc("link_artist_provider", { p_artist_id: data!.artist_id, p_provider: "ticketmaster", p_external_id: a.tm!, p_external_url: "", p_method: "provider_link", p_confidence: 1 });
  }
  const { data: neon } = await admin.from("artist_provider_ids").select("artist_id").eq("external_artist_id", ARTISTS[0].sp).single();
  await admin.from("user_artists").update({ is_pinned: true, interest_level: "love" }).eq("user_id", alex.id).eq("artist_id", neon!.artist_id);

  const events = [
    tmEvent({ id: "DEV-E1", name: "Neon Harbour – Afterglow Tour", artist: "KdevA1", venue: VENUES.berlin, startsIn: 60 * DAY, publicSaleIn: 2 * DAY, presale: { name: "Fan Club Presale", in: 3 * 3600_000 }, price: [45.9, 79.5] }),
    tmEvent({ id: "DEV-E1-VIP", name: "Neon Harbour – Afterglow Tour – VIP Package", artist: "KdevA1", venue: VENUES.berlin, startsIn: 60 * DAY, publicSaleIn: 2 * DAY, price: [189, 189] }),
    tmEvent({ id: "DEV-E2", name: "Die Morgenröte", artist: "KdevA2", venue: VENUES.berlin, startsIn: 21 * DAY, publicSaleIn: -10 * DAY, price: [32, 32] }),
    tmEvent({ id: "DEV-E3", name: "Lumen Field live", artist: "KdevA3", venue: VENUES.leipzig, startsIn: 95 * DAY, publicSaleIn: null }),
    tmEvent({ id: "DEV-E4", name: "Velvet Static", artist: "KdevA4", venue: VENUES.berlin, startsIn: 40 * DAY, publicSaleIn: 9 * DAY, status: "postponed" }),
    tmEvent({ id: "DEV-E5", name: "Neon Harbour – Hamburg", artist: "KdevA1", venue: VENUES.hamburg, startsIn: 75 * DAY, publicSaleIn: 6 * DAY }),
  ];

  const ids: Record<string, string> = {};
  for (const raw of events) {
    const normalized = normalizeTicketmasterEvent(raw as never)!;
    const { data: r, error } = await admin.rpc("ingest_provider_event", { p: normalized as never });
    if (error) throw error;
    const res = r as { event_id: string; created: boolean; changes: unknown[] };
    ids[raw.id] = res.event_id;
    await admin.rpc("schedule_event_notifications", { p_event_id: res.event_id, p_is_new: res.created, p_changes: res.changes as never });
  }

  // Friendship and shared plans (sam → alex), going through the same RPCs the app uses.
  const samClient = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  await samClient.auth.signInWithPassword({ email: "sam@encore.test", password: sam.password });
  await samClient.rpc("send_friend_request", { p_recipient: alex.id });
  const alexClient = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  const { data: alexSession } = await alexClient.auth.signInWithPassword({ email: "alex@encore.test", password: alex.password });
  const { data: reqs } = await alexClient.rpc("get_friend_requests");
  const incoming = (reqs as { incoming: boolean; friendship_id: string }[] | null)?.find((r) => r.incoming);
  if (incoming) await alexClient.rpc("respond_friend_request", { p_friendship_id: incoming.friendship_id, p_accept: true });
  await samClient.from("event_interests").upsert({ user_id: sam.id, event_id: ids["DEV-E2"], intention: "looking_for_company", visibility: "friends" }, { onConflict: "user_id,event_id" });
  await samClient.from("event_interests").upsert({ user_id: sam.id, event_id: ids["DEV-E1"], intention: "going", visibility: "friends" }, { onConflict: "user_id,event_id" });
  await alexClient.from("saved_events").upsert({ user_id: alex.id, event_id: ids["DEV-E1"] }, { onConflict: "user_id,event_id" });

  // Deliver whatever is due now (new-event alerts, friend activity after its debounce).
  await admin.from("notification_jobs").update({ scheduled_at: new Date().toISOString() }).in("notification_type", ["friend_interest", "friend_request"]).eq("status", "pending");
  const stats = await deliverDueNotifications(admin as never);

  const outIndex = process.argv.indexOf("--session-out");
  if (outIndex > 0 && alexSession.session) {
    writeFileSync(process.argv[outIndex + 1], JSON.stringify(alexSession.session));
  }
  console.log(JSON.stringify({ users: ["alex@encore.test", "sam@encore.test"], events: Object.keys(ids).length, delivery: stats }));
  void anon;
}

await main();
