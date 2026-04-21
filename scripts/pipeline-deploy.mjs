#!/usr/bin/env node
/**
 * Single-command deploy pipeline: resolver → extract → clean/filter/prepare →
 * Supabase routing sync → staged jobs + gates → publish to public.jobs.
 *
 * Does not replace scripts/daily-sync.js. Requires .env.local with service role for DB phases.
 * Convenience entry: npm run daily:pipeline → scripts/daily-pipeline.mjs (defaults ORCHESTRATOR_MODE=shadow).
 *
 * Env:
 *   ORCHESTRATOR_MODE=shadow|primary — shadow forces PIPELINE_SKIP_SUPABASE=1 (full extract locally, no Supabase sync or DB publish)
 *   PIPELINE_SKIP_SUPABASE=1 — skip sync + DB publish (local artifact-only run)
 *   PIPELINE_SKIP_DB_PUBLISH=1 — run syncs but skip publish to public.jobs
 *   PIPELINE_GATE_* — see pipelineDeployDb.mjs
 *   PIPELINE_BLOCK_CONCURRENT=1 — fail if another run is running/staged recently
 *   PIPELINE_CONCURRENT_CHECK_MINUTES — window for concurrent check (default 45)
 *   PIPELINE_STAGING_CLEANUP=1 + PIPELINE_STAGING_RETAIN_DAYS=N — delete jobs_staging older than N days after successful publish
 *
 * Deploy report artifact: only PATHS.pipelineDeployReportLatest (data/pipeline_deploy_report.latest.json)
 * is written. data/pipeline_deploy_report.json (no .latest), if present, is not produced here.
 */
import { spawnSync } from "child_process";
import fs from "fs/promises";
import path from "path";
import { parse } from "csv-parse/sync";
import { fileURLToPath } from "url";

import { PATHS } from "./config/pipelinePaths.mjs";
import { runDeployDbPhase } from "./pipeline/pipelineDeployDb.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..");

const DEPLOY_REPORT_PATH = path.join(REPO_ROOT, PATHS.pipelineDeployReportLatest);

const REPORT_VERSION = 3;

/**
 * @param {string} scriptName
 */
function runNpmScript(scriptName) {
  const r = spawnSync("npm", ["run", scriptName], {
    cwd: REPO_ROOT,
    shell: true,
    stdio: "inherit",
    env: process.env,
  });
  const status = r.status;
  const signal = r.signal;
  const spawnErr = r.error ? String(r.error.message) : null;
  const ok =
    spawnErr == null &&
    signal == null &&
    status !== null &&
    status === 0;
  return {
    script: scriptName,
    ok,
    status: status ?? -1,
    signal: signal ?? null,
    spawn_error: spawnErr,
    error: spawnErr,
  };
}

/**
 * @param {string} p
 */
async function readJsonSafe(p) {
  try {
    const raw = await fs.readFile(p, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function countRoutingCompanies() {
  const p = path.join(REPO_ROOT, PATHS.sourceRoutingTable);
  try {
    const raw = await fs.readFile(p, "utf8");
    const rows = parse(raw, {
      columns: true,
      skip_empty_lines: true,
      relax_quotes: true,
      bom: true,
    });
    return rows.length;
  } catch {
    return 0;
  }
}

async function assertJobsDbReadyForPublish() {
  const p = path.join(REPO_ROOT, PATHS.jobsDbReady);
  let raw;
  try {
    raw = await fs.readFile(p, "utf8");
  } catch {
    throw new Error(
      `Missing ${p}. Run jobs:prepare-db before publish (or use PIPELINE_SKIP_SUPABASE=1).`
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`Invalid JSON in jobs_db_ready.json: ${String(e?.message || e)}`);
  }
  if (!Array.isArray(parsed.jobs)) {
    throw new Error("jobs_db_ready.json must contain a jobs array.");
  }
  return parsed;
}

/**
 * @param {object[]} stepResults
 */
async function buildReport(stepResults) {
  const filterSummary = await readJsonSafe(
    path.join(REPO_ROOT, PATHS.summaryFilterJobs)
  );
  const prepareSummary = await readJsonSafe(
    path.join(REPO_ROOT, PATHS.summaryPrepareDb)
  );
  const extractHtml = await readJsonSafe(
    path.join(REPO_ROOT, PATHS.summaryExtractHtml)
  );
  const jobsReady = await readJsonSafe(path.join(REPO_ROOT, PATHS.jobsDbReady));

  const companiesRouted = await countRoutingCompanies();
  const relevantPass = filterSummary?.relevance_pass;
  const totalExtracted = filterSummary?.total_jobs;
  const jobsArr = Array.isArray(jobsReady?.jobs) ? jobsReady.jobs : [];
  const relevantFromFile = jobsArr.filter((j) => Boolean(j.is_relevant)).length;

  /** @type {Record<string, unknown>} */
  const metrics = {
    companies_routed: companiesRouted,
    extracted_total: totalExtracted,
    total_jobs: totalExtracted,
    from_ats_raw:
      filterSummary?.from_ats_after_clean ?? filterSummary?.from_ats_raw,
    from_html_raw:
      filterSummary?.from_html_after_clean ?? filterSummary?.from_html_raw,
    relevance_pass: relevantPass,
    relevance_fail: filterSummary?.relevance_fail,
    db_ready_rows: prepareSummary?.db_ready_rows ?? jobsReady?.summary?.db_ready_rows,
    duplicates_removed:
      prepareSummary?.duplicates_removed ?? jobsReady?.summary?.duplicates_removed,
    relevant_jobs: relevantFromFile || relevantPass || 0,
    jobs_db_ready_generated_at: jobsReady?.generated_at ?? null,
    html_companies_processed: extractHtml?.companies_processed,
    html_jobs_extracted: extractHtml?.jobs_extracted,
    html_failures: extractHtml?.failures,
  };

  return {
    report_version: REPORT_VERSION,
    generated_at: new Date().toISOString(),
    steps: stepResults,
    metrics,
    publish: {
      attempted: false,
      ok: false,
      published_job_count: 0,
      decision: "not_attempted",
    },
  };
}

/**
 * Writes the canonical deploy report to {@link DEPLOY_REPORT_PATH} only
 * (data/pipeline_deploy_report.latest.json). Does not write data/pipeline_deploy_report.json.
 * @param {Record<string, unknown>} report
 * @returns {Promise<string>} absolute path written
 */
async function writeDeployReport(report) {
  const body = JSON.stringify(report, null, 2);
  await fs.writeFile(DEPLOY_REPORT_PATH, body, "utf8");
  return DEPLOY_REPORT_PATH;
}

async function main() {
  const orchestratorMode = String(process.env.ORCHESTRATOR_MODE || "primary")
    .trim()
    .toLowerCase();
  if (orchestratorMode === "shadow") {
    process.env.PIPELINE_SKIP_SUPABASE = "1";
  } else if (orchestratorMode && orchestratorMode !== "primary") {
    console.error(
      JSON.stringify(
        {
          ok: false,
          error: "invalid_ORCHESTRATOR_MODE",
          message: `Expected "shadow" or "primary", got "${orchestratorMode}".`,
        },
        null,
        2
      )
    );
    process.exit(1);
  }

  const skipSupabase = /^1|true|yes$/i.test(
    String(process.env.PIPELINE_SKIP_SUPABASE || "").trim()
  );
  const skipDbPublish = /^1|true|yes$/i.test(
    String(process.env.PIPELINE_SKIP_DB_PUBLISH || "").trim()
  );

  console.log(
    JSON.stringify(
      {
        phase: "pipeline_deploy_start",
        cwd: REPO_ROOT,
        ORCHESTRATOR_MODE: orchestratorMode || "primary",
        PIPELINE_SKIP_SUPABASE: skipSupabase,
        PIPELINE_SKIP_DB_PUBLISH: skipDbPublish,
      },
      null,
      2
    )
  );

  /** @type {{ script: string, ok: boolean, status: number, error: string | null, signal?: string | null, spawn_error?: string | null }[]} */
  const stepResults = [];

  const extractionSteps = [
    "resolve:careers",
    "routing:table",
    "extract:ats",
    "extract:html",
    "extract:clean",
    "filter:jobs",
    "jobs:prepare-db",
    "pipeline:analyze",
    "pipeline:decision",
  ];

  for (const script of extractionSteps) {
    const res = runNpmScript(script);
    stepResults.push(res);
    if (!res.ok) {
      const report = await buildReport(stepResults);
      report.aborted_at = script;
      report.exit_summary = {
        code: 1,
        reason: "npm_script_failed",
        failed_step: script,
        spawn_error: res.spawn_error,
        signal: res.signal,
      };
      await writeDeployReport(report);
      console.error(
        JSON.stringify(
          {
            phase: "pipeline_deploy_failed",
            failed_step: script,
            status: res.status,
            signal: res.signal,
            spawn_error: res.spawn_error,
            report: DEPLOY_REPORT_PATH,
          },
          null,
          2
        )
      );
      console.error(
        `\n[pipeline:deploy] FAILED on step "${script}" (exit ${res.status}${res.signal ? ` signal ${res.signal}` : ""}). See ${DEPLOY_REPORT_PATH}\n`
      );
      process.exit(1);
    }
  }

  if (!skipSupabase) {
    for (const script of ["pipeline:sync-supabase", "pipeline:sync-companies"]) {
      const res = runNpmScript(script);
      stepResults.push(res);
      if (!res.ok) {
        const report = await buildReport(stepResults);
        report.aborted_at = script;
        report.exit_summary = {
          code: 1,
          reason: "supabase_sync_failed",
          failed_step: script,
          spawn_error: res.spawn_error,
          signal: res.signal,
        };
        await writeDeployReport(report);
        console.error(
          JSON.stringify(
            {
              phase: "supabase_sync_failed",
              failed_step: script,
              report: DEPLOY_REPORT_PATH,
            },
            null,
            2
          )
        );
        console.error(
          `\n[pipeline:deploy] FAILED on "${script}". See ${DEPLOY_REPORT_PATH}\n`
        );
        process.exit(1);
      }
    }
  }

  const report = await buildReport(stepResults);

  if (skipSupabase || skipDbPublish) {
    report.publish = {
      attempted: false,
      ok: false,
      published_job_count: 0,
      decision: "skipped",
      reason: skipSupabase ? "PIPELINE_SKIP_SUPABASE" : "PIPELINE_SKIP_DB_PUBLISH",
    };
    report.exit_summary = {
      code: 0,
      reason: "publish_skipped_by_env",
    };
    await writeDeployReport(report);
    console.log(
      JSON.stringify(
        {
          phase: "pipeline_deploy_done",
          publish_skipped: true,
          report: DEPLOY_REPORT_PATH,
        },
        null,
        2
      )
    );
    process.exit(0);
  }

  const supabaseUrl =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    report.publish = {
      attempted: false,
      ok: false,
      decision: "blocked",
      reason: "missing_supabase_env",
    };
    report.exit_summary = {
      code: 1,
      reason: "missing_env",
    };
    await writeDeployReport(report);
    console.error(
      JSON.stringify(
        {
          ok: false,
          error: "missing_env",
          message:
            "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for publish phase (or use PIPELINE_SKIP_SUPABASE=1).",
          report: DEPLOY_REPORT_PATH,
        },
        null,
        2
      )
    );
    process.exit(1);
  }

  try {
    await assertJobsDbReadyForPublish();
  } catch (e) {
    report.error = String(e?.message || e);
    report.exit_summary = { code: 1, reason: "invalid_jobs_db_ready" };
    await writeDeployReport(report);
    console.error(report.error);
    process.exit(1);
  }

  let dbResult;
  try {
    dbResult = await runDeployDbPhase({
      supabaseUrl,
      serviceKey,
      report: { metrics: report.metrics },
    });
  } catch (e) {
    report.error = String(e?.message || e);
    const ctx = /** @type {{ pipelineDeployContext?: { preflight?: unknown, concurrent?: unknown, runId?: string } }} */ (
      e
    )?.pipelineDeployContext;
    if (ctx?.preflight) report.preflight = ctx.preflight;
    if (ctx?.concurrent) report.concurrent_deploy = ctx.concurrent;
    if (ctx?.runId) report.pipeline_run_id = ctx.runId;
    report.exit_summary = {
      code: 1,
      reason: "db_phase_threw",
      pipeline_run_id: ctx?.runId,
    };
    await writeDeployReport(report);
    console.error(e);
    console.error(`\n[pipeline:deploy] DB phase error. See ${DEPLOY_REPORT_PATH}\n`);
    process.exit(1);
  }

  const publishOk = dbResult.ok === true;
  report.pipeline_run_id = dbResult.runId;
  report.preflight = dbResult.preflight;
  report.concurrent_deploy = dbResult.concurrent;
  if (dbResult.concurrent?.should_warn) {
    console.error(
      JSON.stringify({
        warn: "possible_concurrent_pipeline_run",
        other_runs: dbResult.concurrent.other_incomplete_runs,
        hint: "Set PIPELINE_BLOCK_CONCURRENT=1 to fail fast if another deploy is in progress.",
      })
    );
  }
  report.publish = {
    attempted: true,
    ok: publishOk,
    published_job_count: dbResult.published ?? 0,
    decision: publishOk ? "published" : "blocked_by_gates",
    gate_results: dbResult.gateResults,
    upsert: dbResult.upsertInfo ?? null,
    partial_publish_risk: dbResult.upsertInfo?.partial_publish_risk ?? null,
    staging_cleanup: dbResult.stagingCleanup ?? null,
  };
  report.db_metrics = dbResult.metrics;
  report.exit_summary = {
    code: publishOk ? 0 : 1,
    reason: publishOk ? "success" : "gates_failed_or_partial",
    pipeline_run_id: dbResult.runId,
  };

  await writeDeployReport(report);

  console.log(
    JSON.stringify(
      {
        phase: "pipeline_deploy_done",
        publish_ok: publishOk,
        published_job_count: dbResult.published,
        pipeline_run_id: dbResult.runId,
        report: DEPLOY_REPORT_PATH,
      },
      null,
      2
    )
  );

  if (!publishOk) {
    console.error(
      `\n[pipeline:deploy] Publish blocked (gates). Live jobs unchanged. See ${DEPLOY_REPORT_PATH}\n`
    );
  }

  process.exit(publishOk ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
