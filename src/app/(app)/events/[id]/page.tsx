import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/BackLink";
import { DismissEventButton } from "@/components/DismissEventButton";
import { FriendSocialLine } from "@/components/FriendAvatarStack";
import { EventStatus } from "@/components/EventStatus";
import { IconExternal, IconMapPin } from "@/components/icons";
import { IntentionControl } from "@/components/IntentionControl";
import { Avatar, RemoteImage } from "@/components/RemoteImage";
import { SaleCountdown } from "@/components/SaleCountdown";
import { SaveButton } from "@/components/SaveButton";
import { InlineNotice } from "@/components/states";
import { TicketPrice } from "@/components/TicketPrice";
import { buttonClass, SectionHeader } from "@/components/ui";
import { dedupeSales, deriveSaleState, isStale } from "@/lib/events";
import { formatDateTime, formatDistance, formatEventDate, formatRelativePast } from "@/lib/format";
import { createClient, requireUser } from "@/lib/supabase/server";
import { getEventDetail } from "@/server/data/events";

export const metadata: Metadata = { title: "Concert" };

const PROVIDER_NAME: Record<string, string> = { ticketmaster: "Ticketmaster", eventim: "EVENTIM" };
const INTENTION_LABEL: Record<string, string> = { interested: "Interested", going: "Going", looking_for_company: "Looking for company" };
const FIELD_LABEL: Record<string, string> = { starts_at: "Date/time", lifecycle_status: "Status" };

export default async function EventPage({ params }: PageProps<"/events/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const user = await requireUser();
  const supabase = await createClient();
  const event = await getEventDetail(supabase, user.id, id);
  if (!event) notFound();

  const sales = dedupeSales(event.sales);
  const state = deriveSaleState(event.lifecycle, event.sales);
  const stale = isStale(event.lastVerifiedAt);
  const inactive = state.kind === "inactive";
  const primaryProvider = event.providers.find((p) => p.is_primary) ?? event.providers[0];
  const providerName = primaryProvider ? (PROVIDER_NAME[primaryProvider.provider] ?? primaryProvider.provider) : null;
  const pricedOffers = event.offers.filter((o) => o.currency && (o.min_price !== null || o.max_price !== null));
  const unverified = event.artists.length > 0 && event.artists.every((a) => a.matchConfidence < 0.9);

  return (
    <article className="space-y-8 pb-6">
      <div className="pt-4">
        <BackLink fallback="/discover" />
      </div>

      <header>
        <div className="-mx-4 sm:mx-0">
          <RemoteImage
            src={event.imageUrl ?? event.artists[0]?.imageUrl}
            alt=""
            rounded="rounded-none sm:rounded-t-xl"
            className="aspect-[16/9] w-full"
            fade="bottom"
            prism="lg"
            priority
          />
        </div>
        {/* Content rises into the picture's faded lower edge. */}
        <div className="relative -mt-12 space-y-4">
          {/* Dark backing keeps the translucent status tint legible over the picture's faded edge. */}
          <span className="inline-flex rounded-full bg-bg/85">
            <EventStatus lifecycle={event.lifecycle} sales={event.sales} timezone={event.timezone} lastVerifiedAt={event.lastVerifiedAt} />
          </span>
          <h1 className="text-page font-semibold">{event.title}</h1>
          {event.artists.length ? (
            <ul className="flex flex-wrap gap-2">
              {event.artists.map((a) => (
                <li key={a.id}>
                  <Link href={`/artists/${a.id}`} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-surface py-1 pl-1 pr-4 font-semibold text-fg hover:bg-surface-elevated">
                    <RemoteImage src={a.imageUrl} alt="" rounded="rounded-full" className="size-9" />
                    {a.name}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
          <dl className="space-y-2 text-body">
            <div>
              <dt className="sr-only">Date</dt>
              <dd className="tabular font-semibold text-fg">
                {formatEventDate(event.startsAt, event.timezone, { timeTba: event.startTimeTba, startDateLocal: event.startDateLocal, withYear: true })}
              </dd>
              {event.timezone && event.startsAt && !event.startTimeTba ? <dd className="text-meta text-fg-muted">Local time at the venue ({event.timezone})</dd> : null}
            </div>
            <div className="flex items-start gap-2 text-fg-secondary">
              <IconMapPin size={18} className="mt-0.5 shrink-0" />
              <dd>
                <span className="block font-semibold text-fg">{event.venueName ?? "Venue to be announced"}</span>
                {event.address ? <span className="block">{event.address}</span> : null}
                {event.distanceKm !== null ? <span className="block text-support text-fg-muted">{formatDistance(event.distanceKm)} from your area</span> : null}
              </dd>
            </div>
          </dl>
        </div>
      </header>

      {event.lifecycle === "cancelled" ? (
        <InlineNotice tone="error">This event was cancelled. Contact the ticket provider about refunds — Encore doesn&apos;t sell or refund tickets.</InlineNotice>
      ) : event.lifecycle === "postponed" ? (
        <InlineNotice>This event has been postponed. We&apos;ll notify you when a new date is announced.</InlineNotice>
      ) : null}
      {unverified ? (
        <InlineNotice tone="neutral">We matched this show to your artist by name only, so we won&apos;t send automatic alerts for it. Double-check the line-up.</InlineNotice>
      ) : null}

      <div className="flex gap-2">
        <IntentionControl eventId={event.id} current={event.myIntention} defaultVisibility={event.defaultVisibility} disabled={event.lifecycle === "cancelled"} />
        <SaveButton eventId={event.id} saved={event.saved} title={event.title} withLabel />
      </div>

      {event.friends.length || event.friendFans.length ? (
        <section aria-labelledby="friends-going">
          <SectionHeader id="friends-going" title="Friends" />
          <FriendSocialLine friends={event.friends} fans={event.friendFans} ring="ring-bg" className="mb-3" />
          <ul className="space-y-2">
            {event.friends.map((f) => (
              <li key={f.id} className="flex items-center gap-3 rounded-lg bg-surface p-3">
                <Avatar src={f.avatarUrl} name={f.name} size={40} />
                <div className="min-w-0 flex-1">
                  <Link href={`/friends/${f.id}`} className="font-semibold text-fg hover:underline">
                    {f.name}
                  </Link>
                  <p className="text-support text-fg-secondary">{INTENTION_LABEL[f.intention ?? ""] ?? "Interested"}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="tickets">
        <SectionHeader id="tickets" title="Tickets" />
        <div className="space-y-3">
          {state.kind === "upcoming" && !stale ? (
            <SaleCountdown
              emphasis
              startsAt={state.startsAt.toISOString()}
              timezone={event.timezone}
              label={state.sale.sale_type === "presale" ? `${state.sale.sale_name ?? "Presale"} starts` : "General sale starts"}
            />
          ) : null}

          {sales.length ? (
            <ul className="divide-y divide-line rounded-lg bg-surface px-4">
              {sales.map((s) => (
                <li key={s.id} className="flex items-start justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-fg">{s.sale_type === "presale" ? (s.sale_name ?? "Presale") : "General sale"}</p>
                    {s.ends_at ? <p className="tabular text-meta text-fg-muted">Ends {formatDateTime(s.ends_at, event.timezone)}</p> : null}
                  </div>
                  <p className="tabular shrink-0 text-right text-support text-fg-secondary">
                    {s.starts_at && !s.start_time_unknown ? formatDateTime(s.starts_at, event.timezone) : "Start time not announced"}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-lg bg-surface px-4 py-3 text-support text-fg-secondary">The provider hasn&apos;t published sale dates for this event yet.</p>
          )}

          <div className="rounded-lg bg-surface px-4 py-3">
            {pricedOffers.length ? (
              <ul className="space-y-2">
                {pricedOffers.map((o, i) => (
                  <li key={i}>
                    <TicketPrice
                      detailed
                      price={{ min: o.min_price, max: o.max_price, currency: o.currency!, offerType: o.offer_type, isResale: o.is_resale }}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <TicketPrice price={null} />
            )}
          </div>

          {event.eventUrl && !inactive ? (
            <a href={event.eventUrl} target="_blank" rel="noopener noreferrer" className={buttonClass("primary", "lg", "w-full")}>
              {providerName ? `Tickets on ${providerName}` : "Official ticket page"} <IconExternal size={18} />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          ) : null}
          <p className="text-meta text-fg-muted">
            Encore links to official ticket providers and doesn&apos;t sell tickets. A scheduled sale doesn&apos;t guarantee availability.
            {primaryProvider ? ` Updated ${formatRelativePast(primaryProvider.last_synced_at)} from ${providerName}.` : ""}
          </p>
          {stale ? <InlineNotice>This information hasn&apos;t been refreshed for a few days and may be out of date. Check the provider before buying.</InlineNotice> : null}
        </div>
      </section>

      {event.changes.length ? (
        <section aria-labelledby="changes">
          <SectionHeader id="changes" title="Recent changes" />
          <ul className="space-y-1 text-support text-fg-secondary">
            {event.changes.map((c, i) => (
              <li key={i}>
                <span className="text-fg">{FIELD_LABEL[c.field] ?? (c.field.startsWith("sale:") ? "Sale time" : c.field)}</span> changed{" "}
                {formatRelativePast(c.detected_at)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="flex justify-center">
        <DismissEventButton eventId={event.id} />
      </div>
    </article>
  );
}
