import { load } from "cheerio";
import { cleanText, firstIsoDate } from "../atsHandlers/unified.mjs";
import { makeSourceJobId } from "./jobId.mjs";
import { normalizeUrlForDedupe } from "./urlNormalize.mjs";

/** Min chars for main/article fallback */
const MAIN_FALLBACK_MIN_LEN = 120;
/** Min chars for stripped-body fallback (avoid whole-page chrome noise) */
const BODY_FALLBACK_MIN_LEN = 400;
/** Max plain text kept from HTML fallbacks */
const DESCRIPTION_RAW_MAX = 12_000;
/** Max HTML kept for description_html on fallbacks */
const DESCRIPTION_HTML_MAX = 80_000;

/**
 * Extract job fields from a job detail (or listing) HTML page.
 * @param {string} html
 * @param {string} pageUrl
 * @param {{ company_name: string, company_key: string, routing_final_source_type: string, careers_url_final: string }} meta
 */
export function extractJobFromHtml(html, pageUrl, meta) {
  const $ = load(html);

  let title =
    $('meta[property="og:title"]').attr("content")?.trim() ||
    $('meta[name="twitter:title"]').attr("content")?.trim() ||
    $("h1").first().text().trim() ||
    $("title").first().text().trim() ||
    "";

  title = cleanText(title).replace(/^[-–—]\s*/, "").trim();

  let location = "";
  const locSelectors = [
    '[class*="location" i]',
    '[class*="job-location" i]',
    '[itemprop="jobLocation"]',
    ".location",
  ];
  for (const sel of locSelectors) {
    const t = $(sel).first().text().trim();
    if (t && t.length < 200) {
      location = cleanText(t);
      break;
    }
  }

  const descSelectors = [
    '[class*="job-description" i]',
    '[class*="description" i]',
    "article",
    '[role="main"]',
    "main",
    ".content",
  ];
  let descriptionHtml = "";
  let descriptionRaw = "";
  let bestLen = 0;
  for (const sel of descSelectors) {
    const block = $(sel).first();
    if (!block.length) continue;
    const plain = cleanText(block.text() || "");
    if (plain.length > bestLen && plain.length > 80) {
      bestLen = plain.length;
      descriptionHtml = block.html() || "";
      descriptionRaw = plain;
    }
  }
  if (!descriptionRaw) {
    const $main = $("main, [role='main'], article").first();
    if ($main.length) {
      const mainPlain = cleanText($main.text() || "");
      if (mainPlain.length >= MAIN_FALLBACK_MIN_LEN) {
        descriptionRaw = mainPlain.slice(0, DESCRIPTION_RAW_MAX);
        descriptionHtml =
          ($main.html() || "").slice(0, DESCRIPTION_HTML_MAX) || "";
      }
    }
  }
  if (!descriptionRaw) {
    const $body = $("body");
    if ($body.length) {
      $body
        .find(
          "header, nav, footer, [role='navigation'], [role='banner'], [role='contentinfo'], script, style, noscript, iframe"
        )
        .remove();
      const stripped = cleanText($body.text() || "");
      if (stripped.length >= BODY_FALLBACK_MIN_LEN) {
        descriptionRaw = stripped.slice(0, DESCRIPTION_RAW_MAX);
        descriptionHtml =
          ($body.html() || "").slice(0, DESCRIPTION_HTML_MAX) || "";
      }
    }
  }

  let applyUrl = pageUrl;
  $('a[href*="apply" i], a.apply, .apply a[href]').each((_, el) => {
    const h = $(el).attr("href");
    if (h && !h.startsWith("#")) {
      try {
        applyUrl = new URL(h, pageUrl).href;
        return false;
      } catch {
        /* continue */
      }
    }
  });

  applyUrl = normalizeUrlForDedupe(applyUrl);

  let postedAt = null;
  const timeEl = $("time[datetime]").first().attr("datetime");
  postedAt = firstIsoDate(
    timeEl,
    $('meta[property="article:published_time"]').attr("content"),
    $('meta[name="pubdate"]').attr("content")
  );

  const source_job_id = makeSourceJobId({
    apply_url: applyUrl,
    company_key: meta.company_key,
    title,
    location,
  });

  return {
    source: "custom_html",
    source_job_id,
    company: meta.company_name,
    title,
    location,
    apply_url: applyUrl,
    posted_at: postedAt,
    description_raw: descriptionRaw,
    description_html: descriptionHtml,
    employment_type: null,
    remote_status: null,
    tags: [],
  };
}
