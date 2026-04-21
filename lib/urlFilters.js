import { createInitialFilterState } from "./filterConfig";

const KEYS = {
  keyword: "q",
  location: "loc",
  sort: "sort",
  sector: "sec",
  jobFamilies: "jf",
  remote: "rem",
  seniority: "sen",
  employmentTypes: "et",
  tags: "tag",
  regions: "reg",
  companies: "co",
  postedWithin: "posted",
};

/**
 * @param {import('./filterConfig').createInitialFilterState extends () => infer R ? R : never} state
 */
export function filtersToSearchParams(state) {
  const p = new URLSearchParams();
  if (state.keyword.trim()) p.set(KEYS.keyword, state.keyword.trim());
  if (state.location.trim()) p.set(KEYS.location, state.location.trim());
  if (state.sort && state.sort !== "newest") p.set(KEYS.sort, state.sort);
  if (state.sector) p.set(KEYS.sector, state.sector);
  const arr = (key, vals) => {
    if (vals?.length) p.set(key, vals.join(","));
  };
  arr(KEYS.jobFamilies, state.jobFamilies);
  arr(KEYS.remote, state.remote);
  arr(KEYS.seniority, state.seniority);
  arr(KEYS.employmentTypes, state.employmentTypes);
  arr(KEYS.tags, state.tags);
  arr(KEYS.regions, state.regions);
  arr(KEYS.companies, state.companies);
  if (state.postedWithin != null) p.set(KEYS.postedWithin, String(state.postedWithin));
  return p;
}

/**
 * @param {URLSearchParams} searchParams
 */
export function searchParamsToFilters(searchParams) {
  const base = createInitialFilterState();
  const q = searchParams.get(KEYS.keyword);
  if (q) base.keyword = q;
  const loc = searchParams.get(KEYS.location);
  if (loc) base.location = loc;
  const sort = searchParams.get(KEYS.sort);
  if (sort === "oldest" || sort === "relevance" || sort === "newest") base.sort = sort;
  const sector = searchParams.get(KEYS.sector);
  if (sector) base.sector = sector;
  const split = (key) => {
    const s = searchParams.get(key);
    return s ? s.split(",").map((x) => x.trim()).filter(Boolean) : [];
  };
  base.jobFamilies = split(KEYS.jobFamilies);
  base.remote = split(KEYS.remote);
  base.seniority = split(KEYS.seniority);
  base.employmentTypes = split(KEYS.employmentTypes);
  base.tags = split(KEYS.tags);
  base.regions = split(KEYS.regions);
  base.companies = split(KEYS.companies);
  const posted = searchParams.get(KEYS.postedWithin);
  if (posted) {
    const n = parseInt(posted, 10);
    if ([1, 3, 7, 14, 30].includes(n)) base.postedWithin = n;
  }
  return base;
}
