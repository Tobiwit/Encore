"use client";

import { useState, useTransition } from "react";
import { addLocation, removeLocation, setHomeLocation, updateLocationRadius } from "@/server/actions/profile";
import { IconClose, IconMapPin } from "./icons";
import { InlineNotice } from "./states";
import { Button, IconButton } from "./ui";

type City = { id: string; name: string; country_code: string };
type Location = { id: string; cityName: string; radiusKm: number; isHome: boolean };

const RADII = [10, 25, 50, 100, 200];
const COUNTRY: Record<string, string> = { DE: "Germany", AT: "Austria", CH: "Switzerland", NL: "Netherlands", CZ: "Czechia", DK: "Denmark" };

export function LocationEditor({ cities, locations, compact = false }: { cities: City[]; locations: Location[]; compact?: boolean }) {
  const [cityId, setCityId] = useState("");
  const [radius, setRadius] = useState(50);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) setError(r.error ?? "Something went wrong.");
    });

  const byCountry = new Map<string, City[]>();
  for (const c of cities) byCountry.set(c.country_code, [...(byCountry.get(c.country_code) ?? []), c]);

  return (
    <div className="space-y-5">
      {locations.length ? (
        <ul className="space-y-2">
          {locations.map((l) => (
            <li key={l.id} className="rounded-lg bg-surface p-3">
              <div className="flex items-center gap-3">
                <IconMapPin className="shrink-0 text-accent" />
                <p className="min-w-0 flex-1 truncate font-semibold text-fg">
                  {l.cityName}
                  {l.isHome ? <span className="ml-2 rounded-full bg-accent-muted px-2 py-0.5 text-meta text-fg">Home</span> : null}
                </p>
                <IconButton label={`Remove ${l.cityName}`} disabled={pending} onClick={() => run(() => removeLocation(l.id))}>
                  <IconClose size={18} />
                </IconButton>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 pl-9">
                <label className="text-support text-fg-secondary">
                  <span className="sr-only">Search radius for {l.cityName}</span>
                  <select
                    defaultValue={l.radiusKm}
                    disabled={pending}
                    onChange={(e) => run(() => updateLocationRadius(l.id, Number(e.target.value)))}
                    className="h-11 rounded-full bg-surface-elevated px-4 text-fg ring-1 ring-inset ring-line-strong"
                  >
                    {[...new Set([...RADII, l.radiusKm])].sort((a, b) => a - b).map((r) => (
                      <option key={r} value={r}>
                        Within {r} km
                      </option>
                    ))}
                  </select>
                </label>
                {!l.isHome ? (
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setHomeLocation(l.id))}>
                    Make home
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {locations.length < 5 ? (
        <form
          className="space-y-3 rounded-lg bg-surface p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!cityId) return setError("Choose a city first.");
            run(async () => {
              const r = await addLocation({ cityId, radiusKm: radius });
              if (r.ok) setCityId("");
              return r;
            });
          }}
        >
          <p className="font-semibold text-fg">{locations.length ? "Add another city" : compact ? "Your city" : "Add your home city"}</p>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <label className="text-support text-fg-secondary">
              City
              <select
                value={cityId}
                onChange={(e) => setCityId(e.target.value)}
                className="mt-1 block h-12 w-full rounded-md bg-surface-elevated px-3 text-fg ring-1 ring-inset ring-line-strong"
              >
                <option value="">Choose a city…</option>
                {[...byCountry.entries()].map(([cc, list]) => (
                  <optgroup key={cc} label={COUNTRY[cc] ?? cc}>
                    {list.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <label className="text-support text-fg-secondary">
              Radius
              <select
                value={radius}
                onChange={(e) => setRadius(Number(e.target.value))}
                className="mt-1 block h-12 w-full rounded-md bg-surface-elevated px-3 text-fg ring-1 ring-inset ring-line-strong"
              >
                {RADII.map((r) => (
                  <option key={r} value={r}>
                    {r} km
                  </option>
                ))}
              </select>
            </label>
          </div>
          <Button type="submit" size="sm" disabled={pending || !cityId}>
            {pending ? "Saving…" : "Add city"}
          </Button>
        </form>
      ) : null}

      {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}
      <p className="text-meta text-fg-muted">We use city centres only — never your device&apos;s precise location.</p>
    </div>
  );
}
