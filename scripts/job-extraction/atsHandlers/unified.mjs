/**
 * Normalized job shape for data/extracted_jobs_raw.json
 * Field names aligned with scripts/daily-sync.js normalized jobs where possible.
 */

/**
 * @param {string} s
 */
export function cleanText(s) {
  if (s == null) return "";
  return String(s)
    .replace(/\r/g, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * @param {...unknown} candidates
 */
export function firstIsoDate(...candidates) {
  for (const c of candidates) {
    if (c == null) continue;
    if (c instanceof Date && !Number.isNaN(c.getTime())) {
      return c.toISOString();
    }
    const d = new Date(typeof c === "number" && c < 1e12 ? c * 1000 : c);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return null;
}

/**
 * @param {Record<string, unknown>} base
 */
export function unifiedJob(base) {
  return {
    source: String(base.source || ""),
    source_job_id: String(base.source_job_id || ""),
    company: String(base.company || ""),
    title: String(base.title || ""),
    location: base.location != null ? String(base.location) : "",
    apply_url: base.apply_url != null ? String(base.apply_url) : "",
    posted_at: base.posted_at != null ? String(base.posted_at) : null,
    description_raw: base.description_raw != null ? String(base.description_raw) : "",
    description_html: base.description_html != null ? String(base.description_html) : "",
    employment_type: base.employment_type != null ? String(base.employment_type) : null,
    remote_status: base.remote_status != null ? String(base.remote_status) : null,
    tags: Array.isArray(base.tags) ? base.tags : [],
  };
}
