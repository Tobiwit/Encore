import Link from "next/link";
import { formatRelativePast } from "@/lib/format";
import type { FriendFace } from "@/lib/types";
import { Avatar } from "./RemoteImage";
import { cn } from "./ui";

const INTENTION_LABEL: Record<string, string> = {
  interested: "is interested",
  going: "is going",
  looking_for_company: "is looking for company",
};

export function FriendAvatarStack({ friends, size = 28, max = 3 }: { friends: FriendFace[]; size?: number; max?: number }) {
  const shown = friends.slice(0, max);
  const extra = friends.length - shown.length;
  const label =
    friends.length === 1 ? `${friends[0].name} is interested` : `${friends.length} friends interested: ${friends.map((f) => f.name).join(", ")}`;
  return (
    <span className="inline-flex items-center" role="img" aria-label={label}>
      {shown.map((f, i) => (
        <Avatar key={f.id} src={f.avatarUrl} name={f.name} size={size} className={cn(i > 0 && "-ml-2")} />
      ))}
      {extra > 0 ? (
        <span
          className="-ml-2 inline-flex items-center justify-center rounded-full bg-surface-elevated text-meta font-semibold text-fg-secondary ring-2 ring-bg"
          style={{ width: size, height: size }}
        >
          +{extra}
        </span>
      ) : null}
    </span>
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
