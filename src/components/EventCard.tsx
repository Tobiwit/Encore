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
    <article
      className={cn(
        "group relative isolate flex min-h-[8.5rem] overflow-hidden rounded-lg bg-surface transition-colors hover:bg-[#262123]",
        inactive && "opacity-80",
      )}
    >
      {/* Square picture spanning the card's full height; its right edge breaks into glass flutes. */}
      <div className="absolute inset-y-0 left-0 aspect-square">
        <RemoteImage src={image} alt="" rounded="rounded-none" className="size-full" fade="seam" prism="md" prismAt="seam" />
      </div>
      <div className="relative min-w-0 flex-1 py-2.5 pl-32 pr-1">
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
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <EventStatus compact lifecycle={event.lifecycle} sales={event.sales} timezone={event.timezone} lastVerifiedAt={event.lastVerifiedAt} />
          {event.friends.length ? <FriendAvatarStack friends={event.friends} size={24} /> : null}
        </div>
      </div>
      <div className="relative z-10 shrink-0 self-start p-1">
        <SaveButton eventId={event.id} saved={event.saved} title={event.title} />
      </div>
    </article>
  );
}
