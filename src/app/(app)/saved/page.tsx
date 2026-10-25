import type { Metadata } from "next";
import Link from "next/link";
import { EventCard } from "@/components/EventCard";
import { IconSaved } from "@/components/icons";
import { EmptyState } from "@/components/states";
import { ButtonLink, PageHeader, SectionHeader } from "@/components/ui";
import { deriveSaleState } from "@/lib/events";
import type { EventSummary } from "@/lib/types";
import { createClient, requireUser } from "@/lib/supabase/server";
import { getEventSummaries } from "@/server/data/events";

export const metadata: Metadata = { title: "Saved" };

/** Splits events into current and past relative to the request time. */
function splitByTime(events: EventSummary[]) {
  const now = Date.now();
  return { current: events.filter((e) => !isPast(e, now)), past: events.filter((e) => isPast(e, now)) };
}

function isPast(e: EventSummary, now: number) {
  if (e.lifecycle === "ended") return true;
  if (e.startsAt) return Date.parse(e.startsAt) < now - 12 * 3600_000;
  if (e.startDateLocal) return Date.parse(`${e.startDateLocal}T23:59:59Z`) < now;
  return false;
}

function List({ id, title, events, hint }: { id: string; title: string; events: EventSummary[]; hint?: string }) {
  if (!events.length) return null;
  return (
    <section aria-labelledby={id}>
      <SectionHeader id={id} title={title} />
      {hint ? <p className="-mt-2 mb-3 text-meta text-fg-muted">{hint}</p> : null}
      <ul className="space-y-3">
        {events.map((e) => (
          <li key={e.id}>
            <EventCard event={e} />
          </li>
        ))}
      </ul>
    </section>
  );
}

export default async function SavedPage({ searchParams }: PageProps<"/saved">) {
  const { past } = await searchParams;
  const showPast = past === "1";
  const user = await requireUser();
  const supabase = await createClient();

  const [{ data: saved }, { data: intentions }] = await Promise.all([
    supabase.from("saved_events").select("event_id, created_at").eq("user_id", user.id).order("created_at", { ascending: false }),
    supabase.from("event_interests").select("event_id, intention").eq("user_id", user.id),
  ]);

  const ids = [...new Set([...(saved ?? []).map((s) => s.event_id), ...(intentions ?? []).map((i) => i.event_id)])];
  const events = await getEventSummaries(supabase, user.id, ids);
  const byId = new Map(events.map((e) => [e.id, e]));
  const byStart = (a: EventSummary, b: EventSummary) => (a.startsAt ? Date.parse(a.startsAt) : Infinity) - (b.startsAt ? Date.parse(b.startsAt) : Infinity);

  const intentionOf = new Map((intentions ?? []).map((i) => [i.event_id, i.intention]));
  const { current, past: pastList } = splitByTime(events);
  const currentIds = new Set(current.map((e) => e.id));
  const pastEvents = pastList.sort((a, b) => -byStart(a, b));

  const going = current.filter((e) => intentionOf.get(e.id) === "going").sort(byStart);
  const company = current.filter((e) => intentionOf.get(e.id) === "looking_for_company").sort(byStart);
  const interested = current.filter((e) => intentionOf.get(e.id) === "interested").sort(byStart);
  const savedCurrent = (saved ?? []).map((s) => byId.get(s.event_id)).filter((e): e is EventSummary => Boolean(e) && currentIds.has(e!.id));
  // Each concert appears once: a stated plan takes precedence over "watching".
  const watching = savedCurrent.filter((e) => !intentionOf.has(e.id) && deriveSaleState(e.lifecycle, e.sales).kind === "upcoming");
  const otherSaved = savedCurrent.filter((e) => !watching.includes(e) && !intentionOf.has(e.id)).sort(byStart);
  watching.sort((a, b) => {
    const sa = deriveSaleState(a.lifecycle, a.sales);
    const sb = deriveSaleState(b.lifecycle, b.sales);
    return (sa.kind === "upcoming" ? sa.startsAt.getTime() : Infinity) - (sb.kind === "upcoming" ? sb.startsAt.getTime() : Infinity);
  });

  const empty = !current.length;

  return (
    <div className="space-y-8">
      <PageHeader title="Saved" subtitle="Concerts you're watching and your plans" />

      {empty && !showPast ? (
        <EmptyState
          decorative
          icon={<IconSaved />}
          title="Nothing saved yet"
          body="Save a concert to watch its ticket sale, or mark yourself interested or going to share your plans with friends."
          action={<ButtonLink href="/discover">Browse concerts</ButtonLink>}
        />
      ) : null}

      <List id="watching" title="Watching sales" events={watching} hint="Saved concerts with a scheduled ticket sale" />
      <List id="going" title="Going" events={going} hint="Your plan — not a verified ticket" />
      <List id="company" title="Looking for company" events={company} />
      <List id="interested" title="Interested" events={interested} />
      <List id="saved" title="Saved" events={otherSaved} />

      {showPast ? (
        pastEvents.length ? (
          <List id="past" title="Past concerts" events={pastEvents} />
        ) : (
          <p className="text-center text-support text-fg-secondary">No past concerts yet.</p>
        )
      ) : pastEvents.length ? (
        <div className="flex justify-center">
          <Link href="/saved?past=1" className="inline-flex min-h-11 items-center text-support font-semibold text-fg-secondary hover:text-fg">
            Show {pastEvents.length} past concert{pastEvents.length === 1 ? "" : "s"}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
