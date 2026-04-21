import {
  getApprovedSourcesMetaByCompany,
  getSourcesCsvRowCount,
  getTrackedCompanies,
} from "@/lib/trackedCompanies";
import { getFeatureFlags } from "@/lib/featureFlags";
import {
  getActiveListingsCount,
  getSearchableActiveJobs,
  getTotalListingsCount,
} from "@/lib/jobs";
import { getCompanyName } from "@/lib/jobFieldHelpers";
import { inferCompanySector } from "@/lib/companySectorMeta";
import { BROWSE_CATEGORIES, getTopSectorCategoriesForJobs } from "@/lib/categoryMeta";
import CompaniesDirectoryClient from "@/components/companies/CompaniesDirectoryClient";
import { countRecentlyPostedRoles } from "@/lib/recentRoleCounts";
import {
  deriveCompanyDirectoryStatus,
  getCompanyDirectoryStatusPresentation,
  loadSourcePerformanceByKey,
} from "@/lib/companyDirectoryStatus";

export const revalidate = 86400;
export const metadata = {
  title: "Drone Companies Hiring Now",
  description:
    "Explore all companies currently tracked by Drone Roles and jump directly into each company's open roles.",
  alternates: {
    canonical: "/companies",
  },
};

export default async function CompaniesPage() {
  const flags = getFeatureFlags();
  const operationalStatus = Boolean(flags.companyDirectoryOperationalStatusV1);

  const [
    companies,
    jobs,
    sourcesMeta,
    perfByKey,
    lifetimeRoles,
    trackedCompaniesCount,
    liveRoles,
  ] = await Promise.all([
    getTrackedCompanies(),
    getSearchableActiveJobs(),
    operationalStatus ? getApprovedSourcesMetaByCompany() : Promise.resolve(null),
    operationalStatus ? loadSourcePerformanceByKey() : Promise.resolve(null),
    getTotalListingsCount(),
    getSourcesCsvRowCount(),
    getActiveListingsCount(),
  ]);

  const byCompany = new Map();
  const jobsByCompany = new Map();
  const specialties = BROWSE_CATEGORIES.filter((c) => typeof c?.matcher === "function");
  const safeMatch = (specialty, job) => {
    try {
      return Boolean(specialty?.matcher?.(job));
    } catch {
      return false;
    }
  };

  for (const job of jobs) {
    const name = getCompanyName(job);
    if (!name) continue;
    const entry = byCompany.get(name) || { roleCount: 0, lastSeenAt: null };
    entry.roleCount += 1;
    const existingJobs = jobsByCompany.get(name) || [];
    existingJobs.push(job);
    jobsByCompany.set(name, existingJobs);
    const ts = String(job?.last_seen_at || job?.posted_at || job?.updated_at || "").trim();
    if (ts) {
      const prev = Date.parse(String(entry.lastSeenAt || ""));
      const next = Date.parse(ts);
      if (!Number.isFinite(prev) || (Number.isFinite(next) && next > prev)) {
        entry.lastSeenAt = ts;
      }
    }
    byCompany.set(name, entry);
  }

  const directoryRows = companies.map((name) => {
    const stats = byCompany.get(name) || { roleCount: 0, lastSeenAt: null };
    const companyJobs = jobsByCompany.get(name) || [];
    const sector = inferCompanySector(name, companyJobs);

    let dominantSpecialty = null;
    let dominantSpecialtyCount = 0;
    for (const specialty of specialties) {
      const count = companyJobs.reduce(
        (n, job) => (safeMatch(specialty, job) ? n + 1 : n),
        0
      );
      if (count > dominantSpecialtyCount) {
        dominantSpecialtyCount = count;
        dominantSpecialty = specialty;
      }
    }

    let companyStatus = null;
    let statusLabel = null;
    let statusDetail = null;
    let hasKnownSource = true;

    if (operationalStatus && sourcesMeta && perfByKey) {
      const meta = sourcesMeta.get(name);
      const perf = meta ? perfByKey.get(`${meta.provider}|${meta.slug.toLowerCase()}`) : null;
      if (!meta) {
        hasKnownSource = false;
      }
      const rawStatus = deriveCompanyDirectoryStatus({
        roleCount: stats.roleCount,
        perf: hasKnownSource ? perf : null,
      });
      const pres = getCompanyDirectoryStatusPresentation(
        hasKnownSource ? rawStatus : "untracked_or_unknown"
      );
      companyStatus = pres.company_status;
      statusLabel = pres.status_label;
      statusDetail = pres.status_detail;
    }

    let directorySectorLabel = null;
    if (sector?.title) {
      directorySectorLabel = `Sector: ${sector.title}`;
    } else if (operationalStatus) {
      if (stats.roleCount > 0) {
        directorySectorLabel = "Sector: Unclassified";
      }
    } else {
      directorySectorLabel = "Sector: Unclassified";
    }

    return {
      name,
      roleCount: stats.roleCount,
      recentRoleCount: countRecentlyPostedRoles(companyJobs),
      lastSeenAt: stats.lastSeenAt,
      dominantSectorId: sector?.id || null,
      dominantSectorTitle: sector?.title || null,
      dominantSectorGradient:
        dominantSpecialty?.gradient ||
        sector?.gradient ||
        "linear-gradient(135deg, #5B4FE8 0%, #1A1160 100%)",
      sectorDots: getTopSectorCategoriesForJobs(companyJobs, 3),
      directorySectorLabel,
      companyStatus,
      statusLabel,
      statusDetail,
      hasKnownSource,
      hasActiveJobs: stats.roleCount > 0,
    };
  });

  const directoryRowsFiltered = directoryRows.filter((row) => row.roleCount > 0);

  const activeCompanies = directoryRowsFiltered.filter((row) => row.roleCount > 0).length;

  return (
    <main className="bg-[#FFFFFF] text-[#1C1C1A]">
      <CompaniesDirectoryClient
        companies={directoryRowsFiltered}
        companyPagesEnabled={Boolean(flags.companyPagesV1)}
        stats={{
          liveRoles,
          recentRoles: countRecentlyPostedRoles(jobs),
          lifetimeRoles,
          trackedCompanies: trackedCompaniesCount,
          activeCompanies,
        }}
      />
    </main>
  );
}
