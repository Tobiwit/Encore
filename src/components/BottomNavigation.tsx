"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconArtists, IconDiscover, IconFriends, IconProfile, IconSaved } from "./icons";
import { cn } from "./ui";

export const NAV_ITEMS = [
  { href: "/discover", label: "Discover", Icon: IconDiscover },
  { href: "/artists", label: "Artists", Icon: IconArtists },
  { href: "/friends", label: "Friends", Icon: IconFriends },
  { href: "/saved", label: "Saved", Icon: IconSaved },
  { href: "/profile", label: "Profile", Icon: IconProfile },
] as const;

function useActive() {
  const pathname = usePathname();
  return (href: string) => pathname === href || pathname.startsWith(`${href}/`) || (href === "/discover" && pathname.startsWith("/events"));
}

/** Fixed bottom bar on phones; a side rail on wider screens (same destinations). */
export function BottomNavigation({ unread = 0 }: { unread?: number }) {
  const isActive = useActive();
  return (
    <>
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/95 pb-[var(--safe-bottom)] backdrop-blur-md md:hidden"
      >
        <ul className="mx-auto grid h-[var(--nav-height)] max-w-lg grid-cols-5">
          {NAV_ITEMS.map(({ href, label, Icon }) => {
            const active = isActive(href);
            return (
              <li key={href} className="flex">
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex flex-1 flex-col items-center justify-center gap-0.5 text-meta font-semibold transition-colors",
                    active ? "text-fg" : "text-fg-muted hover:text-fg-secondary",
                  )}
                >
                  <span className={cn("relative flex h-7 w-12 items-center justify-center rounded-full transition-colors", active && "bg-accent-muted")}>
                    <Icon size={20} />
                    {href === "/profile" && unread > 0 ? (
                      <span className="absolute right-2 top-0.5 size-2 rounded-full bg-accent" aria-hidden="true" />
                    ) : null}
                  </span>
                  {label}
                  {href === "/profile" && unread > 0 ? <span className="sr-only">({unread} unread notifications)</span> : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <nav aria-label="Primary" className="fixed inset-y-0 left-0 z-40 hidden w-20 flex-col items-center border-r border-line bg-bg py-6 md:flex lg:w-56 lg:items-stretch lg:px-4">
        <Link href="/discover" className="mb-8 px-2 text-section font-semibold tracking-tight text-fg lg:px-3">
          <span className="lg:hidden" aria-hidden="true">E</span>
          <span className="hidden lg:inline">Encore</span>
          <span className="sr-only lg:hidden">Encore</span>
        </Link>
        <ul className="flex flex-col gap-1">
          {NAV_ITEMS.map(({ href, label, Icon }) => {
            const active = isActive(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-12 items-center gap-3 rounded-full px-3 font-semibold transition-colors",
                    active ? "bg-accent-muted text-fg" : "text-fg-muted hover:bg-surface hover:text-fg",
                  )}
                >
                  <Icon size={22} />
                  <span className="sr-only lg:not-sr-only">{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
