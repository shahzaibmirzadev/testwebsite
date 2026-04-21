import { getJobFamily } from "./jobFieldHelpers";
import { matchesSectorId } from "./sectorLogic";

export const MIN_BROWSE_ROLE_COUNT = 5;

/** Browse-by-category cards (maps to `jobFamilies` filter; OR match within family). */
export const BROWSE_CATEGORIES = [
  {
    id: "pilot",
    title: "Pilot",
    jobFamilies: ["Pilot"],
    gradient:
      "linear-gradient(135deg, #1d4ed8 0%, #2563eb 45%, #60a5fa 100%)",
    matcher: (job) => matchesSectorId(job, "pilot"),
  },
  {
    id: "engineering",
    title: "Engineering",
    jobFamilies: ["Engineering"],
    gradient:
      "linear-gradient(135deg, #065f46 0%, #059669 48%, #34d399 100%)",
    matcher: (job) => matchesSectorId(job, "engineering"),
  },
  {
    id: "operations",
    title: "Operations",
    jobFamilies: ["Operator", "Field Engineering"],
    gradient:
      "linear-gradient(135deg, #b45309 0%, #d97706 48%, #fbbf24 100%)",
    matcher: (job) => matchesSectorId(job, "operations"),
  },
  {
    id: "testing",
    title: "Testing",
    jobFamilies: ["Testing", "Engineering"],
    gradient:
      "linear-gradient(135deg, #be185d 0%, #db2777 45%, #f472b6 100%)",
    matcher: (job) => matchesSectorId(job, "testing"),
  },
  {
    id: "defense",
    title: "Defense",
    jobFamilies: ["Engineering", "Operator"],
    gradient:
      "linear-gradient(135deg, #991b1b 0%, #dc2626 48%, #f87171 100%)",
    matcher: (job) => matchesSectorId(job, "defense"),
  },
  {
    id: "software",
    title: "Software",
    jobFamilies: ["Engineering"],
    gradient:
      "linear-gradient(135deg, #4338ca 0%, #6366f1 45%, #a5b4fc 100%)",
    matcher: (job) => matchesSectorId(job, "software"),
  },
  {
    id: "hardware",
    title: "Hardware",
    jobFamilies: ["Engineering", "Technician"],
    gradient:
      "linear-gradient(135deg, #7c2d12 0%, #c2410c 45%, #fb923c 100%)",
    matcher: (job) => matchesSectorId(job, "hardware"),
  },
  {
    id: "technician",
    title: "Technician",
    jobFamilies: ["Technician"],
    gradient:
      "linear-gradient(135deg, #365314 0%, #65a30d 45%, #a3e635 100%)",
    matcher: (job) => matchesSectorId(job, "technician"),
  },
  {
    id: "business-development",
    title: "Business Development",
    jobFamilies: ["Business Development"],
    gradient:
      "linear-gradient(135deg, #0f766e 0%, #0d9488 48%, #5eead4 100%)",
    matcher: (job) => matchesSectorId(job, "business-development"),
  },
  {
    id: "administrative",
    title: "Administrative",
    jobFamilies: ["Administrative"],
    gradient:
      "linear-gradient(135deg, #1f2937 0%, #4b5563 45%, #9ca3af 100%)",
    matcher: (job) => matchesSectorId(job, "administrative"),
  },
  {
    id: "product-program",
    title: "Product & Program",
    jobFamilies: ["Engineering", "Other"],
    gradient:
      "linear-gradient(135deg, #9f1239 0%, #e11d48 48%, #fb7185 100%)",
    matcher: (job) => matchesSectorId(job, "product-program"),
  },
  {
    id: "manufacturing",
    title: "Manufacturing",
    jobFamilies: ["Technician", "Other"],
    gradient:
      "linear-gradient(135deg, #422006 0%, #a16207 48%, #facc15 100%)",
    matcher: (job) => matchesSectorId(job, "manufacturing"),
  },
  {
    id: "data-ai",
    title: "Data & AI",
    jobFamilies: ["Engineering", "Testing"],
    gradient:
      "linear-gradient(135deg, #083344 0%, #0e7490 48%, #67e8f9 100%)",
    matcher: (job) => matchesSectorId(job, "data-ai"),
  },
  {
    id: "geospatial",
    title: "Geospatial",
    jobFamilies: ["Operator", "Engineering"],
    gradient:
      "linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 48%, #93c5fd 100%)",
    matcher: (job) => matchesSectorId(job, "geospatial"),
  },
  {
    id: "quality-safety",
    title: "Quality & Safety",
    jobFamilies: ["Testing", "Other"],
    gradient:
      "linear-gradient(135deg, #581c87 0%, #9333ea 48%, #d8b4fe 100%)",
    matcher: (job) => matchesSectorId(job, "quality-safety"),
  },
];

/**
 * @param {Record<string, unknown>[]} jobs
 * @param {string[]} jobFamilies
 */
export function countJobsForCategory(jobs, jobFamilies) {
  const selected = (jobFamilies || []).map((f) => String(f).toLowerCase());
  if (selected.length === 0) return 0;
  return jobs.filter((job) => selected.includes(String(getJobFamily(job) || "").toLowerCase())).length;
}

export function countJobsForSector(jobs, category) {
  if (typeof category?.matcher === "function") {
    return jobs.filter((job) => category.matcher(job)).length;
  }
  return countJobsForCategory(jobs, category?.jobFamilies || []);
}

/**
 * @param {string|null} family
 * @returns {string}
 */
export function getCategoryGradientByFamily(family) {
  if (!family) return "linear-gradient(135deg, #2563eb 0%, #3b82f6 50%, #93c5fd 100%)";
  const normalized = family.toLowerCase();
  const match = BROWSE_CATEGORIES.find((c) =>
    c.jobFamilies.some((f) => f.toLowerCase() === normalized)
  );
  return match?.gradient ?? "linear-gradient(135deg, #2563eb 0%, #3b82f6 50%, #93c5fd 100%)";
}

/**
 * Ordered list of category gradients matched by sector logic.
 * @param {Record<string, unknown>} job
 * @returns {string[]}
 */
export function getCategoryGradientsByJob(job) {
  const matched = BROWSE_CATEGORIES.filter((category) => {
    if (typeof category?.matcher !== "function") return false;
    return category.matcher(job);
  }).map((category) => category.gradient);
  return [...new Set(matched)];
}

/**
 * Ordered list of matched categories with labels and gradients.
 * @param {Record<string, unknown>} job
 * @returns {{ id: string, title: string, gradient: string }[]}
 */
export function getCategoryMatchesByJob(job) {
  const matched = BROWSE_CATEGORIES.filter((category) => {
    if (typeof category?.matcher !== "function") return false;
    return category.matcher(job);
  }).map((category) => ({
    id: category.id,
    title: category.title,
    gradient: category.gradient,
  }));

  const seen = new Set();
  return matched.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

/**
 * Top N sector categories for a company’s jobs, by match frequency (for directory / summaries).
 * @param {Record<string, unknown>[]} jobs
 * @param {number} [limit]
 * @returns {{ id: string, title: string, gradient: string }[]}
 */
export function getTopSectorCategoriesForJobs(jobs, limit = 3) {
  const list = Array.isArray(jobs) ? jobs : [];
  const specialties = BROWSE_CATEGORIES.filter((c) => typeof c?.matcher === "function");
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const job of list) {
    for (const cat of specialties) {
      if (cat.matcher(job)) {
        counts.set(cat.id, (counts.get(cat.id) || 0) + 1);
      }
    }
  }
  if (counts.size === 0) return [];
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return sorted
    .slice(0, Math.max(0, limit))
    .map(([id]) => {
      const c = BROWSE_CATEGORIES.find((x) => x.id === id);
      return c ? { id: c.id, title: c.title, gradient: c.gradient } : null;
    })
    .filter(Boolean);
}
