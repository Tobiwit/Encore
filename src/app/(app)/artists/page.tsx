import type { Metadata } from "next";
import Link from "next/link";
import { ArtistCard, ArtistRow } from "@/components/ArtistCard";
import { GlassPanel } from "@/components/GeometricBackground";
import { IconPlus } from "@/components/icons";
import { RestoreArtistButton } from "@/components/ArtistActions";
import { SpotifyRefreshButton } from "@/components/SpotifyRefreshButton";
import { EmptyState } from "@/components/states";
import { ButtonLink, cn, PageHeader, SectionHeader } from "@/components/ui";
import { formatRelativePast } from "@/lib/format";
import { createClient, requireUser } from "@/lib/supabase/server";
import { computeTasteStats, getMyArtists } from "@/server/data/artists";

export const metadata: Metadata = { title: "Artists" };

const FILTERS = [
  { value: "all", label: "All" },
  { value: "love", label: "Love" },
  { value: "like", label: "Like" },
  { value: "curious", label: "Curious" },
  { value: "upcoming", label: "On tour" },
] as const;

export default async function ArtistsPage({ searchParams }: PageProps<"/artists">) {
  const { filter: rawFilter } = await searchParams;
  const filter = FILTERS.some((f) => f.value === rawFilter) ? (rawFilter as (typeof FILTERS)[number]["value"]) : "all";
  const user = await requireUser();
  const supabase = await createClient();
  const [{ active, removed }, { data: account }] = await Promise.all([
    getMyArtists(supabase, user.id),
    supabase.from("connected_accounts").select("status, last_successful_sync_at, last_sync_error").eq("user_id", user.id).eq("provider", "spotify").maybeSingle(),
  ]);

  const stats = computeTasteStats(active);
  const pinned = active.filter((a) => a.pinned);
  const shown = active.filter((a) =>
    filter === "all" ? true : filter === "upcoming" ? (a.upcomingCount ?? 0) > 0 : a.interest === filter,
  );

  return (
    <div className="space-y-8">
      <PageHeader
        title="Artists"
        subtitle={
          account?.last_successful_sync_at
            ? `Spotify synced ${formatRelativePast(account.last_successful_sync_at)}`
            : account?.status === "revoked"
              ? "Spotify disconnected"
              : "Not synced with Spotify yet"
        }
        action={
          <ButtonLink href="/artists/add" size="sm">
            <IconPlus size={18} /> Add
          </ButtonLink>
        }
      />

      {active.length === 0 ? (
        <EmptyState
          decorative
          title="Your fan list is empty"
          body="Import your top artists from Spotify or search for anyone you'd like to follow."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {account?.status === "active" ? <SpotifyRefreshButton label="Import from Spotify" /> : null}
              <ButtonLink href="/artists/add" variant="secondary">
                Search artists
              </ButtonLink>
            </div>
          }
        />
      ) : (
        <>
          <GlassPanel>
            <div className="p-5">
              <h2 className="text-meta font-semibold uppercase tracking-wide text-fg-secondary">Your taste</h2>
              <dl className="mt-3 grid grid-cols-3 gap-4">
                <div>
                  <dt className="text-meta text-fg-secondary">Artists</dt>
                  <dd className="tabular text-page font-semibold">{stats.total}</dd>
                </div>
                <div>
                  <dt className="text-meta text-fg-secondary">You love</dt>
                  <dd className="tabular text-page font-semibold text-accent">{stats.byInterest.love}</dd>
                </div>
                <div>
                  <dt className="text-meta text-fg-secondary">On tour</dt>
                  <dd className="tabular text-page font-semibold">{stats.withUpcoming}</dd>
                </div>
              </dl>
              {stats.topGenres.length ? (
                <p className="mt-4 text-support text-fg-secondary">
                  Mostly <span className="text-fg">{stats.topGenres.slice(0, 3).map((g) => g.genre).join(", ")}</span>
                </p>
              ) : null}
              <p className="mt-1 text-meta text-fg-secondary">
                {stats.imported} from Spotify · {stats.manual} added by you
              </p>
            </div>
          </GlassPanel>

          {pinned.length ? (
            <section aria-labelledby="pinned">
              <SectionHeader id="pinned" title="Pinned" />
              <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                {pinned.slice(0, 8).map((a) => (
                  <li key={a.id}>
                    <ArtistCard artist={a} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section aria-labelledby="fan-list">
            <SectionHeader id="fan-list" title="Fan list" action={account?.status === "active" ? <SpotifyRefreshButton compact /> : undefined} />
            <nav aria-label="Filter artists" className="-mx-4 mb-2 overflow-x-auto px-4">
              <ul className="flex gap-2">
                {FILTERS.map((f) => (
                  <li key={f.value}>
                    <Link
                      href={f.value === "all" ? "/artists" : `/artists?filter=${f.value}`}
                      scroll={false}
                      aria-current={filter === f.value ? "true" : undefined}
                      className={cn(
                        "inline-flex min-h-10 items-center rounded-full px-4 text-support font-semibold whitespace-nowrap",
                        filter === f.value ? "bg-fg text-bg" : "bg-surface text-fg-secondary hover:text-fg",
                      )}
                    >
                      {f.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
            {shown.length ? (
              <ul className="divide-y divide-line">
                {shown.map((a) => (
                  <ArtistRow key={a.id} artist={a} />
                ))}
              </ul>
            ) : (
              <p className="py-6 text-center text-support text-fg-secondary">No artists match this filter.</p>
            )}
          </section>
        </>
      )}

      {removed.length ? (
        <details className="rounded-lg bg-surface px-4 py-2">
          <summary className="min-h-11 cursor-pointer content-center font-semibold text-fg-secondary">Removed artists ({removed.length})</summary>
          <p className="pb-2 text-meta text-fg-muted">Removed artists stay hidden even if Spotify ranks them again.</p>
          <ul className="divide-y divide-line">
            {removed.map((a) => (
              <ArtistRow key={a.id} artist={a} trailing={<RestoreArtistButton artistId={a.id} name={a.name} />} />
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
