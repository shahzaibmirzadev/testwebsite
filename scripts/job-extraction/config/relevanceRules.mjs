/**
 * Title-first relevance (v1). Extend via accept_keywords; optional deny_keywords.
 */

/** @type {readonly string[]} */
export const accept_keywords = [
  "drone",
  "drones",
  "uav",
  "uas",
  "suas",
  "rpas",
  "unmanned",
  "uncrewed",
  "aerial robotics",
  "counter-uas",
  "counter-drone",
  "multirotor",
  "quadcopter",
  "vtol",
];

/** Conservative: obvious non-aviation spam titles (optional) */
/** @type {readonly string[]} */
export const deny_keywords = [
  "cryptocurrency",
  "crypto airdrop",
  "truck driver",
  "trucker",
  "cdl",
  "delivery driver",
];

/**
 * Build case-insensitive regex alternation from phrases (longest first).
 * @param {readonly string[]} phrases
 */
function buildPattern(phrases) {
  const sorted = [...phrases].sort((a, b) => b.length - a.length);
  const escaped = sorted.map((p) =>
    p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  );
  return new RegExp(`(${escaped.join("|")})`, "i");
}

const acceptRe = buildPattern(accept_keywords);
const denyRe = buildPattern(deny_keywords);

/**
 * @param {string} title
 * @returns {{ pass: boolean, reasons: string[], notes: string }}
 */
export function evaluateTitleRelevance(title) {
  const t = String(title || "").trim();
  if (!t) {
    return {
      pass: false,
      reasons: ["empty_title"],
      notes: "No title to evaluate",
    };
  }

  if (denyRe.test(t)) {
    return {
      pass: false,
      reasons: ["deny_keyword_match"],
      notes: "Matched conservative deny list",
    };
  }

  if (acceptRe.test(t)) {
    return {
      pass: true,
      reasons: ["accept_keyword_in_title"],
      notes: "",
    };
  }

  return {
    pass: false,
    reasons: ["no_drone_keyword_in_title"],
    notes: "v1 requires a drone/UAS-related keyword in the title",
  };
}
