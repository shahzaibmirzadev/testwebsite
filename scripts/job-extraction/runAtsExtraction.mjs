#!/usr/bin/env node
/**
 * Reads data/source_routing_table.csv, extracts jobs for ats_api + ready rows.
 * Writes data/extracted_jobs_raw.json — does not touch Supabase.
 *
 * Env (optional):
 *   ATS_EXTRACT_MAX_COMPANIES=n — process at most n ready ATS rows (after optional sort)
 *   EXTRACT_ROUTING_PRIORITY_SORT=1 — sort ready rows by extractor_priority (high→low) then company_key
 *   ATS_EXTRACT_DELAY_MS — delay between companies (default 400)
 */
import fs from "fs/promises";
import path from "path";
import { parse } from "csv-parse/sync";

import { PATHS } from "../config/pipelinePaths.mjs";
import { getAtsHandler, hasImplementedHandler } from "./atsHandlers/index.mjs";

const REPO_ROOT = process.cwd();
const ROUTING_PATH = path.join(REPO_ROOT, PATHS.sourceRoutingTable);
const OUTPUT_PATH = path.join(REPO_ROOT, PATHS.extractedJobsRaw);

function parseAtsExtractDelayMs() {
  const raw = String(process.env.ATS_EXTRACT_DELAY_MS ?? "").trim();
  if (!raw) return 400;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 400;
}

const DELAY_MS = parseAtsExtractDelayMs();

/** @type {Record<string, number>} */
const PRIORITY_RANK = { high: 0, medium: 1, low: 2, none: 3 };

/**
 * @param {string | undefined} p
 */
function priorityRank(p) {
  const k = String(p ?? "").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(PRIORITY_RANK, k)
    ? PRIORITY_RANK[/** @type {keyof typeof PRIORITY_RANK} */ (k)]
    : 4;
}

/**
 * @param {Record<string, string>} a
 * @param {Record<string, string>} b
 */
function compareRoutingPriority(a, b) {
  const pr = priorityRank(a.extractor_priority) - priorityRank(b.extractor_priority);
  if (pr !== 0) return pr;
  return String(a.company_key || "").localeCompare(String(b.company_key || ""));
}

function parseEnvRoutingPrioritySort() {
  return /^1|true|yes$/i.test(
    String(process.env.EXTRACT_ROUTING_PRIORITY_SORT || "").trim()
  );
}

/**
 * @returns {number | null}
 */
function parseAtsMaxCompanies() {
  const raw = String(process.env.ATS_EXTRACT_MAX_COMPANIES || "").trim();
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * @param {Record<string, string>} row
 */
function isAtsReady(row) {
  return (
    (row.extractor_type || "").trim() === "ats_api" &&
    (row.ready_for_extraction || "").trim().toLowerCase() === "true"
  );
}

/**
 * @param {Record<string, unknown>} job
 * @param {Record<string, string>} row
 */
function withRoutingMeta(job, row) {
  return {
    ...job,
    company_key: row.company_key || "",
    routing_final_source_type: row.final_source_type || "",
    careers_url_final: row.careers_url_final || "",
  };
}

async function main() {
  let raw;
  try {
    raw = await fs.readFile(ROUTING_PATH, "utf8");
  } catch (e) {
    console.error(
      JSON.stringify({
        ok: false,
        error: "missing_routing_table",
        message: `Expected ${ROUTING_PATH}. Run npm run routing:table first.`,
      })
    );
    process.exit(1);
  }

  const rows = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    bom: true,
  });

  /** @type {Record<string, string>[]} */
  let targets = rows.filter(isAtsReady);

  if (parseEnvRoutingPrioritySort()) {
    targets = [...targets].sort(compareRoutingPriority);
  }

  const maxCompanies = parseAtsMaxCompanies();
  if (maxCompanies != null) {
    targets = targets.slice(0, maxCompanies);
  }

  /** @type {Record<string, unknown>[]} */
  const allJobs = [];
  const failures = [];
  let skippedNoHandler = 0;
  let companiesOk = 0;
  let companiesFailed = 0;

  /** @type {Record<string, unknown>[]} */
  const companyRuns = [];

  for (let i = 0; i < targets.length; i++) {
    const row = targets[i];
    const fst = (row.final_source_type || "").trim();
    const tCompany = Date.now();

    if (!hasImplementedHandler(fst)) {
      skippedNoHandler += 1;
      failures.push({
        company_name: row.company_name,
        company_key: row.company_key,
        final_source_type: fst,
        error: "no_handler_implemented",
      });
      companyRuns.push({
        company_name: row.company_name,
        company_key: row.company_key,
        final_source_type: fst,
        duration_ms: Date.now() - tCompany,
        job_count: 0,
        ok: false,
        skip: "no_handler_implemented",
      });
      console.log(
        JSON.stringify({
          level: "skip",
          reason: "no_handler_implemented",
          company: row.company_name,
          final_source_type: fst,
          duration_ms: Date.now() - tCompany,
        })
      );
      continue;
    }

    const handler = getAtsHandler(fst);
    try {
      const jobs = await handler(row);
      const enriched = (jobs || []).map((j) => withRoutingMeta(j, row));
      allJobs.push(...enriched);
      companiesOk += 1;
      const duration_ms = Date.now() - tCompany;
      companyRuns.push({
        company_name: row.company_name,
        company_key: row.company_key,
        final_source_type: fst,
        duration_ms,
        job_count: enriched.length,
        ok: true,
      });
      console.log(
        JSON.stringify({
          level: "ok",
          company: row.company_name,
          final_source_type: fst,
          job_count: enriched.length,
          duration_ms,
        })
      );
    } catch (err) {
      companiesFailed += 1;
      failures.push({
        company_name: row.company_name,
        company_key: row.company_key,
        final_source_type: fst,
        error: String(err?.message || err),
      });
      const duration_ms = Date.now() - tCompany;
      companyRuns.push({
        company_name: row.company_name,
        company_key: row.company_key,
        final_source_type: fst,
        duration_ms,
        job_count: 0,
        ok: false,
        error: String(err?.message || err),
      });
      console.log(
        JSON.stringify({
          level: "error",
          company: row.company_name,
          final_source_type: fst,
          error: String(err?.message || err),
          duration_ms,
        })
      );
    }

    if (i < targets.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  const payload = {
    generated_at: new Date().toISOString(),
    source_file: ROUTING_PATH,
    summary: {
      routing_rows_total: rows.length,
      ats_api_ready_rows: rows.filter(isAtsReady).length,
      ats_companies_this_run: targets.length,
      companies_succeeded: companiesOk,
      companies_failed: companiesFailed,
      skipped_no_handler: skippedNoHandler,
      failure_records: failures.length,
      jobs_extracted: allJobs.length,
      ats_extract_delay_ms: DELAY_MS,
    },
    failures,
    company_runs: companyRuns,
    jobs: allJobs,
  };

  await fs.writeFile(OUTPUT_PATH, JSON.stringify(payload, null, 2), "utf8");

  console.log(
    JSON.stringify(
      {
        ok: true,
        output: OUTPUT_PATH,
        ...payload.summary,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
