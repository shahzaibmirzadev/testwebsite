/**
 * Stable taxonomy for discovery veto / suppression rows (CSV reason_category + reason_code).
 * Use reason_detail for nuance; do not explode the enum without cause.
 */

/** @type {const} */
export const REASON_CATEGORY = {
  IDENTITY: "identity",
  FIT_POLICY: "fit_policy",
  TECHNICAL: "technical",
  SEARCH_QUALITY: "search_quality",
  OPERATIONAL: "operational",
};

/**
 * Minimum supported reason codes (extend only with team agreement).
 * @type {readonly string[]}
 */
export const REASON_CODES = [
  // identity / dedupe
  "DUPLICATE_SUBSIDIARY",
  "DUPLICATE_OF_APPROVED",
  "ALIAS_OR_REBRAND",
  // fit / policy
  "IRRELEVANT_VERTICAL",
  "VENDOR_MARKETPLACE_RESELLER",
  "RECRUITER_OR_AGENCY",
  "BAD_ACTOR_OR_SPAM",
  // technical
  "DEAD_DNS_OR_NXDOMAIN",
  "SITE_UNREACHABLE",
  "BLOCKED_OR_CAPTCHA",
  "UNSUPPORTED_CAREERS_STACK",
  "BAD_OR_PARKED_DOMAIN",
  // search / discovery quality
  "SERP_LOW_SIGNAL",
  "SERP_WRONG_ENTITY",
  // operational
  "MANUAL_REJECT",
  "AUTO_REJECT_RULE",
];

/** @type {Set<string>} */
export const REASON_CODE_SET = new Set(REASON_CODES);
