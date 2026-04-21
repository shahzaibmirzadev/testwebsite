#!/usr/bin/env node
/**
 * Report-only HTML validation: runs bounded extraction via runHtmlExtraction
 * in routing-validation mode (one company_key). Does not write registry.
 *
 * Usage:
 *   node scripts/ingestion/validateHtmlCandidate.mjs --company-key cm-0001
 */
import fs from "fs/promises";
import path from "path";

import { PATHS } from "../config/pipelinePaths.mjs";

const REPO = process.cwd();
const OUT = path.join(REPO, PATHS.extractedJobsHtmlRaw);

/**
 * @param {string[]} argv
 */
function parseArgs(argv) {
  /** @type {Record<string, string | undefined>} */
  const o = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--company-key") o.companyKey = String(argv[++i] || "");
  }
  return o;
}

async function main() {
  const args = parseArgs(process.argv);
  const key = String(args.companyKey || "").trim();
  if (!key) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          error: "missing_company_key",
          usage: "validateHtmlCandidate.mjs --company-key <key>",
        },
        null,
        2
      )
    );
    process.exit(1);
  }

  process.env.HTML_EXTRACT_VALIDATION_FROM_ROUTING = "1";
  process.env.HTML_EXTRACT_COMPANY_KEY = key;
  process.env.HTML_EXTRACT_MAX_COMPANIES = "1";

  const { runHtmlExtractionMain } = await import(
    "../job-extraction/runHtmlExtraction.mjs"
  );
  await runHtmlExtractionMain();

  let report;
  try {
    const raw = await fs.readFile(OUT, "utf8");
    const data = JSON.parse(raw);
    const jobs = Array.isArray(data.jobs) ? data.jobs : [];
    report = {
      ok: true,
      mode: "routing_validation",
      company_key: key,
      jobs_extracted: jobs.length,
      summary: data.summary ?? null,
      per_company: data.per_company ?? [],
      output_file: path.relative(REPO, OUT),
    };
  } catch (e) {
    report = {
      ok: false,
      error: "read_output_failed",
      message: String(e?.message || e),
      company_key: key,
    };
  }

  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
