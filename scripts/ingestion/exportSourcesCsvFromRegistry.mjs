#!/usr/bin/env node
/**
 * Phase B: Build a sources.csv-compatible file from:
 *   - data/ingestion/production_source_registry.csv (identity / curated)
 *   - data/ingestion/source_operational_state.csv (rolling metrics)
 *
 * Does not modify repo-root sources.csv unless EXPORT_SOURCES_OUT points there.
 * Default output: data/ingestion/sources.generated.csv
 *
 * Rows: promoted registry entries with source_kind=ats_api (legacy daily-sync shape).
 *
 * Env:
 *   REGISTRY_CSV, OPERATIONAL_CSV
 *   EXPORT_SOURCES_OUT — output path (default data/ingestion/sources.generated.csv)
 *   EXPORT_FAIL_ON_MISSING_OPERATIONAL — if 1/true/yes, exit before writing CSV when any
 *     promoted ATS row has no operational row (strict mode; default warns and still writes)
 */
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";

import { PATHS } from "../config/pipelinePaths.mjs";
import { DEFAULT_OPERATIONAL } from "./sourceOperationalState.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..", "..");

const DEFAULT_REGISTRY = path.join(REPO_ROOT, PATHS.productionSourceRegistry);
const DEFAULT_OPERATIONAL_CSV = path.join(
  REPO_ROOT,
  PATHS.sourceOperationalState
);
const DEFAULT_EXPORT = path.join(REPO_ROOT, PATHS.sourcesGenerated);

/**
 * Column order matches current repo-root sources.csv (daily-sync load/save compatible).
 * @type {readonly string[]}
 */
export const SOURCES_EXPORT_COLUMNS = [
  "ats",
  "slug",
  "company_name",
  "status",
  "last_checked_at",
  "last_successful_fetch_at",
  "jobs_last_run",
  "jobs_relevant_last_run",
  "jobs_inserted_last_run",
  "jobs_updated_last_run",
  "jobs_irrelevant_last_run",
  "jobs_partial_last_run",
  "jobs_old_last_run",
  "fetch_failed_last_run",
  "yield_last_run",
  "times_seen_empty",
  "times_failed",
  "scrape_tier",
  "scrape_every_runs",
  "bucket_last_run",
  "last_error",
  "provider",
  "company",
];

/**
 * @param {string} p
 * @returns {Promise<Record<string, string>[]>}
 */
async function parseCsv(p) {
  const raw = await fs.readFile(p, "utf8");
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
function indexOperational(rows) {
  /** @type {Map<string, Record<string, string>>} */
  const m = new Map();
  for (const r of rows) {
    const k = (r.company_key || "").trim();
    if (k) m.set(k, r);
  }
  return m;
}

/**
 * @param {Record<string, string>} op
 * @param {Record<string, string>} defaults
 */
function mergeOperational(op, defaults) {
  const o = { ...defaults, ...op };
  return o;
}

function envFailOnMissingOperational() {
  return /^1|true|yes$/i.test(
    String(process.env.EXPORT_FAIL_ON_MISSING_OPERATIONAL || "").trim()
  );
}

async function main() {
  const registryPath = process.env.REGISTRY_CSV || DEFAULT_REGISTRY;
  const operationalPath = process.env.OPERATIONAL_CSV || DEFAULT_OPERATIONAL_CSV;
  const outPath = process.env.EXPORT_SOURCES_OUT || DEFAULT_EXPORT;

  const registryRows = await parseCsv(registryPath);
  let operationalRows = [];
  try {
    operationalRows = await parseCsv(operationalPath);
  } catch {
    operationalRows = [];
  }
  const opByKey = indexOperational(operationalRows);

  /** @type {Record<string, string>[]} */
  const out = [];
  /** @type {string[]} */
  const notes = [];
  /** @type {string[]} */
  const missingOperationalCompanyKeys = [];

  for (const reg of registryRows) {
    const company_key = (reg.company_key || "").trim();
    const ingestion_status = (reg.ingestion_status || "").trim().toLowerCase();
    const source_kind = (reg.source_kind || "").trim().toLowerCase();

    if (!company_key) {
      notes.push("skip: empty company_key");
      continue;
    }
    if (ingestion_status && ingestion_status !== "promoted") {
      notes.push(`skip ${company_key}: ingestion_status=${ingestion_status}`);
      continue;
    }
    if (source_kind && source_kind !== "ats_api") {
      notes.push(`skip ${company_key}: source_kind=${source_kind} (export supports ats_api only in Phase B)`);
      continue;
    }

    const ats = (reg.ats_provider || "").trim().toLowerCase();
    const slug = (reg.ats_board_slug || "").trim();
    const company_name = (reg.company_name || "").trim();
    if (!ats || !slug || !company_name) {
      notes.push(`skip ${company_key}: missing ats_provider, ats_board_slug, or company_name`);
      continue;
    }

    if (!opByKey.has(company_key)) {
      missingOperationalCompanyKeys.push(company_key);
    }

    const rawOp = opByKey.get(company_key) || {};
    const op = mergeOperational(rawOp, {
      ...DEFAULT_OPERATIONAL,
      company_key,
    });

    const status =
      (op.sources_status || "").trim() || DEFAULT_OPERATIONAL.sources_status;

    out.push({
      ats,
      slug,
      company_name,
      status,
      last_checked_at: op.last_checked_at ?? "",
      last_successful_fetch_at: op.last_successful_fetch_at ?? "",
      jobs_last_run: op.jobs_last_run ?? DEFAULT_OPERATIONAL.jobs_last_run,
      jobs_relevant_last_run:
        op.jobs_relevant_last_run ?? DEFAULT_OPERATIONAL.jobs_relevant_last_run,
      jobs_inserted_last_run:
        op.jobs_inserted_last_run ?? DEFAULT_OPERATIONAL.jobs_inserted_last_run,
      jobs_updated_last_run:
        op.jobs_updated_last_run ?? DEFAULT_OPERATIONAL.jobs_updated_last_run,
      jobs_irrelevant_last_run:
        op.jobs_irrelevant_last_run ?? DEFAULT_OPERATIONAL.jobs_irrelevant_last_run,
      jobs_partial_last_run:
        op.jobs_partial_last_run ?? DEFAULT_OPERATIONAL.jobs_partial_last_run,
      jobs_old_last_run: op.jobs_old_last_run ?? DEFAULT_OPERATIONAL.jobs_old_last_run,
      fetch_failed_last_run:
        op.fetch_failed_last_run ?? DEFAULT_OPERATIONAL.fetch_failed_last_run,
      yield_last_run: op.yield_last_run ?? DEFAULT_OPERATIONAL.yield_last_run,
      times_seen_empty: op.times_seen_empty ?? DEFAULT_OPERATIONAL.times_seen_empty,
      times_failed: op.times_failed ?? DEFAULT_OPERATIONAL.times_failed,
      scrape_tier: op.scrape_tier ?? DEFAULT_OPERATIONAL.scrape_tier,
      scrape_every_runs:
        op.scrape_every_runs ?? DEFAULT_OPERATIONAL.scrape_every_runs,
      bucket_last_run: op.bucket_last_run ?? "",
      last_error: op.last_fetch_error ?? "",
      provider: ats,
      company: company_name,
    });
  }

  const reportPath = path.join(REPO_ROOT, PATHS.exportSourcesReportLatest);

  const sortedMissing = [...missingOperationalCompanyKeys].sort();

  if (envFailOnMissingOperational() && sortedMissing.length > 0) {
    const failReport = {
      ok: false,
      error: "missing_operational_rows",
      message:
        "EXPORT_FAIL_ON_MISSING_OPERATIONAL is set; CSV not written. Import or fix source_operational_state.csv.",
      registry_csv: path.relative(REPO_ROOT, registryPath),
      operational_csv: path.relative(REPO_ROOT, operationalPath),
      export_out: path.relative(REPO_ROOT, outPath),
      missing_operational_company_keys: sortedMissing,
      rows_written: 0,
      skipped_notes: notes,
    };
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify(failReport, null, 2), "utf8");
    console.error(
      JSON.stringify(
        {
          ok: false,
          phase: "export_aborted",
          missing_operational_company_keys: sortedMissing,
          report: path.relative(REPO_ROOT, reportPath),
        },
        null,
        2
      )
    );
    process.exit(1);
  }

  if (sortedMissing.length > 0) {
    const warnMsg =
      `[ingestion:export] WARNING: ${sortedMissing.length} promoted ATS row(s) have no ` +
      `operational row; DEFAULT_OPERATIONAL applied. company_key: ` +
      `${sortedMissing.join(", ")}`;
    console.warn(warnMsg);
  }

  out.sort((a, b) => {
    const pa = String(a.provider).localeCompare(String(b.provider));
    if (pa !== 0) return pa;
    return String(a.slug).localeCompare(String(b.slug));
  });

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  const csv = stringify(out, {
    header: true,
    columns: [...SOURCES_EXPORT_COLUMNS],
    quoted_string: true,
  });
  await fs.writeFile(outPath, "\uFEFF" + csv, "utf8");

  const report = {
    ok: true,
    registry_csv: path.relative(REPO_ROOT, registryPath),
    operational_csv: path.relative(REPO_ROOT, operationalPath),
    export_out: path.relative(REPO_ROOT, outPath),
    rows_written: out.length,
    skipped_notes: notes,
    missing_operational_company_keys: [...missingOperationalCompanyKeys].sort(),
    missing_operational_warning:
      missingOperationalCompanyKeys.length > 0
        ? "defaults_were_applied_for_listed_company_keys"
        : null,
  };

  await fs.writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");

  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
