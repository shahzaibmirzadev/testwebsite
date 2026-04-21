import { cache as cacheAsyncFn } from "react";
import { companySlug } from "./companyPages";
import { getCompanyName, getJobTags } from "./jobFieldHelpers";
import { supabase } from "./supabase";
import { jobSlug } from "./slug";
import { loadJobsSnapshot } from "./jobsSnapshot";

const QUERY_TIMEOUT_MS = Number(process.env.JOBS_QUERY_TIMEOUT_MS || 8000);
const FAILURE_BACKOFF_MS = 30000;
const SUCCESS_CACHE_MS = Number(process.env.JOBS_SUCCESS_CACHE_MS || 90000);
const JOBS_LIST_LIMIT = Number(process.env.JOBS_LIST_LIMIT || 500);
const JOB_LOOKUP_FALLBACK_LIMIT = Number(process.env.JOB_LOOKUP_FALLBACK_LIMIT || 350);
const SEARCH_UNIVERSE_MAX_ROWS = Number(process.env.SEARCH_UNIVERSE_MAX_ROWS || 5000);
const SEARCH_UNIVERSE_PAGE_SIZE = Number(process.env.SEARCH_UNIVERSE_PAGE_SIZE || 500);
const SEARCH_UNIVERSE_CACHE_MS = Number(process.env.SEARCH_UNIVERSE_CACHE_MS || 60000);
const COUNT_REFRESH_MS = Number(process.env.JOBS_COUNT_REFRESH_MS || 120000);
const LIFETIME_ROLES_FLOOR = Number(process.env.LIFETIME_ROLES_FLOOR || 0);
const JOB_LIST_COLUMNS = [
  "id",
  "source",
  "source_job_id",
  "title",
  "company",
  "location",
  "description",
  "apply_url",
  "is_active",
  "posted_at",
  "last_seen_at",
  "job_family",
  "tags",
  "remote_status",
  "seniority",
  "employment_type",
  "first_seen_at",
  "expires_at",
  "posted_relative_days",
  "is_relevant",
  "fetch_status",
  "detail_fetched",
  "detail_fetch_failed",
  "last_error",
].join(",");
const cacheKey = "__droneRolesCache";
const cache = globalThis[cacheKey] || {
  lastGoodJobs: [],
  lastKnownLifetimeRoles: Math.max(0, LIFETIME_ROLES_FLOOR),
  lastKnownActiveRoles: 0,
  lastFailureAt: 0,
  lastSuccessAt: 0,
  lastTotalCountFetchAt: 0,
  lastActiveCountFetchAt: 0,
  searchUniverseJobs: [],
  lastSearchUniverseFetchAt: 0,
  hasSlugColumn: null,
  snapshotSlugMap: null,
  snapshotSlugMapSize: 0,
};
globalThis[cacheKey] = cache;

/**
 * @template T
 * @param {Promise<T>} promise
 * @param {number} timeoutMs
 * @returns {Promise<T>}
 */
function withTimeout(promise, timeoutMs = QUERY_TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Query timed out")), timeoutMs)
    ),
  ]);
}

function findBySlugInRows(slug, rows) {
  const list = Array.isArray(rows) ? rows : [];
  for (const row of list) {
    if (jobSlug(row) === slug) return row;
  }
  return null;
}

function getSnapshotSlugMap(rows) {
  const list = Array.isArray(rows) ? rows : [];
  if (cache.snapshotSlugMap && cache.snapshotSlugMapSize === list.length) {
    return cache.snapshotSlugMap;
  }
  const map = new Map();
  for (const row of list) {
    const slug = jobSlug(row);
    if (!slug || map.has(slug)) continue;
    map.set(slug, row);
  }
  cache.snapshotSlugMap = map;
  cache.snapshotSlugMapSize = list.length;
  return map;
}

async function queryJobs(orderBy, onlyActive = true) {
  let q = supabase
    .from("jobs")
    .select(JOB_LIST_COLUMNS)
    .order(orderBy, { ascending: false })
    .limit(Math.max(1, JOBS_LIST_LIMIT));
  if (onlyActive) q = q.eq("is_active", true);
  const res = await withTimeout(q);
  if (!res.error && Array.isArray(res.data) && res.data.length > 0) {
    return { ...res, data: res.data };
  }
  return res;
}

export async function getJobsList() {
  const now = Date.now();
  if (
    cache.lastSuccessAt &&
    now - cache.lastSuccessAt < SUCCESS_CACHE_MS &&
    Array.isArray(cache.lastGoodJobs) &&
    cache.lastGoodJobs.length > 0
  ) {
    return cache.lastGoodJobs;
  }

  if (
    cache.lastFailureAt &&
    now - cache.lastFailureAt < FAILURE_BACKOFF_MS &&
    Array.isArray(cache.lastGoodJobs)
  ) {
    return cache.lastGoodJobs;
  }

  const attempts = [{ orderBy: "posted_at", onlyActive: true, label: "active_posted_at" }];

  try {
    for (const attempt of attempts) {
      try {
        const { data, error } = await queryJobs(attempt.orderBy, attempt.onlyActive);
        if (!error && Array.isArray(data) && data.length > 0) {
          cache.lastGoodJobs = data;
          cache.lastFailureAt = 0;
          cache.lastSuccessAt = Date.now();
          return data;
        }
        if (error) {
          console.error(`jobs_query_failed:${attempt.label}`, error.message);
        } else {
          console.warn(`jobs_query_empty:${attempt.label}`);
        }
      } catch (error) {
        console.error(`jobs_query_exception:${attempt.label}`, error);
      }
    }

    if (Array.isArray(cache.lastGoodJobs) && cache.lastGoodJobs.length > 0) {
      cache.lastFailureAt = Date.now();
      console.warn("jobs_query_fallback_using_cached_jobs", cache.lastGoodJobs.length);
      return cache.lastGoodJobs;
    }
    const snapshotJobs = await loadJobsSnapshot();
    if (snapshotJobs.length > 0) {
      cache.lastFailureAt = Date.now();
      console.warn("jobs_query_fallback_using_snapshot_jobs", snapshotJobs.length);
      return snapshotJobs;
    }
    cache.lastFailureAt = Date.now();
    return [];
  } catch (error) {
    console.error("jobs_query_unhandled", error);
    if (Array.isArray(cache.lastGoodJobs) && cache.lastGoodJobs.length > 0) {
      cache.lastFailureAt = Date.now();
      console.warn("jobs_query_unhandled_using_cached_jobs", cache.lastGoodJobs.length);
      return cache.lastGoodJobs;
    }
    const snapshotJobs = await loadJobsSnapshot();
    if (snapshotJobs.length > 0) {
      cache.lastFailureAt = Date.now();
      console.warn("jobs_query_unhandled_using_snapshot_jobs", snapshotJobs.length);
      return snapshotJobs;
    }
    cache.lastFailureAt = Date.now();
    return [];
  }
}

/**
 * Dedupes concurrent calls within one request (e.g. generateMetadata + page both need jobs).
 * Avoids two Supabase waits when the in-memory jobs cache is cold (~2× QUERY_TIMEOUT_MS).
 */
export const getJobsListCached = cacheAsyncFn(getJobsList);

export async function getSearchableActiveJobs(maxRows = SEARCH_UNIVERSE_MAX_ROWS) {
  const cappedMax = Math.max(1, Number(maxRows || SEARCH_UNIVERSE_MAX_ROWS));
  const now = Date.now();
  if (
    Array.isArray(cache.searchUniverseJobs) &&
    cache.searchUniverseJobs.length > 0 &&
    cache.lastSearchUniverseFetchAt &&
    now - cache.lastSearchUniverseFetchAt < SEARCH_UNIVERSE_CACHE_MS
  ) {
    return cache.searchUniverseJobs.slice(0, cappedMax);
  }

  const out = [];
  const pageSize = Math.max(100, SEARCH_UNIVERSE_PAGE_SIZE);

  try {
    for (let from = 0; from < cappedMax; from += pageSize) {
      const to = Math.min(from + pageSize - 1, cappedMax - 1);
      const { data, error } = await withTimeout(
        supabase
          .from("jobs")
          .select(JOB_LIST_COLUMNS)
          .eq("is_active", true)
          .order("posted_at", { ascending: false })
          .range(from, to)
      );
      if (error) {
        throw new Error(`search_universe_query_failed: ${error.message}`);
      }
      const rows = Array.isArray(data) ? data : [];
      if (rows.length === 0) break;
      out.push(...rows);
      if (rows.length < pageSize) break;
    }

    cache.searchUniverseJobs = out;
    cache.lastSearchUniverseFetchAt = Date.now();
    return out.slice(0, cappedMax);
  } catch (error) {
    console.error(String(error?.message || error));

    const cachedJobs = Array.isArray(cache.lastGoodJobs) ? cache.lastGoodJobs : [];
    const activeCachedJobs = cachedJobs.filter((job) => job?.is_active !== false);
    if (activeCachedJobs.length > 0) {
      return activeCachedJobs.slice(0, cappedMax);
    }

    const snapshotJobs = await loadJobsSnapshot();
    const activeSnapshotJobs = snapshotJobs.filter((job) => job?.is_active !== false);
    if (activeSnapshotJobs.length > 0) {
      return activeSnapshotJobs.slice(0, cappedMax);
    }

    return [];
  }
}

async function getFullActiveJobById(id) {
  const value = String(id || "").trim();
  if (!value) return null;
  try {
    const { data, error } = await withTimeout(
      supabase
        .from("jobs")
        .select("*")
        .eq("id", value)
        .eq("is_active", true)
        .limit(1)
    );
    if (!error && Array.isArray(data) && data[0]) return data[0];
  } catch {
    // Detail HTML is a progressive enhancement; keep the lightweight row if this misses.
  }
  return null;
}

export async function getRejectedCount() {
  try {
    const { count, error } = await withTimeout(
      supabase
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .eq("is_relevant", false)
    );
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

/**
 * "Lifetime roles" = cumulative count of job rows ever inserted into public.jobs.
 * Stored in site_metrics.lifetime_roles, updated by increment_lifetime_roles_by from
 * daily-sync (per insert) and pipeline deploy (batched). It does not decrease when
 * jobs are removed or deactivated.
 *
 * This is not the same as the job card "NEW" badge: that uses posted_at recency (see
 * getFreshnessBadge). A listing can show NEW after an upsert refresh without counting
 * as a new lifetime role if the row already existed (same source + source_job_id).
 */
export async function getTotalListingsCount() {
  const floor = Math.max(0, LIFETIME_ROLES_FLOOR);
  const fallback = Math.max(floor, cache.lastKnownLifetimeRoles || 0);
  const now = Date.now();
  if (cache.lastTotalCountFetchAt && now - cache.lastTotalCountFetchAt < COUNT_REFRESH_MS) {
    return Math.max(fallback, cache.lastKnownLifetimeRoles || 0);
  }
  try {
    const { data: metrics, error: metricsError } = await withTimeout(
      supabase.from("site_metrics").select("lifetime_roles").eq("id", "default").maybeSingle()
    );
    if (!metricsError && metrics != null && metrics.lifetime_roles != null) {
      const resolved = Math.max(
        floor,
        Number(metrics.lifetime_roles),
        cache.lastKnownLifetimeRoles || 0
      );
      cache.lastKnownLifetimeRoles = resolved;
      cache.lastTotalCountFetchAt = Date.now();
      return resolved;
    }
    return Math.max(fallback, cache.lastKnownLifetimeRoles || 0);
  } catch {
    return Math.max(fallback, cache.lastKnownLifetimeRoles || 0);
  }
}

export async function getActiveListingsCount() {
  const floor = 0;
  const fallbackFromJobs = 0;
  const snapshotJobs = await loadJobsSnapshot();
  const activeSnapshotCount = snapshotJobs.filter((j) => j?.is_active !== false).length;
  const fallback = Math.max(floor, fallbackFromJobs, activeSnapshotCount, cache.lastKnownActiveRoles || 0);
  const now = Date.now();
  if (cache.lastActiveCountFetchAt && now - cache.lastActiveCountFetchAt < COUNT_REFRESH_MS) {
    return Math.max(0, cache.lastKnownActiveRoles || fallback);
  }
  try {
    const { count, error } = await withTimeout(
      supabase
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true)
    );
    if (error) return fallback;
    const resolved = Math.max(0, Number(count || 0));
    cache.lastKnownActiveRoles = resolved;
    cache.lastActiveCountFetchAt = Date.now();
    return resolved;
  } catch {
    return fallback;
  }
}

/**
 * Resolve job by URL slug: matches DB `slug` when present, else computed slug from title + id.
 * Uses one fetch so a missing `slug` column does not break the query.
 */
export async function getJobBySlug(slug) {
  try {
    const snapshotJobs = await loadJobsSnapshot();
    if (snapshotJobs.length > 0) {
      const snapshotMatch = getSnapshotSlugMap(snapshotJobs).get(slug) || null;
      if (snapshotMatch) return snapshotMatch;
    }

    // Match the same active rows used to render job cards before trying
    // schema-specific lookup paths. This keeps /jobs/[slug] aligned with
    // the public links even when the live DB does not have a `slug` column.
    const activeListMatch = findBySlugInRows(slug, await getJobsList());
    if (activeListMatch) {
      return (await getFullActiveJobById(activeListMatch.id)) || activeListMatch;
    }

    if (cache.hasSlugColumn !== false) {
      const { data: exactBySlug, error: exactError } = await withTimeout(
        supabase
          .from("jobs")
          .select("*")
          .eq("slug", slug)
          .eq("is_active", true)
          .order("posted_at", { ascending: false })
          .limit(1)
      );
      if (!exactError && Array.isArray(exactBySlug) && exactBySlug[0]) {
        cache.hasSlugColumn = true;
        return exactBySlug[0];
      }
      if (
        exactError &&
        String(exactError.message || "")
          .toLowerCase()
          .includes("column jobs.slug does not exist")
      ) {
        cache.hasSlugColumn = false;
      }
    }

    const { data: jobs, error } = await withTimeout(
      supabase
        .from("jobs")
        .select("*")
        .eq("is_active", true)
        .order("posted_at", { ascending: false })
        .limit(Math.max(1, JOB_LOOKUP_FALLBACK_LIMIT))
    );

    if (error) {
      throw new Error(`Failed to fetch job: ${error.message}`);
    }

    return findBySlugInRows(slug, jobs ?? []);
  } catch {
    const snapshotJobs = await loadJobsSnapshot();
    return findBySlugInRows(slug, snapshotJobs ?? []);
  }
}

function readFirstText(job, keys) {
  for (const key of keys) {
    const value = job?.[key];
    if (value == null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
}

export async function getRelatedJobs(currentJob, limit = 6) {
  try {
    const family = readFirstText(currentJob, [
      "job_family",
      "jobFamily",
      "family",
      "category",
      "role_family",
    ]);
    const company = readFirstText(currentJob, ["company"]);
    const location = readFirstText(currentJob, ["location"]);
    const currentId = String(currentJob?.id ?? "");
    const currentSlug = jobSlug(currentJob);
    const target = Math.max(1, limit);
    const currentTags = getJobTags(currentJob).map((t) => t.toLowerCase());

    const scoreRelatedRow = (row) => {
      const rowFamily = readFirstText(row, [
        "job_family",
        "jobFamily",
        "family",
        "category",
        "role_family",
      ]);
      const rowCompany = readFirstText(row, ["company"]);
      const rowLocation = readFirstText(row, ["location"]);
      const rowTags = getJobTags(row).map((t) => t.toLowerCase());
      let score = 0;
      if (family && rowFamily && rowFamily.toLowerCase() === family.toLowerCase()) score += 8;
      if (company && rowCompany && rowCompany.toLowerCase() === company.toLowerCase()) score += 4;
      if (location && rowLocation && rowLocation.toLowerCase() === location.toLowerCase()) score += 2;
      for (const tag of rowTags) {
        if (currentTags.includes(tag)) score += 1;
      }
      return score;
    };

    const rankRows = (rows) =>
      (Array.isArray(rows) ? rows : [])
        .filter((row) => row?.is_active !== false)
        .filter((row) => {
          const id = String(row?.id ?? "");
          const rowSlug = jobSlug(row);
          return rowSlug && rowSlug !== currentSlug && (!currentId || id !== currentId);
        })
        .map((row) => ({ row, score: scoreRelatedRow(row) }))
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return new Date(b.row?.posted_at || 0).getTime() - new Date(a.row?.posted_at || 0).getTime();
        })
        .slice(0, target)
        .map((entry) => entry.row);

    const snapshotJobs = await loadJobsSnapshot();
    if (snapshotJobs.length > 0) {
      const ranked = rankRows(snapshotJobs);

      // Prefer fast snapshot-backed related jobs on detail pages to keep
      // navigation latency low. Avoid additional DB round-trips unless needed.
      if (ranked.length > 0) return ranked.slice(0, target);
    }

    const activeJobs = await getJobsList();
    const rankedActiveJobs = rankRows(activeJobs);
    if (rankedActiveJobs.length > 0) return rankedActiveJobs.slice(0, target);

    const related = [];
    const seen = new Set();

    const appendRows = (rows) => {
      for (const row of rows || []) {
        const id = String(row?.id ?? "");
        if (!id || id === currentId || seen.has(id)) continue;
        seen.add(id);
        related.push(row);
        if (related.length >= target) break;
      }
    };

    if (family) {
      const familyColumns = ["job_family", "jobFamily", "family", "category", "role_family"];
      for (const col of familyColumns) {
        const { data, error } = await withTimeout(
          supabase
            .from("jobs")
            .select(JOB_LIST_COLUMNS)
            .eq("is_active", true)
            .eq(col, family)
            .order("posted_at", { ascending: false })
            .limit(target * 2)
        );
        if (!error && Array.isArray(data)) appendRows(data);
        if (related.length >= target) return related.slice(0, target);
      }
    }

    if (company && related.length < target) {
      const { data, error } = await withTimeout(
        supabase
          .from("jobs")
          .select(JOB_LIST_COLUMNS)
          .eq("is_active", true)
          .eq("company", company)
          .order("posted_at", { ascending: false })
          .limit(target * 2)
      );
      if (!error && Array.isArray(data)) appendRows(data);
      if (related.length >= target) return related.slice(0, target);
    }

    if (location && related.length < target) {
      const { data, error } = await withTimeout(
        supabase
          .from("jobs")
          .select(JOB_LIST_COLUMNS)
          .eq("is_active", true)
          .eq("location", location)
          .order("posted_at", { ascending: false })
          .limit(target * 2)
      );
      if (!error && Array.isArray(data)) appendRows(data);
    }

    return related.slice(0, target);
  } catch {
    return [];
  }
}

const COMPANY_JOBS_RANGE_PAGE_SIZE = 500;

/**
 * True if at least one active row uses this exact `jobs.company` string.
 * Used so we never trust a snapshot-only company label that no longer matches live data.
 */
async function activeCompanyNameExists(exactName) {
  const name = String(exactName || "").trim();
  if (!name) return false;
  try {
    const { count, error } = await withTimeout(
      supabase
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true)
        .eq("company", name)
    );
    if (error) return false;
    return (count ?? 0) > 0;
  } catch {
    return false;
  }
}

/**
 * Map /company/[slug] to the canonical `jobs.company` string (exact DB match).
 *
 * Order of truth:
 * 1. Optional `nameHint` from `?c=` when it matches the slug and exists in DB (directory / job cards).
 * 2. Searchable active universe — same feed as /companies — pick the exact `company` string with
 *    the most rows for this slug (handles slug collisions like "Co" vs "C O").
 * 3. Snapshot + full-table scan as fallback.
 */
export async function resolveCompanyNameForSlug(slug, nameHint = "") {
  const target = String(slug || "").trim().toLowerCase();
  if (!target) return "";

  const hint = String(nameHint || "").trim();
  if (hint && companySlug(hint) === target && (await activeCompanyNameExists(hint))) {
    return hint;
  }

  // Fast path: current listings cache is already active-only and avoids the larger
  // search universe query on common company slugs.
  try {
    const recentJobs = await getJobsListCached();
    const counts = new Map();
    for (const job of recentJobs) {
      const n = getCompanyName(job);
      if (!n || companySlug(n) !== target) continue;
      counts.set(n, (counts.get(n) || 0) + 1);
    }
    if (counts.size > 0) {
      let bestName = "";
      let bestCount = -1;
      for (const [n, c] of counts) {
        if (c > bestCount || (c === bestCount && (bestName === "" || n.localeCompare(bestName) < 0))) {
          bestName = n;
          bestCount = c;
        }
      }
      if (bestName) return bestName;
    }
  } catch (e) {
    console.warn("resolveCompanyNameForSlug:recent_jobs", e);
  }

  try {
    const universe = await getSearchableActiveJobs();
    const counts = new Map();
    for (const job of universe) {
      const n = getCompanyName(job);
      if (!n) continue;
      if (companySlug(n) !== target) continue;
      counts.set(n, (counts.get(n) || 0) + 1);
    }
    if (counts.size > 0) {
      let bestName = "";
      let bestCount = -1;
      for (const [n, c] of counts) {
        if (c > bestCount || (c === bestCount && (bestName === "" || n.localeCompare(bestName) < 0))) {
          bestName = n;
          bestCount = c;
        }
      }
      if (bestName && (await activeCompanyNameExists(bestName))) return bestName;
    }
  } catch (e) {
    console.warn("resolveCompanyNameForSlug:search_universe", e);
  }

  const snapshotJobs = await loadJobsSnapshot();
  for (const row of snapshotJobs) {
    const name = getCompanyName(row);
    if (!name || companySlug(name) !== target) continue;
    if (await activeCompanyNameExists(name)) return name;
  }

  const scanSize = 1000;
  for (let from = 0; from < 50000; from += scanSize) {
    const { data, error } = await withTimeout(
      supabase
        .from("jobs")
        .select("company")
        .eq("is_active", true)
        .order("posted_at", { ascending: false })
        .range(from, from + scanSize - 1)
    );
    if (error || !Array.isArray(data) || data.length === 0) break;
    for (const row of data) {
      const name = getCompanyName(row);
      if (name && companySlug(name) === target) return name;
    }
  }
  return "";
}

/**
 * One page of active jobs for an exact company name (indexed `company` eq).
 */
export async function getActiveJobsForCompanyName(companyName, { limit = 100, offset = 0 } = {}) {
  const name = String(companyName || "").trim();
  if (!name) return [];
  const lo = Math.max(0, Math.trunc(offset));
  const lim = Math.max(1, Math.min(100, Math.trunc(limit)));
  const hi = lo + lim - 1;
  const { data, error } = await withTimeout(
    supabase
      .from("jobs")
      .select(JOB_LIST_COLUMNS)
      .eq("is_active", true)
      .eq("company", name)
      .order("posted_at", { ascending: false })
      .range(lo, hi)
  );
  if (error) {
    console.error("getActiveJobsForCompanyName", error.message);
    return [];
  }
  return Array.isArray(data) ? data : [];
}

/**
 * Exact count of active rows for `company` (for company pages without loading all jobs).
 */
export async function countActiveJobsForCompanyName(companyName) {
  const name = String(companyName || "").trim();
  if (!name) return 0;
  try {
    const { count, error } = await withTimeout(
      supabase
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true)
        .eq("company", name)
    );
    if (error) {
      console.error("countActiveJobsForCompanyName", error.message);
      return 0;
    }
    return Math.max(0, Number(count ?? 0));
  } catch {
    return 0;
  }
}

/**
 * All active jobs for a company (paged Supabase reads).
 */
export async function getAllActiveJobsForCompanyName(companyName) {
  const name = String(companyName || "").trim();
  if (!name) return [];
  const out = [];
  for (let from = 0; ; from += COMPANY_JOBS_RANGE_PAGE_SIZE) {
    const { data, error } = await withTimeout(
      supabase
        .from("jobs")
        .select(JOB_LIST_COLUMNS)
        .eq("is_active", true)
        .eq("company", name)
        .order("posted_at", { ascending: false })
        .range(from, from + COMPANY_JOBS_RANGE_PAGE_SIZE - 1)
    );
    if (error) {
      console.error("getAllActiveJobsForCompanyName", error.message);
      break;
    }
    const rows = Array.isArray(data) ? data : [];
    out.push(...rows);
    if (rows.length < COMPANY_JOBS_RANGE_PAGE_SIZE) break;
  }
  return out;
}
