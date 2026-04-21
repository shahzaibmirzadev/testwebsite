/**
 * Decode percent-encoded fragments in ATS/URL-sourced company names
 * (e.g. "Acme%20Inc" → "Acme Inc"). Safe no-op when no %XX sequences.
 * @param {string} raw
 * @returns {string}
 */
export function decodeUrlEncodedCompanyName(raw) {
  let s = String(raw || "").trim();
  if (!s) return "";
  if (!/%[0-9A-Fa-f]{2}/.test(s)) return s;
  try {
    return decodeURIComponent(s).trim();
  } catch {
    return s;
  }
}
