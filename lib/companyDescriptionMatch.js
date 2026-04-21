import { companySlug } from "@/lib/companyPages";
import { formatCompanyNameForDisplay } from "@/lib/companyDisplayFormat";

function polishCompanyDisplayLabel(label) {
  const t = String(label || "").trim();
  if (!t) return "";
  return formatCompanyNameForDisplay(t);
}
import generated from "@/lib/companyDescriptions.generated.json";
import aliases from "@/lib/companyDescriptionAliases.json";

/** Mirrors scripts/lib/urlDecodeCompanyName.mjs — keep in sync. */
function decodeUrlEncodedCompanyName(raw) {
  let s = String(raw || "").trim();
  if (!s) return "";
  if (!/%[0-9A-Fa-f]{2}/.test(s)) return s;
  try {
    return decodeURIComponent(s).trim();
  } catch {
    return s;
  }
}

/**
 * Normalization for matching spreadsheet "Company" to `jobs.company` (deterministic, no fuzzy guess).
 * @param {string} raw
 * @returns {string}
 */
export function normalizeCompanyNameForMatch(raw) {
  let s = decodeUrlEncodedCompanyName(raw);
  if (!s) return "";
  try {
    s = s.normalize("NFKC");
  } catch {
    /* ignore */
  }
  s = s.replace(/\s+/g, " ");
  s = s.replace(/\bAi\b/g, "AI");
  s = s.replace(/\bGmbh\b/g, "GmbH");
  return s.trim();
}

/**
 * @typedef {object} CompanyDescriptionRecord
 * @property {string} primarySlug
 * @property {string} company
 * @property {string} description
 * @property {string} location
 * @property {number|null} foundedYear
 * @property {string} seoTitle
 * @property {string} h1
 * @property {string} careersBlurb
 * @property {string} [canonicalDomain] — hostname from career registry merge at build time (resolver output; not a second logo store)
 * @property {string} [logoUrl]
 * @property {string} [logoSourceType] — e.g. manual, google_favicon, none (from company-descriptions build)
 * @property {string} [logoStatus]
 * @property {string} [logoLastCheckedAt]
 * @property {boolean} [needsReview]
 */

/** @type {Map<string, CompanyDescriptionRecord> | null} */
let recordByPrimarySlug = null;

function validateAliasTargets(map) {
  if (process.env.NODE_ENV !== "development") return;
  const a = aliases?.jobCompanySlugToPrimarySlug;
  if (!a || typeof a !== "object") return;
  for (const [from, to] of Object.entries(a)) {
    const t = String(to).trim().toLowerCase();
    if (!map.has(t) && process.env.NODE_ENV === "development") {
      console.warn(
        `[companyDescriptionAliases] unknown primarySlug "${to}" (alias from job slug "${from}")`
      );
    }
  }
}

function getRecordMap() {
  if (recordByPrimarySlug) return recordByPrimarySlug;
  recordByPrimarySlug = new Map();
  const list = Array.isArray(generated?.records) ? generated.records : [];
  for (const r of list) {
    if (r?.primarySlug) {
      recordByPrimarySlug.set(String(r.primarySlug), r);
    }
  }
  validateAliasTargets(recordByPrimarySlug);
  return recordByPrimarySlug;
}

/**
 * @param {string} jobCompanySlug — `companySlug` from URL-resolved company name or display name
 * @returns {CompanyDescriptionRecord | null}
 */
export function getCompanyDescriptionByJobSlug(jobCompanySlug) {
  const key = String(jobCompanySlug || "").trim().toLowerCase();
  if (!key) return null;

  const map = getRecordMap();
  const aliasTargets = aliases?.jobCompanySlugToPrimarySlug;
  const target =
    aliasTargets && typeof aliasTargets === "object" && aliasTargets[key] != null
      ? String(aliasTargets[key]).trim().toLowerCase()
      : key;

  return map.get(target) || null;
}

/**
 * @param {string} companyName — resolved `jobs.company` or display fallback
 * @returns {CompanyDescriptionRecord | null}
 */
export function lookupCompanyDescription(companyName) {
  const normalized = normalizeCompanyNameForMatch(companyName);
  const slug = companySlug(normalized);
  if (!slug) return null;
  return getCompanyDescriptionByJobSlug(slug);
}

/**
 * Prefer Company Descriptions display spelling (spacing, casing) when the job row matches a record.
 * Use {@link getCompanyName} for URLs and `?c=` hints so they stay aligned with the database.
 * @param {Record<string, unknown>} job
 * @returns {string}
 */
export function getPreferredCompanyDisplayName(job) {
  const raw = job?.company != null ? String(job.company).trim() : "";
  if (!raw) return "";
  const rec = lookupCompanyDescription(raw);
  if (rec?.company?.trim()) return polishCompanyDisplayLabel(rec.company);
  return formatCompanyNameForDisplay(raw);
}

/**
 * Same as {@link getPreferredCompanyDisplayName} but for a raw company string (e.g. directory list).
 * @param {string} companyNameRaw
 * @returns {string}
 */
export function getPreferredCompanyLabel(companyNameRaw) {
  const raw = String(companyNameRaw || "").trim();
  if (!raw) return "";
  const rec = lookupCompanyDescription(raw);
  if (rec?.company?.trim()) return polishCompanyDisplayLabel(rec.company);
  return formatCompanyNameForDisplay(raw);
}

/**
 * Resolve enrichment for a company page: match `jobs.company` first, then URL slug (for `jobCompanySlugToPrimarySlug` aliases).
 * @param {string} pageSlug — route param `[companySlug]`
 * @param {string} companyName — resolved `jobs.company` or display fallback
 */
export function lookupCompanyDescriptionForPage(pageSlug, companyName) {
  const name = String(companyName || "").trim();
  if (name) {
    const byName = lookupCompanyDescription(name);
    if (byName) return byName;
  }
  const s = String(pageSlug || "").trim().toLowerCase();
  if (!s) return null;
  return getCompanyDescriptionByJobSlug(s);
}

/**
 * Build https URL from resolver-backed `canonicalDomain` stored on enrichment (hostname only).
 * @param {string} [domain]
 * @returns {string}
 */
export function websiteUrlFromCanonicalDomain(domain) {
  const raw = String(domain ?? "").trim();
  if (!raw) return "";
  const host = raw.replace(/^https?:\/\//i, "").split("/")[0].trim().toLowerCase();
  if (!host || /[\s@]/.test(host)) return "";
  return `https://${host}`;
}

/**
 * JSON-LD Organization — only includes fields present on the record (no invented values).
 * @param {string} displayName
 * @param {CompanyDescriptionRecord} enrichment
 * @returns {Record<string, unknown>}
 */
export function buildOrganizationJsonLd(displayName, enrichment) {
  const name = String(displayName || enrichment?.company || "").trim();
  const out = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: name || enrichment?.company || "",
  };
  if (enrichment?.location?.trim()) {
    out.location = {
      "@type": "Place",
      name: enrichment.location.trim(),
    };
  }
  if (enrichment?.foundedYear != null && Number.isFinite(enrichment.foundedYear)) {
    out.foundingDate = String(Math.trunc(enrichment.foundedYear));
  }
  const logo = String(enrichment?.logoUrl ?? "").trim();
  if (logo) {
    out.logo = logo;
  }
  const siteUrl = websiteUrlFromCanonicalDomain(String(enrichment?.canonicalDomain ?? ""));
  if (siteUrl) {
    out.url = siteUrl;
  }
  return out;
}
