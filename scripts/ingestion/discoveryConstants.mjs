/**
 * Column sets and status enums for discovery CSV artifacts.
 *
 * Candidate lifecycle (discovery_candidates.csv status):
 * - new, pending, validated — inbox; block re-discovery (see BLOCKING_STATUSES).
 * - promoted, rejected — terminal; do not block discovery (promoted covered by allowlist when in registry).
 *
 * source_hint: use ats | html | unknown (empty treated as implicit unknown in validation).
 *
 * Veto registry: rejected vs suppressed — same blocking behavior; use rejected for permanent
 * intent and suppressed for temporary (e.g. before expires_at).
 */

/** @type {readonly string[]} */
export const VETO_REGISTRY_COLUMNS = [
  "veto_id",
  "company_key",
  "canonical_company_key",
  "supersedes_candidate_id",
  "company_name",
  "domain_normalized",
  "homepage_url",
  "careers_url_candidate",
  "status",
  "reason_category",
  "reason_code",
  "reason_detail",
  "first_seen_at",
  "last_seen_at",
  "reviewed_at",
  "reviewed_by",
  "expires_at",
  "retry_after",
  "notes_internal",
];

/** Veto row status values (CSV text). */
export const VETO_STATUS = {
  REJECTED: "rejected",
  SUPPRESSED: "suppressed",
};

/** @type {readonly string[]} */
export const DISCOVERY_CANDIDATE_COLUMNS = [
  "candidate_id",
  "company_name",
  "domain_normalized",
  "homepage_url",
  "careers_url_candidate",
  "source_hint",
  "status",
  "created_at",
  "updated_at",
  "last_seen_at",
  "notes_internal",
];

/** Allowed discovery_candidates.source_hint values (case-insensitive when validating). */
export const DISCOVERY_SOURCE_HINT_ALLOWED = new Set(["ats", "html", "unknown"]);

/** Exact strings that block re-discovery in the candidate inbox (not allowlist). */
export const BLOCKING_STATUSES = ["new", "pending", "validated"];

/**
 * Candidate rows that block re-discovery (same as BLOCKING_STATUSES).
 * `pendingRows` in loaders = rows in this set.
 */
export const BLOCKING_CANDIDATE_STATUSES = new Set(
  BLOCKING_STATUSES.map((s) => s.toLowerCase())
);

/** @deprecated Use BLOCKING_CANDIDATE_STATUSES */
export const PENDING_CANDIDATE_STATUSES = BLOCKING_CANDIDATE_STATUSES;
