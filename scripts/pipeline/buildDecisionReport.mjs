#!/usr/bin/env node
/**
 * Validates registry vs companies_master, aggregates routing + extraction,
 * writes data/full_pipeline_decision_report.json (read-only on master).
 */
import fs from "fs/promises";
import path from "path";
import { parse } from "csv-parse/sync";

import { hasImplementedHandler } from "../job-extraction/atsHandlers/index.mjs";
import { PATHS } from "../config/pipelinePaths.mjs";

const REPO = process.cwd();
const MASTER = path.join(REPO, PATHS.companiesMaster);
const REGISTRY = path.join(REPO, PATHS.careerSourceRegistry);
const ROUTING = path.join(REPO, PATHS.sourceRoutingTable);
const EXTRACTED = path.join(REPO, PATHS.extractedJobsRaw);
const OUT = path.join(REPO, PATHS.fullPipelineDecisionReport);

async function loadCsvRows(p) {
  const raw = await fs.readFile(p, "utf8");
  return parse(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    bom: true,
  });
}

function countMap(rows, keyFn) {
  const m = {};
  for (const r of rows) {
    const k = keyFn(r);
    m[k] = (m[k] || 0) + 1;
  }
  return m;
}

function sortEntries(obj) {
  return Object.entries(obj).sort((a, b) => b[1] - a[1]);
}

function buildDecisionSection(metrics, routingRows) {
  const {
    dataset_status,
    counts_by_extractor_type,
    ats_no_handler_by_provider,
    html_scraper_rows,
    browser_required_rows,
    unknown_final_source_rows,
    extractor_none_rows,
  } = metrics;

  const unknown_or_none_rows =
    unknown_final_source_rows + extractor_none_rows;

  if (dataset_status !== "full_fleet") {
    return {
      registry_complete: false,
      next_action:
        "Complete npm run resolve:careers for all companies_master rows before trusting routing or extraction metrics.",
      build_more_ats_handlers_next: null,
      build_generic_html_extractor_next: null,
      delay_js_browser_extraction: null,
      highest_expected_return_path: null,
      rationale: [],
    };
  }

  const total = routingRows.length;
  const atsRows = Object.entries(counts_by_extractor_type).filter(
    ([k]) => k === "ats_api"
  );
  const atsCount = atsRows.length ? atsRows[0][1] : 0;
  const noHandlerSum = Object.values(
    ats_no_handler_by_provider ?? {}
  ).reduce((a, b) => a + b, 0);
  const htmlSum = html_scraper_rows;
  const browserSum = browser_required_rows;

  const rationale = [];
  let buildAts = false;
  let buildHtml = false;
  let delayBrowser = true;

  if (noHandlerSum > 0) {
    buildAts = true;
    rationale.push(
      `${noHandlerSum} ATS-ready rows use providers with no implemented handler — direct job yield once handlers exist.`
    );
  }
  if (htmlSum >= Math.max(5, Math.floor(total * 0.05))) {
    buildHtml = true;
    rationale.push(
      `${htmlSum} companies routed to html_scraper (${((htmlSum / total) * 100).toFixed(1)}% of fleet) — generic HTML path unlocks structured jobs without new ATS integrations.`
    );
  }
  if (browserSum > 0) {
    delayBrowser = true;
    rationale.push(
      `${browserSum} browser_required rows — Playwright/Puppeteer-style extraction is higher cost; defer until ATS + HTML coverage plateaus.`
    );
  }

  if (!buildAts && !buildHtml) {
    rationale.push(
      "No large bucket of ATS-without-handler or html_scraper rows — prioritize resolver quality (unknown rows) or manual review."
    );
  }

  let highest = "balanced_followup";
  if (noHandlerSum >= htmlSum && noHandlerSum > 0) {
    highest = "implement_missing_ats_handlers";
  } else if (htmlSum > noHandlerSum && htmlSum > 0) {
    highest = "generic_html_extractor";
  } else if (unknown_or_none_rows > total * 0.25) {
    highest = "improve_resolver_and_classification";
  }

  return {
    registry_complete: true,
    next_action:
      highest === "implement_missing_ats_handlers"
        ? "Implement ATS handlers for the top providers in ats_no_handler_by_provider."
        : highest === "generic_html_extractor"
          ? "Invest in a generic HTML careers extractor for custom_found / html_static rows."
          : highest === "improve_resolver_and_classification"
            ? "Reduce unknown/none by improving resolver probes and classification before heavy extractors."
            : "Review metrics below and pick the largest blocked bucket.",
    build_more_ats_handlers_next: buildAts,
    build_generic_html_extractor_next: buildHtml,
    delay_js_browser_extraction: delayBrowser,
    highest_expected_return_path: highest,
    rationale,
  };
}

async function main() {
  const masterRows = await loadCsvRows(MASTER);
  const masterCount = masterRows.length;

  let registryRows = [];
  try {
    registryRows = await loadCsvRows(REGISTRY);
  } catch {
    registryRows = [];
  }

  const registryCount = registryRows.length;
  const registryComplete = registryCount === masterCount && masterCount > 0;

  let routingRows = [];
  try {
    routingRows = await loadCsvRows(ROUTING);
  } catch {
    routingRows = [];
  }

  let payload = { jobs: [], failures: [], summary: {} };
  try {
    const raw = await fs.readFile(EXTRACTED, "utf8");
    payload = JSON.parse(raw);
  } catch {
    payload = { jobs: [], failures: [], summary: {} };
  }

  const jobs = Array.isArray(payload.jobs) ? payload.jobs : [];
  const failures = Array.isArray(payload.failures) ? payload.failures : [];

  const dataset_status = registryComplete ? "full_fleet" : "registry_incomplete";

  const counts_by_final_source_type = countMap(routingRows, (r) =>
    String(r.final_source_type || "").trim() || "(empty)"
  );
  const counts_by_extractor_type = countMap(routingRows, (r) =>
    String(r.extractor_type || "").trim() || "(empty)"
  );

  let ready_true = 0;
  let ready_false = 0;
  let html_scraper_rows = 0;
  let browser_required_rows = 0;
  let unknown_final_source_rows = 0;
  let extractor_none_rows = 0;

  const ats_by_provider = {};
  const ats_no_handler_by_provider = {};
  const homepage_validation_by_flag = {};
  let homepage_rejected_url_domain_fallback = 0;

  for (const r of routingRows) {
    const ex = (r.extractor_type || "").trim();
    const fst = (r.final_source_type || "").trim();
    const ready = (r.ready_for_extraction || "").toLowerCase() === "true";

    if (ready) ready_true += 1;
    else ready_false += 1;

    if (ex === "html_scraper") html_scraper_rows += 1;
    if (ex === "browser_required") browser_required_rows += 1;
    if (fst === "unknown") unknown_final_source_rows += 1;
    if (ex === "none") extractor_none_rows += 1;

    if (fst.startsWith("ats_")) {
      ats_by_provider[fst] = (ats_by_provider[fst] || 0) + 1;
      if (
        ex === "ats_api" &&
        ready &&
        !hasImplementedHandler(fst)
      ) {
        ats_no_handler_by_provider[fst] =
          (ats_no_handler_by_provider[fst] || 0) + 1;
      }
    }

    const hv = (r.homepage_input_validation || "").trim() || "(not_recorded)";
    homepage_validation_by_flag[hv] = (homepage_validation_by_flag[hv] || 0) + 1;
    if (hv === "rejected_url_domain_fallback") {
      homepage_rejected_url_domain_fallback += 1;
    }
  }

  const no_handler_failures = failures.filter(
    (f) => f.error === "no_handler_implemented"
  );
  const ats_fetch_failures = failures.filter(
    (f) => f.error !== "no_handler_implemented"
  );

  const ats_failures_by_reason = {};
  for (const f of ats_fetch_failures) {
    const msg = String(f.error || "unknown").split("\n")[0].slice(0, 200);
    ats_failures_by_reason[msg] = (ats_failures_by_reason[msg] || 0) + 1;
  }

  const no_handler_by_provider_from_failures = countMap(
    no_handler_failures,
    (f) => String(f.final_source_type || "").trim() || "(empty)"
  );

  const metrics = {
    dataset_status,
    explicit_note:
      dataset_status === "full_fleet"
        ? "Registry row count matches companies_master — metrics below are full-fleet."
        : `Registry has ${registryCount} rows; companies_master has ${masterCount}. Do not treat downstream metrics as representative.`,
    total_companies_master: masterCount,
    total_companies_in_registry: registryCount,
    total_companies_in_routing: routingRows.length,
    master_company_count: masterCount,
    registry_row_count: registryCount,
    routing_row_count: routingRows.length,
    counts_by_final_source_type,
    counts_by_extractor_type,
    ready_for_extraction_true: ready_true,
    ready_for_extraction_false: ready_false,
    ats_companies_by_provider: ats_by_provider,
    ats_no_handler_by_provider,
    ats_providers_no_handler_implemented: sortEntries(
      ats_no_handler_by_provider
    ).map(([provider, count]) => ({ provider, count })),
    ats_providers_no_handler_from_extraction_failures: sortEntries(
      no_handler_by_provider_from_failures
    ).map(([provider, count]) => ({ provider, count })),
    ats_failures_by_reason: sortEntries(ats_failures_by_reason).map(
      ([reason, count]) => ({ reason, count })
    ),
    html_scraper_rows,
    browser_required_rows,
    unknown_final_source_rows,
    extractor_none_rows,
    unknown_or_none_rows:
      unknown_final_source_rows + extractor_none_rows,
    extraction: {
      jobs_extracted: jobs.length,
      failures_total: failures.length,
      summary: payload.summary || {},
    },
    homepage_input_validation: {
      by_flag: homepage_validation_by_flag,
      rejected_url_replaced_by_domain_fallback:
        homepage_rejected_url_domain_fallback,
    },
  };

  const decision = buildDecisionSection(metrics, routingRows);

  const report = {
    generated_at: new Date().toISOString(),
    metrics,
    decision,
    inputs: {
      companies_master: MASTER,
      career_source_registry: REGISTRY,
      source_routing_table: ROUTING,
      extracted_jobs_raw: EXTRACTED,
    },
  };

  await fs.writeFile(OUT, JSON.stringify(report, null, 2), "utf8");

  console.log("\n======== FULL PIPELINE DECISION REPORT ========\n");
  console.log(metrics.explicit_note);
  console.log(
    `Routing rows: ${metrics.routing_row_count} | Ready true/false: ${ready_true} / ${ready_false}`
  );
  if (dataset_status === "full_fleet") {
    console.log("By extractor_type:", counts_by_extractor_type);
    console.log(
      "Homepage input validation:",
      metrics.homepage_input_validation
    );
    console.log(
      `HTML scraper: ${html_scraper_rows} | Browser required: ${browser_required_rows} | unknown final_source: ${unknown_final_source_rows} | extractor none: ${extractor_none_rows}`
    );
    console.log("Decision:", decision.next_action);
    console.log(
      "Highest-return path:",
      decision.highest_expected_return_path
    );
    for (const line of decision.rationale) {
      console.log(" -", line);
    }
  } else {
    console.log(
      "\nStopped: run `npm run resolve:careers` until registry matches master, then routing → extract → analyze → this report."
    );
  }
  console.log("\nWrote:", OUT);

  if (!registryComplete) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
