#!/usr/bin/env node
/**
 * Manual source recovery: classify rows, write per-row results, and route to queue artifacts.
 * Does not modify repo-root sources.csv or run ingestion.
 *
 * Reads:  data/ingestion/manual_source_recovery.csv
 * Reads:  sources.csv (dedupe / match checks only)
 *
 * Writes:
 *   data/manual_source_recovery_results.csv
 *   data/manual_source_recovery_summary.json
 *   data/ingestion/manual_recovery_promotable_sources.csv  (unless --dry-run)
 *   data/ingestion/html_source_recovery_queue.csv          (unless --dry-run)
 *   data/ingestion/unsupported_ats_recovery_backlog.csv    (unless --dry-run)
 *
 * Flags:
 *   --dry-run  Only writes results + summary; skips ingestion queue CSVs (still includes routing counts in summary).
 *
 * Env:
 *   SOURCE_RECOVERY_DRY_RUN=1  Same as --dry-run
 */
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";

import { classifyAtsHostname } from "../career-resolver/classifyAts.mjs";
import { PATHS } from "../config/pipelinePaths.mjs";
import {
  ATS_WITH_EXTRACTION_HANDLER,
  classifyProviderIngestionTier,
  detectedSourceTypeFromProviderId,
  deriveDailySyncSlugFromCareersUrl,
  deriveSyntheticCareersUrl,
} from "../lib/sourceClassification.mjs";
import {
  parseBamboohrSubdomain,
  parseRipplingBoardPath,
  parseTeamtailorSubdomain,
} from "../job-extraction/atsHandlers/urlParsers.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..", "..");

const INPUT = path.join(REPO_ROOT, "data", "ingestion", "manual_source_recovery.csv");
const SOURCES_CSV = path.join(REPO_ROOT, PATHS.sourcesCsv);
const OUT_CSV = path.join(REPO_ROOT, "data", "manual_source_recovery_results.csv");
const OUT_JSON = path.join(REPO_ROOT, "data", "manual_source_recovery_summary.json");
const OUT_PROMOTABLE = path.join(
  REPO_ROOT,
  "data",
  "ingestion",
  "manual_recovery_promotable_sources.csv"
);
const OUT_HTML_QUEUE = path.join(REPO_ROOT, "data", "ingestion", "html_source_recovery_queue.csv");
const OUT_UNSUPPORTED = path.join(
  REPO_ROOT,
  "data",
  "ingestion",
  "unsupported_ats_recovery_backlog.csv"
);

const CSV_OUT_COLUMNS = [
  "company_name",
  "careers_url",
  "ats_guess",
  "detected_provider",
  "detected_source_type",
  "promotion_readiness",
  "next_action",
  "reason",
];

const PROMOTABLE_COLUMNS = [
  "company_name",
  "provider",
  "slug",
  "status",
  "source_url",
  "promotion_source",
  "notes",
  "promotion_status",
  "dedupe_detail",
  "reason",
];

const HTML_QUEUE_COLUMNS = [
  "company_name",
  "careers_url",
  "source_type",
  "discovery_method",
  "status",
  "notes",
  "last_checked_at",
  "next_action",
];

const UNSUPPORTED_COLUMNS = [
  "company_name",
  "careers_url",
  "ats_guess",
  "detected_provider",
  "status",
  "reason",
  "next_action",
];

const ALLOWED_QUEUE_STATUS = new Set(["queued", "reviewed", "promoted", "ignored", ""]);

function parseArgv(argv) {
  const dryRun =
    /^1|true|yes$/i.test(String(process.env.SOURCE_RECOVERY_DRY_RUN || "").trim()) ||
    argv.includes("--dry-run");
  return { dryRun };
}

/**
 * @param {string} raw
 */
function normalizeGuess(raw) {
  const g = String(raw || "")
    .trim()
    .toLowerCase();
  return g.replace(/^ats_/, "");
}

/**
 * @param {string} name
 */
function normalizeCompanyName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * @returns {Promise<{ rows: Record<string, string>[], byKey: Map<string, Record<string, string>>, byCompany: Map<string, Record<string, string>[]> }>}
 */
async function loadTrackedSourcesIndex() {
  let raw;
  try {
    raw = await fs.readFile(SOURCES_CSV, "utf8");
  } catch {
    return { rows: [], byKey: new Map(), byCompany: new Map() };
  }
  const rows = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    bom: true,
  });

  /** @type {Map<string, Record<string, string>>} */
  const byKey = new Map();
  /** @type {Map<string, Record<string, string>[]>} */
  const byCompany = new Map();

  for (const row of rows) {
    const provider = (row.ats || row.provider || "").trim().toLowerCase();
    const slug = (row.slug || "").trim();
    const company_name = (row.company_name || row.company || "").trim();
    const status = (row.status || "").trim().toLowerCase();
    if (!provider || !slug || !company_name) continue;
    if (status !== "approved" && status !== "auto") continue;

    const key = `${provider}|${slug.toLowerCase()}`;
    byKey.set(key, { ...row, provider, slug, company_name });

    const cn = normalizeCompanyName(company_name);
    if (!byCompany.has(cn)) byCompany.set(cn, []);
    byCompany.get(cn).push({ provider, slug, company_name });
  }

  return { rows, byKey, byCompany };
}

/**
 * @param {string} manualCompanyNorm
 * @param {string} provider
 * @param {string} slug
 * @param {{ byKey: Map<string, Record<string, string>>, byCompany: Map<string, Record<string, string>[]> }} idx
 */
function matchAgainstTrackedSources(manualCompanyNorm, provider, slug, idx) {
  const p = String(provider || "").trim().toLowerCase();
  const s = String(slug || "").trim();
  if (!p || !s) {
    return { kind: "blocked", detail: "missing_provider_or_slug_for_match" };
  }
  const key = `${p}|${s.toLowerCase()}`;
  if (idx.byKey.has(key)) {
    return {
      kind: "already_tracked_exact",
      detail: `sources.csv_row_${p}_${s}`,
      existing: idx.byKey.get(key),
    };
  }

  const list = idx.byCompany.get(manualCompanyNorm) || [];
  if (list.length === 0) {
    return { kind: "ready_new_source", detail: "no_company_name_collision" };
  }
  if (list.length > 1) {
    return {
      kind: "ambiguous_company_match",
      detail: `multiple_sources_rows_same_normalized_name_count_${list.length}`,
      existing: list,
    };
  }
  const one = list[0];
  if (one.provider === p && one.slug === s) {
    return { kind: "already_tracked_exact", detail: "single_list_match_same_key" };
  }
  return {
    kind: "tracked_same_company_different_source",
    detail: `existing_${one.provider}|${one.slug}`,
    existing: one,
  };
}

/**
 * Map match kind to promotion_status column values.
 * @param {string} kind
 */
function promotionStatusFromMatch(kind) {
  if (kind === "ready_new_source") return "ready_new";
  if (kind === "already_tracked_exact") return "already_tracked";
  if (kind === "ambiguous_company_match") return "ambiguous_match";
  if (kind === "tracked_same_company_different_source") return "ambiguous_match";
  if (kind === "blocked") return "blocked";
  return "blocked";
}

/**
 * @param {string} careersUrl
 * @param {string} guessProvider
 */
function classifyRow(careersUrl, guessProvider) {
  /** @type {string[]} */
  const reasons = [];

  if (!careersUrl) {
    return {
      detected_provider: guessProvider || "",
      detected_source_type: "unknown",
      promotion_readiness: "blocked",
      next_action: "manual_review",
      reason: "missing_careers_url",
    };
  }

  let hostname = "";
  try {
    hostname = new URL(careersUrl).hostname;
  } catch {
    return {
      detected_provider: guessProvider || "",
      detected_source_type: "unknown",
      promotion_readiness: "blocked",
      next_action: "manual_review",
      reason: "invalid_careers_url",
    };
  }

  const hostAts = classifyAtsHostname(hostname);

  if (!hostAts) {
    if (guessProvider && classifyProviderIngestionTier(guessProvider) === "daily_sync") {
      reasons.push("url_host_not_in_ats_classifier_using_ats_guess");
      return {
        detected_provider: guessProvider,
        detected_source_type: "daily_sync_supported_ats",
        promotion_readiness: "needs_review",
        next_action: "promote_to_sources_csv",
        reason: reasons.join("; "),
      };
    }
    return {
      detected_provider: guessProvider || "",
      detected_source_type: "html_custom",
      promotion_readiness: guessProvider ? "needs_review" : "ready",
      next_action: "route_to_html_queue",
      reason:
        "hostname_did_not_match_known_ats_patterns_classify_as_custom_html_careers_page",
    };
  }

  const p = hostAts.provider.toLowerCase();
  if (guessProvider && guessProvider !== p) {
    reasons.push(`ats_guess_${guessProvider}_differs_from_url_${p}`);
  }

  const tier = classifyProviderIngestionTier(p);
  const dst = detectedSourceTypeFromProviderId(p);

  if (tier === "daily_sync") {
    return {
      detected_provider: p,
      detected_source_type: "daily_sync_supported_ats",
      promotion_readiness: reasons.length ? "needs_review" : "ready",
      next_action: "promote_to_sources_csv",
      reason:
        reasons.join("; ") || "hostname_matches_daily_sync_supported_ats",
    };
  }

  if (tier === "offline_only") {
    return {
      detected_provider: p,
      detected_source_type: "offline_only_ats",
      promotion_readiness: "needs_review",
      next_action: "extend_daily_sync",
      reason:
        reasons.join("; ") ||
        "hostname_matches_offline_extractor_only_not_daily_sync",
    };
  }

  if (!ATS_WITH_EXTRACTION_HANDLER.has(p)) {
    return {
      detected_provider: p,
      detected_source_type: "unknown",
      promotion_readiness: "blocked",
      next_action: "extend_daily_sync",
      reason:
        (reasons.length ? `${reasons.join("; ")}; ` : "") +
        `ats_host_${p}_has_no_extractor_in_this_repository`,
    };
  }

  return {
    detected_provider: p,
    detected_source_type: dst,
    promotion_readiness: "needs_review",
    next_action: "manual_review",
    reason: reasons.join("; ") || "unexpected_classification_branch",
  };
}

/**
 * @param {string} provider
 * @param {string} url
 */
function deriveOfflineSlugHint(provider, url) {
  const p = String(provider || "").trim().toLowerCase();
  if (p === "teamtailor") return parseTeamtailorSubdomain(url) || "";
  if (p === "bamboohr") return parseBamboohrSubdomain(url) || "";
  if (p === "rippling") return parseRipplingBoardPath(url) || "";
  return "";
}

/**
 * @param {string} url
 */
function classifyHtmlSourceType(url) {
  const raw = String(url || "").trim();
  const u = raw.toLowerCase();
  if (!u) return "html_unknown";
  if (/#\/|\/app\/|client-side|single\s*page/i.test(raw)) {
    return "html_js";
  }
  if (
    /careers\.|\/careers|\/jobs|\/join|hiring|opportunities|vacancies/.test(u)
  ) {
    return "html_custom";
  }
  return "html_unknown";
}

async function main() {
  const { dryRun } = parseArgv(process.argv);

  let raw;
  try {
    raw = await fs.readFile(INPUT, "utf8");
  } catch {
    console.error(
      JSON.stringify(
        {
          ok: false,
          error: "missing_manual_source_recovery_csv",
          path: path.relative(REPO_ROOT, INPUT),
        },
        null,
        2
      )
    );
    process.exit(1);
  }

  const rows = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    bom: true,
  });

  const sourcesIdx = await loadTrackedSourcesIndex();

  /** @type {Record<string, string>[]} */
  const out = [];
  /** @type {Record<string, string>[]} */
  const promotable = [];
  /** @type {Record<string, string>[]} */
  const htmlQueue = [];
  /** @type {Record<string, string>[]} */
  const unsupported = [];

  /** @type {string[]} */
  const validationNotes = [];

  let invalidRows = 0;

  const counts = {
    ready_supported_ats: 0,
    queued_html: 0,
    unsupported_ats: 0,
    already_tracked: 0,
    blocked: 0,
    ambiguous: 0,
    invalid_rows: 0,
  };

  for (const row of rows) {
    const company_name = String(row.company_name ?? "").trim();
    const careers_url = String(row.careers_url ?? "").trim();
    const ats_guess = normalizeGuess(row.ats_guess);
    const queueStatus = String(row.status ?? "").trim().toLowerCase();
    const priority = String(row.priority ?? "").trim();
    const notes = String(row.notes ?? "").trim();
    const operator = String(row.operator ?? "").trim();

    if (!company_name) {
      validationNotes.push("skipped_row_missing_company_name");
      invalidRows += 1;
      counts.invalid_rows += 1;
      continue;
    }
    if (queueStatus && !ALLOWED_QUEUE_STATUS.has(queueStatus)) {
      validationNotes.push(
        `invalid_status_for_${company_name}:${queueStatus}`
      );
      invalidRows += 1;
      counts.invalid_rows += 1;
      continue;
    }
    if (queueStatus === "ignored") {
      validationNotes.push(`skipped_ignored:${company_name}`);
      continue;
    }

    const classified = classifyRow(careers_url, ats_guess);

    const reasonExtra = [
      classified.reason,
      priority ? `priority=${priority}` : "",
      notes ? `notes=${notes}` : "",
      operator ? `operator=${operator}` : "",
      queueStatus ? `queue_status=${queueStatus}` : "",
    ]
      .filter(Boolean)
      .join(" | ");

    out.push({
      company_name,
      careers_url,
      ats_guess: ats_guess || "",
      detected_provider: classified.detected_provider,
      detected_source_type: classified.detected_source_type,
      promotion_readiness: classified.promotion_readiness,
      next_action: classified.next_action,
      reason: reasonExtra,
    });

    const manualNorm = normalizeCompanyName(company_name);

    if (classified.detected_source_type === "daily_sync_supported_ats") {
      const prov = classified.detected_provider;
      const slugFinal = deriveDailySyncSlugFromCareersUrl(prov, careers_url);
      let promotion_status = "blocked";
      let dedupeDetail = "";
      let reasonOut = reasonExtra;

      if (!slugFinal) {
        promotion_status = "blocked";
        dedupeDetail = "slug_not_derivable_from_careers_url";
        reasonOut = `${reasonOut}; blocked_no_slug`;
        counts.blocked += 1;
      } else {
        const match = matchAgainstTrackedSources(
          manualNorm,
          prov,
          slugFinal,
          sourcesIdx
        );
        promotion_status = promotionStatusFromMatch(match.kind);
        dedupeDetail = match.detail || match.kind;

        if (match.kind === "ready_new_source") {
          if (
            classified.promotion_readiness === "ready" &&
            promotion_status === "ready_new"
          ) {
            counts.ready_supported_ats += 1;
          } else {
            promotion_status = "blocked";
            dedupeDetail = `${dedupeDetail}; needs_operator_review`;
            reasonOut = `${reasonOut}; readiness_${classified.promotion_readiness}`;
            counts.blocked += 1;
          }
        } else if (match.kind === "already_tracked_exact") {
          counts.already_tracked += 1;
        } else if (
          match.kind === "ambiguous_company_match" ||
          match.kind === "tracked_same_company_different_source"
        ) {
          counts.ambiguous += 1;
        }
      }

      const sourceUrl = slugFinal
        ? deriveSyntheticCareersUrl(prov, slugFinal)
        : careers_url;

      promotable.push({
        company_name,
        provider: prov,
        slug: slugFinal || "",
        status: "auto",
        source_url: sourceUrl || "",
        promotion_source: "manual_source_recovery",
        notes: notes || reasonExtra,
        promotion_status,
        dedupe_detail: dedupeDetail,
        reason: reasonOut,
      });
    } else if (classified.detected_source_type === "html_custom") {
      const st = classifyHtmlSourceType(careers_url);
      htmlQueue.push({
        company_name,
        careers_url,
        source_type: st,
        discovery_method: "manual_source_recovery",
        status: "queued",
        notes: reasonExtra,
        last_checked_at: "",
        next_action: "scrape_html",
      });
      counts.queued_html += 1;
    } else if (classified.detected_source_type === "offline_only_ats") {
      const prov = classified.detected_provider;
      const hint = deriveOfflineSlugHint(prov, careers_url);
      unsupported.push({
        company_name,
        careers_url,
        ats_guess: ats_guess || "",
        detected_provider: prov,
        status: "backlog",
        reason: `${reasonExtra}; derived_slug_hint=${hint || "none"}`,
        next_action: "route_offline_pipeline",
      });
      counts.unsupported_ats += 1;
    } else if (classified.detected_source_type === "unknown") {
      const prov = classified.detected_provider;
      unsupported.push({
        company_name,
        careers_url,
        ats_guess: ats_guess || "",
        detected_provider: prov,
        status: "backlog",
        reason: reasonExtra,
        next_action: "extend_daily_sync",
      });
      counts.unsupported_ats += 1;
    }

    if (
      classified.promotion_readiness === "blocked" &&
      classified.detected_source_type !== "daily_sync_supported_ats"
    ) {
      counts.blocked += 1;
    }
  }

  const htmlPipelineCompatibility = {
    level: "partial",
    summary:
      "runHtmlExtraction.mjs selects rows from production_source_registry.csv (ingestion_status=promoted, source_kind=html_custom) and joins source_routing_table.csv for careers URLs. It does not read html_source_recovery_queue.csv. Adapter still needed: promote queue rows into registry+routing (or a merge script) before npm run extract:html will pick them up.",
    reference_script: "scripts/job-extraction/runHtmlExtraction.mjs",
    queue_artifact: path.relative(REPO_ROOT, OUT_HTML_QUEUE),
  };

  const summary = {
    ok: true,
    generated_at: new Date().toISOString(),
    dry_run: dryRun,
    input: path.relative(REPO_ROOT, INPUT),
    sources_csv_for_dedupe: path.relative(REPO_ROOT, SOURCES_CSV),
    rows_in: rows.length,
    rows_classified: out.length,
    validation_notes: validationNotes,
    counts,
    counts_by_detected_source_type: {},
    counts_by_next_action: {},
    html_pipeline_compatibility: htmlPipelineCompatibility,
    artifacts: dryRun
      ? {
          wrote_promotable: false,
          wrote_html_queue: false,
          wrote_unsupported: false,
          reason: "dry_run",
        }
      : {
          wrote_promotable: true,
          wrote_html_queue: true,
          wrote_unsupported: true,
          paths: {
            promotable: path.relative(REPO_ROOT, OUT_PROMOTABLE),
            html_queue: path.relative(REPO_ROOT, OUT_HTML_QUEUE),
            unsupported: path.relative(REPO_ROOT, OUT_UNSUPPORTED),
          },
        },
  };

  for (const r of out) {
    const k = r.detected_source_type || "unknown";
    summary.counts_by_detected_source_type[k] =
      (summary.counts_by_detected_source_type[k] || 0) + 1;
    const na = r.next_action || "unknown";
    summary.counts_by_next_action[na] = (summary.counts_by_next_action[na] || 0) + 1;
  }

  await fs.mkdir(path.dirname(OUT_CSV), { recursive: true });
  const csv = stringify(out, {
    header: true,
    columns: CSV_OUT_COLUMNS,
    quoted_string: true,
  });
  await fs.writeFile(OUT_CSV, "\uFEFF" + csv, "utf8");
  await fs.writeFile(OUT_JSON, JSON.stringify(summary, null, 2), "utf8");

  if (!dryRun) {
    const pCsv = stringify(promotable, {
      header: true,
      columns: PROMOTABLE_COLUMNS,
      quoted_string: true,
    });
    await fs.writeFile(OUT_PROMOTABLE, "\uFEFF" + pCsv, "utf8");

    const hCsv = stringify(htmlQueue, {
      header: true,
      columns: HTML_QUEUE_COLUMNS,
      quoted_string: true,
    });
    await fs.writeFile(OUT_HTML_QUEUE, "\uFEFF" + hCsv, "utf8");

    const uCsv = stringify(unsupported, {
      header: true,
      columns: UNSUPPORTED_COLUMNS,
      quoted_string: true,
    });
    await fs.writeFile(OUT_UNSUPPORTED, "\uFEFF" + uCsv, "utf8");
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        dry_run: dryRun,
        wrote_results: path.relative(REPO_ROOT, OUT_CSV),
        wrote_summary: path.relative(REPO_ROOT, OUT_JSON),
        rows_classified: out.length,
        invalid_rows: invalidRows,
        routing: {
          ready_supported_ats: counts.ready_supported_ats,
          queued_html: counts.queued_html,
          unsupported_ats: counts.unsupported_ats,
          already_tracked: counts.already_tracked,
          blocked: counts.blocked,
          ambiguous: counts.ambiguous,
        },
        queue_artifacts_written: !dryRun,
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
