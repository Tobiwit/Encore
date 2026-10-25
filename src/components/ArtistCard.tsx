import Link from "next/link";
import type { ArtistSummary } from "@/lib/types";
import { IconPin } from "./icons";
import { RemoteImage } from "./RemoteImage";
import { cn } from "./ui";

const SOURCE_LABEL: Record<ArtistSummary["source"], string> = {
  spotify_import: "From Spotify",
  manual: "Added by you",
  friend_suggestion: "Via a friend",
  discovery: "Discovered",
};

const INTEREST_LABEL = { love: "Love", like: "Like", curious: "Curious" } as const;

/** Visual tile for grids (pinned favourites, friend overlap). */
export function ArtistCard({ artist, href }: { artist: Pick<ArtistSummary, "id" | "name" | "imageUrl" | "pinned">; href?: string }) {
  return (
    <article className="relative min-w-0">
      <RemoteImage src={artist.imageUrl} alt="" rounded="rounded-lg" className="aspect-square w-full" />
      {artist.pinned ? (
        <span className="absolute right-2 top-2 inline-flex size-8 items-center justify-center rounded-full bg-bg/80 text-accent" title="Pinned">
          <IconPin size={16} />
          <span className="sr-only">Pinned</span>
        </span>
      ) : null}
      <h3 className="mt-2 line-clamp-2 text-support font-semibold text-fg">
        <Link href={href ?? `/artists/${artist.id}`} className="after:absolute after:inset-0 after:content-['']">
          {artist.name}
        </Link>
      </h3>
    </article>
  );
}

/** Dense list row with source and interest indicators. */
export function ArtistRow({ artist, trailing }: { artist: ArtistSummary; trailing?: React.ReactNode }) {
  return (
    <li className="relative flex items-center gap-3 py-2.5">
      <RemoteImage src={artist.imageUrl} alt="" rounded="rounded-full" className="size-12 shrink-0" />
      <div className="min-w-0 flex-1">
        <Link href={`/artists/${artist.id}`} className="block truncate font-semibold text-fg after:absolute after:inset-0 after:content-['']">
          {artist.name}
        </Link>
        <p className="truncate text-meta text-fg-muted">
          {SOURCE_LABEL[artist.source]}
          {typeof artist.upcomingCount === "number" && artist.upcomingCount > 0 ? ` · ${artist.upcomingCount} upcoming` : ""}
        </p>
      </div>
      <span
        className={cn(
          "shrink-0 rounded-full px-2.5 py-1 text-meta font-semibold",
          artist.interest === "love" ? "bg-accent-muted text-fg" : "bg-surface-elevated text-fg-secondary",
        )}
      >
        {INTEREST_LABEL[artist.interest]}
      </span>
      {artist.pinned ? (
        <span className="shrink-0 text-accent" title="Pinned">
          <IconPin size={18} />
          <span className="sr-only">Pinned</span>
        </span>
      ) : null}
      {trailing ? <div className="relative z-10 shrink-0">{trailing}</div> : null}
    </li>
  );
}

export function SharedArtistsList({ artists, emptyText }: { artists: { id: string; name: string; imageUrl: string | null }[]; emptyText: string }) {
  if (!artists.length) return <p className="text-support text-fg-muted">{emptyText}</p>;
  return (
    <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
      {artists.map((a) => (
        <li key={a.id}>
          <ArtistCard artist={{ ...a, pinned: false }} />
        </li>
      ))}
    </ul>
  );
}
