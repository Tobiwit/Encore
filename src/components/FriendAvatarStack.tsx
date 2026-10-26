import Link from "next/link";
import { formatRelativePast } from "@/lib/format";
import type { FriendFace, FriendFanFace } from "@/lib/types";
import { Avatar } from "./RemoteImage";
import { cn } from "./ui";

const INTENTION_LABEL: Record<string, string> = {
  interested: "is interested",
  going: "is going",
  looking_for_company: "is looking for company",
};

export function FriendAvatarStack({
  friends,
  size = 28,
  max = 3,
  ring = "ring-bg",
  label,
}: {
  friends: { id: string; name: string; avatarUrl: string | null }[];
  size?: number;
  max?: number;
  /** Ring colour that separates overlapping faces; match the surface underneath. */
  ring?: string;
  /** Accessible label; omit when adjacent text already says who these people are. */
  label?: string;
}) {
  const shown = friends.slice(0, max);
  const extra = friends.length - shown.length;
  return (
    <span className="inline-flex shrink-0 items-center" {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}>
      {shown.map((f, i) => (
        <Avatar key={f.id} src={f.avatarUrl} name={f.name} size={size} ring={ring} className={cn(i > 0 && "-ml-1.5")} />
      ))}
      {extra > 0 ? (
        <span
          className={cn("-ml-1.5 inline-flex items-center justify-center rounded-full bg-surface-elevated text-meta font-semibold text-fg-secondary ring-2", ring)}
          style={{ width: size, height: size }}
        >
          +{extra}
        </span>
      ) : null}
    </span>
  );
}

type Group = { key: string; people: { id: string; name: string; avatarUrl: string | null }[]; one: string; many: string };

function firstName(name: string) {
  return name.split(/\s+/)[0] || name;
}

/** "Sam", "Sam & Lea", "Sam +2". */
export function namesLabel(people: { name: string }[]) {
  if (people.length === 1) return firstName(people[0].name);
  if (people.length === 2) return `${firstName(people[0].name)} & ${firstName(people[1].name)}`;
  return `${firstName(people[0].name)} +${people.length - 1}`;
}

export function socialGroups(friends: FriendFace[], fans: FriendFanFace[]): Group[] {
  const by = (intention: string) => friends.filter((f) => f.intention === intention);
  const groups: Group[] = [
    { key: "going", people: by("going"), one: "is going", many: "are going" },
    { key: "company", people: by("looking_for_company"), one: "wants company", many: "want company" },
    { key: "interested", people: by("interested"), one: "wants to go", many: "want to go" },
  ];
  if (fans.length) {
    const artist = fans[0].artistName;
    const loves = fans.filter((f) => f.interest === "love").length >= fans.length / 2;
    groups.push({ key: "fans", people: fans, one: `${loves ? "loves" : "likes"} ${artist}`, many: `${loves ? "love" : "like"} ${artist}` });
  }
  return groups.filter((g) => g.people.length > 0);
}

/**
 * Minimal social line for an event: who is going, who wants to go, and which friends are fans
 * of the artist, each with a small stack of faces. Renders nothing without friend activity.
 */
export function FriendSocialLine({
  friends,
  fans,
  ring = "ring-surface",
  className,
}: {
  friends: FriendFace[];
  fans: FriendFanFace[];
  ring?: string;
  className?: string;
}) {
  const groups = socialGroups(friends, fans);
  if (!groups.length) return null;
  return (
    <ul className={cn("flex flex-wrap gap-x-3 gap-y-1.5 text-meta text-fg-secondary", className)} aria-label="Friends">
      {groups.map((g) => (
        <li key={g.key} className="flex min-w-0 items-center gap-1.5">
          <FriendAvatarStack friends={g.people} size={20} max={3} ring={ring} />
          <span className="truncate">
            <span className="font-semibold text-fg">{namesLabel(g.people)}</span> {g.people.length === 1 ? g.one : g.many}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function FriendActivityItem({
  friend,
  intention,
  eventTitle,
  eventId,
  when,
}: {
  friend: FriendFace;
  intention: string;
  eventTitle: string;
  eventId: string;
  when: string;
}) {
  return (
    <li className="relative flex items-center gap-3 rounded-lg bg-surface p-3">
      <Avatar src={friend.avatarUrl} name={friend.name} size={40} />
      <div className="min-w-0 flex-1">
        <p className="text-support text-fg-secondary">
          <span className="font-semibold text-fg">{friend.name}</span> {INTENTION_LABEL[intention] ?? "is interested"}
        </p>
        <Link href={`/events/${eventId}`} className="line-clamp-1 font-semibold text-fg after:absolute after:inset-0 after:content-['']">
          {eventTitle}
        </Link>
      </div>
      <span className="shrink-0 text-meta text-fg-muted">{formatRelativePast(when)}</span>
    </li>
  );
}
