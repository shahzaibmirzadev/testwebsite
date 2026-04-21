#!/usr/bin/env node
/**
 * Builds data/company_enrichment_expanded.json — enrichment-shaped records for companies
 * present in active jobs ∪ tracked sources.csv but missing from lib/companyDescriptions.generated.json.
 * Does not overwrite the spreadsheet output or existing JSON; writes a new file only.
 *
 * Domain resolution (first hit wins): career_source_registry → production_source_registry → job URL hostnames
 * (ATS / third-party career hosts are rejected for hostname-derived domains).
 *
 * Usage: node scripts/expand-company-enrichment.mjs [--jobs-file=path]
 * Env: JOBS_JSON_PATH (default data/jobs-master.json)
 */
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { parse } from "csv-parse/sync";
import { decodeUrlEncodedCompanyName } from "./lib/urlDecodeCompanyName.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..");

const DESCRIPTIONS_PATH = path.join(REPO_ROOT, "lib", "companyDescriptions.generated.json");
const ALIASES_PATH = path.join(REPO_ROOT, "lib", "companyDescriptionAliases.json");
const CAREER_REGISTRY_PATH = path.join(REPO_ROOT, "data", "career_source_registry.csv");
const PRODUCTION_REGISTRY_PATH = path.join(REPO_ROOT, "data", "ingestion", "production_source_registry.csv");
const APPROVED_SOURCES_MASTER_PATH = path.join(REPO_ROOT, "data", "ingestion", "approved_sources_master.csv");
const MANUAL_REVIEW_QUEUE_PATH = path.join(REPO_ROOT, "data", "manual_review_queue.csv");
const SOURCES_CSV_PATH = path.join(REPO_ROOT, "sources.csv");
const OUT_PATH = path.join(REPO_ROOT, "data", "company_enrichment_expanded.json");

const GOOGLE_FAVICON_BASE = "https://www.google.com/s2/favicons?sz=128&domain=";

/** Hostnames not used as company domains (ATS / aggregators). Subdomain match via suffix. */
const BLOCKED_CAREER_HOST_SUFFIXES = [
  "ashbyhq.com",
  "greenhouse.io",
  "lever.co",
  "myworkdayjobs.com",
  "workday.com",
  "smartrecruiters.com",
  "icims.com",
  "jobvite.com",
  "taleo.net",
  "oraclecloud.com",
  "ultipro.com",
  "successfactors.com",
  "brassring.com",
  "workable.com",
  "bamboohr.com",
  "rippling.com",
  "recruitee.com",
  "teamtailor.com",
  "jazz.co",
  "applytojob.com",
  "breezy.hr",
  "notion.site",
  "linkedin.com",
  "indeed.com",
  "glassdoor.com",
  "ziprecruiter.com",
  "monster.com",
  "dice.com",
];

function companySlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeCompanyNameForMatch(raw) {
  let s = decodeUrlEncodedCompanyName(raw);
  if (!s) return "";
  try {
    s = s.normalize("NFKC");
  } catch {
    /* ignore */
  }
  s = s.replace(/\s+/g, " ");
  s = s.replace(/\bAi\b/g, "AI");
  s = s.replace(/\bGmbh\b/g, "GmbH");
  return s.trim();
}

function normalizeCanonicalDomain(raw) {
  let s = String(raw || "").trim().toLowerCase();
  if (!s) return "";
  s = s.replace(/^https?:\/\//i, "");
  s = s.split("/")[0].split("?")[0].split("#")[0];
  s = s.replace(/:\d+$/, "");
  s = s.replace(/\.+$/, "");
  if (!s || /[\s/]/.test(s) || s.includes("..")) return "";
  if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9.-]*[a-z0-9])?)+$/.test(s)) return "";
  return s;
}

/**
 * @param {string} url
 * @returns {string}
 */
function hostnameFromUrl(url) {
  const raw = String(url || "").trim();
  if (!raw || !/^https?:\/\//i.test(raw)) return "";
  try {
    const u = new URL(raw);
    return normalizeCanonicalDomain(u.hostname || "");
  } catch {
    return "";
  }
}

/**
 * @param {string} host normalized hostname
 */
function isBlockedCareerHost(host) {
  const h = String(host || "").toLowerCase();
  if (!h) return true;
  for (const suf of BLOCKED_CAREER_HOST_SUFFIXES) {
    if (h === suf || h.endsWith(`.${suf}`)) return true;
  }
  return false;
}

function cellString(row, key) {
  const v = row[key];
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return String(v).trim();
}

/**
 * @param {Record<string, string>|null|undefined} a
 * @param {Record<string, string>|null|undefined} b
 */
function pickBetterRegistryRow(a, b) {
  if (!a) return b;
  if (!b) return a;
  const score = (r) => {
    let s = 0;
    if ((r.domain || "").trim()) s += 3;
    const inv = (r.homepage_input_validation || "").trim();
    if (inv === "ok") s += 2;
    if (inv === "ok_domain_only") s += 1;
    const st = (r.resolver_status || "").trim();
    if (st === "careers_found" || st === "redirected_to_ats") s += 1;
    return s;
  };
  return score(a) >= score(b) ? a : b;
}

function pickBetterProductionRow(a, b) {
  if (!a) return b;
  if (!b) return a;
  const da = normalizeCanonicalDomain(a.domain || "");
  const db = normalizeCanonicalDomain(b.domain || "");
  if (da && !db) return a;
  if (db && !da) return b;
  return a;
}

/**
 * @param {Record<string, string>} aliases jobSlug -> primarySlug
 * @returns {Map<string, Set<string>>}
 */
function invertAliasesToPrimaryToJobSlugs(aliases) {
  /** @type {Map<string, Set<string>>} */
  const map = new Map();
  for (const [jobSlug, primary] of Object.entries(aliases)) {
    const pr = String(primary || "")
      .trim()
      .toLowerCase();
    const js = String(jobSlug || "")
      .trim()
      .toLowerCase();
    if (!pr || !js) continue;
    if (!map.has(pr)) map.set(pr, new Set());
    map.get(pr).add(js);
  }
  return map;
}

/**
 * @param {string} primarySlug
 * @param {Map<string, Record<string, string>>} registryBySlug
 * @param {Map<string, Set<string>>} primaryToJobSlugs
 * @returns {Record<string, string>|null}
 */
function findRegistryRowForPrimarySlug(primarySlug, registryBySlug, primaryToJobSlugs) {
  const ps = String(primarySlug || "")
    .trim()
    .toLowerCase();
  if (!ps) return null;

  /** @type {Record<string, string>[]} */
  const candidates = [];

  const push = (row) => {
    if (row && typeof row === "object") candidates.push(row);
  };

  push(registryBySlug.get(ps));

  const aliasSet = primaryToJobSlugs.get(ps);
  if (aliasSet) {
    for (const js of aliasSet) {
      push(registryBySlug.get(js));
    }
  }

  for (const [regSlug, row] of registryBySlug) {
    if (regSlug === ps || regSlug.startsWith(`${ps}-`)) {
      push(row);
    }
  }

  if (candidates.length === 0) return null;
  return candidates.reduce((a, b) => pickBetterRegistryRow(a, b));
}

/**
 * @returns {Promise<Map<string, Record<string, string>>>}
 */
async function loadCareerRegistryBySlug() {
  /** @type {Map<string, Record<string, string>>} */
  const map = new Map();
  let raw;
  try {
    raw = await fs.readFile(CAREER_REGISTRY_PATH, "utf8");
  } catch (e) {
    if (e && /** @type {any} */ (e).code === "ENOENT") return map;
    throw e;
  }
  const rows = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    bom: true,
  });
  for (const row of rows) {
    const name = cellString(row, "company_name");
    if (!name) continue;
    const slug = companySlug(normalizeCompanyNameForMatch(name));
    if (!slug) continue;
    const prev = map.get(slug);
    const normalized = {};
    for (const k of Object.keys(row)) {
      normalized[k] = row[k] != null ? String(row[k]) : "";
    }
    map.set(slug, pickBetterRegistryRow(prev, normalized));
  }
  return map;
}

/**
 * @returns {Promise<Map<string, Record<string, string>>>}
 */
async function loadProductionRegistryBySlug() {
  /** @type {Map<string, Record<string, string>>} */
  const map = new Map();
  let raw;
  try {
    raw = await fs.readFile(PRODUCTION_REGISTRY_PATH, "utf8");
  } catch (e) {
    if (e && /** @type {any} */ (e).code === "ENOENT") return map;
    throw e;
  }
  const rows = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    bom: true,
  });
  for (const row of rows) {
    const name = cellString(row, "company_name");
    if (!name) continue;
    const slug = companySlug(normalizeCompanyNameForMatch(name));
    if (!slug) continue;
    const prev = map.get(slug);
    const normalized = {};
    for (const k of Object.keys(row)) {
      normalized[k] = row[k] != null ? String(row[k]) : "";
    }
    map.set(slug, pickBetterProductionRow(prev, normalized));
  }
  return map;
}

async function loadTrackedCompanyNames() {
  let raw;
  try {
    raw = await fs.readFile(SOURCES_CSV_PATH, "utf8");
  } catch {
    return [];
  }
  if (!raw) return [];

  const lines = String(raw)
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const parseCsvLine = (line) => {
    const out = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }
      if (ch === "," && !inQuotes) {
        out.push(cur);
        cur = "";
        continue;
      }
      cur += ch;
    }
    out.push(cur);
    return out.map((part) => String(part || "").trim());
  };

  const findFirstHeaderIndex = (headers, candidates) =>
    candidates.map((key) => headers.indexOf(key)).find((idx) => idx >= 0);

  const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
  const companyIndex = findFirstHeaderIndex(headers, ["company", "company_name", "name", "slug"]);
  const statusIndex = findFirstHeaderIndex(headers, ["status", "state"]);
  if (companyIndex == null || companyIndex < 0 || statusIndex == null || statusIndex < 0) {
    return [];
  }

  const normalizeCompanyName = (value) => {
    const rawv = String(value || "").trim();
    if (!rawv) return "";
    try {
      return decodeURIComponent(rawv).trim();
    } catch {
      return rawv;
    }
  };

  return lines
    .slice(1)
    .map((line) => parseCsvLine(line))
    .map((parts) => ({
      company: normalizeCompanyName(parts[companyIndex] || ""),
      status: String(parts[statusIndex] || "").trim().toLowerCase(),
    }))
    .filter((row) => row.company)
    .filter((row) => row.status === "approved" || row.status === "auto")
    .map((row) => row.company);
}

/**
 * @param {string} jobsFile
 */
async function loadJobsFromFile(jobsFile) {
  try {
    const raw = await fs.readFile(jobsFile, "utf8");
    const parsed = JSON.parse(raw);
    const jobs = Array.isArray(parsed?.jobs) ? parsed.jobs : [];
    return { jobs, ok: true };
  } catch (e) {
    if (e && /** @type {any} */ (e).code === "ENOENT") return { jobs: [], ok: false };
    throw e;
  }
}

/**
 * @param {Record<string, unknown>[]} jobs
 * @returns {Map<string, Record<string, unknown>[]>}
 */
function groupJobsByCompanyExact(jobs) {
  /** @type {Map<string, Record<string, unknown>[]>} */
  const map = new Map();
  for (const j of jobs) {
    const c = String(j?.company || "").trim();
    if (!c) continue;
    if (!map.has(c)) map.set(c, []);
    map.get(c).push(j);
  }
  return map;
}

/**
 * Tier-4: repo CSVs with company display names + domain/homepage/careers URLs.
 * First file wins per primarySlug; first non-empty candidate wins per row.
 *
 * @returns {Promise<Map<string, { domain: string; source: string }>>}
 */
async function loadSupplementalDomainBySlug() {
  /** @type {Map<string, { domain: string; source: string }>} */
  const map = new Map();

  const files = [
    { path: APPROVED_SOURCES_MASTER_PATH, sourceTag: "approved_sources_master", nameKey: "company_display_name" },
    { path: MANUAL_REVIEW_QUEUE_PATH, sourceTag: "manual_review_queue", nameKey: "company_name" },
  ];

  for (const { path: fp, sourceTag, nameKey } of files) {
    let raw;
    try {
      raw = await fs.readFile(fp, "utf8");
    } catch {
      continue;
    }
    const rows = parse(raw, {
      columns: true,
      skip_empty_lines: true,
      relax_quotes: true,
      bom: true,
    });
    for (const row of rows) {
      const name = cellString(row, nameKey);
      if (!name) continue;
      const slug = companySlug(normalizeCompanyNameForMatch(name));
      if (!slug || map.has(slug)) continue;

      const rawDomain = normalizeCanonicalDomain(cellString(row, "domain"));
      const home = hostnameFromUrl(cellString(row, "homepage_url"));
      const cCanon = hostnameFromUrl(cellString(row, "careers_url_canonical"));
      const cFinal = hostnameFromUrl(cellString(row, "careers_url_final"));
      const cCand = hostnameFromUrl(cellString(row, "careers_url_candidate"));

      /** @type {string[]} */
      const candidates = [rawDomain, home, cCanon, cFinal, cCand].filter(Boolean);
      for (const h of candidates) {
        if (h && !isBlockedCareerHost(h)) {
          map.set(slug, { domain: h, source: sourceTag });
          break;
        }
      }
    }
  }

  return map;
}

/**
 * @param {string} primarySlug
 * @param {Map<string, Record<string, string>>} careerBySlug
 * @param {Map<string, Record<string, string>>} productionBySlug
 * @param {Map<string, Set<string>>} primaryToJobSlugs
 * @param {Map<string, Record<string, unknown>[]>} jobsByCompany
 * @param {string[]} companyNameHints
 * @param {Map<string, { domain: string; source: string }>} supplementalBySlug
 */
function resolveDomainForPrimary(
  primarySlug,
  careerBySlug,
  productionBySlug,
  primaryToJobSlugs,
  jobsByCompany,
  companyNameHints,
  supplementalBySlug
) {
  const reg = findRegistryRowForPrimarySlug(primarySlug, careerBySlug, primaryToJobSlugs);
  const fromCareer = normalizeCanonicalDomain(reg?.domain || "");
  if (fromCareer) {
    return { domain: fromCareer, source: "career_source_registry" };
  }

  const prod = productionBySlug.get(primarySlug) || null;
  const fromProd = normalizeCanonicalDomain(prod?.domain || "");
  if (fromProd) {
    return { domain: fromProd, source: "production_source_registry" };
  }

  const urls = [];
  for (const name of companyNameHints) {
    const list = jobsByCompany.get(name) || [];
    for (const j of list) {
      const cf = String(j?.careers_url_final ?? "").trim();
      const ap = String(j?.apply_url ?? "").trim();
      if (cf) urls.push(cf);
      if (ap) urls.push(ap);
    }
  }

  for (const u of urls) {
    const host = hostnameFromUrl(u);
    if (host && !isBlockedCareerHost(host)) {
      return { domain: host, source: "jobs_master_url_hostname" };
    }
  }

  const sup = supplementalBySlug.get(primarySlug);
  if (sup?.domain) {
    return { domain: sup.domain, source: sup.source };
  }

  return { domain: "", source: "" };
}

function buildMarketingCopy(displayCompany) {
  const c = String(displayCompany || "").trim() || "Company";
  const year = new Date().getFullYear();
  return {
    seoTitle: `${c} Jobs (${year}) | Careers, Hiring & Drone Roles`,
    h1: `${c} Jobs & Careers`,
    careersBlurb: `${c} is listed on DroneRoles. Enrichment was auto-generated; review and expand description copy as needed.`,
  };
}

function parseArgs(argv) {
  let jobsFile = process.env.JOBS_JSON_PATH || path.join(REPO_ROOT, "data", "jobs-master.json");
  for (const a of argv) {
    if (a.startsWith("--jobs-file=")) jobsFile = path.resolve(REPO_ROOT, a.slice("--jobs-file=".length));
  }
  return { jobsFile };
}

async function main() {
  const { jobsFile } = parseArgs(process.argv.slice(2));
  const generatedAt = new Date().toISOString();

  const [descRaw, aliasesRaw, careerBySlug, productionBySlug, supplementalBySlug, jobLoad, trackedList] =
    await Promise.all([
      fs.readFile(DESCRIPTIONS_PATH, "utf8"),
      fs.readFile(ALIASES_PATH, "utf8").catch(() => "{}"),
      loadCareerRegistryBySlug(),
      loadProductionRegistryBySlug(),
      loadSupplementalDomainBySlug(),
      loadJobsFromFile(jobsFile),
      loadTrackedCompanyNames(),
    ]);

  /** @type {{ records?: { primarySlug?: string }[] }} */
  const descDoc = JSON.parse(descRaw);
  const existingRecords = Array.isArray(descDoc?.records) ? descDoc.records : [];
  const existingPrimarySlugs = new Set(
    existingRecords.map((r) => String(r?.primarySlug || "").trim().toLowerCase()).filter(Boolean)
  );

  /** @type {{ jobCompanySlugToPrimarySlug?: Record<string, string> }} */
  const aliasesJson = JSON.parse(aliasesRaw);
  const aliases = { ...(aliasesJson.jobCompanySlugToPrimarySlug || {}) };
  const primaryToJobSlugs = invertAliasesToPrimaryToJobSlugs(aliases);

  const jobCompanies = jobLoad.jobs.map((j) => String(j?.company || "").trim()).filter(Boolean);
  const targetNames = [...new Set([...jobCompanies, ...trackedList])].sort((a, b) => a.localeCompare(b));

  /** @type {Map<string, string[]>} */
  const primaryToNames = new Map();
  for (const name of targetNames) {
    const S = companySlug(normalizeCompanyNameForMatch(name));
    if (!S) continue;
    const P = String(aliases[S] || S)
      .trim()
      .toLowerCase();
    if (!primaryToNames.has(P)) primaryToNames.set(P, []);
    primaryToNames.get(P).push(name);
  }

  const missingPrimarySlugs = [...primaryToNames.keys()].filter((p) => !existingPrimarySlugs.has(p));

  const jobsByCompany = groupJobsByCompanyExact(jobLoad.jobs);

  /** @type {Record<string, unknown>[]} */
  const newRecords = [];
  /** @type {{ primarySlug: string; domainSource: string }[]} */
  const resolutionLog = [];

  for (const P of missingPrimarySlugs.sort()) {
    const names = primaryToNames.get(P) || [];
    const nameFallback = [...names].sort((a, b) => a.localeCompare(b))[0] || P;
    const regForDisplay = findRegistryRowForPrimarySlug(P, careerBySlug, primaryToJobSlugs);
    const prodRow = productionBySlug.get(P) || null;
    const displayCompany =
      String(regForDisplay?.company_name || "").trim() ||
      String(prodRow?.company_name || "").trim() ||
      nameFallback;

    const { domain, source } = resolveDomainForPrimary(
      P,
      careerBySlug,
      productionBySlug,
      primaryToJobSlugs,
      jobsByCompany,
      names,
      supplementalBySlug
    );

    const mk = buildMarketingCopy(displayCompany);

    /** @type {Record<string, unknown>} */
    const rec = {
      primarySlug: P,
      company: displayCompany,
      description: "",
      location: "",
      foundedYear: null,
      seoTitle: mk.seoTitle,
      h1: mk.h1,
      careersBlurb: mk.careersBlurb,
      canonicalDomain: domain || "",
      logoUrl: domain ? `${GOOGLE_FAVICON_BASE}${encodeURIComponent(domain)}` : "",
      logoSourceType: domain ? "google_favicon" : "",
      logoStatus: domain ? "ok" : "no_resolver_match",
      logoLastCheckedAt: domain ? generatedAt : "",
      needsReview: !domain,
    };

    newRecords.push(rec);
    resolutionLog.push({ primarySlug: P, domainSource: source || (domain ? "unknown" : "none") });
  }

  const withDomain = newRecords.filter((r) => String(r.canonicalDomain || "").trim()).length;
  const withoutDomain = newRecords.length - withDomain;

  /** @type {Record<string, number>} */
  const domainSourceCounts = {};
  for (const { domainSource } of resolutionLog) {
    const k = domainSource || "none";
    domainSourceCounts[k] = (domainSourceCounts[k] || 0) + 1;
  }

  const payload = {
    generatedAt,
    source: "scripts/expand-company-enrichment.mjs",
    baseEnrichmentPath: "lib/companyDescriptions.generated.json",
    baseRecordCount: existingRecords.length,
    jobsFile,
    jobsSnapshotLoaded: jobLoad.ok,
    targetCompanyNameCount: targetNames.length,
    missingEnrichmentBefore: missingPrimarySlugs.length,
    newRecordsCount: newRecords.length,
    newRecordsWithDomain: withDomain,
    newRecordsWithoutDomain: withoutDomain,
    unresolvedWithoutDomainAfterBackfill: withoutDomain,
    virtualTotalIfMerged: existingRecords.length + newRecords.length,
    domainSourceCounts,
    resolutionLog,
    records: newRecords,
  };

  await fs.writeFile(OUT_PATH, JSON.stringify(payload, null, 2), "utf8");

  const withDomRec = newRecords.filter((r) => String(r.canonicalDomain || "").trim());
  const withoutDomRec = newRecords.filter((r) => !String(r.canonicalDomain || "").trim());
  const samples = [...withDomRec.slice(0, 3), ...withoutDomRec.slice(0, 2)].slice(0, 5);

  console.log(
    JSON.stringify(
      {
        wrote: OUT_PATH,
        enrichmentCountBefore: existingRecords.length,
        enrichmentCountAfterIfMerged: existingRecords.length + newRecords.length,
        missingEnrichmentBefore: missingPrimarySlugs.length,
        recordsCreated: newRecords.length,
        newRecordsWithDomain: withDomain,
        newRecordsWithoutDomain: withoutDomain,
        newLogosIfMerged: withDomain,
        domainSourceCounts,
        unresolvedWithoutDomainAfterBackfill: withoutDomain,
        sampleNewRecords: samples,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
