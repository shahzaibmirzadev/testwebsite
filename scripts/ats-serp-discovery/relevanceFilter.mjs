/**
 * Strict visible-text gate for Serp organic rows: direct drone/UAS keywords only.
 * No standalone pass via broad context terms (mapping, geospatial, robotics alone, etc.).
 */

/**
 * Canonical direct drone/UAS visible-text gate (case-insensitive, word-boundary safe).
 * Used by Serp relevance and optional ATS page-body check — keep in sync via this export only.
 * BVLOS is included as a direct ops signal.
 */
export const DIRECT_DRONE_UAS_RE =
  /\b(drones?|uav|uas|suas|rpas|unmanned|uncrewed|aerial|BVLOS)\b/i;

/**
 * @param {string} text
 * @returns {boolean}
 */
export function hasDirectDroneUasSignal(text) {
  return DIRECT_DRONE_UAS_RE.test(String(text ?? ""));
}

/**
 * @param {{ title?: string, snippet?: string, companyName?: string }} fields
 * @returns {{ ok: true } | { ok: false, reason: "irrelevant_no_drone_signal" }}
 */
export function assessDroneRoboticsRelevance(fields) {
  const title = String(fields.title ?? "").trim();
  const snippet = String(fields.snippet ?? "").trim();
  const companyName = String(fields.companyName ?? "").trim();
  const fullText = [title, snippet, companyName].filter(Boolean).join("\n");

  if (!fullText.trim()) {
    return { ok: false, reason: "irrelevant_no_drone_signal" };
  }

  if (hasDirectDroneUasSignal(fullText)) {
    return { ok: true };
  }

  return { ok: false, reason: "irrelevant_no_drone_signal" };
}
