#!/usr/bin/env node
/**
 * Builds staging registry + routing CSVs from data/ingestion/html_source_recovery_queue.csv
 * so runHtmlExtraction.mjs can run in HTML_EXTRACTION_RECOVERY_MODE without touching
 * production_source_registry.csv or the main career routing table.
 *
 * Does not modify the operator queue file.
 *
 * Env:
 *   HTML_RECOVERY_QUEUE_CSV — override queue path
 *   HTML_RECOVERY_INCLUDE_STATUSES — comma list (default: queued,staged,empty=all eligible)
 */
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";

import { PATHS } from "../config/pipelinePaths.mjs";
import { REGISTRY_COLUMNS } from "./migrateSourcesToProductionRegistry.mjs";
import { isValidHttpOrHttpsUrl } from "./isApprovedProductionAtsRegistryRow.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..", "..");

const DEFAULT_INCLUDE = new Set(["queued", "staged"]);

/**
 * @param {string} name
 * @param {string} url
 */
export function recoveryCompanyKey(name, url) {
  const base = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 48);
  const h = crypto
    .createHash("sha256")
    .update(String(url || "").trim())
    .digest("hex")
    .slice(0, 8);
  const b = base || "company";
  return `recovery_html__${b}__${h}`;
}

/**
 * @returns {Promise<string[]>}
 */
async function loadRoutingHeaders() {
  const p = path.join(REPO_ROOT, PATHS.sourceRoutingTable);
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
 * @param {Record<string, string>} row
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
 * @returns {Promise<{ registry_rows: number, routing_rows: number, skipped: string[], company_keys: string[] }>}
 */
export async function buildHtmlRecoveryStaging() {
  const queuePath =
    process.env.HTML_RECOVERY_QUEUE_CSV ||
    path.join(REPO_ROOT, PATHS.htmlSourceRecoveryQueue);
  const outReg = path.join(REPO_ROOT, PATHS.htmlRecoveryStagingRegistry);
  const outRoute = path.join(REPO_ROOT, PATHS.htmlRecoveryStagingRouting);

  const envStatuses = process.env.HTML_RECOVERY_INCLUDE_STATUSES;
  /** @type {Set<string>} */
  let includeSet;
  if (envStatuses == null || String(envStatuses).trim() === "") {
    includeSet = DEFAULT_INCLUDE;
  } else {
    includeSet = new Set(
      String(envStatuses)
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s.length > 0)
    );
  }

  let queueRaw;
  try {
    queueRaw = await fs.readFile(queuePath, "utf8");
  } catch (e) {
    throw new Error(
      `Missing HTML recovery queue at ${queuePath}: ${String(e?.message || e)}`
    );
  }

  const queueRows = parse(queueRaw, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    bom: true,
  });

  const routingHeaders = await loadRoutingHeaders();
  const now = new Date().toISOString();

  /** @type {Record<string, string>[]} */
  const registryOut = [];
  /** @type {Record<string, string>[]} */
  const routingOut = [];
  /** @type {string[]} */
  const skipped = [];
  /** @type {string[]} */
  const companyKeys = [];

  const seenKeys = new Set();

  for (const q of queueRows) {
    const company_name = String(q.company_name ?? "").trim();
    const careers_url = String(q.careers_url ?? "").trim();
    const rawStatus = String(q.status ?? "").trim().toLowerCase();
    const status = rawStatus || "queued";

    if (!company_name || !careers_url) {
      skipped.push(`missing_name_or_url:${company_name || "?"}`);
      continue;
    }
    if (!isValidHttpOrHttpsUrl(careers_url)) {
      skipped.push(`invalid_url:${company_name}`);
      continue;
    }

    if (status === "ignored") {
      skipped.push(`status_skip:${company_name}:${status}`);
      continue;
    }
    if (!includeSet.has(status)) {
      skipped.push(`status_not_included:${company_name}:${status}`);
      continue;
    }

    let company_key = recoveryCompanyKey(company_name, careers_url);
    while (seenKeys.has(company_key)) {
      company_key = `${company_key}_x`;
    }
    seenKeys.add(company_key);
    companyKeys.push(company_key);

    /** @type {Record<string, string>} */
    const reg = {};
    for (const c of REGISTRY_COLUMNS) reg[c] = "";
    reg.company_key = company_key;
    reg.company_name = company_name;
    reg.domain = "";
    reg.ingestion_status = "promoted";
    reg.promotion_source = "manual_html_recovery_queue_staging";
    reg.promoted_at = now;
    reg.source_kind = "html_custom";
    reg.ats_provider = "";
    reg.ats_board_slug = "";
    reg.careers_url_canonical = careers_url;
    reg.extractor_profile = "";
    reg.manual_override_lock = "false";
    reg.notes_internal =
      "staging_row_for_recovery_html_extract_only_not_production_registry";
    registryOut.push(reg);

    const rr = emptyRoutingRow(routingHeaders);
    rr.company_name = company_name;
    rr.company_key = company_key;
    rr.careers_url_final = careers_url;
    rr.careers_url_candidate = careers_url;
    rr.homepage_url = "";
    rr.resolver_status = "recovery_queue_staging";
    rr.source_type_guess = "custom_found";
    rr.last_checked_at = now;
    rr.final_source_type = "html_static";
    rr.extractor_type = "html_scraper";
    rr.extractor_priority = "medium";
    rr.ready_for_extraction = "true";
    rr.routing_notes =
      "manual_html_recovery_queue → staging (buildHtmlRecoveryStaging.mjs)";
    routingOut.push(rr);
  }

  await fs.mkdir(path.dirname(outReg), { recursive: true });
  const regCsv = stringify(registryOut, {
    header: true,
    columns: [...REGISTRY_COLUMNS],
    quoted_string: true,
  });
  await fs.writeFile(outReg, "\uFEFF" + regCsv, "utf8");

  const routeCsv = stringify(routingOut, {
    header: true,
    columns: routingHeaders,
    quoted_string: true,
  });
  await fs.writeFile(outRoute, "\uFEFF" + routeCsv, "utf8");

  const report = {
    ok: true,
    queue_csv: path.relative(REPO_ROOT, queuePath),
    registry_staging: path.relative(REPO_ROOT, outReg),
    routing_staging: path.relative(REPO_ROOT, outRoute),
    registry_rows: registryOut.length,
    routing_rows: routingOut.length,
    skipped,
    company_keys: companyKeys,
  };

  console.log(JSON.stringify(report, null, 2));
  return report;
}

async function main() {
  await buildHtmlRecoveryStaging();
}

const invoked =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (invoked) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
