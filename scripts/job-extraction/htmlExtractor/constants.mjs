/** Path fragments that suggest a job detail or listing URL */
export const JOB_PATH_FRAGMENTS =
  /\/(job|jobs|career|careers|position|positions|open-positions|vacancies|vacancy|opening|openings)(\/|$|\?)/i;

/** Extra path signals (still same-host; used with scoring in discoverJobLinks) */
export const EXTENDED_JOB_PATH_HINT =
  /\/(opportunit|hiring|join|team|role|listing|work-with|apply|department|departments|requisition|req|posting)(\/|$|\?)/i;

/** Link text / title hints (generic roles) */
export const TITLE_HINT_WORDS =
  /\b(engineer|operator|pilot|technician|specialist|manager|director|analyst|developer|scientist|coordinator|associate|intern|architect|designer|lead|executive|officer|sales|marketing|hr|recruit|apply)\b/i;

/** Broader title/link text for listing cards + discovery scoring (UAS, drone, aviation) */
export const JOB_TITLE_TEXT_HINT =
  /\b(engineer|engineering|operator|pilot|technician|specialist|manager|director|analyst|developer|scientist|coordinator|associate|intern|architect|designer|lead|executive|officer|sales|marketing|recruit|uas|suas|drone|drones|aviation|aerospace|software|hardware|mechanical|electrical|flight|inspector|inspection|research|scientific|buyer|buyers|representative|consultant|administrator|admin|support|hr|human\s+resources)\b/i;

/**
 * Same as {@link JOB_TITLE_TEXT_HINT} but omits "support" so nav items like "Support"
 * are not treated as role-like during link discovery (listing cards still use full hint).
 */
export const LINK_DISCOVERY_TITLE_HINT =
  /\b(engineer|engineering|operator|pilot|technician|specialist|manager|director|analyst|developer|scientist|coordinator|associate|intern|architect|designer|lead|executive|officer|sales|marketing|recruit|uas|suas|drone|drones|aviation|aerospace|software|hardware|mechanical|electrical|flight|inspector|inspection|research|scientific|buyer|buyers|representative|consultant|administrator|admin|hr|human\s+resources)\b/i;

/** Minimum score to keep a detail link (after bonuses/penalties). */
export const HTML_LINK_SCORE_MIN = 3;

/**
 * When the URL has no job-ish path signal and the anchor is not inside a listing/job row,
 * require this higher score so generic marketing slugs do not pass on text alone.
 */
export const HTML_LINK_SCORE_MIN_STRICT = 4;

/** Legacy cap name — prefer {@link HTML_MAX_CANDIDATE_LINKS} for HTML validation runs */
export const MAX_JOBS_PER_COMPANY = 28;

/** Max job-detail URLs to follow per company (listing is separate). */
const DEFAULT_HTML_MAX_CANDIDATE_LINKS = 24;

/** Max jobs taken from listing-page cards before detail URLs (bounded). */
export const HTML_MAX_LISTING_CARD_JOBS = 14;

const DEFAULT_FETCH_DELAY_MS = 450;

/** Modular HTML extraction only — tighter than global ATS defaults for validation runs */
export const HTML_REQUEST_TIMEOUT_MS = 10_000;
/** Total attempts per URL (1 = single try, 2 = one retry after failure) */
export const HTML_FETCH_MAX_ATTEMPTS = 2;
export const HTML_RETRY_DELAY_MS = 800;

/** Hard wall-clock budget per company so one site cannot block the full batch */
const DEFAULT_HTML_MAX_MS_PER_COMPANY = 120_000;

/**
 * Positive int from env, or fallback when unset/invalid.
 * @param {string} name
 * @param {number} fallback
 */
function envPositiveInt(name, fallback) {
  const raw = String(process.env[name] ?? "").trim();
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Env: HTML_MAX_CANDIDATE_LINKS — max scored detail links queued (default 24). */
export const HTML_MAX_CANDIDATE_LINKS = envPositiveInt(
  "HTML_MAX_CANDIDATE_LINKS",
  DEFAULT_HTML_MAX_CANDIDATE_LINKS
);

/**
 * Env: HTML_FETCH_DELAY_MS — delay between HTML fetches (default 450).
 * Exported as FETCH_DELAY_MS for existing imports.
 */
export const FETCH_DELAY_MS = envPositiveInt(
  "HTML_FETCH_DELAY_MS",
  DEFAULT_FETCH_DELAY_MS
);

/** Env: HTML_MAX_MS_PER_COMPANY — wall-clock ms per company (default 120000). */
export const HTML_MAX_MS_PER_COMPANY = envPositiveInt(
  "HTML_MAX_MS_PER_COMPANY",
  DEFAULT_HTML_MAX_MS_PER_COMPANY
);

/**
 * Env: HTML_DETAIL_EARLY_STOP_CONSECUTIVE — stop detail loop after N consecutive bad attempts (0 = off).
 * @returns {number}
 */
export function parseHtmlDetailEarlyStopConsecutive() {
  const raw = String(process.env.HTML_DETAIL_EARLY_STOP_CONSECUTIVE ?? "").trim();
  if (!raw) return 0;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Env: HTML_DETAIL_EARLY_STOP_INCLUDE_FETCH_FAIL — if true, count fetch failures toward streak (default true).
 * @returns {boolean}
 */
export function parseHtmlDetailEarlyStopIncludeFetchFail() {
  const raw = String(
    process.env.HTML_DETAIL_EARLY_STOP_INCLUDE_FETCH_FAIL ?? "1"
  ).trim();
  if (!raw) return true;
  if (/^0|false|no$/i.test(raw)) return false;
  if (/^1|true|yes$/i.test(raw)) return true;
  return true;
}

