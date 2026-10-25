import { LoadingSkeleton } from "@/components/states";

export default function Loading() {
  return (
    <div role="status" className="space-y-6 pt-6">
      <span className="sr-only">Loading artists…</span>
      <LoadingSkeleton className="h-8 w-32" />
      <LoadingSkeleton className="h-36 w-full rounded-xl" />
      <div className="space-y-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <LoadingSkeleton className="size-12 rounded-full" />
            <LoadingSkeleton className="h-4 flex-1" />
          </div>
        ))}
      </div>
    </div>
  );
}
