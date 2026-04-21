import { getJobFamily } from "./jobFieldHelpers";
import { matchesSectorId } from "./sectorLogic";

function jobTextWithTags(job) {
  return `${job?.title || ""} ${job?.description || ""} ${
    Array.isArray(job?.tags) ? job.tags.join(" ") : job?.tags || ""
  }`.toLowerCase();
}

function hasDroneSignal(text) {
  return /\bdrone\b|\buav\b|\buas\b|\bunmanned\b|\buncrewed\b|\brpas\b/.test(text);
}

/** Hub display name (H1) lives in `heading`; SEO title base must match. */
export const CATEGORY_PAGES = {
  "uav-operator": {
    heading: "UAV Operator Jobs",
    match: (job) => {
      return matchesSectorId(job, "operations");
    },
  },
  "drone-pilot": {
    heading: "Drone Pilot Jobs",
    match: (job) => {
      return matchesSectorId(job, "pilot");
    },
  },
  bvlos: {
    heading: "BVLOS Jobs",
    match: (job) => {
      const tags = Array.isArray(job?.tags) ? job.tags.join(" ").toLowerCase() : String(job?.tags || "").toLowerCase();
      const title = String(job?.title || "").toLowerCase();
      const desc = String(job?.description || "").toLowerCase();
      return /\bbvlos\b/.test(`${tags} ${title} ${desc}`);
    },
  },
  "flight-test": {
    heading: "Flight Test Drone Jobs",
    match: (job) => {
      const text = jobTextWithTags(job);
      return hasDroneSignal(text) && /\bflight test\b|\btest engineer\b|\btest pilot\b/.test(text);
    },
  },
  "field-engineer": {
    heading: "Field Engineer Drone Jobs",
    match: (job) => {
      const family = String(getJobFamily(job) || "").toLowerCase();
      const title = String(job?.title || "").toLowerCase();
      return family.includes("field") || /\bfield engineer\b|\bintegration engineer\b/.test(title);
    },
  },
  "defense-drone-jobs": {
    heading: "Defense Drone Jobs",
    match: (job) => {
      const text = jobTextWithTags(job);
      return hasDroneSignal(text) && /\bdefense\b|\bdefence\b|\bmilitary\b|\bdod\b/.test(text);
    },
  },
  "inspection-drone-jobs": {
    heading: "Inspection Drone Jobs",
    match: (job) => {
      const text = jobTextWithTags(job);
      return (
        hasDroneSignal(text) &&
        /\binspection\b|\binspect\b|\basset inspection\b|\butility inspection\b/.test(text)
      );
    },
  },
  "mapping-surveying-drone-jobs": {
    heading: "Mapping and Surveying Drone Jobs",
    match: (job) => {
      const text = jobTextWithTags(job);
      return /\bmapping\b|\bsurvey\b|\bphotogrammetry\b|\bgeospatial\b/.test(text);
    },
  },
  "delivery-logistics-drone-jobs": {
    heading: "Delivery and Logistics Drone Jobs",
    match: (job) => {
      const text = jobTextWithTags(job);
      return hasDroneSignal(text) && /\bdelivery\b|\blogistics\b|\blast mile\b/.test(text);
    },
  },
  "entry-level-drone-jobs": {
    heading: "Entry Level Drone Jobs",
    match: (job) => {
      const title = String(job?.title || "").toLowerCase();
      return /\bjunior\b|\bentry\b|\bintern\b|\bgraduate\b/.test(title);
    },
  },
  "senior-drone-jobs": {
    heading: "Senior Drone Jobs",
    match: (job) => {
      const title = String(job?.title || "").toLowerCase();
      return /\bsenior\b|\bstaff\b|\bprincipal\b|\blead\b/.test(title);
    },
  },
};

export function getCategoryConfig(slug) {
  return CATEGORY_PAGES[String(slug || "").toLowerCase()] || null;
}
