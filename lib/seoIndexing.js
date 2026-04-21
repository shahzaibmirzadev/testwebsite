import { isJobIndexable } from "@/lib/seoHealth";
import { COMPANY_MIN_INDEXABLE_JOBS, isJobFreshForSitemap } from "@/lib/seoThresholds";

/**
 * Single source of truth for job detail indexing and sitemap inclusion (quality + freshness).
 */
export function shouldIndexJobPage(job) {
  return Boolean(isJobIndexable(job) && isJobFreshForSitemap(job));
}

/**
 * Company listing pages: index only when enough roles exist and at least one is fresh + quality.
 * Matches sitemap inclusion via {@link shouldIndexCompanyPage}.
 *
 * @param {string} _companySlug
 * @param {Record<string, unknown>[]} jobs Active jobs for this company (full list, or first page when using progressive load).
 * @param {number} [totalActiveCount] When `jobs` is a partial page, pass total active count for this company.
 */
export function shouldIndexCompanyPage(_companySlug, jobs, totalActiveCount) {
  const list = Array.isArray(jobs) ? jobs : [];
  const total =
    typeof totalActiveCount === "number" && Number.isFinite(totalActiveCount)
      ? totalActiveCount
      : list.length;
  if (total < COMPANY_MIN_INDEXABLE_JOBS) return false;
  return list.some((j) => shouldIndexJobPage(j));
}
