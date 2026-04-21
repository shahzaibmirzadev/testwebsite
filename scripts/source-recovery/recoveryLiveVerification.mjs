#!/usr/bin/env node
/**
 * Post-merge operator verification: compares merge summaries + current ingestion inputs
 * + optional pipeline JSON artifacts (raw extract, filtered jobs).
 *
 * Writes: data/recovery_live_verification_summary.json
 *
 * Does not run extraction or daily-sync. Refresh artifacts by running the pipeline locally first.
 */
import fs from "fs/promises";
import path from "path";
import { pathToFileURL } from "url";
import { parse } from "csv-parse/sync";

import { PATHS } from "../config/pipelinePaths.mjs";

const REPO = process.cwd();

/**
 * @param {string} p
 */
async function tryReadJson(p) {
  try {
    const raw = await fs.readFile(p, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * @param {unknown[]} jobs
 * @param {string} companyKey
 */
function countJobsByCompanyKey(jobs, companyKey) {
  if (!Array.isArray(jobs)) return 0;
  const ck = String(companyKey || "").trim();
  return jobs.filter((j) => String(j?.company_key ?? "").trim() === ck).length;
}

/**
 * @param {unknown[]} jobs
 * @param {string} companyKey
 */
function relevanceStatsForCompany(jobs, companyKey) {
  const ck = String(companyKey || "").trim();
  if (!Array.isArray(jobs)) {
    return {
      jobs_in_filtered_artifact: 0,
      relevance_pass_count: null,
      relevance_fail_count: null,
    };
  }
  const mine = jobs.filter(
    (j) => String(j?.company_key ?? "").trim() === ck
  );
  if (!mine.length) {
    return {
      jobs_in_filtered_artifact: 0,
      relevance_pass_count: null,
      relevance_fail_count: null,
    };
  }
  let pass = 0;
  let fail = 0;
  for (const j of mine) {
    const rel = j?.relevance;
    if (rel && typeof rel === "object" && "pass" in rel) {
      if (/** @type {{ pass?: boolean }} */ (rel).pass) pass += 1;
      else fail += 1;
    }
  }
  return {
    jobs_in_filtered_artifact: mine.length,
    relevance_pass_count: pass,
    relevance_fail_count: fail,
  };
}

/**
 * @param {string} provider
 * @param {string} slug
 */
function sourcesRowExists(provider, slug, rows) {
  const p = String(provider || "")
    .trim()
    .toLowerCase();
  const s = String(slug || "").trim();
  return rows.some((r) => {
    const rp = (r.ats || r.provider || "").trim().toLowerCase();
    const rs = (r.slug || "").trim();
    return rp === p && rs === s;
  });
}

/**
 * @param {string} companyKey
 */
function registryRowExists(companyKey, rows) {
  const k = String(companyKey || "").trim();
  return rows.some((r) => String(r.company_key ?? "").trim() === k);
}

export async function recoveryLiveVerificationMain() {
  const manualSummaryPath = path.join(REPO, PATHS.manualRecoverySourcesMergeSummary);
  const htmlSummaryPath = path.join(REPO, PATHS.htmlRecoveryRegistryMergeSummary);
  const outPath = path.join(REPO, PATHS.recoveryLiveVerificationSummary);

  const manualSummary = await tryReadJson(manualSummaryPath);
  const htmlSummary = await tryReadJson(htmlSummaryPath);

  const sourcesPath = path.join(REPO, PATHS.sourcesCsv);
  const prodRegPath = path.join(REPO, PATHS.productionSourceRegistry);

  let sourcesRows = [];
  try {
    const raw = await fs.readFile(sourcesPath, "utf8");
    sourcesRows = parse(raw, {
      columns: true,
      skip_empty_lines: true,
      relax_quotes: true,
      bom: true,
    });
  } catch {
    sourcesRows = [];
  }

  let registryRows = [];
  try {
    const raw = await fs.readFile(prodRegPath, "utf8");
    registryRows = parse(raw, {
      columns: true,
      skip_empty_lines: true,
      relax_quotes: true,
      bom: true,
    });
  } catch {
    registryRows = [];
  }

  const atsRawPath = path.join(REPO, PATHS.extractedJobsRaw);
  const htmlRawPath = path.join(REPO, PATHS.extractedJobsHtmlRaw);
  const filteredPath = path.join(REPO, PATHS.extractedJobsFiltered);

  const atsRawPayload = await tryReadJson(atsRawPath);
  const htmlRawPayload = await tryReadJson(htmlRawPath);
  const filteredPayload = await tryReadJson(filteredPath);

  const atsJobs = Array.isArray(atsRawPayload?.jobs) ? atsRawPayload.jobs : [];
  const htmlJobs = Array.isArray(htmlRawPayload?.jobs) ? htmlRawPayload.jobs : [];
  const filteredJobs = Array.isArray(filteredPayload?.jobs)
    ? filteredPayload.jobs
    : [];

  /** @type {Record<string, unknown>[]} */
  const companies = [];

  const manualOutcomes = Array.isArray(manualSummary?.outcomes)
    ? manualSummary.outcomes
    : [];
  for (const o of manualOutcomes) {
    if (o.outcome !== "appended" && o.outcome !== "would_append") continue;
    const provider = String(o.provider ?? "").trim();
    const slug = String(o.slug ?? "").trim();
    const company_name = String(o.company_name ?? "").trim();
    const expected_company_key = String(o.expected_company_key ?? "").trim();
    const inSources = sourcesRowExists(provider, slug, sourcesRows);
    const rawCount = countJobsByCompanyKey(atsJobs, expected_company_key);
    const rel = relevanceStatsForCompany(filteredJobs, expected_company_key);

    companies.push({
      recovery_track: "ats_manual_recovery",
      company_name,
      provider,
      slug,
      company_key: expected_company_key,
      merged_into_sources_csv: inSources,
      merged_into_html_production_registry: false,
      expected_in_daily_sync_sources: inSources,
      jobs_found_in_extracted_jobs_raw: rawCount > 0,
      raw_job_count: rawCount,
      relevance_blocked:
        rel.jobs_in_filtered_artifact > 0 && (rel.relevance_fail_count ?? 0) > 0,
      relevance_pass_count: rel.relevance_pass_count,
      relevance_fail_count: rel.relevance_fail_count,
      blocked_by_age_unknown_without_clean_stage_scan: null,
      failed_fetch_or_scrape_unknown_run_extract_first: rawCount === 0,
      recommended_next_action: inSources
        ? rawCount === 0
          ? "run_extract_ats_and_verify"
          : "ok_or_run_filter_pipeline_for_relevance_detail"
        : "re_run_merge_or_check_sources_csv",
    });
  }

  const htmlOutcomes = Array.isArray(htmlSummary?.outcomes)
    ? htmlSummary.outcomes
    : [];
  for (const o of htmlOutcomes) {
    if (o.outcome !== "appended" && o.outcome !== "would_append") continue;
    const company_key = String(o.company_key ?? "").trim();
    const company_name = String(o.company_name ?? "").trim();
    const inReg = registryRowExists(company_key, registryRows);
    const rawCount = countJobsByCompanyKey(htmlJobs, company_key);
    const rel = relevanceStatsForCompany(filteredJobs, company_key);

    companies.push({
      recovery_track: "html_recovery",
      company_name,
      company_key,
      careers_url: String(o.careers_url ?? "").trim(),
      merged_into_sources_csv: false,
      merged_into_html_production_registry: inReg,
      expected_in_daily_sync_sources: false,
      jobs_found_in_extracted_jobs_html_raw: rawCount > 0,
      raw_job_count: rawCount,
      relevance_blocked:
        rel.jobs_in_filtered_artifact > 0 && (rel.relevance_fail_count ?? 0) > 0,
      relevance_pass_count: rel.relevance_pass_count,
      relevance_fail_count: rel.relevance_fail_count,
      blocked_by_age_unknown_without_clean_stage_scan: null,
      failed_fetch_or_scrape_unknown_run_extract_first: rawCount === 0,
      recommended_next_action: inReg
        ? rawCount === 0
          ? "run_extract_html_and_verify"
          : "ok_or_run_filter_pipeline_for_relevance_detail"
        : "re_run_html_merge_or_check_registry",
    });
  }

  const summary = {
    ok: true,
    generated_at: new Date().toISOString(),
    inputs: {
      manual_merge_summary: path.relative(REPO, manualSummaryPath),
      html_merge_summary: path.relative(REPO, htmlSummaryPath),
      sources_csv: path.relative(REPO, sourcesPath),
      production_registry: path.relative(REPO, prodRegPath),
      extracted_jobs_raw: path.relative(REPO, atsRawPath),
      extracted_jobs_html_raw: path.relative(REPO, htmlRawPath),
      extracted_jobs_filtered: path.relative(REPO, filteredPath),
    },
    artifacts_present: {
      manual_merge_summary: manualSummary != null,
      html_merge_summary: htmlSummary != null,
      extracted_jobs_raw: atsRawPayload != null,
      extracted_jobs_html_raw: htmlRawPayload != null,
      extracted_jobs_filtered: filteredPayload != null,
    },
    companies_verified: companies.length,
    companies,
    notes: [
      "blocked_by_age_* requires clean-stage metadata per job; not inferred here.",
      "Run npm run daily:pipeline or individual extract steps, then re-run this script.",
      "relevance_blocked is true only if filtered jobs exist for the company and some fail relevance.pass.",
    ],
  };

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(summary, null, 2), "utf8");
  console.log(JSON.stringify(summary, null, 2));
  return summary;
}

const invokedDirectly =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (invokedDirectly) {
  recoveryLiveVerificationMain().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
