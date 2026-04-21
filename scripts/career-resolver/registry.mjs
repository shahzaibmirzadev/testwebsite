import fs from "fs/promises";
import path from "path";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";

import { RERUN_RESOLVER_STATUSES } from "./constants.mjs";

export const OUTPUT_COLUMNS = [
  "company_name",
  "company_key",
  "homepage_url",
  "domain",
  "linkedin_url",
  "category",
  "confidence_flag",
  "homepage_input_validation",
  "homepage_validation_note",
  "careers_url_candidate",
  "careers_url_final",
  "redirected_to",
  "resolver_status",
  "source_type_guess",
  "notes",
  "last_checked_at",
];

/**
 * @param {string} filePath
 * @returns {Promise<Map<string, Record<string, string>>>}
 */
export async function loadRegistryByKey(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const rows = parse(raw, {
      columns: true,
      skip_empty_lines: true,
      relax_quotes: true,
      bom: true,
    });
    /** @type {Map<string, Record<string, string>>} */
    const map = new Map();
    for (const row of rows) {
      const key = (row.company_key || "").trim();
      if (key) {
        map.set(key, normalizeRow(row));
      }
    }
    return map;
  } catch (e) {
    if (e && /** @type {any} */ (e).code === "ENOENT") {
      return new Map();
    }
    throw e;
  }
}

function normalizeRow(row) {
  const o = {};
  for (const c of OUTPUT_COLUMNS) {
    o[c] = row[c] != null ? String(row[c]) : "";
  }
  return o;
}

/**
 * @param {string} filePath
 * @param {Record<string, string>[]} rows
 */
export async function writeRegistry(filePath, rows) {
  const sorted = [...rows].sort((a, b) =>
    String(a.company_key).localeCompare(String(b.company_key))
  );
  const out = stringify(sorted, {
    header: true,
    columns: OUTPUT_COLUMNS,
    quoted_string: true,
  });
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, "\uFEFF" + out, "utf8");
}

/**
 * Default rerun: no row, empty status, or needs retry / inconclusive.
 * @param {string | undefined} resolverStatus
 */
export function shouldReprocess(resolverStatus) {
  const s = (resolverStatus ?? "").trim();
  return RERUN_RESOLVER_STATUSES.has(s);
}
