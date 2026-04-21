/**
 * Title-case each whitespace-separated word for labels / tags / short phrases in UI containers.
 * Not for body copy. Preserves 2–4 letter all-caps tokens (e.g. TX, USA, UK).
 * @param {string} input
 * @returns {string}
 */
export function titleCaseLabelWords(input) {
  const s = String(input ?? "").trim();
  if (!s) return "";
  return s.split(/\s+/).map(titleCaseOneWord).join(" ");
}

/**
 * @param {string} raw
 */
function titleCaseOneWord(raw) {
  if (!raw) return raw;
  const trailing = raw.match(/[,.;:!?]+$/)?.[0] ?? "";
  const core = trailing ? raw.slice(0, -trailing.length) : raw;
  if (!core) return raw;

  const letters = core.replace(/[^A-Za-z]/g, "");
  if (letters.length >= 2 && letters.length <= 4 && letters === letters.toUpperCase() && /^[A-Z]+$/.test(letters)) {
    return raw;
  }

  if (core.includes("-")) {
    return core
      .split("-")
      .map((p) => titleCasePlainToken(p))
      .join("-") + trailing;
  }

  return titleCasePlainToken(core) + trailing;
}

function titleCasePlainToken(t) {
  if (!t) return t;
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}
