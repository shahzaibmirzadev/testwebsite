#!/usr/bin/env node
/**
 * Load data/ingestion/discovery_candidates.csv
 */
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { parse } from "csv-parse/sync";

import {
  DISCOVERY_CANDIDATE_COLUMNS,
  BLOCKING_CANDIDATE_STATUSES,
} from "./discoveryConstants.mjs";
import { PATHS } from "../config/pipelinePaths.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..", "..");

const DEFAULT_CANDIDATES_CSV = path.join(
  REPO_ROOT,
  PATHS.discoveryCandidates
);

/**
 * @param {string} [csvPath]
 * @returns {Promise<{ path: string, rows: Record<string, string>[], pendingRows: Record<string, string>[] }>}
 */
export async function loadDiscoveryCandidates(csvPath = DEFAULT_CANDIDATES_CSV) {
  let raw;
  try {
    raw = await fs.readFile(csvPath, "utf8");
  } catch (e) {
    if (e && /** @type {any} */ (e).code === "ENOENT") {
      return { path: csvPath, rows: [], pendingRows: [] };
    }
    throw e;
  }

  const rows = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    bom: true,
  });

  const normalized = rows.map((r) => normalizeCandidateRow(r));
  const pendingRows = normalized.filter((r) =>
    BLOCKING_CANDIDATE_STATUSES.has(
      String(r.status ?? "")
        .trim()
        .toLowerCase()
    )
  );

  return {
    path: csvPath,
    rows: normalized,
    pendingRows,
  };
}

/**
 * @param {Record<string, string>} row
 * @returns {Record<string, string>}
 */
function normalizeCandidateRow(row) {
  /** @type {Record<string, string>} */
  const o = {};
  for (const c of DISCOVERY_CANDIDATE_COLUMNS) {
    o[c] = row[c] != null ? String(row[c]) : "";
  }
  return o;
}

export { DEFAULT_CANDIDATES_CSV };
