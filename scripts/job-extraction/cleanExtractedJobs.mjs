#!/usr/bin/env node
/**
 * Post-extraction: merge ATS + HTML raw job lists, dedupe + QA → data/extracted_jobs_clean.json
 * Also writes data/combined_raw_jobs.json (pre-dedupe merge) for inspection.
 * Does not modify extracted_jobs_raw.json or extracted_jobs_html_raw.json.
 */
import fs from "fs/promises";
import path from "path";

import { PATHS } from "../config/pipelinePaths.mjs";

const REPO = process.cwd();
const ATS_INPUT = path.join(REPO, PATHS.extractedJobsRaw);
const HTML_INPUT = path.join(REPO, PATHS.extractedJobsHtmlRaw);
const COMBINED_RAW_OUT = path.join(REPO, PATHS.combinedRawJobs);
const OUTPUT = path.join(REPO, PATHS.extractedJobsClean);

const PIPELINE_TAG = "_pipeline_extraction";

/**
 * @param {unknown} v
 */
function str(v) {
  if (v == null) return "";
  return String(v);
}

/**
 * @param {string} s
 */
function normalizeWhitespace(s) {
  return str(s).toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * @param {string} s
 */
function normalizeApplyUrl(s) {
  const t = str(s).trim();
  if (!t) return "";
  try {
    const u = new URL(t.startsWith("http") ? t : `https://${t}`);
    u.hash = "";
    return u.href.toLowerCase();
  } catch {
    return t.toLowerCase();
  }
}

/**
 * @param {unknown} postedAt
 */
function isValidIsoDate(postedAt) {
  if (postedAt == null || postedAt === "") return true;
  const s = str(postedAt).trim();
  if (!s) return true;
  const d = new Date(s);
  return !Number.isNaN(d.getTime());
}

/**
 * @param {Record<string, unknown>} job
 * @param {{ duplicateSurvivor?: boolean, duplicateGroupSize?: number }} ctx
 */
function buildQaFlags(job, ctx = {}) {
  /** @type {string[]} */
  const flags = [];

  if (!str(job.title).trim()) flags.push("missing_title");
  if (!str(job.apply_url).trim()) flags.push("missing_apply_url");

  const desc =
    str(job.description_raw).trim() || str(job.description_html).trim();
  if (!desc) flags.push("missing_description");

  if (str(job.posted_at).trim() && !isValidIsoDate(job.posted_at)) {
    flags.push("malformed_posted_at");
  }

  const g = ctx.duplicateGroupSize ?? 1;
  if (ctx.duplicateSurvivor && g > 1) {
    flags.push("duplicate_group_survivor");
  }

  return flags;
}

/**
 * Clearly broken: not suitable for DB insert without review.
 * @param {string[]} qaFlags
 */
function isCriticallyBroken(qaFlags) {
  const missingTitle = qaFlags.includes("missing_title");
  const missingApply = qaFlags.includes("missing_apply_url");
  if (missingTitle && missingApply) return true;
  return false;
}

/**
 * @param {Record<string, unknown>} job
 */
function dedupeKey(job) {
  const source = str(job.source).trim();
  const sid = str(job.source_job_id).trim();
  if (source && sid) {
    return {
      tier: 1,
      key: `1|${source.toLowerCase()}|${sid}`,
    };
  }

  const company = normalizeWhitespace(job.company);
  const apply = normalizeApplyUrl(job.apply_url);
  if (company && apply) {
    return {
      tier: 2,
      key: `2|${company}|${apply}`,
    };
  }

  const title = normalizeWhitespace(job.title);
  const loc = normalizeWhitespace(job.location);
  return {
    tier: 3,
    key: `3|${company}|${title}|${loc}`,
  };
}

/**
 * @param {string} p
 */
async function readJobsArray(p) {
  let rawText;
  try {
    rawText = await fs.readFile(p, "utf8");
  } catch {
    return [];
  }
  try {
    const payload = JSON.parse(rawText);
    return Array.isArray(payload.jobs) ? payload.jobs : [];
  } catch {
    return [];
  }
}

async function main() {
  let atsText;
  try {
    atsText = await fs.readFile(ATS_INPUT, "utf8");
  } catch (e) {
    console.error(
      JSON.stringify({
        ok: false,
        error: "missing_input",
        path: ATS_INPUT,
        message: String(e?.message || e),
        hint: "Run npm run extract:ats first.",
      })
    );
    process.exit(1);
  }

  /** @type {{ jobs?: unknown[] }} */
  let atsPayload;
  try {
    atsPayload = JSON.parse(atsText);
  } catch (e) {
    console.error(
      JSON.stringify({
        ok: false,
        error: "invalid_json",
        path: ATS_INPUT,
        message: String(e?.message || e),
      })
    );
    process.exit(1);
  }

  const atsJobs = Array.isArray(atsPayload.jobs) ? atsPayload.jobs : [];
  const htmlJobs = await readJobsArray(HTML_INPUT);

  /** @type {Record<string, unknown>[]} */
  const merged = [];
  for (const j of atsJobs) {
    merged.push({
      ...(typeof j === "object" && j !== null ? j : {}),
      [PIPELINE_TAG]: "ats",
    });
  }
  for (const j of htmlJobs) {
    merged.push({
      ...(typeof j === "object" && j !== null ? j : {}),
      [PIPELINE_TAG]: "html",
    });
  }

  const combinedRawDoc = {
    generated_at: new Date().toISOString(),
    inputs: { ats: ATS_INPUT, html: HTML_INPUT },
    summary: {
      from_ats_raw: atsJobs.length,
      from_html_raw: htmlJobs.length,
      combined_raw: merged.length,
    },
    jobs: merged,
  };
  await fs.writeFile(COMBINED_RAW_OUT, JSON.stringify(combinedRawDoc, null, 2), "utf8");

  const jobs = merged;
  const rawCount = jobs.length;

  /** @type {Map<string, { tier: number, key: string, indices: number[] }>} */
  const groups = new Map();

  for (let i = 0; i < jobs.length; i++) {
    const job = /** @type {Record<string, unknown>} */ (jobs[i]);
    const { tier, key } = dedupeKey(job);
    let g = groups.get(key);
    if (!g) {
      g = { tier, key, indices: [] };
      groups.set(key, g);
    }
    g.indices.push(i);
  }

  /** @type {Record<string, unknown>[]} */
  const survivors = [];
  /** @type {Record<string, unknown>[]} */
  const duplicatesRemoved = [];

  for (const [, g] of groups) {
    const [keepIdx, ...dropIdxs] = g.indices;
    const kept = /** @type {Record<string, unknown>} */ (jobs[keepIdx]);
    const groupSize = g.indices.length;

    survivors.push({
      job: kept,
      rawIndex: keepIdx,
      duplicateGroupSize: groupSize,
      dedupe_key: g.key,
      dedupe_tier: g.tier,
    });

    for (const di of dropIdxs) {
      const removed = /** @type {Record<string, unknown>} */ (jobs[di]);
      duplicatesRemoved.push({
        removed_job: removed,
        raw_index: di,
        dedupe_tier: g.tier,
        dedupe_key: g.key,
        kept_raw_index: keepIdx,
        qa_flags: ["duplicate_group_member"],
      });
    }
  }

  /** @type {Record<string, unknown>[]} */
  const cleanJobs = [];
  /** @type {Record<string, unknown>[]} */
  const flaggedJobs = [];
  let criticallyExcluded = 0;

  for (const s of survivors) {
    const job = /** @type {Record<string, unknown>} */ ({ ...s.job });
    const qaFlags = buildQaFlags(job, {
      duplicateSurvivor: true,
      duplicateGroupSize: s.duplicateGroupSize,
    });

    const critical = isCriticallyBroken(qaFlags);
    if (critical) criticallyExcluded += 1;

    const enriched = {
      ...job,
      _clean_meta: {
        raw_index: s.rawIndex,
        dedupe_key: s.dedupe_key,
        dedupe_tier: s.dedupe_tier,
        qa_flags: qaFlags,
        excluded_from_clean: critical,
        ...(critical
          ? { exclusion_reason: "critical_missing_title_and_apply_url" }
          : {}),
      },
    };

    if (critical) {
      flaggedJobs.push(enriched);
    } else {
      cleanJobs.push(enriched);
      if (qaFlags.length > 0) {
        flaggedJobs.push(enriched);
      }
    }
  }

  const duplicatesRemovedCount = duplicatesRemoved.length;
  const flaggedCount = flaggedJobs.length;

  const out = {
    generated_at: new Date().toISOString(),
    source_files: {
      ats: ATS_INPUT,
      html: HTML_INPUT,
      combined_raw: COMBINED_RAW_OUT,
    },
    summary: {
      from_ats_raw: atsJobs.length,
      from_html_raw: htmlJobs.length,
      combined_raw_job_count: rawCount,
      deduplicated_job_count: survivors.length,
      duplicates_removed: duplicatesRemovedCount,
      clean_job_count: cleanJobs.length,
      flagged_job_count: flaggedCount,
      critically_excluded_count: criticallyExcluded,
    },
    duplicates_removed: duplicatesRemoved,
    flagged_jobs: flaggedJobs,
    clean_jobs: cleanJobs,
  };

  await fs.writeFile(OUTPUT, JSON.stringify(out, null, 2), "utf8");

  console.log("\n=== cleanExtractedJobs ===\n");
  console.log(`ATS raw jobs:        ${atsJobs.length}`);
  console.log(`HTML raw jobs:       ${htmlJobs.length}`);
  console.log(`Combined raw:        ${rawCount}`);
  console.log(`After dedupe:        ${survivors.length}`);
  console.log(`Duplicates removed: ${duplicatesRemovedCount}`);
  console.log(`Clean count:         ${cleanJobs.length}`);
  console.log(`Flagged count:       ${flaggedCount}`);
  console.log(`Combined raw file:   ${COMBINED_RAW_OUT}`);
  console.log(`Output:              ${OUTPUT}\n`);

  console.log(
    JSON.stringify(
      {
        ok: true,
        ...out.summary,
        output: OUTPUT,
        combined_raw_output: COMBINED_RAW_OUT,
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
