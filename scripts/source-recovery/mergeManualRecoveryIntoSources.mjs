#!/usr/bin/env node
/**
 * Controlled merge of reviewed ATS manual-recovery promotable rows into repo-root sources.csv.
 *
 * Input:  data/ingestion/manual_recovery_promotable_sources.csv
 * Target: sources.csv (PATHS.sourcesCsv)
 *
 * Eligibility:
 *   - promotion_status is "ready_new" or "ready" (legacy alias)
 *   - optional column merge_approved: if present, must be yes/true/1/y
 *   - provider + slug + company_name non-empty
 *   - matchAgainstTrackedSources === ready_new_source (no duplicate key, no ambiguous company collision)
 *
 * Env:
 *   MANUAL_RECOVERY_PROMOTABLE_CSV — override promotable path
 *   MANUAL_RECOVERY_MERGE_DRY_RUN=1 — no write to sources.csv; still writes summary/report
 */
import fs from "fs/promises";
import path from "path";
import { pathToFileURL } from "url";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";

import { PATHS } from "../config/pipelinePaths.mjs";
import { companyKeyFromLegacyAts } from "../ingestion/companyKey.mjs";
import {
  loadTrackedSourcesIndex,
  matchAgainstTrackedSources,
  normalizeCompanyName,
} from "./recoveryMergeShared.mjs";

const REPO = process.cwd();

const READY_STATUSES = new Set(["ready", "ready_new"]);

/**
 * @param {Record<string, string>} row
 */
function mergeApproved(row) {
  if (!Object.prototype.hasOwnProperty.call(row, "merge_approved")) return true;
  const v = String(row.merge_approved ?? "")
    .trim()
    .toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "y";
}

/**
 * @param {string} provider
 * @param {string} slug
 * @param {string} companyName
 * @param {string[]} columns
 */
function newSourcesRow(provider, slug, companyName, columns) {
  const p = String(provider || "")
    .trim()
    .toLowerCase();
  const s = String(slug || "").trim();
  /** @type {Record<string, string>} */
  const o = {};
  for (const c of columns) o[c] = "";
  o.ats = p;
  o.slug = s;
  o.company_name = companyName;
  o.status = "auto";
  o.last_checked_at = "";
  o.last_successful_fetch_at = "";
  o.jobs_last_run = "0";
  o.jobs_relevant_last_run = "0";
  o.jobs_inserted_last_run = "0";
  o.jobs_updated_last_run = "0";
  o.jobs_irrelevant_last_run = "0";
  o.jobs_partial_last_run = "0";
  o.jobs_old_last_run = "0";
  o.fetch_failed_last_run = "false";
  o.yield_last_run = "0";
  o.times_seen_empty = "0";
  o.times_failed = "0";
  o.scrape_tier = "medium";
  o.scrape_every_runs = "1";
  o.bucket_last_run = "";
  o.last_error = "";
  o.provider = p;
  o.company = companyName;
  return o;
}

function parseDryRun() {
  return (
    /^1|true|yes$/i.test(String(process.env.MANUAL_RECOVERY_MERGE_DRY_RUN || "").trim()) ||
    process.argv.includes("--dry-run")
  );
}

export async function mergeManualRecoveryIntoSourcesMain() {
  const dryRun = parseDryRun();
  const promotablePath =
    process.env.MANUAL_RECOVERY_PROMOTABLE_CSV ||
    path.join(REPO, "data", "ingestion", "manual_recovery_promotable_sources.csv");
  const sourcesPath = path.join(REPO, PATHS.sourcesCsv);
  const summaryPath = path.join(REPO, PATHS.manualRecoverySourcesMergeSummary);
  const reportPath = path.join(REPO, PATHS.manualRecoverySourcesMergeReport);

  let promotableRaw;
  try {
    promotableRaw = await fs.readFile(promotablePath, "utf8");
  } catch (e) {
    throw new Error(
      `Missing manual recovery promotable CSV at ${promotablePath}: ${String(e?.message || e)}`
    );
  }

  const promotableRows = parse(promotableRaw, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    bom: true,
  });

  let sourcesRaw;
  try {
    sourcesRaw = await fs.readFile(sourcesPath, "utf8");
  } catch (e) {
    throw new Error(
      `Missing sources.csv at ${sourcesPath}: ${String(e?.message || e)}`
    );
  }

  const existingRows = parse(sourcesRaw, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    bom: true,
  });

  if (!existingRows.length) {
    throw new Error(`sources.csv has no data rows at ${sourcesPath}`);
  }

  const columns = Object.keys(existingRows[0]);
  const idx = await loadTrackedSourcesIndex(sourcesPath);

  /** @type {Record<string, string>[] } */
  const appended = [];
  /** @type {Record<string, unknown>[] } */
  const reportRows = [];

  for (const pr of promotableRows) {
    const promotion_status = String(pr.promotion_status ?? "")
      .trim()
      .toLowerCase();
    const company_name = String(pr.company_name ?? "").trim();
    const provider = String(pr.provider ?? "")
      .trim()
      .toLowerCase();
    const slug = String(pr.slug ?? "").trim();

    if (!READY_STATUSES.has(promotion_status)) {
      reportRows.push({
        company_name,
        provider,
        slug,
        outcome: "skipped_not_ready_status",
        detail: `promotion_status=${pr.promotion_status ?? ""}`,
        expected_company_key: "",
      });
      continue;
    }

    if (!mergeApproved(pr)) {
      reportRows.push({
        company_name,
        provider,
        slug,
        outcome: "skipped_merge_not_approved",
        detail: "merge_approved_false_or_empty",
        expected_company_key: "",
      });
      continue;
    }

    if (!company_name || !provider || !slug) {
      reportRows.push({
        company_name,
        provider,
        slug,
        outcome: "blocked_missing_fields",
        detail: "need_company_name_provider_slug",
        expected_company_key: "",
      });
      continue;
    }

    const match = matchAgainstTrackedSources(
      normalizeCompanyName(company_name),
      provider,
      slug,
      idx
    );

    const expected_company_key = companyKeyFromLegacyAts(provider, slug);

    if (match.kind !== "ready_new_source") {
      reportRows.push({
        company_name,
        provider,
        slug,
        outcome:
          match.kind === "already_tracked_exact"
            ? "skipped_already_tracked"
            : match.kind === "ambiguous_company_match" ||
                match.kind === "tracked_same_company_different_source"
              ? "blocked_ambiguous_collision"
              : "blocked",
        detail: String(match.detail ?? match.kind),
        expected_company_key,
      });
      continue;
    }

    const newRow = newSourcesRow(provider, slug, company_name, columns);
    appended.push(newRow);
    idx.byKey.set(`${provider}|${slug.toLowerCase()}`, { ...newRow });
    const cn = normalizeCompanyName(company_name);
    if (!idx.byCompany.has(cn)) idx.byCompany.set(cn, []);
    idx.byCompany.get(cn).push({ provider, slug, company_name });

    reportRows.push({
      company_name,
      provider,
      slug,
      outcome: dryRun ? "would_append" : "appended",
      detail: "ready_new_source_verified",
      expected_company_key,
    });
  }

  const outRows = dryRun ? existingRows : [...existingRows, ...appended];

  if (!dryRun && appended.length > 0) {
    const csv = stringify(outRows, {
      header: true,
      columns,
      quoted_string: true,
    });
    await fs.writeFile(sourcesPath, "\uFEFF" + csv, "utf8");
  }

  const summary = {
    ok: true,
    generated_at: new Date().toISOString(),
    dry_run: dryRun,
    promotable_csv: path.relative(REPO, promotablePath),
    sources_csv: path.relative(REPO, sourcesPath),
    existing_row_count: existingRows.length,
    appended_count: appended.length,
    skipped_or_blocked: reportRows.filter(
      (r) => r.outcome !== "appended" && r.outcome !== "would_append"
    ).length,
    outcomes: reportRows,
    post_merge_steps_suggested: [
      "Align production registry with new sources.csv rows: npm run ingestion:migrate-registry",
      "Refresh routing if your pipeline requires it: npm run routing:table",
      "Fetch jobs: npm run extract:ats",
    ],
  };

  await fs.mkdir(path.dirname(summaryPath), { recursive: true });
  await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2), "utf8");

  const reportCsv = stringify(
    reportRows.map((r) => ({
      company_name: r.company_name,
      provider: r.provider,
      slug: r.slug,
      outcome: r.outcome,
      detail: r.detail,
      expected_company_key: r.expected_company_key,
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
  mergeManualRecoveryIntoSourcesMain().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
