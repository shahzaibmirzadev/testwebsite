#!/usr/bin/env node
/**
 * Writes data/supabase_import/pipeline_extracted_jobs.csv for Table Editor → Import CSV.
 * Source: data/extracted_jobs_clean.json (clean_jobs). No resolver / extract rerun.
 */
import fs from "fs/promises";
import path from "path";
import { stringify } from "csv-stringify/sync";

import { PATHS } from "../config/pipelinePaths.mjs";

const REPO = process.cwd();
const CLEAN_JOBS = path.join(REPO, PATHS.extractedJobsClean);
const OUT_DIR = path.join(REPO, PATHS.supabaseImportDir);
const OUT = path.join(REPO, PATHS.supabaseImportPipelineJobsCsv);

const COLUMNS = [
  "company_key",
  "company",
  "source",
  "source_job_id",
  "title",
  "location",
  "apply_url",
  "posted_at",
  "description_raw",
  "description_html",
  "employment_type",
  "remote_status",
  "tags",
  "routing_final_source_type",
  "careers_url_final",
  "clean_meta",
  "synced_at",
];

async function main() {
  const raw = await fs.readFile(CLEAN_JOBS, "utf8");
  const payload = JSON.parse(raw);
  const cleanJobs = Array.isArray(payload.clean_jobs) ? payload.clean_jobs : [];

  const syncedAt = new Date().toISOString();

  /** @type {Record<string, string>[]} */
  const outRows = [];
  for (const j of cleanJobs) {
    if (!j || typeof j !== "object") continue;
    const source = String(j.source ?? "").trim();
    const sourceJobId = String(j.source_job_id ?? "").trim();
    const companyKey = String(j.company_key ?? "").trim();
    if (!source || !sourceJobId || !companyKey) continue;

    const tags = Array.isArray(j.tags) ? j.tags : [];
    const meta = j._clean_meta != null ? j._clean_meta : null;

    outRows.push({
      company_key: companyKey,
      company: String(j.company ?? ""),
      source,
      source_job_id: sourceJobId,
      title: String(j.title ?? ""),
      location: String(j.location ?? ""),
      apply_url: String(j.apply_url ?? ""),
      posted_at: j.posted_at ? String(j.posted_at) : "",
      description_raw: String(j.description_raw ?? ""),
      description_html: String(j.description_html ?? ""),
      employment_type:
        j.employment_type != null ? String(j.employment_type) : "",
      remote_status: j.remote_status != null ? String(j.remote_status) : "",
      tags: JSON.stringify(tags),
      routing_final_source_type: String(j.routing_final_source_type ?? ""),
      careers_url_final: String(j.careers_url_final ?? ""),
      clean_meta: meta != null ? JSON.stringify(meta) : "",
      synced_at: syncedAt,
    });
  }

  await fs.mkdir(OUT_DIR, { recursive: true });

  const csv = stringify(outRows, {
    header: true,
    columns: COLUMNS,
    quoted_string: true,
    quoted_empty: false,
  });
  await fs.writeFile(OUT, "\uFEFF" + csv, "utf8");
  const st = await fs.stat(OUT);
  console.log(`Wrote ${OUT} (${outRows.length} rows, ${Math.round(st.size / 1024)} KB)`);
  console.log(
    "Supabase: Table Editor → pipeline_extracted_jobs → Import data from CSV. Map columns; id is omitted (DB default)."
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
