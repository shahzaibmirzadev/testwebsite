/**
 * Heuristic display formatting for `jobs.company` when the upstream string glued
 * words without spaces (PascalCase, lowercase suffixes, digits).
 * Does not change canonical DB values — use only for UI copy.
 */

/** Longest first so longer tokens win */
const GLUED_SUFFIXES = [
  "technologies",
  "warehousing",
  "international",
  "manufacturing",
  "engineering",
  "integration",
  "integrations",
  "intelligence",
  "aerospace",
  "automation",
  "robotics",
  "logistics",
  "industries",
  "laboratories",
  "laboratory",
  "solutions",
  "satellites",
  "satellite",
  "analytics",
  "mobility",
  "electric",
  "digital",
  "software",
  "hardware",
  "networks",
  "network",
  "sciences",
  "science",
  "dynamics",
  "innovations",
  "innovation",
  "ventures",
  "venture",
  "partners",
  "partner",
  "services",
  "service",
  "products",
  "systems",
  "defense",
  "defence",
  "holdings",
  "drones",
  "drone",
  "group",
  "labs",
  "lab",
  "space",
  "bots",
  "corp",
  "incorporated",
  "corporation",
  "api",
  "io",
  "ai",
].sort((a, b) => b.length - a.length);

const PASCAL_SPLIT = /(?<![M])(?<![M]a)([a-z])([A-Z])/g;

/**
 * @param {string} s
 * @returns {string}
 */
function pascalLoop(s) {
  let cur = s;
  let prev = "";
  let guard = 0;
  while (cur !== prev && guard++ < 16) {
    prev = cur;
    cur = cur.replace(PASCAL_SPLIT, (m, lower, upper, offset) => {
      if (offset === 0 && lower === "i") return m;
      return `${lower} ${upper}`;
    });
  }
  return cur;
}

/**
 * @param {string} s
 * @returns {string}
 */
function suffixPass(s) {
  let cur = s;
  for (const suffix of GLUED_SUFFIXES) {
    const re = new RegExp(`([a-zA-Z])(${suffix})$`, "i");
    cur = cur.replace(re, "$1 $2");
  }
  return cur;
}

/**
 * @param {string} raw
 * @returns {string}
 */
export function formatCompanyNameForDisplay(raw) {
  let s = String(raw || "").trim();
  if (!s) return "";
  try {
    s = s.normalize("NFKC");
  } catch {
    /* ignore */
  }

  s = s.replace(/\s+/g, " ");

  // Defensive: glued scraper strings that slip through enrichment (e.g. jobs.company + bad sheet label)
  if (/^gatikaiinc$/i.test(s.replace(/\s/g, ""))) {
    s = "Gatik Ai Inc";
  }

  s = s.replace(/([A-Za-z])(\d)/g, "$1 $2");
  s = s.replace(/(\d)([A-Za-z])/g, "$1 $2");

  s = pascalLoop(s);

  for (let i = 0; i < 24; i += 1) {
    const next = pascalLoop(suffixPass(s));
    if (next === s) break;
    s = next;
  }

  s = s.replace(/\s+/g, " ").trim();

  s = s
    .split(/\s+/)
    .map((word) => {
      if (!word) return word;
      if (word !== word.toLowerCase()) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");

  s = s
    .replace(/\bgmbh\b/gi, "GmbH")
    .replace(/\bllc\b/gi, "LLC")
    .replace(/\binc\b/gi, "Inc")
    .replace(/\bltd\b/gi, "Ltd")
    .replace(/\bplc\b/gi, "PLC")
    .replace(/\bapi\b/gi, "API")
    .replace(/\bai\b(?=\s|$)/gi, "AI")
    .replace(/\bio\b(?=\s|$)/gi, "IO");

  return s.trim();
}
