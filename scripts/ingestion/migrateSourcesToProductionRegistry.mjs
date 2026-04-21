#!/usr/bin/env node
/**
 * Phase A: Build data/ingestion/production_source_registry.csv from repo-root sources.csv.
 * Does not modify sources.csv or daily-sync.js.
 *
 * Eligibility matches scripts/daily-sync.js loadSources():
 *   - status is "approved" or "auto" (case-insensitive)
 *   - provider (ats || provider), slug, and company_name are non-empty after trim
 *
 * Idempotent: re-running with the same sources.csv produces the same keys; existing
 * registry rows are merged by company_key to preserve promoted_at, notes_internal,
 * and manual_override_lock unless sources data requires updating ATS fields.
 *
 * Usage: node scripts/ingestion/migrateSourcesToProductionRegistry.mjs
 * Env: SOURCES_CSV (optional, default repo-root sources.csv)
 */
import fs from "fs/promises";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";

import { companyKeyFromLegacyAts } from "./companyKey.mjs";
import { PATHS } from "../config/pipelinePaths.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..", "..");

const DEFAULT_SOURCES = path.join(REPO_ROOT, PATHS.sourcesCsv);
const REGISTRY_OUT = path.join(REPO_ROOT, PATHS.productionSourceRegistry);
const REPORT_OUT = path.join(REPO_ROOT, PATHS.migrationReportLatest);

/** @type {const} */
export const REGISTRY_COLUMNS = [
  "company_key",
  "company_name",
  "domain",
  "ingestion_status",
  "promotion_source",
  "promoted_at",
  "source_kind",
  "ats_provider",
  "ats_board_slug",
  "careers_url_canonical",
  "extractor_profile",
  "manual_override_lock",
  "notes_internal",
];

/**
 * @param {string} p
 */
async function readFileUtf8(p) {
  return fs.readFile(p, "utf8");
}

/**
 * @param {string} p
 * @returns {Promise<Record<string, string>[]>}
 */
async function parseCsvFile(p) {
  const raw = await readFileUtf8(p);
  return parse(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    bom: true,
  });
}

/**
 * @param {Record<string, string>[]} rows
 */
function indexByCompanyKey(rows) {
  /** @type {Map<string, Record<string, string>>} */
  const m = new Map();
  for (const r of rows) {
    const k = (r.company_key || "").trim();
    if (k) m.set(k, r);
  }
  return m;
}

async function main() {
  const sourcesPath = process.env.SOURCES_CSV || DEFAULT_SOURCES;
  const migrationRunAt = new Date().toISOString();

  let rawSources;
  try {
    rawSources = await parseCsvFile(sourcesPath);
  } catch (e) {
    console.error(
      JSON.stringify({
        ok: false,
        error: "sources_read_failed",
        path: sourcesPath,
        message: String(e?.message || e),
      })
    );
    process.exit(1);
  }

  /** @type {Map<string, Record<string, string>>} */
  let existingByKey = new Map();
  try {
    const prev = await parseCsvFile(REGISTRY_OUT);
    existingByKey = indexByCompanyKey(prev);
  } catch {
    // no existing registry
  }

  /** @type {{ reason: string, row_index: number, ats?: string, slug?: string, company_name?: string, status?: string }[]} */
  const skipped = [];
  /** @type {Set<string>} */
  const seenKeys = new Set();
  /** @type {Record<string, string>[]} */
  const outRows = [];

  let eligibleSeen = 0;

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
      skipped.push({
        reason: "status_not_approved_or_auto",
        row_index: i + 2,
        status: row.status ?? "",
      });
      continue;
    }
    if (!provider || !slug || !company_name) {
      skipped.push({
        reason: "missing_required_ats_fields",
        row_index: i + 2,
        ats: row.ats,
        slug: row.slug,
        company_name: row.company_name ?? row.company,
      });
      continue;
    }

    eligibleSeen += 1;
    const company_key = companyKeyFromLegacyAts(provider, slug);

    if (seenKeys.has(company_key)) {
      skipped.push({
        reason: "duplicate_provider_slug",
        row_index: i + 2,
        ats: provider,
        slug,
        company_name,
      });
      continue;
    }
    seenKeys.add(company_key);

    const prev = existingByKey.get(company_key);
    const promoted_at =
      prev?.promoted_at?.trim() || migrationRunAt;
    const notes_internal =
      prev?.notes_internal?.trim() ||
      "Migrated from repo-root sources.csv (Phase A).";
    const manual_override_lock =
      String(prev?.manual_override_lock ?? "")
        .trim()
        .toLowerCase() === "true"
        ? "true"
        : "false";

    outRows.push({
      company_key,
      company_name,
      domain: prev?.domain?.trim() || "",
      ingestion_status: "promoted",
      promotion_source: "legacy_sources_csv",
      promoted_at,
      source_kind: "ats_api",
      ats_provider: provider,
      ats_board_slug: slug,
      careers_url_canonical: prev?.careers_url_canonical?.trim() || "",
      extractor_profile: prev?.extractor_profile?.trim() || "",
      manual_override_lock,
      notes_internal,
    });
  }

  outRows.sort((a, b) =>
    String(a.company_key).localeCompare(String(b.company_key))
  );

  await fs.mkdir(path.dirname(REGISTRY_OUT), { recursive: true });
  const csvBody = stringify(outRows, {
    header: true,
    columns: REGISTRY_COLUMNS,
    quoted_string: true,
  });
  await fs.writeFile(REGISTRY_OUT, "\uFEFF" + csvBody, "utf8");

  const report = {
    ok: true,
    migration_run_at: migrationRunAt,
    sources_csv: path.relative(REPO_ROOT, sourcesPath),
    registry_out: path.relative(REPO_ROOT, REGISTRY_OUT),
    sources_rows_total: rawSources.length,
    eligible_baseline_rows_seen: eligibleSeen,
    migrated_unique_rows: outRows.length,
    skipped_rows: skipped.length,
    skipped_breakdown: summarizeSkipped(skipped),
    skipped_detail: skipped,
    idempotent_merge: Boolean(existingByKey.size),
    existing_registry_rows_before: existingByKey.size,
  };

  await fs.writeFile(REPORT_OUT, JSON.stringify(report, null, 2), "utf8");

  console.log(JSON.stringify(report, null, 2));
}

/**
 * @param {{ reason: string }[]} skipped
 */
function summarizeSkipped(skipped) {
  /** @type {Record<string, number>} */
  const o = {};
  for (const s of skipped) {
    o[s.reason] = (o[s.reason] || 0) + 1;
  }
  return o;
}

const invokedDirectly =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (invokedDirectly) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
