import Link from "next/link";
import { RANGE_LABEL, RANGES } from "@/lib/listening";
import type { ArtistSummary } from "@/lib/types";
import type { FriendFan } from "@/server/data/social";
import { FriendAvatarStack, namesLabel } from "./FriendAvatarStack";
import { IconPin } from "./icons";
import { RemoteImage } from "./RemoteImage";
import { cn } from "./ui";

const INTEREST_ORDER = { love: 0, like: 1, curious: 2 } as const;
const bestRank = (a: ArtistSummary) => Math.min(a.ranks?.short_term ?? 999, a.ranks?.medium_term ?? 999, a.ranks?.long_term ?? 999);

/** Pinned first, then Love, long-time fans, then strongest current Spotify rank. */
export function pickFavourites(artists: ArtistSummary[], count = 5) {
  return [...artists]
    .filter((a) => a.pinned || a.interest !== "curious")
    .sort(
      (a, b) =>
        Number(b.pinned) - Number(a.pinned) ||
        INTEREST_ORDER[a.interest] - INTEREST_ORDER[b.interest] ||
        Number(b.status === "long_time") - Number(a.status === "long_time") ||
        bestRank(a) - bestRank(b) ||
        a.name.localeCompare(b.name),
    )
    .slice(0, count);
}

function whyFavourite(a: ArtistSummary) {
  const range = RANGES.filter((r) => a.ranks?.[r]).sort((x, y) => a.ranks![x]! - a.ranks![y]!)[0];
  const rank = range ? `#${a.ranks![range]} ${RANGE_LABEL[range].toLowerCase()}` : null;
  const level = a.interest === "love" ? "Love" : a.interest === "like" ? "Like" : "Curious";
  return [a.pinned ? "Pinned" : level, a.status === "long_time" ? "long-time fan" : null, rank].filter(Boolean).join(" · ");
}

function Tile({ artist, big = false, className }: { artist: ArtistSummary; big?: boolean; className?: string }) {
  return (
    <li className={cn("group relative overflow-hidden rounded-lg", className)}>
      <RemoteImage src={artist.imageUrl} alt="" rounded="rounded-lg" className="size-full" prism={big ? "lg" : "sm"} />
      {/* Scrim keeps the overlaid name readable on any photo. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
      {artist.pinned ? (
        <span className="absolute right-1.5 top-1.5 inline-flex size-7 items-center justify-center rounded-full bg-bg/80 text-accent" title="Pinned">
          <IconPin size={14} />
          <span className="sr-only">Pinned</span>
        </span>
      ) : null}
      <div className={cn("absolute inset-x-0 bottom-0", big ? "p-3" : "p-2")}>
        <Link
          href={`/artists/${artist.id}`}
          className={cn(
            "line-clamp-2 font-semibold text-balance text-white after:absolute after:inset-0 after:content-['']",
            big ? "text-section" : "text-meta",
          )}
        >
          {artist.name}
        </Link>
        {big ? <p className="mt-0.5 text-meta text-white/80">{whyFavourite(artist)}</p> : null}
      </div>
    </li>
  );
}

/**
 * Your favourites as an asymmetric mosaic: the top favourite large, the next ones beside it.
 * Every tile is square; the grid keeps the large tile exactly two small tiles (plus gap) wide.
 */
export function FavouritesMosaic({ artists }: { artists: ArtistSummary[] }) {
  if (!artists.length) return null;
  const [top, ...rest] = artists;

  if (artists.length < 3) {
    return (
      <ul className={cn("grid gap-2", artists.length === 1 ? "grid-cols-1" : "grid-cols-2")}>
        {artists.map((a) => (
          <Tile key={a.id} artist={a} big className={artists.length === 1 ? "aspect-[16/10]" : "aspect-square"} />
        ))}
      </ul>
    );
  }

  const smalls = artists.length >= 5 ? rest.slice(0, 4) : rest.slice(0, 2);
  return (
    <ul className={cn("grid gap-2", smalls.length === 4 ? "grid-cols-4" : "grid-cols-3")}>
      <Tile artist={top} big className="col-span-2 row-span-2 aspect-square" />
      {smalls.map((a) => (
        <Tile key={a.id} artist={a} className="aspect-square" />
      ))}
    </ul>
  );
}

export type SharedFavourite = { artist: ArtistSummary; fans: FriendFan[] };

/** Your Love/Like artists that friends follow too, most shared first. */
export function pickShared(artists: ArtistSummary[], fans: Map<string, FriendFan[]>, count = 12): SharedFavourite[] {
  return artists
    .filter((a) => a.interest !== "curious" && (fans.get(a.id)?.length ?? 0) > 0)
    .map((a) => ({ artist: a, fans: fans.get(a.id)! }))
    .sort(
      (x, y) =>
        y.fans.length - x.fans.length ||
        INTEREST_ORDER[x.artist.interest] - INTEREST_ORDER[y.artist.interest] ||
        bestRank(x.artist) - bestRank(y.artist),
    )
    .slice(0, count);
}

export function SharedFavourites({ items }: { items: SharedFavourite[] }) {
  return (
    <ul className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:scroll-px-6 sm:px-6">
      {items.map(({ artist, fans }) => {
        const loves = fans.filter((f) => f.interest === "love").length >= fans.length / 2;
        return (
          <li key={artist.id} className="group relative w-32 shrink-0 snap-start">
            <div className="relative">
              <RemoteImage src={artist.imageUrl} alt="" rounded="rounded-lg" className="aspect-square w-full" prism="sm" />
              <div className="absolute -bottom-2 left-2">
                <FriendAvatarStack friends={fans} size={26} max={3} ring="ring-bg" />
              </div>
            </div>
            <Link
              href={`/artists/${artist.id}`}
              className="mt-3.5 block truncate text-support font-semibold text-fg after:absolute after:inset-0 after:content-['']"
            >
              {artist.name}
            </Link>
            <p className="line-clamp-2 text-meta text-fg-secondary">
              {namesLabel(fans)} {loves ? (fans.length === 1 ? "loves" : "love") : fans.length === 1 ? "likes" : "like"} them too
            </p>
          </li>
        );
      })}
    </ul>
  );
}
