/**
 * Normalize tags from various possible job row shapes.
 * @param {Record<string, unknown>} job
 * @returns {string[]}
 */
export function getJobTags(job) {
  const raw = job.tags ?? job.skills ?? job.keywords ?? job.tag_list;
  if (Array.isArray(raw)) {
    return raw.map((t) => String(t).trim()).filter(Boolean);
  }
  if (typeof raw === "string") {
    return raw
      .split(/[,;|]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

/**
 * Parse `posted_at` safely and preserve date-only values.
 * @param {unknown} raw
 * @returns {Date|null}
 */
export function parsePostedAt(raw) {
  if (raw == null) return null;
  const text = String(raw).trim();
  if (!text) return null;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (dateOnly) {
    const d = new Date(
      Number(dateOnly[1]),
      Number(dateOnly[2]) - 1,
      Number(dateOnly[3])
    );
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Canonical posted date source for UI is `posted_at` only.
 * @param {Record<string, unknown>} job
 */
export function getJobDate(job) {
  return parsePostedAt(job.posted_at);
}

/**
 * Shared posted date age in days from `posted_at`.
 * @param {Record<string, unknown>} job
 * @returns {number|null}
 */
export function getPostedAgeDays(job) {
  const d = getJobDate(job);
  if (!d) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const posted = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.floor((today.getTime() - posted.getTime()) / 86400000);
  return Math.max(0, diff);
}

/**
 * @param {Record<string, unknown>} job
 */
export function getJobFamily(job) {
  const v =
    job.job_family ??
    job.jobFamily ??
    job.family ??
    job.category ??
    job.role_family;
  if (v == null || v === "") return null;
  return String(v).trim();
}

/**
 * @param {Record<string, unknown>} job
 */
export function getRemoteStatus(job) {
  const v =
    job.remote_status ??
    job.remoteStatus ??
    job.workplace ??
    job.work_mode ??
    job.remote;
  if (v == null || v === "") return null;
  return String(v).trim();
}

/**
 * @param {Record<string, unknown>} job
 */
export function getSeniority(job) {
  const v =
    job.seniority ?? job.seniority_level ?? job.level ?? job.experience_level;
  if (v == null || v === "") return null;
  return String(v).trim();
}

/**
 * @param {Record<string, unknown>} job
 */
export function getEmploymentType(job) {
  const v =
    job.employment_type ??
    job.employmentType ??
    job.type ??
    job.job_type;
  if (v == null || v === "") return null;
  return String(v).trim();
}

/**
 * @param {Record<string, unknown>} job
 */
export function getCompanyName(job) {
  return job.company != null ? String(job.company).trim() : "";
}

/**
 * @param {Record<string, unknown>} job
 */
export function getLocationText(job) {
  return job.location != null ? String(job.location).trim() : "";
}

/** Aligned with `locationPages` India `matchTerms` (longer phrases before shorter). */
const INDIA_LOCALITY_DISPLAY_RE =
  /\b(new delhi|bengaluru|bangalore|mumbai|hyderabad|pune|chennai|kolkata|gurgaon|gurugram|noida|ahmedabad|jaipur|delhi)\b/i;

/**
 * UI-only: append ", India" when a known Indian locality appears but the country is not already named.
 * @param {string} raw
 */
export function formatLocationDisplayText(raw) {
  const s = String(raw || "").trim();
  if (!s) return s;
  if (/\bindia\b/i.test(s)) return s;
  if (INDIA_LOCALITY_DISPLAY_RE.test(s)) return `${s}, India`;
  return s;
}

/**
 * @param {Record<string, unknown>} job
 */
export function getLocationDisplayText(job) {
  return formatLocationDisplayText(getLocationText(job));
}

/**
 * Human-readable relative time for job cards.
 * @param {Record<string, unknown>} job
 */
export function getPostedLabel(job) {
  const days = getPostedAgeDays(job);
  if (days == null) return null;
  if (days === 0) return "Posted Today!";
  if (days <= 7) return `Posted ${days} day${days === 1 ? "" : "s"} ago`;
  const d = getJobDate(job);
  if (!d) return null;
  return `Posted ${d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}`;
}

/**
 * @param {Record<string, unknown>} job
 * @returns {"NEW"|"RECENT"|null}
 */
export function getFreshnessBadge(job) {
  const days = getPostedAgeDays(job);
  if (days == null) return null;
  if (days <= 3) return "NEW";
  if (days <= 7) return "RECENT";
  return null;
}

/**
 * @param {Record<string, unknown>} job
 * @returns {string|null}
 */
export function getCompanyLogoUrl(job) {
  const u =
    job.company_logo_url ??
    job.company_logo ??
    job.logo_url ??
    job.logo ??
    job.employer_logo_url;
  if (u == null || typeof u !== "string") return null;
  const t = u.trim();
  return t || null;
}

/**
 * Plain-text preview for cards/panels (strips simple HTML tags).
 * @param {Record<string, unknown>} job
 * @param {number} [maxLen]
 */
export function getJobSummaryPreview(job, maxLen = 320) {
  const raw =
    job.description ??
    job.summary ??
    job.snippet ??
    "";
  if (typeof raw !== "string" || !raw.trim()) return "";
  const stripped = raw
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (stripped.length <= maxLen) return stripped;
  return `${stripped.slice(0, maxLen).trimEnd()}…`;
}
