import { getJobFamily, getJobTags, getLocationText } from "./jobFieldHelpers";

function textOf(job) {
  const tags = Array.isArray(job?.tags) ? job.tags.join(" ") : String(job?.tags || "");
  return `${job?.title || ""} ${job?.description || ""} ${tags}`.toLowerCase();
}

function familyOf(job) {
  return String(getJobFamily(job) || "").toLowerCase();
}

function locationOf(job) {
  return String(getLocationText(job) || "").toLowerCase();
}

/**
 * Guide hub: `heading` is both H1 and title base (before `| Drone Roles`).
 * Long qualifiers belong in the on-page intro (built from live job data).
 */
export const GUIDE_PAGES = {
  "drone-jobs-europe": {
    slug: "drone-jobs-europe",
    heading: "Drone Jobs in Europe",
    relatedGuides: ["uav-pilot-jobs", "drone-engineering-jobs"],
    match: (job) => {
      const location = locationOf(job);
      if (!location) return false;
      const usSignal = /\busa\b|\bu\.s\.a\b|\bunited states\b|\bus\b|\bcalifornia\b|\btexas\b|\bnew york\b|\bvirginia\b|\bflorida\b|\bwashington\b/.test(
        location
      );
      if (usSignal) return false;
      return /\beurope\b|\beu\b|\beuropean\b|\bgermany\b|\bfrance\b|\bspain\b|\bitaly\b|\bnetherlands\b|\bpoland\b|\buk\b|\bunited kingdom\b|\bireland\b|\bbelgium\b|\bsweden\b|\bnorway\b|\bfinland\b|\bdenmark\b|\bportugal\b|\bswitzerland\b|\baustria\b|\bczech\b|\bromania\b|\bgreece\b/.test(
        location
      );
    },
  },
  "uav-pilot-jobs": {
    slug: "uav-pilot-jobs",
    heading: "UAV Pilot Jobs",
    relatedGuides: ["drone-jobs-europe", "drone-engineering-jobs"],
    match: (job) => {
      const family = familyOf(job);
      const text = textOf(job);
      const title = String(job?.title || "").toLowerCase();
      const tags = Array.isArray(job?.tags)
        ? job.tags.map((tag) => String(tag || "").toLowerCase()).join(" ")
        : String(job?.tags || "").toLowerCase();
      const pilotSignal = /\bpilot\b|\bremote pilot\b|\bdrone pilot\b|\buav operator\b|\bflight operator\b|\bflight test operator\b/.test(
        title
      );
      const broadOpsSignal = /\bflight operations\b|\bbvlos\b/.test(`${title} ${tags}`);
      const clearlyEngineeringRole =
        /\bengineer\b|\bengineering\b|\bsoftware\b|\bperception\b|\bautonomy\b|\bavionics\b|\bcontrols\b/.test(
          title
        );
      if (clearlyEngineeringRole && !pilotSignal) return false;
      return (
        family.includes("pilot") ||
        pilotSignal ||
        (broadOpsSignal && !clearlyEngineeringRole)
      );
    },
  },
  "drone-engineering-jobs": {
    slug: "drone-engineering-jobs",
    heading: "Drone Engineering Jobs",
    relatedGuides: ["uav-pilot-jobs", "drone-jobs-europe"],
    match: (job) => {
      const family = familyOf(job);
      const text = textOf(job);
      const title = String(job?.title || "").toLowerCase();
      const hasDroneContext = /\bdrone\b|\buav\b|\buas\b|\bunmanned\b|\bautonomy\b|\bflight systems\b/.test(text);
      const isEngineeringRole = /\bengineer\b|\bengineering\b|\bsystems\b|\bavionics\b|\bcontrols\b|\bsoftware\b/.test(
        `${family} ${title}`
      );
      const advancedSignals = /\bautonomy\b|\bflight systems\b|\bavionics\b|\bcontrols\b|\bguidance\b|\bnavigation\b|\bperception\b|\buav software\b|\bsystems engineer\b/.test(
        text
      );
      const titleSignals = /\bengineer\b|\bengineering\b|\bsystems\b|\bsoftware\b|\bautonomy lead\b|\barchitect\b/.test(
        title
      );
      const clearlyNonEngineering =
        /\baccount executive\b|\bbusiness development\b|\bsourcer\b|\brecruiter\b|\bmarketing\b|\bsales\b/.test(
          title
        );
      if (clearlyNonEngineering) return false;
      return (
        (isEngineeringRole && hasDroneContext) ||
        (advancedSignals && titleSignals)
      );
    },
  },
};

export function getGuideConfig(slug) {
  return GUIDE_PAGES[String(slug || "").toLowerCase()] || null;
}
