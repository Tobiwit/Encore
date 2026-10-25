const FROM = "àáâãäåāçćčèéêëēėęìíîïīłñńòóôõöøōùúûüūýÿžźżšś";
const TO = "aaaaaaaccceeeeeeeiiiiilnnooooooouuuuuyyzzzss";

/** Mirrors public.normalize_name() in the database. Used only as a fallback matching signal. */
export function normalizeName(name: string | null | undefined): string | null {
  let s = (name ?? "").toLowerCase().replaceAll("ß", "ss").replaceAll("&", " and ");
  s = Array.from(s, (ch) => {
    const i = FROM.indexOf(ch);
    return i >= 0 ? TO[i] : ch;
  }).join("");
  s = s.replace(/[^a-z0-9]+/g, " ").trim();
  return s.length ? s : null;
}

export function slugify(value: string): string {
  return normalizeName(value)?.replaceAll(" ", "-") ?? "item";
}

/** Only allow same-origin relative redirect targets. */
export function safeRedirectPath(value: string | null | undefined, fallback = "/discover"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  try {
    const url = new URL(value, "http://local.invalid");
    if (url.origin !== "http://local.invalid") return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}
