#!/usr/bin/env node
/**
 * Title-first relevance on cleaned (ATS + HTML) jobs → data/extracted_jobs_filtered.json
 * Input: data/extracted_jobs_clean.json (clean_jobs from extract:clean).
 */
import fs from "fs/promises";
import path from "path";

import { PATHS } from "../config/pipelinePaths.mjs";
import { evaluateTitleRelevance } from "./config/relevanceRules.mjs";
import { writeStageSummary } from "./loggingUtils.mjs";

const REPO = process.cwd();
const CLEAN_INPUT = path.join(REPO, PATHS.extractedJobsClean);
const OUTPUT = path.join(REPO, PATHS.extractedJobsFiltered);

const PIPELINE_TAG = "_pipeline_extraction";

/**
 * @param {Record<string, unknown>} job
 */
function stripPipelineTags(job) {
  const copy = { ...job };
  delete copy[PIPELINE_TAG];
  return copy;
}

/**
 * @param {Record<string, unknown>} job
 */
function withRelevance(job) {
  const title = String(job.title || "");
  const r = evaluateTitleRelevance(title);
  const base = stripPipelineTags(job);
  return {
    ...base,
    relevance: {
      pass: r.pass,
      reasons: r.reasons,
      notes: r.notes,
    },
  };
}

async function main() {
  let raw;
  try {
    raw = await fs.readFile(CLEAN_INPUT, "utf8");
  } catch (e) {
    console.error(
      JSON.stringify({
        ok: false,
        error: "missing_clean_input",
        path: CLEAN_INPUT,
        message: String(e?.message || e),
        hint: "Run npm run extract:clean after ATS + HTML extraction.",
      })
    );
    process.exit(1);
  }

  /** @type {Record<string, unknown>} */
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (e) {
    console.error(
      JSON.stringify({
        ok: false,
        error: "invalid_json",
        path: CLEAN_INPUT,
        message: String(e?.message || e),
      })
    );
    process.exit(1);
  }

  const cleanJobs = Array.isArray(payload.clean_jobs) ? payload.clean_jobs : [];

  let fromAts = 0;
  let fromHtml = 0;
  for (const j of cleanJobs) {
    const tag = /** @type {Record<string, unknown>} */ (j)[PIPELINE_TAG];
    if (tag === "ats") fromAts += 1;
    else if (tag === "html") fromHtml += 1;
  }

  /** @type {Record<string, unknown>[]} */
  const jobs = [];
  let passed = 0;
  let failed = 0;
  /** @type {Record<string, number>} */
  const bySource = {};

  for (const job of cleanJobs) {
    const enriched = withRelevance(
      /** @type {Record<string, unknown>} */ (job)
    );
    jobs.push(enriched);
    if (enriched.relevance.pass) {
      passed += 1;
    } else {
      failed += 1;
    }
    const src = String(
      /** @type {Record<string, unknown>} */ (job).source || "unknown"
    );
    bySource[src] = (bySource[src] || 0) + 1;
  }

  const summary = {
    total_jobs: cleanJobs.length,
    from_ats_after_clean: fromAts,
    from_html_after_clean: fromHtml,
    from_ats_raw: fromAts,
    from_html_raw: fromHtml,
    relevance_pass: passed,
    relevance_fail: failed,
    by_source_input: bySource,
  };

  const out = {
    generated_at: new Date().toISOString(),
    inputs: { clean: CLEAN_INPUT },
    summary,
    jobs,
  };

  await fs.writeFile(OUTPUT, JSON.stringify(out, null, 2), "utf8");

  const summaryPath = await writeStageSummary(PATHS.summaryFilterJobs, {
    stage: "relevance_filter",
    ...summary,
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        output: OUTPUT,
        summary,
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
