#!/usr/bin/env node
/**
 * HTML recovery → pre-production promotion (staging artifacts only).
 *
 * Reads:  data/html_recovery_extraction_results.csv (env: HTML_RECOVERY_EXTRACTION_RESULTS_CSV)
 * Writes: data/ingestion/html_recovery_promotable_sources.csv
 *         data/ingestion/staging/html_promoted_registry.csv
 *         data/ingestion/staging/html_promoted_routing.csv
 *         data/html_promotion_validation_summary.json
 *
 * Does NOT merge into production_source_registry.csv, source_routing_table.csv, or sources.csv.
 * Does NOT run extraction or publish jobs.
 */
import fs from "fs/promises";
import path from "path";
import { pathToFileURL } from "url";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";

import { PATHS } from "../config/pipelinePaths.mjs";
import { REGISTRY_COLUMNS } from "../ingestion/migrateSourcesToProductionRegistry.mjs";
import { isValidHttpOrHttpsUrl } from "../ingestion/isApprovedProductionAtsRegistryRow.mjs";

const REPO = process.cwd();

/** Blockers that disqualify an otherwise "jobs_found" row from production eligibility. */
const BLOCKERS_DISQUALIFYING_PROMOTION = new Set([
  "js_render_required",
  "network_fetch_or_parse",
]);

const PROMOTABLE_COLUMNS = [
  "company_name",
  "careers_url",
  "source_type",
  "extraction_status",
  "jobs_found_count",
  "html_promotion_status",
  "promotion_status",
  "reason",
  "next_action",
];

/**
 * @param {Record<string, string>} row
 */
function parseJobsCount(row) {
  const n = Number(String(row.jobs_found_count ?? "").trim());
  return Number.isFinite(n) ? n : 0;
}

/**
 * extraction_status and jobs_found_count must agree (no random/empty runs).
 *
 * @param {Record<string, string>} row
 */
function isExtractionConsistent(row) {
  const status = String(row.extraction_status ?? "").trim();
  const jobs = parseJobsCount(row);
  if (status === "jobs_found" && jobs <= 0) return false;
  if (status !== "jobs_found" && jobs > 0) return false;
  return true;
}

/**
 * @param {Record<string, string>} row
 * @returns {{
 *   html_promotion_status: string,
 *   promotion_status: "ready" | "blocked" | "review_required",
 *   reason: string,
 *   next_action: string,
 * }}
 */
function classifyPromotion(row) {
  const extractionStatus = String(row.extraction_status ?? "").trim();
  const jobs = parseJobsCount(row);
  const blocker = String(row.blocker_category ?? "").trim();
  const reqBr =
    String(row.requires_browser_render ?? "").toLowerCase() === "true";

  if (!isExtractionConsistent(row)) {
    return {
      html_promotion_status: "unstable",
      promotion_status: "review_required",
      reason: `inconsistent_status_vs_jobs:status=${extractionStatus};jobs=${jobs}`,
      next_action: "manual_review",
    };
  }

  if (
    reqBr ||
    extractionStatus === "requires_browser_render" ||
    blocker === "js_render_required"
  ) {
    return {
      html_promotion_status: "needs_browser_support",
      promotion_status: "blocked",
      reason: `browser_or_js:blocker=${blocker};extraction_status=${extractionStatus}`,
      next_action: "add_browser_support",
    };
  }

  if (blocker === "network_fetch_or_parse") {
    return {
      html_promotion_status: "failed",
      promotion_status: "blocked",
      reason: `network_fetch_or_parse_blocker:extraction_status=${extractionStatus}`,
      next_action: "manual_review",
    };
  }

  if (
    extractionStatus === "jobs_found" &&
    jobs > 0 &&
    !BLOCKERS_DISQUALIFYING_PROMOTION.has(blocker)
  ) {
    return {
      html_promotion_status: "eligible",
      promotion_status: "ready",
      reason: `eligible:jobs=${jobs};blocker=${blocker || "none"}`,
      next_action: "promote_to_registry",
    };
  }

  if (
    extractionStatus === "jobs_found" &&
    jobs > 0 &&
    BLOCKERS_DISQUALIFYING_PROMOTION.has(blocker)
  ) {
    return {
      html_promotion_status: "needs_browser_support",
      promotion_status: "blocked",
      reason: `jobs_found_but_blocker_disqualifies:blocker=${blocker}`,
      next_action: "add_browser_support",
    };
  }

  if (
    ["page_found_but_no_jobs", "irrelevant_page"].includes(extractionStatus) ||
    (jobs === 0 && extractionStatus === "jobs_found")
  ) {
    return {
      html_promotion_status: "no_jobs",
      promotion_status: "blocked",
      reason: `no_extracted_jobs:status=${extractionStatus};blocker=${blocker}`,
      next_action: "manual_review",
    };
  }

  if (extractionStatus === "manual_review_needed") {
    return {
      html_promotion_status: "failed",
      promotion_status: "review_required",
      reason: `manual_review_needed:blocker=${blocker};detail=${String(row.failure_reason ?? "").slice(0, 120)}`,
      next_action: "manual_review",
    };
  }

  if (["scrape_failed", "blocked"].includes(extractionStatus)) {
    return {
      html_promotion_status: "failed",
      promotion_status: "blocked",
      reason: `scrape_or_block:status=${extractionStatus};blocker=${blocker};detail=${String(row.failure_reason ?? "").slice(0, 120)}`,
      next_action: "manual_review",
    };
  }

  return {
    html_promotion_status: "failed",
    promotion_status: "review_required",
    reason: `unclassified:status=${extractionStatus};jobs=${jobs};blocker=${blocker}`,
    next_action: "manual_review",
  };
}

/**
 * @returns {Promise<string[]>}
 */
async function loadRoutingHeaders() {
  const p = path.join(REPO, PATHS.sourceRoutingTable);
  const raw = await fs.readFile(p, "utf8");
  const rows = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    bom: true,
  });
  if (!rows.length) {
    throw new Error(`Could not read routing headers from ${p}`);
  }
  return Object.keys(rows[0]);
}

/**
 * @param {string[]} headers
 */
function emptyRoutingRow(headers) {
  /** @type {Record<string, string>} */
  const o = {};
  for (const h of headers) {
    o[h] = "";
  }
  return o;
}

/**
 * @param {string} url
 */
function hostnameFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/**
 * @param {{ promoted_at: string, original_extraction_status: string, original_blocker_category: string, original_jobs_found_count: string }} trace
 */
function buildNotesInternal(trace) {
  const parts = [
    "html_recovery_pipeline_staging_only",
    `promoted_at=${trace.promoted_at}`,
    `original_extraction_status=${trace.original_extraction_status}`,
    `original_blocker_category=${trace.original_blocker_category}`,
    `original_jobs_found_count=${trace.original_jobs_found_count}`,
  ];
  return parts.join(" | ");
}

/**
 * @param {Record<string, string>} row — extraction result
 * @param {string} nowIso
 */
function buildRegistryRow(row, nowIso) {
  const company_key = String(row.company_key ?? "").trim();
  const company_name = String(row.company_name ?? "").trim();
  const careers_url = String(row.careers_url ?? "").trim();
  /** @type {Record<string, string>} */
  const reg = {};
  for (const c of REGISTRY_COLUMNS) reg[c] = "";
  reg.company_key = company_key;
  reg.company_name = company_name;
  reg.domain = hostnameFromUrl(careers_url);
  reg.ingestion_status = "promoted";
  reg.promotion_source = "html_recovery_pipeline";
  reg.promoted_at = nowIso;
  reg.source_kind = "html_custom";
  reg.ats_provider = "";
  reg.ats_board_slug = "";
  reg.careers_url_canonical = careers_url;
  reg.extractor_profile = "";
  reg.manual_override_lock = "false";
  reg.notes_internal = buildNotesInternal({
    promoted_at: nowIso,
    original_extraction_status: String(row.extraction_status ?? ""),
    original_blocker_category: String(row.blocker_category ?? ""),
    original_jobs_found_count: String(parseJobsCount(row)),
  });
  return reg;
}

/**
 * @param {Record<string, string>} row
 * @param {string[]} routingHeaders
 * @param {string} nowIso
 */
function buildRoutingRow(row, routingHeaders, nowIso) {
  const company_key = String(row.company_key ?? "").trim();
  const company_name = String(row.company_name ?? "").trim();
  const careers_url = String(row.careers_url ?? "").trim();
  const rr = emptyRoutingRow(routingHeaders);
  rr.company_name = company_name;
  rr.company_key = company_key;
  rr.domain = hostnameFromUrl(careers_url);
  rr.careers_url_final = careers_url;
  rr.careers_url_candidate = careers_url;
  rr.homepage_url = "";
  rr.resolver_status = "html_recovery_promoted_staging";
  rr.source_type_guess = "html_custom";
  rr.last_checked_at = nowIso;
  rr.final_source_type = "html_static";
  rr.extractor_type = "html_scraper";
  rr.extractor_priority = "medium";
  rr.ready_for_extraction = "true";
  rr.routing_notes =
    "html_recovery_pipeline → staging (promoteHtmlRecoverySources.mjs); provider=html_custom; not merged to production routing";
  rr.confidence_flag = "medium";
  return rr;
}

/**
 * @param {Record<string, string>[]} rows
 */
function isGarbageRow(row) {
  const k = String(row.company_key ?? "").trim();
  const name = String(row.company_name ?? "").trim();
  const url = String(row.careers_url ?? "").trim();
  if (!k || !name || !url) return true;
  if (!isValidHttpOrHttpsUrl(url)) return true;
  return false;
}

export async function promoteHtmlRecoverySourcesMain() {
  const inputPath =
    process.env.HTML_RECOVERY_EXTRACTION_RESULTS_CSV ||
    path.join(REPO, PATHS.htmlRecoveryExtractionResultsCsv);
  const outPromotable = path.join(REPO, PATHS.htmlRecoveryPromotableSources);
  const outReg = path.join(REPO, PATHS.htmlPromotedRegistryStaging);
  const outRoute = path.join(REPO, PATHS.htmlPromotedRoutingStaging);
  const outSummary = path.join(REPO, PATHS.htmlPromotionValidationSummary);

  let raw;
  try {
    raw = await fs.readFile(inputPath, "utf8");
  } catch (e) {
    throw new Error(
      `Missing HTML recovery extraction results at ${inputPath}: ${String(e?.message || e)}`
    );
  }

  const parsed = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    bom: true,
  });

  const routingHeaders = await loadRoutingHeaders();
  const nowIso = new Date().toISOString();

  /** @type {Record<string, string>[]} */
  const promotableRows = [];
  /** @type {Record<string, string>[]} */
  const registryEligible = [];
  /** @type {Record<string, string>[]} */
  const routingEligible = [];

  /** @type {Record<string, number>} */
  const blockedByReason = {};

  let eligibleCount = 0;
  let requiresBrowserCount = 0;
  let failedCount = 0;
  let promotedReadyCount = 0;

  /** @type {{ company_key: string, company_name: string, html_promotion_status: string, promotion_status: string, reason: string }[]} */
  const perCompany = [];

  for (const row of parsed) {
    if (isGarbageRow(row)) continue;

    const classified = classifyPromotion(row);
    const source_type = "html_custom";

    promotableRows.push({
      company_name: String(row.company_name ?? "").trim(),
      careers_url: String(row.careers_url ?? "").trim(),
      source_type,
      extraction_status: String(row.extraction_status ?? "").trim(),
      jobs_found_count: String(parseJobsCount(row)),
      html_promotion_status: classified.html_promotion_status,
      promotion_status: classified.promotion_status,
      reason: classified.reason,
      next_action: classified.next_action,
    });

    perCompany.push({
      company_key: String(row.company_key ?? "").trim(),
      company_name: String(row.company_name ?? "").trim(),
      html_promotion_status: classified.html_promotion_status,
      promotion_status: classified.promotion_status,
      reason: classified.reason,
    });

    if (classified.html_promotion_status === "eligible") eligibleCount += 1;
    if (classified.html_promotion_status === "needs_browser_support") {
      requiresBrowserCount += 1;
      blockedByReason.needs_browser_support =
        (blockedByReason.needs_browser_support || 0) + 1;
    }
    if (classified.html_promotion_status === "failed") {
      failedCount += 1;
      blockedByReason.failed = (blockedByReason.failed || 0) + 1;
    }
    if (classified.html_promotion_status === "no_jobs") {
      blockedByReason.no_jobs = (blockedByReason.no_jobs || 0) + 1;
    }
    if (classified.html_promotion_status === "unstable") {
      blockedByReason.unstable = (blockedByReason.unstable || 0) + 1;
    }

    if (
      classified.html_promotion_status === "eligible" &&
      classified.promotion_status === "ready"
    ) {
      promotedReadyCount += 1;
      registryEligible.push(buildRegistryRow(row, nowIso));
      routingEligible.push(buildRoutingRow(row, routingHeaders, nowIso));
    }
  }

  await fs.mkdir(path.dirname(outPromotable), { recursive: true });
  await fs.mkdir(path.dirname(outReg), { recursive: true });

  const promotableCsv = stringify(promotableRows, {
    header: true,
    columns: PROMOTABLE_COLUMNS,
    quoted_string: true,
  });
  await fs.writeFile(outPromotable, "\uFEFF" + promotableCsv, "utf8");

  const regCsv = stringify(registryEligible, {
    header: true,
    columns: [...REGISTRY_COLUMNS],
    quoted_string: true,
  });
  await fs.writeFile(outReg, "\uFEFF" + regCsv, "utf8");

  const routeCsv = stringify(routingEligible, {
    header: true,
    columns: routingHeaders,
    quoted_string: true,
  });
  await fs.writeFile(outRoute, "\uFEFF" + routeCsv, "utf8");

  const summary = {
    ok: true,
    generated_at: nowIso,
    input_extraction_results_csv: path.relative(REPO, inputPath),
    total_candidates: promotableRows.length,
    eligible: eligibleCount,
    blocked: blockedByReason,
    requires_browser: requiresBrowserCount,
    failed: failedCount,
    promoted_ready: promotedReadyCount,
    staging_registry_rows_written: registryEligible.length,
    staging_routing_rows_written: routingEligible.length,
    outputs: {
      promotable_sources_csv: path.relative(REPO, outPromotable),
      staging_registry_csv: path.relative(REPO, outReg),
      staging_routing_csv: path.relative(REPO, outRoute),
    },
    per_company: perCompany,
    disclaimer:
      "Staging only — not merged into production_source_registry.csv or data/source_routing_table.csv.",
  };

  await fs.writeFile(outSummary, JSON.stringify(summary, null, 2), "utf8");

  console.log(JSON.stringify(summary, null, 2));
  return summary;
}

const invokedDirectly =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (invokedDirectly) {
  promoteHtmlRecoverySourcesMain().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
