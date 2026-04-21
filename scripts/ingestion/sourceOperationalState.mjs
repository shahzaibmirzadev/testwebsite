/**
 * Rolling metrics for production sources — keyed by company_key.
 * Curated identity lives in production_source_registry.csv only.
 */

/** @type {readonly string[]} */
export const OPERATIONAL_COLUMNS = [
  "company_key",
  // sources_status → sources.csv `status` (approved|auto) for legacy daily-sync export only; policy lives in registry.ingestion_status long-term.
  "sources_status",
  "last_checked_at",
  "last_successful_fetch_at",
  "last_fetch_error",
  "consecutive_failures",
  "jobs_last_run",
  "jobs_relevant_last_run",
  "jobs_inserted_last_run",
  "jobs_updated_last_run",
  "jobs_irrelevant_last_run",
  "jobs_partial_last_run",
  "jobs_old_last_run",
  "fetch_failed_last_run",
  "yield_last_run",
  "times_seen_empty",
  "times_failed",
  "scrape_tier",
  "scrape_every_runs",
  "bucket_last_run",
];

/** Defaults when no operational row exists (daily-sync-tolerant). */
export const DEFAULT_OPERATIONAL = {
  sources_status: "auto",
  last_checked_at: "",
  last_successful_fetch_at: "",
  last_fetch_error: "",
  consecutive_failures: "",
  jobs_last_run: "0",
  jobs_relevant_last_run: "0",
  jobs_inserted_last_run: "0",
  jobs_updated_last_run: "0",
  jobs_irrelevant_last_run: "0",
  jobs_partial_last_run: "0",
  jobs_old_last_run: "0",
  fetch_failed_last_run: "false",
  yield_last_run: "0.000",
  times_seen_empty: "0",
  times_failed: "0",
  scrape_tier: "low",
  scrape_every_runs: "2",
  bucket_last_run: "",
};
