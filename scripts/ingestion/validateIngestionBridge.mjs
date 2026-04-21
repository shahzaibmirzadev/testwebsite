#!/usr/bin/env node
/**
 * Repeatable bridge audit: registry + operational + generated vs repo-root sources.csv.
 * Read-only — does not mutate CSVs.
 *
 * Writes data/ingestion/audit_report.latest.json
 * Exits non-zero if any check fails.
 *
 * Env:
 *   SOURCES_CSV — default repo-root sources.csv
 *   REGISTRY_CSV, OPERATIONAL_CSV, GENERATED_CSV — optional overrides
 */
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { parse } from "csv-parse/sync";

import { companyKeyFromLegacyAts } from "./companyKey.mjs";
import { isApprovedProductionAtsRegistryRow } from "./isApprovedProductionAtsRegistryRow.mjs";
import { PATHS } from "../config/pipelinePaths.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..", "..");

const DEFAULT_SOURCES = path.join(REPO_ROOT, PATHS.sourcesCsv);
const DEFAULT_REGISTRY = path.join(REPO_ROOT, PATHS.productionSourceRegistry);
const DEFAULT_OPERATIONAL = path.join(REPO_ROOT, PATHS.sourceOperationalState);
const DEFAULT_GENERATED = path.join(REPO_ROOT, PATHS.sourcesGenerated);
const REPORT_OUT = path.join(REPO_ROOT, PATHS.auditReportLatest);

/**
 * @param {string} p
 * @returns {Promise<Record<string, string>[]>}
 */
async function loadCsv(p) {
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
 * @param {string} keyField
 */
function duplicateKeys(rows, keyField) {
  const counts = new Map();
  for (const r of rows) {
    const k = String(r[keyField] ?? "").trim();
    if (!k) continue;
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  return [...counts.entries()].filter(([, c]) => c > 1).map(([k]) => k);
}

/**
 * @param {string} a
 * @param {string} b
 */
function normProvSlug(a, b) {
  return `${String(a || "")
    .trim()
    .toLowerCase()}::${String(b || "").trim()}`;
}

/**
 * @param {Record<string, string>} row
 */
function eligibleSourceRow(row) {
  const status = String(row.status ?? "")
    .trim()
    .toLowerCase();
  const provider = String(row.ats ?? row.provider ?? "")
    .trim()
    .toLowerCase();
  const slug = String(row.slug ?? "").trim();
  const company = String(row.company_name ?? row.company ?? "").trim();
  return (
    (status === "approved" || status === "auto") &&
    Boolean(provider && slug && company)
  );
}

/**
 * @param {Record<string, string>} row
 */
function comparableRow(row) {
  const provider = String(
    row.provider ?? row.ats ?? ""
  )
    .trim()
    .toLowerCase();
  return {
    ats: provider,
    slug: String(row.slug ?? "").trim(),
    company_name: String(row.company_name ?? "").trim(),
    status: String(row.status ?? "")
      .trim()
      .toLowerCase(),
    last_checked_at: String(row.last_checked_at ?? ""),
    last_successful_fetch_at: String(row.last_successful_fetch_at ?? ""),
    jobs_last_run: String(row.jobs_last_run ?? ""),
    jobs_relevant_last_run: String(row.jobs_relevant_last_run ?? ""),
    jobs_inserted_last_run: String(row.jobs_inserted_last_run ?? ""),
    jobs_updated_last_run: String(row.jobs_updated_last_run ?? ""),
    jobs_irrelevant_last_run: String(row.jobs_irrelevant_last_run ?? ""),
    jobs_partial_last_run: String(row.jobs_partial_last_run ?? ""),
    jobs_old_last_run: String(row.jobs_old_last_run ?? ""),
    fetch_failed_last_run: String(row.fetch_failed_last_run ?? ""),
    yield_last_run: String(row.yield_last_run ?? ""),
    times_seen_empty: String(row.times_seen_empty ?? ""),
    times_failed: String(row.times_failed ?? ""),
    scrape_tier: String(row.scrape_tier ?? ""),
    scrape_every_runs: String(row.scrape_every_runs ?? ""),
    bucket_last_run: String(row.bucket_last_run ?? ""),
    last_error: String(row.last_error ?? ""),
    provider,
    company: String(row.company ?? row.company_name ?? "").trim(),
  };
}

async function main() {
  const sourcesPath = process.env.SOURCES_CSV || DEFAULT_SOURCES;
  const registryPath = process.env.REGISTRY_CSV || DEFAULT_REGISTRY;
  const operationalPath = process.env.OPERATIONAL_CSV || DEFAULT_OPERATIONAL;
  const generatedPath = process.env.GENERATED_CSV || DEFAULT_GENERATED;

  /** @type {{ id: string, ok: boolean, detail?: unknown }[]} */
  const checks = [];

  let sources = [];
  let registry = [];
  let operational = [];
  let generated = [];

  try {
    sources = await loadCsv(sourcesPath);
  } catch (e) {
    checks.push({
      id: "sources_readable",
      ok: false,
      detail: String(e?.message || e),
    });
    await writeReportAndExit(checks, false, {
      sourcesPath,
      registryPath,
      operationalPath,
      generatedPath,
    });
    return;
  }

  try {
    registry = await loadCsv(registryPath);
  } catch (e) {
    checks.push({
      id: "registry_readable",
      ok: false,
      detail: String(e?.message || e),
    });
    await writeReportAndExit(checks, false, {
      sourcesPath,
      registryPath,
      operationalPath,
      generatedPath,
    });
    return;
  }

  try {
    operational = await loadCsv(operationalPath);
  } catch (e) {
    checks.push({
      id: "operational_readable",
      ok: false,
      detail: String(e?.message || e),
    });
    await writeReportAndExit(checks, false, {
      sourcesPath,
      registryPath,
      operationalPath,
      generatedPath,
    });
    return;
  }

  try {
    generated = await loadCsv(generatedPath);
  } catch (e) {
    checks.push({
      id: "generated_readable",
      ok: false,
      detail: String(e?.message || e),
    });
    await writeReportAndExit(checks, false, {
      sourcesPath,
      registryPath,
      operationalPath,
      generatedPath,
    });
    return;
  }

  const eligibleSources = sources.filter(eligibleSourceRow);
  const promotedAtsRows = registry.filter(isApprovedProductionAtsRegistryRow);
  const promotedKeys = new Set(
    promotedAtsRows.map((r) => (r.company_key || "").trim()).filter(Boolean)
  );

  const opKeys = new Set(
    operational.map((r) => (r.company_key || "").trim()).filter(Boolean)
  );

  checks.push({
    id: "row_counts_match",
    ok:
      eligibleSources.length === promotedAtsRows.length &&
      eligibleSources.length === operational.length &&
      eligibleSources.length === generated.length,
    detail: {
      sources_total: sources.length,
      sources_eligible: eligibleSources.length,
      registry_promoted_ats: promotedAtsRows.length,
      operational_rows: operational.length,
      generated_rows: generated.length,
    },
  });

  checks.push({
    id: "no_duplicate_registry_company_key",
    ok: duplicateKeys(registry, "company_key").length === 0,
    detail: { duplicates: duplicateKeys(registry, "company_key") },
  });

  checks.push({
    id: "no_duplicate_operational_company_key",
    ok: duplicateKeys(operational, "company_key").length === 0,
    detail: { duplicates: duplicateKeys(operational, "company_key") },
  });

  const dupSrc = [];
  const srcMap = new Map();
  for (const r of sources) {
    const k = normProvSlug(r.ats ?? r.provider, r.slug);
    if (!k.includes("::") || k === "::") continue;
    srcMap.set(k, (srcMap.get(k) || 0) + 1);
  }
  for (const [k, c] of srcMap) {
    if (c > 1) dupSrc.push(k);
  }
  checks.push({
    id: "no_duplicate_sources_provider_slug",
    ok: dupSrc.length === 0,
    detail: { duplicates: dupSrc.slice(0, 20), total: dupSrc.length },
  });

  const dupGen = [];
  const genMap = new Map();
  for (const r of generated) {
    const k = normProvSlug(r.provider, r.slug);
    genMap.set(k, (genMap.get(k) || 0) + 1);
  }
  for (const [k, c] of genMap) {
    if (c > 1) dupGen.push(k);
  }
  checks.push({
    id: "no_duplicate_generated_provider_slug",
    ok: dupGen.length === 0,
    detail: { duplicates: dupGen.slice(0, 20), total: dupGen.length },
  });

  const missingRegistryForEligible = [];
  for (const r of eligibleSources) {
    const ck = companyKeyFromLegacyAts(r.ats ?? r.provider, r.slug);
    if (!promotedKeys.has(ck)) missingRegistryForEligible.push(ck);
  }
  checks.push({
    id: "eligible_sources_have_registry_row",
    ok: missingRegistryForEligible.length === 0,
    detail: { missing: missingRegistryForEligible.slice(0, 30), total: missingRegistryForEligible.length },
  });

  const opNotInRegistry = [...opKeys].filter((k) => !promotedKeys.has(k));
  checks.push({
    id: "operational_rows_subset_of_registry_promoted_keys",
    ok: opNotInRegistry.length === 0,
    detail: { keys: opNotInRegistry.slice(0, 30), total: opNotInRegistry.length },
  });

  const promotedWithoutOp = [...promotedKeys].filter((k) => !opKeys.has(k));
  checks.push({
    id: "promoted_ats_have_operational_row",
    ok: promotedWithoutOp.length === 0,
    detail: { company_keys: promotedWithoutOp.slice(0, 30), total: promotedWithoutOp.length },
  });

  const srcHeaders = sources.length ? Object.keys(sources[0]) : [];
  const genHeaders = generated.length ? Object.keys(generated[0]) : [];
  const headersMatch =
    srcHeaders.length === genHeaders.length &&
    srcHeaders.every((h, i) => h === genHeaders[i]);
  checks.push({
    id: "sources_generated_headers_identical_order",
    ok: headersMatch,
    detail: {
      sources_headers: srcHeaders,
      generated_headers: genHeaders,
    },
  });

  const smap = new Map();
  for (const r of eligibleSources) {
    smap.set(
      normProvSlug(r.ats ?? r.provider, r.slug),
      comparableRow(r)
    );
  }
  const gmap = new Map();
  for (const r of generated) {
    gmap.set(normProvSlug(r.provider, r.slug), comparableRow(r));
  }

  const parityMismatches = [];
  for (const [k, sv] of smap) {
    const gv = gmap.get(k);
    if (!gv) {
      parityMismatches.push({ key: k, issue: "missing_in_generated" });
      continue;
    }
    const fields = new Set([...Object.keys(sv), ...Object.keys(gv)]);
    for (const f of fields) {
      if ((sv[f] ?? "") !== (gv[f] ?? "")) {
        parityMismatches.push({
          key: k,
          field: f,
          sources: sv[f],
          generated: gv[f],
        });
        break;
      }
    }
  }
  for (const k of gmap.keys()) {
    if (!smap.has(k)) {
      parityMismatches.push({ key: k, issue: "extra_in_generated" });
    }
  }

  checks.push({
    id: "eligible_vs_generated_field_parity",
    ok: parityMismatches.length === 0,
    detail: {
      mismatch_count: parityMismatches.length,
      samples: parityMismatches.slice(0, 25),
    },
  });

  checks.push({
    id: "generated_row_count_vs_promoted_ats",
    ok: generated.length === promotedAtsRows.length,
    detail: { generated: generated.length, promoted_ats: promotedAtsRows.length },
  });

  const allOk = checks.every((c) => c.ok);
  await writeReportAndExit(checks, allOk, {
    sourcesPath,
    registryPath,
    operationalPath,
    generatedPath,
  });
}

/**
 * @param {{ id: string, ok: boolean, detail?: unknown }[]} checks
 * @param {boolean} allOk
 * @param {Record<string, string>} paths
 */
async function writeReportAndExit(checks, allOk, paths) {
  const report = {
    report_version: 1,
    generated_at: new Date().toISOString(),
    pass: allOk,
    paths: {
      sources_csv: path.relative(REPO_ROOT, paths.sourcesPath),
      registry_csv: path.relative(REPO_ROOT, paths.registryPath),
      operational_csv: path.relative(REPO_ROOT, paths.operationalPath),
      generated_csv: path.relative(REPO_ROOT, paths.generatedPath),
    },
    checks,
    summary: {
      failed: checks.filter((c) => !c.ok).map((c) => c.id),
      passed_count: checks.filter((c) => c.ok).length,
      total_count: checks.length,
    },
  };

  await fs.mkdir(path.dirname(REPORT_OUT), { recursive: true });
  await fs.writeFile(REPORT_OUT, JSON.stringify(report, null, 2), "utf8");

  const line = allOk
    ? `[ingestion:audit] PASS (${checks.length} checks)`
    : `[ingestion:audit] FAIL — ${report.summary.failed.join(", ")}`;
  console.log(line);
  if (!allOk) {
    console.log(JSON.stringify(report.summary, null, 2));
  }

  process.exit(allOk ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
