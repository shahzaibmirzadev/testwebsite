import { classifyAtsHostname } from "./classifyAts.mjs";

/** Resolver statuses that block any extraction attempt. */
export const BLOCKED_RESOLVER_STATUSES = new Set([
  "careers_not_found",
  "homepage_fetch_failed",
  "homepage_missing",
  "careers_fetch_failed",
]);

/**
 * @param {string} url
 * @returns {{ provider: string, sourceType: string } | null}
 */
export function classifyAtsFromUrl(url) {
  const u = (url || "").trim();
  if (!u) return null;
  try {
    const host = new URL(u).hostname;
    return classifyAtsHostname(host);
  } catch {
    return null;
  }
}

/**
 * Prefer ATS match from careers URL, then redirect target.
 * @param {{ careers_url_final?: string, redirected_to?: string }} row
 */
export function atsFromUrls(row) {
  const a = classifyAtsFromUrl(row.careers_url_final);
  if (a) return a;
  return classifyAtsFromUrl(row.redirected_to);
}

/**
 * Parse source_type_guess like ats_greenhouse → { provider, sourceType } or null.
 * @param {string} guess
 */
export function atsFromSourceTypeGuess(guess) {
  const g = (guess || "").trim().toLowerCase();
  if (!g.startsWith("ats_")) return null;
  const rest = g.slice(4);
  if (!rest) return null;
  return { provider: rest, sourceType: g };
}

/**
 * @param {Record<string, string>} row — one career_source_registry row
 * @returns {{
 *   final_source_type: string,
 *   extractor_type: string,
 *   extractor_priority: string,
 *   ready_for_extraction: string,
 *   routing_notes: string,
 * }}
 */
export function routeRegistryRow(row) {
  const status = (row.resolver_status || "").trim();
  const guess = (row.source_type_guess || "").trim();

  if (BLOCKED_RESOLVER_STATUSES.has(status)) {
    return {
      final_source_type: "unavailable",
      extractor_type: "none",
      extractor_priority: "none",
      ready_for_extraction: "false",
      routing_notes: `gated: resolver_status=${status}`,
    };
  }

  const urlAts = atsFromUrls(row);
  const guessAts = atsFromSourceTypeGuess(guess);
  const ats = urlAts || guessAts;

  if (ats) {
    return {
      final_source_type: ats.sourceType,
      extractor_type: "ats_api",
      extractor_priority: "high",
      ready_for_extraction: "true",
      routing_notes: urlAts
        ? `ATS via URL (provider=${ats.provider})`
        : `ATS via source_type_guess (${ats.sourceType})`,
    };
  }

  if (status === "js_rendered_suspected" || guess === "js_rendered_suspected") {
    return {
      final_source_type: "js_rendered",
      extractor_type: "browser_required",
      extractor_priority: "low",
      ready_for_extraction: "false",
      routing_notes:
        "js_rendered_suspected from resolver and/or source_type_guess; browser automation not implemented in v1",
    };
  }

  if (guess === "custom_found") {
    return {
      final_source_type: "html_static",
      extractor_type: "html_scraper",
      extractor_priority: "medium",
      ready_for_extraction: "true",
      routing_notes: "custom careers page; HTML scrape candidate",
    };
  }

  if (
    guess === "manual_review" ||
    guess === "careers_not_found" ||
    guess === "fetch_failed" ||
    !guess
  ) {
    return {
      final_source_type: "unknown",
      extractor_type: "none",
      extractor_priority: "none",
      ready_for_extraction: "false",
      routing_notes: `needs review or inconclusive (resolver_status=${status}, source_type_guess=${guess || "empty"})`,
    };
  }

  return {
    final_source_type: "unknown",
    extractor_type: "none",
    extractor_priority: "none",
    ready_for_extraction: "false",
    routing_notes: `fallback: unhandled source_type_guess=${guess}`,
  };
}
