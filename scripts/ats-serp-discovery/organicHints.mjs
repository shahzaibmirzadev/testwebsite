import { normalizeCompanyName } from "../source-recovery/recoveryMergeShared.mjs";
import {
  normalizeDomainInput,
  normalizeUrlToRegistrableDomain,
} from "../ingestion/normalizeDomain.mjs";

/**
 * @param {Record<string, unknown>} organic
 */
export function companyNameHintFromOrganic(organic) {
  const title = String(organic.title ?? "").trim();
  if (!title) return "";
  const cut = title.split(/\s[-\u2013|]\s/)[0];
  return String(cut || title).trim();
}

/**
 * @param {Record<string, unknown>} organic
 */
export function domainHintFromOrganic(organic) {
  const displayed = String(organic.displayed_link ?? "").trim();
  if (displayed) {
    const m = displayed.match(
      /([a-z0-9](?:[a-z0-9-]*\.)+[a-z]{2,})/i
    );
    if (m?.[1]) {
      const n = normalizeDomainInput(m[1]);
      if (n.ok) return n.registrableDomain;
    }
  }
  const link = String(organic.link ?? "").trim();
  if (link) {
    const n = normalizeUrlToRegistrableDomain(link);
    if (n.ok) return n.registrableDomain;
  }
  return "";
}

/**
 * @param {string} nameHint
 * @param {string} domainHint
 * @param {Set<string>} existingNames
 * @param {Set<string>} existingDomains
 */
export function collisionHints(
  nameHint,
  domainHint,
  existingNames,
  existingDomains
) {
  /** @type {string[]} */
  const warnings = [];
  const nn = normalizeCompanyName(nameHint);
  if (nn && existingNames.has(nn)) {
    warnings.push("company_name_collision_soft");
  }
  const dd = String(domainHint || "")
    .trim()
    .toLowerCase();
  if (dd && existingDomains.has(dd)) {
    warnings.push("domain_collision_soft");
  }
  return warnings;
}
