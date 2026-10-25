"use client";

import { useRouter } from "next/navigation";
import { IconChevronLeft } from "./icons";

/** Goes back in history (preserving the previous screen's scroll position) or to a fallback. */
export function BackLink({ fallback, label = "Back" }: { fallback: string; label?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => (window.history.length > 1 ? router.back() : router.push(fallback))}
      className="-ml-3 inline-flex min-h-11 items-center gap-1 rounded-full pl-1 pr-4 font-semibold text-fg-secondary hover:bg-surface hover:text-fg"
    >
      <IconChevronLeft /> {label}
    </button>
  );
}
