/**
 * Stage jobs_db_ready.json → jobs_staging, run gates, publish to public.jobs.
 * Requires migration 20260413140000_pipeline_deploy_tables.sql and service role key.
 */
import fs from "fs/promises";
import path from "path";
import { parse } from "csv-parse/sync";
import { createClient } from "@supabase/supabase-js";

import {
  mapDbReadyToJobsPayload,
  isEligibleForPublish,
  assertPublishPayloadsComplete,
} from "./jobRowMapper.mjs";

import { PATHS } from "../config/pipelinePaths.mjs";

const REPO = process.cwd();
const JOBS_DB_READY = path.join(REPO, PATHS.jobsDbReady);
const ROUTING = path.join(REPO, PATHS.sourceRoutingTable);

/**
 * @param {string} k
 * @param {number} def
 */
function envNum(k, def) {
  const v = process.env[k];
  if (v === undefined || v === "") return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

/**
 * @param {string} k
 * @param {boolean} def
 */
function envBool(k, def) {
  const v = process.env[k];
  if (v === undefined || v === "") return def;
  return /^1|true|yes$/i.test(String(v).trim());
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

/**
 * @returns {Promise<{ atsReady: number, htmlReady: number }>}
 */
async function countRoutingExpectations() {
  try {
    const raw = await fs.readFile(ROUTING, "utf8");
    const rows = parse(raw, {
      columns: true,
      skip_empty_lines: true,
      relax_quotes: true,
      bom: true,
    });
    let atsReady = 0;
    let htmlReady = 0;
    for (const r of rows) {
      const ready =
        String(r.ready_for_extraction || "")
          .trim()
          .toLowerCase() === "true";
      if (!ready) continue;
      const ex = String(r.extractor_type || "").trim();
      if (ex === "ats_api") atsReady += 1;
      if (ex === "html_scraper") htmlReady += 1;
    }
    return { atsReady, htmlReady };
  } catch {
    return { atsReady: 0, htmlReady: 0 };
  }
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 */
async function fetchLastPublishedRun(supabase) {
  const { data, error } = await supabase
    .from("pipeline_runs")
    .select("id,published_at,published_job_count,metrics")
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(1);

  if (error || !data?.length) return null;
  return data[0];
}

/**
 * @param {Record<string, unknown>} gateResults
 * @param {string} code
 * @param {string} message
 * @param {unknown} [detail]
 */
function addGateFailure(gateResults, code, message, detail = null) {
  if (!gateResults.failures) gateResults.failures = [];
  gateResults.failures.push({ code, message, detail });
  gateResults.ok = false;
}

/**
 * @param {Record<string, unknown>} metrics
 * @param {Awaited<ReturnType<typeof countRoutingExpectations>>} routing
 */
export async function runPublishGates(metrics, routing) {
  const gateResults = /** @type {Record<string, unknown>} */ ({
    ok: true,
    failures: /** @type {unknown[]} */ ([]),
  });

  const minExtracted = envNum("PIPELINE_MIN_EXTRACTED_TOTAL", 1);
  const minRelevant = envNum("PIPELINE_MIN_RELEVANT_JOBS", 1);
  const maxDropRatio = envNum("PIPELINE_MAX_DROP_RATIO", 0.5);
  const maxDupeRatio = envNum("PIPELINE_MAX_INTERNAL_DUPE_RATIO", 0.2);
  const maxExplosionRatio = envNum("PIPELINE_MAX_PUBLISH_EXPLOSION_RATIO", 3);
  const strictAts = envBool("PIPELINE_GATE_STRICT_ATS_EMPTY", false);
  const strictHtml = envBool("PIPELINE_GATE_STRICT_HTML_EMPTY", false);

  const extractedTotal = Number(metrics.extracted_total ?? 0);
  const relevantCount = Number(
    metrics.relevant_jobs_eligible ?? metrics.relevant_jobs ?? 0
  );
  const fromAts = Number(metrics.from_ats_raw ?? 0);
  const fromHtml = Number(metrics.from_html_raw ?? 0);
  const dbReady = Number(metrics.db_ready_rows ?? 0);
  const dupRemoved = Number(metrics.duplicates_removed ?? 0);
  const rawKeys = dbReady + dupRemoved;

  if (extractedTotal < minExtracted) {
    addGateFailure(
      gateResults,
      "min_extracted",
      `extracted_total ${extractedTotal} < ${minExtracted}`,
      { extractedTotal, minExtracted }
    );
  }

  if (relevantCount < minRelevant) {
    addGateFailure(
      gateResults,
      "min_relevant",
      `relevant_jobs ${relevantCount} < ${minRelevant}`,
      { relevantCount, minRelevant }
    );
  }

  if (rawKeys > 0 && dupRemoved / rawKeys > maxDupeRatio) {
    addGateFailure(
      gateResults,
      "duplicate_explosion",
      `duplicates_removed/raw ${(dupRemoved / rawKeys).toFixed(3)} > ${maxDupeRatio}`,
      { dupRemoved, rawKeys, maxDupeRatio }
    );
  }

  if (strictAts && routing.atsReady > 0 && fromAts === 0) {
    addGateFailure(
      gateResults,
      "ats_empty",
      `routing expects ${routing.atsReady} ATS companies but from_ats_raw=0`,
      { atsReady: routing.atsReady, fromAts }
    );
  }

  if (strictHtml && routing.htmlReady > 0 && fromHtml === 0) {
    addGateFailure(
      gateResults,
      "html_empty",
      `routing expects ${routing.htmlReady} HTML scraper companies but from_html_raw=0`,
      { htmlReady: routing.htmlReady, fromHtml }
    );
  }

  return {
    gateResults,
    thresholds: {
      minExtracted,
      minRelevant,
      maxDropRatio,
      maxDupeRatio,
      maxExplosionRatio,
      strictAts,
      strictHtml,
    },
  };
}

/**
 * Compare publish count to last successful run.
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {number} publishCount
 * @param {Record<string, unknown>} gateResults
 */
async function gateAgainstLastRun(supabase, publishCount, gateResults) {
  const maxDropRatio = envNum("PIPELINE_MAX_DROP_RATIO", 0.5);
  const maxExplosionRatio = envNum("PIPELINE_MAX_PUBLISH_EXPLOSION_RATIO", 3);
  const last = await fetchLastPublishedRun(supabase);
  if (!last || last.published_job_count == null) return;

  const prev = Number(last.published_job_count);
  if (prev <= 0) return;

  const ratio = publishCount / prev;
  if (ratio < maxDropRatio) {
    addGateFailure(
      gateResults,
      "drop_vs_last",
      `publish_count ${publishCount} vs last ${prev} (ratio ${ratio.toFixed(3)} < ${maxDropRatio})`,
      { publishCount, prev, maxDropRatio }
    );
  }

  if (prev >= 10 && publishCount > prev * maxExplosionRatio) {
    addGateFailure(
      gateResults,
      "explosion_vs_last",
      `publish_count ${publishCount} >> last ${prev}`,
      { publishCount, prev, maxExplosionRatio }
    );
  }
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} runId
 * @param {string} step
 * @param {string} message
 * @param {unknown} [detail]
 */
async function recordError(supabase, runId, step, message, detail = null) {
  const { error } = await supabase.from("pipeline_run_errors").insert({
    pipeline_run_id: runId,
    step,
    message: message.slice(0, 8000),
    detail: detail == null ? null : detail,
  });
  if (error) {
    console.error(
      JSON.stringify({
        warn: "pipeline_run_errors_insert_failed",
        step,
        message: error.message,
      })
    );
  }
}

/**
 * Verify deploy tables exist (fail fast with a clear message).
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 */
/**
 * Serializable checks for deploy report (no secrets). Used as preflight gate.
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 */
export async function getPreflightDiagnostics(supabase) {
  /** @type {{ name: string, ok: boolean, detail?: string }[]} */
  const checks = [];

  const t1 = await supabase.from("pipeline_runs").select("id").limit(1);
  checks.push({
    name: "pipeline_runs_select",
    ok: !t1.error,
    detail: t1.error?.message,
  });

  const t2 = await supabase.from("jobs_staging").select("id").limit(1);
  checks.push({
    name: "jobs_staging_select",
    ok: !t2.error,
    detail: t2.error?.message,
  });

  const t3 = await supabase.from("jobs").select("id").limit(1);
  checks.push({
    name: "public_jobs_select",
    ok: !t3.error,
    detail: t3.error?.message,
  });

  const t4 = await supabase
    .from("jobs")
    .select("source,source_job_id")
    .limit(1);
  checks.push({
    name: "public_jobs_conflict_columns_present",
    ok: !t4.error,
    detail:
      t4.error?.message ||
      "onConflict(source,source_job_id) requires these columns; ensure a matching unique constraint exists.",
  });

  return {
    all_ok: checks.every((c) => c.ok),
    checks,
    note: "Preflight does not verify every NOT NULL column on public.jobs — new columns without defaults can still fail at upsert.",
  };
}

export async function preflightDeployTables(supabase) {
  const diag = await getPreflightDiagnostics(supabase);
  if (!diag.all_ok) {
    const failed = diag.checks.filter((c) => !c.ok).map((c) => c.name).join(", ");
    throw new Error(
      `pipeline deploy preflight failed (${failed}). Apply migration 20260413140000 and confirm SUPABASE_SERVICE_ROLE_KEY.`
    );
  }
  return diag;
}

/**
 * Warn or block if another deploy may still be in progress.
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 */
export async function checkConcurrentPipelineRuns(supabase) {
  const windowMin = envNum("PIPELINE_CONCURRENT_CHECK_MINUTES", 45);
  const since = new Date(Date.now() - windowMin * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("pipeline_runs")
    .select("id,status,started_at")
    .in("status", ["running", "staged"])
    .gte("started_at", since);

  if (error) {
    return {
      error: error.message,
      other_incomplete_runs: [],
    };
  }

  const rows = data || [];
  const block = envBool("PIPELINE_BLOCK_CONCURRENT", false);
  if (rows.length > 0 && block) {
    throw new Error(
      `Concurrent pipeline deploy blocked: ${rows.length} run(s) in running/staged since ${since}. Finish or abort them, or unset PIPELINE_BLOCK_CONCURRENT.`
    );
  }

  return {
    other_incomplete_runs: rows,
    should_warn: rows.length > 0,
    window_minutes: windowMin,
    blocked: false,
  };
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {Record<string, unknown>[]} jobs
 */
async function loadExistingJobsMap(supabase, jobs) {
  /** @type {Map<string, { id: string, expires_at: string | null }>} */
  const map = new Map();
  /** @type {Map<string, Set<string>>} */
  const bySource = new Map();
  for (const j of jobs) {
    const source = String(j.source || "").trim();
    const sid = String(j.source_job_id || "").trim();
    if (!source || !sid) continue;
    if (!bySource.has(source)) bySource.set(source, new Set());
    bySource.get(source).add(sid);
  }
  for (const [source, idSet] of bySource) {
    const ids = [...idSet];
    for (const idChunk of chunk(ids, 200)) {
      const { data, error } = await supabase
        .from("jobs")
        .select("id,source,source_job_id,expires_at")
        .eq("source", source)
        .in("source_job_id", idChunk);
      if (error) {
        throw new Error(
          `existing jobs lookup failed (${source}): ${error.message}`
        );
      }
      for (const row of data || []) {
        map.set(`${row.source}__${row.source_job_id}`, {
          id: row.id,
          expires_at: row.expires_at,
        });
      }
    }
  }
  return map;
}

/** Max rows per upsert request — one PostgREST request is typically one DB transaction. */
const UPSERT_CHUNK = Math.min(
  500,
  Math.max(50, envNum("PIPELINE_UPSERT_CHUNK_SIZE", 500))
);

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {Record<string, unknown>[]} payloads
 */
async function upsertJobsBatched(supabase, payloads) {
  if (payloads.length === 0) {
    return {
      chunk_count: 0,
      multi_chunk: false,
      partial_publish_risk: "none",
    };
  }
  const chunks = chunk(payloads, UPSERT_CHUNK);
  let rowsCommitted = 0;
  for (let i = 0; i < chunks.length; i++) {
    const part = chunks[i];
    const { error } = await supabase.from("jobs").upsert(part, {
      onConflict: "source,source_job_id",
    });
    if (error) {
      throw new Error(
        `jobs upsert failed at batch ${i + 1}/${chunks.length} (size ${part.length}, rows ${rowsCommitted} already committed this run): ${error.message}. If batches_completed > 0, earlier batches may already be committed to public.jobs.`
      );
    }
    rowsCommitted += part.length;
  }
  const multi = chunks.length > 1;
  return {
    chunk_count: chunks.length,
    multi_chunk: multi,
    partial_publish_risk: multi ? "multi_chunk_upsert" : "none",
    rows_upserted: rowsCommitted,
    partial_publish_note:
      multi
        ? "Each HTTP batch is typically one transaction; multiple batches mean a late failure can leave earlier batches applied. Set PIPELINE_UPSERT_CHUNK_SIZE higher (max 500) to reduce batches."
        : null,
  };
}

/**
 * Optional: delete old jobs_staging rows to control table growth.
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 */
async function maybeCleanupJobsStaging(supabase) {
  if (!envBool("PIPELINE_STAGING_CLEANUP", false)) return { ran: false };
  const retainDays = envNum("PIPELINE_STAGING_RETAIN_DAYS", 0);
  if (retainDays <= 0) return { ran: false, reason: "PIPELINE_STAGING_RETAIN_DAYS not set" };

  const cutoff = new Date(Date.now() - retainDays * 864e5).toISOString();
  const { error } = await supabase.from("jobs_staging").delete().lt("created_at", cutoff);

  if (error) {
    console.error(
      JSON.stringify({ warn: "jobs_staging_cleanup_failed", message: error.message })
    );
    return { ran: false, error: error.message };
  }
  return { ran: true, retain_days: retainDays, cutoff };
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} runId
 * @param {Record<string, unknown>} report
 */
export async function executePipelineDeployDb(supabase, runId, report) {
  const routing = await countRoutingExpectations();
  const raw = await fs.readFile(JOBS_DB_READY, "utf8");
  const payload = JSON.parse(raw);
  const jobs = Array.isArray(payload.jobs) ? payload.jobs : [];

  const relevantTitles = jobs.filter((j) => Boolean(j.is_relevant)).length;
  /** @type {Record<string, unknown>} */
  const baseReportMetrics =
    report.metrics && typeof report.metrics === "object" ? report.metrics : {};

  /** @type {Record<string, unknown>} */
  const metrics = {
    ...baseReportMetrics,
    db_ready_rows: payload.summary?.db_ready_rows ?? jobs.length,
    duplicates_removed: payload.summary?.duplicates_removed ?? 0,
    relevant_jobs:
      baseReportMetrics.relevant_jobs != null
        ? Number(baseReportMetrics.relevant_jobs)
        : relevantTitles,
    extracted_total:
      baseReportMetrics.extracted_total != null
        ? Number(baseReportMetrics.extracted_total)
        : baseReportMetrics.total_jobs != null
          ? Number(baseReportMetrics.total_jobs)
          : jobs.length,
  };

  const stagingRows = jobs
    .filter(
      (j) =>
        String(j.source || "").trim().length > 0 &&
        String(j.source_job_id || "").trim().length > 0
    )
    .map((j) => ({
      pipeline_run_id: runId,
      source: String(j.source || "").trim(),
      source_job_id: String(j.source_job_id || "").trim(),
      row_payload: j,
    }));
  const staging_skipped_invalid_keys = jobs.length - stagingRows.length;

  for (const batch of chunk(stagingRows, 150)) {
    const { error } = await supabase.from("jobs_staging").insert(batch);
    if (error) {
      await recordError(supabase, runId, "staging_insert", error.message, error);
      throw new Error(`jobs_staging insert failed: ${error.message}`);
    }
  }

  const relevantPublishTargets = jobs.filter((j) => isEligibleForPublish(j));
  let malformed = 0;
  for (const j of jobs) {
    if (!Boolean(j.is_relevant)) continue;
    if (!isEligibleForPublish(j)) malformed += 1;
  }

  metrics.relevant_jobs_eligible = relevantPublishTargets.length;

  const { gateResults: gr, thresholds } = await runPublishGates(metrics, routing);
  const gateResults = gr;
  await gateAgainstLastRun(supabase, relevantPublishTargets.length, gateResults);

  if (malformed > 0) {
    addGateFailure(
      gateResults,
      "malformed_relevant_rows",
      `${malformed} relevant rows failed field validation or age gate`,
      { malformed }
    );
  }

  if (!gateResults.ok) {
    const failureCodes = (
      /** @type {{ code?: string }[]} */ (gateResults.failures) || []
    ).map((f) => f.code || "unknown");

    await supabase
      .from("pipeline_runs")
      .update({
        finished_at: new Date().toISOString(),
        status: "gate_failed",
        publish_allowed: false,
        metrics: {
          ...metrics,
          routing,
          staging_skipped_invalid_keys,
        },
        gate_results: gateResults,
        summary: {
          thresholds,
          publish_skipped: true,
          publish_skipped_reason: "validation_gates_failed",
          gate_failure_codes: failureCodes,
          eligible_publish_targets: relevantPublishTargets.length,
        },
      })
      .eq("id", runId);

    for (const f of /** @type {{ code?: string, message?: string, detail?: unknown }[]} */ (
      gateResults.failures || []
    )) {
      await recordError(
        supabase,
        runId,
        `gate:${f.code || "unknown"}`,
        String(f.message || "gate failure"),
        f.detail ?? null
      );
    }

    return {
      ok: false,
      published: 0,
      runId,
      gateResults,
      metrics: { ...metrics, routing, staging_skipped_invalid_keys },
    };
  }

  const existingMap = await loadExistingJobsMap(supabase, relevantPublishTargets);
  let netNewJobInserts = 0;
  for (const row of relevantPublishTargets) {
    const key = `${String(row.source)}__${String(row.source_job_id)}`;
    if (!existingMap.has(key)) netNewJobInserts += 1;
  }
  const payloads = relevantPublishTargets.map((row) => {
    const key = `${String(row.source)}__${String(row.source_job_id)}`;
    const existing = existingMap.get(key) || null;
    return mapDbReadyToJobsPayload(row, existing);
  });

  try {
    assertPublishPayloadsComplete(payloads);
  } catch (e) {
    const msg = String(/** @type {{ message?: string }} */ (e)?.message || e);
    await recordError(supabase, runId, "payload_schema_check", msg, null);
    throw new Error(`Publish payload validation: ${msg}`);
  }

  let upsertInfo = {
    chunk_count: 0,
    multi_chunk: false,
    partial_publish_risk: "none",
  };
  try {
    upsertInfo = await upsertJobsBatched(supabase, payloads);
  } catch (e) {
    const msg = String(/** @type {{ message?: string }} */ (e)?.message || e);
    await recordError(supabase, runId, "publish_upsert_batch", msg, {
      payloads_preview: payloads.slice(0, 3).map((p) => ({
        source: p.source,
        source_job_id: p.source_job_id,
      })),
    });
    throw e;
  }

  if (netNewJobInserts > 0) {
    const { error: lrErr } = await supabase.rpc("increment_lifetime_roles_by", {
      delta: netNewJobInserts,
    });
    if (lrErr) {
      throw new Error(`lifetime_roles_increment_failed: ${lrErr.message}`);
    }
  }

  const published = payloads.length;
  const finishedAt = new Date().toISOString();
  const stagingCleanup = await maybeCleanupJobsStaging(supabase);

  await supabase
    .from("pipeline_runs")
    .update({
      finished_at: finishedAt,
      status: "published",
      publish_allowed: true,
      published_at: finishedAt,
      published_job_count: published,
      metrics: {
        ...metrics,
        routing,
        staging_skipped_invalid_keys,
      },
      gate_results: gateResults,
      summary: {
        thresholds,
        published_job_count: published,
        malformed_relevant_skipped: malformed,
        upsert_chunk_count: upsertInfo.chunk_count,
        upsert_multi_chunk: upsertInfo.multi_chunk,
        partial_publish_risk: upsertInfo.partial_publish_risk,
        partial_publish_note: upsertInfo.partial_publish_note,
        publish_note: upsertInfo.multi_chunk
          ? "Multiple upsert batches were used; if a later batch failed, earlier batches may already be committed."
          : null,
        jobs_staging_cleanup: stagingCleanup,
        staging_retention_note:
          "jobs_staging grows over time. Optional: PIPELINE_STAGING_CLEANUP=1 and PIPELINE_STAGING_RETAIN_DAYS=14 to delete old staging rows.",
      },
    })
    .eq("id", runId);

  return {
    ok: true,
    published,
    runId,
    gateResults,
    metrics: { ...metrics, routing, staging_skipped_invalid_keys },
    upsertInfo,
    stagingCleanup,
  };
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 */
export async function createPipelineRun(supabase) {
  const { data, error } = await supabase
    .from("pipeline_runs")
    .insert({
      status: "running",
      metrics: {},
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error(error?.message || "pipeline_runs insert failed");
  }
  return data.id;
}

/**
 * @param {Record<string, unknown>} param0
 */
export async function runDeployDbPhase({
  supabaseUrl,
  serviceKey,
  report,
}) {
  const supabase = createClient(supabaseUrl, serviceKey);
  const preflight = await preflightDeployTables(supabase);
  const concurrent = await checkConcurrentPipelineRuns(supabase);

  const runId = await createPipelineRun(supabase);

  await supabase
    .from("pipeline_runs")
    .update({ status: "staged" })
    .eq("id", runId);

  try {
    const result = await executePipelineDeployDb(supabase, runId, report);
    return {
      ...result,
      runId,
      preflight,
      concurrent,
    };
  } catch (e) {
    const msg = String(/** @type {{ message?: string }} */ (e)?.message || e);
    await recordError(supabase, runId, "aborted", msg, { phase: "executePipelineDeployDb" });
    await supabase
      .from("pipeline_runs")
      .update({
        status: "aborted",
        finished_at: new Date().toISOString(),
        publish_allowed: false,
        summary: {
          error: msg,
          note: "public.jobs may be unchanged, or partially updated if a multi-batch upsert failed after earlier batches succeeded.",
          preflight_ok: preflight.all_ok,
        },
      })
      .eq("id", runId);
    const err = e instanceof Error ? e : new Error(msg);
    Object.assign(err, {
      pipelineDeployContext: { preflight, concurrent, runId },
    });
    throw err;
  }
}
