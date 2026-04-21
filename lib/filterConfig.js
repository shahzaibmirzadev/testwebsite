/** @typedef {'newest'|'oldest'|'relevance'} SortMode */

export const SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "relevance", label: "Relevance" },
];

export const JOB_FAMILIES = [
  "Pilot",
  "Operator",
  "Technician",
  "Engineering",
  "Testing",
  "Field Engineering",
  "Business Development",
  "Administrative",
  "Other",
];

export const REMOTE_STATUS = ["Remote", "Hybrid", "On-site"];

export const SENIORITY = [
  "Intern",
  "Junior",
  "Mid-Level",
  "Senior",
  "Lead",
  "Staff",
  "Principal",
];

export const EMPLOYMENT_TYPES = [
  "Full-time",
  "Part-time",
  "Contract",
  "Temporary",
  "Internship",
];

/** Core domain / tag filters (multi-select) */
export const DOMAIN_TAGS = [
  "UAV",
  "UAS",
  "Drone",
  "Unmanned",
  "Defense",
  "BVLOS",
  "Flight Test",
  "Remote Pilot",
  "Autonomy",
  "Computer Vision",
  "Avionics",
  "Controls",
  "GNC",
  "Embedded",
  "Firmware",
  "Mapping",
  "Inspection",
  "Field",
  "Maintenance",
  "Fixed-Wing",
  "Multirotor",
  "VTOL",
  "Payload",
  "Integration",
  "Counter-UAS",
];

export const REGIONS = ["Europe", "North America", "Asia", "Remote"];

/** Posted within (days) */
export const POSTED_WITHIN_OPTIONS = [
  { value: 1, label: "Past 24 hours" },
  { value: 3, label: "Past 3 days" },
  { value: 7, label: "Past 7 days" },
  { value: 14, label: "Past 14 days" },
  { value: 30, label: "Past 30 days" },
];

export function createInitialFilterState() {
  return {
    keyword: "",
    location: "",
    sort: /** @type {SortMode} */ ("newest"),
    sector: "",
    jobFamilies: [],
    remote: [],
    seniority: [],
    employmentTypes: [],
    tags: [],
    regions: [],
    companies: [],
    postedWithin: /** @type {number|null} */ (null),
  };
}

/**
 * @param {ReturnType<typeof createInitialFilterState>} state
 */
export function isFilterDirty(state) {
  const i = createInitialFilterState();
  if (state.keyword.trim() !== i.keyword) return true;
  if (state.location.trim() !== i.location) return true;
  if (state.sort !== i.sort) return true;
  if (state.sector !== i.sector) return true;
  if (state.postedWithin !== i.postedWithin) return true;
  if (state.jobFamilies.length) return true;
  if (state.remote.length) return true;
  if (state.seniority.length) return true;
  if (state.employmentTypes.length) return true;
  if (state.tags.length) return true;
  if (state.regions.length) return true;
  if (state.companies.length) return true;
  return false;
}

/**
 * Count of advanced (non–search/sort) selections for UI badges.
 * @param {ReturnType<typeof createInitialFilterState>} state
 */
export function countAdvancedFilterSelections(state) {
  let n = 0;
  n += state.jobFamilies.length;
  n += state.remote.length;
  n += state.seniority.length;
  n += state.employmentTypes.length;
  n += state.tags.length;
  n += state.regions.length;
  n += state.companies.length;
  if (state.sector) n += 1;
  if (state.postedWithin != null) n += 1;
  return n;
}
