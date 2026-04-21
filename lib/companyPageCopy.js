import {
  getCompanyLogoUrl,
  getCompanyName,
  getJobFamily,
  getJobTags,
  getLocationDisplayText,
} from "@/lib/jobFieldHelpers";
import { lookupCompanyDescription } from "@/lib/companyDescriptionMatch";
import { enrichmentLogoCandidateUrls } from "@/lib/enrichmentLogoUrls";
import { titleCaseLabelWords } from "@/lib/tagLabelFormat";

/**
 * @param {Record<string, unknown>[]} jobs
 * @returns {string[]}
 */
function sortedJobsStable(jobs) {
  return [...(Array.isArray(jobs) ? jobs : [])].sort((a, b) => {
    const ia = String(a?.id ?? "").localeCompare(String(b?.id ?? ""));
    if (ia !== 0) return ia;
    return String(a?.title ?? "").localeCompare(String(b?.title ?? ""));
  });
}

/** Excludes "other" (any casing) and empty. */
function isValidFamily(value) {
  const f = String(value || "").trim();
  if (!f) return false;
  return f.toLowerCase() !== "other";
}

/** Simple title-style fix for family labels (e.g. engineering → Engineering). */
export function capitalizeFamilyLabel(value) {
  const t = String(value || "").trim();
  if (!t) return t;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

const TAG_STOPWORDS = new Set(["drone", "uav", "uas", "unmanned", "other"]);

/**
 * Tags for overview copy: drop stopwords, short tokens, dedupe by lowercase.
 * @param {string} raw
 * @returns {string|null} canonical display string or null to skip
 */
function normalizeTagForOverview(raw) {
  const t = String(raw || "").trim();
  if (t.length < 3) return null;
  const key = t.toLowerCase();
  if (TAG_STOPWORDS.has(key)) return null;
  return t;
}

/**
 * @param {string[]} tags max 3
 * @returns {string} list fragment for "Key areas include …"
 */
function formatKeyAreasTagList(tags) {
  const t = tags.filter(Boolean);
  if (t.length === 0) return "";
  if (t.length === 1) return t[0];
  if (t.length === 2) return `${t[0]} and ${t[1]}`;
  return `${t[0]}, ${t[1]}, and ${t[2]}`;
}

/**
 * Unique non-empty location strings, sorted alphabetically.
 * @param {Record<string, unknown>[]} jobs
 * @returns {string[]}
 */
export function uniqueLocationsSorted(jobs) {
  const set = new Set();
  for (const job of sortedJobsStable(jobs)) {
    const loc = String(getLocationDisplayText(job) || "").trim();
    if (loc) set.add(loc);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

/**
 * 1 unique → show it; 2 → list both; 3 → two + "And More"; >3 → "Multiple Locations".
 * Tag-style phrasing uses title case; comma-containing lines stay as returned from job data.
 * @param {Record<string, unknown>[]} jobs
 * @returns {string}
 */
export function formatLocationSummary(jobs) {
  const locs = uniqueLocationsSorted(jobs);
  const n = locs.length;
  if (n === 0) return "";
  if (n === 1) return locs[0];
  if (n === 2) return `${locs[0]} and ${locs[1]}`;
  if (n === 3) return `${locs[0]}, ${locs[1]}, And More`;
  return "Multiple Locations";
}

/**
 * @param {Map<string, number>} counts
 * @param {number} limit
 * @returns {string[]}
 */
function topKeysByCountThenAlpha(counts, limit) {
  return [...counts.entries()]
    .filter(([, c]) => c > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([k]) => k);
}

/** Role signal → domain tags (optional) → scale signal (optional). */
const OVERVIEW_MAX_SENTENCES = 3;

/**
 * @param {string} companyName
 * @param {Record<string, unknown>[]} jobs
 * @returns {{ sentences: string[] }}
 */
export function buildCompanyOverview(companyName, jobs) {
  const list = Array.isArray(jobs) ? jobs : [];
  const name = String(companyName || "").trim() || "This company";
  if (list.length === 0) {
    return { sentences: [`${name} is tracked on Drone Roles.`] };
  }

  const familyCounts = new Map();
  const tagDisplay = new Map();
  const tagCounts = new Map();

  for (const job of list) {
    const fam = String(getJobFamily(job) || "").trim();
    if (fam && isValidFamily(fam)) {
      familyCounts.set(fam, (familyCounts.get(fam) || 0) + 1);
    }
    for (const tag of getJobTags(job)) {
      const display = normalizeTagForOverview(tag);
      if (!display) continue;
      const key = display.toLowerCase();
      if (!tagDisplay.has(key)) tagDisplay.set(key, display);
      tagCounts.set(key, (tagCounts.get(key) || 0) + 1);
    }
  }

  const familyKeys = topKeysByCountThenAlpha(familyCounts, 2);
  const familyNameKeys = new Set(
    [...familyCounts.keys()].map((k) => String(k || "").trim().toLowerCase()).filter(Boolean)
  );

  const topTagKeys = topKeysByCountThenAlpha(tagCounts, 8);
  const topTags = [];
  for (const k of topTagKeys) {
    if (topTags.length >= 3) break;
    const display = tagDisplay.get(k) || k;
    const lower = String(display).trim().toLowerCase();
    if (!lower || familyNameKeys.has(lower)) continue;
    topTags.push(display);
  }

  let hiring;
  if (familyKeys.length === 0) {
    hiring = `${name} is currently hiring for roles across its drone operations.`;
  } else if (familyKeys.length === 1) {
    hiring = `${name} hires primarily for ${capitalizeFamilyLabel(familyKeys[0])}.`;
  } else {
    const f1 = capitalizeFamilyLabel(familyKeys[0]);
    const f2 = capitalizeFamilyLabel(familyKeys[1]);
    hiring = `${name} hires primarily for ${f1} and ${f2} roles.`;
  }

  const n = list.length;
  let scale = null;
  if (n >= 50) {
    scale = `${name} is one of the more active hiring companies in this space.`;
  }

  let keyAreas = null;
  if (topTags.length > 0) {
    const tagPart = formatKeyAreasTagList(topTags);
    if (tagPart) {
      keyAreas = `Key areas include ${tagPart}.`;
    }
  }

  const sentences = [hiring];
  if (keyAreas) sentences.push(keyAreas);
  if (scale) sentences.push(scale);

  return { sentences: sentences.slice(0, OVERVIEW_MAX_SENTENCES) };
}

/**
 * @param {Record<string, unknown>[]} companyJobs
 * @returns {{ openRoles: number, topFamilies: string[], locationLine: string }}
 */
export function buildHiringSignalBlock(companyJobs) {
  const list = Array.isArray(companyJobs) ? companyJobs : [];
  const familyCounts = new Map();
  for (const job of list) {
    const fam = String(getJobFamily(job) || "").trim();
    if (fam && isValidFamily(fam)) {
      familyCounts.set(fam, (familyCounts.get(fam) || 0) + 1);
    }
  }
  const topFamilies = topKeysByCountThenAlpha(familyCounts, 2).map((k) =>
    titleCaseLabelWords(capitalizeFamilyLabel(k))
  );
  let locationLine = formatLocationSummary(list);
  if (locationLine && !/,/.test(locationLine)) {
    locationLine = titleCaseLabelWords(locationLine);
  }
  return {
    openRoles: list.length,
    topFamilies,
    locationLine,
  };
}

/**
 * Map job family labels (Pilot, Engineering, …) to natural people-focused nouns for prose.
 * Avoids awkward phrasing like "extra attention to Engineering and Technician".
 */
function jobFamilyToPeoplePhrase(family) {
  const f = String(family || "").trim().toLowerCase();
  switch (f) {
    case "engineering":
      return "engineers";
    case "technician":
      return "technicians";
    case "pilot":
      return "pilots";
    case "operator":
      return "operators";
    case "testing":
      return "test engineers";
    case "field engineering":
      return "field engineers";
    case "business development":
    case "business_development":
      return "business development teams";
    case "administrative":
      return "administrative teams";
    case "other":
      return "specialists";
    default:
      if (!f) return "specialists";
      return `${capitalizeFamilyLabel(family).toLowerCase()} roles`;
  }
}

/**
 * One-line copy for the company page “Current Trends” block.
 * @param {string} companyName
 * @param {{ topFamilies?: string[] }} hiring — typically from {@link buildHiringSignalBlock}
 */
export function formatCompanyCurrentTrendsLine(companyName, hiring) {
  const name = String(companyName || "This company").trim();
  const families = Array.isArray(hiring?.topFamilies) ? hiring.topFamilies.filter(Boolean) : [];

  if (families.length >= 2) {
    const p1 = jobFamilyToPeoplePhrase(families[0]);
    const p2 = jobFamilyToPeoplePhrase(families[1]);
    return `${name} seems to be paying extra attention to ${p1} and ${p2} for their current hiring.`;
  }
  if (families.length === 1) {
    const p = jobFamilyToPeoplePhrase(families[0]);
    return `${name} seems to be paying extra attention to ${p} for their current hiring.`;
  }
  return `${name} is actively hiring across several areas—review the open roles below.`;
}

/** Status values that suppress enrichment-provided logos on the company page. */
const ENRICHMENT_LOGO_SUPPRESSED = new Set(["omit", "none", "invalid", "hidden"]);

/**
 * Company Descriptions (generated JSON) is the primary logo source for company pages; job rows
 * are a fallback when enrichment has no URL or status suppresses display.
 * @param {Record<string, unknown>[]} companyJobs
 * @param {Record<string, unknown>|null} enrichment
 * @returns {string|null}
 */
export function resolveCompanyPageLogoUrl(companyJobs, enrichment) {
  if (enrichment) {
    const url = String(enrichment.logoUrl ?? "").trim();
    const status = String(enrichment.logoStatus ?? "").trim().toLowerCase();
    if (url && !ENRICHMENT_LOGO_SUPPRESSED.has(status)) {
      return url;
    }
  }
  return pickFirstCompanyLogoUrl(companyJobs);
}

/**
 * Primary URL matches {@link resolveCompanyPageLogoUrl}. Includes favicon/logo fallbacks for enrichment.
 * @param {Record<string, unknown>[]} companyJobs
 * @param {Record<string, unknown>|null} enrichment
 * @returns {{ primaryUrl: string|null, fallbackUrl: string|null, fallbackUrls: string[] }}
 */
export function getCompanyPageLogoUrlsForDisplay(companyJobs, enrichment) {
  const jobUrl = pickFirstCompanyLogoUrl(companyJobs);
  if (enrichment) {
    const u = String(enrichment.logoUrl ?? "").trim();
    const status = String(enrichment.logoStatus ?? "").trim().toLowerCase();
    if (u && !ENRICHMENT_LOGO_SUPPRESSED.has(status)) {
      const chain = enrichmentLogoCandidateUrls(enrichment);
      const primaryUrl = chain[0] ?? u;
      const rest = chain.slice(1);
      if (jobUrl && jobUrl !== primaryUrl && !rest.includes(jobUrl)) {
        rest.push(jobUrl);
      }
      return {
        primaryUrl,
        fallbackUrl: rest[0] ?? null,
        fallbackUrls: rest,
      };
    }
  }
  return { primaryUrl: jobUrl, fallbackUrl: null, fallbackUrls: [] };
}

/**
 * First logo URL in stable job order.
 * @param {Record<string, unknown>[]} companyJobs
 * @returns {string|null}
 */
export function pickFirstCompanyLogoUrl(companyJobs) {
  for (const job of sortedJobsStable(Array.isArray(companyJobs) ? companyJobs : [])) {
    const u = getCompanyLogoUrl(job);
    if (u) return u;
  }
  return null;
}

/**
 * Job cards / preview / job detail: prefer ATS/job-hosted logo; Company Descriptions + favicon chain if primary image fails.
 * @param {Record<string, unknown>|null|undefined} job
 * @returns {{ primaryUrl: string|null, fallbackUrl: string|null, fallbackUrls: string[] }}
 */
export function getJobListingLogoUrlsForDisplay(job) {
  if (!job) return { primaryUrl: null, fallbackUrl: null, fallbackUrls: [] };
  const jobUrl = getCompanyLogoUrl(job);
  const company = getCompanyName(job);
  const enrichment = company ? lookupCompanyDescription(company) : null;

  let enrichChain = [];
  if (enrichment) {
    const u = String(enrichment.logoUrl ?? "").trim();
    const status = String(enrichment.logoStatus ?? "").trim().toLowerCase();
    if (u && !ENRICHMENT_LOGO_SUPPRESSED.has(status)) {
      enrichChain = enrichmentLogoCandidateUrls(enrichment);
    }
  }

  if (jobUrl) {
    const rest = enrichChain.filter((x) => x && x !== jobUrl);
    return {
      primaryUrl: jobUrl,
      fallbackUrl: rest[0] ?? null,
      fallbackUrls: rest,
    };
  }

  const primaryUrl = enrichChain[0] ?? null;
  const rest = enrichChain.slice(1);
  return {
    primaryUrl,
    fallbackUrl: rest[0] ?? null,
    fallbackUrls: rest,
  };
}

/**
 * @param {Record<string, unknown>|null|undefined} job
 * @returns {string|null}
 */
export function resolveJobListingLogoUrl(job) {
  const { primaryUrl } = getJobListingLogoUrlsForDisplay(job);
  return primaryUrl;
}

/**
 * Companies directory: enrichment-only (no per-job row).
 * @param {string} companyName
 * @returns {{ primaryUrl: string|null, fallbackUrl: string|null, fallbackUrls: string[] }}
 */
export function getCompanyDirectoryLogoUrlsForDisplay(companyName) {
  const n = String(companyName || "").trim();
  if (!n) return { primaryUrl: null, fallbackUrl: null, fallbackUrls: [] };
  const enrichment = lookupCompanyDescription(n);
  if (!enrichment) return { primaryUrl: null, fallbackUrl: null, fallbackUrls: [] };
  const u = String(enrichment.logoUrl ?? "").trim();
  const status = String(enrichment.logoStatus ?? "").trim().toLowerCase();
  if (!u || ENRICHMENT_LOGO_SUPPRESSED.has(status)) {
    return { primaryUrl: null, fallbackUrl: null, fallbackUrls: [] };
  }
  const chain = enrichmentLogoCandidateUrls(enrichment);
  return {
    primaryUrl: chain[0] ?? null,
    fallbackUrl: chain[1] ?? null,
    fallbackUrls: chain.slice(1),
  };
}
