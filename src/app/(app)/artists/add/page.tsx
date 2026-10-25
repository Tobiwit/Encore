import type { Metadata } from "next";
import { ArtistSearch } from "@/components/ArtistSearch";
import { BackLink } from "@/components/BackLink";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Add artists" };

export default function AddArtistsPage() {
  return (
    <div>
      <div className="pt-4">
        <BackLink fallback="/artists" />
      </div>
      <PageHeader title="Add artists" subtitle="Search Spotify for anyone you want to follow — even if you rarely stream them." />
      <ArtistSearch />
    </div>
  );
}
