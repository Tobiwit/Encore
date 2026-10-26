import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { FollowArtistButton, NotifyToggle, PinToggle, RemoveArtistButton } from "@/components/ArtistActions";
import { ArtistInterestControl } from "@/components/ArtistInterestControl";
import { AutoRefresh } from "@/components/AutoRefresh";
import { BackLink } from "@/components/BackLink";
import { EventCard } from "@/components/EventCard";
import { FriendAvatarStack, namesLabel } from "@/components/FriendAvatarStack";
import { GeometricBackground } from "@/components/GeometricBackground";
import { MusicPreviewPlayer } from "@/components/MusicPreviewPlayer";
import { RemoteImage } from "@/components/RemoteImage";
import { EmptyState } from "@/components/states";
import { TopTracks, TopTracksSkeleton } from "@/components/TopTracks";
import { SectionHeader } from "@/components/ui";
import { formatRelativePast } from "@/lib/format";
import { createClient, requireUser } from "@/lib/supabase/server";
import { getArtistDetail } from "@/server/data/artists";

export const metadata: Metadata = { title: "Artist" };
// "Add to fan list" continues a Ticketmaster lookup via after().
export const maxDuration = 60;

const RANGE_LABEL: Record<string, string> = { short_term: "last 4 weeks", medium_term: "last 6 months", long_term: "all time" };
const SOURCE_LABEL: Record<string, string> = {
  spotify_import: "Imported from your Spotify top artists",
  manual: "Added by you",
  friend_suggestion: "Added from a friend's suggestion",
  discovery: "Added while discovering",
};

/** "loves"/"love" when most of these friends love the artist, otherwise "likes"/"like". */
function fanVerb(friends: { interest: string }[]) {
  const loves = friends.filter((f) => f.interest === "love").length >= friends.length / 2;
  return loves ? (friends.length === 1 ? "loves" : "love") : friends.length === 1 ? "likes" : "like";
}

function isRecent(iso: string, withinMs: number) {
  return Date.now() - Date.parse(iso) < withinMs;
}

export default async function ArtistPage({ params }: PageProps<"/artists/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const user = await requireUser();
  const supabase = await createClient();
  const detail = await getArtistDetail(supabase, user.id, id);
  if (!detail) notFound();
  const { artist, mine, events, friends, ranks } = detail;

  // Just followed and not yet looked up: the lookup runs in the background, so poll briefly.
  const searching =
    Boolean(mine) &&
    !artist.events_refreshed_at &&
    !(artist.provider_lookup_at && !detail.ticketmaster) &&
    isRecent(mine!.created_at, 2 * 60_000);

  const rankText = [...ranks.entries()].map(([range, rank]) => `#${rank} ${RANGE_LABEL[range] ?? range}`).join(" · ");

  return (
    <article className="space-y-8 pb-6">
      <div className="pt-4">
        <BackLink fallback="/artists" />
      </div>

      <header className="relative isolate overflow-hidden rounded-xl bg-surface">
        <GeometricBackground />
        <div className="glass relative flex flex-col items-center gap-4 rounded-xl px-5 pb-6 pt-8 text-center">
          <RemoteImage src={artist.image_url} alt={`Photo of ${artist.canonical_name}`} rounded="rounded-xl" className="size-52 shadow-[0_12px_40px_-12px_rgb(0_0_0/0.6)]" prism="md" priority />
          <div>
            <h1 className="text-page font-semibold">{artist.canonical_name}</h1>
            {artist.genres.length ? <p className="mt-1 text-support text-fg-secondary">{artist.genres.slice(0, 3).join(" · ")}</p> : null}
            {rankText ? <p className="tabular mt-1 text-meta text-fg-muted">Your Spotify top artists: {rankText}</p> : null}
            {mine?.long_time_fan_since ? (
              <p className="mt-2 inline-flex rounded-full bg-accent-muted px-3 py-1 text-meta font-semibold text-fg">
                Long-time fan · stays on your list
              </p>
            ) : null}
          </div>
          {friends.length ? (
            <div className="flex items-center gap-2 text-support text-fg-secondary">
              <FriendAvatarStack friends={friends} />
              <span>
                <span className="font-semibold text-fg">{namesLabel(friends)}</span>{" "}
                {fanVerb(friends)} them too
              </span>
            </div>
          ) : null}
          <MusicPreviewPlayer previewUrl={null} spotifyUrl={detail.spotifyUrl} artistName={artist.canonical_name} />
        </div>
      </header>

      {mine ? (
        <section aria-labelledby="your-interest" className="space-y-3">
          <h2 id="your-interest" className="sr-only">
            Your interest
          </h2>
          <ArtistInterestControl artistId={artist.id} artistName={artist.canonical_name} value={mine.interest_level} />
          <div className="flex flex-wrap gap-2">
            <PinToggle artistId={artist.id} pinned={mine.is_pinned} />
            <NotifyToggle artistId={artist.id} enabled={mine.notify_enabled} />
          </div>
          <p className="text-meta text-fg-muted">
            {SOURCE_LABEL[mine.added_source]}
            {detail.ticketmaster && Number(detail.ticketmaster.match_confidence) < 0.9 ? " · Matched on Ticketmaster by name only, so no automatic alerts" : ""}
          </p>
        </section>
      ) : (
        <section className="space-y-2 rounded-lg bg-surface p-4">
          <p className="text-support text-fg-secondary">
            {detail.wasRemoved ? "You removed this artist from your fan list." : "This artist isn't on your fan list yet."}
          </p>
          <FollowArtistButton artistId={artist.id} source={friends.length ? "friend_suggestion" : "discovery"} />
        </section>
      )}

      <section aria-labelledby="popular-songs">
        <SectionHeader id="popular-songs" title="Popular songs" />
        <Suspense fallback={<TopTracksSkeleton />}>
          <TopTracks artistName={artist.canonical_name} />
        </Suspense>
      </section>

      <section aria-labelledby="concerts">
        <SectionHeader id="concerts" title="Upcoming concerts" />
        {searching ? <AutoRefresh everyMs={4000} /> : null}
        {searching && !events.length ? (
          <p role="status" className="rounded-lg bg-surface px-4 py-3 text-support text-fg-secondary">
            Looking for {artist.canonical_name} on Ticketmaster… concerts appear here in a few seconds.
          </p>
        ) : events.length ? (
          <ul className="space-y-3">
            {events.map((e) => (
              <li key={e.id}>
                <EventCard event={e} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title="No upcoming concerts"
            body={
              detail.ticketmaster && artist.events_refreshed_at
                ? `Nothing announced in your countries right now (checked ${formatRelativePast(artist.events_refreshed_at)}). We check daily and will alert you when a show is announced.`
                : detail.ticketmaster
                  ? "Found on Ticketmaster — their concert list will be fetched in the next run."
                  : artist.provider_lookup_at
                    ? "We couldn't find this artist on Ticketmaster. We'll look again in two weeks."
                    : "Not checked on Ticketmaster yet. This happens after your Spotify import and once a day."
            }
          />
        )}
      </section>

      {mine ? (
        <div className="flex justify-center pt-2">
          <RemoveArtistButton artistId={artist.id} name={artist.canonical_name} />
        </div>
      ) : null}
    </article>
  );
}
