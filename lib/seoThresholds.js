function normalizeSiteUrl(raw) {
  const s = String(raw || "").trim().replace(/\/$/, "");
  return s || "https://droneroles.com";
}

/** Base URL for canonicals, OG, and JSON-LD. Override via NEXT_PUBLIC_SITE_URL or SITE_URL. */
export const CANONICAL_SITE_URL = normalizeSiteUrl(
  process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL
);

const EXPECTED_CANONICAL = "https://droneroles.com";
const isProd =
  process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
if (isProd && CANONICAL_SITE_URL !== EXPECTED_CANONICAL) {
  console.error("[SEO] Invalid canonical domain:", CANONICAL_SITE_URL);
  if (String(process.env.SEO_STRICT_CANONICAL || "").trim().toLowerCase() === "true") {
    throw new Error(
      `[SEO] CANONICAL_SITE_URL must be ${EXPECTED_CANONICAL} in production (got ${CANONICAL_SITE_URL})`
    );
  }
}

// Minimum active jobs required before we encourage indexing of hub pages.
export const CATEGORY_MIN_INDEXABLE_JOBS = 6;
export const COMPANY_MIN_INDEXABLE_JOBS = 2;
export const GUIDE_MIN_INDEXABLE_JOBS = 12;

// Keep stale listings out of sitemap recrawl signals.
export const JOB_SITEMAP_MAX_STALE_DAYS = 45;

export function isJobFreshForSitemap(job) {
  const ts = Date.parse(String(job?.last_seen_at || job?.posted_at || ""));
  if (!Number.isFinite(ts)) return false;
  const maxAgeMs = JOB_SITEMAP_MAX_STALE_DAYS * 24 * 60 * 60 * 1000;
  return Date.now() - ts <= maxAgeMs;
}
