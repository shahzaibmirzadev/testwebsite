/**
 * Build exclusion sets from sources.csv, production registry, veto registry, persisted seen.
 */
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { parse } from "csv-parse/sync";

import { PATHS } from "../config/pipelinePaths.mjs";
import { providerSlugKey } from "./parseAtsUrl.mjs";
import { loadTrackedSourcesIndex } from "../source-recovery/recoveryMergeShared.mjs";
import { isApprovedProductionAtsRegistryRow } from "../ingestion/isApprovedProductionAtsRegistryRow.mjs";
import { loadVetoRegistry } from "../ingestion/loadVetoRegistry.mjs";
import { normalizeCompanyName } from "../source-recovery/recoveryMergeShared.mjs";
import {
  normalizeDomainInput,
  normalizeUrlToRegistrableDomain,
} from "../ingestion/normalizeDomain.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..", "..");

/**
 * @param {string} companyKey
 * @returns {{ provider: string, slug: string } | null}
 */
export function parseLegacyAtsCompanyKey(companyKey) {
  const s = String(companyKey ?? "").trim();
  const m = s.match(/^legacy__([a-z0-9-]+)__(.+)$/i);
  if (!m) return null;
  return { provider: m[1].toLowerCase(), slug: m[2] };
}

/**
 * @param {{
 *   sourcesCsvPath?: string,
 *   productionRegistryPath?: string,
 *   useVetoRegistry?: boolean,
 *   persistedSeenKeys?: Set<string>,
 * }} opts
 */
export async function loadExclusionCorpora(opts = {}) {
  const sourcesCsvPath = opts.sourcesCsvPath
    ? path.resolve(opts.sourcesCsvPath)
    : path.join(REPO_ROOT, PATHS.sourcesCsv);
  const productionRegistryPath = path.join(
    REPO_ROOT,
    opts.productionRegistryPath || PATHS.productionSourceRegistry
  );

  /** @type {Set<string>} */
  const fromSources = new Set();
  /** @type {Set<string>} */
  const fromRegistry = new Set();
  /** @type {Set<string>} */
  const fromVeto = new Set();
  /** @type {Set<string>} */
  const existingCompanyNames = new Set();
  /** @type {Set<string>} */
  const existingDomains = new Set();

  const idx = await loadTrackedSourcesIndex(sourcesCsvPath);
  for (const k of idx.byKey.keys()) {
    fromSources.add(k);
  }
  for (const row of idx.byKey.values()) {
    const cn = normalizeCompanyName(
      row.company_name || row.company || ""
    );
    if (cn) existingCompanyNames.add(cn);
    const dom = String(row.domain ?? "").trim();
    if (dom) {
      const n = normalizeDomainInput(dom);
      if (n.ok) existingDomains.add(n.registrableDomain);
    }
  }

  let regRaw;
  try {
    regRaw = await fs.readFile(productionRegistryPath, "utf8");
  } catch {
    regRaw = "";
  }
  if (regRaw) {
    const regRows = parse(regRaw, {
      columns: true,
      skip_empty_lines: true,
      relax_quotes: true,
      bom: true,
    });
    for (const r of regRows) {
      if (!isApprovedProductionAtsRegistryRow(r)) continue;
      const p = String(r.ats_provider ?? "")
        .trim()
        .toLowerCase();
      const sl = String(r.ats_board_slug ?? "").trim();
      if (p && sl) {
        fromRegistry.add(providerSlugKey(p, sl));
      }
      const name = String(r.company_name ?? "").trim();
      if (name) {
        existingCompanyNames.add(normalizeCompanyName(name));
      }
      const dom = String(r.domain ?? "").trim();
      if (dom) {
        const n = normalizeDomainInput(dom);
        if (n.ok) existingDomains.add(n.registrableDomain);
      }
      const careers = String(r.careers_url_canonical ?? "").trim();
      if (careers) {
        const n2 = normalizeUrlToRegistrableDomain(careers);
        if (n2.ok) existingDomains.add(n2.registrableDomain);
      }
    }
  }

  if (opts.useVetoRegistry !== false) {
    const vetoLoaded = await loadVetoRegistry();
    for (const row of vetoLoaded.activeRows) {
      const ck = parseLegacyAtsCompanyKey(row.company_key);
      if (ck) {
        fromVeto.add(providerSlugKey(ck.provider, ck.slug));
      }
      const dom = String(row.domain_normalized ?? "").trim();
      if (dom) {
        const n = normalizeDomainInput(dom);
        if (n.ok) existingDomains.add(n.registrableDomain);
      }
    }
  }

  /** @type {Set<string>} */
  const persistedSeen = new Set(opts.persistedSeenKeys || []);

  return {
    fromSources,
    fromRegistry,
    fromVeto,
    persistedSeen,
    existingCompanyNames,
    existingDomains,
    sourcesRowCount: idx.byKey.size,
  };
}
