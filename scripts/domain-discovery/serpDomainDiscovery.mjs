#!/usr/bin/env node
/**
 * SerpAPI-based domain discovery for high-priority missing-logo companies.
 * Review-first: writes data/domain_discovery_candidates.{json,csv} only (no overrides).
 *
 * Env: SERPAPI_KEY (e.g. from .env.local via `node --env-file=.env.local`)
 *
 * Usage:
 *   node --env-file=.env.local scripts/domain-discovery/serpDomainDiscovery.mjs [options]
 */
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { stringify } from "csv-stringify/sync";
import { apexFromUrl, normalizeCanonicalDomain, isHardBlockedFinalDomain } from "./domainUtils.mjs";
import {
  scoreOrganicResult,
  decisionFromScore,
  applyTieRules,
} from "./scoreCandidate.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..", "..");

const DEFAULT_PRIORITY_REPORT = path.join(
  REPO_ROOT,
  "data",
  "company_logo_priority_report.json"
);
const OVERRIDES_PATH = path.join(REPO_ROOT, "lib", "companyEnrichmentOverrides.json");
const OUT_JSON = path.join(REPO_ROOT, "data", "domain_discovery_candidates.json");
const OUT_CSV = path.join(REPO_ROOT, "data", "domain_discovery_candidates.csv");
const CACHE_PATH = path.join(REPO_ROOT, "data", "domain_discovery_cache.json");

const SERP_URL = "https://serpapi.com/search.json";

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function hashKey(s) {
  return crypto.createHash("sha256").update(s).digest("hex").slice(0, 32);
}

/** @param {string} name */
function normalizeCompanyNameForQuery(name) {
  return String(name || "")
    .trim()
    .replace(/\s+/g, " ");
}

/** Very generic → optional disambiguation as second query instead of careers fallback. */
function needsDisambiguationSecondQuery(name) {
  const t = normalizeCompanyNameForQuery(name);
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length === 1 && t.length <= 6) return true;
  if (words.length === 1 && t.length <= 8 && /^[a-z]+$/i.test(t)) return true;
  return false;
}

function parseArgs(argv) {
  /** @type {Record<string, string | boolean | number | string[]>} */
  const o = {
    limit: 15,
    offset: 0,
    forceRefresh: false,
    includeReviewed: false,
    priorityReport: DEFAULT_PRIORITY_REPORT,
    conservative: true,
    batchSizeNote: "",
    slugs: /** @type {string[]} */ ([]),
  };
  for (const a of argv) {
    if (a.startsWith("--limit=")) o.limit = Math.max(0, parseInt(a.slice("--limit=".length), 10) || 0);
    else if (a.startsWith("--offset=")) o.offset = Math.max(0, parseInt(a.slice("--offset=".length), 10) || 0);
    else if (a === "--force-refresh") o.forceRefresh = true;
    else if (a === "--include-reviewed") o.includeReviewed = true;
    else if (a.startsWith("--priority-report="))
      o.priorityReport = path.resolve(REPO_ROOT, a.slice("--priority-report=".length));
    else if (a === "--no-conservative") o.conservative = false;
    else if (a.startsWith("--slugs="))
      o.slugs = a
        .slice("--slugs=".length)
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
  }
  return o;
}

/**
 * @returns {Promise<{ version: number, entries: Record<string, unknown> }>}
 */
async function loadCache() {
  try {
    const raw = await fs.readFile(CACHE_PATH, "utf8");
    const j = JSON.parse(raw);
    return { version: 1, entries: typeof j.entries === "object" && j.entries ? j.entries : {} };
  } catch (e) {
    if (e && /** @type {any} */ (e).code === "ENOENT") return { version: 1, entries: {} };
    throw e;
  }
}

async function saveCache(entries) {
  await fs.mkdir(path.dirname(CACHE_PATH), { recursive: true });
  await fs.writeFile(
    CACHE_PATH,
    JSON.stringify({ version: 1, entries, updatedAt: new Date().toISOString() }, null, 2),
    "utf8"
  );
}

/**
 * @param {string} query
 * @param {string} apiKey
 * @param {boolean} forceRefresh
 * @param {Record<string, unknown>} cacheEntries
 */
async function serpSearch(query, apiKey, forceRefresh, cacheEntries) {
  const key = hashKey(`google|${query}`);
  const now = Date.now();
  const cached = cacheEntries[key];
  if (
    !forceRefresh &&
    cached &&
    typeof cached === "object" &&
    cached.savedAt &&
    now - new Date(String(cached.savedAt)).getTime() < CACHE_TTL_MS &&
    cached.payload
  ) {
    return {
      fromCache: true,
      key,
      payload: /** @type {any} */ (cached.payload),
    };
  }

  const url = new URL(SERP_URL);
  url.searchParams.set("engine", "google");
  url.searchParams.set("q", query);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("num", "10");

  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url.toString(), { method: "GET" });
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        lastErr = new Error(`serpapi_invalid_json: ${text.slice(0, 200)}`);
        if (attempt === 0) await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      if (data.error) {
        lastErr = new Error(String(data.error));
        break;
      }
      cacheEntries[key] = { savedAt: new Date().toISOString(), query, payload: data };
      return { fromCache: false, key, payload: data };
    } catch (e) {
      lastErr = e;
      if (attempt === 0) await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw lastErr || new Error("serpapi_unknown_error");
}

/**
 * @param {any} payload
 * @returns {any[]}
 */
function organicList(payload) {
  const o = payload?.organic_results;
  return Array.isArray(o) ? o : [];
}

async function loadExistingOverrideSlugs() {
  try {
    const raw = await fs.readFile(OVERRIDES_PATH, "utf8");
    const j = JSON.parse(raw);
    return new Set(Object.keys(j || {}));
  } catch {
    return new Set();
  }
}

async function loadPreviouslySeenSlugs() {
  try {
    const raw = await fs.readFile(OUT_JSON, "utf8");
    const j = JSON.parse(raw);
    const rows = Array.isArray(j.candidates) ? j.candidates : [];
    return new Set(rows.map((r) => String(r.company_slug || "").toLowerCase()).filter(Boolean));
  } catch {
    return new Set();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const apiKey = process.env.SERPAPI_KEY || "";
  if (!apiKey) {
    console.error(
      "Missing SERPAPI_KEY. Set in environment or use: node --env-file=.env.local scripts/domain-discovery/serpDomainDiscovery.mjs"
    );
    process.exit(1);
  }

  const reportRaw = await fs.readFile(args.priorityReport, "utf8");
  const report = JSON.parse(reportRaw);
  const allRows = Array.isArray(report.allRows) ? report.allRows : [];

  /** Missing logo only */
  let queue = allRows.filter((r) => r.hasLogoUrl === "no");
  queue.sort((a, b) => {
    const jb = Number(b.activeJobCount) || 0;
    const ja = Number(a.activeJobCount) || 0;
    if (jb !== ja) return jb - ja;
    const tb = rBool(b.isTracked);
    const ta = rBool(a.isTracked);
    if (tb !== ta) return tb ? 1 : -1;
    return String(a.company || "").localeCompare(String(b.company || ""));
  });

  function rBool(v) {
    return v === true || v === "true" || v === "yes";
  }

  const overrideSlugs = await loadExistingOverrideSlugs();
  queue = queue.filter((r) => {
    const ps = String(r.primarySlug || "")
      .trim()
      .toLowerCase();
    if (overrideSlugs.has(ps)) return false;
    return true;
  });

  if (args.slugs.length > 0) {
    const want = new Set(args.slugs);
    queue = queue.filter((r) => want.has(String(r.primarySlug || "").toLowerCase()));
  }

  const seenBefore = await loadPreviouslySeenSlugs();
  if (!args.includeReviewed && !args.forceRefresh) {
    queue = queue.filter((r) => !seenBefore.has(String(r.primarySlug || "").toLowerCase()));
  }

  queue = queue.slice(args.offset, args.offset + (args.limit || queue.length));

  const runId = `run_${Date.now().toString(36)}`;
  const generatedAt = new Date().toISOString();
  const cache = await loadCache();
  /** @type {Record<string, unknown>} */
  const entries = cache.entries;

  /** @type {any[]} */
  const candidates = [];
  let apiCalls = 0;
  let cacheHits = 0;
  let skippedApiError = 0;

  for (let i = 0; i < queue.length; i++) {
    const row = queue[i];
    const companyName = String(row.company || "").trim();
    const companySlug = String(row.primarySlug || row.jobSlugFromCompanyName || "")
      .trim()
      .toLowerCase();
    const priorityRank = args.offset + i + 1;
    const activeJobCount = Number(row.activeJobCount) || 0;
    const isTracked = row.isTracked === true || row.isTracked === "yes";

    const norm = normalizeCompanyNameForQuery(companyName);
    const qPrimary = `"${norm}" official website`;

    let scorableFromPrimary = false;
    /** @type {any[]} */
    let organicPrimary = [];
    try {
      const r1 = await serpSearch(qPrimary, apiKey, args.forceRefresh, entries);
      if (r1.fromCache) cacheHits += 1;
      else apiCalls += 1;
      organicPrimary = organicList(r1.payload);
      for (const org of organicPrimary) {
        const link = String(org.link || "").trim();
        if (!link) continue;
        const { hostname, apex } = apexFromUrl(link);
        if (!apex) continue;
        const { score } = scoreOrganicResult({
          companyName,
          title: String(org.title || ""),
          snippet: String(org.snippet || ""),
          link,
          serpPosition: Number(org.position) || organicPrimary.indexOf(org) + 1,
          queryLabel: "primary",
          hostname,
          apex,
          apexRepeatCount: 1,
        });
        if (score >= 20 && apex) scorableFromPrimary = true;
      }
    } catch (e) {
      const msg = e && /** @type {any} */ (e).message ? String((e).message) : String(e);
      candidates.push({
        company_name: companyName,
        company_slug: companySlug,
        priority_rank: priorityRank,
        active_job_count: activeJobCount,
        is_tracked: isTracked,
        query_used: qPrimary,
        query_index: 1,
        serp_position: "",
        candidate_url: "",
        candidate_domain: "",
        title: "",
        snippet: "",
        score: 0,
        decision: "reject",
        matched_signals: [],
        reject_reasons: [msg.includes("429") ? "api_rate_limited" : "api_error"],
        run_id: runId,
        generated_at: generatedAt,
        applied_status: "pending",
        reviewer_notes: "",
        error: msg.slice(0, 500),
      });
      skippedApiError += 1;
      continue;
    }

    /** @type { { q: string, label: string, orgs: any[] }[] } */
    const blocks = [{ q: qPrimary, label: "primary", orgs: organicPrimary }];

    if (!scorableFromPrimary) {
      const useDisambig = needsDisambiguationSecondQuery(companyName);
      const q2 = useDisambig
        ? `"${norm}" aerospace OR drone company official site`
        : `"${norm}" careers`;
      const label2 = useDisambig ? "disambiguation" : "fallback_careers";
      try {
        const r2 = await serpSearch(q2, apiKey, args.forceRefresh, entries);
        if (r2.fromCache) cacheHits += 1;
        else apiCalls += 1;
        blocks.push({ q: q2, label: label2, orgs: organicList(r2.payload) });
      } catch (e) {
        const msg = e && /** @type {any} */ (e).message ? String((e).message) : String(e);
        console.warn(`[domain-discovery] second query failed for ${companySlug}: ${msg}`);
      }
    }

    /** @type {Map<string, number>} */
    const apexCounts = new Map();
    /** @type {any[]} */
    const rawResults = [];

    for (let bi = 0; bi < blocks.length; bi++) {
      const { q, label, orgs } = blocks[bi];
      const queryIndex = bi + 1;
      for (let oi = 0; oi < orgs.length; oi++) {
        const org = orgs[oi];
        const link = String(org.link || "").trim();
        if (!link) continue;
        const { hostname, apex } = apexFromUrl(link);
        if (!apex) continue;
        apexCounts.set(apex, (apexCounts.get(apex) || 0) + 1);
        rawResults.push({
          query: q,
          queryLabel: label,
          queryIndex,
          org,
          hostname,
          apex,
          link,
        });
      }
    }

    if (rawResults.length === 0) {
      candidates.push({
        company_name: companyName,
        company_slug: companySlug,
        priority_rank: priorityRank,
        active_job_count: activeJobCount,
        is_tracked: isTracked,
        query_used: qPrimary,
        query_index: 1,
        serp_position: "",
        candidate_url: "",
        candidate_domain: "",
        title: "",
        snippet: "",
        score: 0,
        decision: "reject",
        matched_signals: [],
        reject_reasons: ["api_empty"],
        run_id: runId,
        generated_at: generatedAt,
        applied_status: "pending",
        reviewer_notes: "",
      });
      continue;
    }

    /** @type {any[]} */
    const scoredRows = [];
    for (let ri = 0; ri < rawResults.length; ri++) {
      const rr = rawResults[ri];
      const org = rr.org;
      const link = rr.link;
      const pos = Number(org.position) || ri + 1;
      const apexRepeat = apexCounts.get(rr.apex) || 1;
      const scored = scoreOrganicResult({
        companyName,
        title: String(org.title || ""),
        snippet: String(org.snippet || ""),
        link,
        serpPosition: pos,
        queryLabel: rr.queryLabel,
        hostname: rr.hostname,
        apex: rr.apex,
        apexRepeatCount: apexRepeat,
      });
      let decision = decisionFromScore(scored.score, scored.hard_negative);
      if (decision === "auto_approve" && isHardBlockedFinalDomain(rr.hostname, rr.apex)) {
        decision = "manual_review";
        scored.matched_signals.push("blocked_host_no_auto");
      }
      if (args.conservative && decision === "auto_approve") {
        decision = "manual_review";
        scored.matched_signals.push("conservative_mode_no_auto_apply");
      }
      scoredRows.push({
        company_name: companyName,
        company_slug: companySlug,
        priority_rank: priorityRank,
        active_job_count: activeJobCount,
        is_tracked: isTracked,
        query_used: rr.query,
        query_index: rr.queryIndex,
        serp_position: pos,
        candidate_url: link,
        candidate_domain: normalizeCanonicalDomain(rr.apex) || rr.apex,
        title: String(org.title || ""),
        snippet: String(org.snippet || ""),
        score: scored.score,
        decision,
        matched_signals: scored.matched_signals,
        reject_reasons: scored.reject_reasons,
        hard_negative: scored.hard_negative,
        run_id: runId,
        generated_at: generatedAt,
        applied_status: "pending",
        reviewer_notes: "",
      });
    }

    const tied = applyTieRules(scoredRows);
    for (const tr of tied) {
      const { hard_negative, ...rest } = tr;
      void hard_negative;
      candidates.push(rest);
    }
  }

  await saveCache(entries);

  const payload = {
    run_id: runId,
    generated_at: generatedAt,
    source_priority_report: path.relative(REPO_ROOT, args.priorityReport),
    conservative_mode: args.conservative,
    summary: {
      companiesProcessed: queue.length,
      candidateRows: candidates.length,
      serpApiCalls: apiCalls,
      cacheHits,
      skippedApiError,
    },
    candidates,
  };

  await fs.mkdir(path.dirname(OUT_JSON), { recursive: true });
  await fs.writeFile(OUT_JSON, JSON.stringify(payload, null, 2), "utf8");

  const csvCols = [
    "company_name",
    "company_slug",
    "priority_rank",
    "active_job_count",
    "is_tracked",
    "query_used",
    "query_index",
    "serp_position",
    "candidate_url",
    "candidate_domain",
    "title",
    "snippet",
    "score",
    "decision",
    "matched_signals",
    "reject_reasons",
    "run_id",
    "generated_at",
    "applied_status",
    "reviewer_notes",
  ];
  const csvRows = candidates.map((c) =>
    csvCols.map((col) => {
      const v = c[col];
      if (Array.isArray(v)) return v.join("; ");
      if (typeof v === "boolean") return v ? "yes" : "no";
      return v == null ? "" : String(v);
    })
  );
  const csvOut = stringify([csvCols, ...csvRows]);
  await fs.writeFile(OUT_CSV, csvOut, "utf8");

  console.log(
    JSON.stringify(
      {
        wrote: [OUT_JSON, OUT_CSV],
        cache: CACHE_PATH,
        summary: payload.summary,
        run_id: runId,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
