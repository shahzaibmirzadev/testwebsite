import { BROWSE_CATEGORIES } from "./categoryMeta";
import { getCompanyName, getJobFamily, getLocationText } from "./jobFieldHelpers";
import { countRecentlyPostedRoles } from "./recentRoleCounts";

/**
 * When true, the location still has a `/location/[slug]` page but is omitted from `/locations`
 * and from the homepage location carousel (low-volume / secondary markets).
 */

const LOCATION_PAGE_CONFIGS = [
  {
    slug: "germany",
    label: "Germany",
    accentColor: "#111111",
    matchTerms: ["germany", "berlin", "munich", "hamburg", "frankfurt", "cologne", "stuttgart"],
    relatedSlugs: ["uk", "europe", "france"],
  },
  {
    slug: "uk",
    label: "UK",
    accentColor: "#1d3557",
    matchTerms: [
      "uk",
      "united kingdom",
      "england",
      "scotland",
      "wales",
      "northern ireland",
      "london",
      "manchester",
      "birmingham",
      "glasgow",
    ],
    relatedSlugs: ["germany", "france", "europe"],
  },
  {
    slug: "usa",
    label: "USA",
    accentColor: "#b91c1c",
    matchTerms: [
      "usa",
      "u.s.a",
      "united states",
      "united states of america",
      "u.s.",
      "new york",
      "san francisco",
      "los angeles",
      "chicago",
      "texas",
      "california",
      "washington",
    ],
    relatedSlugs: ["canada", "uk", "europe"],
  },
  {
    slug: "france",
    label: "France",
    accentColor: "#1d4ed8",
    matchTerms: ["france", "paris", "lyon", "marseille", "toulouse", "nice"],
    relatedSlugs: ["germany", "uk", "europe"],
  },
  {
    slug: "netherlands",
    label: "Netherlands",
    accentColor: "#7f1d1d",
    matchTerms: ["netherlands", "amsterdam", "rotterdam", "eindhoven", "den haag", "utrecht", "hague"],
    relatedSlugs: ["germany", "france", "europe"],
  },
  {
    slug: "canada",
    label: "Canada",
    accentColor: "#dc2626",
    hideFromDirectory: true,
    matchTerms: ["canada", "toronto", "vancouver", "montreal", "ottawa", "calgary", "edmonton"],
    relatedSlugs: ["usa", "uk", "europe"],
  },
  {
    slug: "australia",
    label: "Australia",
    accentColor: "#1e3a8a",
    matchTerms: ["australia", "sydney", "melbourne", "brisbane", "perth", "adelaide", "canberra"],
    relatedSlugs: ["europe", "uk", "india"],
  },
  {
    slug: "spain",
    label: "Spain",
    accentColor: "#991b1b",
    hideFromDirectory: true,
    matchTerms: ["spain", "madrid", "barcelona", "valencia", "seville", "bilbao"],
    relatedSlugs: ["france", "italy", "europe"],
  },
  {
    slug: "italy",
    label: "Italy",
    accentColor: "#166534",
    hideFromDirectory: true,
    matchTerms: ["italy", "rome", "milan", "turin", "bologna", "naples"],
    relatedSlugs: ["spain", "france", "europe"],
  },
  {
    slug: "india",
    label: "India",
    accentColor: "#b45309",
    matchTerms: [
      "india",
      "bangalore",
      "bengaluru",
      "mumbai",
      "delhi",
      "new delhi",
      "hyderabad",
      "pune",
      "chennai",
      "kolkata",
      "gurgaon",
      "gurugram",
      "noida",
      "ahmedabad",
      "jaipur",
    ],
    relatedSlugs: ["europe", "australia", "usa"],
  },
  {
    slug: "europe",
    label: "Europe",
    accentColor: "#1e40af",
    matchTerms: [
      "europe",
      "eu",
      "european union",
      "germany",
      "france",
      "spain",
      "italy",
      "netherlands",
      "belgium",
      "austria",
      "portugal",
      "poland",
      "sweden",
      "denmark",
      "finland",
      "ireland",
      "czechia",
      "czech republic",
      "romania",
      "greece",
    ],
    relatedSlugs: ["germany", "uk", "france"],
  },
];

const LOCATION_FLAG_URLS = {
  germany: "https://flagcdn.com/w80/de.png",
  uk: "https://flagcdn.com/w80/gb-eng.png",
  usa: "https://flagcdn.com/w80/us.png",
  france: "https://flagcdn.com/w80/fr.png",
  netherlands: "https://flagcdn.com/w80/nl.png",
  canada: "https://flagcdn.com/w80/ca.png",
  australia: "https://flagcdn.com/w80/au.png",
  spain: "https://flagcdn.com/w80/es.png",
  italy: "https://flagcdn.com/w80/it.png",
  india: "https://flagcdn.com/w80/in.png",
  europe: "https://flagcdn.com/w80/eu.png",
};

function toLower(value) {
  return String(value || "").trim().toLowerCase();
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Avoid substring false positives (e.g. "us" in "discuss") while keeping phrase matches.
 */
function locationTextMatchesTerm(locationText, termRaw) {
  const term = toLower(termRaw);
  if (!term || !locationText) return false;
  if (/^[a-z]+$/i.test(term)) {
    return new RegExp(`\\b${escapeRegex(term)}\\b`, "i").test(locationText);
  }
  if (term.includes(" ") || term.includes(".")) {
    return locationText.includes(term);
  }
  if (term.length <= 3) {
    return new RegExp(`\\b${escapeRegex(term)}\\b`, "i").test(locationText);
  }
  return locationText.includes(term);
}

function homeCardGradientFromAccent(hexColor) {
  const hex = String(hexColor || "#2563eb").trim();
  return `linear-gradient(135deg, ${hex} 0%, #93c5fd 100%)`;
}

function getRecencyTimestamp(job) {
  const raw = String(job?.posted_at || job?.last_seen_at || job?.updated_at || "").trim();
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function getLocationConfigs() {
  return LOCATION_PAGE_CONFIGS.slice();
}

export function getLocationConfigBySlug(slug) {
  const normalizedSlug = toLower(slug);
  return LOCATION_PAGE_CONFIGS.find((config) => config.slug === normalizedSlug) || null;
}

export function getLocationPagePath(slug) {
  return `/location/${String(slug || "").trim().toLowerCase()}`;
}

export function getLocationFlagUrlBySlug(slug) {
  const key = String(slug || "").trim().toLowerCase();
  return LOCATION_FLAG_URLS[key] || "";
}

export const MIN_LOCATION_DIRECTORY_ROLES = 3;

const DEFAULT_DIRECTORY_GRADIENT =
  "linear-gradient(135deg, #2563eb 0%, #3b82f6 50%, #93c5fd 100%)";

function sortLocationsGermanyFirst(configs) {
  return [...configs].sort((a, b) => {
    if (a.slug === "germany") return -1;
    if (b.slug === "germany") return 1;
    return a.label.localeCompare(b.label);
  });
}

/**
 * Core country/city token match only (no Europe rollup).
 */
function jobMatchesLocationTermsOnly(job, locationConfig) {
  const locationText = toLower(getLocationText(job));
  if (!locationText || !locationConfig) return false;
  return locationConfig.matchTerms.some((term) => locationTextMatchesTerm(locationText, term));
}

/**
 * European country pages whose matchTerms (incl. cities) roll up into `/location/europe`.
 * Without this, "Berlin" matches Germany but not Europe—Europe only had "germany", not "berlin".
 */
const EU_ROLLUP_SUBLOCATION_SLUGS = ["germany", "uk", "france", "netherlands", "spain", "italy"];

export function jobMatchesLocation(job, locationConfig) {
  if (!locationConfig) return false;
  // US city/company tokens (e.g. "texas" in "Texas Instruments") must not beat India when the row is Indian.
  if (locationConfig.slug === "usa") {
    const indiaCfg = getLocationConfigBySlug("india");
    if (indiaCfg && jobMatchesLocationTermsOnly(job, indiaCfg)) return false;
  }
  if (jobMatchesLocationTermsOnly(job, locationConfig)) return true;
  if (locationConfig.slug === "europe") {
    for (const slug of EU_ROLLUP_SUBLOCATION_SLUGS) {
      const sub = getLocationConfigBySlug(slug);
      if (sub && jobMatchesLocationTermsOnly(job, sub)) return true;
    }
  }
  return false;
}

function buildTopLocationSamples(jobs, limit = 6) {
  const counts = new Map();
  for (const job of Array.isArray(jobs) ? jobs : []) {
    const key = String(getLocationText(job) || "").trim();
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, Math.max(1, limit))
    .map(([location, count]) => ({ location, count }));
}

export function countJobsForLocationSlug(jobs, slug) {
  const locationConfig = getLocationConfigBySlug(slug);
  if (!locationConfig) return 0;
  const allJobs = Array.isArray(jobs) ? jobs : [];
  return allJobs.reduce((n, job) => (jobMatchesLocation(job, locationConfig) ? n + 1 : n), 0);
}

/**
 * Slug → job count for public surfaces (homepage API, client fallback). Omits `hideFromDirectory`.
 * @param {Record<string, unknown>[]} jobs
 */
export function buildLocationSlugCounts(jobs) {
  const allJobs = Array.isArray(jobs) ? jobs : [];
  const out = {};
  for (const config of getLocationConfigs()) {
    if (config.hideFromDirectory) continue;
    out[config.slug] = countJobsForLocationSlug(allJobs, config.slug);
  }
  return out;
}

/**
 * Homepage carousel cards: one entry per public location page (`hideFromDirectory` omitted).
 * Counts are applied separately so API/client job lists can disagree without dropping a slug.
 */
export function getHomepageLocationCardDefinitions() {
  const items = [];
  for (const config of sortLocationsGermanyFirst(getLocationConfigs())) {
    if (config.hideFromDirectory) continue;
    items.push({
      slug: config.slug,
      label: config.label,
      gradient: homeCardGradientFromAccent(config.accentColor),
      flagUrl: getLocationFlagUrlBySlug(config.slug),
    });
  }
  return items;
}

export function getJobsForLocation(jobs, slug) {
  const locationConfig = getLocationConfigBySlug(slug);
  if (!locationConfig) {
    console.warn("location_page_unknown_slug", { slug });
    return [];
  }
  const allJobs = Array.isArray(jobs) ? jobs : [];
  const matches = allJobs
    .filter((job) => jobMatchesLocation(job, locationConfig))
    .sort((a, b) => getRecencyTimestamp(b) - getRecencyTimestamp(a));

  if (matches.length < 5) {
    console.warn("location_page_few_matches", {
      slug: locationConfig.slug,
      label: locationConfig.label,
      count: matches.length,
      sampleTopLocations: buildTopLocationSamples(allJobs),
    });
  }
  return matches;
}

export function getTopCompaniesForJobs(jobs, limit = 5) {
  const counts = new Map();
  for (const job of Array.isArray(jobs) ? jobs : []) {
    const name = String(getCompanyName(job) || "").trim();
    if (!name) continue;
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, Math.max(1, limit))
    .map(([name, roleCount]) => ({ name, roleCount }));
}

/**
 * Directory rows for /locations: only regions with ≥ MIN_LOCATION_DIRECTORY_ROLES active matches.
 * @param {Record<string, unknown>[]} jobs
 */
export function buildLocationDirectoryRows(jobs) {
  const allJobs = Array.isArray(jobs) ? jobs : [];
  const specialties = BROWSE_CATEGORIES.filter((c) => typeof c?.matcher === "function");
  const safeMatch = (specialty, job) => {
    try {
      return Boolean(specialty?.matcher?.(job));
    } catch {
      return false;
    }
  };
  const rows = [];

  for (const config of sortLocationsGermanyFirst(getLocationConfigs())) {
    if (config.hideFromDirectory) continue;
    const locationJobs = getJobsForLocation(allJobs, config.slug);
    if (locationJobs.length < MIN_LOCATION_DIRECTORY_ROLES) continue;

    let lastSeenAt = null;
    for (const job of locationJobs) {
      const ts = String(job?.last_seen_at || job?.posted_at || job?.updated_at || "").trim();
      if (!ts) continue;
      const next = Date.parse(ts);
      if (!Number.isFinite(next)) continue;
      const prev = lastSeenAt ? Date.parse(String(lastSeenAt)) : NaN;
      if (!lastSeenAt || !Number.isFinite(prev) || next > prev) {
        lastSeenAt = ts;
      }
    }

    let dominantSpecialty = null;
    let dominantSpecialtyCount = 0;
    for (const specialty of specialties) {
      const count = locationJobs.reduce((n, job) => (safeMatch(specialty, job) ? n + 1 : n), 0);
      if (count > dominantSpecialtyCount) {
        dominantSpecialtyCount = count;
        dominantSpecialty = specialty;
      }
    }

    const familyCounts = new Map();
    for (const job of locationJobs) {
      const f = String(getJobFamily(job) || "").trim();
      if (!f) continue;
      familyCounts.set(f, (familyCounts.get(f) || 0) + 1);
    }
    const topFamilies = [...familyCounts.entries()]
      .filter(([label]) => String(label || "").trim().toLowerCase() !== "other")
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 3)
      .map(([label]) => label);
    const directoryRolesLabel =
      topFamilies.length > 0
        ? `Most active roles: ${topFamilies.join(", ")}`
        : "Most active roles: Mixed / unclassified";

    rows.push({
      slug: config.slug,
      name: config.label,
      roleCount: locationJobs.length,
      recentRoleCount: countRecentlyPostedRoles(locationJobs),
      lastSeenAt,
      dominantSectorGradient: dominantSpecialty?.gradient || DEFAULT_DIRECTORY_GRADIENT,
      directoryRolesLabel,
    });
  }

  return rows;
}

export function buildLocationStats(jobs) {
  const list = Array.isArray(jobs) ? jobs : [];
  const companySet = new Set();
  const roleTypeCounts = new Map();

  for (const job of list) {
    const companyName = String(getCompanyName(job) || "").trim();
    if (companyName) companySet.add(companyName.toLowerCase());

    const roleType = String(job?.job_family || job?.department || job?.team || "").trim();
    if (roleType) roleTypeCounts.set(roleType, (roleTypeCounts.get(roleType) || 0) + 1);
  }

  let topRoleTypeLabel = "";
  let topRoleTypeCount = 0;
  for (const [label, count] of roleTypeCounts) {
    if (count > topRoleTypeCount) {
      topRoleTypeCount = count;
      topRoleTypeLabel = label;
    }
  }

  return {
    activeJobs: list.length,
    recentActiveJobs: countRecentlyPostedRoles(list),
    companiesHiring: companySet.size,
    freshThisWeek: countRecentlyPostedRoles(list, 7),
    topRoleTypeLabel,
    topRoleTypeCount,
  };
}

