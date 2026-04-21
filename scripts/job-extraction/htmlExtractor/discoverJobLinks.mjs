import {
  EXTENDED_JOB_PATH_HINT,
  HTML_LINK_SCORE_MIN,
  HTML_LINK_SCORE_MIN_STRICT,
  HTML_MAX_CANDIDATE_LINKS,
  JOB_PATH_FRAGMENTS,
  LINK_DISCOVERY_TITLE_HINT,
  TITLE_HINT_WORDS,
} from "./constants.mjs";
import { normalizeUrlForDedupe } from "./urlNormalize.mjs";

/** Path segment labels that are almost never job postings (unless overridden by job-ish path). */
const EXCLUDED_PATH_SEGMENTS = new Set([
  "support",
  "blog",
  "news",
  "resources",
  "webinar",
  "webinars",
  "events",
  "event",
  "product",
  "products",
  "solutions",
  "solution",
  "about",
  "contact",
  "faq",
  "docs",
  "help",
  "press",
  "media",
  "cookie",
  "cookies",
  "privacy",
  "terms",
  "legal",
  "cart",
  "shop",
  "store",
  "downloads",
  "download",
  "author",
  "category",
  "tag",
  "tags",
]);

/**
 * @param {string} pathname
 */
export function hasStrongJobPath(pathname) {
  return (
    JOB_PATH_FRAGMENTS.test(pathname) || EXTENDED_JOB_PATH_HINT.test(pathname)
  );
}

/**
 * Match slug segments and hyphen parts against the blocklist (e.g. privacy-policy → privacy).
 * @param {string} pathname
 */
function pathnameHasExcludedSegment(pathname) {
  try {
    const decoded = decodeURIComponent(pathname).toLowerCase();
    const segments = decoded.split("/").filter(Boolean);
    for (const seg of segments) {
      const base = seg.replace(/\.(html?|php|aspx|pdf)$/i, "").split("?")[0];
      if (base === "support" || /^support-/i.test(base)) return true;
      if (EXCLUDED_PATH_SEGMENTS.has(base)) return true;
      for (const part of base.split("-")) {
        if (!part) continue;
        if (EXCLUDED_PATH_SEGMENTS.has(part)) return true;
      }
    }
  } catch {
    return false;
  }
  return false;
}

/**
 * Drop marketing / utility paths unless the URL also looks like a job/careers URL.
 * @param {string} pathname
 */
export function shouldExcludePathForDiscovery(pathname) {
  if (hasStrongJobPath(pathname)) return false;
  return pathnameHasExcludedSegment(pathname);
}

const LISTING_CONTEXT_SELECTOR = [
  "main article",
  "[class*=\"job-list\" i]",
  "[class*=\"jobs-list\" i]",
  "[class*=\"job-card\" i]",
  "[class*=\"opening\" i]",
  "[class*=\"vacancy\" i]",
  "[class*=\"position\" i]",
  "[class*=\"career\" i] li",
  "[class*=\"accordion\" i] li",
  "[data-job]",
  "[data-position]",
].join(",");

const NAV_FOOTER_SELECTOR =
  "header, nav, [role=\"navigation\"], footer, [class*=\"site-footer\" i], [class*=\"site-header\" i], [id*=\"footer\" i]";

/**
 * @param {import("cheerio").CheerioAPI} $
 * @param {unknown} el
 */
function isInListingJobContext($, el) {
  return $(el).closest(LISTING_CONTEXT_SELECTOR).length > 0;
}

/**
 * @param {import("cheerio").CheerioAPI} $
 * @param {unknown} el
 */
function isInNavOrFooter($, el) {
  return $(el).closest(NAV_FOOTER_SELECTOR).length > 0;
}

/**
 * @param {string} path pathname + search
 * @param {string} linkText
 * @param {{ listingContext: boolean, inNavFooter: boolean }} ctx
 */
export function scoreJobLink(path, linkText, ctx) {
  const { listingContext, inNavFooter } = ctx;
  let s = 0;
  const strongPath = hasStrongJobPath(path);

  if (JOB_PATH_FRAGMENTS.test(path)) s += 3;
  if (EXTENDED_JOB_PATH_HINT.test(path)) s += 2;

  if (TITLE_HINT_WORDS.test(linkText)) s += 2;
  if (LINK_DISCOVERY_TITLE_HINT.test(linkText)) s += 2;

  if (linkText.length >= 12 && linkText.length <= 140) s += 1;
  if (/apply|details|view role|read more/i.test(linkText)) s += 1;

  if (listingContext) s += 2;

  const navWeak = inNavFooter && !strongPath && !listingContext;
  if (navWeak) s -= 2;

  return s;
}

/**
 * @param {number} score
 * @param {string} path
 * @param {boolean} listingContext
 */
export function scorePassesThreshold(score, path, listingContext) {
  const strongPath = hasStrongJobPath(path);
  const min =
    strongPath || listingContext
      ? HTML_LINK_SCORE_MIN
      : HTML_LINK_SCORE_MIN_STRICT;
  return score >= min;
}

/**
 * @param {import('cheerio').CheerioAPI} $
 * @param {string} listingUrl
 * @returns {{
 *   links: { url: string, linkText: string, score: number }[],
 *   stats: Record<string, number>,
 * }}
 */
export function discoverJobLinks($, listingUrl) {
  let base;
  try {
    base = new URL(listingUrl);
  } catch {
    return {
      links: [],
      stats: emptyStats(),
    };
  }

  const listingCanon = normalizeUrlForDedupe(listingUrl);

  let anchor_tags_considered = 0;
  let same_host_non_listing = 0;
  let dropped_excluded_path = 0;
  let dropped_below_threshold = 0;

  /** @type {Map<string, { url: string, linkText: string, score: number }>} */
  const seen = new Map();

  $("a[href]").each((_, el) => {
    anchor_tags_considered += 1;
    const href = $(el).attr("href");
    if (!href || href.startsWith("#") || href.startsWith("javascript:")) return;
    let abs;
    try {
      abs = new URL(href, base.origin).href;
    } catch {
      return;
    }
    if (new URL(abs).hostname !== base.hostname) return;

    const canonical = normalizeUrlForDedupe(abs);
    if (canonical === listingCanon) return;

    same_host_non_listing += 1;

    const pathname = new URL(abs).pathname;
    const path = pathname + new URL(abs).search;

    if (shouldExcludePathForDiscovery(pathname)) {
      dropped_excluded_path += 1;
      return;
    }

    const linkText = $(el).text().replace(/\s+/g, " ").trim().slice(0, 200);
    const listingContext = isInListingJobContext($, el);
    const inNavFooter = isInNavOrFooter($, el);

    const score = scoreJobLink(path, linkText, { listingContext, inNavFooter });
    if (!scorePassesThreshold(score, path, listingContext)) {
      dropped_below_threshold += 1;
      return;
    }

    const prev = seen.get(canonical);
    if (!prev || score > prev.score) {
      seen.set(canonical, { url: canonical, linkText, score });
    }
  });

  const list = Array.from(seen.values());
  list.sort((a, b) => b.score - a.score);
  const links = list.slice(0, HTML_MAX_CANDIDATE_LINKS);

  return {
    links,
    stats: {
      anchor_tags_considered,
      same_host_non_listing,
      dropped_excluded_path,
      dropped_below_threshold,
      kept_after_scoring_dedupe: seen.size,
      links_queued: links.length,
      cap: HTML_MAX_CANDIDATE_LINKS,
    },
  };
}

function emptyStats() {
  return {
    anchor_tags_considered: 0,
    same_host_non_listing: 0,
    dropped_excluded_path: 0,
    dropped_below_threshold: 0,
    kept_after_scoring_dedupe: 0,
    links_queued: 0,
    cap: HTML_MAX_CANDIDATE_LINKS,
  };
}
