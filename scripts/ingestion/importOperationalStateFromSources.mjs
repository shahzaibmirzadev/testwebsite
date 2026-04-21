#!/usr/bin/env node
/**
 * Phase B: Populate data/ingestion/source_operational_state.csv from repo-root sources.csv
 * for rows whose company_key exists in production_source_registry.csv.
 *
 * Read-only on sources.csv. Does not change daily-sync.js or live scraping.
 *
 * Idempotent: re-import overwrites metric columns from sources.csv; preserves
 * consecutive_failures when a previous operational row exists (sources has no such field).
 *
 * Env:
 *   SOURCES_CSV — default repo-root sources.csv
 *   REGISTRY_CSV — default data/ingestion/production_source_registry.csv
 *   OPERATIONAL_OUT — default data/ingestion/source_operational_state.csv
 */
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";

import { companyKeyFromLegacyAts } from "./companyKey.mjs";
import {
  OPERATIONAL_COLUMNS,
} from "./sourceOperationalState.mjs";
import { PATHS } from "../config/pipelinePaths.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..", "..");

const DEFAULT_SOURCES = path.join(REPO_ROOT, PATHS.sourcesCsv);
const DEFAULT_REGISTRY = path.join(REPO_ROOT, PATHS.productionSourceRegistry);
const DEFAULT_OUT = path.join(REPO_ROOT, PATHS.sourceOperationalState);

/**
 * @param {string} p
 */
async function readUtf8(p) {
  return fs.readFile(p, "utf8");
}

/**
 * @param {string} p
 * @returns {Promise<Record<string, string>[]>}
 */
async function parseCsv(p) {
  const raw = await readUtf8(p);
  return parse(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    bom: true,
  });
}

/**
 * @param {Record<string, string>[]} rows
 * @returns {Map<string, Record<string, string>>}
 */
function indexByKey(rows) {
  const m = new Map();
  for (const r of rows) {
    const k = (r.company_key || "").trim();
    if (k) m.set(k, r);
  }
  return m;
}

async function main() {
  const sourcesPath = process.env.SOURCES_CSV || DEFAULT_SOURCES;
  const registryPath = process.env.REGISTRY_CSV || DEFAULT_REGISTRY;
  const outPath = process.env.OPERATIONAL_OUT || DEFAULT_OUT;

  const [rawSources, registryRows, existingOperational] = await Promise.all([
    parseCsv(sourcesPath),
    parseCsv(registryPath),
    parseCsv(outPath).catch(() => []),
  ]);

  const registryKeys = new Set(
    registryRows.map((r) => (r.company_key || "").trim()).filter(Boolean)
  );
  const existingByKey = indexByKey(
    Array.isArray(existingOperational) ? existingOperational : []
  );

  /** @type {Record<string, string>[]} */
  const out = [];
  /** @type {{ reason: string, row_index: number }[]} */
  const skipped = [];

  for (let i = 0; i < rawSources.length; i++) {
    const row = rawSources[i];
    const status = String(row.status ?? "")
      .trim()
      .toLowerCase();
    const provider = String(row.ats ?? row.provider ?? "")
      .trim()
      .toLowerCase();
    const slug = String(row.slug ?? "").trim();
    const company_name = String(row.company_name ?? row.company ?? "").trim();

    if (status !== "approved" && status !== "auto") {
      skipped.push({ reason: "status_not_approved_or_auto", row_index: i + 2 });
      continue;
    }
    if (!provider || !slug || !company_name) {
      skipped.push({ reason: "missing_required_ats_fields", row_index: i + 2 });
      continue;
    }

    const company_key = companyKeyFromLegacyAts(provider, slug);
    if (!registryKeys.has(company_key)) {
      skipped.push({ reason: "not_in_production_registry", row_index: i + 2 });
      continue;
    }

    const prev = existingByKey.get(company_key);

    out.push({
      company_key,
      sources_status: String(row.status ?? "").trim() || "auto",
      last_checked_at: row.last_checked_at ?? "",
      last_successful_fetch_at: row.last_successful_fetch_at ?? "",
      last_fetch_error: row.last_error ?? "",
      consecutive_failures: prev?.consecutive_failures?.trim() ?? "",
      jobs_last_run: row.jobs_last_run ?? "",
      jobs_relevant_last_run: row.jobs_relevant_last_run ?? "",
      jobs_inserted_last_run: row.jobs_inserted_last_run ?? "",
      jobs_updated_last_run: row.jobs_updated_last_run ?? "",
      jobs_irrelevant_last_run: row.jobs_irrelevant_last_run ?? "",
      jobs_partial_last_run: row.jobs_partial_last_run ?? "",
      jobs_old_last_run: row.jobs_old_last_run ?? "",
      fetch_failed_last_run: row.fetch_failed_last_run ?? "",
      yield_last_run: row.yield_last_run ?? "",
      times_seen_empty: row.times_seen_empty ?? "",
      times_failed: row.times_failed ?? "",
      scrape_tier: row.scrape_tier ?? "",
      scrape_every_runs: row.scrape_every_runs ?? "",
      bucket_last_run: row.bucket_last_run ?? "",
    });
  }

  out.sort((a, b) => String(a.company_key).localeCompare(String(b.company_key)));

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  const csv = stringify(out, {
    header: true,
    columns: [...OPERATIONAL_COLUMNS],
    quoted_string: true,
  });
  await fs.writeFile(outPath, "\uFEFF" + csv, "utf8");

  const report = {
    ok: true,
    sources_csv: path.relative(REPO_ROOT, sourcesPath),
    registry_csv: path.relative(REPO_ROOT, registryPath),
    operational_out: path.relative(REPO_ROOT, outPath),
    sources_rows_total: rawSources.length,
    operational_rows_written: out.length,
    registry_keys_total: registryKeys.size,
    skipped_rows: skipped.length,
    skipped_breakdown: summarize(skipped),
  };

  const reportPath = path.join(REPO_ROOT, PATHS.importOperationalReportLatest);
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");

  console.log(JSON.stringify(report, null, 2));
}

/**
 * @param {{ reason: string }[]} rows
 */
function summarize(rows) {
  /** @type {Record<string, number>} */
  const o = {};
  for (const r of rows) {
    o[r.reason] = (o[r.reason] || 0) + 1;
  }
  return o;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
