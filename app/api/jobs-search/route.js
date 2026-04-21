import { NextResponse } from "next/server";
import { createInitialFilterState } from "@/lib/filterConfig";
import { filterAndSortJobs } from "@/lib/filterJobs";
import { getSearchableActiveJobs } from "@/lib/jobs";

const MAX_PAGE_SIZE = 100;
const SEARCH_RESPONSE_LIMIT = Number(process.env.SEARCH_RESPONSE_LIMIT || 5000);
const SEARCH_SLOW_MS = Number(process.env.SEARCH_SLOW_MS || 1200);

function asInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

function normalizeFilterState(input) {
  const base = createInitialFilterState();
  if (!input || typeof input !== "object") return base;
  return {
    ...base,
    ...input,
    keyword: String(input.keyword || ""),
    location: String(input.location || ""),
    sort: ["newest", "oldest", "relevance"].includes(String(input.sort || ""))
      ? String(input.sort)
      : base.sort,
    sector: String(input.sector || ""),
    jobFamilies: Array.isArray(input.jobFamilies) ? input.jobFamilies.map(String) : [],
    remote: Array.isArray(input.remote) ? input.remote.map(String) : [],
    seniority: Array.isArray(input.seniority) ? input.seniority.map(String) : [],
    employmentTypes: Array.isArray(input.employmentTypes) ? input.employmentTypes.map(String) : [],
    tags: Array.isArray(input.tags) ? input.tags.map(String) : [],
    regions: Array.isArray(input.regions) ? input.regions.map(String) : [],
    companies: Array.isArray(input.companies) ? input.companies.map(String) : [],
    postedWithin: input.postedWithin == null ? null : asInt(input.postedWithin, null),
  };
}

function hasActiveFilters(state) {
  return Boolean(
    state.keyword ||
      state.location ||
      state.sector ||
      state.postedWithin != null ||
      (Array.isArray(state.jobFamilies) && state.jobFamilies.length) ||
      (Array.isArray(state.remote) && state.remote.length) ||
      (Array.isArray(state.seniority) && state.seniority.length) ||
      (Array.isArray(state.employmentTypes) && state.employmentTypes.length) ||
      (Array.isArray(state.tags) && state.tags.length) ||
      (Array.isArray(state.regions) && state.regions.length) ||
      (Array.isArray(state.companies) && state.companies.length)
  );
}

export async function POST(req) {
  const startedAt = Date.now();
  try {
    const body = await req.json();
    const state = normalizeFilterState(body?.state || {});
    const page = Math.max(1, asInt(body?.page, 1));
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, asInt(body?.pageSize, 20)));

    const universe = await getSearchableActiveJobs(SEARCH_RESPONSE_LIMIT);
    const filtered = filterAndSortJobs(universe, state);
    const totalItems = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const currentPage = Math.min(page, totalPages);
    const start = (currentPage - 1) * pageSize;
    const jobs = filtered.slice(start, start + pageSize);
    const durationMs = Date.now() - startedAt;
    if (durationMs >= SEARCH_SLOW_MS) {
      console.warn(
        `[jobs-search] slow request: ${durationMs}ms | universe=${universe.length} filtered=${totalItems} page=${currentPage}/${totalPages} pageSize=${pageSize} activeFilters=${hasActiveFilters(state)}`
      );
    } else {
      console.log(
        `[jobs-search] ok: ${durationMs}ms | universe=${universe.length} filtered=${totalItems} page=${currentPage}/${totalPages} pageSize=${pageSize} activeFilters=${hasActiveFilters(state)}`
      );
    }

    return NextResponse.json(
      {
        ok: true,
        jobs,
        totalItems,
        totalPages,
        page: currentPage,
        pageSize,
      },
      { status: 200 }
    );
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    console.error(`[jobs-search] error after ${durationMs}ms:`, String(error?.message || error));
    return NextResponse.json(
      { ok: false, error: String(error?.message || error) },
      { status: 500 }
    );
  }
}
