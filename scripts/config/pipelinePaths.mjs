/**
 * Single source of truth for repo-root-relative paths used by extraction, pipeline,
 * ingestion, and ops scripts. Join with the project root, e.g.:
 *   path.join(process.cwd(), PATHS.extractedJobsRaw)
 *
 * Paths stay flat (no folder moves) so CI `paths:` filters and docs remain valid.
 */

/** @type {const} */
export const PATHS = {
  // --- Daily / site ops (snapshots & checks) ---
  /** Active jobs snapshot for SEO validation and ops. */
  jobsMaster: "data/jobs-master.json",
  /** Minimal activeJobs baseline from ops-health-check for day-over-day drop alerts. */
  opsHealth: "data/ops-health.json",
  /** Live SEO validation output. */
  seoValidation: "data/seo-validation.json",

  // --- Resolver & routing ---
  /** Curated company input for career resolver. */
  companiesMaster: "data/companies_master.csv",
  /** Resolver output (career URLs, status). */
  careerSourceRegistry: "data/career_source_registry.csv",
  /** Extractor choice + ready flags from registry. */
  sourceRoutingTable: "data/source_routing_table.csv",
  /** Rows flagged for human review (export from registry). */
  manualReviewQueue: "data/manual_review_queue.csv",

  // --- Job extraction chain (large JSON) ---
  /** ATS API extraction output. */
  extractedJobsRaw: "data/extracted_jobs_raw.json",
  /** HTML scraper extraction output. */
  extractedJobsHtmlRaw: "data/extracted_jobs_html_raw.json",
  /** Pre-dedupe merge of ATS + HTML raw (inspect / debug). */
  combinedRawJobs: "data/combined_raw_jobs.json",
  /** Deduped + QA merged list (input to filter). */
  extractedJobsClean: "data/extracted_jobs_clean.json",
  /** Title relevance filter output. */
  extractedJobsFiltered: "data/extracted_jobs_filtered.json",
  /** Normalized rows for DB / deploy publish. */
  jobsDbReady: "data/jobs_db_ready.json",

  // --- Stage summaries (small JSON, overwritten each run) ---
  summaryExtractHtml: "data/summary_extract_html.json",
  summaryFilterJobs: "data/summary_filter_jobs.json",
  summaryPrepareDb: "data/summary_prepare_db.json",

  // --- Pipeline analysis & reports ---
  pipelineAnalysisReport: "data/pipeline_analysis_report.json",
  fullPipelineDecisionReport: "data/full_pipeline_decision_report.json",
  resolverSummaryReport: "data/resolver_summary_report.json",
  /**
   * Canonical pipeline deploy report (latest-only; written by pipeline-deploy.mjs).
   * A sibling data/pipeline_deploy_report.json (without .latest) is not written by that script.
   */
  pipelineDeployReportLatest: "data/pipeline_deploy_report.latest.json",

  // --- Supabase manual import & seed SQL exports ---
  supabaseImportDir: "data/supabase_import",
  supabaseImportCompanyListCsv: "data/supabase_import/company_list.csv",
  supabaseImportPipelineJobsCsv: "data/supabase_import/pipeline_extracted_jobs.csv",
  supabaseSeedPartsDir: "data/supabase_seed_parts",
  supabasePipelineSeedSql: "data/supabase_pipeline_seed.sql",

  // --- Repo root (not under data/) ---
  /** Legacy daily-sync source list. */
  sourcesCsv: "sources.csv",

  // --- Ingestion bridge (data/ingestion/) ---
  /** Promoted / identity rows for ingestion tooling. */
  productionSourceRegistry: "data/ingestion/production_source_registry.csv",
  /** Rolling operational metrics keyed by company_key. */
  sourceOperationalState: "data/ingestion/source_operational_state.csv",
  /** Timestamped copies of sources.csv before ATS merge (live runs). */
  ingestionSourcesBackups: "data/ingestion/backups",
  /** Merged export compatible with sources.csv shape. */
  sourcesGenerated: "data/ingestion/sources.generated.csv",
  /** Suppression / veto list for discovery. */
  sourceVetoRegistry: "data/ingestion/source_veto_registry.csv",
  /** Discovery candidate rows. */
  discoveryCandidates: "data/ingestion/discovery_candidates.csv",

  /** ATS Serp discovery (config + state + run outputs). */
  atsSerpDiscoveryConfig: "scripts/config/atsSerpDiscovery.config.json",
  atsSerpQueryLog: "data/ingestion/ats_serp_query_log.json",
  atsSerpSeenSet: "data/ingestion/ats_serp_seen.json",
  discoveryPositiveHits: "data/ingestion/discovery_positive_hits.json",
  discoveryRejects: "data/ingestion/discovery_rejects.json",
  atsSerpDiscoverySummary: "data/ingestion/ats_serp_discovery_summary.json",
  atsSerpDiscoveryAppendLog: "data/ingestion/ats_serp_discovery_append.log",
  auditReportLatest: "data/ingestion/audit_report.latest.json",
  discoveryValidationReportLatest: "data/ingestion/discovery_validation_report.latest.json",
  exportSourcesReportLatest: "data/ingestion/export_sources_report.latest.json",
  importOperationalReportLatest: "data/ingestion/import_operational_report.latest.json",
  migrationReportLatest: "data/ingestion/migration_report.latest.json",
  approvedSourcesMasterCsv: "data/ingestion/approved_sources_master.csv",
  approvedSourcesMasterReportLatest:
    "data/ingestion/approved_sources_master_report.latest.json",

  /** Manual HTML recovery queue (operator input). */
  htmlSourceRecoveryQueue: "data/ingestion/html_source_recovery_queue.csv",
  /** Staging registry snippet for recovery HTML extraction (not production registry). */
  htmlRecoveryStagingRegistry: "data/ingestion/staging/html_recovery_production_registry.csv",
  /** Staging routing snippet aligned with source_routing_table shape. */
  htmlRecoveryStagingRouting: "data/ingestion/staging/html_recovery_routing_table.csv",
  /** Recovery-mode HTML extract output (does not overwrite extracted_jobs_html_raw.json). */
  htmlRecoveryExtractedJobsRaw: "data/html_recovery_extracted_jobs_raw.json",
  summaryExtractHtmlRecovery: "data/summary_extract_html_recovery.json",
  /** Per-company recovery extraction results. */
  htmlRecoveryExtractionResultsCsv: "data/html_recovery_extraction_results.csv",
  htmlRecoveryExtractionSummaryJson: "data/html_recovery_extraction_summary.json",
  /** Derived lifecycle / last-run state (source queue file is not overwritten). */
  htmlRecoveryQueueRunState: "data/ingestion/html_recovery_queue_run_state.csv",

  /** Pre-production HTML promotion layer (from recovery extraction results). */
  htmlRecoveryPromotableSources: "data/ingestion/html_recovery_promotable_sources.csv",
  /** Staging-only registry rows for HTML sources validated by recovery pipeline (not merged to production). */
  htmlPromotedRegistryStaging: "data/ingestion/staging/html_promoted_registry.csv",
  /** Staging-only routing rows aligned with source_routing_table (not merged to live routing). */
  htmlPromotedRoutingStaging: "data/ingestion/staging/html_promoted_routing.csv",
  /** Validation counts and per-company reasons before any production merge. */
  htmlPromotionValidationSummary: "data/html_promotion_validation_summary.json",

  /** Controlled merge of manual ATS recovery → repo-root sources.csv. */
  manualRecoverySourcesMergeSummary: "data/manual_recovery_sources_merge_summary.json",
  manualRecoverySourcesMergeReport: "data/manual_recovery_sources_merge_report.csv",
  /** Controlled merge of HTML recovery staging → production registry + routing. */
  htmlRecoveryRegistryMergeSummary: "data/html_recovery_registry_merge_summary.json",
  htmlRecoveryRegistryMergeReport: "data/html_recovery_registry_merge_report.csv",
  /** Post-merge ingestion verification (ATS + HTML recovery). */
  recoveryLiveVerificationSummary: "data/recovery_live_verification_summary.json",
};
