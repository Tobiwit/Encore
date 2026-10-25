import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FollowArtistButton, NotifyToggle, PinToggle, RemoveArtistButton } from "@/components/ArtistActions";
import { ArtistInterestControl } from "@/components/ArtistInterestControl";
import { BackLink } from "@/components/BackLink";
import { EventCard } from "@/components/EventCard";
import { FriendAvatarStack } from "@/components/FriendAvatarStack";
import { GeometricBackground } from "@/components/GeometricBackground";
import { MusicPreviewPlayer } from "@/components/MusicPreviewPlayer";
import { RemoteImage } from "@/components/RemoteImage";
import { EmptyState } from "@/components/states";
import { SectionHeader } from "@/components/ui";
import { createClient, requireUser } from "@/lib/supabase/server";
import { getArtistDetail } from "@/server/data/artists";

export const metadata: Metadata = { title: "Artist" };

const RANGE_LABEL: Record<string, string> = { short_term: "last 4 weeks", medium_term: "last 6 months", long_term: "all time" };
const SOURCE_LABEL: Record<string, string> = {
  spotify_import: "Imported from your Spotify top artists",
  manual: "Added by you",
  friend_suggestion: "Added from a friend's suggestion",
  discovery: "Added while discovering",
};

export default async function ArtistPage({ params }: PageProps<"/artists/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const user = await requireUser();
  const supabase = await createClient();
  const detail = await getArtistDetail(supabase, user.id, id);
  if (!detail) notFound();
  const { artist, mine, events, friends, ranks } = detail;

  const rankText = [...ranks.entries()].map(([range, rank]) => `#${rank} ${RANGE_LABEL[range] ?? range}`).join(" · ");

  return (
    <article className="space-y-8 pb-6">
      <div className="pt-4">
        <BackLink fallback="/artists" />
      </div>

      <header className="relative isolate overflow-hidden rounded-xl bg-surface">
        <GeometricBackground />
        <div className="glass relative flex flex-col items-center gap-4 rounded-xl px-5 pb-6 pt-8 text-center">
          <RemoteImage src={artist.image_url} alt={`Photo of ${artist.canonical_name}`} rounded="rounded-full" className="size-40 ring-4 ring-bg/60" priority />
          <div>
            <h1 className="text-page font-semibold">{artist.canonical_name}</h1>
            {artist.genres.length ? <p className="mt-1 text-support text-fg-secondary">{artist.genres.slice(0, 3).join(" · ")}</p> : null}
            {rankText ? <p className="tabular mt-1 text-meta text-fg-muted">Your Spotify top artists: {rankText}</p> : null}
          </div>
          {friends.length ? (
            <div className="flex items-center gap-2 text-support text-fg-secondary">
              <FriendAvatarStack friends={friends} />
              {friends.length === 1 ? `${friends[0].name} likes them too` : `${friends.length} friends like them too`}
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
          <p className="text-meta text-fg-muted">{SOURCE_LABEL[mine.added_source]}</p>
        </section>
      ) : (
        <section className="space-y-2 rounded-lg bg-surface p-4">
          <p className="text-support text-fg-secondary">
            {detail.wasRemoved ? "You removed this artist from your fan list." : "This artist isn't on your fan list yet."}
          </p>
          <FollowArtistButton artistId={artist.id} source={friends.length ? "friend_suggestion" : "discovery"} />
        </section>
      )}

      <section aria-labelledby="concerts">
        <SectionHeader id="concerts" title="Upcoming concerts" />
        {events.length ? (
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
              detail.ticketmasterLinked
                ? "Nothing announced right now. We check regularly and will alert you when a show is announced."
                : "We haven't found this artist with our ticket providers yet. We'll keep looking."
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
