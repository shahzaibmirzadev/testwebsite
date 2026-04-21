/**
 * Ordered logo / favicon candidates for Company Descriptions enrichment rows.
 * When the primary Google favicon URL is wrong (bad domain mapping), later entries try other sources.
 */

const GOOGLE_FAVICON_SZ = 128;

/**
 * @param {string} host registrable hostname, lowercase
 */
function googleFaviconUrl(host) {
  const h = String(host || "").trim().toLowerCase();
  if (!h) return "";
  return `https://www.google.com/s2/favicons?sz=${GOOGLE_FAVICON_SZ}&domain=${encodeURIComponent(h)}`;
}

/**
 * @param {string} host
 */
function duckDuckGoIconUrl(host) {
  const h = String(host || "").trim().toLowerCase();
  if (!h) return "";
  return `https://icons.duckduckgo.com/ip3/${h}.ico`;
}

/**
 * @param {string} host
 */
function originFaviconUrl(host) {
  const h = String(host || "").trim().toLowerCase();
  if (!h) return "";
  return `https://${h}/favicon.ico`;
}

/**
 * @param {string} host
 */
function clearbitLogoUrl(host) {
  const h = String(host || "").trim().toLowerCase();
  if (!h) return "";
  return `https://logo.clearbit.com/${encodeURIComponent(h)}`;
}

/**
 * Normalize hostname from enrichment `canonicalDomain` (no protocol/path).
 * @param {string} raw
 * @returns {string}
 */
export function normalizeEnrichmentHostname(raw) {
  let s = String(raw || "").trim().toLowerCase();
  if (!s) return "";
  s = s.replace(/^https?:\/\//, "");
  s = s.split("/")[0].split("?")[0].split("#")[0];
  s = s.replace(/:\d+$/, "");
  if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?(\.[a-z]{2,})+$/i.test(s)) return "";
  return s;
}

/**
 * Dedupe URLs while preserving order.
 * @param {string[]} urls
 * @returns {string[]}
 */
function dedupeUrls(urls) {
  const seen = new Set();
  const out = [];
  for (const raw of urls) {
    const u = String(raw || "").trim();
    if (!u || seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}

/**
 * @param {Record<string, unknown>|null|undefined} enrichment — Company Descriptions record
 * @returns {string[]}
 */
export function enrichmentLogoCandidateUrls(enrichment) {
  const primary = String(enrichment?.logoUrl ?? "").trim();
  const host = normalizeEnrichmentHostname(String(enrichment?.canonicalDomain ?? ""));

  /** @type {string[]} */
  const chain = [];

  if (primary) chain.push(primary);

  if (host) {
    for (const u of [
      googleFaviconUrl(host),
      duckDuckGoIconUrl(host),
      originFaviconUrl(host),
      clearbitLogoUrl(host),
    ]) {
      if (u) chain.push(u);
    }
  }

  return dedupeUrls(chain);
}
