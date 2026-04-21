import { BROWSE_CATEGORIES, MIN_BROWSE_ROLE_COUNT } from "./categoryMeta";
import { getGlobalRolePageConfigs } from "./landingPageRegistry";
import { countRecentlyPostedRoles } from "./recentRoleCounts";

export const MIN_ROLE_DIRECTORY_ROLES = MIN_BROWSE_ROLE_COUNT;

const ROLE_TAGS = {
  pilot: ["Flight Ops", "Remote Pilot", "BVLOS"],
  engineering: ["Systems", "Autonomy", "Embedded"],
  operations: ["Mission Ops", "Deployment", "Field Work"],
  testing: ["Flight Test", "Validation", "QA"],
  defense: ["DoD", "Counter-UAS", "Programs"],
  software: ["Backend", "Frontend", "Embedded SW"],
  hardware: ["Avionics", "Mechanical", "Electrical"],
  technician: ["Maintenance", "Repair", "Assembly"],
  "business-development": ["Partnerships", "Sales", "Go-To-Market"],
  administrative: ["Coordination", "Office Ops", "Support"],
  "product-program": ["Product", "TPM", "Program Delivery"],
  manufacturing: ["Production", "Assembly", "Supply Chain"],
  "data-ai": ["ML", "Perception", "Data Pipelines"],
  geospatial: ["GIS", "Mapping", "Photogrammetry"],
  "quality-safety": ["Quality", "Compliance", "Airworthiness"],
};

function toTimestamp(job) {
  const raw = String(job?.last_seen_at || job?.posted_at || job?.updated_at || "").trim();
  const ts = Date.parse(raw);
  return Number.isFinite(ts) ? ts : 0;
}

export function getRolePagePath(slug) {
  return `/roles/${String(slug || "").trim().toLowerCase()}`;
}

export function getRoleConfigBySlug(slug) {
  const key = String(slug || "").trim().toLowerCase();
  const category = BROWSE_CATEGORIES.find((x) => x.id === key);
  if (category) return category;
  const landingRole = getGlobalRolePageConfigs().find((config) => config.roleSlug === key);
  if (!landingRole) return null;
  return {
    id: landingRole.roleSlug,
    title: landingRole.title.replace(/\s+Jobs$/i, "").trim(),
    landingTitle: landingRole.title,
    landingHeroBlurb: landingRole.heroBlurb,
    landingSeoTitle: landingRole.seoTitle,
    landingSeoDescription: landingRole.seoDescription,
    landingFocusCountries: landingRole.focusCountries || [],
    roleTitleIncludeTerms: landingRole.includeTerms || [],
    roleTitleExcludeTerms: landingRole.excludeTerms || [],
    relatedRoleSlugs: landingRole.relatedRoleSlugs || [],
    matcher: null,
  };
}

export function getJobsForRole(jobs, slug) {
  const config = getRoleConfigBySlug(slug);
  if (!config) return [];
  const list = Array.isArray(jobs) ? jobs : [];
  if (typeof config.matcher === "function") {
    return list.filter((job) => config.matcher(job)).sort((a, b) => toTimestamp(b) - toTimestamp(a));
  }
  const includeTerms = Array.isArray(config.roleTitleIncludeTerms)
    ? config.roleTitleIncludeTerms.map((term) => String(term || "").trim().toLowerCase()).filter(Boolean)
    : [];
  const excludeTerms = Array.isArray(config.roleTitleExcludeTerms)
    ? config.roleTitleExcludeTerms.map((term) => String(term || "").trim().toLowerCase()).filter(Boolean)
    : [];
  if (includeTerms.length === 0) return list.sort((a, b) => toTimestamp(b) - toTimestamp(a));
  return list
    .filter((job) => {
      const haystack = `${String(job?.title || "")} ${String(job?.description || "")} ${
        Array.isArray(job?.tags) ? job.tags.join(" ") : String(job?.tags || "")
      }`.toLowerCase();
      if (!haystack) return false;
      const includeMatch = includeTerms.some((term) => haystack.includes(term));
      if (!includeMatch) return false;
      const excludeMatch = excludeTerms.some((term) => haystack.includes(term));
      return !excludeMatch;
    })
    .sort((a, b) => toTimestamp(b) - toTimestamp(a));
}

export function buildRoleDirectoryRows(jobs) {
  const list = Array.isArray(jobs) ? jobs : [];
  const rows = [];

  for (const category of BROWSE_CATEGORIES) {
    if (typeof category?.matcher !== "function") continue;
    const roleJobs = list.filter((job) => category.matcher(job));
    if (roleJobs.length < MIN_ROLE_DIRECTORY_ROLES) continue;

    let lastSeenAt = null;
    for (const job of roleJobs) {
      const raw = String(job?.last_seen_at || job?.posted_at || job?.updated_at || "").trim();
      if (!raw) continue;
      const next = Date.parse(raw);
      if (!Number.isFinite(next)) continue;
      const prev = lastSeenAt ? Date.parse(String(lastSeenAt)) : NaN;
      if (!lastSeenAt || !Number.isFinite(prev) || next > prev) {
        lastSeenAt = raw;
      }
    }

    rows.push({
      slug: category.id,
      name: category.title,
      roleCount: roleJobs.length,
      recentRoleCount: countRecentlyPostedRoles(roleJobs),
      lastSeenAt,
      gradient: category.gradient,
      tags: ROLE_TAGS[category.id] || [],
      directoryRolesLabel: `${category.title} roles with active demand`,
    });
  }

  return rows.sort((a, b) => b.roleCount - a.roleCount || a.name.localeCompare(b.name));
}
