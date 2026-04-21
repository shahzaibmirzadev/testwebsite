#!/usr/bin/env node
/**
 * ATS-focused SerpAPI discovery: diversified queries, query log, seen set, result filtering,
 * optional sources.csv merge. Does not replace domain-discovery or daily-sync.
 *
 *   node --env-file=.env.local scripts/ats-serp-discovery/runAtsSerpDiscovery.mjs
 *   node scripts/ats-serp-discovery/runAtsSerpDiscovery.mjs --dry-run --limit=3
 *
 * Env: SERPAPI_KEY, optional ATS_SERP_DISCOVERY_CONFIG (path to JSON)
 */
import fs from "fs/promises";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

import { PATHS } from "../config/pipelinePaths.mjs";
import { loadAtsSerpDiscoveryConfig } from "./loadConfig.mjs";
import { generateQueryPlanWithMeta } from "./queryGenerator.mjs";
import {
  loadQueryLog,
  saveQueryLogMerged,
  mergeQueryLogEntries,
  loadSeenSet,
  saveSeenSet,
  mergeSeenSets,
  REPO_ROOT,
} from "./persistedState.mjs";
import { loadExclusionCorpora } from "./loadExclusionCorpora.mjs";
import {
  parseAtsUrlToIdentity,
  providerSlugKey,
} from "./parseAtsUrl.mjs";
import { serpGoogleSearch, organicResults } from "./serpClient.mjs";
import {
  companyNameHintFromOrganic,
  domainHintFromOrganic,
  collisionHints,
} from "./organicHints.mjs";
import { mergeNewSourcesIntoCsv } from "./mergeSourcesCsv.mjs";
import { assessDroneRoboticsRelevance } from "./relevanceFilter.mjs";
import { assessTitleRoleForDroneHiring } from "./titleRoleFilter.mjs";
import { assessAtsPageDirectDroneSignal } from "./atsPageDroneSignal.mjs";
import { resolveSourcesCsvWritePath } from "./resolveSourcesCsvPath.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG = "[ATS DISCOVERY]";

/**
 * @param {string} q
 * @param {number} [max]
 */
function truncateQuery(q, max = 220) {
  const s = String(q || "").trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

/**
 * @param {Record<string, unknown>[]} rows
 * @returns {Map<string, number>}
 */
function countRejectReasons(rows) {
  /** @type {Map<string, number>} */
  const m = new Map();
  for (const r of rows) {
    const reason = String(r.reason ?? "unknown").trim() || "unknown";
    m.set(reason, (m.get(reason) || 0) + 1);
  }
  return m;
}

/**
 * @param {Map<string, number>} counts
 */
function logRejectSummary(counts) {
  if (counts.size === 0) return;
  const lines = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 22)
    .map(([k, v]) => `  - ${k}: ${v}`);
  console.log(`${LOG} Reject summary (so far) — codes include:`);
  console.log(
    `  irrelevant_no_drone_signal | irrelevant_role_title | irrelevant_page_no_drone_signal | in_sources_csv | in_persisted_seen_set | duplicate_in_current_run | serp_failed | serp_timeout | …`
  );
  console.log(lines.join("\n"));
}

/**
 * @param {string[]} argv
 */
function parseArgs(argv) {
  /** @type {{ dryRun: boolean, limit: number | null, config: string | null, strict: boolean | null }} */
  const o = {
    dryRun: false,
    limit: null,
    config: null,
    strict: null,
  };
  for (const a of argv) {
    if (a === "--dry-run") o.dryRun = true;
    else if (a.startsWith("--limit=")) {
      o.limit = Math.max(0, parseInt(a.slice("--limit=".length), 10) || 0);
    } else if (a.startsWith("--config=")) {
      o.config = a.slice("--config=".length);
    } else if (a === "--strict-collisions") o.strict = true;
    else if (a === "--no-strict-collisions") o.strict = false;
  }
  return o;
}

/**
 * @param {string} slug
 */
function fallbackCompanyName(slug) {
  const s = String(slug || "").trim();
  if (!s) return "Unknown";
  return s
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * @param {string} psKey
 * @param {Awaited<ReturnType<typeof loadExclusionCorpora>>} corpora
 * @param {Set<string>} runSeen
 * @returns {string | null}
 */
function hardRejectReason(psKey, corpora, runSeen) {
  if (corpora.fromSources.has(psKey)) return "in_sources_csv";
  if (corpora.fromRegistry.has(psKey)) return "in_production_registry";
  if (corpora.persistedSeen.has(psKey)) return "in_persisted_seen_set";
  if (corpora.fromVeto.has(psKey)) return "in_veto_registry";
  if (runSeen.has(psKey)) return "duplicate_in_current_run";
  return null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const configPath = args.config || process.env.ATS_SERP_DISCOVERY_CONFIG;
  const config = await loadAtsSerpDiscoveryConfig(configPath || undefined);

  const strict =
    args.strict !== null
      ? args.strict
      : Boolean(config.strictCollisionMode);

  const queryLogPath = path.join(REPO_ROOT, PATHS.atsSerpQueryLog);
  const seenPath = path.join(REPO_ROOT, PATHS.atsSerpSeenSet);
  const positivePath = path.join(REPO_ROOT, PATHS.discoveryPositiveHits);
  const rejectsPath = path.join(REPO_ROOT, PATHS.discoveryRejects);
  const summaryPath = path.join(REPO_ROOT, PATHS.atsSerpDiscoverySummary);
  const appendLogPath = path.join(REPO_ROOT, PATHS.atsSerpDiscoveryAppendLog);
  const sourcesPath = resolveSourcesCsvWritePath(config, REPO_ROOT);

  const apiKey = process.env.SERPAPI_KEY || "";
  if (!apiKey && !args.dryRun) {
    console.error(
      "Missing SERPAPI_KEY. Set in environment or use --dry-run (no API calls)."
    );
    process.exit(1);
  }

  const persistedSeen = await loadSeenSet(seenPath);
  const corpora = await loadExclusionCorpora({
    useVetoRegistry: config.useVetoRegistry !== false,
    persistedSeenKeys: persistedSeen,
    sourcesCsvPath: sourcesPath,
  });

  const queryLogLoaded = await loadQueryLog(queryLogPath);
  /** @type {Set<string>} */
  const executedExact = new Set(
    queryLogLoaded.queries.map((x) => String(x.q || "").trim())
  );

  const { plan, stats: queryGenerationStats } =
    generateQueryPlanWithMeta(config);

  const resolvedConfigPath = path.isAbsolute(String(configPath || ""))
    ? path.resolve(String(configPath))
    : path.join(
        REPO_ROOT,
        configPath ||
          process.env.ATS_SERP_DISCOVERY_CONFIG ||
          PATHS.atsSerpDiscoveryConfig
      );
  const configDisplay = path.relative(REPO_ROOT, resolvedConfigPath);

  /** @type {{ bucket: string, query: string, providerTarget?: string }[]} */
  const toRun = [];
  let skippedHistory = 0;
  for (const item of plan) {
    const q = item.query.trim();
    if (executedExact.has(q)) {
      skippedHistory += 1;
      continue;
    }
    toRun.push(item);
  }

  const limit =
    args.limit != null && args.limit > 0
      ? args.limit
      : toRun.length;
  const batch = toRun.slice(0, limit);

  const modeLabel = args.dryRun ? "DRY-RUN" : "LIVE";
  const writesSources = !args.dryRun && Boolean(apiKey);
  console.log(`${LOG} Starting run`);
  console.log(`Mode: ${modeLabel}`);
  console.log(`Planned queries (after history filter): ${toRun.length}`);
  console.log(
    `Executing: ${batch.length}${args.limit != null && args.limit > 0 ? ` (limit=${args.limit} applied)` : ""}`
  );
  console.log(`Config: ${configDisplay}`);
  console.log(
    `sources.csv write: ${writesSources ? "enabled (when new sources)" : "disabled"}`
  );
  const repoRootSources = path.resolve(path.join(REPO_ROOT, PATHS.sourcesCsv));
  const cwdSources = path.resolve(path.join(process.cwd(), PATHS.sourcesCsv));
  console.log(`${LOG} sources.csv merge target (absolute, pinned): ${sourcesPath}`);
  console.log(
    `${LOG} repo-root resolved path (PATHS.sourcesCsv): ${repoRootSources}`
  );
  console.log(
    `${LOG} daily-sync.js uses: path.join(process.cwd(), "sources.csv") => ${cwdSources}`
  );
  if (path.resolve(sourcesPath) !== cwdSources) {
    console.warn(
      `${LOG} WARNING: merge target !== cwd+sources.csv. Run this script with cwd = repo root so ATS discovery matches daily-sync.js.`
    );
  } else {
    console.log(
      `${LOG} merge target aligned with daily-sync.js (same absolute file).`
    );
  }
  console.log("");

  /** @type {Set<string>} */
  const runSeen = new Set();
  /** @type {Record<string, unknown>[]} */
  const rejectRows = [];
  /** @type {Record<string, unknown>[]} */
  const hitRows = [];
  /** @type {{ q: string, executedAt: string }[]} */
  const queryLogAppend = [];
  /** @type {{ provider: string, slug: string, company_name: string, defaultScrapeTier: string, defaultScrapeEveryRuns: string }[]} */
  const mergeList = [];
  /** Pending sources.csv rows not yet successfully merged (checkpoint or final flush). */
  /** @type {{ provider: string, slug: string, company_name: string, defaultScrapeTier: string, defaultScrapeEveryRuns: string }[]} */
  const pendingMergeBuffer = [];

  const checkpointEveryQueries = Math.max(
    1,
    Number(config.checkpointEveryQueries) || 10
  );
  const checkpointMinBufferedRows = Math.max(
    1,
    Number(config.checkpointMinBufferedRows) || 5
  );

  let checkpoint_writes_attempted = 0;
  let checkpoint_writes_succeeded = 0;
  let checkpoint_rows_sent = 0;
  let checkpoint_rows_added = 0;
  let final_flush_attempted = false;
  let final_flush_added = 0;

  let mergeResult = {
    added: 0,
    skipped_duplicates: 0,
    columns: /** @type {string[]} */ ([]),
  };

  const mergeOpts = {
    appendLogPath,
    backupBeforeMerge: true,
    backupDir: path.join(REPO_ROOT, PATHS.ingestionSourcesBackups),
  };

  let totalOrganic = 0;
  let executedQueries = 0;

  const serpNum = Number(config.serpResultsPerQuery) || 10;
  const serpEngine = config.serpEngine || "google";
  const serpTimeoutMs = Number(config.serpRequestTimeoutMs) || undefined;
  const validateAtsPageBody = Boolean(config.validateAtsPageBody);
  const atsPageBodyFetchTimeoutMs =
    Number(config.atsPageBodyFetchTimeoutMs) > 0
      ? Number(config.atsPageBodyFetchTimeoutMs)
      : 3000;
  const totalBatch = batch.length;

  async function flushPendingCheckpoint(reason) {
    if (!writesSources || args.dryRun || pendingMergeBuffer.length === 0) return;
    const batchRows = pendingMergeBuffer.slice();
    const n = batchRows.length;
    checkpoint_writes_attempted += 1;
    console.log(`${LOG} Checkpoint write triggered`);
    console.log(`Reason: ${reason}`);
    console.log(`${LOG} Buffered new sources: ${n}`);
    console.log(`${LOG} Merge write target (absolute): ${path.resolve(sourcesPath)}`);
    try {
      const result = await mergeNewSourcesIntoCsv(
        sourcesPath,
        batchRows,
        mergeOpts
      );
      pendingMergeBuffer.splice(0, n);
      checkpoint_writes_succeeded += 1;
      checkpoint_rows_sent += n;
      checkpoint_rows_added += result.added;
      console.log(
        `${LOG} Checkpoint write complete: added ${result.added}, skipped duplicates ${result.skipped_duplicates}`
      );
      const stamp = new Date().toISOString();
      await fs.appendFile(
        appendLogPath,
        `[${stamp}] CHECKPOINT_MERGE reason=${reason} added=${result.added} skipped_dup=${result.skipped_duplicates} batch=${n} target=${path.resolve(sourcesPath)}\n`,
        "utf8"
      );
    } catch (e) {
      console.error(
        `${LOG} Checkpoint merge failed (buffer unchanged, ${n} row(s) still pending):`,
        e
      );
    }
  }

  async function maybeCheckpointAfterQuery() {
    if (!writesSources || args.dryRun || pendingMergeBuffer.length === 0) return;
    let reason = null;
    if (pendingMergeBuffer.length >= checkpointMinBufferedRows) {
      reason = "buffer_size";
    } else if (
      executedQueries > 0 &&
      executedQueries % checkpointEveryQueries === 0
    ) {
      reason = "query_count";
    }
    if (reason) await flushPendingCheckpoint(reason);
  }

  async function flushFinalPending() {
    if (!writesSources || args.dryRun || pendingMergeBuffer.length === 0) return;
    final_flush_attempted = true;
    const n = pendingMergeBuffer.length;
    console.log(`${LOG} Checkpoint write triggered`);
    console.log(`Reason: final_flush`);
    console.log(`${LOG} Buffered new sources: ${n}`);
    console.log(`${LOG} Merge write target (absolute): ${path.resolve(sourcesPath)}`);
    try {
      mergeResult = await mergeNewSourcesIntoCsv(
        sourcesPath,
        pendingMergeBuffer.slice(),
        mergeOpts
      );
      final_flush_added = mergeResult.added;
      pendingMergeBuffer.length = 0;
      const stamp = new Date().toISOString();
      await fs.appendFile(
        appendLogPath,
        `[${stamp}] MERGE added=${mergeResult.added} skipped_dup=${mergeResult.skipped_duplicates} target=${path.resolve(sourcesPath)}\n`,
        "utf8"
      );
      console.log(
        `${LOG} Merge complete: added ${mergeResult.added}, skipped duplicates ${mergeResult.skipped_duplicates}`
      );
    } catch (e) {
      console.error(`${LOG} Final merge failed (pending buffer unchanged):`, e);
    }
  }

  for (let qi = 0; qi < batch.length; qi++) {
    const item = batch[qi];
    const { bucket, query } = item;
    const idxLabel = `${qi + 1}/${totalBatch}`;

    const executedAt = new Date().toISOString();
    queryLogAppend.push({ q: query, executedAt });

    if (args.dryRun) {
      console.log(`[${idxLabel}] Dry-run (skip API):`);
      console.log(`  ${truncateQuery(query)}`);
      executedQueries += 1;
      if ((qi + 1) % 5 === 0 && rejectRows.length > 0) {
        logRejectSummary(countRejectReasons(rejectRows));
        console.log("");
      }
      continue;
    }

    console.log(`[${idxLabel}] Running query:`);
    console.log(`  ${truncateQuery(query)}`);

    const serp = await serpGoogleSearch(query, apiKey, {
      engine: serpEngine,
      num: serpNum,
      timeoutMs: serpTimeoutMs,
    });
    executedQueries += 1;

    if (!serp.ok) {
      const timedOut =
        Boolean(/** @type {any} */ (serp).timedOut) ||
        String(serp.error || "") === "serp_timeout";
      if (timedOut) {
        console.log(`${LOG} Query timeout, skipping`);
      }
      rejectRows.push({
        phase: "serp",
        query,
        bucket,
        reason: timedOut ? "serp_timeout" : "serp_failed",
        detail: serp.error,
      });
      await fs.appendFile(
        appendLogPath,
        `[${executedAt}] SERP_FAIL query=${JSON.stringify(query)} ${serp.error}\n`,
        "utf8"
      );
      if ((qi + 1) % 5 === 0 && rejectRows.length > 0) {
        logRejectSummary(countRejectReasons(rejectRows));
        console.log("");
      }
      await maybeCheckpointAfterQuery();
      await new Promise((r) => setTimeout(r, 400));
      continue;
    }

    const orgs = organicResults(serp.payload);
    totalOrganic += orgs.length;

    let acceptedThisQuery = 0;
    let rejectedThisQuery = 0;

    for (const organic of orgs) {
      const link = String(organic.link ?? "").trim();
      if (!link) {
        rejectRows.push({
          phase: "result",
          query,
          bucket,
          link: "",
          reason: "no_link",
        });
        rejectedThisQuery += 1;
        continue;
      }

      const id = parseAtsUrlToIdentity(link);
      if (!id.ok) {
        rejectRows.push({
          phase: "result",
          query,
          bucket,
          link,
          reason: id.reason || "parse_failed",
        });
        rejectedThisQuery += 1;
        continue;
      }

      const psKey = providerSlugKey(id.provider, id.slug);
      const hard = hardRejectReason(psKey, corpora, runSeen);
      if (hard) {
        rejectRows.push({
          phase: "filter",
          query,
          bucket,
          link,
          provider: id.provider,
          slug: id.slug,
          reason: hard,
        });
        rejectedThisQuery += 1;
        continue;
      }

      const titleText = String(organic.title ?? "");
      const snippetText = String(organic.snippet ?? "");
      const nameHint = companyNameHintFromOrganic(organic);
      const companyName = nameHint || fallbackCompanyName(id.slug);

      const relevance = assessDroneRoboticsRelevance({
        title: titleText,
        snippet: snippetText,
        companyName,
      });
      if (!relevance.ok) {
        rejectRows.push({
          phase: "filter",
          query,
          bucket,
          link,
          provider: id.provider,
          slug: id.slug,
          reason: relevance.reason || "irrelevant_no_drone_signal",
        });
        rejectedThisQuery += 1;
        continue;
      }

      const titleRole = assessTitleRoleForDroneHiring({
        title: titleText,
        snippet: snippetText,
      });
      if (!titleRole.ok) {
        rejectRows.push({
          phase: "filter",
          query,
          bucket,
          link,
          provider: id.provider,
          slug: id.slug,
          reason: titleRole.reason || "irrelevant_role_title",
        });
        rejectedThisQuery += 1;
        continue;
      }

      if (validateAtsPageBody && !args.dryRun) {
        const pageSig = await assessAtsPageDirectDroneSignal(link, {
          timeoutMs: atsPageBodyFetchTimeoutMs,
        });
        if (pageSig.status === "no_keyword") {
          rejectRows.push({
            phase: "filter",
            query,
            bucket,
            link,
            provider: id.provider,
            slug: id.slug,
            reason: "irrelevant_page_no_drone_signal",
          });
          rejectedThisQuery += 1;
          continue;
        }
      }

      const domainHint = domainHintFromOrganic(organic);

      const soft = collisionHints(
        companyName,
        domainHint,
        corpora.existingCompanyNames,
        corpora.existingDomains
      );

      if (strict && soft.length > 0) {
        rejectRows.push({
          phase: "filter",
          query,
          bucket,
          link,
          provider: id.provider,
          slug: id.slug,
          reason: "strict_collision_block",
          soft_warnings: soft,
        });
        rejectedThisQuery += 1;
        continue;
      }

      runSeen.add(psKey);

      hitRows.push({
        query,
        bucket,
        link,
        provider: id.provider,
        slug: id.slug,
        provider_slug: psKey,
        company_name: companyName,
        soft_warnings: soft,
        title: organic.title ?? "",
      });

      const mergeRow = {
        provider: id.provider,
        slug: id.slug,
        company_name: companyName,
        defaultScrapeTier: config.defaultScrapeTier || "low",
        defaultScrapeEveryRuns: config.defaultScrapeEveryRuns || "2",
      };
      mergeList.push(mergeRow);
      pendingMergeBuffer.push(mergeRow);
      acceptedThisQuery += 1;
      console.log(`${LOG} [+] New source:`);
      console.log(`  provider: ${id.provider}`);
      console.log(`  slug: ${id.slug}`);
      console.log(`  company: ${companyName}`);
    }

    console.log(
      `[${idxLabel}] Results: ${orgs.length} links | Accepted: ${acceptedThisQuery} | Rejected: ${rejectedThisQuery}`
    );
    if (orgs.length === 0) {
      console.log(`[${idxLabel}] No organic results from Serp`);
    } else if (acceptedThisQuery === 0) {
      console.log(`[${idxLabel}] No valid ATS candidates found`);
    }

    if ((qi + 1) % 5 === 0 && rejectRows.length > 0) {
      logRejectSummary(countRejectReasons(rejectRows));
      console.log("");
    }

    await maybeCheckpointAfterQuery();
    await new Promise((r) => setTimeout(r, 350));
  }

  if (!args.dryRun) {
    if (queryLogAppend.length > 0) {
      const mergedLog = mergeQueryLogEntries(
        queryLogLoaded.queries,
        queryLogAppend
      );
      await saveQueryLogMerged(queryLogPath, mergedLog);
    }
    if (runSeen.size > 0) {
      const mergedSeen = mergeSeenSets(await loadSeenSet(seenPath), runSeen);
      await saveSeenSet(seenPath, mergedSeen);
    }
    if (writesSources) {
      if (pendingMergeBuffer.length > 0) {
        await flushFinalPending();
      } else if (mergeList.length === 0) {
        console.log(`${LOG} No new sources to append`);
      } else {
        console.log(
          `${LOG} No pending sources to flush (${mergeList.length} accepted row(s) already written via checkpoint merge(s))`
        );
      }
    }
  }

  const summary = {
    generated_at: new Date().toISOString(),
    dry_run: args.dryRun,
    strict_collision_mode: strict,
    query_generation: queryGenerationStats,
    configured_total_query_budget: queryGenerationStats.configured_total_query_budget,
    natural_unique_pool_size_after_cross_bucket_dedupe:
      queryGenerationStats.natural_unique_pool_size_after_cross_bucket_dedupe,
    budget_shortfall_vs_configured:
      queryGenerationStats.budget_shortfall_vs_configured,
    plan_total_queries: plan.length,
    planned_queries_after_history_filter: toRun.length,
    skipped_queries_already_in_log: skippedHistory,
    executed_queries: executedQueries,
    total_organic_results_seen: totalOrganic,
    accepted_new: hitRows.length,
    rejected_count: rejectRows.length,
    checkpoint_writes_attempted,
    checkpoint_writes_succeeded,
    checkpoint_rows_sent,
    checkpoint_rows_added,
    final_flush_attempted,
    final_flush_added,
    sources_merge: args.dryRun
      ? { skipped: "dry_run" }
      : mergeResult,
    paths: {
      query_log: PATHS.atsSerpQueryLog,
      seen_set: PATHS.atsSerpSeenSet,
      positive_hits: PATHS.discoveryPositiveHits,
      rejects: PATHS.discoveryRejects,
      summary: PATHS.atsSerpDiscoverySummary,
      append_log: PATHS.atsSerpDiscoveryAppendLog,
      sources_csv_merge_target_absolute: path.resolve(sourcesPath),
    },
    batch_queries_preview: batch.map((b) => ({
      bucket: b.bucket,
      query: b.query,
      ...(b.providerTarget ? { provider_target: b.providerTarget } : {}),
    })),
  };

  await fs.mkdir(path.dirname(positivePath), { recursive: true });
  await fs.writeFile(
    positivePath,
    JSON.stringify(
      {
        generated_at: summary.generated_at,
        dry_run: args.dryRun,
        hits: hitRows,
      },
      null,
      2
    ),
    "utf8"
  );
  await fs.writeFile(
    rejectsPath,
    JSON.stringify(
      {
        generated_at: summary.generated_at,
        dry_run: args.dryRun,
        rejects: rejectRows,
      },
      null,
      2
    ),
    "utf8"
  );
  await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2), "utf8");

  console.log("");
  console.log(`${LOG} Completed`);
  console.log(`Executed queries: ${executedQueries}`);
  console.log(`New sources: ${hitRows.length}`);
  console.log(`Total rejects (tracked): ${rejectRows.length}`);
  console.log("Output files:");
  console.log(`  - ${PATHS.discoveryPositiveHits}`);
  console.log(`  - ${PATHS.discoveryRejects}`);
  console.log(`  - ${PATHS.atsSerpDiscoverySummary}`);
}

const invoked =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (invoked) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
