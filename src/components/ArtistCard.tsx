import Link from "next/link";
import { describeRanks, RANGE_SHORT, RANGES, type Ranks, type TimeRange } from "@/lib/listening";
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
    <article className="group relative min-w-0">
      <RemoteImage src={artist.imageUrl} alt="" rounded="rounded-lg" className="aspect-square w-full" prism="sm" />
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

const STATUS_LABEL: Record<NonNullable<ArtistSummary["status"]>, string> = {
  long_time: "Long-time fan",
  steady: "Steady favourite",
  rotation: "In rotation",
  unranked: "",
};

/** Ranks for 4 weeks / 6 months / all time; absent ranges are shown dimmed. */
export function RangeMarks({ ranks, highlight }: { ranks?: Ranks; highlight?: TimeRange }) {
  return (
    <span className="flex gap-1" aria-hidden="true">
      {RANGES.map((r) => {
        const rank = ranks?.[r];
        return (
          <span
            key={r}
            className={cn(
              "tabular inline-flex h-5 items-center rounded-full px-1.5 text-meta font-semibold leading-none",
              rank ? (r === highlight ? "bg-accent text-bg" : "bg-surface-elevated text-fg-secondary") : "text-fg-muted ring-1 ring-inset ring-line",
            )}
          >
            {RANGE_SHORT[r]}
            {rank ? ` ${rank}` : ""}
          </span>
        );
      })}
    </span>
  );
}

/** Dense list row: listening status, per-range ranks and interest level. */
export function ArtistRow({
  artist,
  trailing,
  position,
  highlight,
}: {
  artist: ArtistSummary;
  trailing?: React.ReactNode;
  /** Leading rank number in ranked views. */
  position?: number;
  highlight?: TimeRange;
}) {
  const status = artist.status ? STATUS_LABEL[artist.status] : "";
  const meta = [status || SOURCE_LABEL[artist.source], artist.upcomingCount ? `${artist.upcomingCount} upcoming` : ""].filter(Boolean).join(" · ");
  return (
    <li className="relative flex items-center gap-3 py-2.5">
      {position ? <span className="tabular w-6 shrink-0 text-right text-card font-semibold text-fg-secondary">{position}</span> : null}
      <RemoteImage src={artist.imageUrl} alt="" rounded="rounded-full" className="size-12 shrink-0" />
      <div className="min-w-0 flex-1">
        <Link href={`/artists/${artist.id}`} className="block truncate font-semibold text-fg after:absolute after:inset-0 after:content-['']">
          {artist.name}
        </Link>
        <p className={cn("truncate text-meta", artist.status === "long_time" ? "text-accent" : "text-fg-muted")}>{meta}</p>
        {artist.ranks ? (
          <div className="mt-1">
            <RangeMarks ranks={artist.ranks} highlight={highlight} />
            <span className="sr-only">{describeRanks(artist.ranks)}</span>
          </div>
        ) : null}
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
