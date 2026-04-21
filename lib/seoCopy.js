import { capitalizeFamilyLabel } from "@/lib/companyPageCopy";
import { getJobFamily, getJobTags } from "@/lib/jobFieldHelpers";

const JOB_LISTING_SUFFIX = " | Drone Jobs";
const JOB_LISTING_SEP = " at ";
/** Preferred max length for full job listing title tag (suffix never trimmed). */
export const JOB_LISTING_TITLE_MAX = 60;
const JOB_TITLE_INNER_MAX = JOB_LISTING_TITLE_MAX - JOB_LISTING_SUFFIX.length - JOB_LISTING_SEP.length;

const META_DESC_MAX = 155;

const INTRO_MAX_WORDS = 120;
const INTRO_MAX_SENTENCES = 3;

/**
 * Truncate to maxLen including optional ellipsis when shortened.
 * @param {string} text
 * @param {number} maxLen
 */
export function truncateAtWordBoundary(text, maxLen) {
  const t = String(text || "").trim();
  if (!t || t.length <= maxLen) return t;
  const ellipsis = "…";
  const budget = maxLen - ellipsis.length;
  if (budget < 4) return ellipsis;
  const slice = t.slice(0, budget);
  const lastSpace = slice.lastIndexOf(" ");
  const base =
    lastSpace > budget * 0.45 ? slice.slice(0, lastSpace).trimEnd() : slice.trimEnd();
  return `${base}${ellipsis}`;
}

/**
 * Trim only job title, then company, to fit "~60 chars" with fixed ` at ` and ` | Drone Jobs`.
 * @param {string} jobTitle
 * @param {string} companyName
 */
export function buildJobListingTitle(jobTitle, companyName) {
  const minJob = 10;
  const minCo = 4;
  let a = String(jobTitle || "Drone Role").trim();
  let b = String(companyName || "Drone Company").trim();

  while (a.length + b.length > JOB_TITLE_INNER_MAX) {
    const over = a.length + b.length - JOB_TITLE_INNER_MAX;
    if (a.length > minJob) {
      a = truncateAtWordBoundary(a, Math.max(minJob, a.length - over));
    } else if (b.length > minCo) {
      b = truncateAtWordBoundary(b, Math.max(minCo, b.length - over));
    } else {
      a = truncateAtWordBoundary(a, Math.max(minJob, JOB_TITLE_INNER_MAX - b.length));
      break;
    }
  }

  return `${a}${JOB_LISTING_SEP}${b}${JOB_LISTING_SUFFIX}`;
}

/**
 * @param {string} raw
 * @param {number} [max]
 */
export function clampMetaDescription(raw, max = META_DESC_MAX) {
  let s = String(raw || "")
    .trim()
    .replace(/\s+/g, " ");
  if (s.length > max) {
    s = truncateAtWordBoundary(s, max);
    s = String(s).trim().replace(/\s+/g, " ");
  }
  return s;
}

/** @param {string} jobTitle @param {string} company */
export function buildJobMetaDescription(jobTitle, company) {
  const j = String(jobTitle || "Drone Role").trim();
  const c = String(company || "Drone Company").trim();
  return clampMetaDescription(
    `Apply for ${j} at ${c}. View requirements, location, and similar drone jobs.`
  );
}

/** @param {string} companyName */
export function buildCompanyPageTitle(companyName) {
  const c = String(companyName || "Company").trim();
  return `${c} Jobs | Drone Roles at ${c}`;
}

/** @param {string} companyName */
export function buildCompanyMetaDescription(companyName) {
  const c = String(companyName || "Company").trim();
  return clampMetaDescription(
    `Explore ${c} jobs in the drone industry. See open roles, hiring focus, and related companies.`
  );
}

/**
 * Prefer spreadsheet copy when present; otherwise same as {@link buildCompanyMetaDescription}.
 * @param {{ description?: string, careersBlurb?: string } | null | undefined} enrichment
 * @param {string} companyName
 */
export function buildCompanyEnrichedMetaDescription(enrichment, companyName) {
  const d = String(enrichment?.description || "").trim();
  if (d) return clampMetaDescription(d);
  const c = String(enrichment?.careersBlurb || "").trim();
  if (c) return clampMetaDescription(c);
  return buildCompanyMetaDescription(companyName);
}

/** Category / hub page title base = H1 string */
export function buildCategoryPageTitle(categoryName) {
  const n = String(categoryName || "Drone Jobs").trim();
  return `${n} | Drone Jobs`;
}

/** @param {string} categoryName */
export function buildCategoryMetaDescription(categoryName) {
  const n = String(categoryName || "Drone Jobs").trim();
  return clampMetaDescription(
    `Browse ${n}. Find open roles, companies hiring, and related opportunities.`
  );
}

/** Guide landing: title base = H1 */
export function buildGuidePageTitle(guideName) {
  const n = String(guideName || "Guide").trim();
  return `${n} | Drone Roles`;
}

/** @param {string} guideName */
export function buildGuideMetaDescription(guideName) {
  const n = String(guideName || "Guide").trim();
  return clampMetaDescription(
    `Discover ${n}. Explore roles, hiring companies, and opportunities in this segment.`
  );
}

function wordCount(text) {
  return String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function limitToWords(text, maxWords) {
  const words = String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length <= maxWords) return words.join(" ");
  return words.slice(0, maxWords).join(" ");
}

function joinSentences(sentences) {
  const parts = sentences.filter((s) => String(s || "").trim());
  let text = parts.map((s) => String(s).trim()).join(" ");
  if (wordCount(text) > INTRO_MAX_WORDS) {
    text = limitToWords(text, INTRO_MAX_WORDS);
  }
  return text;
}

function formatOxford(names) {
  const list = names.map((n) => String(n || "").trim()).filter(Boolean);
  if (list.length === 0) return "";
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return `${list.slice(0, -1).join(", ")}, and ${list[list.length - 1]}`;
}

const CATEGORY_TAG_STOPWORDS = new Set(["drone", "uav", "uas", "unmanned", "other"]);

/**
 * @param {string} raw
 * @returns {string|null}
 */
function normalizeTagForCategoryIntro(raw) {
  const t = String(raw || "").trim();
  if (t.length < 3) return null;
  const key = t.toLowerCase();
  if (CATEGORY_TAG_STOPWORDS.has(key)) return null;
  return t;
}

/**
 * Top tags by count, excluding keys that match job family labels (case-insensitive).
 * @param {Record<string, unknown>[]} jobs
 * @param {Set<string>} excludeFamilyLower
 * @param {number} limit
 */
function topTagsForCategoryIntro(jobs, excludeFamilyLower, limit = 3) {
  const tagDisplay = new Map();
  const tagCounts = new Map();
  for (const job of Array.isArray(jobs) ? jobs : []) {
    for (const tag of getJobTags(job)) {
      const display = normalizeTagForCategoryIntro(tag);
      if (!display) continue;
      const key = display.toLowerCase();
      if (excludeFamilyLower.has(key)) continue;
      if (!tagDisplay.has(key)) tagDisplay.set(key, display);
      tagCounts.set(key, (tagCounts.get(key) || 0) + 1);
    }
  }
  return [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([k]) => tagDisplay.get(k) || k);
}

/**
 * Top job families by count among jobs (deterministic).
 * @param {Record<string, unknown>[]} jobs
 * @param {number} limit
 */
function topFamiliesFromJobs(jobs, limit = 4) {
  const counts = new Map();
  for (const job of Array.isArray(jobs) ? jobs : []) {
    const fam = String(getJobFamily(job) || "").trim();
    if (!fam) continue;
    counts.set(fam, (counts.get(fam) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([k]) => k);
}

/**
 * Category intro: families excluding "other" / empty (deterministic).
 * @param {Record<string, unknown>[]} jobs
 * @param {number} limit
 */
function topFamiliesForCategoryIntro(jobs, limit = 4) {
  const isValidFamily = (f) => {
    const s = String(f || "").toLowerCase().trim();
    return s && s !== "other";
  };
  const counts = new Map();
  for (const job of Array.isArray(jobs) ? jobs : []) {
    const fam = String(getJobFamily(job) || "").trim();
    if (!isValidFamily(fam)) continue;
    counts.set(fam, (counts.get(fam) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([k]) => k);
}

/**
 * @param {{ categoryName: string, jobs: Record<string, unknown>[], topCompanies: { name: string }[] }} opts
 */
export function buildCategoryIntro(opts) {
  const categoryName = String(opts?.categoryName || "").trim();
  const jobs = Array.isArray(opts?.jobs) ? opts.jobs : [];
  const topCompanies = Array.isArray(opts?.topCompanies) ? opts.topCompanies : [];

  const families = topFamiliesForCategoryIntro(jobs, 4);
  const companyNames = topCompanies.map((r) => String(r?.name || "").trim()).filter(Boolean);
  const uniqueCompanies = Array.from(new Set(companyNames));
  const companiesForIntro = uniqueCompanies.slice(0, 3);

  const sentences = [];

  if (families.length >= 2) {
    const f1 = capitalizeFamilyLabel(families[0]);
    const f2 = capitalizeFamilyLabel(families[1]);
    sentences.push(`${categoryName} roles focus on ${f1} and ${f2}.`);
  } else if (families.length === 1) {
    sentences.push(`${categoryName} roles focus on ${capitalizeFamilyLabel(families[0])}.`);
  } else {
    sentences.push(
      `${categoryName} includes roles across engineering, operations, and flight teams.`
    );
  }

  if (companiesForIntro.length > 0) {
    sentences.push(`Companies like ${formatOxford(companiesForIntro)} are actively hiring.`);
  }

  const familyExclude = new Set(
    families.map((f) => String(f || "").trim().toLowerCase()).filter(Boolean)
  );
  const strongTags = topTagsForCategoryIntro(jobs, familyExclude, 3);
  if (strongTags.length >= 2) {
    sentences.push(`Common work includes ${formatOxford(strongTags)}.`);
  }

  const limited = sentences.slice(0, INTRO_MAX_SENTENCES);
  return joinSentences(limited);
}

/**
 * @param {{ guideName: string, jobs: Record<string, unknown>[], topCompanies: { name: string }[] }} opts
 */
export function buildGuideIntro(opts) {
  const guideName = String(opts?.guideName || "").trim();
  const jobs = Array.isArray(opts?.jobs) ? opts.jobs : [];
  const topCompanies = Array.isArray(opts?.topCompanies) ? opts.topCompanies : [];

  const families = topFamiliesFromJobs(jobs, 4);
  const companyNames = topCompanies
    .map((r) => String(r?.name || "").trim())
    .filter(Boolean)
    .slice(0, 3);

  const sentences = [];

  if (families.length > 0) {
    sentences.push(
      `${guideName} covers roles across ${formatOxford(families.slice(0, 4))}.`
    );
  }

  if (companyNames.length > 0) {
    sentences.push(
      `Explore companies hiring and open positions—including ${formatOxford(companyNames)}.`
    );
  }

  const limited = sentences.slice(0, INTRO_MAX_SENTENCES);
  return joinSentences(limited);
}
