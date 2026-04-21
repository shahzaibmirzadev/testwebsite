import { companyPagePath } from "./companyPages";
import { getJobsForLocation, getLocationConfigBySlug } from "./locationPages";
import { getJobsForRole } from "./rolePages";
import { getRoleLocationLandingConfigs } from "./landingPageRegistry";

function normalizeSlug(value) {
  return String(value || "").trim().toLowerCase();
}

export function getRoleLocationPagePath(roleSlug, locationSlug) {
  return `/roles/${normalizeSlug(roleSlug)}/${normalizeSlug(locationSlug)}`;
}

export function getRoleLocationPageConfigs() {
  return getRoleLocationLandingConfigs().map((config) => ({ ...config }));
}

export function getRoleLocationPageConfig(roleSlug, locationSlug) {
  const role = normalizeSlug(roleSlug);
  const location = normalizeSlug(locationSlug);
  return (
    getRoleLocationLandingConfigs().find(
      (config) => normalizeSlug(config.roleSlug) === role && normalizeSlug(config.locationSlug) === location
    ) || null
  );
}

export function getJobsForRoleLocation(jobs, config) {
  if (!config) return [];
  const locationJobs = getJobsForLocation(jobs, config.locationSlug);
  const includeTerms = Array.isArray(config.roleTitleIncludeTerms)
    ? config.roleTitleIncludeTerms.map((term) => String(term || "").trim().toLowerCase()).filter(Boolean)
    : [];
  const excludeTerms = Array.isArray(config.roleTitleExcludeTerms)
    ? config.roleTitleExcludeTerms.map((term) => String(term || "").trim().toLowerCase()).filter(Boolean)
    : [];

  if (includeTerms.length === 0) {
    return getJobsForRole(locationJobs, config.roleFilterSlug);
  }

  return locationJobs.filter((job) => {
    const title = String(job?.title || "").toLowerCase();
    if (!title) return false;
    const hasRoleMatch = includeTerms.some((term) => title.includes(term));
    if (!hasRoleMatch) return false;
    const isExcluded = excludeTerms.some((term) => title.includes(term));
    return !isExcluded;
  });
}

export function getRoleLocationLinkLabel(roleLabel, locationLabel) {
  return `${String(roleLabel || "").trim()} in ${String(locationLabel || "").trim()}`;
}

export function getTopCompanyLinksForRoleLocation(jobs, config, max = 3) {
  const counts = new Map();
  for (const job of Array.isArray(jobs) ? jobs : []) {
    const name = String(job?.company || "").trim();
    if (!name) continue;
    counts.set(name, (counts.get(name) || 0) + 1);
  }

  const sorted = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name]) => name);

  const out = [];
  const seen = new Set();
  for (const name of sorted) {
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, href: companyPagePath(name) });
    if (out.length >= max) break;
  }

  if (out.length < max) {
    for (const fallbackName of config?.fallbackCompanies || []) {
      const key = String(fallbackName || "").trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push({ name: fallbackName, href: companyPagePath(fallbackName) });
      if (out.length >= max) break;
    }
  }

  return out.slice(0, max);
}

export function resolveLocationLabel(locationSlug) {
  const config = getLocationConfigBySlug(locationSlug);
  return config?.label || String(locationSlug || "").trim();
}
