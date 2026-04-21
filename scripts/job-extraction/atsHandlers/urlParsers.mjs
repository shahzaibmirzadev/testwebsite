/**
 * Derive API slug / board token from careers URLs (aligned with daily-sync sources.csv usage).
 */

/**
 * @param {string} [url]
 */
export function parseGreenhouseBoard(url) {
  if (!url) return null;
  const s = String(url);
  const m = s.match(/boards\.greenhouse\.io\/([^/?#]+)/i);
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

/**
 * @param {string} [url]
 */
export function parseLeverCompany(url) {
  if (!url) return null;
  const s = String(url);
  const m = s.match(/jobs\.lever\.co\/([^/?#]+)/i);
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

/**
 * @param {string} [url]
 */
export function parseWorkableAccount(url) {
  if (!url) return null;
  const s = String(url);
  let m = s.match(/apply\.workable\.com\/(?:api\/v\d+\/widget\/accounts\/)?([^/?#]+)/i);
  if (m?.[1]) return decodeURIComponent(m[1]);
  m = s.match(/apply\.workable\.com\/([^/?#]+)/i);
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

/**
 * @param {string} [url]
 */
export function parseAshbyBoard(url) {
  if (!url) return null;
  const s = String(url);
  const board = s.match(/\/posting-api\/job-board\/([^/?#]+)/i);
  if (board?.[1]) return decodeURIComponent(board[1]);
  const m = s.match(/jobs\.ashbyhq\.com\/([^/?#]+)/i);
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

/**
 * @param {string} [url]
 */
export function parseSmartRecruitersCompany(url) {
  if (!url) return null;
  const s = String(url);
  const m = s.match(/(?:careers\.smartrecruiters\.com|smartrecruiters\.com)\/([^/?#]+)/i);
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

/**
 * @param {string} [url]
 * @returns {string | null} subdomain (e.g. delair from delair.teamtailor.com)
 */
export function parseTeamtailorSubdomain(url) {
  if (!url) return null;
  const s = String(url);
  const m = s.match(/https?:\/\/([^.]+)\.teamtailor\.com/i);
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

/**
 * @param {string} [url]
 * @returns {string | null} subdomain (e.g. skycatch from skycatch.bamboohr.com)
 */
export function parseBamboohrSubdomain(url) {
  if (!url) return null;
  const s = String(url);
  const m = s.match(/https?:\/\/([^.]+)\.bamboohr\.com/i);
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

/**
 * Rippling board id for /api/v2/board/{id}/jobs — strips a leading locale segment (e.g. en-GB).
 * @param {string} [url]
 * @returns {string | null}
 */
export function parseRipplingBoardPath(url) {
  if (!url) return null;
  const s = String(url);
  const m = s.match(/ats\.rippling\.com\/(.+?)\/jobs(?:\/|$|\?)/i);
  if (!m?.[1]) return null;
  const path = String(m[1]).replace(/\/+$/, "");
  const parts = path.split("/").filter(Boolean);
  if (parts.length >= 2 && /^[a-z]{2}-[A-Z]{2}$/.test(parts[0])) {
    parts.shift();
  }
  return parts.length ? parts.join("/") : null;
}

/**
 * Prefer careers_url_final, then redirected_to, then homepage_url for hints.
 * @param {Record<string, string>} row
 */
export function collectUrls(row) {
  return [row.careers_url_final, row.redirected_to, row.careers_url_candidate, row.homepage_url]
    .map((u) => (u || "").trim())
    .filter(Boolean);
}
