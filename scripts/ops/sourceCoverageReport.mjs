#!/usr/bin/env node
/**
 * Source coverage & recovery-oriented report (read-only).
 * Reads repo-root sources.csv, source_performance.csv (optional), ingestion registry (optional),
 * manual_source_recovery.csv (optional), and optionally aggregates active job counts from Supabase.
 *
 * Outputs:
 *   data/source_coverage_report.json
 *   data/source_coverage_report.csv
 *
 * Env (optional for DB counts):
 *   SUPABASE_URL — defaults NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY — preferred for accurate counts; else anon keys (may hit RLS)
 */
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import { createClient } from "@supabase/supabase-js";

import { PATHS } from "../config/pipelinePaths.mjs";
import {
  classifyProviderIngestionTier,
  deriveSyntheticCareersUrl,
} from "../lib/sourceClassification.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..", "..");

/** @typedef {import("../lib/sourceClassification.mjs").classifyProviderIngestionTier} _ */

/**
 * @typedef {"no_source" | "source_configured_supported_ats" | "source_configured_offline_only_ats" | "source_configured_unknown_provider" | "source_configured_html_only" | "source_fetch_failed" | "source_returned_jobs_all_old" | "source_returned_jobs_all_irrelevant" | "source_returned_zero_listings" | "active_jobs_present" | "needs_manual_review"} PrimaryState
 */

const OUT_JSON = path.join(REPO_ROOT, "data", "source_coverage_report.json");
const OUT_CSV = path.join(REPO_ROOT, "data", "source_coverage_report.csv");
const MANUAL_RECOVERY = path.join(REPO_ROOT, "data", "ingestion", "manual_source_recovery.csv");

const CSV_COLUMNS = [
  "company_name",
  "primary_state",
  "confidence",
  "reason",
  "provider",
  "slug",
  "source_url",
  "tracked_in_sources_csv",
  "source_status",
  "bucket_last_run",
  "role_count_active",
  "jobs_listed",
  "jobs_relevant",
  "jobs_inserted",
  "jobs_skipped_old",
  "jobs_skipped_irrelevant",
  "fetch_failed",
  "registry_source_kind",
  "recommended_next_action",
  "source_files_used",
];

/**
 * @param {string} p
 * @returns {Promise<Record<string, string>[]>}
 */
async function parseCsvSafe(p) {
  const raw = await fs.readFile(p, "utf8");
  return parse(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    bom: true,
  });
}

/**
 * @param {string} p
 * @returns {Promise<Record<string, string>[] | null>}
 */
async function tryParseCsv(p) {
  try {
    return await parseCsvSafe(p);
  } catch (e) {
    return null;
  }
}

function normKey(provider, slug, company) {
  return `${String(provider || "").toLowerCase()}|${String(slug || "").trim()}|${String(company || "").trim()}`.toLowerCase();
}

/**
 * @param {Record<string, string>[]} rows
 */
function indexPerformance(rows) {
  /** @type {Map<string, Record<string, string>>} */
  const m = new Map();
  for (const r of rows) {
    const k = normKey(r.provider, r.slug, r.company);
    m.set(k, r);
  }
  return m;
}

/**
 * Load sources.csv rows the same way scripts/daily-sync.js conceptually does (approved/auto + required fields).
 * @param {Record<string, string>[]} rows
 */
function filterEligibleSources(rows) {
  return rows.filter((row) => {
    const provider = (row.ats || row.provider || "").trim().toLowerCase();
    const slug = (row.slug || "").trim();
    const company = (row.company_name || row.company || "").trim();
    const status = (row.status || "").trim().toLowerCase();
    if (!provider || !slug || !company) return false;
    if (status !== "approved" && status !== "auto") return false;
    return true;
  });
}

/**
 * @returns {Promise<{ map: Map<string, number> | null, error: string | null, warning: string | null }>}
 */
async function loadActiveJobCountsByCompany() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "";
  if (!url || !key) {
    return {
      map: null,
      error: null,
      warning: "supabase_counts_skipped_missing_env",
    };
  }
  const supabase = createClient(url, key);
  /** @type {Map<string, number>} */
  const map = new Map();
  const pageSize = 1000;
  let from = 0;
  let totalRead = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("jobs")
      .select("company")
      .eq("is_active", true)
      .range(from, from + pageSize - 1);

    if (error) {
      return {
        map: null,
        error: `supabase_error:${error.message}`,
        warning: null,
      };
    }
    const chunk = Array.isArray(data) ? data : [];
    if (chunk.length === 0) break;
    for (const row of chunk) {
      const c = String(row?.company || "").trim();
      if (!c) continue;
      map.set(c, (map.get(c) || 0) + 1);
    }
    totalRead += chunk.length;
    if (chunk.length < pageSize) break;
    from += pageSize;
    if (totalRead > 200000) {
      return {
        map: null,
        error: "supabase_abort_too_many_rows",
        warning: null,
      };
    }
  }
  return { map, error: null, warning: null };
}

/**
 * @param {number | string | undefined} v
 */
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * @param {boolean | string | undefined} v
 */
function boolish(v) {
  if (v === true) return true;
  const s = String(v || "").trim().toLowerCase();
  return s === "true" || s === "1";
}

/**
 * roleCountKnown: when false, Supabase was not queried (skip DB vs performance mismatch signals).
 * @param {{
 *   provider: string,
 *   slug: string,
 *   company_name: string,
 *   source_status: string,
 *   perf: Record<string, string> | null | undefined,
 *   roleCount: number | null,
 *   roleCountKnown: boolean,
 *   registryRow: Record<string, string> | null | undefined,
 *   trackedInSources: boolean,
 *   sourceFilesUsed: string[],
 * }} input
 */
function classifyCompany(input) {
  const {
    provider,
    slug,
    company_name,
    source_status,
    perf,
    roleCount,
    roleCountKnown,
    registryRow,
    trackedInSources,
    sourceFilesUsed,
  } = input;

  const sourceUrl = deriveSyntheticCareersUrl(provider, slug);
  const regKind = String(registryRow?.source_kind || "").trim().toLowerCase();

  /** @type {PrimaryState} */
  let primary_state = /** @type {PrimaryState} */ ("needs_manual_review");
  /** @type {"high" | "medium" | "low"} */
  let confidence = "medium";
  /** @type {string[]} */
  const reasons = [];
  /** @type {string} */
  let recommended_next_action = "manual_review";

  const tier = classifyProviderIngestionTier(provider);

  if (!trackedInSources) {
    const reason = "not_present_in_eligible_sources_csv_rows";
    return {
      company_name,
      primary_state: "no_source",
      confidence: "high",
      reason,
      provider,
      slug,
      source_url: sourceUrl,
      tracked_in_sources_csv: "false",
      source_status,
      bucket_last_run: perf ? String(perf.bucket_last_run || "") : "",
      role_count_active:
        roleCountKnown && roleCount != null ? String(roleCount) : "",
      jobs_listed: perf ? String(num(perf.jobs_listed)) : "",
      jobs_relevant: perf ? String(num(perf.jobs_relevant)) : "",
      jobs_inserted: perf ? String(num(perf.jobs_inserted)) : "",
      jobs_skipped_old: perf ? String(num(perf.jobs_skipped_old)) : "",
      jobs_skipped_irrelevant: perf ? String(num(perf.jobs_skipped_irrelevant)) : "",
      fetch_failed: perf ? String(boolish(perf.fetch_failed)) : "",
      registry_source_kind: regKind,
      recommended_next_action: "promote_to_sources",
      source_files_used: sourceFilesUsed.join("+"),
    };
  }

  if (regKind.includes("html")) {
    reasons.push("registry_source_kind_indicates_html");
    return {
      company_name,
      primary_state: "source_configured_html_only",
      confidence: "high",
      reason: reasons.join("; "),
      provider,
      slug,
      source_url: sourceUrl,
      tracked_in_sources_csv: "true",
      source_status,
      bucket_last_run: perf ? String(perf.bucket_last_run || "") : "",
      role_count_active:
        roleCountKnown && roleCount != null ? String(roleCount) : "",
      jobs_listed: perf ? String(num(perf.jobs_listed)) : "",
      jobs_relevant: perf ? String(num(perf.jobs_relevant)) : "",
      jobs_inserted: perf ? String(num(perf.jobs_inserted)) : "",
      jobs_skipped_old: perf ? String(num(perf.jobs_skipped_old)) : "",
      jobs_skipped_irrelevant: perf ? String(num(perf.jobs_skipped_irrelevant)) : "",
      fetch_failed: perf ? String(boolish(perf.fetch_failed)) : "",
      registry_source_kind: regKind,
      recommended_next_action: "route_to_html_queue",
      source_files_used: sourceFilesUsed.join("+"),
    };
  }

  if (roleCountKnown && roleCount != null && roleCount > 0) {
    reasons.push(`active_jobs_in_supabase_count_${roleCount}`);
    return {
      company_name,
      primary_state: "active_jobs_present",
      confidence: "high",
      reason: reasons.join("; "),
      provider,
      slug,
      source_url: sourceUrl,
      tracked_in_sources_csv: "true",
      source_status,
      bucket_last_run: perf ? String(perf.bucket_last_run || "") : "",
      role_count_active: roleCountKnown ? String(roleCount) : "",
      jobs_listed: perf ? String(num(perf.jobs_listed)) : "",
      jobs_relevant: perf ? String(num(perf.jobs_relevant)) : "",
      jobs_inserted: perf ? String(num(perf.jobs_inserted)) : "",
      jobs_skipped_old: perf ? String(num(perf.jobs_skipped_old)) : "",
      jobs_skipped_irrelevant: perf ? String(num(perf.jobs_skipped_irrelevant)) : "",
      fetch_failed: perf ? String(boolish(perf.fetch_failed)) : "",
      registry_source_kind: regKind,
      recommended_next_action: "none",
      source_files_used: sourceFilesUsed.join("+"),
    };
  }

  if (!perf) {
    reasons.push("no_matching_source_performance_row");
    recommended_next_action = "investigate_slug";
    confidence = "low";
    if (tier === "daily_sync") {
      primary_state = "source_configured_supported_ats";
      reasons.push("eligible_ats_but_no_performance_row");
      confidence = "low";
    } else if (tier === "offline_only") {
      primary_state = "source_configured_offline_only_ats";
    } else if (tier === "unknown") {
      primary_state = "source_configured_unknown_provider";
    }
    return {
      company_name,
      primary_state,
      confidence,
      reason: reasons.join("; "),
      provider,
      slug,
      source_url: sourceUrl,
      tracked_in_sources_csv: "true",
      source_status,
      bucket_last_run: "",
      role_count_active:
        roleCountKnown && roleCount != null ? String(roleCount) : "",
      jobs_listed: "",
      jobs_relevant: "",
      jobs_inserted: "",
      jobs_skipped_old: "",
      jobs_skipped_irrelevant: "",
      fetch_failed: "",
      registry_source_kind: regKind,
      recommended_next_action,
      source_files_used: sourceFilesUsed.join("+"),
    };
  }

  const listed = num(perf.jobs_listed);
  const relevant = num(perf.jobs_relevant);
  const inserted = num(perf.jobs_inserted);
  const updated = num(perf.jobs_updated);
  const old = num(perf.jobs_skipped_old);
  const irrelevant = num(perf.jobs_skipped_irrelevant);
  const fetchFailed = boolish(perf.fetch_failed);
  const isEmpty = boolish(perf.is_empty);

  if (fetchFailed) {
    primary_state = "source_fetch_failed";
    confidence = "high";
    reasons.push("source_performance_fetch_failed_true");
    recommended_next_action = "investigate_slug";
  } else if (listed === 0 || isEmpty) {
    primary_state = "source_returned_zero_listings";
    confidence = "high";
    reasons.push("listed_zero_or_is_empty_flag");
    recommended_next_action = "investigate_slug";
  } else if (
    relevant === 0 &&
    inserted === 0 &&
    updated === 0 &&
    old > 0 &&
    irrelevant > 0
  ) {
    primary_state = "needs_manual_review";
    confidence = "medium";
    reasons.push("mixed_age_and_relevance_exclusion");
    recommended_next_action = "review_filter_policy";
  } else if (
    relevant === 0 &&
    inserted === 0 &&
    updated === 0 &&
    old > 0 &&
    irrelevant === 0
  ) {
    primary_state = "source_returned_jobs_all_old";
    confidence = "high";
    reasons.push("all_listed_jobs_skipped_as_old_by_sync_policy");
    recommended_next_action = "review_filter_policy";
  } else if (
    relevant === 0 &&
    inserted === 0 &&
    updated === 0 &&
    irrelevant > 0 &&
    old === 0
  ) {
    primary_state = "source_returned_jobs_all_irrelevant";
    confidence = "high";
    reasons.push("all_listed_jobs_marked_irrelevant_by_filter");
    recommended_next_action = "review_filter_policy";
  } else if (
    roleCountKnown &&
    (roleCount == null || roleCount === 0) &&
    listed > 0 &&
    (relevant > 0 || inserted > 0 || updated > 0)
  ) {
    primary_state = "needs_manual_review";
    confidence = "low";
    reasons.push("performance_shows_relevant_or_inserts_but_zero_active_jobs_in_db");
    recommended_next_action = "manual_review";
  } else if (tier === "daily_sync") {
    primary_state = "source_configured_supported_ats";
    confidence = "medium";
    reasons.push("daily_sync_ats_with_no_exception_signal_in_report_rules");
    recommended_next_action = "none";
  } else if (tier === "offline_only") {
    primary_state = "source_configured_offline_only_ats";
    confidence = "medium";
    reasons.push("provider_not_in_daily_sync_but_has_offline_extractor");
    recommended_next_action = "add_daily_sync_support";
  } else {
    primary_state = "source_configured_unknown_provider";
    confidence = "high";
    reasons.push("provider_not_recognized_as_supported_or_offline_tooling");
    recommended_next_action = "add_daily_sync_support";
  }

  if (
    tier === "daily_sync" &&
    [
      "source_returned_zero_listings",
      "source_fetch_failed",
      "source_returned_jobs_all_old",
      "source_returned_jobs_all_irrelevant",
    ].includes(primary_state)
  ) {
    reasons.push("underlying_ats_supported_by_daily_sync");
  }

  const reason = [...new Set(reasons)].join("; ") || "unspecified";

  return {
    company_name,
    primary_state,
    confidence,
    reason,
    provider,
    slug,
    source_url: sourceUrl,
    tracked_in_sources_csv: "true",
    source_status,
    bucket_last_run: String(perf.bucket_last_run || ""),
    role_count_active:
      roleCountKnown && roleCount != null ? String(roleCount) : "",
    jobs_listed: String(listed),
    jobs_relevant: String(relevant),
    jobs_inserted: String(inserted),
    jobs_skipped_old: String(old),
    jobs_skipped_irrelevant: String(irrelevant),
    fetch_failed: String(fetchFailed),
    registry_source_kind: regKind,
    recommended_next_action,
    source_files_used: sourceFilesUsed.join("+"),
  };
}

async function main() {
  const sourcesPath = path.join(REPO_ROOT, PATHS.sourcesCsv);
  const perfPath = path.join(REPO_ROOT, "source_performance.csv");
  const registryPath = path.join(REPO_ROOT, PATHS.productionSourceRegistry);

  const warnings = [];

  const sourcesRows = await tryParseCsv(sourcesPath);
  if (!sourcesRows) {
    console.error(
      JSON.stringify({ ok: false, error: "missing_sources_csv", path: sourcesPath }, null, 2)
    );
    process.exit(1);
  }

  const perfRows = await tryParseCsv(perfPath);
  if (!perfRows) {
    warnings.push("source_performance_csv_missing_or_unreadable");
  }
  const perfByKey = perfRows ? indexPerformance(perfRows) : new Map();

  const registryRows = await tryParseCsv(registryPath);
  if (!registryRows) {
    warnings.push("production_source_registry_missing_or_unreadable");
  }
  /** @type {Map<string, Record<string, string>>} */
  const registryByLegacyKey = new Map();
  if (registryRows) {
    for (const r of registryRows) {
      const ck = String(r.company_key || "").trim();
      if (ck) registryByLegacyKey.set(ck, r);
    }
  }

  const { map: activeByCompany, error: supabaseError, warning: supabaseWarn } =
    await loadActiveJobCountsByCompany();
  if (supabaseError) {
    warnings.push(supabaseError);
  }
  if (supabaseWarn) {
    warnings.push(supabaseWarn);
  }

  const eligible = filterEligibleSources(sourcesRows);
  /** @type {Record<string, unknown>[]} */
  const companies = [];

  let missingPerfCount = 0;

  for (const row of eligible) {
    const provider = (row.ats || row.provider || "").trim().toLowerCase();
    const slug = (row.slug || "").trim();
    const company_name = (row.company_name || row.company || "").trim();
    const source_status = (row.status || "").trim();
    const legacyKey = `legacy__${provider}__${slug}`;
    const regRow = registryByLegacyKey.get(legacyKey) || null;
    const k = normKey(provider, slug, company_name);
    const perf = perfByKey.get(k) || null;
    if (!perf && perfRows) missingPerfCount += 1;

    const roleCountKnown = Boolean(activeByCompany);
    const roleCount =
      activeByCompany && company_name
        ? activeByCompany.get(company_name) ?? 0
        : null;

    const classified = classifyCompany({
      provider,
      slug,
      company_name,
      source_status,
      perf,
      roleCount,
      roleCountKnown,
      registryRow: regRow,
      trackedInSources: true,
      sourceFilesUsed: [
        path.relative(REPO_ROOT, sourcesPath),
        perfRows ? path.relative(REPO_ROOT, perfPath) : "",
        registryRows ? path.relative(REPO_ROOT, registryPath) : "",
      ].filter(Boolean),
    });

    companies.push(classified);
  }

  if (missingPerfCount > 0) {
    warnings.push(`source_performance_rows_missing_for_${missingPerfCount}_sources_csv_companies`);
  }

  const manualRows = await tryParseCsv(MANUAL_RECOVERY);
  if (!manualRows) {
    warnings.push("manual_source_recovery_csv_missing_or_empty_optional");
  } else {
    const sourceNames = new Set(eligible.map((r) => String(r.company_name || r.company || "").trim()));
    for (const m of manualRows) {
      const company_name = String(m.company_name || "").trim();
      if (!company_name) {
        warnings.push("manual_recovery_row_skipped_empty_company_name");
        continue;
      }
      if (sourceNames.has(company_name)) continue;

      const st = String(m.status || "queued").trim().toLowerCase();
      companies.push({
        company_name,
        primary_state: "no_source",
        confidence: "high",
        reason: "manual_recovery_queue_company_not_in_sources_csv",
        provider: "",
        slug: "",
        source_url: String(m.careers_url || "").trim(),
        tracked_in_sources_csv: "false",
        source_status: st,
        bucket_last_run: "",
        role_count_active:
          activeByCompany && activeByCompany.has(company_name)
            ? String(activeByCompany.get(company_name) ?? 0)
            : "",
        jobs_listed: "",
        jobs_relevant: "",
        jobs_inserted: "",
        jobs_skipped_old: "",
        jobs_skipped_irrelevant: "",
        fetch_failed: "",
        registry_source_kind: "",
        recommended_next_action: "promote_to_sources",
        source_files_used: path.relative(REPO_ROOT, MANUAL_RECOVERY),
      });
    }
  }

  const summary = {
    generated_at: new Date().toISOString(),
    total_companies_reported: companies.length,
    by_primary_state: {},
    warnings,
    inputs: {
      sources_csv: path.relative(REPO_ROOT, sourcesPath),
      source_performance_csv: perfRows ? path.relative(REPO_ROOT, perfPath) : null,
      production_registry_csv: registryRows ? path.relative(REPO_ROOT, registryPath) : null,
      manual_recovery_csv: manualRows ? path.relative(REPO_ROOT, MANUAL_RECOVERY) : null,
      supabase_active_counts: activeByCompany ? "loaded" : "not_loaded",
    },
  };

  for (const c of companies) {
    const k = String(c.primary_state);
    summary.by_primary_state[k] = (summary.by_primary_state[k] || 0) + 1;
  }

  const report = {
    ok: true,
    ...summary,
    companies,
  };

  await fs.mkdir(path.dirname(OUT_JSON), { recursive: true });
  await fs.writeFile(OUT_JSON, JSON.stringify(report, null, 2), "utf8");

  const csvBody = companies.map((row) => {
    const o = /** @type {Record<string, string>} */ ({});
    for (const col of CSV_COLUMNS) {
      o[col] = row[col] != null ? String(row[col]) : "";
    }
    return o;
  });
  const csv = stringify(csvBody, {
    header: true,
    columns: CSV_COLUMNS,
    quoted_string: true,
  });
  await fs.writeFile(OUT_CSV, "\uFEFF" + csv, "utf8");

  console.log(
    JSON.stringify(
      {
        ok: true,
        wrote_json: path.relative(REPO_ROOT, OUT_JSON),
        wrote_csv: path.relative(REPO_ROOT, OUT_CSV),
        total: companies.length,
        by_primary_state: summary.by_primary_state,
        warnings,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
