/** Query params often duplicated across navigation (tracking, locale). */
const STRIP_SEARCH_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "fbclid",
]);

/**
 * Canonical URL for deduplication: same host, path, sorted meaningful query, no hash.
 * @param {string} urlStr
 */
export function normalizeUrlForDedupe(urlStr) {
  try {
    const u = new URL(urlStr);
    u.hash = "";
    let path = u.pathname;
    if (path.length > 1 && path.endsWith("/")) {
      path = path.slice(0, -1);
      u.pathname = path;
    }
    const next = new URL(u.href);
    for (const k of [...next.searchParams.keys()]) {
      if (STRIP_SEARCH_PARAMS.has(k.toLowerCase())) {
        next.searchParams.delete(k);
      }
    }
    next.hostname = next.hostname.toLowerCase();
    return next.href;
  } catch {
    return urlStr;
  }
}
