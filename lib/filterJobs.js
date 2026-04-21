import {
  getCompanyName,
  getEmploymentType,
  getJobDate,
  getJobFamily,
  getJobTags,
  getLocationText,
  getRemoteStatus,
  getSeniority,
} from "./jobFieldHelpers";
import { matchesSectorId } from "./sectorLogic";

/** @typedef {import('./filterConfig').createInitialFilterState extends () => infer R ? R : never} FilterState */

const EU_KEYS = [
  "europe",
  "eu,",
  " eu",
  "uk,",
  " uk",
  "united kingdom",
  "germany",
  "france",
  "italy",
  "spain",
  "netherlands",
  "sweden",
  "switzerland",
  "ireland",
  "belgium",
  "austria",
  "poland",
  "norway",
  "denmark",
  "finland",
  "portugal",
  "european",
];

const NA_KEYS = [
  "north america",
  "united states",
  "usa",
  "u.s.",
  "canada",
  "california",
  "texas",
  "new york",
  "colorado",
  "washington",
  "florida",
  "arizona",
  "illinois",
  "massachusetts",
  "georgia",
  "virginia",
  "oregon",
  "utah",
  "michigan",
  "ohio",
  "tennessee",
  "minnesota",
  "costa mesa",
];

const AS_KEYS = [
  "asia",
  "china",
  "japan",
  "india",
  "singapore",
  "korea",
  "taiwan",
  "thailand",
  "vietnam",
  "indonesia",
  "malaysia",
  "philippines",
  "hong kong",
  "australia",
  "new zealand",
];

const CEE_KEYS = [
  "poland",
  "czech",
  "czechia",
  "slovakia",
  "hungary",
  "romania",
  "bulgaria",
  "croatia",
  "slovenia",
  "serbia",
  "estonia",
  "latvia",
  "lithuania",
  "ukraine",
];

const NORDICS_KEYS = [
  "sweden",
  "norway",
  "denmark",
  "finland",
  "iceland",
  "nordic",
  "scandin",
];

const MENA_KEYS = [
  "middle east",
  "uae",
  "dubai",
  "abu dhabi",
  "saudi",
  "qatar",
  "kuwait",
  "oman",
  "bahrain",
  "egypt",
  "morocco",
  "algeria",
  "tunisia",
  "israel",
  "jordan",
];

const LATAM_KEYS = [
  "latin america",
  "latam",
  "mexico",
  "brazil",
  "argentina",
  "chile",
  "colombia",
  "peru",
  "uruguay",
  "ecuador",
  "costa rica",
  "panama",
];

const REGION_QUERY_GROUPS = {
  emea: [...EU_KEYS, ...MENA_KEYS, "africa", "south africa", "nigeria", "kenya"],
  europe: EU_KEYS,
  eu: EU_KEYS,
  cee: CEE_KEYS,
  nordics: NORDICS_KEYS,
  apac: AS_KEYS,
  asia: AS_KEYS,
  latam: LATAM_KEYS,
  "north america": NA_KEYS,
  na: NA_KEYS,
};

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsLocationToken(haystack, needle) {
  const text = String(haystack || "").toLowerCase();
  const term = String(needle || "").trim().toLowerCase();
  if (!text || !term) return false;

  // Very short region tokens (e.g. "us", "uk", "eu") should be word-boundary matches.
  if (term.length <= 3 || /^[a-z]\.[a-z]\.$/.test(term)) {
    return new RegExp(`\\b${escapeRegExp(term)}\\b`, "i").test(text);
  }

  return text.includes(term);
}

/**
 * @param {string} location
 * @param {string} regionLabel
 */
function locationMatchesRegion(location, regionLabel) {
  const loc = location.toLowerCase();
  if (regionLabel === "Remote") {
    return /\bremote\b/i.test(location);
  }
  if (regionLabel === "Europe") {
    return EU_KEYS.some((k) => containsLocationToken(loc, k));
  }
  if (regionLabel === "North America") {
    return NA_KEYS.some((k) => containsLocationToken(loc, k));
  }
  if (regionLabel === "Asia") {
    return AS_KEYS.some((k) => containsLocationToken(loc, k));
  }
  return false;
}

/**
 * Loose match: structured field if present, else title / tags / location substring.
 * @param {Record<string, unknown>} job
 * @param {string[]} selected
 * @param {(j: Record<string, unknown>) => string|null} fieldGetter
 */
function matchesMulti(job, selected, fieldGetter) {
  if (!selected.length) return true;
  const fieldVal = fieldGetter(job);
  const title = String(job.title ?? "").toLowerCase();
  const blob = [
    fieldVal,
    title,
    getLocationText(job).toLowerCase(),
    ...getJobTags(job).map((t) => t.toLowerCase()),
  ]
    .filter(Boolean)
    .join(" ");

  return selected.some((sel) => {
    const s = sel.toLowerCase();
    if (fieldVal) {
      const fv = fieldVal.toLowerCase();
      if (fv === s || fv.includes(s) || s.includes(fv)) return true;
    }
    if (title.includes(s)) return true;
    if (blob.includes(s)) return true;
    return false;
  });
}

/**
 * @param {Record<string, unknown>} job
 * @param {FilterState} state
 */
function keywordMatches(job, state) {
  const q = state.keyword.trim().toLowerCase();
  if (!q) return true;
  const tags = getJobTags(job).join(" ").toLowerCase();
  const parts = [
    job.title,
    job.company,
    job.location,
    tags,
    job.description,
  ]
    .filter(Boolean)
    .map((x) => String(x).toLowerCase());
  return parts.some((p) => p.includes(q));
}

/**
 * @param {Record<string, unknown>} job
 * @param {FilterState} state
 */
function locationFilterMatches(job, state) {
  const q = state.location.trim().toLowerCase();
  if (!q) return true;
  const loc = getLocationText(job).toLowerCase();
  if (containsLocationToken(loc, q)) return true;

  // Broad region aliases (EMEA, CEE, Nordics, APAC, etc.) map to
  // common country/city tokens so users can search by geography clusters.
  const keys = REGION_QUERY_GROUPS[q];
  if (Array.isArray(keys) && keys.length > 0) {
    return keys.some((k) => containsLocationToken(loc, k));
  }
  return false;
}

/**
 * @param {Record<string, unknown>} job
 * @param {FilterState} state
 */
function postedWithinMatches(job, state) {
  if (state.postedWithin == null) return true;
  const d = getJobDate(job);
  if (!d) return true;
  const cutoff = Date.now() - state.postedWithin * 86400000;
  return d.getTime() >= cutoff;
}

/**
 * @param {Record<string, unknown>} job
 * @param {FilterState} state
 */
function regionsMatch(job, state) {
  if (!state.regions.length) return true;
  const loc = getLocationText(job);
  return state.regions.some((r) => locationMatchesRegion(loc, r));
}

/**
 * @param {Record<string, unknown>} job
 * @param {FilterState} state
 */
function companiesMatch(job, state) {
  if (!state.companies.length) return true;
  const c = getCompanyName(job).toLowerCase();
  return state.companies.some((x) => c === x.toLowerCase());
}

/**
 * Domain tags: job tags must include selected (any-of), or text blob contains label.
 * @param {Record<string, unknown>} job
 * @param {FilterState} state
 */
function tagsMatch(job, state) {
  if (!state.tags.length) return true;
  const jobTagLower = getJobTags(job).map((t) => t.toLowerCase());
  const blob = [
    String(job.title ?? "").toLowerCase(),
    String(job.description ?? "").toLowerCase(),
    ...jobTagLower,
  ].join(" ");

  return state.tags.some((tag) => {
    const t = tag.toLowerCase();
    if (jobTagLower.some((jt) => jt.includes(t) || t.includes(jt))) return true;
    return blob.includes(t);
  });
}

/**
 * @param {Record<string, unknown>} job
 * @param {FilterState} state
 */
function sectorMatch(job, state) {
  const sector = String(state.sector || "").trim();
  if (!sector) return true;
  return matchesSectorId(job, sector);
}

/**
 * @param {Record<string, unknown>} job
 * @param {FilterState} state
 */
export function jobMatchesFilters(job, state) {
  if (!sectorMatch(job, state)) return false;
  if (!keywordMatches(job, state)) return false;
  if (!locationFilterMatches(job, state)) return false;
  if (!postedWithinMatches(job, state)) return false;
  if (!regionsMatch(job, state)) return false;
  if (!companiesMatch(job, state)) return false;
  if (!tagsMatch(job, state)) return false;
  if (!matchesMulti(job, state.jobFamilies, getJobFamily)) return false;
  if (!matchesMulti(job, state.remote, getRemoteStatus)) return false;
  if (!matchesMulti(job, state.seniority, getSeniority)) return false;
  if (!matchesMulti(job, state.employmentTypes, getEmploymentType)) return false;
  return true;
}

/**
 * @param {Record<string, unknown>[]} jobs
 * @param {FilterState} state
 */
export function filterJobs(jobs, state) {
  return jobs.filter((j) => jobMatchesFilters(j, state));
}

/**
 * @param {Record<string, unknown>} job
 * @param {string} keyword
 */
function relevanceScore(job, keyword) {
  const q = keyword.trim().toLowerCase();
  const terms = q ? q.split(/\s+/).filter(Boolean) : [];
  const title = String(job.title ?? "").toLowerCase();
  const company = String(job.company ?? "").toLowerCase();
  const loc = getLocationText(job).toLowerCase();
  const tagStr = getJobTags(job)
    .join(" ")
    .toLowerCase();
  const remoteStatus = String(getRemoteStatus(job) || "").toLowerCase();

  const broadLocationPatterns = [
    /\bus\b/,
    /\busa\b/,
    /\bunited states\b/,
    /\bglobal\b/,
    /\bworldwide\b/,
    /\bmultiple locations\b/,
    /\bvarious locations\b/,
  ];

  const hasSpecificLocation =
    Boolean(loc) &&
    !broadLocationPatterns.some((pattern) => pattern.test(loc)) &&
    (/,/.test(loc) || /\b[a-z]+\s+[a-z]{2}\b/.test(loc) || loc.split(/\s+/).length >= 2);

  let score = 0;
  for (const term of terms) {
    if (!term) continue;
    if (title.includes(term)) score += 5;
    if (company.includes(term)) score += 3;
    if (tagStr.includes(term)) score += 4;
    if (loc.includes(term)) score += 2;
  }
  if (!terms.length && !q) return 0;
  if (!terms.length && q) {
    if (title.includes(q)) score += 5;
    if (company.includes(q)) score += 3;
    if (tagStr.includes(q)) score += 4;
    if (loc.includes(q)) score += 2;
  }

  // Soft preference: specific locations rank a bit higher than broad location labels.
  if (hasSpecificLocation) score += 2;
  if (remoteStatus === "remote") score += 2;
  if (remoteStatus === "hybrid") score += 1;

  return score;
}

/**
 * @param {Record<string, unknown>[]} jobs
 * @param {FilterState} state
 */
export function sortJobs(jobs, state) {
  const copy = [...jobs];
  if (state.sort === "relevance") {
    copy.sort(
      (a, b) =>
        relevanceScore(b, state.keyword) - relevanceScore(a, state.keyword)
    );
    return copy;
  }
  if (state.sort === "oldest") {
    copy.sort((a, b) => {
      const da = getJobDate(a)?.getTime() ?? 0;
      const db = getJobDate(b)?.getTime() ?? 0;
      return da - db;
    });
    return copy;
  }
  // newest
  copy.sort((a, b) => {
    const da = getJobDate(a)?.getTime() ?? 0;
    const db = getJobDate(b)?.getTime() ?? 0;
    return db - da;
  });
  return copy;
}

/**
 * @param {Record<string, unknown>[]} jobs
 * @param {FilterState} state
 */
export function filterAndSortJobs(jobs, state) {
  return sortJobs(filterJobs(jobs, state), state);
}
