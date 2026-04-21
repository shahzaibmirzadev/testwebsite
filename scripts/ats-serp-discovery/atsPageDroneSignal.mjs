/**
 * Optional second check: HTML body from the ATS job/career URL must contain at least one
 * direct drone/UAS keyword (same list as visible-text gate). On fetch/parse failure, result
 * is inconclusive — caller should not reject (visible gate remains sufficient).
 */

import { hasDirectDroneUasSignal } from "./relevanceFilter.mjs";

/**
 * @param {string} html
 */
function htmlToSearchableText(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
}

/**
 * @param {string} url
 * @param {{ timeoutMs?: number }} [opts]
 * @returns {Promise<
 *   | { status: "confirmed" }
 *   | { status: "no_keyword" }
 *   | { status: "inconclusive"; detail: string }
 * >}
 */
export async function assessAtsPageDirectDroneSignal(url, opts = {}) {
  const timeoutMs = Number(opts.timeoutMs) > 0 ? Number(opts.timeoutMs) : 3000;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ac.signal,
      redirect: "follow",
      headers: {
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "User-Agent": "DroneJobsATS-discovery/1.0",
      },
    });
    clearTimeout(timer);
    if (!res.ok) {
      return { status: "inconclusive", detail: `http_${res.status}` };
    }
    const html = await res.text();
    const text = htmlToSearchableText(html);
    if (hasDirectDroneUasSignal(text)) {
      return { status: "confirmed" };
    }
    return { status: "no_keyword" };
  } catch (e) {
    clearTimeout(timer);
    const msg = e && typeof e === "object" && "name" in e && e.name === "AbortError"
      ? "timeout"
      : "fetch_error";
    return { status: "inconclusive", detail: msg };
  }
}
