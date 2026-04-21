import { getPostedAgeDays, getPostedLabel, parsePostedAt } from "./jobFieldHelpers";

/**
 * Long-form "Posted on ..." line for job detail header (absolute date).
 * Uses canonical source posting date `posted_at`.
 * @param {Record<string, unknown>} job
 * @returns {string|null}
 */
export function formatPostedLong(job) {
  const d = parsePostedAt(job.posted_at);
  if (!d) return null;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * @param {Record<string, unknown>} job
 * @returns {string|null}
 */
export function formatPostedDetailLine(job) {
  const rel = getPostedLabel(job);
  const abs = formatPostedLong(job);
  const days = getPostedAgeDays(job);
  if (days != null && days <= 7 && rel && abs) return `${rel} • ${abs}`;
  return rel || abs || null;
}

function parseUpdatedAt(job) {
  return parsePostedAt(job.last_seen_at || job.updated_at || job.posted_at);
}

/**
 * @param {Record<string, unknown>} job
 * @returns {string|null}
 */
export function formatUpdatedDetailLine(job) {
  const updated = parseUpdatedAt(job);
  if (!updated) return null;

  const diffMs = Date.now() - updated.getTime();
  const totalHours = Math.max(0, Math.floor(diffMs / (60 * 60 * 1000)));
  if (totalHours < 24) {
    return `Updated ${totalHours === 0 ? "just now" : `${totalHours} hour${totalHours === 1 ? "" : "s"} ago`}`;
  }

  const totalDays = Math.max(1, Math.floor(diffMs / (24 * 60 * 60 * 1000)));
  if (totalDays <= 7) {
    return `Updated ${totalDays} day${totalDays === 1 ? "" : "s"} ago`;
  }

  return `Updated ${updated.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  })}`;
}
