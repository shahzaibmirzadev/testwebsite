import RolesDirectoryClient from "@/components/roles/RolesDirectoryClient";
import { getSearchableActiveJobs } from "@/lib/jobs";
import { countRecentlyPostedRoles } from "@/lib/recentRoleCounts";
import { buildRoleDirectoryRows } from "@/lib/rolePages";

export const revalidate = 86400;

export const metadata = {
  title: "Drone Job Role Directory (2026) | DroneRoles",
  description:
    "Browse drone roles by specialty across pilot, engineering, operations, testing, software, hardware, and emerging drone-adjacent role families.",
  alternates: {
    canonical: "/roles",
  },
};

export default async function RolesPage() {
  const jobs = await getSearchableActiveJobs();
  const roles = buildRoleDirectoryRows(jobs);
  const specialtyTags = new Set();
  for (const role of roles) {
    for (const tag of role.tags || []) {
      specialtyTags.add(String(tag).toLowerCase());
    }
  }

  return (
    <main className="bg-[#FFFFFF] text-[#1C1C1A]" data-role-theme>
      <RolesDirectoryClient
        roles={roles}
        stats={{
          liveRoles: jobs.length,
          recentRoles: countRecentlyPostedRoles(jobs),
          roleFamilies: roles.length,
          indexedMatches: roles.reduce((sum, role) => sum + Number(role.roleCount || 0), 0),
          specialtyTags: specialtyTags.size,
        }}
      />
    </main>
  );
}
