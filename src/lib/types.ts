import type { Lifecycle, SalePhase } from "./events";
import type { ListeningStatus, Ranks } from "./listening";
import type { InterestLevel } from "./ranking";

export type FriendFace = { id: string; name: string; avatarUrl: string | null; intention?: string };

/** A friend who loves/likes one of the event's artists (shown when they have no plan for it yet). */
export type FriendFanFace = { id: string; name: string; avatarUrl: string | null; interest: "love" | "like"; artistName: string };

export type PriceSummary = { min: number | null; max: number | null; currency: string; offerType: string; isResale: boolean };

export type EventSummary = {
  id: string;
  title: string;
  startsAt: string | null;
  startDateLocal: string | null;
  startTimeTba: boolean;
  timezone: string | null;
  lifecycle: Lifecycle;
  imageUrl: string | null;
  venueName: string | null;
  city: string | null;
  distanceKm: number | null;
  lastVerifiedAt: string | null;
  createdAt: string;
  announcedAt: string | null;
  sales: SalePhase[];
  price: PriceSummary | null;
  artists: { id: string; name: string; imageUrl: string | null; interest: InterestLevel | null; pinned: boolean; matchConfidence: number }[];
  friends: FriendFace[];
  friendFans: FriendFanFace[];
  saved: boolean;
  reasons?: string[];
};

export type ArtistSummary = {
  id: string;
  name: string;
  imageUrl: string | null;
  genres: string[];
  interest: InterestLevel;
  pinned: boolean;
  notify: boolean;
  source: "spotify_import" | "manual" | "friend_suggestion" | "discovery";
  upcomingCount?: number;
  spotifyUrl?: string | null;
  ranks?: Ranks;
  status?: ListeningStatus;
  longTimeFanSince?: string | null;
  interestSource?: "auto" | "user";
};
