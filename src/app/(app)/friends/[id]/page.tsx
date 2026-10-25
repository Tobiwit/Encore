import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArtistCard, SharedArtistsList } from "@/components/ArtistCard";
import { BackLink } from "@/components/BackLink";
import { EventCard } from "@/components/EventCard";
import { FriendManagement } from "@/components/FriendActions";
import { GlassPanel } from "@/components/GeometricBackground";
import { Avatar } from "@/components/RemoteImage";
import { SectionHeader } from "@/components/ui";
import { createClient, requireUser } from "@/lib/supabase/server";
import type { EventSummary } from "@/lib/types";
import { getEventSummaries } from "@/server/data/events";

export const metadata: Metadata = { title: "Friend" };

function upcomingOnly(events: EventSummary[]) {
  const cutoff = Date.now() - 12 * 3600_000;
  return events.filter((e) => !e.startsAt || Date.parse(e.startsAt) > cutoff);
}

export default async function FriendPage({ params }: PageProps<"/friends/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const user = await requireUser();
  const supabase = await createClient();

  const { data: friends } = await supabase.rpc("get_friends");
  const friend = friends?.find((f) => f.friend_id === id);
  if (!friend) notFound();

  // RLS: their fan list and intentions only come back if they share them with friends.
  const [{ data: theirs }, { data: mine }, { data: plans }] = await Promise.all([
    supabase
      .from("user_artists")
      .select("artist_id, interest_level, artist:artists(id, canonical_name, image_url)")
      .eq("user_id", id)
      .eq("is_dismissed", false),
    supabase.from("user_artists").select("artist_id").eq("user_id", user.id).eq("is_dismissed", false),
    supabase.from("event_interests").select("event_id, intention").eq("user_id", id),
  ]);

  const mineSet = new Set((mine ?? []).map((m) => m.artist_id));
  const theirArtists = (theirs ?? []).filter((t) => t.artist).map((t) => ({ id: t.artist!.id, name: t.artist!.canonical_name, imageUrl: t.artist!.image_url, interest: t.interest_level }));
  const shared = theirArtists.filter((a) => mineSet.has(a.id));
  const discover = theirArtists.filter((a) => !mineSet.has(a.id) && a.interest !== "curious").slice(0, 9);
  const events = upcomingOnly(await getEventSummaries(supabase, user.id, (plans ?? []).map((p) => p.event_id)));
  const listHidden = (theirs ?? []).length === 0 && friend.shared_artist_count === 0;

  return (
    <article className="space-y-8 pb-6">
      <div className="pt-4">
        <BackLink fallback="/friends" />
      </div>
      <GlassPanel>
        <div className="flex items-center gap-4 p-5">
          <Avatar src={friend.avatar_url} name={friend.display_name} size={72} />
          <div className="min-w-0">
            <h1 className="truncate text-page font-semibold">{friend.display_name}</h1>
            <p className="text-support text-fg-secondary">
              {shared.length ? `${shared.length} artist${shared.length === 1 ? "" : "s"} in common` : "No artists in common yet"}
            </p>
          </div>
        </div>
      </GlassPanel>

      <section aria-labelledby="shared">
        <SectionHeader id="shared" title="You both follow" />
        <SharedArtistsList
          artists={shared.slice(0, 12)}
          emptyText={listHidden ? `${friend.display_name} keeps their fan list private.` : "No shared artists yet — explore theirs below."}
        />
      </section>

      {discover.length ? (
        <section aria-labelledby="discover">
          <SectionHeader id="discover" title={`Discover through ${friend.display_name.split(" ")[0]}`} />
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {discover.map((a) => (
              <li key={a.id}>
                <ArtistCard artist={{ ...a, pinned: false }} />
                <p className="mt-0.5 text-meta text-fg-muted">{a.interest === "love" ? "They love this" : "They like this"}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="plans">
        <SectionHeader id="plans" title="Their plans" />
        {events.length ? (
          <ul className="space-y-3">
            {events.map((e) => (
              <li key={e.id}>
                <EventCard event={e} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-support text-fg-secondary">No concert plans shared with you.</p>
        )}
      </section>

      <FriendManagement userId={friend.friend_id} name={friend.display_name} />
    </article>
  );
}
