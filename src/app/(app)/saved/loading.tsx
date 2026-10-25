import { ListSkeleton, LoadingSkeleton } from "@/components/states";

export default function Loading() {
  return (
    <div className="space-y-6 pt-6">
      <LoadingSkeleton className="h-8 w-32" />
      <ListSkeleton rows={4} label="Loading saved concerts" />
    </div>
  );
}
