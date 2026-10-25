import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { formatCountdown, formatEventDate, formatPriceRange } from "@/lib/format";
import { decryptSecret, encryptSecret } from "@/server/crypto";
import { fetchWithRetry } from "@/server/http";

describe("token encryption", () => {
  const key = randomBytes(32).toString("base64");

  it("round-trips and produces unique ciphertexts", () => {
    const a = encryptSecret("spotify-access-token", key);
    const b = encryptSecret("spotify-access-token", key);
    expect(a).not.toBe(b);
    expect(a).not.toContain("spotify-access-token");
    expect(decryptSecret(a, key)).toBe("spotify-access-token");
  });

  it("rejects tampering and wrong keys", () => {
    const sealed = encryptSecret("secret", key);
    const parts = sealed.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptSecret(parts.join("."), key)).toThrow();
    expect(() => decryptSecret(sealed, randomBytes(32).toString("base64"))).toThrow();
  });
});

describe("formatting", () => {
  it("renders event times in the event's own time zone", () => {
    expect(formatEventDate("2027-03-14T19:00:00Z", "Europe/Berlin")).toBe("Sun 14 Mar · 20:00");
    expect(formatEventDate("2027-03-14T19:00:00Z", "Europe/London")).toBe("Sun 14 Mar · 19:00");
    expect(formatEventDate(null, "Europe/Berlin", { startDateLocal: "2027-05-01" })).toBe("Sat 1 May · time TBA");
    expect(formatEventDate(null, null)).toBe("Date to be announced");
  });

  it("formats only supplied prices", () => {
    expect(formatPriceRange(49.5, 89, "EUR")).toBe("€49.50 – €89");
    expect(formatPriceRange(null, null, "EUR")).toBeNull();
    expect(formatPriceRange(30, null, "EUR")).toBe("€30");
  });

  it("formats countdowns", () => {
    const now = new Date("2026-10-25T10:00:00Z");
    expect(formatCountdown(new Date("2026-10-25T10:42:00Z"), now)).toBe("in 42 min");
    expect(formatCountdown(new Date("2026-10-27T13:00:00Z"), now)).toBe("in 2 d 3 h");
    expect(formatCountdown(new Date("2026-10-25T09:00:00Z"), now)).toBe("now");
  });
});

describe("fetchWithRetry", () => {
  it("retries transient errors with bounded attempts and honours Retry-After", async () => {
    const sleeps: number[] = [];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(new Response("", { status: 429, headers: { "retry-after": "2" } }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await fetchWithRetry("https://example.test", {}, { provider: "test", sleep: async (ms) => void sleeps.push(ms) });
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(sleeps[1]).toBeGreaterThanOrEqual(2000);
    vi.unstubAllGlobals();
  });

  it("does not retry client errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await fetchWithRetry("https://example.test", {}, { provider: "test", sleep: async () => {} });
    expect(res.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});

// WCAG 2.2 AA contrast for every text token on every surface it is used on.
describe("design tokens", () => {
  const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
  const token = (name: string) => {
    const m = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`));
    if (!m) throw new Error(`token ${name} missing`);
    return m[1];
  };
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a: string, b: string) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const surfaces = ["bg", "surface", "surface-elevated"];

  it.each(["fg", "fg-secondary", "fg-muted", "accent", "success", "warning", "error"])("%s meets 4.5:1 on all surfaces", (fg) => {
    for (const s of surfaces) expect(ratio(token(fg), token(s)), `${fg} on ${s}`).toBeGreaterThanOrEqual(4.5);
  });

  it("control borders meet 3:1 non-text contrast", () => {
    for (const s of surfaces) expect(ratio(token("line-strong"), token(s))).toBeGreaterThanOrEqual(3);
  });

  it("dark text on accent buttons meets 4.5:1", () => {
    expect(ratio(token("bg"), token("accent"))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(token("bg"), token("accent-hover"))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(token("fg"), token("accent-muted"))).toBeGreaterThanOrEqual(4.5);
  });
});
