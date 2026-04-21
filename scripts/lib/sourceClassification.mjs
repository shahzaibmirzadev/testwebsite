/**
 * Shared classification for source coverage reporting and manual recovery dry-runs.
 * Kept small and dependency-light; aligns with scripts/daily-sync.js and
 * scripts/job-extraction/atsHandlers/index.mjs.
 */

import {
  parseAshbyBoard,
  parseBamboohrSubdomain,
  parseGreenhouseBoard,
  parseLeverCompany,
  parseRipplingBoardPath,
  parseSmartRecruitersCompany,
  parseTeamtailorSubdomain,
  parseWorkableAccount,
} from "../job-extraction/atsHandlers/urlParsers.mjs";

/** Providers implemented in production daily-sync (`fetchJobs`). */
export const DAILY_SYNC_ATS_PROVIDERS = new Set([
  "greenhouse",
  "lever",
  "workable",
  "ashby",
  "smartrecruiters",
  "teamtailor",
  "bamboohr",
  "rippling",
]);

/** Providers with offline extract handlers but not wired to daily-sync (empty when all ATS handlers are production). */
export const OFFLINE_EXTRACT_ONLY_ATS_PROVIDERS = new Set([]);

/** Providers with an implementation in scripts/job-extraction/runAtsExtraction.mjs */
export const ATS_WITH_EXTRACTION_HANDLER = new Set([
  ...DAILY_SYNC_ATS_PROVIDERS,
  ...OFFLINE_EXTRACT_ONLY_ATS_PROVIDERS,
]);

/**
 * @param {string | undefined} provider
 * @returns {"daily_sync" | "offline_only" | "unknown"}
 */
export function classifyProviderIngestionTier(provider) {
  const p = String(provider || "")
    .trim()
    .toLowerCase();
  if (!p) return "unknown";
  if (DAILY_SYNC_ATS_PROVIDERS.has(p)) return "daily_sync";
  if (OFFLINE_EXTRACT_ONLY_ATS_PROVIDERS.has(p)) return "offline_only";
  return "unknown";
}

/**
 * Synthetic public careers URL for common ATS boards (for reporting / display only).
 * @param {string} provider
 * @param {string} slug
 * @returns {string}
 */
export function deriveSyntheticCareersUrl(provider, slug) {
  const p = String(provider || "")
    .trim()
    .toLowerCase();
  const s = String(slug || "").trim();
  if (!p || !s) return "";
  switch (p) {
    case "greenhouse":
      return `https://boards.greenhouse.io/${encodeURIComponent(s)}`;
    case "lever":
      return `https://jobs.lever.co/${encodeURIComponent(s)}`;
    case "workable":
      return `https://apply.workable.com/${encodeURIComponent(s)}`;
    case "ashby":
      return `https://jobs.ashbyhq.com/${encodeURIComponent(s)}`;
    case "smartrecruiters":
      return `https://careers.smartrecruiters.com/${encodeURIComponent(s)}`;
    case "teamtailor":
      return `https://${encodeURIComponent(s)}.teamtailor.com`;
    case "bamboohr":
      return `https://${encodeURIComponent(s)}.bamboohr.com`;
    case "rippling":
      return `https://ats.rippling.com/${encodeURIComponent(s)}/jobs`;
    default:
      return "";
  }
}

/**
 * Map a known provider id to reporting enum used by manual recovery dry-run output.
 * @param {string} provider
 * @returns {"daily_sync_supported_ats" | "offline_only_ats" | "html_custom" | "unknown"}
 */
export function detectedSourceTypeFromProviderId(provider) {
  const p = String(provider || "")
    .trim()
    .toLowerCase();
  if (!p) return "unknown";
  const tier = classifyProviderIngestionTier(p);
  if (tier === "daily_sync") return "daily_sync_supported_ats";
  if (tier === "offline_only") return "offline_only_ats";
  if (ATS_WITH_EXTRACTION_HANDLER.has(p)) return "unknown";
  return "unknown";
}

/**
 * Deterministic board slug from a careers URL for daily-sync ATS providers only.
 * Returns null if URL path does not match expected patterns (no aggressive guessing).
 * @param {string} provider
 * @param {string} careersUrl
 * @returns {string | null}
 */
export function deriveDailySyncSlugFromCareersUrl(provider, careersUrl) {
  const p = String(provider || "")
    .trim()
    .toLowerCase();
  const u = String(careersUrl || "").trim();
  if (!p || !u) return null;

  /** Lazy import keeps this file usable without job-extraction path in tests. */
  return (
    {
      greenhouse: () => parseGreenhouseBoard(u),
      lever: () => parseLeverCompany(u),
      workable: () => parseWorkableAccount(u),
      ashby: () => parseAshbyBoard(u),
      smartrecruiters: () => parseSmartRecruitersCompany(u),
      teamtailor: () => parseTeamtailorSubdomain(u),
      bamboohr: () => parseBamboohrSubdomain(u),
      rippling: () => parseRipplingBoardPath(u),
    }[p]?.() ?? null
  );
}
