import { getJobTags } from "./jobFieldHelpers";

export const COMPANY_SECTORS = [
  {
    id: "defense",
    title: "Defense",
    keywords: [
      "defense",
      "defence",
      "military",
      "dod",
      "department of defense",
      "air force",
      "navy",
      "army",
      "warfighter",
      "mission systems",
      "national security",
    ],
  },
  {
    id: "delivery-logistics",
    title: "Delivery & Logistics",
    keywords: [
      "delivery",
      "last-mile",
      "logistics",
      "fulfillment",
      "distribution",
      "route network",
      "medical delivery",
    ],
  },
  {
    id: "public-safety",
    title: "Public Safety",
    keywords: [
      "public safety",
      "first responder",
      "law enforcement",
      "fire department",
      "emergency response",
      "search and rescue",
    ],
  },
  {
    id: "inspection-industrial",
    title: "Inspection & Industrial",
    keywords: [
      "inspection",
      "asset monitoring",
      "infrastructure",
      "utility inspection",
      "industrial",
      "construction",
      "surveying",
      "mapping",
      "mining",
    ],
  },
  {
    id: "agriculture",
    title: "Agriculture",
    keywords: ["agriculture", "farming", "agtech", "crop", "precision agriculture", "spraying", "agronomy"],
  },
  {
    id: "enterprise-software",
    title: "Enterprise Software",
    keywords: [
      "platform",
      "saas",
      "fleet management",
      "airspace",
      "utm",
      "data platform",
      "cloud software",
      "workflow software",
    ],
  },
];

const KNOWN_COMPANY_SECTORS = {
  anduril: "defense",
  shieldai: "defense",
  skydio: "inspection-industrial",
  zipline: "delivery-logistics",
};

function normalizeCompanyKey(name) {
  return String(name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function textFields(job) {
  const tags = getJobTags(job).join(" ").toLowerCase();
  return {
    title: String(job?.title || "").toLowerCase(),
    description: String(job?.description || "").toLowerCase(),
    tags,
  };
}

function scoreSectorForJob(sector, job) {
  const f = textFields(job);
  let score = 0;
  for (const kw of sector.keywords) {
    if (f.description.includes(kw)) score += 2;
    if (f.title.includes(kw)) score += 1;
    if (f.tags.includes(kw)) score += 1;
  }
  return score;
}

export function inferCompanySector(companyName, jobs, minConfidence = 0.34) {
  const byId = new Map(COMPANY_SECTORS.map((s) => [s.id, 0]));
  const normalizedCompany = normalizeCompanyKey(companyName);
  const known = KNOWN_COMPANY_SECTORS[normalizedCompany];
  if (known && byId.has(known)) byId.set(known, byId.get(known) + 5);

  for (const job of jobs || []) {
    for (const sector of COMPANY_SECTORS) {
      byId.set(sector.id, byId.get(sector.id) + scoreSectorForJob(sector, job));
    }
  }

  let best = null;
  let bestScore = 0;
  let total = 0;
  for (const sector of COMPANY_SECTORS) {
    const score = byId.get(sector.id) || 0;
    total += score;
    if (score > bestScore) {
      best = sector;
      bestScore = score;
    }
  }
  if (!best || bestScore <= 0 || total <= 0) return null;
  const confidence = bestScore / total;
  if (confidence < minConfidence) return null;
  return best;
}

