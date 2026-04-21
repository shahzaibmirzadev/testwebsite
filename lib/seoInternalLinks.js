import { CATEGORY_PAGES, getCategoryConfig } from "@/lib/categoryPages";
import { GUIDE_PAGES, getGuideConfig } from "@/lib/guidePages";
import { getCompanyName, getJobTags } from "@/lib/jobFieldHelpers";
import { companySlug } from "@/lib/companyPages";
import { inferCompanySector } from "@/lib/companySectorMeta";
import { hubPathForHub, resolvePrimaryHubForJob } from "@/lib/resolvePrimaryHubForJob";
import { shouldIndexCompanyPage, shouldIndexJobPage } from "@/lib/seoIndexing";
import { CATEGORY_MIN_INDEXABLE_JOBS, GUIDE_MIN_INDEXABLE_JOBS } from "@/lib/seoThresholds";

/**
 * @typedef {{ key: string, path: string, label: string }} HubLink
 * @typedef {{ name: string, slug: string, roleCount: number }} CompanyLinkRow
 */

function safeMatch(matcher, job) {
  try {
    return Boolean(typeof matcher === "function" && matcher(job));
  } catch {
    return false;
  }
}

function sortedJobsStable(jobs) {
  return [...(Array.isArray(jobs) ? jobs : [])].sort((a, b) => {
    const ia = String(a?.id ?? "").localeCompare(String(b?.id ?? ""));
    if (ia !== 0) return ia;
    return String(a?.title ?? "").localeCompare(String(b?.title ?? ""));
  });
}

/**
 * @param {HubLink[]} links
 * @returns {HubLink[]}
 */
function dedupeHubLinksByKey(links) {
  const seen = new Set();
  const out = [];
  for (const link of Array.isArray(links) ? links : []) {
    if (!link?.key) continue;
    if (seen.has(link.key)) continue;
    seen.add(link.key);
    out.push(link);
  }
  return out;
}

/**
 * IMPORTANT: All adjacency slugs must match existing CATEGORY_PAGES or GUIDE_PAGES keys. Do not add unknown slugs.
 * Validates in non-production builds (console.warn).
 */
function validateAdjacencySlugsDev() {
  if (process.env.NODE_ENV === "production") return;
  const seen = new Set();
  for (const slug of [
    ...Object.values(RELATED_HUB_ADJACENCY_CATEGORY).flat(),
    ...Object.values(RELATED_HUB_ADJACENCY_GUIDE).flat(),
  ]) {
    if (seen.has(slug)) continue;
    seen.add(slug);
    if (!CATEGORY_PAGES[slug] && !GUIDE_PAGES[slug]) {
      console.warn("[seoInternalLinks] Adjacency references unknown slug:", slug);
    }
  }
}

/**
 * @param {{ source: "category"|"guide", slug: string }} hub
 */
export function hubToLink(hub) {
  if (!hub?.slug) return null;
  const path = hubPathForHub(hub);
  if (!path) return null;
  const label =
    hub.source === "category"
      ? getCategoryConfig(hub.slug)?.heading || hub.slug
      : getGuideConfig(hub.slug)?.heading || hub.slug;
  const key = `${hub.source}:${hub.slug}`;
  return { key, path, label };
}

/**
 * Category hub is indexable (robots + sitemap aligned).
 */
export function isIndexableCategoryHub(slug, allJobs, flags) {
  if (!flags?.categoryPagesV1 && !flags?.extendedCategoryPagesV1) return false;
  const cfg = getCategoryConfig(slug);
  if (!cfg?.match) return false;
  const list = Array.isArray(allJobs) ? allJobs : [];
  const count = list.filter((j) => shouldIndexJobPage(j) && safeMatch(cfg.match, j)).length;
  return count >= CATEGORY_MIN_INDEXABLE_JOBS;
}

/**
 * Guide hub is indexable.
 */
export function isIndexableGuideHub(slug, allJobs) {
  const cfg = getGuideConfig(slug);
  if (!cfg?.match) return false;
  const list = Array.isArray(allJobs) ? allJobs : [];
  const count = list.filter((j) => shouldIndexJobPage(j) && safeMatch(cfg.match, j)).length;
  return count >= GUIDE_MIN_INDEXABLE_JOBS;
}

/**
 * @param {{ source: "category"|"guide", slug: string }} hub
 */
export function isHubIndexable(hub, allJobs, flags) {
  if (!hub?.slug) return false;
  if (hub.source === "category") return isIndexableCategoryHub(hub.slug, allJobs, flags);
  return isIndexableGuideHub(hub.slug, allJobs);
}

/**
 * IMPORTANT: All adjacency slugs must match existing CATEGORY_PAGES or GUIDE_PAGES keys. Do not add unknown slugs.
 * @type {Record<string, string[]>} category slug -> other hub slugs (category or guide keys).
 */
export const RELATED_HUB_ADJACENCY_CATEGORY = {
  "uav-operator": ["drone-pilot", "field-engineer", "uav-pilot-jobs"],
  "drone-pilot": ["uav-operator", "bvlos", "drone-jobs-europe"],
  bvlos: ["drone-pilot", "flight-test", "defense-drone-jobs"],
  "flight-test": ["field-engineer", "defense-drone-jobs", "drone-engineering-jobs"],
  "field-engineer": ["uav-operator", "inspection-drone-jobs", "delivery-logistics-drone-jobs"],
  "defense-drone-jobs": ["inspection-drone-jobs", "flight-test", "drone-engineering-jobs"],
  "inspection-drone-jobs": ["mapping-surveying-drone-jobs", "defense-drone-jobs", "field-engineer"],
  "mapping-surveying-drone-jobs": ["inspection-drone-jobs", "delivery-logistics-drone-jobs", "flight-test"],
  "delivery-logistics-drone-jobs": ["mapping-surveying-drone-jobs", "drone-jobs-europe", "field-engineer"],
  "entry-level-drone-jobs": ["senior-drone-jobs", "drone-engineering-jobs", "uav-pilot-jobs"],
  "senior-drone-jobs": ["entry-level-drone-jobs", "defense-drone-jobs", "drone-engineering-jobs"],
};

/**
 * IMPORTANT: All adjacency slugs must match existing CATEGORY_PAGES or GUIDE_PAGES keys. Do not add unknown slugs.
 * @type {Record<string, string[]>} guide slug -> other hub slugs.
 */
export const RELATED_HUB_ADJACENCY_GUIDE = {
  "drone-jobs-europe": ["uav-operator", "drone-pilot", "drone-engineering-jobs"],
  "uav-pilot-jobs": ["drone-pilot", "bvlos", "drone-jobs-europe"],
  "drone-engineering-jobs": ["flight-test", "defense-drone-jobs", "drone-jobs-europe"],
};

validateAdjacencySlugsDev();

function resolveNeighborKind(slug) {
  if (GUIDE_PAGES[slug]) return /** @type {const} */ ("guide");
  if (CATEGORY_PAGES[slug]) return /** @type {const} */ ("category");
  return null;
}

/**
 * Static adjacency (phase 1). Returns up to 3 indexable hubs excluding current.
 * @param {string} currentSlug
 * @param {"category"|"guide"} currentKind
 */
export function getAdjacentIndexableHubLinks(currentSlug, currentKind, allJobs, flags, max = 3) {
  const raw =
    currentKind === "guide"
      ? RELATED_HUB_ADJACENCY_GUIDE[currentSlug] || []
      : RELATED_HUB_ADJACENCY_CATEGORY[currentSlug] || [];
  const out = [];
  for (const slug of raw) {
    if (slug === currentSlug) continue;
    const kind = resolveNeighborKind(slug);
    if (!kind) continue;
    const hub = { source: kind, slug };
    if (!isHubIndexable(hub, allJobs, flags)) continue;
    const link = hubToLink(hub);
    if (!link) continue;
    out.push(link);
  }

  let result = dedupeHubLinksByKey(out).slice(0, max);

  if (result.length === 0) {
    const fallback = [];
    for (const slug of Object.keys(CATEGORY_PAGES)) {
      if (slug === currentSlug) continue;
      const hub = { source: /** @type {const} */ ("category"), slug };
      if (!isHubIndexable(hub, allJobs, flags)) continue;
      const link = hubToLink(hub);
      if (!link) continue;
      fallback.push(link);
      if (fallback.length >= 2) break;
    }
    result = dedupeHubLinksByKey(fallback).slice(0, 2);
  }

  return result.slice(0, max);
}

/**
 * Top companies by indexable job count for hub match; only companies that pass shouldIndexCompanyPage.
 * @param {(job: Record<string, unknown>) => boolean} matchFn
 */
export function getTopIndexableCompaniesForHub(matchFn, allJobs, max = 5) {
  const list = Array.isArray(allJobs) ? allJobs : [];
  const byCompany = new Map();
  for (const job of list) {
    if (!shouldIndexJobPage(job) || !safeMatch(matchFn, job)) continue;
    const name = getCompanyName(job);
    if (!name) continue;
    const slug = companySlug(name);
    if (!byCompany.has(slug)) byCompany.set(slug, { name, slug, jobs: [] });
    byCompany.get(slug).jobs.push(job);
  }

  const rows = [];
  const seenSlug = new Set();
  for (const { name, slug, jobs: jlist } of byCompany.values()) {
    if (seenSlug.has(slug)) continue;
    seenSlug.add(slug);
    const companyJobs = list.filter((j) => companySlug(getCompanyName(j)) === slug);
    if (!shouldIndexCompanyPage(slug, companyJobs)) continue;
    const roleCount = jlist.length;
    rows.push({ name, slug, roleCount });
  }

  return rows
    .sort((a, b) => b.roleCount - a.roleCount || a.name.localeCompare(b.name))
    .slice(0, max);
}

/**
 * Job page: max 2 hub links — primary (current job) if indexable, plus one secondary from related jobs.
 * @param {Record<string, unknown>} job
 * @param {Record<string, unknown>[]} relatedJobs
 */
export function getJobPageRelatedRoleHubs(job, relatedJobs, allJobs, flags) {
  const out = [];
  const primary = resolvePrimaryHubForJob(job);
  if (primary && isHubIndexable(primary, allJobs, flags)) {
    const link = hubToLink(primary);
    if (link) out.push(link);
  }
  const primaryKey = primary ? `${primary.source}:${primary.slug}` : null;

  const counts = new Map();
  for (const rj of Array.isArray(relatedJobs) ? relatedJobs : []) {
    const h = resolvePrimaryHubForJob(rj);
    if (!h) continue;
    const k = `${h.source}:${h.slug}`;
    if (k === primaryKey) continue;
    if (!isHubIndexable(h, allJobs, flags)) continue;
    counts.set(k, (counts.get(k) || 0) + 1);
  }

  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  for (const [k] of sorted) {
    if (out.length >= 2) break;
    const sep = k.indexOf(":");
    const source = sep === -1 ? "" : k.slice(0, sep);
    const slug = sep === -1 ? k : k.slice(sep + 1);
    const hub = { source: /** @type {"category"|"guide"} */ (source), slug };
    const link = hubToLink(hub);
    if (!link) continue;
    out.push(link);
  }

  return dedupeHubLinksByKey(out).slice(0, 2);
}

/**
 * Company page: indexable hubs from primary hub resolution, sorted by frequency (same as collectRelatedHubs + filter).
 */
export function collectIndexableRelatedHubsForCompany(companyJobs, allJobs, flags, max = 3) {
  const list = Array.isArray(companyJobs) ? companyJobs : [];
  const counts = new Map();
  for (const job of sortedJobsStable(list)) {
    const hub = resolvePrimaryHubForJob(job);
    if (!hub || !isHubIndexable(hub, allJobs, flags)) continue;
    const k = `${hub.source}:${hub.slug}`;
    counts.set(k, (counts.get(k) || 0) + 1);
  }

  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const out = [];
  for (const [k] of entries) {
    const sep = k.indexOf(":");
    const source = sep === -1 ? "" : k.slice(0, sep);
    const slug = sep === -1 ? k : k.slice(sep + 1);
    const link = hubToLink({ source: /** @type {"category"|"guide"} */ (source), slug });
    if (link) out.push(link);
  }
  return dedupeHubLinksByKey(out).slice(0, max);
}

/**
 * Related companies for company pages: prefer employers whose job tags overlap this company's tags;
 * if not enough matches, fill with same inferred sector/industry (inferCompanySector).
 * Only includes companies that pass shouldIndexCompanyPage.
 */
export function collectIndexableRelatedCompanies(companyName, companyJobs, allJobs, selfSlug, max = 3) {
  const selfName = String(companyName || "").trim();
  const selfSlugNorm = String(selfSlug || "").trim();
  const selfJobs = Array.isArray(companyJobs) ? companyJobs : [];
  const selfSector = inferCompanySector(selfName, selfJobs);

  const selfTagSet = new Set();
  for (const job of selfJobs) {
    for (const t of getJobTags(job)) {
      const n = String(t || "").trim().toLowerCase();
      if (n.length >= 2) selfTagSet.add(n);
    }
  }

  const byName = new Map();
  for (const job of Array.isArray(allJobs) ? allJobs : []) {
    const name = getCompanyName(job);
    if (!name) continue;
    if (companySlug(name) === selfSlugNorm) continue;
    const arr = byName.get(name) || [];
    arr.push(job);
    byName.set(name, arr);
  }

  const scored = [];
  for (const [name, jlist] of byName.entries()) {
    const slug = companySlug(name);
    const allForCompany = allJobs.filter((j) => companySlug(getCompanyName(j)) === slug);
    if (!shouldIndexCompanyPage(slug, allForCompany)) continue;

    const otherTags = new Set();
    for (const job of jlist) {
      for (const t of getJobTags(job)) {
        const n = String(t || "").trim().toLowerCase();
        if (n.length >= 2) otherTags.add(n);
      }
    }
    let overlapCount = 0;
    for (const t of otherTags) {
      if (selfTagSet.has(t)) overlapCount += 1;
    }

    const otherSector = inferCompanySector(name, jlist);
    const sameSector = Boolean(selfSector && otherSector && selfSector.id === otherSector.id);

    scored.push({
      name,
      slug,
      roleCount: jlist.length,
      overlapCount,
      sameSector,
    });
  }

  const tagMatches = scored
    .filter((r) => r.overlapCount > 0)
    .sort((a, b) => {
      if (b.overlapCount !== a.overlapCount) return b.overlapCount - a.overlapCount;
      if (b.sameSector !== a.sameSector) return (b.sameSector ? 1 : 0) - (a.sameSector ? 1 : 0);
      if (b.roleCount !== a.roleCount) return b.roleCount - a.roleCount;
      return a.name.localeCompare(b.name);
    });

  const sectorMatches = scored
    .filter((r) => r.overlapCount === 0 && r.sameSector)
    .sort((a, b) => b.roleCount - a.roleCount || a.name.localeCompare(b.name));

  const out = [];
  const seen = new Set();
  const pushRow = (r) => {
    if (out.length >= max || seen.has(r.slug)) return;
    seen.add(r.slug);
    out.push({ name: r.name, slug: r.slug, roleCount: r.roleCount });
  };

  for (const r of tagMatches) pushRow(r);
  for (const r of sectorMatches) pushRow(r);

  return out;
}
