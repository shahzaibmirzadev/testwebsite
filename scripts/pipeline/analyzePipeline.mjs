#!/usr/bin/env node
/**
 * Read-only analysis: routing table + extracted_jobs_raw.json
 * → data/pipeline_analysis_report.json
 */
import fs from "fs/promises";
import path from "path";
import { parse } from "csv-parse/sync";

import { PATHS } from "../config/pipelinePaths.mjs";

const REPO = process.cwd();
const ROUTING = path.join(REPO, PATHS.sourceRoutingTable);
const EXTRACTED = path.join(REPO, PATHS.extractedJobsRaw);
const REPORT = path.join(REPO, PATHS.pipelineAnalysisReport);

async function loadRoutingRows() {
  const raw = await fs.readFile(ROUTING, "utf8");
  return parse(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    bom: true,
  });
}

function summarizeHomepageValidation(rows) {
  const byFlag = {};
  let rejectedUrlDomainFallback = 0;
  for (const r of rows) {
    const f = (r.homepage_input_validation || "").trim() || "(not_recorded)";
    byFlag[f] = (byFlag[f] || 0) + 1;
    if (f === "rejected_url_domain_fallback") {
      rejectedUrlDomainFallback += 1;
    }
  }
  return {
    by_homepage_input_validation: byFlag,
    rejected_url_replaced_by_domain_fallback: rejectedUrlDomainFallback,
  };
}

function summarizeRouting(rows) {
  const byExtractor = {};
  const byFinal = {};
  let readyT = 0;
  let readyF = 0;

  for (const r of rows) {
    const ex = (r.extractor_type || "").trim() || "(empty)";
    const fsr = (r.final_source_type || "").trim() || "(empty)";
    byExtractor[ex] = (byExtractor[ex] || 0) + 1;
    byFinal[fsr] = (byFinal[fsr] || 0) + 1;
    if ((r.ready_for_extraction || "").trim().toLowerCase() === "true") {
      readyT += 1;
    } else {
      readyF += 1;
    }
  }

  const hasValidationCol =
    rows.length > 0 && "homepage_input_validation" in rows[0];
  const homepageInput =
    rows.length && hasValidationCol
      ? summarizeHomepageValidation(rows)
      : { by_homepage_input_validation: {}, rejected_url_replaced_by_domain_fallback: null };

  return {
    available: true,
    total_companies: rows.length,
    by_extractor_type: byExtractor,
    by_final_source_type: byFinal,
    ready_for_extraction_true: readyT,
    ready_for_extraction_false: readyF,
    homepage_input_validation: homepageInput,
  };
}

async function loadExtractionPayload() {
  const raw = await fs.readFile(EXTRACTED, "utf8");
  return JSON.parse(raw);
}

function analyzeJobs(jobs) {
  const totalJobs = jobs.length;
  let emptyTitle = 0;
  let emptyDesc = 0;
  let missLoc = 0;
  const pairCount = new Map();

  for (const j of jobs) {
    const t = (j.title || "").trim();
    const d = ((j.description_raw || "") + (j.description_html || "")).trim();
    const loc = (j.location || "").trim();
    if (!t) emptyTitle += 1;
    if (!d) emptyDesc += 1;
    if (!loc) missLoc += 1;
    const pair = `${(j.company || "").trim().toLowerCase()}|||${t.toLowerCase()}`;
    pairCount.set(pair, (pairCount.get(pair) || 0) + 1);
  }

  let dupPairCount = 0;
  const dupExamples = [];
  for (const [pair, c] of pairCount) {
    if (c > 1) {
      dupPairCount += 1;
      if (dupExamples.length < 20) {
        const [co, tit] = pair.split("|||");
        dupExamples.push({ company: co, title_normalized: tit, count: c });
      }
    }
  }

  return {
    total_jobs: totalJobs,
    pct_empty_title: totalJobs
      ? Math.round((emptyTitle / totalJobs) * 10000) / 100
      : 0,
    pct_empty_description: totalJobs
      ? Math.round((emptyDesc / totalJobs) * 10000) / 100
      : 0,
    pct_missing_location: totalJobs
      ? Math.round((missLoc / totalJobs) * 10000) / 100
      : 0,
    duplicate_title_company_pairs: dupPairCount,
    duplicate_examples: dupExamples,
  };
}

function crossAnalyze(routingRows, payload) {
  const jobs = Array.isArray(payload.jobs) ? payload.jobs : [];
  const failures = Array.isArray(payload.failures) ? payload.failures : [];
  const summary = payload.summary || {};

  const jobsByKey = new Map();
  for (const j of jobs) {
    const k = (j.company_key || "").trim();
    if (!k) continue;
    jobsByKey.set(k, (jobsByKey.get(k) || 0) + 1);
  }

  const atsReady = routingRows.filter(
    (r) =>
      (r.extractor_type || "").trim() === "ats_api" &&
      (r.ready_for_extraction || "").toLowerCase() === "true"
  );

  const failedFetch = failures.filter((f) => f.error !== "no_handler_implemented");
  const noHandler = failures.filter((f) => f.error === "no_handler_implemented");

  const failedKeys = new Set(failedFetch.map((f) => f.company_key).filter(Boolean));
  const noHandlerKeys = new Set(noHandler.map((f) => f.company_key).filter(Boolean));

  const readyButZero = [];
  for (const r of atsReady) {
    const ck = (r.company_key || "").trim();
    const n = jobsByKey.get(ck) || 0;
    if (n > 0) continue;
    if (failedKeys.has(ck) || noHandlerKeys.has(ck)) continue;
    readyButZero.push({
      company_key: ck,
      company_name: r.company_name,
      final_source_type: r.final_source_type,
    });
  }

  const hist = {};
  for (const f of failures) {
    const msg = String(f.error || "unknown");
    const short = msg.split("\n")[0].slice(0, 120);
    hist[short] = (hist[short] || 0) + 1;
  }

  const uniqueCompanyKeysWithJobs = new Set(
    jobs.map((j) => j.company_key).filter(Boolean)
  );
  const avgJobsPerCompany =
    uniqueCompanyKeysWithJobs.size > 0
      ? Math.round((jobs.length / uniqueCompanyKeysWithJobs.size) * 1000) / 1000
      : null;

  return {
    ats_ready_rows: atsReady.length,
    failed_extraction_companies: failedFetch.map((f) => ({
      company_key: f.company_key,
      company_name: f.company_name,
      final_source_type: f.final_source_type,
      error: f.error,
    })),
    ready_but_zero_jobs: readyButZero,
    top_failure_patterns: Object.entries(hist)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([reason, count]) => ({ reason, count })),
    avg_jobs_per_company_among_companies_with_jobs: avgJobsPerCompany,
    extraction_summary_snapshot: {
      jobs_extracted: summary.jobs_extracted ?? jobs.length,
      companies_succeeded: summary.companies_succeeded,
      companies_failed: summary.companies_failed,
      skipped_no_handler: summary.skipped_no_handler,
      ats_api_ready_rows: summary.ats_api_ready_rows,
    },
  };
}

function buildInsights(routingSum, extSum, dq, cross) {
  const insights = [];
  if (routingSum.available) {
    insights.push(
      `Companies in routing: ${routingSum.total_companies} (${routingSum.ready_for_extraction_true} ready, ${routingSum.ready_for_extraction_false} not ready).`
    );
  }
  if (extSum.available) {
    insights.push(
      `Extraction: ${extSum.total_jobs_extracted} jobs; ${extSum.companies_succeeded ?? "?"} companies succeeded, ${extSum.companies_failed ?? "?"} failed, ${extSum.skipped_no_handler ?? "?"} skipped (no ATS handler).`
    );
  }
  if (dq.total_jobs > 0) {
    insights.push(
      `Job rows: ${dq.pct_empty_title}% empty titles, ${dq.pct_empty_description}% empty descriptions, ${dq.pct_missing_location}% missing location; ${dq.duplicate_title_company_pairs} duplicate company+title groups.`
    );
  }
  if (cross.ready_but_zero_jobs?.length) {
    insights.push(
      `${cross.ready_but_zero_jobs.length} ATS-ready companies returned 0 jobs with no logged failure (empty boards or handler edge case).`
    );
  }
  if (cross.top_failure_patterns?.[0]) {
    const p = cross.top_failure_patterns[0];
    insights.push(`Most common failure: ${p.reason} (${p.count}x).`);
  }
  return insights;
}

async function main() {
  const report = {
    generated_at: new Date().toISOString(),
    routing_summary: { available: false },
    extraction_summary: { available: false },
    data_quality: { available: false },
    failures: {},
    cross_analysis: {},
    insights: [],
  };

  let routingRows = [];

  try {
    routingRows = await loadRoutingRows();
    report.routing_summary = summarizeRouting(routingRows);
  } catch (e) {
    report.routing_summary = {
      available: false,
      error: String(e.message || e),
    };
    report.insights.push(`Could not read source_routing_table.csv: ${e.message}`);
  }

  let payload = { jobs: [], failures: [], summary: {} };

  try {
    payload = await loadExtractionPayload();
    const jobs = payload.jobs || [];
    const summary = payload.summary || {};
    report.extraction_summary = {
      available: true,
      total_ats_companies_processed: summary.ats_api_ready_rows ?? 0,
      total_jobs_extracted: summary.jobs_extracted ?? jobs.length,
      avg_jobs_per_company: null,
      companies_with_zero_jobs: null,
      failure_count: (payload.failures || []).length,
      failure_breakdown: {},
      companies_succeeded: summary.companies_succeeded,
      companies_failed: summary.companies_failed,
      skipped_no_handler: summary.skipped_no_handler,
    };

    const fb = {};
    for (const f of payload.failures || []) {
      const k = String(f.error || "unknown")
        .split("\n")[0]
        .slice(0, 160);
      fb[k] = (fb[k] || 0) + 1;
    }
    report.extraction_summary.failure_breakdown = fb;

    report.data_quality = { available: true, ...analyzeJobs(jobs) };
  } catch (e) {
    report.extraction_summary = { available: false, error: String(e.message || e) };
    report.insights.push(`Could not read extracted_jobs_raw.json: ${e.message}`);
  }

  try {
    if (routingRows.length && payload) {
      report.cross_analysis = crossAnalyze(routingRows, payload);
      if (report.extraction_summary.available) {
        report.extraction_summary.avg_jobs_per_company =
          report.cross_analysis.avg_jobs_per_company_among_companies_with_jobs;
        const z = report.cross_analysis.ready_but_zero_jobs?.length ?? 0;
        report.extraction_summary.companies_with_zero_jobs = z;
      }
    }
  } catch (e) {
    report.cross_analysis = { error: String(e.message || e) };
  }

  report.failures = {
    extraction_failures_sample: (payload.failures || []).slice(0, 100),
    failure_reason_histogram: report.extraction_summary.failure_breakdown || {},
  };

  report.insights = [
    ...report.insights,
    ...buildInsights(
      report.routing_summary,
      report.extraction_summary,
      report.data_quality.available ? report.data_quality : { total_jobs: 0 },
      report.cross_analysis
    ),
  ];

  await fs.writeFile(REPORT, JSON.stringify(report, null, 2), "utf8");

  console.log("\n================ PIPELINE ANALYSIS ================\n");
  console.log(`Routing: ${report.routing_summary.available ? report.routing_summary.total_companies + " companies" : "N/A"}`);
  if (report.routing_summary.by_extractor_type) {
    console.log("  by extractor_type:", report.routing_summary.by_extractor_type);
  }
  if (report.routing_summary.homepage_input_validation?.rejected_url_replaced_by_domain_fallback != null) {
    console.log(
      "  homepage input validation:",
      report.routing_summary.homepage_input_validation
    );
  }
  if (report.extraction_summary.available) {
    console.log(`Extraction: ${report.extraction_summary.total_jobs_extracted} jobs`);
    console.log("  summary:", report.extraction_summary);
  }
  if (report.data_quality.available) {
    console.log("Data quality:", {
      pct_empty_title: report.data_quality.pct_empty_title,
      pct_empty_description: report.data_quality.pct_empty_description,
      pct_missing_location: report.data_quality.pct_missing_location,
      duplicate_groups: report.data_quality.duplicate_title_company_pairs,
    });
  }
  console.log("\nInsights:");
  for (const line of report.insights) {
    console.log(" -", line);
  }
  console.log("\nReport file:", REPORT);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
