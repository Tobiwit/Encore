import type { Metadata } from "next";
import { BackLink } from "@/components/BackLink";
import { LocationEditor } from "@/components/LocationEditor";
import { PageHeader } from "@/components/ui";
import { createClient, requireUser } from "@/lib/supabase/server";
import { getUserLocations } from "@/server/data/events";

export const metadata: Metadata = { title: "Locations" };

export default async function LocationsPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const [{ data: cities }, locations] = await Promise.all([
    supabase.from("cities").select("id, name, country_code").order("country_code").order("name"),
    getUserLocations(supabase, user.id),
  ]);

  return (
    <div>
      <div className="pt-4">
        <BackLink fallback="/profile" />
      </div>
      <PageHeader title="Locations" subtitle="Concerts within these areas appear in Discover and trigger local alerts." />
      <LocationEditor cities={cities ?? []} locations={locations} />
    </div>
  );
}
