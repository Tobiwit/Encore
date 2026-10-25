"use client";

import { useEffect } from "react";
import { markNotificationsRead } from "@/server/actions/profile";

/** Marks the inbox read shortly after it has been shown, so unread items are visible first. */
export function MarkReadOnView() {
  useEffect(() => {
    const t = setTimeout(() => void markNotificationsRead(), 1500);
    return () => clearTimeout(t);
  }, []);
  return null;
}
