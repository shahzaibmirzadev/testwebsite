#!/usr/bin/env node
/**
 * Controlled merge of reviewed HTML recovery staging rows into:
 *   data/ingestion/production_source_registry.csv
 *   data/source_routing_table.csv
 *
 * Inputs:
 *   data/ingestion/staging/html_promoted_registry.csv
 *   data/ingestion/staging/html_promoted_routing.csv
 * Gate (default): rows must appear in data/ingestion/html_recovery_promotable_sources.csv with
 *   promotion_status=ready AND html_promotion_status=eligible (name + URL match).
 *
 * Env:
 *   HTML_PROMOTABLE_CSV — override promotable path
 *   HTML_STAGING_REGISTRY — override staging registry path
 *   HTML_STAGING_ROUTING — override staging routing path
 *   HTML_RECOVERY_MERGE_DRY_RUN=1 — no writes to production CSVs
 *   HTML_MERGE_SKIP_PROMOTABLE_GATE=1 — merge all staging rows without promotable CSV gate (unsafe; explicit only)
 */
import fs from "fs/promises";
import path from "path";
import { pathToFileURL } from "url";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";

import { PATHS } from "../config/pipelinePaths.mjs";
import { REGISTRY_COLUMNS } from "../ingestion/migrateSourcesToProductionRegistry.mjs";
import {
  normalizeCareersUrlKey,
  normalizeCompanyName,
} from "./recoveryMergeShared.mjs";

const REPO = process.cwd();

/**
 * @param {string} name
 * @param {string} url
 */
function promotableGateKey(name, url) {
  return `${normalizeCompanyName(name)}|${normalizeCareersUrlKey(url)}`;
}

/**
 * @param {string} promotablePath
 * @returns {Promise<Set<string>>}
 */
async function loadPromotableEligibleKeys(promotablePath) {
  let raw;
  try {
    raw = await fs.readFile(promotablePath, "utf8");
  } catch {
    return new Set();
  }
  const rows = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    bom: true,
  });
  /** @type {Set<string>} */
  const keys = new Set();
  for (const r of rows) {
    const ps = String(r.promotion_status ?? "")
      .trim()
      .toLowerCase();
    const hs = String(r.html_promotion_status ?? "")
      .trim()
      .toLowerCase();
    if (ps !== "ready") continue;
    if (hs !== "eligible") continue;
    const name = String(r.company_name ?? "").trim();
    const url = String(r.careers_url ?? "").trim();
    if (!name || !url) continue;
    keys.add(promotableGateKey(name, url));
  }
  return keys;
}

function parseDryRun() {
  return (
    /^1|true|yes$/i.test(String(process.env.HTML_RECOVERY_MERGE_DRY_RUN || "").trim()) ||
    process.argv.includes("--dry-run")
  );
}

function skipGate() {
  return /^1|true|yes$/i.test(
    String(process.env.HTML_MERGE_SKIP_PROMOTABLE_GATE || "").trim()
  );
}

export async function mergeHtmlRecoveryIntoProductionRegistryMain() {
  const dryRun = parseDryRun();
  const gateOff = skipGate();

  const stagingRegPath =
    process.env.HTML_STAGING_REGISTRY ||
    path.join(REPO, PATHS.htmlPromotedRegistryStaging);
  const stagingRoutePath =
    process.env.HTML_STAGING_ROUTING ||
    path.join(REPO, PATHS.htmlPromotedRoutingStaging);
  const promotablePath =
    process.env.HTML_PROMOTABLE_CSV ||
    path.join(REPO, PATHS.htmlRecoveryPromotableSources);

  const prodRegPath = path.join(REPO, PATHS.productionSourceRegistry);
  const prodRoutePath = path.join(REPO, PATHS.sourceRoutingTable);

  const summaryPath = path.join(REPO, PATHS.htmlRecoveryRegistryMergeSummary);
  const reportPath = path.join(REPO, PATHS.htmlRecoveryRegistryMergeReport);

  let stagingRegRaw;
  try {
    stagingRegRaw = await fs.readFile(stagingRegPath, "utf8");
  } catch (e) {
    throw new Error(
      `Missing HTML staging registry at ${stagingRegPath}: ${String(e?.message || e)}`
    );
  }
  let stagingRouteRaw;
  try {
    stagingRouteRaw = await fs.readFile(stagingRoutePath, "utf8");
  } catch (e) {
    throw new Error(
      `Missing HTML staging routing at ${stagingRoutePath}: ${String(e?.message || e)}`
    );
  }

  const stagingRegRows = parse(stagingRegRaw, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    bom: true,
  });
  const stagingRouteRows = parse(stagingRouteRaw, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    bom: true,
  });

  /** @type {Map<string, Record<string, string>>} */
  const routingByKey = new Map();
  for (const r of stagingRouteRows) {
    const k = String(r.company_key ?? "").trim();
    if (k) routingByKey.set(k, r);
  }

  const eligibleKeys = gateOff ? null : await loadPromotableEligibleKeys(promotablePath);

  let prodRegRaw;
  try {
    prodRegRaw = await fs.readFile(prodRegPath, "utf8");
  } catch (e) {
    throw new Error(
      `Missing production registry at ${prodRegPath}: ${String(e?.message || e)}`
    );
  }
  let prodRouteRaw;
  try {
    prodRouteRaw = await fs.readFile(prodRoutePath, "utf8");
  } catch (e) {
    throw new Error(
      `Missing production routing at ${prodRoutePath}: ${String(e?.message || e)}`
    );
  }

  const prodRegRows = parse(prodRegRaw, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    bom: true,
  });
  const prodRouteRows = parse(prodRouteRaw, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    bom: true,
  });

  const regColumns = REGISTRY_COLUMNS;
  const routeColumns =
    prodRouteRows.length > 0 ? Object.keys(prodRouteRows[0]) : [];

  /** @type {Map<string, Record<string, string>>} */
  const prodByCk = new Map();
  /** @type {Map<string, string>} urlKey -> company_key */
  const prodUrlToCk = new Map();

  for (const r of prodRegRows) {
    const ck = String(r.company_key ?? "").trim();
    if (!ck) continue;
    prodByCk.set(ck, r);
    const url = String(r.careers_url_canonical ?? "").trim();
    if (url) {
      const uk = normalizeCareersUrlKey(url);
      if (!prodUrlToCk.has(uk)) prodUrlToCk.set(uk, ck);
    }
  }

  /** @type {Record<string, string>[] } */
  const regAppend = [];
  /** @type {Record<string, string>[] } */
  const routeAppend = [];
  /** @type {Record<string, unknown>[] } */
  const report = [];

  for (const reg of stagingRegRows) {
    const company_key = String(reg.company_key ?? "").trim();
    const company_name = String(reg.company_name ?? "").trim();
    const careers_url = String(reg.careers_url_canonical ?? "").trim();

    if (!company_key || !company_name || !careers_url) {
      report.push({
        company_key,
        company_name,
        careers_url,
        outcome: "blocked_incomplete_staging_row",
        detail: "missing_company_key_name_or_url",
      });
      continue;
    }

    if (!gateOff) {
      const gk = promotableGateKey(company_name, careers_url);
      if (!eligibleKeys || eligibleKeys.size === 0 || !eligibleKeys.has(gk)) {
        report.push({
          company_key,
          company_name,
          careers_url,
          outcome: "skipped_not_in_promotable_ready_eligible",
          detail: gateOff
            ? ""
            : `gate_key=${gk};promotable_eligible_count=${eligibleKeys?.size ?? 0}`,
        });
        continue;
      }
    }

    const route = routingByKey.get(company_key);
    if (!route) {
      report.push({
        company_key,
        company_name,
        careers_url,
        outcome: "blocked_missing_staging_routing_row",
        detail: "no_matching_company_key_in_html_promoted_routing",
      });
      continue;
    }

    const urlK = normalizeCareersUrlKey(careers_url);

    if (prodByCk.has(company_key)) {
      const ex = prodByCk.get(company_key);
      const exUrl = String(ex?.careers_url_canonical ?? "").trim();
      if (
        normalizeCareersUrlKey(exUrl) === urlK &&
        String(ex?.source_kind ?? "").trim().toLowerCase() === "html_custom"
      ) {
        report.push({
          company_key,
          company_name,
          careers_url,
          outcome: "skipped_idempotent_already_in_registry",
          detail: "same_company_key_url_and_html_custom",
        });
        continue;
      }
      report.push({
        company_key,
        company_name,
        careers_url,
        outcome: "blocked_company_key_collision",
        detail: `existing_row_differs:${String(ex?.careers_url_canonical ?? "")}`,
      });
      continue;
    }

    const urlOwner = prodUrlToCk.get(urlK);
    if (urlOwner && urlOwner !== company_key) {
      report.push({
        company_key,
        company_name,
        careers_url,
        outcome: "blocked_careers_url_collision",
        detail: `url_owned_by_${urlOwner}`,
      });
      continue;
    }

    const regOut = {};
    for (const c of regColumns) regOut[c] = String(reg[c] ?? "");
    regAppend.push(regOut);
    const ro = {};
    for (const c of routeColumns) ro[c] = String(route[c] ?? "");
    routeAppend.push(ro);

    prodByCk.set(company_key, regOut);
    if (!prodUrlToCk.has(urlK)) prodUrlToCk.set(urlK, company_key);

    report.push({
      company_key,
      company_name,
      careers_url,
      outcome: dryRun ? "would_append" : "appended",
      detail: "ok",
    });
  }

  const nextReg = dryRun ? prodRegRows : [...prodRegRows, ...regAppend];
  const nextRoute = dryRun ? prodRouteRows : [...prodRouteRows, ...routeAppend];

  if (!dryRun && (regAppend.length > 0 || routeAppend.length > 0)) {
    if (regAppend.length !== routeAppend.length) {
      throw new Error(
        `Internal error: registry append (${regAppend.length}) !== routing append (${routeAppend.length})`
      );
    }
    const regCsv = stringify(nextReg, {
      header: true,
      columns: [...regColumns],
      quoted_string: true,
    });
    const routeCsv = stringify(nextRoute, {
      header: true,
      columns: routeColumns,
      quoted_string: true,
    });
    await fs.writeFile(prodRegPath, "\uFEFF" + regCsv, "utf8");
    await fs.writeFile(prodRoutePath, "\uFEFF" + routeCsv, "utf8");
  }

  const warnings = [];
  if (
    !gateOff &&
    stagingRegRows.length > 0 &&
    (eligibleKeys?.size ?? 0) === 0
  ) {
    warnings.push(
      "promotable_csv_has_zero_eligible_ready_rows: all_staging_rows_skipped; fill html_recovery_promotable_sources.csv or set HTML_MERGE_SKIP_PROMOTABLE_GATE=1 (unsafe)"
    );
  }

  const summary = {
    ok: true,
    generated_at: new Date().toISOString(),
    dry_run: dryRun,
    warnings,
    promotable_gate_skipped: gateOff,
    promotable_csv: path.relative(REPO, promotablePath),
    staging_registry: path.relative(REPO, stagingRegPath),
    staging_routing: path.relative(REPO, stagingRoutePath),
    production_registry: path.relative(REPO, prodRegPath),
    production_routing: path.relative(REPO, prodRoutePath),
    promotable_eligible_keys_loaded: eligibleKeys?.size ?? 0,
    staging_registry_rows: stagingRegRows.length,
    appended_registry_rows: regAppend.length,
    appended_routing_rows: routeAppend.length,
    outcomes: report,
    post_merge_steps_suggested: [
      "HTML extraction (production paths): npm run extract:html",
      "Optional: npm run filter:jobs after raw+clean stages",
    ],
    disclaimer:
      "Does not publish jobs. Merge only updates ingestion inputs; run migrate/extract pipelines separately.",
  };

  await fs.mkdir(path.dirname(summaryPath), { recursive: true });
  await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2), "utf8");

  const reportCsv = stringify(
    report.map((r) => ({
      company_key: r.company_key,
      company_name: r.company_name,
      careers_url: r.careers_url,
      outcome: r.outcome,
      detail: r.detail,
    })),
    { header: true, quoted_string: true }
  );
  await fs.writeFile(reportPath, "\uFEFF" + reportCsv, "utf8");

  console.log(JSON.stringify(summary, null, 2));
  return summary;
}

const invokedDirectly =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (invokedDirectly) {
  mergeHtmlRecoveryIntoProductionRegistryMain().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
