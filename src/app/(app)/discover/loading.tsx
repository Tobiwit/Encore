import { ListSkeleton, LoadingSkeleton } from "@/components/states";

export default function Loading() {
  return (
    <div className="space-y-8 pt-6">
      <div className="space-y-2">
        <LoadingSkeleton className="h-8 w-56" />
        <LoadingSkeleton className="h-4 w-32" />
      </div>
      <LoadingSkeleton className="aspect-[16/9] w-full rounded-xl" />
      <ListSkeleton rows={4} label="Loading your concerts" />
    </div>
  );
}
