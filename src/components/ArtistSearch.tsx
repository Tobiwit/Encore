"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { addSpotifyArtist, searchSpotifyArtists, type ArtistSearchResult } from "@/server/actions/artists";
import { IconCheck, IconPlus, IconSearch } from "./icons";
import { RemoteImage } from "./RemoteImage";
import { ErrorState, ListSkeleton } from "./states";
import { Button } from "./ui";

export function ArtistSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ArtistSearchResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searching, startSearch] = useTransition();
  const [added, setAdded] = useState<Record<string, string>>({});
  const latest = useRef(0);
  const active = query.trim().length >= 2;

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const ticket = ++latest.current;
    const t = setTimeout(() => {
      startSearch(async () => {
        const r = await searchSpotifyArtists(q);
        if (ticket !== latest.current) return; // a newer query superseded this one
        if (r.ok) {
          setResults(r.results);
          setError(null);
        } else {
          setResults(null);
          setError(r.error);
        }
      });
    }, 350);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <div className="space-y-4">
      <div className="relative">
        <label htmlFor="artist-search" className="sr-only">
          Search artists
        </label>
        <IconSearch className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-fg-muted" />
        <input
          id="artist-search"
          type="search"
          autoComplete="off"
          enterKeyHint="search"
          placeholder="Artist name"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-14 w-full rounded-full bg-surface pl-12 pr-5 text-body text-fg ring-1 ring-inset ring-line-strong placeholder:text-fg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
      </div>

      {active && error ? <ErrorState title="Search unavailable" body={error} kind="warning" /> : null}
      {active && searching && !results ? <ListSkeleton rows={3} label="Searching" /> : null}

      {active && results && results.length === 0 ? <p className="py-6 text-center text-support text-fg-secondary">No artists found for “{query.trim()}”.</p> : null}

      {active && results?.length ? (
        <ul className="divide-y divide-line" aria-busy={searching}>
          {results.map((r) => (
            <SearchRow key={r.spotifyId} result={r} query={query} addedId={added[r.spotifyId]} onAdded={(id) => setAdded((m) => ({ ...m, [r.spotifyId]: id }))} />
          ))}
        </ul>
      ) : null}

      <p className="text-meta text-fg-muted">Artist data from Spotify.</p>
    </div>
  );
}

function SearchRow({
  result,
  query,
  addedId,
  onAdded,
}: {
  result: ArtistSearchResult;
  query: string;
  addedId?: string;
  onAdded: (artistId: string) => void;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const followed = result.followed || Boolean(addedId);

  return (
    <li className="flex items-center gap-3 py-3">
      <RemoteImage src={result.imageUrl} alt="" rounded="rounded-full" className="size-12 shrink-0" />
      <div className="min-w-0 flex-1">
        {addedId ? (
          <Link href={`/artists/${addedId}`} className="block truncate font-semibold text-fg hover:underline">
            {result.name}
          </Link>
        ) : (
          <p className="truncate font-semibold text-fg">{result.name}</p>
        )}
        {error ? <p className="text-meta text-error">{error}</p> : result.genres.length ? <p className="truncate text-meta text-fg-muted">{result.genres.join(" · ")}</p> : null}
      </div>
      {followed ? (
        <span className="inline-flex min-h-11 items-center gap-1 px-3 text-support font-semibold text-success">
          <IconCheck size={18} /> Following
        </span>
      ) : (
        <Button
          size="sm"
          variant="secondary"
          disabled={pending}
          aria-label={`Add ${result.name}`}
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await addSpotifyArtist(result.spotifyId, query);
              if (r.ok && r.artistId) onAdded(r.artistId);
              else if (!r.ok) setError(r.error);
            })
          }
        >
          <IconPlus size={18} /> Add
        </Button>
      )}
    </li>
  );
}
