/** @type {readonly string[]} */
export const PROBE_PATHS = [
  "/careers",
  "/jobs",
  "/careers/jobs",
  "/join-us",
  "/work-with-us",
  "/company/careers",
  "/about/careers",
  "/opportunities",
  "/hiring",
];

export const USER_AGENT =
  "DroneJobsCareerResolver/1.0 (+https://github.com/dronejobs)";

/** Statuses that default rerun should reprocess */
export const RERUN_RESOLVER_STATUSES = new Set([
  "",
  "careers_not_found",
  "manual_review",
  "homepage_missing",
  "homepage_fetch_failed",
  "careers_fetch_failed",
]);

const DEFAULT_PROBE_MS = 12_000;
const DEFAULT_HOMEPAGE_MS = 18_000;
const DEFAULT_CAREERS_MS = 14_000;
const DEFAULT_INTER_COMPANY_DELAY_MS = 750;

function envInt(name, fallback) {
  const v = process.env[name];
  if (v == null || v === "") return fallback;
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function envBool(name, defaultTrue) {
  const v = process.env[name];
  if (v == null || v === "") return defaultTrue;
  const s = String(v).toLowerCase();
  if (["0", "false", "off", "no"].includes(s)) return false;
  if (["1", "true", "on", "yes"].includes(s)) return true;
  return defaultTrue;
}

/** Path probe GETs (`/careers`, `/jobs`, …). Env: RESOLVER_PROBE_TIMEOUT_MS */
export const RESOLVER_PROBE_TIMEOUT_MS = envInt(
  "RESOLVER_PROBE_TIMEOUT_MS",
  DEFAULT_PROBE_MS
);

/** Homepage origin fetch after probes. Env: RESOLVER_HOMEPAGE_TIMEOUT_MS */
export const RESOLVER_HOMEPAGE_TIMEOUT_MS = envInt(
  "RESOLVER_HOMEPAGE_TIMEOUT_MS",
  DEFAULT_HOMEPAGE_MS
);

/** Follow-up fetch of top careers link from homepage scan. Env: RESOLVER_CAREERS_TIMEOUT_MS */
export const RESOLVER_CAREERS_TIMEOUT_MS = envInt(
  "RESOLVER_CAREERS_TIMEOUT_MS",
  DEFAULT_CAREERS_MS
);

/**
 * Default when `fetchHtml` is called without `opts.timeoutMs` (homepage-tier).
 * @deprecated Prefer passing explicit timeout from RESOLVER_* constants.
 */
export const DEFAULT_TIMEOUT_MS = RESOLVER_HOMEPAGE_TIMEOUT_MS;

/** Pause between master rows (0 allowed). Env: RESOLVER_INTER_COMPANY_DELAY_MS */
export const RESOLVER_INTER_COMPANY_DELAY_MS = envInt(
  "RESOLVER_INTER_COMPANY_DELAY_MS",
  DEFAULT_INTER_COMPANY_DELAY_MS
);

/**
 * Same-run origin cache for duplicate homepages. Env: RESOLVER_ORIGIN_CACHE — 0/false/off disables.
 */
export const RESOLVER_ORIGIN_CACHE_ENABLED = envBool(
  "RESOLVER_ORIGIN_CACHE",
  true
);

/** @deprecated Use RESOLVER_INTER_COMPANY_DELAY_MS */
export const DELAY_MS_BETWEEN_COMPANIES = RESOLVER_INTER_COMPANY_DELAY_MS;
