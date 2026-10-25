import type { Metadata } from "next";
import Link from "next/link";
import { ArtistCard } from "@/components/ArtistCard";
import { ConcertSearchStatus, getConcertSearchStatus } from "@/components/ConcertSearchStatus";
import { EventCard } from "@/components/EventCard";
import { FriendActivityItem } from "@/components/FriendAvatarStack";
import { IconBell, IconMapPin, IconPlus } from "@/components/icons";
import { SaleCountdown } from "@/components/SaleCountdown";
import { EmptyState, InlineNotice } from "@/components/states";
import { ButtonLink, SectionHeader } from "@/components/ui";
import { deriveSaleState } from "@/lib/events";
import { createClient, requireUser } from "@/lib/supabase/server";
import { getDiscoverFeed, getEventSummaries } from "@/server/data/events";

export const metadata: Metadata = { title: "Discover" };

function greeting(now: Date, timezone: string) {
  let h = now.getUTCHours();
  try {
    h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: timezone }).format(now));
  } catch {}
  return h < 5 ? "Good night" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default async function DiscoverPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const [feed, { data: profile }, { data: activity }, { data: suggestions }, { count: unread }] = await Promise.all([
    getDiscoverFeed(supabase, user.id),
    supabase.from("users").select("display_name, timezone").eq("id", user.id).single(),
    supabase.rpc("get_friend_activity", { p_limit: 6 }),
    supabase.rpc("get_friend_artist_suggestions", { p_limit: 6 }),
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("read_at", null),
  ]);

  const searchStatus = await getConcertSearchStatus(supabase);
  const activityEvents = await getEventSummaries(supabase, user.id, [...new Set((activity ?? []).map((a) => a.event_id))]);
  const activityTitles = new Map(activityEvents.map((e) => [e.id, e.title]));

  const home = feed.locations.find((l) => l.isHome) ?? feed.locations[0];
  const featured = feed.saleSoon[0];
  const featuredSale = featured ? deriveSaleState(featured.lifecycle, featured.sales) : null;
  const hasFeatured = featuredSale?.kind === "upcoming";
  const firstName = profile?.display_name.split(" ")[0] ?? "";
  const nothingYet = !feed.saleSoon.length && !feed.newlyAnnounced.length && !feed.upcoming.length;

  return (
    <div className="space-y-10">
      <header className="flex items-start justify-between gap-4 pt-6">
        <div className="min-w-0">
          <h1 className="text-page font-semibold">
            {greeting(new Date(), profile?.timezone ?? "Europe/Berlin")}
            {firstName ? `, ${firstName}` : ""}
          </h1>
          <Link href="/profile/locations" className="mt-1 inline-flex min-h-11 items-center gap-1.5 rounded-full text-support text-fg-secondary hover:text-fg">
            <IconMapPin size={16} />
            {home
              ? `${home.cityName} · ${home.radiusKm} km${feed.locations.length > 1 ? ` · +${feed.locations.length - 1} more` : ""}`
              : "Set your city"}
          </Link>
        </div>
        <Link
          href="/notifications"
          aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
          className="relative inline-flex size-11 items-center justify-center rounded-full text-fg-secondary hover:bg-surface hover:text-fg"
        >
          <IconBell />
          {unread ? <span className="absolute right-2.5 top-2.5 size-2 rounded-full bg-accent" aria-hidden="true" /> : null}
        </Link>
      </header>

      {!feed.locations.length ? (
        <InlineNotice tone="neutral">
          <IconMapPin size={18} className="mt-0.5 shrink-0" />
          <span>
            Showing concerts everywhere we track.{" "}
            <Link href="/profile/locations" className="font-semibold text-fg underline underline-offset-2">
              Choose a city
            </Link>{" "}
            to see what&apos;s near you and get local sale reminders.
          </span>
        </InlineNotice>
      ) : null}

      {feed.followedCount === 0 ? (
        <EmptyState
          decorative
          title="Start with the artists you love"
          body="Import your top artists from Spotify or add them by hand. We'll watch for concerts and ticket sales."
          action={<ButtonLink href="/artists/add">Add artists</ButtonLink>}
        />
      ) : nothingYet ? (
        <div className="space-y-3">
          <EmptyState
            decorative
            title="No upcoming concerts found yet"
            body={
              searchStatus && searchStatus.checked < searchStatus.followed
                ? "We're still looking up your artists on Ticketmaster. Concerts appear here as soon as we find them."
                : `None of your artists has an announced show${home ? ` near ${home.cityName}` : ""} right now. We check daily and will alert you when that changes.`
            }
            action={
              <ButtonLink href="/artists" variant="secondary">
                Review your artists
              </ButtonLink>
            }
          />
          {searchStatus ? <ConcertSearchStatus status={searchStatus} /> : null}
        </div>
      ) : null}

      {featured && featuredSale?.kind === "upcoming" ? (
        <section aria-labelledby="next-sale">
          <SectionHeader id="next-sale" title="Next on-sale" />
          <div className="space-y-3">
            <EventCard event={featured} variant="feature" />
            <SaleCountdown
              emphasis
              startsAt={featuredSale.startsAt.toISOString()}
              timezone={featured.timezone}
              label={featuredSale.sale.sale_type === "presale" ? (featuredSale.sale.sale_name ?? "Presale") : "General sale"}
            />
          </div>
        </section>
      ) : null}

      {feed.saleSoon.length > (hasFeatured ? 1 : 0) ? (
        <section aria-labelledby="sales-soon">
          <SectionHeader id="sales-soon" title="Sales coming up" />
          <ul className="space-y-3">
            {feed.saleSoon.slice(hasFeatured ? 1 : 0, 8).map((e) => (
              <li key={e.id}>
                <EventCard event={e} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {feed.newlyAnnounced.length ? (
        <section aria-labelledby="new-shows">
          <SectionHeader id="new-shows" title="Just announced" />
          <ul className="space-y-3">
            {feed.newlyAnnounced.slice(0, 8).map((e) => (
              <li key={e.id}>
                <EventCard event={e} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {activity?.length ? (
        <section aria-labelledby="friend-plans">
          <SectionHeader
            id="friend-plans"
            title="Friends' plans"
            action={
              <Link href="/friends" className="inline-flex min-h-11 items-center text-support font-semibold text-accent">
                See all
              </Link>
            }
          />
          <ul className="space-y-2">
            {activity.slice(0, 4).map((a) => (
              <FriendActivityItem
                key={`${a.user_id}-${a.event_id}`}
                friend={{ id: a.user_id, name: a.display_name, avatarUrl: a.avatar_url }}
                intention={a.intention}
                eventId={a.event_id}
                eventTitle={activityTitles.get(a.event_id) ?? "A concert"}
                when={a.updated_at}
              />
            ))}
          </ul>
        </section>
      ) : null}

      {feed.upcoming.length ? (
        <section aria-labelledby="upcoming">
          <SectionHeader id="upcoming" title="Upcoming concerts" />
          <ul className="space-y-3">
            {feed.upcoming.slice(0, 20).map((e) => (
              <li key={e.id}>
                <EventCard event={e} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {suggestions?.length ? (
        <section aria-labelledby="from-friends">
          <SectionHeader id="from-friends" title="Loved by your friends" />
          <ul className="grid grid-cols-3 gap-3">
            {suggestions.slice(0, 6).map((s) => (
              <li key={s.artist_id}>
                <ArtistCard artist={{ id: s.artist_id, name: s.canonical_name, imageUrl: s.image_url, pinned: false }} />
                <p className="mt-0.5 text-meta text-fg-muted">
                  {s.friend_count} {s.friend_count === 1 ? "friend" : "friends"}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {feed.inactive.length ? (
        <section aria-labelledby="changed">
          <SectionHeader id="changed" title="Cancelled or postponed" />
          <ul className="space-y-3">
            {feed.inactive.slice(0, 5).map((e) => (
              <li key={e.id}>
                <EventCard event={e} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {feed.followedCount > 0 ? (
        <div className="flex justify-center">
          <ButtonLink href="/artists/add" variant="ghost" size="sm">
            <IconPlus size={18} /> Add more artists
          </ButtonLink>
        </div>
      ) : null}
    </div>
  );
}
