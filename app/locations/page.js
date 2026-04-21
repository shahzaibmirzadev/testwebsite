import LocationsDirectoryClient from "@/components/locations/LocationsDirectoryClient";
import { getSearchableActiveJobs } from "@/lib/jobs";
import { buildLocationDirectoryRows, buildLocationStats } from "@/lib/locationPages";

export const revalidate = 86400;

export const metadata = {
  title: "Drone Job Locations (2026) | DroneRoles",
  description:
    "Browse drone jobs by location: Germany, UK, USA, Europe, and more. Open a region for active roles across engineering, operations, testing, and more.",
  alternates: {
    canonical: "/locations",
  },
};

export default async function LocationsPage() {
  const jobs = await getSearchableActiveJobs();
  const locations = buildLocationDirectoryRows(jobs);
  const stats = buildLocationStats(jobs);

  return (
    <main className="bg-[#FFFCF7] text-[#1C1C1A]" data-location-theme>
      <LocationsDirectoryClient locations={locations} stats={stats} />
    </main>
  );
}
