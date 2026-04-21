import { getLocationText, getRemoteStatus } from "./jobFieldHelpers";
import { jobSlug } from "./slug";

function clean(v) {
  return String(v || "").trim();
}

function descriptionLength(job) {
  const html = clean(job.description_html).replace(/<[^>]*>/g, " ");
  const plain = clean(job.description);
  return Math.max(html.length, plain.length);
}

/**
 * Lightweight quality gate for indexing job detail pages.
 * Keeps obviously thin/incomplete rows out of sitemap/index.
 * @param {Record<string, unknown>} job
 */
export function getJobSeoHealth(job) {
  const issues = [];
  const title = clean(job.title);
  const company = clean(job.company);
  const location = getLocationText(job);
  const remote = getRemoteStatus(job);
  const slug = jobSlug(job);
  const descLen = descriptionLength(job);

  if (!slug) issues.push("missing_slug");
  if (title.length < 6) issues.push("short_or_missing_title");
  if (!company) issues.push("missing_company");
  if (!location && !remote) issues.push("missing_location");
  if (descLen < 120) issues.push("thin_description");

  return {
    issues,
    isIndexable: issues.length === 0,
    descriptionLength: descLen,
  };
}

/**
 * @param {Record<string, unknown>} job
 */
export function isJobIndexable(job) {
  return getJobSeoHealth(job).isIndexable;
}

