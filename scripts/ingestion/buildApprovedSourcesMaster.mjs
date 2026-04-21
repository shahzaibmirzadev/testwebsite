#!/usr/bin/env node
/**
 * Generates data/ingestion/approved_sources_master.csv (and report JSON).
 * Read-only inputs; does not change other pipelines.
 *
 *   node scripts/ingestion/buildApprovedSourcesMaster.mjs
 *
 * Env:
 *   REGISTRY_CSV — default data/ingestion/production_source_registry.csv
 *   ROUTING_CSV — default data/source_routing_table.csv
 *   OUT_CSV — default data/ingestion/approved_sources_master.csv
 *   OUT_REPORT — default data/ingestion/approved_sources_master_report.latest.json
 */
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";

import { APPROVED_SOURCES_MASTER_COLUMNS } from "./approvedSourcesMasterColumns.mjs";
import { isApprovedProductionAtsRegistryRow } from "./isApprovedProductionAtsRegistryRow.mjs";
import {
  dedupeHtmlByNormalizedUrl,
  htmlInclusionFailureReason,
  normalizedCareersUrl,
} from "./approvedSourcesMasterHtml.mjs";
import { PATHS } from "../config/pipelinePaths.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..", "..");

const DEFAULT_REGISTRY = path.join(REPO_ROOT, PATHS.productionSourceRegistry);
const DEFAULT_ROUTING = path.join(REPO_ROOT, PATHS.sourceRoutingTable);
const DEFAULT_OUT = path.join(REPO_ROOT, PATHS.approvedSourcesMasterCsv);
const DEFAULT_REPORT = path.join(
  REPO_ROOT,
  PATHS.approvedSourcesMasterReportLatest
);

const ATS_RULE = "ats_registry_v1";
const HTML_RULE = "html_relaxed_v1";

/**
 * @param {string} p
 */
async function loadCsv(p) {
  const raw = await fs.readFile(p, "utf8");
  return parse(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    bom: true,
  });
}

/**
 * @param {Record<string, string>} reg
 */
function atsToMasterRow(reg, promotedAt) {
  const ck = String(reg.company_key ?? "").trim();
  return {
    master_row_id: `ats:${ck}`,
    source_track: "ats_bridge",
    company_display_name: String(reg.company_name ?? "").trim(),
    ats_company_key: ck,
    resolver_company_key: "",
    source_kind: "ats_api",
    ats_provider: String(reg.ats_provider ?? "").trim(),
    ats_board_slug: String(reg.ats_board_slug ?? "").trim(),
    careers_url_canonical: String(reg.careers_url_canonical ?? "").trim(),
    homepage_url: "",
    domain: String(reg.domain ?? "").trim(),
    ingestion_status: "promoted",
    promotion_source: "ats:isApprovedProductionAtsRegistryRow",
    promoted_at: promotedAt,
    approval_rule_set: ATS_RULE,
  };
}

/**
 * @param {Record<string, string>} row
 * @param {string} promotedAt
 */
function htmlToMasterRow(row, promotedAt) {
  const rck = String(row.company_key ?? "").trim();
  const canon = normalizedCareersUrl(row);
  return {
    master_row_id: `html:${rck}`,
    source_track: "html_resolver",
    company_display_name: String(row.company_name ?? "").trim(),
    ats_company_key: "",
    resolver_company_key: rck,
    source_kind: "html_custom",
    ats_provider: "",
    ats_board_slug: "",
    careers_url_canonical: canon,
    homepage_url: String(row.homepage_url ?? "").trim(),
    domain: String(row.domain ?? "").trim(),
    ingestion_status: "promoted",
    promotion_source: "html:routing_relaxed_v1",
    promoted_at: promotedAt,
    approval_rule_set: HTML_RULE,
  };
}

async function main() {
  const registryPath = process.env.REGISTRY_CSV || DEFAULT_REGISTRY;
  const routingPath = process.env.ROUTING_CSV || DEFAULT_ROUTING;
  const outCsv = process.env.OUT_CSV || DEFAULT_OUT;
  const outReport = process.env.OUT_REPORT || DEFAULT_REPORT;

  const promotedAt = new Date().toISOString();

  const registry = await loadCsv(registryPath);
  const routing = await loadCsv(routingPath);

  const atsRows = registry
    .filter(isApprovedProductionAtsRegistryRow)
    .map((r) => atsToMasterRow(r, promotedAt));

  /** @type {Record<string, number>} */
  const htmlExcludedByReason = {
    not_ready: 0,
    extractor_not_html_scraper: 0,
    blocked_resolver_status: 0,
    invalid_careers_url: 0,
  };

  /** @type {Record<string, string>[]} */
  const htmlPreDedupe = [];

  for (const row of routing) {
    const fail = htmlInclusionFailureReason(row);
    if (fail) {
      htmlExcludedByReason[fail] = (htmlExcludedByReason[fail] || 0) + 1;
      continue;
    }
    htmlPreDedupe.push(row);
  }

  const htmlEligibleBeforeDedupe = htmlPreDedupe.length;
  const { winners, dedupeLosers } = dedupeHtmlByNormalizedUrl(htmlPreDedupe);
  const htmlRows = winners.map((r) => htmlToMasterRow(r, promotedAt));

  const dedupedRowsCount = dedupeLosers.length;

  const allRows = [...atsRows, ...htmlRows];

  const csv = stringify(allRows, {
    header: true,
    columns: [...APPROVED_SOURCES_MASTER_COLUMNS],
    quoted_string: true,
  });
  await fs.mkdir(path.dirname(outCsv), { recursive: true });
  await fs.writeFile(outCsv, "\uFEFF" + csv, "utf8");

  const report = {
    ok: true,
    generated_at: promotedAt,
    inputs: {
      registry_csv: path.relative(REPO_ROOT, registryPath),
      routing_csv: path.relative(REPO_ROOT, routingPath),
    },
    outputs: {
      approved_sources_master_csv: path.relative(REPO_ROOT, outCsv),
      report_json: path.relative(REPO_ROOT, outReport),
    },
    totals: {
      ats_rows: atsRows.length,
      html_rows: htmlRows.length,
      html_eligible_before_dedupe: htmlEligibleBeforeDedupe,
      deduped_rows_count: dedupedRowsCount,
    },
    html_metrics_note:
      "html_rows is the master-build count (routing-derived HTML candidates per html_relaxed_v1). Discovery allowlist_approved_html_rows counts only registry-promoted html_custom rows.",
    html_excluded_by_reason: htmlExcludedByReason,
    approval_rule_sets: {
      ats: ATS_RULE,
      html: HTML_RULE,
    },
  };

  await fs.writeFile(outReport, JSON.stringify(report, null, 2), "utf8");

  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
