#!/usr/bin/env node
/**
 * Load promoted production sources from data/ingestion/production_source_registry.csv
 * for discovery short-circuiting (allowlist by company_key + registrable domain).
 *
 * Includes promoted ATS API rows and promoted HTML custom rows
 * (`isApprovedProductionDiscoveryAllowlistRow`). ATS export / bridge still uses
 * `isApprovedProductionAtsRegistryRow` only — unchanged.
 *
 * Read-only; does not change Phase A/B migration behavior.
 */
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { parse } from "csv-parse/sync";

import { normalizeDomainInput } from "./normalizeDomain.mjs";
import { isApprovedProductionDiscoveryAllowlistRow } from "./isApprovedProductionAtsRegistryRow.mjs";
import { PATHS } from "../config/pipelinePaths.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..", "..");

const DEFAULT_PRODUCTION_REGISTRY = path.join(
  REPO_ROOT,
  PATHS.productionSourceRegistry
);

/**
 * @typedef {{
 *   companyKeys: Set<string>,
 *   registrableDomains: Set<string>,
 *   companyNamesLower: Set<string>,
 *   rows: Record<string, string>[],
 *   registry_rows_total: number,
 *   approved_registry_rows: number,
 * }} ProductionAllowlist
 */

/**
 * @param {string} [csvPath]
 * @returns {Promise<{ path: string } & ProductionAllowlist>}
 */
export async function loadProductionAllowlist(
  csvPath = DEFAULT_PRODUCTION_REGISTRY
) {
  const raw = await fs.readFile(csvPath, "utf8");
  const parsed = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    bom: true,
  });

  const registry_rows_total = parsed.length;
  const approvedRows = parsed.filter(isApprovedProductionDiscoveryAllowlistRow);

  /** @type {Set<string>} */
  const companyKeys = new Set();
  /** @type {Set<string>} */
  const registrableDomains = new Set();
  /** @type {Set<string>} */
  const companyNamesLower = new Set();

  for (const r of approvedRows) {
    const ck = String(r.company_key ?? "").trim();
    if (ck) {
      companyKeys.add(ck);
    }
    const name = String(r.company_name ?? "").trim();
    if (name) {
      companyNamesLower.add(name.toLowerCase());
    }
    const dom = String(r.domain ?? "").trim();
    if (dom) {
      const n = normalizeDomainInput(dom);
      if (n.ok) {
        registrableDomains.add(n.registrableDomain);
      }
    }
    const careers = String(r.careers_url_canonical ?? "").trim();
    if (careers) {
      const n = normalizeDomainInput(careers);
      if (n.ok) {
        registrableDomains.add(n.registrableDomain);
      }
    }
  }

  return {
    path: csvPath,
    companyKeys,
    registrableDomains,
    companyNamesLower,
    rows: approvedRows,
    registry_rows_total,
    approved_registry_rows: approvedRows.length,
  };
}

export { DEFAULT_PRODUCTION_REGISTRY };
