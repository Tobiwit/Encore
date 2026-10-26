import type { Metadata } from "next";
import Link from "next/link";
import { ArtistRow } from "@/components/ArtistCard";
import { FavouritesMosaic, pickFavourites, pickShared, SharedFavourites } from "@/components/ArtistShowcase";
import { RestoreArtistButton } from "@/components/ArtistActions";
import { ConcertSearchStatus, getConcertSearchStatus } from "@/components/ConcertSearchStatus";
import { GlassPanel } from "@/components/GeometricBackground";
import { IconPlus } from "@/components/icons";
import { SpotifyRefreshButton } from "@/components/SpotifyRefreshButton";
import { EmptyState } from "@/components/states";
import { ButtonLink, cn, PageHeader, SectionHeader } from "@/components/ui";
import { formatRelativePast } from "@/lib/format";
import { RANGE_LABEL, type TimeRange } from "@/lib/listening";
import type { InterestLevel } from "@/lib/ranking";
import type { ArtistSummary } from "@/lib/types";
import { createClient, requireUser } from "@/lib/supabase/server";
import { computeTasteStats, getMyArtists } from "@/server/data/artists";
import { friendFansByArtist } from "@/server/data/social";

export const metadata: Metadata = { title: "Artists" };
// Server actions on this page (Spotify import) continue a concert search via after().
export const maxDuration = 300;

const VIEWS = [
  { value: "all", label: "Favourites" },
  { value: "short_term", label: "Last 4 weeks" },
  { value: "medium_term", label: "6 months" },
  { value: "long_term", label: "All time" },
  { value: "long_time", label: "Long-time fans" },
  { value: "upcoming", label: "On tour" },
  { value: "curious", label: "Curious" },
] as const;
type View = (typeof VIEWS)[number]["value"];

const RANGE_VIEWS = new Set<View>(["short_term", "medium_term", "long_term"]);
const INTEREST_ORDER: Record<InterestLevel, number> = { love: 0, like: 1, curious: 2 };
const bestRank = (a: ArtistSummary) => Math.min(a.ranks?.short_term ?? 999, a.ranks?.medium_term ?? 999, a.ranks?.long_term ?? 999);

/** Favourites: pinned, then interest, long-time fans first, then strongest current rank. */
function favouritesOrder(a: ArtistSummary, b: ArtistSummary) {
  return (
    Number(b.pinned) - Number(a.pinned) ||
    INTEREST_ORDER[a.interest] - INTEREST_ORDER[b.interest] ||
    Number(b.status === "long_time") - Number(a.status === "long_time") ||
    bestRank(a) - bestRank(b) ||
    a.name.localeCompare(b.name)
  );
}

function select(active: ArtistSummary[], view: View): ArtistSummary[] {
  if (RANGE_VIEWS.has(view)) {
    const range = view as TimeRange;
    return active.filter((a) => a.ranks?.[range]).sort((a, b) => a.ranks![range]! - b.ranks![range]!);
  }
  const filtered = active.filter((a) =>
    view === "long_time" ? a.status === "long_time" : view === "upcoming" ? (a.upcomingCount ?? 0) > 0 : view === "curious" ? a.interest === "curious" : true,
  );
  return filtered.sort(favouritesOrder);
}

const EMPTY_TEXT: Partial<Record<View, string>> = {
  short_term: "Spotify hasn't returned your last-4-weeks top artists yet. Try refreshing.",
  medium_term: "No 6-month ranking from Spotify yet.",
  long_term: "No all-time ranking from Spotify yet.",
  long_time: "No long-time fans yet. Artists who appear in your all-time ranking and another range become long-time fans.",
  upcoming: "None of your artists has an upcoming concert we know of yet.",
  curious: "Nothing in rotation right now.",
};

export default async function ArtistsPage({ searchParams }: PageProps<"/artists">) {
  const { view: rawView } = await searchParams;
  const view: View = VIEWS.some((v) => v.value === rawView) ? (rawView as View) : "all";
  const user = await requireUser();
  const supabase = await createClient();
  const [{ active, removed }, { data: account }, searchStatus] = await Promise.all([
    getMyArtists(supabase, user.id),
    supabase.from("connected_accounts").select("status, last_successful_sync_at, last_sync_error").eq("user_id", user.id).eq("provider", "spotify").maybeSingle(),
    getConcertSearchStatus(supabase),
  ]);

  const stats = computeTasteStats(active);
  const favourites = pickFavourites(active);
  const [fans, { data: friendList }] = await Promise.all([
    friendFansByArtist(
      supabase,
      user.id,
      active.filter((a) => a.interest !== "curious").map((a) => a.id),
    ),
    supabase.rpc("get_friends"),
  ]);
  const shared = pickShared(active, fans);
  const hasFriends = (friendList?.length ?? 0) > 0;
  const shown = select(active, view);
  const ranked = RANGE_VIEWS.has(view);

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
          <section aria-labelledby="favourites">
            <SectionHeader id="favourites" title="Your favourites" />
            <FavouritesMosaic artists={favourites} />
          </section>

          <section aria-labelledby="shared">
            <SectionHeader
              id="shared"
              title="Shared with friends"
              action={
                shared.length ? (
                  <span className="tabular text-support text-fg-secondary">
                    {shared.length} artist{shared.length === 1 ? "" : "s"}
                  </span>
                ) : undefined
              }
            />
            {shared.length ? (
              <SharedFavourites items={shared} />
            ) : (
              <p className="rounded-lg bg-surface px-4 py-3 text-support text-fg-secondary">
                {hasFriends ? (
                  "None of your friends follow your favourites yet — or they keep their fan list private."
                ) : (
                  <>
                    <Link href="/friends" className="font-semibold text-fg underline underline-offset-2">
                      Invite friends
                    </Link>{" "}
                    to see which favourites you share.
                  </>
                )}
              </p>
            )}
          </section>

          <GlassPanel>
            <div className="p-5">
              <h2 className="text-meta font-semibold uppercase tracking-wide text-fg-secondary">Your taste</h2>
              <dl className="mt-3 grid grid-cols-3 gap-4">
                <div>
                  <dt className="text-meta text-fg-secondary">Artists</dt>
                  <dd className="tabular text-page font-semibold">{stats.total}</dd>
                </div>
                <div>
                  <dt className="text-meta text-fg-secondary">Long-time fans</dt>
                  <dd className="tabular text-page font-semibold text-accent">{stats.longTime}</dd>
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
                {stats.byInterest.love} loved · {stats.rotation} in rotation · {stats.manual} added by you
              </p>
            </div>
          </GlassPanel>

          {searchStatus ? <ConcertSearchStatus status={searchStatus} /> : null}

          <section aria-labelledby="fan-list">
            <SectionHeader id="fan-list" title="Fan list" action={account?.status === "active" ? <SpotifyRefreshButton compact /> : undefined} />
            <nav aria-label="Artist views" className="-mx-4 mb-3 overflow-x-auto px-4 pb-1">
              <ul className="flex gap-2">
                {VIEWS.map((v) => (
                  <li key={v.value}>
                    <Link
                      href={v.value === "all" ? "/artists" : `/artists?view=${v.value}`}
                      scroll={false}
                      aria-current={view === v.value ? "true" : undefined}
                      className={cn(
                        "inline-flex min-h-10 items-center whitespace-nowrap rounded-full px-4 text-support font-semibold",
                        view === v.value ? "bg-fg text-bg" : "bg-surface text-fg-secondary hover:text-fg",
                      )}
                    >
                      {v.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>

            {ranked ? (
              <p className="mb-1 text-meta text-fg-muted">
                Your Spotify top artists · {RANGE_LABEL[view as TimeRange].toLowerCase()} · showing the ones on your fan list
              </p>
            ) : null}

            {shown.length ? (
              <ol className="divide-y divide-line">
                {shown.map((a) => (
                  <ArtistRow
                    key={a.id}
                    artist={a}
                    position={ranked ? a.ranks![view as TimeRange] : undefined}
                    highlight={ranked ? (view as TimeRange) : undefined}
                  />
                ))}
              </ol>
            ) : (
              <p className="py-6 text-center text-support text-fg-secondary">{EMPTY_TEXT[view] ?? "No artists match this view."}</p>
            )}

            <details className="mt-4 rounded-lg bg-surface px-4 py-2 text-support text-fg-secondary">
              <summary className="min-h-11 cursor-pointer content-center font-semibold text-fg">How levels are set</summary>
              <ul className="space-y-1.5 pb-3">
                <li>
                  <span className="font-semibold text-accent">Core favourite</span>: in all three rankings (4 weeks, 6 months and all time). Set to “Love”.
                </li>
                <li>
                  <span className="font-semibold text-accent">Long-time fan</span>: in your all-time top artists plus at least one other range. Becomes at least
                  “Like” and always stays on your list, even after you stop listening.
                </li>
                <li>
                  <span className="font-semibold text-fg">Steady favourite</span>: in your 6-month or all-time ranking. Set to “Like”.
                </li>
                <li>
                  <span className="font-semibold text-fg">In rotation</span>: only in the last 4 weeks. Set to “Curious” and removed again when Spotify stops
                  ranking them, unless you pin them or set a level yourself.
                </li>
                <li>Automatic levels only ever go up. Levels you choose yourself are never changed.</li>
              </ul>
            </details>
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
