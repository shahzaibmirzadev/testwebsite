#!/usr/bin/env node
/**
 * Load data/ingestion/source_veto_registry.csv (CSV-first veto / suppression layer).
 *
 * Status `rejected` and `suppressed` are treated identically for blocking. Convention:
 * rejected = permanent intent; suppressed = temporary intent (often paired with expires_at).
 */
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { parse } from "csv-parse/sync";

import { PATHS } from "../config/pipelinePaths.mjs";
import { VETO_REGISTRY_COLUMNS } from "./discoveryConstants.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..", "..");

const DEFAULT_VETO_CSV = path.join(REPO_ROOT, PATHS.sourceVetoRegistry);

/**
 * @param {string | undefined} iso
 * @returns {Date | null}
 */
export function parseOptionalIso(iso) {
  const s = String(iso ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * @param {Record<string, string>} row
 * @param {Date} [now]
 * @returns {boolean}
 */
export function isVetoRowActive(row, now = new Date()) {
  const status = String(row.status ?? "")
    .trim()
    .toLowerCase();
  if (status !== "rejected" && status !== "suppressed") {
    return false;
  }
  const exp = parseOptionalIso(row.expires_at);
  if (!exp) {
    return true;
  }
  return exp.getTime() > now.getTime();
}

/**
 * @param {string} [csvPath]
 * @returns {Promise<{ path: string, rows: Record<string, string>[], activeRows: Record<string, string>[] }>}
 */
export async function loadVetoRegistry(csvPath = DEFAULT_VETO_CSV) {
  let raw;
  try {
    raw = await fs.readFile(csvPath, "utf8");
  } catch (e) {
    if (e && /** @type {any} */ (e).code === "ENOENT") {
      return { path: csvPath, rows: [], activeRows: [] };
    }
    throw e;
  }

  const rows = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    bom: true,
  });

  const normalized = rows.map((r) => normalizeVetoRow(r));
  const now = new Date();
  const activeRows = normalized.filter((r) => isVetoRowActive(r, now));

  return {
    path: csvPath,
    rows: normalized,
    activeRows,
  };
}

/**
 * @param {Record<string, string>} row
 * @returns {Record<string, string>}
 */
function normalizeVetoRow(row) {
  /** @type {Record<string, string>} */
  const o = {};
  for (const c of VETO_REGISTRY_COLUMNS) {
    o[c] = row[c] != null ? String(row[c]) : "";
  }
  return o;
}

export { DEFAULT_VETO_CSV };
