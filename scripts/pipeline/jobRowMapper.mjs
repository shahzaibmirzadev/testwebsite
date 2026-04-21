/**
 * Map jobs_db_ready.json rows → public.jobs upsert shape (aligned with scripts/daily-sync.js).
 */
const MAX_JOB_AGE_DAYS = 90;
const MAX_JOB_AGE_MS = MAX_JOB_AGE_DAYS * 24 * 60 * 60 * 1000;

/**
 * @param {string} value
 */
function cleanText(value) {
  if (!value) return "";
  return String(value)
    .replace(/\r/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .trim();
}

function dedupeArray(values) {
  return [...new Set((values || []).filter(Boolean))];
}

/**
 * @param {string} title
 */
function detectSeniority(title) {
  const t = cleanText(title).toLowerCase();
  if (/\bprincipal\b/.test(t)) return "principal";
  if (/\bstaff\b/.test(t)) return "staff";
  if (/\bsenior\b/.test(t) || /\bsr\b/.test(t)) return "senior";
  if (/\blead\b/.test(t)) return "lead";
  if (/\bjunior\b/.test(t) || /\bjr\b/.test(t)) return "junior";
  if (/\bintern\b/.test(t) || /\binternship\b/.test(t)) return "intern";
  return null;
}

/**
 * @param {Record<string, unknown>} job
 */
function classifyJob(job) {
  const title = cleanText(String(job.title || "")).toLowerCase();
  const text = `${title} ${cleanText(String(job.description || "")).toLowerCase()} ${cleanText(String(job.description_raw || "")).toLowerCase()}`;

  let jobFamily = "other";
  const pilotTitleExcluded =
    /\b(program|project|product)\s+manager\b/.test(title) ||
    /\bstandards?\b/.test(title) ||
    /\bsafety\b/.test(title) ||
    /\bcompliance\b/.test(title);

  if ((/\bpilot\b/.test(title) || /\bremote pilot\b/.test(title)) && !pilotTitleExcluded) {
    jobFamily = "pilot";
  } else if (/\boperator\b/.test(title)) {
    jobFamily = "operator";
  } else if (/\btechnician\b/.test(title) || /\bmechanic\b/.test(title)) {
    jobFamily = "technician";
  } else if (/\bflight test\b/.test(title) || /\btest engineer\b/.test(title)) {
    jobFamily = "testing";
  } else if (/\bfield engineer\b/.test(title)) {
    jobFamily = "field_engineering";
  } else if (/\b(business development|biz dev|partnerships?|alliances?)\b/.test(title)) {
    jobFamily = "business_development";
  } else if (/\b(administrative|administrator|admin assistant|administrative assistant|executive assistant|office administrator|operations coordinator|program coordinator|project coordinator)\b/.test(title)) {
    jobFamily = "administrative";
  } else if (/\bengineer\b/.test(title)) {
    jobFamily = "engineering";
  }

  const tags = [];
  const tagRules = [
    { tag: "drone", patterns: [/\bdrone\b/, /\bdrones\b/] },
    { tag: "uav", patterns: [/\buav\b/] },
    { tag: "uas", patterns: [/\buas\b/] },
    { tag: "unmanned", patterns: [/\bunmanned\b/, /\buncrewed\b/] },
    { tag: "counter-uas", patterns: [/\bcounter[\s-]?uas\b/, /\bcounter[\s-]?drone\b/] },
    { tag: "flight-test", patterns: [/\bflight test\b/, /\btest engineer\b/] },
    { tag: "embedded", patterns: [/\bembedded\b/] },
    { tag: "firmware", patterns: [/\bfirmware\b/] },
    { tag: "controls", patterns: [/\bcontrols\b/, /\bflight controls\b/] },
    { tag: "gnc", patterns: [/\bgnc\b/, /\bguidance\b/, /\bnavigation\b/] },
    { tag: "avionics", patterns: [/\bavionics\b/] },
    { tag: "payload", patterns: [/\bpayload\b/] },
    { tag: "integration", patterns: [/\bintegration\b/] },
    { tag: "field", patterns: [/\bfield\b/] },
    { tag: "maintenance", patterns: [/\bmaintenance\b/] },
    { tag: "inspection", patterns: [/\binspection\b/] },
    { tag: "mapping", patterns: [/\bmapping\b/, /\bphotogrammetry\b/, /\bsurvey(?:ing)?\b/] },
    { tag: "defense", patterns: [/\bdefen[cs]e\b/, /\bmilitary\b/, /\bdod\b/, /\bwarfighter\b/] },
    { tag: "autonomy", patterns: [/\bautonomy\b/] },
    { tag: "computer-vision", patterns: [/\bcomputer vision\b/, /\bperception\b/] },
    { tag: "fixed-wing", patterns: [/\bfixed wing\b/] },
    { tag: "multirotor", patterns: [/\bmultirotor\b/, /\bquadcopter\b/] },
    { tag: "vtol", patterns: [/\bvtol\b/] },
    { tag: "bvlos", patterns: [/\bbvlos\b/] },
    { tag: "remote-pilot", patterns: [/\bremote pilot\b/] },
  ];

  for (const rule of tagRules) {
    if (rule.patterns.some((pattern) => pattern.test(text))) {
      tags.push(rule.tag);
    }
  }

  return {
    job_family: jobFamily,
    tags: dedupeArray(tags),
  };
}

/**
 * @param {Record<string, unknown>} job
 */
function detectRemoteStatus(job) {
  const text = [
    job.location,
    job.description,
    job.description_raw,
  ]
    .map((x) => cleanText(String(x ?? "")).toLowerCase())
    .join(" ");

  if (!text) return "on-site";
  if (/\bhybrid\b/.test(text)) return "hybrid";
  if (/\bremote\b/.test(text)) return "remote";
  if (/\bon[\s-]?site\b/.test(text) || /\bonsite\b/.test(text)) return "on-site";
  return "on-site";
}

/**
 * @param {string | null | undefined} isoDate
 */
export function dateOlderThanMaxAge(isoDate) {
  if (!isoDate) return true;
  return new Date(String(isoDate)).getTime() < Date.now() - MAX_JOB_AGE_MS;
}

/**
 * @param {string | null | undefined} postedAt
 * @param {string | null | undefined} existingExpiresAt
 */
export function computeExpiresAt(postedAt, existingExpiresAt) {
  if (postedAt) {
    return new Date(new Date(postedAt).getTime() + MAX_JOB_AGE_MS).toISOString();
  }
  if (existingExpiresAt) return existingExpiresAt;
  return new Date(Date.now() + MAX_JOB_AGE_MS).toISOString();
}

/**
 * @param {string | null | undefined} postedAt
 */
export function computePostedRelativeDays(postedAt) {
  if (!postedAt) return null;
  const postedMs = new Date(postedAt).getTime();
  if (Number.isNaN(postedMs)) return null;
  const diff = Date.now() - postedMs;
  if (diff < 0) return 0;
  return Math.floor(diff / (24 * 60 * 60 * 1000));
}

function nowIso() {
  return new Date().toISOString();
}

/**
 * @param {Record<string, unknown>} row — jobs_db_ready row
 * @param {{ id?: string, expires_at?: string | null } | null} existing
 */
export function mapDbReadyToJobsPayload(row, existing) {
  const classification = classifyJob(row);
  const fromPrepare = Array.isArray(row.tags) ? row.tags : [];
  const tags = dedupeArray([...fromPrepare, ...classification.tags]);

  const postedAt = row.posted_at ?? null;
  const seniority = detectSeniority(String(row.title || ""));
  const remote = row.remote_status
    ? String(row.remote_status)
    : detectRemoteStatus(row);

  /** @type {Record<string, unknown>} */
  const out = {
    source: String(row.source || ""),
    source_job_id: String(row.source_job_id || ""),
    title: String(row.title || ""),
    company: String(row.company || ""),
    location: row.location != null ? String(row.location) : "",
    description: String(row.description ?? row.description_raw ?? ""),
    description_raw: String(row.description_raw || ""),
    description_html: String(row.description_html || ""),
    apply_url: String(row.apply_url || ""),
    is_active: true,
    is_relevant: Boolean(row.is_relevant),
    last_seen_at: String(row.last_seen_at || nowIso()),
    posted_at: postedAt,
    posted_relative_days: computePostedRelativeDays(
      postedAt ? String(postedAt) : null
    ),
    expires_at: computeExpiresAt(
      postedAt ? String(postedAt) : null,
      existing?.expires_at ?? null
    ),
    job_family: classification.job_family,
    tags,
    seniority,
    employment_type: row.employment_type ?? null,
    remote_status: remote,
    fetch_status: "pipeline-deploy",
    detail_fetched: false,
    detail_fetch_failed: false,
    last_error: null,
    source_raw_list_json: null,
    source_raw_detail_json: null,
  };
  if (!existing?.id) {
    out.first_seen_at = nowIso();
  }
  return out;
}

/**
 * @param {Record<string, unknown>} row
 */
export function isEligibleForPublish(row) {
  if (!row || typeof row !== "object") return false;
  if (!Boolean(row.is_relevant)) return false;
  if (dateOlderThanMaxAge(row.posted_at ? String(row.posted_at) : null)) {
    return false;
  }
  const title = cleanText(String(row.title || ""));
  const apply = String(row.apply_url || "").trim();
  if (!title || !apply.startsWith("http")) return false;
  if (!String(row.source || "").trim() || !String(row.source_job_id || "").trim()) {
    return false;
  }
  if (!String(row.company || "").trim()) return false;
  return true;
}

/**
 * Keys set by mapDbReadyToJobsPayload (for diagnostics; optional first_seen_at).
 * Not every deploy path sends every column the DB allows — this is the pipeline contract.
 */
export const JOBS_UPSERT_CORE_KEYS = [
  "source",
  "source_job_id",
  "title",
  "company",
  "location",
  "description",
  "description_raw",
  "description_html",
  "apply_url",
  "is_active",
  "is_relevant",
  "last_seen_at",
  "posted_at",
  "posted_relative_days",
  "expires_at",
  "job_family",
  "tags",
  "seniority",
  "employment_type",
  "remote_status",
  "fetch_status",
  "detail_fetched",
  "detail_fetch_failed",
  "last_error",
  "source_raw_list_json",
  "source_raw_detail_json",
];

/**
 * Ensures PostgREST receives no undefined values (omitted keys can violate NOT NULL).
 * @param {Record<string, unknown>[]} payloads
 */
export function assertPublishPayloadsComplete(payloads) {
  for (let i = 0; i < payloads.length; i++) {
    const p = payloads[i];
    if (!p || typeof p !== "object") {
      throw new Error(`Publish payload row ${i} is not an object`);
    }
    for (const k of Object.keys(p)) {
      if (p[k] === undefined) {
        throw new Error(
          `Publish payload row ${i} has undefined "${k}" (schema mismatch risk)`
        );
      }
    }
    if ("tags" in p && p.tags != null && !Array.isArray(p.tags)) {
      throw new Error(`Publish payload row ${i}: tags must be an array or null`);
    }
  }
}
