import Link from "next/link";
import { formatDistance, formatEventDate } from "@/lib/format";
import type { EventSummary } from "@/lib/types";
import { EventStatus } from "./EventStatus";
import { FriendSocialLine } from "./FriendAvatarStack";
import { IconMapPin } from "./icons";
import { RemoteImage } from "./RemoteImage";
import { SaveButton } from "./SaveButton";
import { TicketPrice } from "./TicketPrice";
import { cn } from "./ui";

/**
 * Event card for feeds. The picture is borderless: it bleeds to the card edge, carries the
 * prism-glass corner, and fades into the card surface where the text begins. The whole card
 * links to the detail page; the save toggle is a separate control (not nested inside the link).
 */
export function EventCard({ event, variant = "row" }: { event: EventSummary; variant?: "row" | "feature" }) {
  const dateLabel = formatEventDate(event.startsAt, event.timezone, { timeTba: event.startTimeTba, startDateLocal: event.startDateLocal });
  const place = [event.venueName, event.city].filter(Boolean).join(", ");
  const distance = formatDistance(event.distanceKm);
  const inactive = event.lifecycle === "cancelled" || event.lifecycle === "postponed" || event.lifecycle === "ended";
  const image = event.imageUrl ?? event.artists[0]?.imageUrl;

  if (variant === "feature") {
    return (
      <article className="group relative isolate overflow-hidden rounded-xl bg-surface">
        <RemoteImage src={image} alt="" rounded="rounded-none" className="aspect-[16/9] w-full" fade="bottom" prism="lg" priority />
        <div className="relative -mt-12 space-y-3 px-4 pb-4">
          <span className="inline-flex rounded-full bg-surface/90">
            <EventStatus lifecycle={event.lifecycle} sales={event.sales} timezone={event.timezone} lastVerifiedAt={event.lastVerifiedAt} />
          </span>
          <h3 className="text-section font-semibold text-balance text-fg">
            <Link href={`/events/${event.id}`} className="after:absolute after:inset-0 after:content-['']">
              {event.title}
            </Link>
          </h3>
          <p className="tabular text-support text-fg-secondary">{dateLabel}</p>
          <p className="flex items-center gap-1 text-support text-fg-secondary">
            <IconMapPin size={16} /> {place || "Venue to be announced"}
            {distance ? <span className="text-fg-muted"> · {distance}</span> : null}
          </p>
          <FriendSocialLine friends={event.friends} fans={event.friendFans} />
          <div className="relative z-10 flex items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-3">
              <TicketPrice price={event.price} />
            </div>
            <SaveButton eventId={event.id} saved={event.saved} title={event.title} />
          </div>
        </div>
      </article>
    );
  }

  const hasSocial = event.friends.length > 0 || event.friendFans.length > 0;
  return (
    <article
      className={cn(
        "group relative isolate overflow-hidden rounded-lg bg-surface transition-colors hover:bg-[#262123]",
        // The glass seam paints its surface flutes in the card's current background colour.
        "[--seam-surface:var(--color-surface)] hover:[--seam-surface:#262123]",
        inactive && "opacity-80",
      )}
    >
      <div className="relative flex min-h-[8.5rem]">
        {/* Fixed square picture; its right edge breaks into glass flutes that reach into the card. */}
        <div className="absolute left-0 top-0 size-[8.5rem]">
          <RemoteImage src={image} alt="" rounded="rounded-none" className="size-full" fade="seam" prism="md" prismAt="seam" />
        </div>
        {/* Text starts past the glass (picture 136px + 12px of glass reaching into the card). */}
        <div className="relative min-w-0 flex-1 py-2.5 pl-[9.25rem] pr-1">
          <h3 className="line-clamp-2 text-card font-semibold text-fg">
            <Link href={`/events/${event.id}`} className="after:absolute after:inset-0 after:rounded-lg after:content-['']">
              {event.title}
            </Link>
          </h3>
          <p className="tabular mt-0.5 text-support text-fg-secondary">{dateLabel}</p>
          <p className="truncate text-support text-fg-muted">
            {place || "Venue to be announced"}
            {distance ? ` · ${distance}` : ""}
          </p>
          <div className="mt-1.5">
            <EventStatus compact lifecycle={event.lifecycle} sales={event.sales} timezone={event.timezone} lastVerifiedAt={event.lastVerifiedAt} />
          </div>
        </div>
        <div className="relative z-10 shrink-0 self-start p-1">
          <SaveButton eventId={event.id} saved={event.saved} title={event.title} />
        </div>
      </div>
      {hasSocial ? (
        <div className="border-t border-line/70 px-3 py-2">
          <FriendSocialLine friends={event.friends} fans={event.friendFans} />
        </div>
      ) : null}
    </article>
  );
}
