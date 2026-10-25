import { describe, expect, it } from "vitest";
import { normalizeTicketmasterAttraction, normalizeTicketmasterEvent, type TmEvent } from "@/server/providers/ticketmaster/normalize";

const NOW = new Date("2026-10-25T10:00:00Z");

const base: TmEvent = {
  id: "G5vYZ9abc",
  name: "Band One – European Tour 2027",
  url: "https://www.ticketmaster.de/event/G5vYZ9abc",
  images: [
    { url: "https://s1.ticketm.net/small.jpg", ratio: "4_3", width: 305 },
    { url: "https://s1.ticketm.net/wide-large.jpg", ratio: "16_9", width: 2048 },
    { url: "https://s1.ticketm.net/wide-small.jpg", ratio: "16_9", width: 640 },
  ],
  dates: {
    start: { localDate: "2027-03-14", localTime: "20:00:00", dateTime: "2027-03-14T19:00:00Z" },
    timezone: "Europe/Berlin",
    status: { code: "onsale" },
  },
  sales: {
    public: { startDateTime: "2026-11-01T09:00:00Z", endDateTime: "2027-03-14T18:00:00Z" },
    presales: [
      { name: "Artist Presale", startDateTime: "2026-10-29T09:00:00Z", endDateTime: "2026-10-31T21:00:00Z" },
      { name: "Artist Presale", startDateTime: "2026-10-30T09:00:00Z" },
    ],
  },
  priceRanges: [{ type: "standard", currency: "eur", min: 49.5, max: 89 }],
  _embedded: {
    venues: [
      {
        id: "KovZ9177",
        name: "Uber Arena",
        postalCode: "10243",
        timezone: "Europe/Berlin",
        city: { name: "Berlin" },
        country: { countryCode: "DE" },
        address: { line1: "Uber-Platz 1" },
        location: { latitude: "52.5053", longitude: "13.4436" },
      },
    ],
    attractions: [{ id: "K8vZ917abc", name: "Band One" }],
  },
};

describe("normalizeTicketmasterEvent", () => {
  it("maps the core fields without inventing data", () => {
    const e = normalizeTicketmasterEvent(base, NOW)!;
    expect(e.external_event_id).toBe("G5vYZ9abc");
    expect(e.starts_at).toBe("2027-03-14T19:00:00.000Z");
    expect(e.start_date_local).toBe("2027-03-14");
    expect(e.start_time_tba).toBe(false);
    expect(e.timezone).toBe("Europe/Berlin");
    expect(e.lifecycle_status).toBe("on_sale");
    expect(e.image_url).toBe("https://s1.ticketm.net/wide-large.jpg");
    expect(e.venue).toMatchObject({ external_venue_id: "KovZ9177", city: "Berlin", country_code: "DE", latitude: 52.5053, longitude: 13.4436 });
    expect(e.attraction_ids).toEqual(["K8vZ917abc"]);
    expect(e.is_variant_hint).toBe(false);
  });

  it("creates distinct, stable sale keys including repeated presale names", () => {
    const e = normalizeTicketmasterEvent(base, NOW)!;
    expect(e.sales.map((s) => s.sale_key)).toEqual(["public", "presale:artist-presale", "presale:artist-presale:2"]);
    expect(e.sales[0]).toMatchObject({ sale_type: "general", starts_at: "2026-11-01T09:00:00.000Z", start_time_unknown: false });
  });

  it("treats placeholder and TBD sale starts as unknown", () => {
    const e = normalizeTicketmasterEvent(
      { ...base, sales: { public: { startDateTime: "1900-01-01T18:00:00Z", startTBD: false }, presales: [{ name: "Fan presale", startDateTime: undefined }] } },
      NOW,
    )!;
    expect(e.sales[0]).toMatchObject({ starts_at: null, start_time_unknown: true });
    expect(e.sales[1]).toMatchObject({ starts_at: null, start_time_unknown: true });

    const tbd = normalizeTicketmasterEvent({ ...base, sales: { public: { startDateTime: "2026-11-01T09:00:00Z", startTBD: true } } }, NOW)!;
    expect(tbd.sales[0].start_time_unknown).toBe(true);
  });

  it("omits prices that the provider did not supply and normalises currency", () => {
    expect(normalizeTicketmasterEvent({ ...base, priceRanges: undefined }, NOW)!.offers).toEqual([]);
    expect(normalizeTicketmasterEvent({ ...base, priceRanges: [{ type: "standard", currency: "EUR" }] }, NOW)!.offers).toEqual([]);
    const [offer] = normalizeTicketmasterEvent(base, NOW)!.offers;
    expect(offer).toMatchObject({ currency: "EUR", min_price: 49.5, max_price: 89, offer_type: "standard", is_resale: false });
  });

  it("flags VIP/package listings as variants rather than separate concerts", () => {
    const e = normalizeTicketmasterEvent({ ...base, id: "VIP1", name: "Band One - VIP Package" }, NOW)!;
    expect(e.is_variant_hint).toBe(true);
    expect(e.offers[0].offer_type).toBe("vip");
  });

  it("maps lifecycle statuses, including both cancel spellings", () => {
    const status = (code: string) => normalizeTicketmasterEvent({ ...base, dates: { ...base.dates, status: { code } } }, NOW)!.lifecycle_status;
    expect(status("canceled")).toBe("cancelled");
    expect(status("cancelled")).toBe("cancelled");
    expect(status("postponed")).toBe("postponed");
    expect(status("rescheduled")).toBe("rescheduled");
    expect(status("offsale")).toBe("offsale");
  });

  it("handles unknown dates and times explicitly", () => {
    const tba = normalizeTicketmasterEvent({ ...base, dates: { start: { localDate: "2027-05-01", timeTBA: true }, timezone: "Europe/Berlin" } }, NOW)!;
    expect(tba.starts_at).toBeNull();
    expect(tba.start_time_tba).toBe(true);
    expect(tba.start_date_local).toBe("2027-05-01");

    const dateTbd = normalizeTicketmasterEvent({ ...base, dates: { start: { dateTBD: true } } }, NOW)!;
    expect(dateTbd.starts_at).toBeNull();
    expect(dateTbd.start_date_local).toBeNull();
    expect(dateTbd.lifecycle_status).toBe("unknown");
  });

  it("rejects invalid coordinates and missing venues", () => {
    const e = normalizeTicketmasterEvent(
      { ...base, _embedded: { ...base._embedded, venues: [{ ...base._embedded!.venues![0], location: { latitude: "0", longitude: "abc" } }] } },
      NOW,
    )!;
    expect(e.venue?.latitude).toBeNull();
    expect(e.venue?.longitude).toBeNull();
    expect(normalizeTicketmasterEvent({ ...base, _embedded: { attractions: [] } }, NOW)!.venue).toBeNull();
  });

  it("produces a stable payload hash", () => {
    expect(normalizeTicketmasterEvent(base, NOW)!.raw_payload_hash).toBe(normalizeTicketmasterEvent(structuredClone(base), NOW)!.raw_payload_hash);
  });

  it("marks long-past events as ended", () => {
    const old = normalizeTicketmasterEvent({ ...base, dates: { ...base.dates, start: { dateTime: "2026-01-01T19:00:00Z" } } }, NOW)!;
    expect(old.lifecycle_status).toBe("ended");
  });
});

describe("normalizeTicketmasterAttraction", () => {
  it("extracts Spotify links", () => {
    expect(
      normalizeTicketmasterAttraction({
        id: "K1",
        name: "Band One",
        externalLinks: { spotify: [{ url: "https://open.spotify.com/artist/4Z8W4fKeB5YxbusRsdQVPb" }], youtube: [{ url: "x" }] },
      }),
    ).toEqual({ id: "K1", name: "Band One", url: null, spotifyUrls: ["https://open.spotify.com/artist/4Z8W4fKeB5YxbusRsdQVPb"] });
  });
});
