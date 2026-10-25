import Link from "next/link";
import { formatDistance, formatEventDate } from "@/lib/format";
import type { EventSummary } from "@/lib/types";
import { EventStatus } from "./EventStatus";
import { FriendAvatarStack } from "./FriendAvatarStack";
import { IconMapPin } from "./icons";
import { RemoteImage } from "./RemoteImage";
import { SaveButton } from "./SaveButton";
import { TicketPrice } from "./TicketPrice";
import { cn } from "./ui";

/**
 * Compact event row for feeds. The whole card links to the detail page; the save toggle is a
 * separate control (not nested inside the link) so both remain keyboard and screen-reader friendly.
 */
export function EventCard({ event, variant = "row" }: { event: EventSummary; variant?: "row" | "feature" }) {
  const dateLabel = formatEventDate(event.startsAt, event.timezone, { timeTba: event.startTimeTba, startDateLocal: event.startDateLocal });
  const place = [event.venueName, event.city].filter(Boolean).join(", ");
  const distance = formatDistance(event.distanceKm);
  const inactive = event.lifecycle === "cancelled" || event.lifecycle === "postponed" || event.lifecycle === "ended";

  if (variant === "feature") {
    return (
      <article className="relative overflow-hidden rounded-xl bg-surface">
        <RemoteImage src={event.imageUrl} alt="" rounded="rounded-none" className="aspect-[16/9] w-full" priority />
        <div className="space-y-3 p-4">
          <EventStatus lifecycle={event.lifecycle} sales={event.sales} timezone={event.timezone} lastVerifiedAt={event.lastVerifiedAt} />
          <h3 className="text-section font-semibold text-fg">
            <Link href={`/events/${event.id}`} className="after:absolute after:inset-0 after:content-['']">
              {event.title}
            </Link>
          </h3>
          <p className="tabular text-support text-fg-secondary">{dateLabel}</p>
          <p className="flex items-center gap-1 text-support text-fg-secondary">
            <IconMapPin size={16} /> {place || "Venue to be announced"}
            {distance ? <span className="text-fg-muted"> · {distance}</span> : null}
          </p>
          <div className="relative z-10 flex items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-3">
              <TicketPrice price={event.price} />
              {event.friends.length ? <FriendAvatarStack friends={event.friends} /> : null}
            </div>
            <SaveButton eventId={event.id} saved={event.saved} title={event.title} />
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className={cn("relative flex gap-3 rounded-lg bg-surface p-3 transition-colors hover:bg-[#262123]", inactive && "opacity-80")}>
      <RemoteImage src={event.imageUrl ?? event.artists[0]?.imageUrl} alt="" className="size-[5.5rem] shrink-0" />
      <div className="min-w-0 flex-1">
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
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <EventStatus compact lifecycle={event.lifecycle} sales={event.sales} timezone={event.timezone} lastVerifiedAt={event.lastVerifiedAt} />
          {event.friends.length ? <FriendAvatarStack friends={event.friends} size={24} /> : null}
        </div>
      </div>
      <div className="relative z-10 -mr-1 -mt-1 self-start">
        <SaveButton eventId={event.id} saved={event.saved} title={event.title} />
      </div>
    </article>
  );
}
