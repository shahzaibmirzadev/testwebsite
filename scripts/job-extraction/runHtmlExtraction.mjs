#!/usr/bin/env node
/**
 * HTML career pages: promoted html_custom rows in production_source_registry.csv,
 * joined with source_routing_table.csv for careers URLs / metadata → data/extracted_jobs_html_raw.json.
 * Does not modify ATS extraction.
 *
 * Production selector: registry only (ingestion_status=promoted, source_kind=html_custom).
 * Routing table is not a source selector; it supplies careers_url_final / candidate / homepage when present.
 *
 * Env (optional):
 *   HTML_EXTRACT_MAX_COMPANIES=n   — process at most n rows (after optional priority sort)
 *   HTML_EXTRACT_COMPANY_KEY=key   — only this company_key
 *   HTML_EXTRACT_VALIDATION_FROM_ROUTING=1 — validateHtmlCandidate only: use routing row for key (not registry)
 *   EXTRACT_ROUTING_PRIORITY_SORT=1 — sort targets by extractor_priority (high→low) then company_key
 *   HTML_MAX_MS_PER_COMPANY, HTML_MAX_CANDIDATE_LINKS, HTML_FETCH_DELAY_MS — limits/delays (see htmlExtractor/constants.mjs)
 *   HTML_DETAIL_EARLY_STOP_CONSECUTIVE — stop detail loop after N consecutive bad attempts (0 = off)
 *   HTML_DETAIL_EARLY_STOP_INCLUDE_FETCH_FAIL — 1/0, count fetch failures toward streak (default 1)
 *
 * Recovery mode (optional; does not touch production registry files):
 *   HTML_EXTRACTION_RECOVERY_MODE=1 — use staging registry/routing from manual HTML recovery queue
 *     (run scripts/ingestion/buildHtmlRecoveryStaging.mjs first). Writes to PATHS.htmlRecoveryExtractedJobsRaw
 *     and PATHS.summaryExtractHtmlRecovery instead of the default HTML extract outputs.
 *   HTML_RECOVERY_REGISTRY_STAGING, HTML_RECOVERY_ROUTING_STAGING, HTML_RECOVERY_OUTPUT_JSON — overrides
 */
import fs from "fs/promises";
import path from "path";
import { pathToFileURL } from "url";
import { parse } from "csv-parse/sync";
import { load as loadHtml } from "cheerio";

import { fetchText } from "./http.mjs";
import { unifiedJob } from "./atsHandlers/unified.mjs";
import { writeStageSummary } from "./loggingUtils.mjs";
import { pickCareersUrl } from "./htmlExtractor/resolveCareersUrl.mjs";
import { analyzePageSignals } from "./htmlExtractor/jsHeuristics.mjs";
import { discoverJobLinks } from "./htmlExtractor/discoverJobLinks.mjs";
import { extractJobsFromListingCards } from "./htmlExtractor/extractListingJobs.mjs";
import { extractJobFromHtml } from "./htmlExtractor/extractJobPage.mjs";
import { normalizeUrlForDedupe } from "./htmlExtractor/urlNormalize.mjs";
import {
  FETCH_DELAY_MS,
  HTML_FETCH_MAX_ATTEMPTS,
  HTML_MAX_CANDIDATE_LINKS,
  HTML_MAX_LISTING_CARD_JOBS,
  HTML_MAX_MS_PER_COMPANY,
  HTML_REQUEST_TIMEOUT_MS,
  HTML_RETRY_DELAY_MS,
  parseHtmlDetailEarlyStopConsecutive,
  parseHtmlDetailEarlyStopIncludeFetchFail,
} from "./htmlExtractor/constants.mjs";
import { PATHS } from "../config/pipelinePaths.mjs";
import { isApprovedProductionHtmlRegistryRow } from "../ingestion/isApprovedProductionAtsRegistryRow.mjs";

const REPO = process.cwd();

function isRecoveryExtractionMode() {
  return /^1|true|yes$/i.test(
    String(process.env.HTML_EXTRACTION_RECOVERY_MODE || "").trim()
  );
}

function getExtractionPaths() {
  if (isRecoveryExtractionMode()) {
    return {
      registry: path.join(
        REPO,
        process.env.HTML_RECOVERY_REGISTRY_STAGING ||
          PATHS.htmlRecoveryStagingRegistry
      ),
      routing: path.join(
        REPO,
        process.env.HTML_RECOVERY_ROUTING_STAGING ||
          PATHS.htmlRecoveryStagingRouting
      ),
      output: path.join(
        REPO,
        process.env.HTML_RECOVERY_OUTPUT_JSON || PATHS.htmlRecoveryExtractedJobsRaw
      ),
      summaryRelative:
        process.env.HTML_RECOVERY_SUMMARY_RELATIVE ||
        PATHS.summaryExtractHtmlRecovery,
      sourceLabel: "html_recovery_staging",
    };
  }
  return {
    registry: path.join(REPO, PATHS.productionSourceRegistry),
    routing: path.join(REPO, PATHS.sourceRoutingTable),
    output: path.join(REPO, PATHS.extractedJobsHtmlRaw),
    summaryRelative: PATHS.summaryExtractHtml,
    sourceLabel: "registry_html_custom",
  };
}

function envValidationFromRouting() {
  return /^1|true|yes$/i.test(
    String(process.env.HTML_EXTRACT_VALIDATION_FROM_ROUTING || "").trim()
  );
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function logEv(payload) {
  console.log(JSON.stringify({ phase: "html_extract", ...payload }));
}

/**
 * @param {Record<string, unknown>} args
 */
function classifyZeroYieldReason(args) {
  const {
    jobCount,
    linksLength,
    signals,
    detailAttempts,
    detailExtracted,
    listingFallbackAttempted,
    timeBudgetHit,
    earlyStopTriggered,
  } = args;

  if (jobCount > 0) {
    return { category: "ok", detail: "has_jobs" };
  }
  if (timeBudgetHit) {
    return { category: "time_budget", detail: "partial_or_none" };
  }
  if (earlyStopTriggered) {
    return { category: "early_stop", detail: "consecutive_bad_details" };
  }
  if (signals.suspectedJsHeavy) {
    return { category: "suspected_js", detail: "heuristic_blocked" };
  }
  if (signals.emptyOrThin) {
    return { category: "listing_thin_or_empty", detail: "low_text_or_no_links" };
  }
  if (linksLength > 0 && detailAttempts > 0 && detailExtracted === 0) {
    return {
      category: "all_detail_extractions_failed_or_empty",
      detail: "detail_pages_no_title_or_description",
    };
  }
  if (linksLength === 0 && signals.textLen > 550 && !listingFallbackAttempted) {
    return { category: "no_candidate_links", detail: "no_scored_links" };
  }
  if (listingFallbackAttempted && jobCount === 0) {
    return {
      category: "listing_single_page_miss",
      detail: "extractJobFromHtml_no_fields",
    };
  }
  return {
    category: "no_job_patterns",
    detail: "no_cards_links_or_fallback",
  };
}

/**
 * @param {Record<string, string>[]} routingRows
 * @returns {Map<string, Record<string, string>>}
 */
function indexRoutingByCompanyKey(routingRows) {
  /** @type {Map<string, Record<string, string>>} */
  const m = new Map();
  for (const r of routingRows) {
    const k = String(r.company_key ?? "").trim();
    if (k) m.set(k, r);
  }
  return m;
}

/**
 * @param {Record<string, string>} regRow
 * @param {Record<string, string> | undefined} routingRow
 */
function mergeRegistryHtmlWithRouting(regRow, routingRow) {
  const r = routingRow ? { ...routingRow } : {};
  const careersFromReg = String(regRow.careers_url_canonical ?? "").trim();
  const listing =
    pickCareersUrl(r) || careersFromReg;
  return {
    ...r,
    company_key: String(regRow.company_key ?? "").trim(),
    company_name: String(r.company_name ?? regRow.company_name ?? "").trim(),
    careers_url_final: listing,
    careers_url_candidate: String(r.careers_url_candidate ?? "").trim(),
    homepage_url: String(r.homepage_url ?? "").trim(),
    final_source_type: String(r.final_source_type ?? "").trim() || "html_static",
    extractor_type: "html_scraper",
    ready_for_extraction: "true",
    extractor_priority: String(r.extractor_priority ?? "").trim() || "medium",
  };
}

/**
 * @param {Record<string, unknown>} job
 * @param {Record<string, string>} row
 */
function withRoutingMeta(job, row) {
  return {
    ...job,
    company_key: row.company_key || "",
    routing_final_source_type: (row.final_source_type || "").trim(),
    careers_url_final: (row.careers_url_final || "").trim(),
  };
}

function parseEnvLimit() {
  const raw = String(process.env.HTML_EXTRACT_MAX_COMPANIES || "").trim();
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseEnvCompanyKey() {
  const k = String(process.env.HTML_EXTRACT_COMPANY_KEY || "").trim();
  return k || null;
}

/** @type {Record<string, number>} */
const PRIORITY_RANK = { high: 0, medium: 1, low: 2, none: 3 };

/**
 * @param {string | undefined} p
 */
function priorityRank(p) {
  const k = String(p ?? "").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(PRIORITY_RANK, k)
    ? PRIORITY_RANK[/** @type {keyof typeof PRIORITY_RANK} */ (k)]
    : 4;
}

/**
 * @param {Record<string, string>} a
 * @param {Record<string, string>} b
 */
function compareRoutingPriority(a, b) {
  const pr = priorityRank(a.extractor_priority) - priorityRank(b.extractor_priority);
  if (pr !== 0) return pr;
  return String(a.company_key || "").localeCompare(String(b.company_key || ""));
}

function parseEnvRoutingPrioritySort() {
  return /^1|true|yes$/i.test(
    String(process.env.EXTRACT_ROUTING_PRIORITY_SORT || "").trim()
  );
}

/**
 * CI / sparse checkouts may omit `data/ingestion/production_source_registry.csv`.
 * Writes zero-output HTML artifacts only (no exit, no throw).
 *
 * @param {string} registryPath
 * @param {string} outputPath — absolute path to JSON output
 * @param {string} summaryRelative — repo-root-relative summary path
 */
async function writeOutputsForMissingRegistry(
  registryPath,
  outputPath,
  summaryRelative,
  sourceLabel = "registry_html_custom"
) {
  const now = new Date().toISOString();

  const payload = {
    generated_at: now,
    source: sourceLabel,
    source_file: registryPath,
    summary: {
      companies_processed: 0,
      jobs_extracted: 0,
      routing_html_scraper_ready_rows: 0,
      skipped_reason: "missing_registry",
      registry_missing: true,
    },
    failures: [],
    jobs: [],
    per_company: [],
  };

  await fs.writeFile(outputPath, JSON.stringify(payload, null, 2), "utf8");

  await writeStageSummary(summaryRelative, {
    stage: "html_extraction",
    ...payload.summary,
    per_company_counts: [],
  });
}

async function main() {
  const validationFromRouting = envValidationFromRouting();
  const {
    registry: registryPath,
    routing: routingPath,
    output: outputPath,
    summaryRelative,
    sourceLabel,
  } = getExtractionPaths();

  let routingRaw;
  try {
    routingRaw = await fs.readFile(routingPath, "utf8");
  } catch (e) {
    console.error(
      JSON.stringify({
        ok: false,
        error: "missing_routing",
        path: routingPath,
        message: String(e?.message || e),
      })
    );
    process.exit(1);
  }

  const routingRows = parse(routingRaw, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    bom: true,
  });

  const routingByKey = indexRoutingByCompanyKey(routingRows);
  const keyFilter = parseEnvCompanyKey();

  /** @type {Record<string, string>[]} */
  let targets;

  if (validationFromRouting) {
    if (!keyFilter) {
      console.error(
        JSON.stringify({
          ok: false,
          error: "validation_requires_company_key",
          message:
            "Set HTML_EXTRACT_COMPANY_KEY when HTML_EXTRACT_VALIDATION_FROM_ROUTING is enabled.",
        })
      );
      process.exit(1);
    }
    targets = routingRows.filter(
      (r) => String(r.company_key ?? "").trim() === keyFilter
    );
    targets = targets.filter((r) => Boolean(pickCareersUrl(r)));
    if (targets.length === 0) {
      console.error(
        JSON.stringify({
          ok: false,
          error: "routing_row_not_found_or_no_url",
          company_key: keyFilter,
          path: routingPath,
        })
      );
      process.exit(1);
    }
  } else {
    let regRaw;
    try {
      regRaw = await fs.readFile(registryPath, "utf8");
    } catch (e) {
      const code = /** @type {NodeJS.ErrnoException} */ (e)?.code;
      if (code === "ENOENT") {
        await writeOutputsForMissingRegistry(
          registryPath,
          outputPath,
          summaryRelative,
          sourceLabel
        );
        console.warn(
          isRecoveryExtractionMode()
            ? "[html_extract] WARN: recovery staging registry missing (ENOENT); treating as zero HTML targets."
            : "[html_extract] WARN: production registry missing (ENOENT); treating as zero HTML targets."
        );
        console.log(
          JSON.stringify({
            phase: "html_extract",
            event: "registry_missing_skip",
            skipped_reason: "missing_registry",
            registry_missing: true,
            path: registryPath,
          })
        );
        console.log(
          JSON.stringify({
            ok: true,
            skipped_reason: "missing_registry",
            registry_missing: true,
          })
        );
        return;
      }
      console.error(
        JSON.stringify({
          ok: false,
          error: "missing_registry",
          path: registryPath,
          message: String(e?.message || e),
        })
      );
      process.exit(1);
    }

    const regRows = parse(regRaw, {
      columns: true,
      skip_empty_lines: true,
      relax_quotes: true,
      bom: true,
    });

    const htmlPromoted = regRows.filter(isApprovedProductionHtmlRegistryRow);
    targets = htmlPromoted.map((reg) =>
      mergeRegistryHtmlWithRouting(reg, routingByKey.get(reg.company_key.trim()))
    );
    targets = targets.filter((row) =>
      Boolean(pickCareersUrl(row) || String(row.careers_url_final ?? "").trim())
    );
  }

  if (keyFilter && !validationFromRouting) {
    targets = targets.filter(
      (r) => String(r.company_key ?? "").trim() === keyFilter
    );
  }

  if (parseEnvRoutingPrioritySort()) {
    targets = [...targets].sort(compareRoutingPriority);
  }

  const maxCompanies = parseEnvLimit();
  if (maxCompanies != null) {
    targets = targets.slice(0, maxCompanies);
  }

  const earlyStopConsecutive = parseHtmlDetailEarlyStopConsecutive();
  const earlyStopIncludeFetchFail = parseHtmlDetailEarlyStopIncludeFetchFail();

  logEv({
    event: "run_start",
    mode: validationFromRouting
      ? "routing_validation"
      : isRecoveryExtractionMode()
        ? "html_recovery_staging"
        : "registry_html_custom",
    registry_promoted_html_candidates: validationFromRouting
      ? null
      : "see_registry_csv",
    companies_this_run: targets.length,
    env: {
      HTML_EXTRACTION_RECOVERY_MODE: isRecoveryExtractionMode(),
      HTML_EXTRACT_MAX_COMPANIES: maxCompanies,
      HTML_EXTRACT_COMPANY_KEY: keyFilter,
      HTML_EXTRACT_VALIDATION_FROM_ROUTING: validationFromRouting,
      EXTRACT_ROUTING_PRIORITY_SORT: parseEnvRoutingPrioritySort(),
    },
    limits: {
      HTML_MAX_MS_PER_COMPANY,
      HTML_MAX_CANDIDATE_LINKS,
      HTML_REQUEST_TIMEOUT_MS,
      HTML_FETCH_MAX_ATTEMPTS,
      FETCH_DELAY_MS,
      HTML_DETAIL_EARLY_STOP_CONSECUTIVE: earlyStopConsecutive,
      HTML_DETAIL_EARLY_STOP_INCLUDE_FETCH_FAIL: earlyStopIncludeFetchFail,
    },
  });

  /** @type {Record<string, unknown>[]} */
  const allJobs = [];
  /** @type {Record<string, unknown>[]} */
  const failures = [];

  const perCompany = [];
  let suspectedJsCount = 0;
  let emptyPageCount = 0;

  const htmlFetchOpts = {
    timeoutMs: HTML_REQUEST_TIMEOUT_MS,
    maxAttempts: HTML_FETCH_MAX_ATTEMPTS,
    retryDelayMs: HTML_RETRY_DELAY_MS,
  };

  for (let i = 0; i < targets.length; i++) {
    const row = targets[i];
    const company = row.company_name || "";
    const key = row.company_key || "";
    const listingUrl = pickCareersUrl(row);
    const t0 = Date.now();
    const deadline = t0 + HTML_MAX_MS_PER_COMPANY;

    const budgetLeft = () => Math.max(0, deadline - Date.now());

    if (!listingUrl) {
      failures.push({
        company_name: company,
        company_key: key,
        error: "no_careers_url",
      });
      perCompany.push({
        company_key: key,
        company_name: company,
        jobs: 0,
        status: "no_url",
        listing_url: "",
        duration_ms: 0,
        pages_fetched: 0,
        candidate_links: 0,
        yield_reason: { category: "no_url", detail: "missing_careers_url" },
      });
      logEv({
        event: "company_end",
        company,
        company_key: key,
        status: "no_url",
        duration_ms: 0,
        jobs: 0,
        yield_reason: { category: "no_url", detail: "missing_careers_url" },
      });
      continue;
    }

    logEv({
      event: "company_start",
      company,
      company_key: key,
      listing_url: listingUrl,
      budget_ms: HTML_MAX_MS_PER_COMPANY,
    });

    const meta = {
      company_name: company,
      company_key: key,
      routing_final_source_type: (row.final_source_type || "").trim(),
      careers_url_final: (row.careers_url_final || "").trim(),
    };

    let pagesFetched = 0;

    try {
      if (budgetLeft() < 500) {
        throw new Error("time_budget_exceeded: before listing fetch");
      }

      const listFetchStart = Date.now();
      const listingFetchUrl = normalizeUrlForDedupe(listingUrl);
      let html;
      try {
        html = await fetchText(
          listingFetchUrl,
          `HTML careers ${company}`,
          htmlFetchOpts
        );
        pagesFetched += 1;
        logEv({
          event: "fetch_ok",
          company,
          kind: "listing",
          url: listingFetchUrl,
          duration_ms: Date.now() - listFetchStart,
          attempts_max: HTML_FETCH_MAX_ATTEMPTS,
        });
      } catch (e) {
        logEv({
          event: "fetch_fail",
          company,
          kind: "listing",
          url: listingFetchUrl,
          duration_ms: Date.now() - listFetchStart,
          error: String(e?.message || e),
          reason: "timeout_http_or_abort",
        });
        throw e;
      }

      const $ = loadHtml(html);
      const signals = analyzePageSignals(html, $);

      if (signals.suspectedJsHeavy) {
        suspectedJsCount += 1;
      }
      if (signals.emptyOrThin) {
        emptyPageCount += 1;
      }

      if (signals.suspectedJsHeavy || signals.emptyOrThin) {
        failures.push({
          company_name: company,
          company_key: key,
          error: signals.suspectedJsHeavy
            ? "suspected_js_or_spa"
            : "empty_or_thin_page",
          signals,
        });
        const status = signals.suspectedJsHeavy ? "suspected_js" : "empty";
        const yr = signals.suspectedJsHeavy
          ? { category: "suspected_js", detail: "heuristic_blocked" }
          : { category: "listing_thin_or_empty", detail: "low_text_or_no_links" };
        perCompany.push({
          company_key: key,
          company_name: company,
          jobs: 0,
          status,
          listing_url: listingUrl,
          duration_ms: Date.now() - t0,
          pages_fetched: pagesFetched,
          candidate_links: 0,
          yield_reason: yr,
          listing_cards_extracted: 0,
          extraction_js_risk: Boolean(signals.extractionJsRisk),
          text_len: signals.textLen,
        });
        logEv({
          event: "company_end",
          company,
          company_key: key,
          status,
          duration_ms: Date.now() - t0,
          pages_fetched: pagesFetched,
          candidate_links: 0,
          jobs: 0,
          yield_reason: yr,
          extraction_js_risk: Boolean(signals.extractionJsRisk),
        });
        if (i < targets.length - 1) await sleep(FETCH_DELAY_MS);
        continue;
      }

      const cardRaw = extractJobsFromListingCards(
        $,
        listingFetchUrl,
        meta,
        HTML_MAX_LISTING_CARD_JOBS
      );
      /** @type {Record<string, unknown>[] } */
      let batch = cardRaw.map((j) => unifiedJob(j));
      /** @type {Set<string>} */
      const seenJobIds = new Set(
        batch.map((j) => String(j.source_job_id || ""))
      );

      const coveredApply = new Set(
        cardRaw
          .map((j) => normalizeUrlForDedupe(String(j.apply_url || "")))
          .filter((u) => u.length > 0)
      );

      const { links, stats: linkDiscoveryStats } = discoverJobLinks(
        $,
        listingFetchUrl
      );
      const linksFiltered = links.filter(
        (l) => !coveredApply.has(normalizeUrlForDedupe(l.url))
      );

      logEv({
        event: "links_discovered",
        company,
        listing_url: listingFetchUrl,
        candidate_links: links.length,
        detail_links_after_card_dedupe: linksFiltered.length,
        listing_cards: cardRaw.length,
        cap: HTML_MAX_CANDIDATE_LINKS,
        link_discovery_stats: linkDiscoveryStats,
      });

      let timeBudgetHit = false;
      let detailAttempts = 0;
      let detailExtracted = 0;
      let listingFallbackAttempted = false;
      let earlyStopTriggered = false;
      /** @type {string | null} */
      let earlyStopReason = null;
      let consecutiveBad = 0;
      let detailFetchSuccesses = 0;
      let detailFetchFailures = 0;
      let detailEmptySkips = 0;
      let detailDuplicateSkips = 0;

      let idx = 0;
      for (const link of linksFiltered) {
        if (budgetLeft() < 500) {
          timeBudgetHit = true;
          logEv({
            event: "time_budget_exceeded",
            company,
            company_key: key,
            after_link_index: idx,
            candidate_links: links.length,
            partial_jobs: batch.length,
          });
          failures.push({
            company_name: company,
            company_key: key,
            error: "time_budget_exceeded",
            partial_jobs: batch.length,
          });
          break;
        }

        idx += 1;
        detailAttempts += 1;
        const detailStart = Date.now();
        const fetchUrl = normalizeUrlForDedupe(link.url);
        try {
          const subHtml = await fetchText(
            fetchUrl,
            `Job detail ${company}`,
            htmlFetchOpts
          );
          detailFetchSuccesses += 1;
          pagesFetched += 1;
          logEv({
            event: "fetch_ok",
            company,
            kind: "detail",
            url: fetchUrl,
            link_index: idx,
            score: link.score,
            duration_ms: Date.now() - detailStart,
          });
          const extracted = extractJobFromHtml(subHtml, fetchUrl, meta);
          if (!extracted.title && !extracted.description_raw) {
            detailEmptySkips += 1;
            if (earlyStopConsecutive > 0) {
              consecutiveBad += 1;
              if (consecutiveBad >= earlyStopConsecutive) {
                earlyStopTriggered = true;
                earlyStopReason = "consecutive_bad_details";
                logEv({
                  event: "detail_early_stop",
                  company,
                  company_key: key,
                  reason: earlyStopReason,
                  after_link_index: idx,
                  consecutive_bad: consecutiveBad,
                });
                break;
              }
            }
            await sleep(FETCH_DELAY_MS);
            continue;
          }
          consecutiveBad = 0;
          const u = unifiedJob(extracted);
          const sid = String(u.source_job_id || "");
          if (seenJobIds.has(sid)) {
            detailDuplicateSkips += 1;
            await sleep(FETCH_DELAY_MS);
            continue;
          }
          seenJobIds.add(sid);
          batch.push(u);
          detailExtracted += 1;
        } catch (e) {
          detailFetchFailures += 1;
          logEv({
            event: "fetch_fail",
            company,
            kind: "detail",
            url: fetchUrl,
            link_index: idx,
            duration_ms: Date.now() - detailStart,
            error: String(e?.message || e),
            reason: "timeout_http_or_abort",
          });
          if (earlyStopConsecutive > 0) {
            if (earlyStopIncludeFetchFail) {
              consecutiveBad += 1;
              if (consecutiveBad >= earlyStopConsecutive) {
                earlyStopTriggered = true;
                earlyStopReason = "consecutive_bad_details";
                logEv({
                  event: "detail_early_stop",
                  company,
                  company_key: key,
                  reason: earlyStopReason,
                  after_link_index: idx,
                  consecutive_bad: consecutiveBad,
                });
                break;
              }
            } else {
              consecutiveBad = 0;
            }
          }
        }
        await sleep(FETCH_DELAY_MS);
      }

      if (batch.length === 0 && signals.textLen > 600) {
        listingFallbackAttempted = true;
        const one = extractJobFromHtml(html, listingFetchUrl, meta);
        if (one.title || one.description_raw) {
          const u = unifiedJob(one);
          if (!seenJobIds.has(String(u.source_job_id || ""))) {
            batch.push(u);
          }
        }
      }

      for (const j of batch) {
        allJobs.push(withRoutingMeta(j, row));
      }

      const rowStatus = timeBudgetHit
        ? "time_budget"
        : earlyStopTriggered
          ? "early_stop"
          : "ok";
      const yr = classifyZeroYieldReason({
        jobCount: batch.length,
        linksLength: links.length,
        signals,
        detailAttempts,
        detailExtracted,
        listingFallbackAttempted,
        timeBudgetHit,
        earlyStopTriggered,
      });

      perCompany.push({
        company_key: key,
        company_name: company,
        jobs: batch.length,
        status: rowStatus,
        listing_url: listingUrl,
        duration_ms: Date.now() - t0,
        pages_fetched: pagesFetched,
        candidate_links: links.length,
        listing_cards_extracted: cardRaw.length,
        detail_links_queued: linksFiltered.length,
        link_discovery_stats: linkDiscoveryStats,
        detail_attempts: detailAttempts,
        detail_fetch_successes: detailFetchSuccesses,
        detail_fetch_failures: detailFetchFailures,
        detail_empty_skips: detailEmptySkips,
        detail_duplicate_skips: detailDuplicateSkips,
        detail_jobs_extracted: detailExtracted,
        early_stop_triggered: earlyStopTriggered,
        early_stop_reason: earlyStopReason,
        yield_reason: yr,
        extraction_js_risk: Boolean(signals.extractionJsRisk),
        listing_fallback_attempted: listingFallbackAttempted,
        text_len: signals.textLen,
      });

      logEv({
        event: "company_end",
        company,
        company_key: key,
        status: rowStatus,
        duration_ms: Date.now() - t0,
        pages_fetched: pagesFetched,
        candidate_links: links.length,
        listing_cards: cardRaw.length,
        jobs: batch.length,
        yield_reason: yr,
        extraction_js_risk: Boolean(signals.extractionJsRisk),
        early_stop_triggered: earlyStopTriggered,
        early_stop_reason: earlyStopReason,
      });
    } catch (err) {
      const msg = String(err?.message || err);
      const isTime =
        msg.includes("time_budget") || msg.includes("time_budget_exceeded");
      failures.push({
        company_name: company,
        company_key: key,
        error: msg,
      });
      const errYr = isTime
        ? { category: "time_budget", detail: "exception_before_finish" }
        : { category: "fetch_or_parse_error", detail: msg.slice(0, 200) };
      perCompany.push({
        company_key: key,
        company_name: company,
        jobs: 0,
        status: isTime ? "time_budget" : "error",
        listing_url: listingUrl,
        duration_ms: Date.now() - t0,
        pages_fetched,
        candidate_links: 0,
        yield_reason: errYr,
      });
      logEv({
        event: "company_end",
        company,
        company_key: key,
        status: isTime ? "time_budget" : "error",
        duration_ms: Date.now() - t0,
        error: msg,
        pages_fetched,
        yield_reason: errYr,
      });
    }

    if (i < targets.length - 1) await sleep(FETCH_DELAY_MS);
  }

  /** @type {Record<string, number>} */
  const yieldReasonBreakdown = {};
  for (const p of perCompany) {
    const cat =
      p.yield_reason &&
      typeof p.yield_reason === "object" &&
      "category" in p.yield_reason
        ? String(/** @type {{ category?: string }} */ (p.yield_reason).category)
        : "unknown";
    yieldReasonBreakdown[cat] = (yieldReasonBreakdown[cat] || 0) + 1;
  }

  /** @type {Record<string, number>} */
  const linkDiscoveryAggregate = {
    dropped_excluded_path: 0,
    dropped_below_threshold: 0,
    same_host_non_listing: 0,
    kept_after_scoring_dedupe: 0,
    links_queued: 0,
  };
  for (const p of perCompany) {
    const s = p.link_discovery_stats;
    if (!s || typeof s !== "object") continue;
    linkDiscoveryAggregate.dropped_excluded_path += Number(
      s.dropped_excluded_path || 0
    );
    linkDiscoveryAggregate.dropped_below_threshold += Number(
      s.dropped_below_threshold || 0
    );
    linkDiscoveryAggregate.same_host_non_listing += Number(
      s.same_host_non_listing || 0
    );
    linkDiscoveryAggregate.kept_after_scoring_dedupe += Number(
      s.kept_after_scoring_dedupe || 0
    );
    linkDiscoveryAggregate.links_queued += Number(s.links_queued || 0);
  }

  let detailFetchAttemptsTotal = 0;
  let detailFetchSuccessesTotal = 0;
  let detailFetchFailuresTotal = 0;
  let detailEmptySkipsTotal = 0;
  let detailDuplicateSkipsTotal = 0;
  let detailJobsExtractedTotal = 0;
  let companiesEarlyStopped = 0;
  for (const p of perCompany) {
    detailFetchAttemptsTotal += Number(
      /** @type {{ detail_attempts?: number }} */ (p).detail_attempts || 0
    );
    detailFetchSuccessesTotal += Number(
      /** @type {{ detail_fetch_successes?: number }} */ (p).detail_fetch_successes ||
        0
    );
    detailFetchFailuresTotal += Number(
      /** @type {{ detail_fetch_failures?: number }} */ (p).detail_fetch_failures ||
        0
    );
    detailEmptySkipsTotal += Number(
      /** @type {{ detail_empty_skips?: number }} */ (p).detail_empty_skips || 0
    );
    detailDuplicateSkipsTotal += Number(
      /** @type {{ detail_duplicate_skips?: number }} */ (p)
        .detail_duplicate_skips || 0
    );
    detailJobsExtractedTotal += Number(
      /** @type {{ detail_jobs_extracted?: number }} */ (p).detail_jobs_extracted ||
        0
    );
    if (/** @type {{ early_stop_triggered?: boolean }} */ (p).early_stop_triggered) {
      companiesEarlyStopped += 1;
    }
  }

  const payload = {
    generated_at: new Date().toISOString(),
    source: validationFromRouting ? "routing_validation" : sourceLabel,
    source_file: validationFromRouting ? routingPath : registryPath,
    summary: {
      routing_html_scraper_ready_rows: targets.length,
      companies_processed: targets.length,
      jobs_extracted: allJobs.length,
      failures: failures.length,
      suspected_js_pages: suspectedJsCount,
      empty_or_thin_pages: emptyPageCount,
      yield_reason_breakdown: yieldReasonBreakdown,
      extraction_js_risk_companies: perCompany.filter(
        (p) => p.extraction_js_risk === true
      ).length,
      link_discovery_aggregate: linkDiscoveryAggregate,
      detail_metrics: {
        detail_fetch_attempts: detailFetchAttemptsTotal,
        detail_fetch_successes: detailFetchSuccessesTotal,
        detail_fetch_failures: detailFetchFailuresTotal,
        detail_empty_skips: detailEmptySkipsTotal,
        detail_duplicate_skips: detailDuplicateSkipsTotal,
        detail_jobs_extracted: detailJobsExtractedTotal,
        companies_early_stopped: companiesEarlyStopped,
      },
      limits: {
        HTML_MAX_MS_PER_COMPANY,
        HTML_MAX_CANDIDATE_LINKS,
        HTML_REQUEST_TIMEOUT_MS,
        HTML_FETCH_MAX_ATTEMPTS,
        FETCH_DELAY_MS,
      },
    },
    failures,
    jobs: allJobs,
    per_company: perCompany,
  };

  await fs.writeFile(outputPath, JSON.stringify(payload, null, 2), "utf8");

  const summaryPath = await writeStageSummary(summaryRelative, {
    stage: "html_extraction",
    ...payload.summary,
    per_company_counts: perCompany,
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        output: outputPath,
        summary: payload.summary,
        summary_file: summaryPath,
      },
      null,
      2
    )
  );
}

export { main as runHtmlExtractionMain };

const invokedDirectly =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (invokedDirectly) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
