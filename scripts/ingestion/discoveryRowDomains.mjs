/**
 * Registrable domains contributed by a veto or candidate row, in the same order as
 * shouldSkipDiscovery indexing (domain column, then homepage, then careers URL).
 */
import { normalizeUrlToRegistrableDomain } from "./normalizeDomain.mjs";

/**
 * @param {Record<string, string>} row
 * @returns {string[]}
 */
export function registrableDomainsForVetoLikeRow(row) {
  /** @type {string[]} */
  const out = [];
  const add = (reg) => {
    const d = String(reg ?? "").trim().toLowerCase();
    if (d) out.push(d);
  };

  add(row.domain_normalized);
  const hu = String(row.homepage_url ?? "").trim();
  if (hu) {
    const n = normalizeUrlToRegistrableDomain(hu);
    if (n.ok) add(n.registrableDomain);
  }
  const cu = String(row.careers_url_candidate ?? "").trim();
  if (cu) {
    const n = normalizeUrlToRegistrableDomain(cu);
    if (n.ok) add(n.registrableDomain);
  }
  return out;
}

/**
 * @param {Record<string, string>} row
 * @returns {string[]}
 */
export function registrableDomainsForCandidateLikeRow(row) {
  return registrableDomainsForVetoLikeRow(row);
}
