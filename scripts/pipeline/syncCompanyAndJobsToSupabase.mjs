#!/usr/bin/env node
/**
 * Upserts resolver + routing companies into Supabase `company_list`, and pipeline job rows
 * into `pipeline_extracted_jobs` (separate from the production `jobs` table).
 *
 * Prerequisite: tables must exist. Run supabase/sql/01_create_pipeline_tables_safe.sql
 * in the SQL Editor once (idempotent; does not drop public.jobs). See supabase/sql/00_README.txt.
 *
 * Why jobs? After careers URLs are resolved, `extract:ats` / HTML extraction can pull listings
 * from ATS feeds; those land in data/extracted_jobs_clean.json. This sync is optional visibility
 * in Supabase — not required for the resolver-only phase.
 *
 * If extracted_jobs_clean.json is missing (e.g. gitignored in CI), company_list still syncs;
 * pipeline_extracted_jobs is left unchanged so a scheduled run does not wipe QA data.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (e.g. from .env.local)
 */
import { existsSync } from "node:fs";
import fs from "fs/promises";
import path from "path";
import { parse } from "csv-parse/sync";
import { createClient } from "@supabase/supabase-js";

import { PATHS } from "../config/pipelinePaths.mjs";

const REPO = process.cwd();
const REGISTRY = path.join(REPO, PATHS.careerSourceRegistry);
const ROUTING = path.join(REPO, PATHS.sourceRoutingTable);
const CLEAN_JOBS = path.join(REPO, PATHS.extractedJobsClean);

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/** @param {string | null | undefined} s */
function nz(s) {
  const t = String(s ?? "").trim();
  return t.length ? t : null;
}

/** @param {string | null | undefined} s */
function parseTs(s) {
  const t = String(s ?? "").trim();
  if (!t) return null;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** @param {unknown} e */
function isEnoent(e) {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    /** @type {{ code?: string }} */ (e).code === "ENOENT"
  );
}

/**
 * @param {Record<string, string>} reg
 * @param {Record<string, string> | undefined} route
 */
function companyRow(reg, route) {
  const r = route || {};
  return {
    company_key: nz(reg.company_key) ?? "",
    company_name: nz(reg.company_name),
    domain: nz(reg.domain),
    homepage_url: nz(reg.homepage_url),
    linkedin_url: nz(reg.linkedin_url),
    category: nz(reg.category),
    confidence_flag: nz(reg.confidence_flag),
    homepage_input_validation: nz(reg.homepage_input_validation),
    homepage_validation_note: nz(reg.homepage_validation_note),
    careers_url_candidate: nz(reg.careers_url_candidate),
    careers_url_final: nz(reg.careers_url_final),
    redirected_to: nz(reg.redirected_to),
    resolver_status: nz(reg.resolver_status),
    source_type_guess: nz(reg.source_type_guess),
    notes: nz(reg.notes),
    last_checked_at: parseTs(reg.last_checked_at),
    final_source_type: nz(r.final_source_type),
    extractor_type: nz(r.extractor_type),
    extractor_priority: nz(r.extractor_priority),
    ready_for_extraction: nz(r.ready_for_extraction),
    routing_notes: nz(r.routing_notes),
  };
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error(
      JSON.stringify({
        ok: false,
        error: "missing_env",
        message:
          "Set SUPABASE_SERVICE_ROLE_KEY in .env.local (Dashboard → Settings → API → service_role secret). SUPABASE_URL defaults from NEXT_PUBLIC_SUPABASE_URL.",
      })
    );
    process.exit(1);
  }

  let registryRaw;
  let routingRaw;
  try {
    registryRaw = await fs.readFile(REGISTRY, "utf8");
  } catch (e) {
    console.error(
      JSON.stringify({
        ok: false,
        error: "missing_registry",
        path: REGISTRY,
        message: String(e?.message || e),
      })
    );
    process.exit(1);
  }

  try {
    routingRaw = await fs.readFile(ROUTING, "utf8");
  } catch (e) {
    console.error(
      JSON.stringify({
        ok: false,
        error: "missing_routing",
        path: ROUTING,
        message: String(e?.message || e),
      })
    );
    process.exit(1);
  }

  const registryRows = parse(registryRaw, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    bom: true,
  });
  const routingRows = parse(routingRaw, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    bom: true,
  });

  /** @type {Map<string, Record<string, string>>} */
  const routingByKey = new Map();
  for (const row of routingRows) {
    const k = String(row.company_key ?? "").trim();
    if (k) routingByKey.set(k, /** @type {Record<string, string>} */ (row));
  }

  const syncedAt = new Date().toISOString();
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const companies = [];
  for (const row of registryRows) {
    const reg = /** @type {Record<string, string>} */ (row);
    const key = String(reg.company_key ?? "").trim();
    if (!key) continue;
    const merged = companyRow(reg, routingByKey.get(key));
    companies.push({ ...merged, synced_at: syncedAt });
  }

  const chunkSize = 100;
  for (let i = 0; i < companies.length; i += chunkSize) {
    const slice = companies.slice(i, i + chunkSize);
    const { error } = await supabase.from("company_list").upsert(slice, {
      onConflict: "company_key",
    });
    if (error) {
      console.error(
        JSON.stringify({ ok: false, step: "company_list", error: error.message, detail: error })
      );
      process.exit(1);
    }
  }

  /** @type {{ clean_jobs?: unknown } | null} */
  let cleanPayload = null;
  /** @type {boolean} */
  let skipPipelineJobs = false;

  function warnSkippedPipelineJobs() {
    console.warn(
      JSON.stringify({
        ok: true,
        warning: "skipped_pipeline_extracted_jobs",
        path: CLEAN_JOBS,
        message:
          "No extracted_jobs_clean.json — skipped pipeline_extracted_jobs sync (expected in CI). company_list was still updated.",
      })
    );
  }

  if (!existsSync(CLEAN_JOBS)) {
    skipPipelineJobs = true;
    warnSkippedPipelineJobs();
  } else {
    let raw;
    try {
      raw = await fs.readFile(CLEAN_JOBS, "utf8");
    } catch (e) {
      if (isEnoent(e)) {
        skipPipelineJobs = true;
        warnSkippedPipelineJobs();
      } else {
        console.error(
          JSON.stringify({
            ok: false,
            error: "clean_jobs_read_failed",
            path: CLEAN_JOBS,
            message: String(e?.message || e),
          })
        );
        process.exit(1);
      }
    }
    if (!skipPipelineJobs && raw !== undefined) {
      try {
        cleanPayload = JSON.parse(raw);
      } catch (e) {
        console.error(
          JSON.stringify({
            ok: false,
            error: "invalid_clean_jobs",
            path: CLEAN_JOBS,
            message: String(e?.message || e),
          })
        );
        process.exit(1);
      }
    }
  }

  const cleanJobs =
    !skipPipelineJobs && cleanPayload && Array.isArray(cleanPayload.clean_jobs)
      ? cleanPayload.clean_jobs
      : [];

  if (!skipPipelineJobs) {
    const { error: delErr } = await supabase
      .from("pipeline_extracted_jobs")
      .delete()
      .neq("company_key", "__sync_placeholder__");
    if (delErr) {
      console.error(
        JSON.stringify({
          ok: false,
          step: "delete_pipeline_extracted_jobs",
          error: delErr.message,
          detail: delErr,
        })
      );
      process.exit(1);
    }
  }

  const jobRows = [];
  for (const j of cleanJobs) {
    if (!j || typeof j !== "object") continue;
    const source = nz(j.source);
    const sourceJobId = nz(j.source_job_id);
    const companyKey = nz(j.company_key);
    if (!source || !sourceJobId || !companyKey) continue;

    const posted = j.posted_at ? parseTs(String(j.posted_at)) : null;
    const meta = j._clean_meta != null ? j._clean_meta : null;

    jobRows.push({
      company_key: companyKey,
      company: nz(j.company),
      source,
      source_job_id: sourceJobId,
      title: nz(j.title),
      location: nz(j.location),
      apply_url: nz(j.apply_url),
      posted_at: posted,
      description_raw: nz(j.description_raw),
      description_html: nz(j.description_html),
      employment_type: nz(j.employment_type),
      remote_status: nz(j.remote_status),
      tags: Array.isArray(j.tags) ? j.tags : [],
      routing_final_source_type: nz(j.routing_final_source_type),
      careers_url_final: nz(j.careers_url_final),
      clean_meta: meta,
      synced_at: syncedAt,
    });
  }

  if (!skipPipelineJobs) {
    for (let i = 0; i < jobRows.length; i += chunkSize) {
      const slice = jobRows.slice(i, i + chunkSize);
      const { error: insErr } = await supabase.from("pipeline_extracted_jobs").insert(slice);
      if (insErr) {
        console.error(
          JSON.stringify({
            ok: false,
            step: "insert_pipeline_extracted_jobs",
            error: insErr.message,
            detail: insErr,
          })
        );
        process.exit(1);
      }
    }
  }

  const summary = {
    ok: true,
    synced_at: syncedAt,
    company_list_upserted: companies.length,
    pipeline_extracted_jobs_inserted: skipPipelineJobs ? 0 : jobRows.length,
    pipeline_extracted_jobs_sync: skipPipelineJobs ? "skipped_missing_file" : "ok",
    tables: {
      companies: "public.company_list",
      jobs: "public.pipeline_extracted_jobs",
    },
  };

  console.log("\n=== Supabase pipeline sync ===\n");
  console.log(
    `Upserted ${companies.length} rows → public.company_list (resolver + routing columns).`
  );
  if (skipPipelineJobs) {
    console.log(
      "Skipped public.pipeline_extracted_jobs (no extracted_jobs_clean.json — existing rows unchanged)."
    );
  } else {
    console.log(
      `Inserted ${jobRows.length} rows → public.pipeline_extracted_jobs (from extracted_jobs_clean.json).`
    );
  }
  console.log(
    "\nNote: pipeline_extracted_jobs is for pipeline QA only. Production job listings use the public.jobs table."
  );
  console.log(`\n${JSON.stringify(summary, null, 2)}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
