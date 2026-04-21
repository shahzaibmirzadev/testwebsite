#!/usr/bin/env node
/**
 * Pure skip / dedupe logic for future discovery: approved allowlist, pending candidates,
 * active vetoes. Does not call SerpAPI or mutate CSVs.
 *
 * review_queue.csv stays separate: human triage items (optional) vs discovery_candidates
 * machine-readable inbox. This module only considers discovery_candidates for "pending".
 */

/**
 * Decision policy (current phase — intentional; do not reorder without an explicit design review).
 *
 * Pre-step: optional name-collision warnings (never alone cause skip; see `warnings` on result).
 *
 * Skip / proceed decisions, in order (first match wins):
 * 1. Approved allowlist — match on `company_key` (promoted ATS API + promoted HTML custom in production registry).
 * 2. Active veto — match on `company_key` (indexed from active veto rows only).
 * 3. Pending candidate — match when probe `companyKey` equals a row `candidate_id`.
 * 4. Approved allowlist — match on registrable domain (from probe domain/homepage/careers inputs).
 * 5. Active veto — match on registrable domain (indexed from normalized domain + URL-derived domains).
 * 6. Pending candidate — match on registrable domain.
 * 7. Otherwise — `decision: "proceed"`, `skip: false`.
 *
 * Precedence notes:
 * - The production allowlist outranks veto on both key and domain. That is deliberate: baseline
 *   approved production sources (ATS + HTML) are treated as authoritative for short-circuiting discovery.
 * - Veto rows are indexed with first CSV row winning per key/domain; later rows are shadowed.
 *   Same for pending candidates by domain. This is acceptable for the current phase; duplicate
 *   shadowing is surfaced by validateDiscoveryLayer.mjs.
 */
import {
  normalizeDomainInput,
  normalizeUrlToRegistrableDomain,
} from "./normalizeDomain.mjs";
import { parseOptionalIso } from "./loadVetoRegistry.mjs";
import {
  registrableDomainsForVetoLikeRow,
  registrableDomainsForCandidateLikeRow,
} from "./discoveryRowDomains.mjs";

/**
 * @typedef {import("./loadProductionAllowlist.mjs").ProductionAllowlist} ProductionAllowlist
 */

/**
 * @typedef {{
 *   companyKey?: string,
 *   companyName?: string,
 *   domainInput?: string,
 *   homepageUrl?: string,
 *   careersUrlCandidate?: string,
 * }} DiscoveryProbeInput
 *
 * companyKey may be a legacy ATS key (legacy__…), resolver key (cm-…), or a discovery candidate_id
 * if your workflow stores the candidate id in the same field.
 */

/**
 * @typedef {{
 *   skip: boolean,
 *   decision: 'proceed' | 'skip_approved' | 'skip_pending' | 'skip_veto',
 *   matchKind: 'none' | 'company_key' | 'registrable_domain' | 'url_derived_domain',
 *   approvedMatch: null | { via: string, companyKey?: string, domain?: string },
 *   pendingMatch: null | { via: string, candidateId?: string, domain?: string },
 *   vetoMatch: null | {
 *     via: string,
 *     vetoId: string,
 *     status: string,
 *     permanent: boolean,
 *     expiresAt: string | null,
 *     reasonCategory: string,
 *     reasonCode: string,
 *     canonicalCompanyKey: string,
 *   },
 *   warnings: { type: string, detail: string }[],
 * }} SkipDiscoveryResult
 */

/**
 * @param {import("./loadVetoRegistry.mjs").loadVetoRegistry extends (...args: any) => Promise<infer R> ? R : never} vetoLoaded
 * @param {import("./loadDiscoveryCandidates.mjs").loadDiscoveryCandidates extends (...args: any) => Promise<infer R> ? R : never} candidatesLoaded
 */
function indexVetoByKeyAndDomains(vetoLoaded) {
  /** @type {Map<string, Record<string, string>>} */
  const byKey = new Map();
  /** @type {Map<string, Record<string, string>>} */
  const byRegistrable = new Map();

  const addDomain = (reg, row) => {
    const d = String(reg ?? "").trim().toLowerCase();
    if (d && !byRegistrable.has(d)) {
      byRegistrable.set(d, row);
    }
  };

  for (const row of vetoLoaded.activeRows) {
    const ck = String(row.company_key ?? "").trim();
    if (ck && !byKey.has(ck)) {
      byKey.set(ck, row);
    }
    for (const d of registrableDomainsForVetoLikeRow(row)) {
      addDomain(d, row);
    }
  }

  return { byKey, byRegistrable };
}

/**
 * @param {import("./loadDiscoveryCandidates.mjs").loadDiscoveryCandidates extends (...args: any) => Promise<infer R> ? R : never} candidatesLoaded
 */
function indexPendingByKeyAndDomains(candidatesLoaded) {
  /** @type {Map<string, Record<string, string>>} */
  const byRegistrable = new Map();

  const addDomain = (reg, row) => {
    const d = String(reg ?? "").trim().toLowerCase();
    if (d && !byRegistrable.has(d)) {
      byRegistrable.set(d, row);
    }
  };

  for (const row of candidatesLoaded.pendingRows) {
    for (const d of registrableDomainsForCandidateLikeRow(row)) {
      addDomain(d, row);
    }
  }

  return { byRegistrable };
}

/**
 * @param {DiscoveryProbeInput} input
 * @returns {{ keys: Set<string>, registrables: Set<string>, source: Map<string, string> }}
 */
function collectProbeKeysAndDomains(input) {
  /** @type {Set<string>} */
  const keys = new Set();
  /** @type {Set<string>} */
  const registrables = new Set();
  /** @type {Map<string, string>} */
  const source = new Map();

  const addKey = (k, via) => {
    const t = String(k ?? "").trim();
    if (t) {
      keys.add(t);
      source.set(`key:${t}`, via);
    }
  };

  const addReg = (reg, via) => {
    const t = String(reg ?? "").trim().toLowerCase();
    if (t) {
      registrables.add(t);
      source.set(`dom:${t}`, via);
    }
  };

  addKey(input.companyKey, "input.company_key");

  const domIn = String(input.domainInput ?? "").trim();
  if (domIn) {
    const n = normalizeDomainInput(domIn);
    if (n.ok) {
      addReg(n.registrableDomain, "input.domain_input");
    }
  }

  const hu = String(input.homepageUrl ?? "").trim();
  if (hu) {
    const n = normalizeUrlToRegistrableDomain(hu);
    if (n.ok) {
      addReg(n.registrableDomain, "input.homepage_url");
    }
  }

  const cu = String(input.careersUrlCandidate ?? "").trim();
  if (cu) {
    const n = normalizeUrlToRegistrableDomain(cu);
    if (n.ok) {
      addReg(n.registrableDomain, "input.careers_url_candidate");
    }
  }

  return { keys, registrables, source };
}

/**
 * @param {DiscoveryProbeInput} input
 * @param {{
 *   allowlist: ProductionAllowlist,
 *   vetoLoaded: Awaited<ReturnType<import("./loadVetoRegistry.mjs").loadVetoRegistry>>,
 *   candidatesLoaded: Awaited<ReturnType<import("./loadDiscoveryCandidates.mjs").loadDiscoveryCandidates>>,
 * }} ctx
 * @returns {SkipDiscoveryResult}
 */
export function shouldSkipDiscovery(input, ctx) {
  const { allowlist, vetoLoaded, candidatesLoaded } = ctx;

  /** @type {{ type: string, detail: string }[]} */
  const warnings = [];

  const probe = collectProbeKeysAndDomains(input);
  const vetoIdx = indexVetoByKeyAndDomains(vetoLoaded);
  const pendIdx = indexPendingByKeyAndDomains(candidatesLoaded);

  const nameLower = String(input.companyName ?? "")
    .trim()
    .toLowerCase();

  // Optional warnings: name matches approved / pending company name but no domain match on that entity
  if (nameLower && allowlist.companyNamesLower.has(nameLower)) {
    let domainMatchesAllowlist = false;
    for (const d of probe.registrables) {
      if (allowlist.registrableDomains.has(d)) {
        domainMatchesAllowlist = true;
        break;
      }
    }
    if (!domainMatchesAllowlist) {
      warnings.push({
        type: "name_collision",
        detail:
          "company_name matches an approved row but registrable domain did not match allowlist domains for this probe",
      });
    }
  }

  if (nameLower && candidatesLoaded.pendingRows.some(
      (r) =>
        String(r.company_name ?? "")
          .trim()
          .toLowerCase() === nameLower
    )) {
    let hitDomain = false;
    for (const d of probe.registrables) {
      if (pendIdx.byRegistrable.has(d)) {
        hitDomain = true;
        break;
      }
    }
    if (!hitDomain) {
      warnings.push({
        type: "name_collision",
        detail:
          "company_name matches a pending discovery candidate but registrable domains did not align with that row",
      });
    }
  }

  // 1 — company_key
  for (const k of probe.keys) {
    if (allowlist.companyKeys.has(k)) {
      return {
        skip: true,
        decision: "skip_approved",
        matchKind: "company_key",
        approvedMatch: { via: "company_key", companyKey: k },
        pendingMatch: null,
        vetoMatch: null,
        warnings,
      };
    }
  }

  for (const k of probe.keys) {
    const vRow = vetoIdx.byKey.get(k);
    if (vRow) {
      return {
        skip: true,
        decision: "skip_veto",
        matchKind: "company_key",
        approvedMatch: null,
        pendingMatch: null,
        vetoMatch: vetoResultFromRow(vRow, "company_key"),
        warnings,
      };
    }
  }

  for (const k of probe.keys) {
    const hit = candidatesLoaded.pendingRows.find(
      (r) => String(r.candidate_id ?? "").trim() === k
    );
    if (hit) {
      return {
        skip: true,
        decision: "skip_pending",
        matchKind: "company_key",
        approvedMatch: null,
        pendingMatch: {
          via: "candidate_id_equals_key",
          candidateId: hit.candidate_id,
          domain: hit.domain_normalized,
        },
        vetoMatch: null,
        warnings,
      };
    }
  }

  // 2 — registrable domains (overlap sets)
  for (const d of probe.registrables) {
    if (allowlist.registrableDomains.has(d)) {
      return {
        skip: true,
        decision: "skip_approved",
        matchKind: "registrable_domain",
        approvedMatch: { via: probe.source.get(`dom:${d}`) || "domain", domain: d },
        pendingMatch: null,
        vetoMatch: null,
        warnings,
      };
    }
  }

  for (const d of probe.registrables) {
    const vRow = vetoIdx.byRegistrable.get(d);
    if (vRow) {
      return {
        skip: true,
        decision: "skip_veto",
        matchKind: "registrable_domain",
        approvedMatch: null,
        pendingMatch: null,
        vetoMatch: vetoResultFromRow(vRow, "registrable_domain"),
        warnings,
      };
    }
  }

  for (const d of probe.registrables) {
    const pRow = pendIdx.byRegistrable.get(d);
    if (pRow) {
      return {
        skip: true,
        decision: "skip_pending",
        matchKind: "registrable_domain",
        approvedMatch: null,
        pendingMatch: {
          via: "domain_normalized",
          candidateId: pRow.candidate_id,
          domain: d,
        },
        vetoMatch: null,
        warnings,
      };
    }
  }

  return {
    skip: false,
    decision: "proceed",
    matchKind: "none",
    approvedMatch: null,
    pendingMatch: null,
    vetoMatch: null,
    warnings,
  };
}

/**
 * @param {Record<string, string>} vRow
 * @param {string} via
 */
function vetoResultFromRow(vRow, via) {
  const expRaw = String(vRow.expires_at ?? "").trim();
  const exp = parseOptionalIso(vRow.expires_at);
  const permanent = exp == null;

  return {
    via,
    vetoId: String(vRow.veto_id ?? "").trim(),
    status: String(vRow.status ?? "").trim(),
    permanent,
    expiresAt: expRaw || null,
    reasonCategory: String(vRow.reason_category ?? "").trim(),
    reasonCode: String(vRow.reason_code ?? "").trim(),
    canonicalCompanyKey: String(vRow.canonical_company_key ?? "").trim(),
  };
}
