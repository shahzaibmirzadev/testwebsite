#!/usr/bin/env node
/**
 * Recovery-only HTML extraction: builds staging CSVs from html_source_recovery_queue.csv,
 * runs HTML_EXTRACTION_RECOVERY_MODE extraction, then writes results/summary/run-state.
 * Does not write extracted_jobs_html_raw.json or touch production registry files.
 *
 * Env:
 *   HTML_RECOVERY_SKIP_STAGING=1 — skip buildHtmlRecoveryStaging (reuse existing staging files)
 *   HTML_RECOVERY_QUEUE_CSV, HTML_RECOVERY_INCLUDE_STATUSES — passed through to staging builder
 *   HTML_RECOVERY_OUTPUT_JSON, HTML_RECOVERY_REGISTRY_STAGING, HTML_RECOVERY_ROUTING_STAGING — overrides
 *   Plus standard HTML extract env (HTML_EXTRACT_MAX_COMPANIES, HTML_EXTRACT_COMPANY_KEY, etc.)
 */
import path from "path";

import { buildHtmlRecoveryStaging } from "../ingestion/buildHtmlRecoveryStaging.mjs";
import { PATHS } from "../config/pipelinePaths.mjs";
import { finalizeHtmlRecoveryRun } from "./htmlRecoveryFinalize.mjs";
import { runHtmlExtractionMain } from "./runHtmlExtraction.mjs";

const REPO = process.cwd();

async function main() {
  const skipStaging = /^1|true|yes$/i.test(
    String(process.env.HTML_RECOVERY_SKIP_STAGING || "").trim()
  );
  if (!skipStaging) {
    await buildHtmlRecoveryStaging();
  }

  process.env.HTML_EXTRACTION_RECOVERY_MODE = "1";
  await runHtmlExtractionMain();

  const outJson = path.join(
    REPO,
    process.env.HTML_RECOVERY_OUTPUT_JSON || PATHS.htmlRecoveryExtractedJobsRaw
  );
  await finalizeHtmlRecoveryRun(outJson);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
