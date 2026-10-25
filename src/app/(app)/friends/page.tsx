import type { Metadata } from "next";
import Link from "next/link";
import { ArtistCard } from "@/components/ArtistCard";
import { FriendActivityItem } from "@/components/FriendAvatarStack";
import { InviteButton, RequestResponse } from "@/components/FriendActions";
import { IconChevronRight, IconFriends } from "@/components/icons";
import { Avatar } from "@/components/RemoteImage";
import { EmptyState } from "@/components/states";
import { PageHeader, SectionHeader } from "@/components/ui";
import { formatRelativePast } from "@/lib/format";
import { createClient, requireUser } from "@/lib/supabase/server";
import { getEventSummaries } from "@/server/data/events";

export const metadata: Metadata = { title: "Friends" };

export default async function FriendsPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const [{ data: friends }, { data: requests }, { data: activity }, { data: suggestions }] = await Promise.all([
    supabase.rpc("get_friends"),
    supabase.rpc("get_friend_requests"),
    supabase.rpc("get_friend_activity", { p_limit: 20 }),
    supabase.rpc("get_friend_artist_suggestions", { p_limit: 9 }),
  ]);
  const events = await getEventSummaries(supabase, user.id, [...new Set((activity ?? []).map((a) => a.event_id))]);
  const titles = new Map(events.map((e) => [e.id, e.title]));
  const incoming = (requests ?? []).filter((r) => r.incoming);
  const outgoing = (requests ?? []).filter((r) => !r.incoming);

  return (
    <div className="space-y-8">
      <PageHeader title="Friends" subtitle="Only accepted friends see your artists and plans" />

      {incoming.length ? (
        <section aria-labelledby="requests">
          <SectionHeader id="requests" title="Friend requests" />
          <ul className="space-y-2">
            {incoming.map((r) => (
              <li key={r.friendship_id} className="flex items-center gap-3 rounded-lg bg-surface p-3">
                <Avatar src={r.avatar_url} name={r.display_name} size={44} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-fg">{r.display_name}</p>
                  <p className="text-meta text-fg-muted">{formatRelativePast(r.created_at)}</p>
                </div>
                <RequestResponse friendshipId={r.friendship_id} name={r.display_name} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {!friends?.length ? (
        <EmptyState
          decorative
          icon={<IconFriends />}
          title="Concerts are better together"
          body="Invite friends with a private link. Once they accept, you'll see the artists you share and who's going to what."
          action={<InviteButton />}
        />
      ) : (
        <>
          <section aria-labelledby="friend-list">
            <SectionHeader id="friend-list" title={`Your friends (${friends.length})`} />
            <ul className="divide-y divide-line rounded-lg bg-surface px-3">
              {friends.map((f) => (
                <li key={f.friend_id} className="relative flex items-center gap-3 py-3">
                  <Avatar src={f.avatar_url} name={f.display_name} size={44} />
                  <div className="min-w-0 flex-1">
                    <Link href={`/friends/${f.friend_id}`} className="block truncate font-semibold text-fg after:absolute after:inset-0 after:content-['']">
                      {f.display_name}
                    </Link>
                    <p className="text-meta text-fg-secondary">
                      {f.shared_artist_count > 0 ? `${f.shared_artist_count} shared artist${f.shared_artist_count === 1 ? "" : "s"}` : "No shared artists yet"}
                    </p>
                  </div>
                  <IconChevronRight className="text-fg-muted" />
                </li>
              ))}
            </ul>
          </section>
          <InviteButton />
        </>
      )}

      {outgoing.length ? (
        <section aria-labelledby="pending">
          <SectionHeader id="pending" title="Waiting for a response" />
          <ul className="space-y-2">
            {outgoing.map((r) => (
              <li key={r.friendship_id} className="flex items-center gap-3 text-support text-fg-secondary">
                <Avatar src={r.avatar_url} name={r.display_name} size={32} /> {r.display_name}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {activity?.length ? (
        <section aria-labelledby="activity">
          <SectionHeader id="activity" title="Friends' plans" />
          <ul className="space-y-2">
            {activity.map((a) => (
              <FriendActivityItem
                key={`${a.user_id}-${a.event_id}`}
                friend={{ id: a.user_id, name: a.display_name, avatarUrl: a.avatar_url }}
                intention={a.intention}
                eventId={a.event_id}
                eventTitle={titles.get(a.event_id) ?? "A concert"}
                when={a.updated_at}
              />
            ))}
          </ul>
        </section>
      ) : friends?.length ? (
        <p className="text-support text-fg-secondary">No plans shared by friends yet. Mark yourself interested in a concert to get things started.</p>
      ) : null}

      {suggestions?.length ? (
        <section aria-labelledby="suggestions">
          <SectionHeader id="suggestions" title="Artists your friends love" />
          <ul className="grid grid-cols-3 gap-3">
            {suggestions.map((s) => (
              <li key={s.artist_id}>
                <ArtistCard artist={{ id: s.artist_id, name: s.canonical_name, imageUrl: s.image_url, pinned: false }} />
                <p className="mt-0.5 text-meta text-fg-muted">
                  Loved by {s.friend_count} {s.friend_count === 1 ? "friend" : "friends"}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
