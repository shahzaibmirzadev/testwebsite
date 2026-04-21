/**
 * Maps HTML recovery extraction JSON to operator CSV/JSON and updates derived run-state.
 * Does not modify html_source_recovery_queue.csv.
 */
import fs from "fs/promises";
import path from "path";
import { pathToFileURL } from "url";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";

import { PATHS } from "../config/pipelinePaths.mjs";

const REPO = process.cwd();

const RESULT_COLUMNS = [
  "company_key",
  "company_name",
  "careers_url",
  "extraction_status",
  "jobs_found_count",
  "failure_reason",
  "requires_browser_render",
  "extracted_output_path",
  "yield_reason_category",
  "yield_reason_detail",
  "per_company_status",
  "blocker_category",
  "recommended_next_action",
];

const RUN_STATE_COLUMNS = [
  "company_key",
  "company_name",
  "careers_url",
  "pipeline_queue_status",
  "last_extraction_at",
  "extraction_status",
  "jobs_found_count",
  "requires_browser_render",
  "failure_reason",
  "recommended_next_action",
  "notes",
];

/**
 * @param {Record<string, unknown>} p — per_company entry from html extract payload
 */
export function mapPerCompanyToExtractionStatus(p) {
  const jobs = Number(p.jobs ?? 0);
  if (jobs > 0) {
    return {
      extraction_status: "jobs_found",
      recommended_next_action: "promote_html_source",
      requires_browser_render: "false",
      failure_reason: "",
    };
  }

  const st = String(p.status ?? "");
  const yr = /** @type {{ category?: string, detail?: string }} */ (
    p.yield_reason && typeof p.yield_reason === "object" ? p.yield_reason : {}
  );
  const cat = String(yr.category ?? "");
  const detail = String(yr.detail ?? "");

  if (st === "no_url" || cat === "no_url") {
    return {
      extraction_status: "blocked",
      recommended_next_action: "manual_review",
      requires_browser_render: "false",
      failure_reason: "no_careers_url_resolved",
    };
  }

  if (st === "suspected_js" || cat === "suspected_js") {
    return {
      extraction_status: "requires_browser_render",
      recommended_next_action: "add_browser_support",
      requires_browser_render: "true",
      failure_reason: "suspected_js_or_spa_heuristic",
    };
  }

  if (st === "error" || cat === "fetch_or_parse_error") {
    return {
      extraction_status: "scrape_failed",
      recommended_next_action: "retry_html",
      requires_browser_render: "false",
      failure_reason: detail || "fetch_or_parse_error",
    };
  }

  if (st === "time_budget" || cat === "time_budget") {
    return {
      extraction_status: "scrape_failed",
      recommended_next_action: "retry_html",
      requires_browser_render: "false",
      failure_reason: "time_budget_exceeded",
    };
  }

  if (
    cat === "listing_thin_or_empty" ||
    cat === "no_job_patterns" ||
    cat === "no_candidate_links" ||
    cat === "all_detail_extractions_failed_or_empty" ||
    cat === "listing_single_page_miss"
  ) {
    return {
      extraction_status: "page_found_but_no_jobs",
      recommended_next_action: "manual_review",
      requires_browser_render: "false",
      failure_reason: `${cat}:${detail}`,
    };
  }

  if (st === "empty" && cat !== "suspected_js") {
    return {
      extraction_status: "irrelevant_page",
      recommended_next_action: "manual_review",
      requires_browser_render: String(p.extraction_js_risk === true),
      failure_reason: "empty_or_thin_listing_content",
    };
  }

  if (st === "ok" && jobs === 0) {
    return {
      extraction_status: "page_found_but_no_jobs",
      recommended_next_action: "manual_review",
      requires_browser_render: "false",
      failure_reason: detail || "zero_yield_after_extraction",
    };
  }

  return {
    extraction_status: "manual_review_needed",
    recommended_next_action: "manual_review",
    requires_browser_render: String(p.extraction_js_risk === true),
    failure_reason: `${st}:${cat}:${detail}`,
  };
}

/**
 * Short operator-facing blocker label (distinct from extraction_status).
 * Downstream DB merge / prepareJobs is not run in recovery HTML mode; if we ever
 * surface merge failures here, use `normalization_or_merge`.
 *
 * @param {Record<string, unknown>} p
 * @param {{ extraction_status: string, failure_reason: string }} mapped
 */
function inferBlockerCategory(p, mapped) {
  const st = mapped.extraction_status;
  const yr =
    p.yield_reason && typeof p.yield_reason === "object" ? p.yield_reason : {};
  const cat = String(/** @type {{ category?: string }} */ (yr).category ?? "");
  const detail = String(/** @type {{ detail?: string }} */ (yr).detail ?? "");
  const fr = String(mapped.failure_reason || "").toLowerCase();

  if (st === "jobs_found") return "none";

  if (st === "requires_browser_render") return "js_render_required";

  if (st === "blocked") {
    if (cat === "no_url") return "missing_careers_url";
    return "access_or_config";
  }

  if (st === "scrape_failed") {
    if (cat === "time_budget") return "time_or_limits";
    return "network_fetch_or_parse";
  }

  if (st === "irrelevant_page") {
    return cat === "listing_thin_or_empty"
      ? "thin_or_non_listing_page"
      : "not_jobs_or_wrong_page";
  }

  if (st === "page_found_but_no_jobs") {
    if (
      cat === "no_job_patterns" ||
      cat === "no_candidate_links" ||
      cat === "all_detail_extractions_failed_or_empty" ||
      cat === "listing_single_page_miss"
    ) {
      return "structure_unparsed_or_no_matches";
    }
    if (cat === "listing_thin_or_empty") return "thin_or_non_listing_page";
    return "no_jobs_listed_or_empty_listing";
  }

  if (st === "manual_review_needed") {
    if (fr.includes("normaliz") || fr.includes("merge") || detail.toLowerCase().includes("normaliz"))
      return "normalization_or_merge";
    return "ambiguous_or_unclassified";
  }

  return "unknown";
}

/**
 * @param {string} extractionStatus
 */
function pipelineQueueStatusFromExtraction(extractionStatus) {
  switch (extractionStatus) {
    case "jobs_found":
      return "scraped";
    case "requires_browser_render":
      return "browser_required";
    case "scrape_failed":
      return "failed";
    case "blocked":
      return "failed";
    case "irrelevant_page":
      return "manual_review";
    case "manual_review_needed":
      return "manual_review";
    default:
      return "scraped";
  }
}

/**
 * @param {string} outputJsonPath
 */
export async function finalizeHtmlRecoveryRun(outputJsonPath) {
  const raw = await fs.readFile(outputJsonPath, "utf8");
  const payload = JSON.parse(raw);
  const perCompany = Array.isArray(payload.per_company) ? payload.per_company : [];
  const generatedAt = String(payload.generated_at || new Date().toISOString());

  const outRel = path.relative(REPO, outputJsonPath);

  /** @type {Record<string, string>[]} */
  const resultRows = [];

  for (const p of perCompany) {
    const company_key = String(p.company_key ?? "").trim();
    const company_name = String(p.company_name ?? "").trim();
    const listing_url = String(p.listing_url ?? "").trim();
    const mapped = mapPerCompanyToExtractionStatus(p);
    const yr = p.yield_reason && typeof p.yield_reason === "object" ? p.yield_reason : {};
    resultRows.push({
      company_key,
      company_name,
      careers_url: listing_url,
      extraction_status: mapped.extraction_status,
      jobs_found_count: String(Number(p.jobs ?? 0)),
      failure_reason: mapped.failure_reason,
      requires_browser_render: mapped.requires_browser_render,
      extracted_output_path: outRel,
      yield_reason_category: String(/** @type {{ category?: string }} */ (yr).category ?? ""),
      yield_reason_detail: String(/** @type {{ detail?: string }} */ (yr).detail ?? ""),
      per_company_status: String(p.status ?? ""),
      blocker_category: inferBlockerCategory(p, mapped),
      recommended_next_action: mapped.recommended_next_action,
    });
  }

  const resultsPath = path.join(REPO, PATHS.htmlRecoveryExtractionResultsCsv);
  await fs.mkdir(path.dirname(resultsPath), { recursive: true });
  const csv = stringify(resultRows, {
    header: true,
    columns: RESULT_COLUMNS,
    quoted_string: true,
  });
  await fs.writeFile(resultsPath, "\uFEFF" + csv, "utf8");

  const summary = {
    ok: true,
    generated_at: generatedAt,
    source: payload.source || "html_recovery",
    input_extract_json: path.relative(REPO, outputJsonPath),
    companies: perCompany.length,
    jobs_total: Array.isArray(payload.jobs) ? payload.jobs.length : 0,
    by_extraction_status: {},
    by_blocker_category: {},
    requires_browser_render_count: 0,
    scrape_failed_count: 0,
  };

  for (const r of resultRows) {
    const k = r.extraction_status || "unknown";
    summary.by_extraction_status[k] = (summary.by_extraction_status[k] || 0) + 1;
    const bk = r.blocker_category || "unknown";
    summary.by_blocker_category[bk] = (summary.by_blocker_category[bk] || 0) + 1;
    if (r.requires_browser_render === "true") summary.requires_browser_render_count += 1;
    if (r.extraction_status === "scrape_failed") summary.scrape_failed_count += 1;
  }

  const summaryPath = path.join(REPO, PATHS.htmlRecoveryExtractionSummaryJson);
  await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2), "utf8");

  /** Merge run state */
  const runStatePath = path.join(REPO, PATHS.htmlRecoveryQueueRunState);
  /** @type {Map<string, Record<string, string>>} */
  let prev = new Map();
  try {
    const rsPrev = await fs.readFile(runStatePath, "utf8");
    const prevRows = parse(rsPrev, {
      columns: true,
      skip_empty_lines: true,
      relax_quotes: true,
      bom: true,
    });
    for (const row of prevRows) {
      const k = String(row.company_key ?? "").trim();
      if (k) prev.set(k, row);
    }
  } catch {
    prev = new Map();
  }

  /** @type {Record<string, string>[]} */
  const runOut = [];

  for (const r of resultRows) {
    const extractionStatus = r.extraction_status;
    const pqs = pipelineQueueStatusFromExtraction(extractionStatus);
    const merged = {
      company_key: r.company_key,
      company_name: r.company_name,
      careers_url: r.careers_url,
      pipeline_queue_status: pqs,
      last_extraction_at: generatedAt,
      extraction_status: extractionStatus,
      jobs_found_count: r.jobs_found_count,
      requires_browser_render: r.requires_browser_render,
      failure_reason: r.failure_reason,
      recommended_next_action: r.recommended_next_action,
      notes: `yield=${r.yield_reason_category}/${r.yield_reason_detail};per_status=${r.per_company_status};blocker=${r.blocker_category}`,
    };
    prev.set(r.company_key, merged);
  }

  for (const [, row] of prev) {
    runOut.push(row);
  }
  runOut.sort((a, b) =>
    String(a.company_key).localeCompare(String(b.company_key))
  );

  const runCsv = stringify(runOut, {
    header: true,
    columns: RUN_STATE_COLUMNS,
    quoted_string: true,
  });
  await fs.writeFile(runStatePath, "\uFEFF" + runCsv, "utf8");

  console.log(
    JSON.stringify(
      {
        ok: true,
        wrote_results_csv: path.relative(REPO, resultsPath),
        wrote_summary_json: path.relative(REPO, summaryPath),
        wrote_run_state_csv: path.relative(REPO, runStatePath),
        summary,
      },
      null,
      2
    )
  );

  return { summary, resultsPath, summaryPath, runStatePath };
}

const invokedDirectly =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (invokedDirectly) {
  const p = path.join(REPO, PATHS.htmlRecoveryExtractedJobsRaw);
  finalizeHtmlRecoveryRun(p).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
