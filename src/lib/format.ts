/** Display formatting. Event and sale times always render in the event's own time zone. */

export const LOCALE = "en-GB";
export const DEFAULT_TZ = "Europe/Berlin";

function safeTz(tz: string | null | undefined) {
  if (!tz) return DEFAULT_TZ;
  try {
    new Intl.DateTimeFormat(LOCALE, { timeZone: tz });
    return tz;
  } catch {
    return DEFAULT_TZ;
  }
}

export function formatEventDate(
  startsAt: string | null,
  timezone: string | null,
  opts: { timeTba?: boolean; startDateLocal?: string | null; withYear?: boolean } = {},
): string {
  if (!startsAt) {
    if (opts.startDateLocal) {
      const d = new Date(`${opts.startDateLocal}T12:00:00Z`);
      return new Intl.DateTimeFormat(LOCALE, { weekday: "short", day: "numeric", month: "short", year: opts.withYear ? "numeric" : undefined, timeZone: "UTC" }).format(d) + " · time TBA";
    }
    return "Date to be announced";
  }
  const tz = safeTz(timezone);
  const date = new Intl.DateTimeFormat(LOCALE, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: opts.withYear ? "numeric" : undefined,
    timeZone: tz,
  }).format(new Date(startsAt));
  if (opts.timeTba) return `${date} · time TBA`;
  const time = new Intl.DateTimeFormat(LOCALE, { hour: "2-digit", minute: "2-digit", timeZone: tz }).format(new Date(startsAt));
  return `${date} · ${time}`;
}

export function formatDateTime(iso: string, timezone: string | null, withZone = true): string {
  const tz = safeTz(timezone);
  return new Intl.DateTimeFormat(LOCALE, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: tz,
    timeZoneName: withZone ? "short" : undefined,
  }).format(new Date(iso));
}

export function formatPriceRange(min: number | null, max: number | null, currency: string | null): string | null {
  if (!currency || (min === null && max === null)) return null;
  // Whole amounts without decimals (€89), anything with cents always with two (€49.50).
  const fmt = (n: number) =>
    new Intl.NumberFormat(LOCALE, { style: "currency", currency, minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 }).format(n);
  const lo = min ?? max!;
  const hi = max ?? min!;
  return lo === hi ? fmt(lo) : `${fmt(lo)} – ${fmt(hi)}`;
}

export function formatDistance(km: number | null): string | null {
  if (km === null || !Number.isFinite(km)) return null;
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}

/** "in 3 d 4 h", "in 42 min", "now". Uses whole units; tabular numerals in the UI. */
export function formatCountdown(target: Date, now = new Date()): string {
  const ms = target.getTime() - now.getTime();
  if (ms <= 0) return "now";
  const min = Math.floor(ms / 60000);
  if (min < 60) return `in ${Math.max(min, 1)} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `in ${h} h ${min % 60} min`;
  const d = Math.floor(h / 24);
  return `in ${d} d ${h % 24} h`;
}

export function formatRelativePast(iso: string, now = new Date()): string {
  const ms = now.getTime() - Date.parse(iso);
  const min = Math.round(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 60) return `${d} days ago`;
  return new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));
}

export function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371.0088;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
