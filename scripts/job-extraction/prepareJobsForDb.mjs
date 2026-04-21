#!/usr/bin/env node
/**
 * DB-ready JSON export (no Supabase writes) → data/jobs_db_ready.json
 */
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

import { PATHS } from "../config/pipelinePaths.mjs";
import { writeStageSummary } from "./loggingUtils.mjs";

const REPO = process.cwd();
const FILTERED = path.join(REPO, PATHS.extractedJobsFiltered);
const OUTPUT = path.join(REPO, PATHS.jobsDbReady);

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
 * @param {Record<string, unknown>} job — from filter output (has relevance)
 */
function toDbRow(job, lastSeenAt) {
  const tags = Array.isArray(job.tags) ? job.tags : [];
  const rel = job.relevance && typeof job.relevance === "object"
    ? /** @type {{ pass?: boolean }} */ (job.relevance)
    : { pass: false };

  return {
    source: String(job.source || ""),
    source_job_id: String(job.source_job_id || ""),
    company: String(job.company || ""),
    title: String(job.title || ""),
    location: job.location != null ? String(job.location) : "",
    apply_url: String(job.apply_url || ""),
    posted_at: job.posted_at ?? null,
    description_raw: String(job.description_raw || ""),
    description_html: String(job.description_html || ""),
    description: String(job.description_raw || ""),
    employment_type: job.employment_type ?? null,
    remote_status: job.remote_status ?? null,
    tags,
    is_active: true,
    last_seen_at: lastSeenAt,
    content_hash: contentHash(job),
    is_relevant: Boolean(rel.pass),
  };
}

/**
 * Dedupe by source + source_job_id (first wins).
 * @param {Record<string, unknown>[]} rows
 */
function dedupe(rows) {
  const seen = new Set();
  /** @type {Record<string, unknown>[]} */
  const out = [];
  let removed = 0;
  for (const r of rows) {
    const k = `${String(r.source || "")}\0${String(r.source_job_id || "")}`;
    if (seen.has(k)) {
      removed += 1;
      continue;
    }
    seen.add(k);
    out.push(r);
  }
  return { rows: out, duplicates_removed: removed };
}

async function main() {
  let raw;
  try {
    raw = await fs.readFile(FILTERED, "utf8");
  } catch (e) {
    console.error(
      JSON.stringify({
        ok: false,
        error: "missing_filtered_input",
        path: FILTERED,
        hint: "Run npm run filter:jobs first",
        message: String(e?.message || e),
      })
    );
    process.exit(1);
  }

  const payload = JSON.parse(raw);
  const jobs = Array.isArray(payload.jobs) ? payload.jobs : [];
  const lastSeenAt = new Date().toISOString();

  /** @type {Record<string, unknown>[]} */
  const mapped = jobs.map((j) =>
    toDbRow(/** @type {Record<string, unknown>} */ (j), lastSeenAt)
  );

  const { rows, duplicates_removed } = dedupe(mapped);

  const out = {
    generated_at: new Date().toISOString(),
    input: FILTERED,
    summary: {
      input_jobs: jobs.length,
      db_ready_rows: rows.length,
      duplicates_removed,
    },
    jobs: rows,
  };

  await fs.writeFile(OUTPUT, JSON.stringify(out, null, 2), "utf8");

  const summaryPath = await writeStageSummary(PATHS.summaryPrepareDb, {
    stage: "prepare_db",
    ...out.summary,
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        output: OUTPUT,
        summary: out.summary,
        summary_file: summaryPath,
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
