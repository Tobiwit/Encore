import { getTopTracks } from "@/server/providers/deezer";
import { LoadingSkeleton } from "./states";
import { TopTracksPlayer } from "./TopTracksPlayer";

export async function TopTracks({ artistName }: { artistName: string }) {
  const result = await getTopTracks(artistName, 3);
  if (result.status === "ok") {
    return <TopTracksPlayer tracks={result.tracks} artistName={artistName} artistLink={result.artistLink} />;
  }
  return (
    <p className="rounded-lg bg-surface px-4 py-3 text-support text-fg-secondary">
      {result.status === "not_found"
        ? "We couldn't find song previews for this artist."
        : "Song previews aren't available right now. Try again later."}
    </p>
  );
}

export function TopTracksSkeleton() {
  return (
    <div role="status" className="space-y-2">
      <span className="sr-only">Loading popular songs…</span>
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-3 rounded-lg bg-surface p-2">
          <LoadingSkeleton className="size-12 rounded-sm" />
          <div className="flex-1 space-y-2">
            <LoadingSkeleton className="h-3.5 w-2/3" />
            <LoadingSkeleton className="h-3 w-1/3" />
          </div>
          <LoadingSkeleton className="size-11 rounded-full" />
        </div>
      ))}
    </div>
  );
}
