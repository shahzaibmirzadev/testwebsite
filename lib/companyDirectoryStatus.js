/**
 * User-facing company directory status derived from live job counts + source_performance.csv.
 * Does not change ingestion; UI mapping only.
 */

import fs from "fs/promises";
import path from "path";
import { parse } from "csv-parse/sync";

/** @typedef {'active_jobs' | 'tracked_source_no_active_jobs' | 'tracked_source_jobs_filtered' | 'source_needs_attention' | 'untracked_or_unknown'} CompanyDirectoryStatus */

export const COMPANY_DIRECTORY_STATUS = {
  ACTIVE_JOBS: "active_jobs",
  TRACKED_NO_ACTIVE_JOBS: "tracked_source_no_active_jobs",
  TRACKED_FILTERED: "tracked_source_jobs_filtered",
  NEEDS_ATTENTION: "source_needs_attention",
  UNTRACKED: "untracked_or_unknown",
};

const PERF_CACHE_KEY = "__companyDirectorySourcePerformanceCache";

/**
 * User-facing copy (compact; not pipeline jargon).
 * @type {Record<CompanyDirectoryStatus, { label: string, detail: string }>}
 */
export const COMPANY_DIRECTORY_STATUS_COPY = {
  active_jobs: {
    label: "Active roles available",
    detail: "Open roles are listed on the site.",
  },
  tracked_source_no_active_jobs: {
    label: "Source tracked, no current active roles",
    detail: "This employer is in our sourcing list; nothing is listed here yet.",
  },
  tracked_source_jobs_filtered: {
    label: "Source tracked, roles currently filtered",
    detail: "Roles were seen from the source but filtered by relevance or freshness rules.",
  },
  source_needs_attention: {
    label: "Source tracked, needs review",
    detail: "The latest fetch or listing check needs attention.",
  },
  untracked_or_unknown: {
    label: "Source status unknown",
    detail: "Not enough grounded data to classify.",
  },
};

/**
 * @returns {Promise<Map<string, Record<string, string>>>}
 */
export async function loadSourcePerformanceByKey() {
  const g = globalThis;
  /** @type {{ map: Map<string, Record<string, string>> | null, at: number }} */
  const cache = g[PERF_CACHE_KEY] || { map: null, at: 0 };
  g[PERF_CACHE_KEY] = cache;

  const ttl = Number(process.env.SOURCE_PERFORMANCE_CACHE_MS || 300000);
  const now = Date.now();
  if (cache.map && now - cache.at < ttl) {
    return cache.map;
  }

  const filePath = path.join(process.cwd(), "source_performance.csv");
  let raw;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch {
    cache.map = new Map();
    cache.at = now;
    return cache.map;
  }

  const rows = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    bom: true,
  });

  /** @type {Map<string, Record<string, string>>} */
  const map = new Map();
  for (const r of rows) {
    const provider = String(r.provider ?? "")
      .trim()
      .toLowerCase();
    const slug = String(r.slug ?? "").trim();
    if (!provider || !slug) continue;
    map.set(`${provider}|${slug.toLowerCase()}`, r);
  }

  cache.map = map;
  cache.at = now;
  return map;
}

/**
 * @param {object} args
 * @param {number} args.roleCount — active on-site roles (search universe)
 * @param {Record<string, string> | null | undefined} args.perf — matching source_performance row
 * @returns {CompanyDirectoryStatus}
 */
export function deriveCompanyDirectoryStatus({ roleCount, perf }) {
  if (Number(roleCount) > 0) {
    return COMPANY_DIRECTORY_STATUS.ACTIVE_JOBS;
  }

  if (!perf || typeof perf !== "object") {
    return COMPANY_DIRECTORY_STATUS.TRACKED_NO_ACTIVE_JOBS;
  }

  const fetchFailed =
    String(perf.fetch_failed ?? "").toLowerCase() === "true" ||
    perf.fetch_failed === true;
  const bucket = String(perf.bucket_last_run ?? "")
    .trim()
    .toLowerCase();
  const lastError = String(perf.last_error ?? "").trim();
  const timesFailed = Number(perf.times_failed ?? 0);
  const tier = String(perf.scrape_tier ?? "")
    .trim()
    .toLowerCase();
  const isEmpty = String(perf.is_empty ?? "").toLowerCase() === "true" || perf.is_empty === true;

  if (fetchFailed || bucket === "fetch_failed") {
    return COMPANY_DIRECTORY_STATUS.NEEDS_ATTENTION;
  }
  if (tier === "dead" && (lastError || timesFailed >= 2)) {
    return COMPANY_DIRECTORY_STATUS.NEEDS_ATTENTION;
  }
  if (lastError && (timesFailed >= 1 || bucket === "fetch_failed")) {
    return COMPANY_DIRECTORY_STATUS.NEEDS_ATTENTION;
  }

  const jobsListed = Number(perf.jobs_listed ?? 0);
  const skippedIrrel = Number(perf.jobs_skipped_irrelevant ?? 0);
  const skippedOld = Number(perf.jobs_skipped_old ?? 0);

  if (
    jobsListed > 0 &&
    (skippedIrrel > 0 ||
      skippedOld > 0 ||
      bucket === "irrelevant_only" ||
      bucket === "old_only")
  ) {
    return COMPANY_DIRECTORY_STATUS.TRACKED_FILTERED;
  }

  if (bucket === "irrelevant_only" || bucket === "old_only") {
    return COMPANY_DIRECTORY_STATUS.TRACKED_FILTERED;
  }

  if (isEmpty && timesFailed >= 3 && lastError) {
    return COMPANY_DIRECTORY_STATUS.NEEDS_ATTENTION;
  }

  return COMPANY_DIRECTORY_STATUS.TRACKED_NO_ACTIVE_JOBS;
}

/**
 * @param {CompanyDirectoryStatus} status
 */
export function getCompanyDirectoryStatusPresentation(status) {
  const copy = COMPANY_DIRECTORY_STATUS_COPY[status] || COMPANY_DIRECTORY_STATUS_COPY.untracked_or_unknown;
  return {
    company_status: status,
    status_label: copy.label,
    status_detail: copy.detail,
  };
}
