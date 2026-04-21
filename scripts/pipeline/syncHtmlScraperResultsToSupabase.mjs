#!/usr/bin/env node
/**
 * Uploads cleaned HTML scraper rows to public.html_scraper_results.
 * Source: data/extracted_jobs_filtered.json (jobs with source = custom_html after npm run filter:jobs).
 * Descriptions are truncated for readable Table Editor views.
 *
 * Requires: migration 20260414120000_html_scraper_results.sql applied.
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (e.g. --env-file=.env.local)
 */
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

import { PATHS } from "../config/pipelinePaths.mjs";

const REPO = process.cwd();
const FILTERED = path.join(REPO, PATHS.extractedJobsFiltered);

const DESCRIPTION_PREVIEW_MAX = 2500;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * @param {Record<string, unknown>} job
 */
function contentHash(job) {
  const payload = [
    String(job.title || ""),
    String(job.apply_url || ""),
    String(job.description_raw || ""),
  ].join("|");
  return crypto.createHash("sha256").update(payload).digest("hex");
}

/**
 * @param {string} s
 * @param {number} max
 */
function preview(s, max) {
  const t = String(s ?? "").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

/**
 * @param {Record<string, unknown>} job
 */
function rowFromJob(job, pipelineGeneratedAt) {
  const rel =
    job.relevance && typeof job.relevance === "object"
      ? /** @type {{ pass?: boolean, reasons?: unknown, notes?: unknown }} */ (job.relevance)
      : {};

  const reasons = Array.isArray(rel.reasons) ? rel.reasons : [];
  const notes = rel.notes != null ? String(rel.notes) : "";

  const rawDesc = String(job.description_raw || "").trim();
  const htmlDesc = String(job.description_html || "").trim();
  const descForPreview = rawDesc || htmlDesc.replace(/<[^>]+>/g, " ");

  return {
    pipeline_generated_at: pipelineGeneratedAt,
    company_key: String(job.company_key || ""),
    company: String(job.company || ""),
    careers_url_final: String(job.careers_url_final || ""),
    title: String(job.title || ""),
    location: job.location != null ? String(job.location) : "",
    apply_url: String(job.apply_url || ""),
    posted_at: job.posted_at != null ? String(job.posted_at) : null,
    is_relevant: Boolean(rel.pass),
    relevance_reasons: reasons,
    relevance_notes: notes,
    description_preview: preview(descForPreview, DESCRIPTION_PREVIEW_MAX),
    source_job_id: String(job.source_job_id || ""),
    content_hash: contentHash(job),
    tags: Array.isArray(job.tags) ? job.tags : [],
    employment_type: job.employment_type != null ? String(job.employment_type) : null,
    remote_status: job.remote_status != null ? String(job.remote_status) : null,
  };
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error(
      JSON.stringify({
        ok: false,
        error: "missing_env",
        message:
          "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (e.g. npm run pipeline:sync-html-results with --env-file=.env.local).",
      })
    );
    process.exit(1);
  }

  let raw;
  try {
    raw = await fs.readFile(FILTERED, "utf8");
  } catch (e) {
    console.error(
      JSON.stringify({
        ok: false,
        error: "missing_filtered_jobs",
        path: FILTERED,
        hint: "Run: npm run extract:html && npm run filter:jobs",
        message: String(e?.message || e),
      })
    );
    process.exit(1);
  }

  /** @type {{ generated_at?: string, jobs?: unknown[] }} */
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (e) {
    console.error(
      JSON.stringify({
        ok: false,
        error: "invalid_json",
        path: FILTERED,
        message: String(e?.message || e),
      })
    );
    process.exit(1);
  }

  const jobs = Array.isArray(payload.jobs) ? payload.jobs : [];
  const pipelineGeneratedAt = payload.generated_at || new Date().toISOString();

  const htmlJobs = jobs.filter(
    (j) =>
      j &&
      typeof j === "object" &&
      String(/** @type {Record<string, unknown>} */ (j).source || "") ===
        "custom_html"
  );

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { error: truncErr } = await supabase.rpc("truncate_html_scraper_results");
  if (truncErr) {
    console.error(
      JSON.stringify({
        ok: false,
        step: "truncate",
        error: truncErr.message,
        hint: "Apply supabase/migrations/20260414120000_html_scraper_results.sql",
        detail: truncErr,
      })
    );
    process.exit(1);
  }

  const rows = htmlJobs.map((j) =>
    rowFromJob(/** @type {Record<string, unknown>} */ (j), pipelineGeneratedAt)
  );

  const chunkSize = 100;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const slice = rows.slice(i, i + chunkSize);
    const { error } = await supabase.from("html_scraper_results").insert(slice);
    if (error) {
      console.error(
        JSON.stringify({
          ok: false,
          step: "insert",
          error: error.message,
          detail: error,
          chunk_index: i,
        })
      );
      process.exit(1);
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        table: "html_scraper_results",
        source_file: FILTERED,
        pipeline_generated_at: pipelineGeneratedAt,
        html_jobs_in_file: htmlJobs.length,
        rows_inserted: rows.length,
        description_preview_max_chars: DESCRIPTION_PREVIEW_MAX,
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
