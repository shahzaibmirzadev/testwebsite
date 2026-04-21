import { getJobFamily, getJobTags } from "./jobFieldHelpers";

function textBlob(job) {
  return [
    String(job?.title || ""),
    String(job?.description || ""),
    String(job?.location || ""),
    getJobFamily(job) || "",
    ...getJobTags(job),
  ]
    .join(" ")
    .toLowerCase();
}

function includesAny(text, terms) {
  return terms.some((term) => text.includes(term));
}

function hasDroneSignal(text) {
  return includesAny(text, [
    "drone",
    "uav",
    "uas",
    "unmanned",
    "uncrewed",
    "rpas",
    "flight test",
  ]);
}

function titleText(job) {
  return String(job?.title || "").toLowerCase();
}

function isPilotIntentTitle(title) {
  return (
    /\b(remote|drone|uav|uas|rpas)\s+pilot\b/.test(title) ||
    /\btest pilot\b/.test(title) ||
    /\bpilot in command\b/.test(title) ||
    /\bchief pilot\b/.test(title) ||
    /\bpilot\b/.test(title)
  );
}

function isPilotExcludedTitle(title) {
  return (
    /\b(program|project|product)\s+manager\b/.test(title) ||
    /\bstandards?\b/.test(title) ||
    /\bsafety\b/.test(title) ||
    /\bcompliance\b/.test(title) ||
    /\bdirector\b/.test(title) ||
    /\bcoordinator\b/.test(title) ||
    /\btrainer\b/.test(title)
  );
}

export const SECTOR_RULES = {
  pilot: {
    label: "Pilot",
    match: (job) => {
      const family = String(getJobFamily(job) || "").toLowerCase();
      const title = titleText(job);
      const blob = textBlob(job);

      const hasPilotTitle = isPilotIntentTitle(title);
      const excludedTitle = isPilotExcludedTitle(title);

      if (hasPilotTitle && !excludedTitle) return true;
      if (family === "pilot" && hasPilotTitle && !excludedTitle) return true;

      if (
        family === "operator" &&
        /\b(operator|pilot)\b/.test(title) &&
        includesAny(blob, ["uav", "uas", "drone", "unmanned", "remote pilot"])
      ) {
        return true;
      }

      if (excludedTitle) return false;
      return includesAny(blob, [
        "remote pilot",
        "drone pilot",
        "uav pilot",
        "uas pilot",
        "test pilot",
        "pilot in command",
        "uav operator",
        "uas operator",
        "flight test operator",
      ]);
    },
  },
  engineering: {
    label: "Engineering",
    match: (job) => {
      const family = String(getJobFamily(job) || "").toLowerCase();
      if (family === "engineering") return true;
      const title = titleText(job);
      const blob = textBlob(job);

      const titleEngineeringIntent = includesAny(title, [
        "engineer",
        "engineering",
        "systems engineer",
        "avionics engineer",
        "controls engineer",
        "embedded engineer",
        "software engineer",
        "hardware engineer",
      ]);
      if (titleEngineeringIntent && hasDroneSignal(blob)) return true;

      // Fallback: stronger engineering phrases with explicit drone/UAS context.
      return hasDroneSignal(blob) &&
        includesAny(blob, [
          "systems engineer",
          "avionics engineer",
          "controls engineer",
          "embedded engineer",
          "firmware engineer",
          "test engineer",
          "integration engineer",
        ]);
    },
  },
  operations: {
    label: "Operations",
    match: (job) => {
      const family = String(getJobFamily(job) || "").toLowerCase();
      if (family === "operator" || family === "field engineering") return true;
      const title = titleText(job);
      const blob = textBlob(job);

      const titleOpsIntent = includesAny(title, [
        "operator",
        "operations specialist",
        "operations lead",
        "operations manager",
        "mission operations",
        "mission ops",
        "flight operations",
        "flight operator",
      ]);

      if (titleOpsIntent && hasDroneSignal(blob)) return true;

      // Fallback for sparse titles: require both domain + operations language.
      return hasDroneSignal(blob) &&
        includesAny(blob, [
          "mission operations",
          "mission ops",
          "flight operations",
          "flight operator",
          "uav operator",
          "uas operator",
          "operations specialist",
        ]);
    },
  },
  testing: {
    label: "Testing",
    match: (job) => {
      const family = String(getJobFamily(job) || "").toLowerCase();
      if (family === "testing") return true;
      const title = titleText(job);
      const blob = textBlob(job);

      const titleTestingIntent = includesAny(title, [
        "flight test",
        "test engineer",
        "test pilot",
        "verification engineer",
        "validation engineer",
        "qa engineer",
        "systems test",
      ]);

      if (titleTestingIntent && hasDroneSignal(blob)) return true;

      // Guard against generic "test" chatter by requiring strong terms + drone context.
      return hasDroneSignal(blob) &&
        includesAny(blob, [
          "flight test",
          "test engineer",
          "test pilot",
          "verification",
          "validation",
          "qualification testing",
          "acceptance testing",
          "systems test",
        ]);
    },
  },
  defense: {
    label: "Defense",
    match: (job) => {
      const blob = textBlob(job);
      return includesAny(blob, ["defense", "defence", "military", "dod", "air force", "navy"]);
    },
  },
  software: {
    label: "Software",
    match: (job) => {
      const blob = textBlob(job);
      return includesAny(blob, [
        "software",
        "backend",
        "frontend",
        "full stack",
        "embedded software",
        "python",
        "c++",
      ]);
    },
  },
  hardware: {
    label: "Hardware",
    match: (job) => {
      const blob = textBlob(job);
      return includesAny(blob, [
        "hardware",
        "electrical",
        "mechanical",
        "pcb",
        "avionics",
        "manufacturing",
      ]);
    },
  },
  technician: {
    label: "Technician",
    match: (job) => {
      const family = String(getJobFamily(job) || "").toLowerCase();
      if (family === "technician") return true;
      const blob = textBlob(job);
      return includesAny(blob, ["technician", "maintenance", "repair"]);
    },
  },
  "business-development": {
    label: "Business Development",
    match: (job) => {
      const family = String(getJobFamily(job) || "").toLowerCase();
      if (family === "business_development" || family === "business development") return true;
      const title = titleText(job);
      const blob = textBlob(job);
      const roleSignal = includesAny(title, [
        "business development",
        "biz dev",
        "partnership",
        "alliances",
        "account executive",
        "sales manager",
        "inside sales",
        "sdr",
        "bdr",
      ]);
      return roleSignal && hasDroneSignal(blob);
    },
  },
  administrative: {
    label: "Administrative",
    match: (job) => {
      const family = String(getJobFamily(job) || "").toLowerCase();
      if (family === "administrative") return true;
      const title = titleText(job);
      const blob = textBlob(job);
      const roleSignal = includesAny(title, [
        "administrative",
        "administrator",
        "admin assistant",
        "administrative assistant",
        "executive assistant",
        "office manager",
        "operations coordinator",
        "program coordinator",
        "project coordinator",
      ]);
      return roleSignal && hasDroneSignal(blob);
    },
  },
  "product-program": {
    label: "Product & Program",
    match: (job) => {
      const title = titleText(job);
      const blob = textBlob(job);
      return (
        includesAny(title, ["product manager", "program manager", "technical program manager", "tpm"]) &&
        hasDroneSignal(blob)
      );
    },
  },
  manufacturing: {
    label: "Manufacturing",
    match: (job) => {
      const title = titleText(job);
      const blob = textBlob(job);
      return includesAny(blob, [
        "manufacturing",
        "production technician",
        "production operator",
        "assembly technician",
        "assembly",
        "quality inspector",
        "supply chain",
      ]) && (hasDroneSignal(blob) || includesAny(title, ["uav", "uas", "drone"]));
    },
  },
  "data-ai": {
    label: "Data & AI",
    match: (job) => {
      const blob = textBlob(job);
      return hasDroneSignal(blob) &&
        includesAny(blob, [
          "machine learning",
          "ai engineer",
          "data scientist",
          "data engineer",
          "perception",
          "computer vision",
          "slam",
          "sensor fusion",
        ]);
    },
  },
  geospatial: {
    label: "Geospatial",
    match: (job) => {
      const blob = textBlob(job);
      return hasDroneSignal(blob) &&
        includesAny(blob, [
          "geospatial",
          "gis",
          "mapping",
          "survey",
          "photogrammetry",
          "remote sensing",
          "cartography",
        ]);
    },
  },
  "quality-safety": {
    label: "Quality & Safety",
    match: (job) => {
      const title = titleText(job);
      const blob = textBlob(job);
      return hasDroneSignal(blob) &&
        includesAny(`${title} ${blob}`, [
          "quality engineer",
          "quality assurance",
          "qa engineer",
          "safety engineer",
          "flight safety",
          "compliance engineer",
          "airworthiness",
          "regulatory",
        ]);
    },
  },
};

export function getSectorLabel(id) {
  return SECTOR_RULES[id]?.label || String(id || "");
}

export function matchesSectorId(job, id) {
  const rule = SECTOR_RULES[id];
  if (!rule || typeof rule.match !== "function") return true;
  return rule.match(job);
}

