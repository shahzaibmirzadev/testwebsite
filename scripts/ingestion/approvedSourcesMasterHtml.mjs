/**
 * HTML subset selection + URL dedupe for approved_sources_master (generated).
 */
import { BLOCKED_RESOLVER_STATUSES } from "../career-resolver/routingUtils.mjs";
import { normalizeUrlForDedupe } from "../job-extraction/htmlExtractor/urlNormalize.mjs";

export { BLOCKED_RESOLVER_STATUSES };

const CONF_RANK = { high: 3, medium: 2, low: 1 };

/**
 * @param {string} c
 */
export function confidenceRank(c) {
  const k = String(c ?? "")
    .trim()
    .toLowerCase();
  return CONF_RANK[k] ?? 0;
}

/**
 * @param {string} s
 * @returns {boolean}
 */
export function isValidHttpUrl(s) {
  try {
    const u = new URL(String(s).trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * First failure reason for HTML inclusion, or null if eligible (pre-dedupe).
 * @param {Record<string, string>} row — source_routing_table row
 * @returns {string | null}
 */
export function htmlInclusionFailureReason(row) {
  if (String(row.ready_for_extraction ?? "").trim() !== "true") {
    return "not_ready";
  }
  if (String(row.extractor_type ?? "").trim() !== "html_scraper") {
    return "extractor_not_html_scraper";
  }
  const status = String(row.resolver_status ?? "").trim();
  if (BLOCKED_RESOLVER_STATUSES.has(status)) {
    return "blocked_resolver_status";
  }
  const raw = String(row.careers_url_final ?? "").trim();
  if (!raw || !isValidHttpUrl(raw)) {
    return "invalid_careers_url";
  }
  return null;
}

/**
 * @param {Record<string, string>} row
 */
export function normalizedCareersUrl(row) {
  const raw = String(row.careers_url_final ?? "").trim();
  if (!raw || !isValidHttpUrl(raw)) return "";
  return normalizeUrlForDedupe(raw);
}

/**
 * Pick winning row per normalized URL; losers are dedupe collisions.
 * @param {Record<string, string>[]} eligibleRows
 * @returns {{ winners: Record<string, string>[], dedupeLosers: Record<string, string>[] }}
 */
export function dedupeHtmlByNormalizedUrl(eligibleRows) {
  /** @type {Map<string, Record<string, string>[]>} */
  const byNorm = new Map();
  for (const r of eligibleRows) {
    const norm = normalizedCareersUrl(r);
    if (!norm) continue;
    const list = byNorm.get(norm) || [];
    list.push(r);
    byNorm.set(norm, list);
  }

  /** @type {Record<string, string>[]} */
  const winners = [];
  /** @type {Record<string, string>[]} */
  const dedupeLosers = [];

  for (const [, group] of byNorm) {
    const sorted = [...group].sort((a, b) => {
      const dr =
        confidenceRank(b.confidence_flag) - confidenceRank(a.confidence_flag);
      if (dr !== 0) return dr;
      return String(a.company_key ?? "").localeCompare(
        String(b.company_key ?? ""),
        "en"
      );
    });
    winners.push(sorted[0]);
    for (let i = 1; i < sorted.length; i++) {
      dedupeLosers.push(sorted[i]);
    }
  }

  return { winners, dedupeLosers };
}
