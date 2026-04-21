/**
 * Pull multiple job-like rows from a single careers/listing HTML page (no detail fetch).
 * Bounded and conservative to avoid nav/footer noise.
 */
import { cleanText } from "../atsHandlers/unified.mjs";
import { makeSourceJobId } from "./jobId.mjs";
import { JOB_TITLE_TEXT_HINT } from "./constants.mjs";
import { normalizeUrlForDedupe } from "./urlNormalize.mjs";

/**
 * @param {string} t
 */
function looksLikeGenericNav(t) {
  const s = t.trim();
  if (s.length < 4 || s.length > 180) return true;
  return /^(home|about(\s+us)?|contact|careers?|jobs?|blog|news|login|sign\s*in|privacy|terms|menu|search|skip|close)$/i.test(
    s
  );
}

/**
 * @param {import("cheerio").CheerioAPI} $
 * @param {string} listingUrl
 * @param {{ company_name: string, company_key: string }} meta
 * @param {number} maxJobs
 * @returns {Record<string, unknown>[]}
 */
export function extractJobsFromListingCards($, listingUrl, meta, maxJobs) {
  let base;
  try {
    base = new URL(listingUrl);
  } catch {
    return [];
  }

  const host = base.hostname;
  /** @type {Map<string, Record<string, unknown>>} */
  const byKey = new Map();

  /**
   * @param {string} title
   * @param {string} applyUrl
   * @param {string} snippet
   */
  function push(title, applyUrl, snippet) {
    if (byKey.size >= maxJobs) return;
    const t = cleanText(title);
    if (t.length < 4 || looksLikeGenericNav(t)) return;
    if (!JOB_TITLE_TEXT_HINT.test(t) && t.length < 14) return;

    let abs = applyUrl;
    try {
      abs = normalizeUrlForDedupe(new URL(applyUrl, listingUrl).href);
    } catch {
      return;
    }
    try {
      if (new URL(abs).hostname !== host) return;
    } catch {
      return;
    }

    const dedupe = `${t.toLowerCase()}|${abs}`;
    if (byKey.has(dedupe)) return;
    const desc = cleanText(snippet).slice(0, 12_000);
    if (desc.length < 40 && !JOB_TITLE_TEXT_HINT.test(t)) return;

    const source_job_id = makeSourceJobId({
      apply_url: abs,
      company_key: meta.company_key,
      title: t,
      location: "",
    });

    byKey.set(dedupe, {
      source: "custom_html",
      source_job_id,
      company: meta.company_name,
      title: t,
      location: "",
      apply_url: abs,
      posted_at: null,
      description_raw: desc,
      description_html: "",
      employment_type: null,
      remote_status: null,
      tags: ["listing_card"],
    });
  }

  const root = $("main, [role='main'], #main, .main-content, #content, .content").first();
  const $scope = root.length ? root : $.root();

  // A) Article cards (common on Squarespace, WordPress, etc.)
  $scope.find("article").each((_, el) => {
    if (byKey.size >= maxJobs) return false;
    const $el = $(el);
    const $a = $el
      .find("a[href]")
      .filter((__, a) => {
        const h = $(a).attr("href");
        if (!h || h.startsWith("#") || h.startsWith("javascript:")) return false;
        try {
          return new URL(h, listingUrl).hostname === host;
        } catch {
          return false;
        }
      })
      .first();
    if (!$a.length) return;
    const href = $a.attr("href");
    if (!href) return;
    const linkText = cleanText($a.text());
    const heading = cleanText(
      $el.find("h1, h2, h3, h4, .job-title, [class*='job-title' i]").first().text()
    );
    const title = linkText.length >= heading.length && linkText.length > 3 ? linkText : heading || linkText;
    const snippet = $el.text();
    push(title, href, snippet);
  });

  // B) List rows scoped to job-ish containers
  const rowSelectors = [
    '[class*="job-list" i] li',
    '[class*="jobs-list" i] li',
    '[class*="position" i] li',
    '[class*="opening" i] li',
    '[class*="vacancy" i] li',
    '[class*="career" i] li',
    ".sqs-block-content li",
    '[class*="accordion" i] li',
  ];

  for (const sel of rowSelectors) {
    if (byKey.size >= maxJobs) break;
    $scope.find(sel).each((_, el) => {
      if (byKey.size >= maxJobs) return false;
      const $el = $(el);
      const $a = $el.find("a[href]").first();
      if (!$a.length) return;
      const href = $a.attr("href");
      if (!href || href.startsWith("#")) return;
      let abs;
      try {
        abs = new URL(href, listingUrl).href;
        if (new URL(abs).hostname !== host) return;
      } catch {
        return;
      }
      const t = cleanText($a.text());
      if (t.length < 8 || t.length > 160) return;
      const rowText = $el.text();
      if (
        !JOB_TITLE_TEXT_HINT.test(t) &&
        !/\b(position|opening|role|vacancy|job)\b/i.test(rowText.slice(0, 400))
      ) {
        return;
      }
      push(t, abs, rowText);
    });
  }

  // C) Headings followed by apply / more link (lightweight)
  $scope.find("h2, h3, h4").each((_, el) => {
    if (byKey.size >= maxJobs) return false;
    const $h = $(el);
    const t = cleanText($h.text());
    if (t.length < 8 || t.length > 160) return;
    if (!JOB_TITLE_TEXT_HINT.test(t)) return;
    const $container = $h.parent();
    const $a = $container.find("a[href]").filter((__, a) => {
      const tx = cleanText($(a).text());
      return /apply|details|more|view/i.test(tx) || tx.length < 3;
    }).first();
    if (!$a.length) return;
    const href = $a.attr("href");
    if (!href || href.startsWith("#")) return;
    push(t, href, $container.text());
  });

  return Array.from(byKey.values());
}
