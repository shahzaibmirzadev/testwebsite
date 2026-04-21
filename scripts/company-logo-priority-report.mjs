#!/usr/bin/env node
/**
 * Ranked priority report for company identity / logo coverage (repo data only).
 * Outputs data/company_logo_priority_report.json and data/company_logo_priority_top50.csv
 *
 * Does not write companies_master.csv. Proposes safe alias / logoDomain override snippets only.
 *
 * Usage: node scripts/company-logo-priority-report.mjs [--jobs-file=path]
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
const OVERRIDES_PATH = path.join(REPO_ROOT, "lib", "companyEnrichmentOverrides.json");
const CAREER_REGISTRY_PATH = path.join(REPO_ROOT, "data", "career_source_registry.csv");
const PRODUCTION_REGISTRY_PATH = path.join(REPO_ROOT, "data", "ingestion", "production_source_registry.csv");
const APPROVED_SOURCES_MASTER_PATH = path.join(REPO_ROOT, "data", "ingestion", "approved_sources_master.csv");
const MANUAL_REVIEW_QUEUE_PATH = path.join(REPO_ROOT, "data", "manual_review_queue.csv");
const COMPANIES_MASTER_PATH = path.join(REPO_ROOT, "data", "companies_master.csv");
const SOURCES_CSV_PATH = path.join(REPO_ROOT, "sources.csv");
const JOBS_DEFAULT = path.join(REPO_ROOT, "data", "jobs-master.json");
const OUT_JSON = path.join(REPO_ROOT, "data", "company_logo_priority_report.json");
const OUT_CSV = path.join(REPO_ROOT, "data", "company_logo_priority_top50.csv");

const LOGO_SUPPRESSED = new Set(["omit", "none", "invalid", "hidden"]);

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

function registryIdentityKey(row) {
  const k = String(row?.company_key || "").trim().toLowerCase();
  if (k) return k;
  return String(row?.company_name || "")
    .trim()
    .toLowerCase();
}

async function loadCareerRegistryBySlug() {
  /** @type {Map<string, Record<string, string>>} */
  const map = new Map();
  let raw;
  try {
    raw = await fs.readFile(CAREER_REGISTRY_PATH, "utf8");
  } catch {
    return map;
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

async function loadProductionRegistryBySlug() {
  /** @type {Map<string, Record<string, string>>} */
  const map = new Map();
  let raw;
  try {
    raw = await fs.readFile(PRODUCTION_REGISTRY_PATH, "utf8");
  } catch {
    return map;
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

async function loadCompaniesMasterBySlug() {
  /** @type {Set<string>} */
  const set = new Set();
  let raw;
  try {
    raw = await fs.readFile(COMPANIES_MASTER_PATH, "utf8");
  } catch {
    return set;
  }
  const rows = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    bom: true,
  });
  for (const row of rows) {
    const company = cellString(row, "Company");
    if (!company) continue;
    const slug = companySlug(normalizeCompanyNameForMatch(company));
    if (slug) set.add(slug);
  }
  return set;
}

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

async function loadTrackedSet() {
  let raw;
  try {
    raw = await fs.readFile(SOURCES_CSV_PATH, "utf8");
  } catch {
    return new Set();
  }
  if (!raw) return new Set();
  const lines = String(raw)
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return new Set();

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
    return new Set();
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
  /** @type {Set<string>} */
  const set = new Set();
  for (const line of lines.slice(1)) {
    const parts = parseCsvLine(line);
    const company = normalizeCompanyName(parts[companyIndex] || "");
    const status = String(parts[statusIndex] || "").trim().toLowerCase();
    if (company && (status === "approved" || status === "auto")) {
      set.add(company);
    }
  }
  return set;
}

async function loadJobsGrouped(jobsFile) {
  try {
    const raw = await fs.readFile(jobsFile, "utf8");
    const parsed = JSON.parse(raw);
    const jobs = Array.isArray(parsed?.jobs) ? parsed.jobs : [];
    /** @type {Map<string, Record<string, unknown>[]>} */
    const byCompany = new Map();
    for (const j of jobs) {
      const active = j?.is_active;
      if (active === false) continue;
      const c = String(j?.company || "").trim();
      if (!c) continue;
      if (!byCompany.has(c)) byCompany.set(c, []);
      byCompany.get(c).push(j);
    }
    return { byCompany, ok: true };
  } catch (e) {
    if (e && /** @type {any} */ (e).code === "ENOENT") {
      return { byCompany: new Map(), ok: false };
    }
    throw e;
  }
}

/**
 * @param {Record<string, unknown>|null|undefined} rec
 */
function hasWorkingLogo(rec) {
  if (!rec || typeof rec !== "object") return false;
  const url = String(/** @type {any} */ (rec).logoUrl || "").trim();
  const st = String(/** @type {any} */ (rec).logoStatus ?? "")
    .trim()
    .toLowerCase();
  return Boolean(url && !LOGO_SUPPRESSED.has(st));
}

/**
 * Best domain hint for primary slug P (same cascade as expand script).
 */
function bestDomainHintForPrimary(
  P,
  careerBySlug,
  productionBySlug,
  primaryToJobSlugs,
  jobsByCompany,
  companyNameHints,
  supplementalBySlug
) {
  const reg = findRegistryRowForPrimarySlug(P, careerBySlug, primaryToJobSlugs);
  const d1 = normalizeCanonicalDomain(reg?.domain || "");
  if (d1) return { domain: d1, source: "career_source_registry" };

  const prod = productionBySlug.get(P) || null;
  const d2 = normalizeCanonicalDomain(prod?.domain || "");
  if (d2) return { domain: d2, source: "production_source_registry" };

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

  const sup = supplementalBySlug.get(P);
  if (sup?.domain) {
    return { domain: sup.domain, source: sup.source };
  }

  return { domain: "", source: "" };
}

/**
 * Safe alias S -> P when registry identity matches exactly one described primary (same as identity audit).
 */
function safeAliasTarget(
  S,
  aliases,
  descriptionsByPrimary,
  registryBySlug,
  primaryToJobSlugs
) {
  if (aliases[S]) return null;
  const currentPrimary = String(aliases[S] || S)
    .trim()
    .toLowerCase();
  if (descriptionsByPrimary.has(currentPrimary)) return null;

  const regS = findRegistryRowForPrimarySlug(S, registryBySlug, primaryToJobSlugs);
  if (!regS) return null;
  const k = registryIdentityKey(regS);
  if (!k) return null;

  /** @type {string[]} */
  const primariesWithDesc = [];
  for (const P of descriptionsByPrimary.keys()) {
    const regP = findRegistryRowForPrimarySlug(P, registryBySlug, primaryToJobSlugs);
    if (!regP) continue;
    if (registryIdentityKey(regP) === k) {
      primariesWithDesc.push(P);
    }
  }
  if (primariesWithDesc.length !== 1) return null;
  const P = primariesWithDesc[0];
  return P !== S ? P : null;
}

/**
 * @param {object} ctx
 */
function recommendFixType(ctx) {
  const {
    jobSlugS,
    primaryP,
    aliases,
    overrides,
    masterSlugs,
    hasWorkingLogo: hasLogo,
    bestDomain,
    registryDomainForP,
    safeAliasTo,
  } = ctx;

  if (hasLogo) {
    return { fixType: "none", detail: "logo_ok" };
  }

  if (safeAliasTo && !aliases[jobSlugS]) {
    return {
      fixType: "add_alias",
      detail: `Map job slug "${jobSlugS}" -> primary "${safeAliasTo}" (registry identity match)`,
      aliasFrom: jobSlugS,
      aliasTo: safeAliasTo,
    };
  }

  const existingOd =
    overrides[primaryP] && typeof overrides[primaryP] === "object"
      ? String(/** @type {any} */ (overrides[primaryP]).logoDomain || "").trim()
      : "";

  /** Best hostname for a favicon override — full cascade already in `bestDomain` */
  const domainForOverride = (bestDomain || "").trim() || registryDomainForP;

  if (domainForOverride && !existingOd) {
    return {
      fixType: "add_logoDomain_override",
      detail:
        "Repo data includes a usable domain (career registry, production registry, job URLs, or supplemental CSV); add logoDomain override for primarySlug",
      primarySlug: primaryP,
      logoDomain: normalizeCanonicalDomain(domainForOverride),
    };
  }

  if (bestDomain && !masterSlugs.has(primaryP)) {
    return {
      fixType: "add_to_companies_master",
      detail: "No usable logo yet; add curated master row (domain known from repo) then enrich via spreadsheet",
      primarySlug: primaryP,
      suggestedDomain: bestDomain,
    };
  }

  return {
    fixType: "no_fix_available",
    detail: "No non-blocked domain found in career registry, production registry, job URLs, or supplemental CSVs",
  };
}

function parseArgs(argv) {
  let jobsFile = process.env.JOBS_JSON_PATH || JOBS_DEFAULT;
  for (const a of argv) {
    if (a.startsWith("--jobs-file=")) jobsFile = path.resolve(REPO_ROOT, a.slice("--jobs-file=".length));
  }
  return { jobsFile };
}

async function main() {
  const { jobsFile } = parseArgs(process.argv.slice(2));

  const [
    descRaw,
    aliasesRaw,
    overridesRaw,
    careerBySlug,
    productionBySlug,
    supplementalBySlug,
    masterSlugs,
    trackedSet,
    jobLoad,
  ] = await Promise.all([
    fs.readFile(DESCRIPTIONS_PATH, "utf8"),
    fs.readFile(ALIASES_PATH, "utf8").catch(() => "{}"),
    fs.readFile(OVERRIDES_PATH, "utf8").catch(() => "{}"),
    loadCareerRegistryBySlug(),
    loadProductionRegistryBySlug(),
    loadSupplementalDomainBySlug(),
    loadCompaniesMasterBySlug(),
    loadTrackedSet(),
    loadJobsGrouped(jobsFile),
  ]);

  /** @type {{ records?: Record<string, unknown>[] }} */
  const descDoc = JSON.parse(descRaw);
  const records = Array.isArray(descDoc?.records) ? descDoc.records : [];

  /** @type {Map<string, Record<string, unknown>>} */
  const descriptionsByPrimary = new Map();
  for (const r of records) {
    const p = String(/** @type {any} */ (r).primarySlug || "").trim().toLowerCase();
    if (p) descriptionsByPrimary.set(p, r);
  }

  let aliasesParsed;
  try {
    aliasesParsed = JSON.parse(aliasesRaw);
  } catch {
    aliasesParsed = {};
  }
  const aliasMap = { ...(aliasesParsed?.jobCompanySlugToPrimarySlug || {}) };

  /** @type {Record<string, { logoDomain?: string; displayName?: string }>} */
  const overrides =
    typeof JSON.parse(overridesRaw || "{}") === "object"
      ? JSON.parse(overridesRaw || "{}")
      : {};

  const primaryToJobSlugs = invertAliasesToPrimaryToJobSlugs(aliasMap);

  /** @type {Set<string>} */
  const universe = new Set();
  for (const [company] of jobLoad.byCompany) {
    universe.add(company);
  }
  for (const t of trackedSet) {
    universe.add(t);
  }
  for (const r of records) {
    const c = String(/** @type {any} */ (r).company || "").trim();
    if (c) universe.add(c);
  }

  /** @type {Record<string, unknown>[]} */
  const rows = [];

  for (const company of [...universe].sort((a, b) => a.localeCompare(b))) {
    const jobSlugS = companySlug(normalizeCompanyNameForMatch(company));
    if (!jobSlugS) continue;

    const primaryP = String(aliasMap[jobSlugS] || jobSlugS)
      .trim()
      .toLowerCase();

    const enrichment = descriptionsByPrimary.get(primaryP) || null;
    const jobList = jobLoad.byCompany.get(company) || [];
    const activeJobCount = jobList.length;
    const isTracked = trackedSet.has(company);

    const hasEnrichment = Boolean(enrichment);
    const hasCanon = Boolean(
      enrichment && String(/** @type {any} */ (enrichment).canonicalDomain || "").trim()
    );
    const hasLogo = hasWorkingLogo(enrichment);

    const nameHints = [company];
    const hint = bestDomainHintForPrimary(
      primaryP,
      careerBySlug,
      productionBySlug,
      primaryToJobSlugs,
      jobLoad.byCompany,
      nameHints,
      supplementalBySlug
    );

    const regRow = findRegistryRowForPrimarySlug(primaryP, careerBySlug, primaryToJobSlugs);
    const registryDomainForP = normalizeCanonicalDomain(regRow?.domain || "");

    const safeTo = safeAliasTarget(
      jobSlugS,
      aliasMap,
      descriptionsByPrimary,
      careerBySlug,
      primaryToJobSlugs
    );

    const fixRec = recommendFixType({
      jobSlugS,
      primaryP,
      aliases: aliasMap,
      overrides,
      masterSlugs,
      hasWorkingLogo: hasLogo,
      bestDomain: hint.domain,
      registryDomainForP,
      safeAliasTo: safeTo,
    });

    const hasRepoDomainHint = Boolean((hint.domain || "").trim() || registryDomainForP);

    rows.push({
      company,
      primarySlug: primaryP,
      jobSlugFromCompanyName: jobSlugS,
      activeJobCount,
      isTracked,
      hasEnrichmentRow: hasEnrichment ? "yes" : "no",
      hasCanonicalDomain: hasCanon ? "yes" : "no",
      hasLogoUrl: hasLogo ? "yes" : "no",
      hasRepoDomainHint: hasRepoDomainHint ? "yes" : "no",
      bestDomainHint: hint.domain || "",
      bestDomainHintSource: hint.source || "",
      registryDomain: registryDomainForP || "",
      recommendedFixType: fixRec.fixType === "none" ? "n/a" : fixRec.fixType,
      recommendationDetail: fixRec.detail,
      safeAliasProposal:
        fixRec.fixType === "add_alias" && fixRec.aliasFrom && fixRec.aliasTo
          ? { [fixRec.aliasFrom]: fixRec.aliasTo }
          : null,
      logoDomainOverrideProposal:
        fixRec.fixType === "add_logoDomain_override" && fixRec.logoDomain
          ? { [primaryP]: { logoDomain: fixRec.logoDomain } }
          : null,
      companiesMasterNote:
        fixRec.fixType === "add_to_companies_master"
          ? { primarySlug: primaryP, suggestedDomain: fixRec.suggestedDomain || hint.domain }
          : null,
    });
  }

  const missingLogo = rows.filter((r) => r.hasLogoUrl === "no");

  function rankKey(r) {
    const hasJob = r.activeJobCount > 0 ? 1 : 0;
    const hasEnr = r.hasEnrichmentRow === "yes" ? 1 : 0;
    const track = r.isTracked ? 1 : 0;
    const hasHint = r.hasRepoDomainHint === "yes" ? 1 : 0;
    /** After job volume: prefer repo-backed domain hints (actionable alias/override) */
    return [-hasJob, -r.activeJobCount, -hasHint, -hasEnr, -track, r.company];
  }

  missingLogo.sort((a, b) => {
    const ka = rankKey(a);
    const kb = rankKey(b);
    for (let i = 0; i < ka.length; i++) {
      if (ka[i] < kb[i]) return -1;
      if (ka[i] > kb[i]) return 1;
    }
    return 0;
  });

  const top50 = missingLogo.slice(0, 50);
  const top25 = missingLogo.slice(0, 25);

  /** @type {Record<string, string>} */
  const proposedAliases = {};
  /** @type {Record<string, { logoDomain: string }>} */
  const proposedOverrides = {};

  for (const r of top50) {
    if (r.safeAliasProposal) {
      Object.assign(proposedAliases, r.safeAliasProposal);
    }
    if (r.logoDomainOverrideProposal) {
      const o = r.logoDomainOverrideProposal;
      for (const [k, v] of Object.entries(o)) {
        proposedOverrides[k] = { ...proposedOverrides[k], ...v };
      }
    }
  }

  let immediateFix = 0;
  let needDomain = 0;
  for (const r of top50) {
    if (r.recommendedFixType === "add_alias" || r.recommendedFixType === "add_logoDomain_override") {
      immediateFix += 1;
    }
    if (r.recommendedFixType === "no_fix_available") {
      needDomain += 1;
    }
  }

  const universeImmediate = missingLogo.filter(
    (r) => r.recommendedFixType === "add_alias" || r.recommendedFixType === "add_logoDomain_override"
  ).length;
  const universeNeedDomain = missingLogo.filter((r) => r.recommendedFixType === "no_fix_available").length;
  const universeMasterHint = missingLogo.filter(
    (r) => r.recommendedFixType === "add_to_companies_master"
  ).length;

  const out = {
    generatedAt: new Date().toISOString(),
    jobsFile,
    jobsSnapshotLoaded: jobLoad.ok,
    summary: {
      universeCompanyCount: rows.length,
      missingLogoCount: missingLogo.length,
      missingLogoWithRepoDomainHint: missingLogo.filter((r) => r.hasRepoDomainHint === "yes").length,
      universeImmediateFixAliasOrOverride: universeImmediate,
      universeStillNeedDomainSource: universeNeedDomain,
      universeAddToCompaniesMasterSuggested: universeMasterHint,
      top50ImmediateFixAliasOrOverride: immediateFix,
      top50StillNeedDomainSource: needDomain,
      top50AddToMasterOnly: top50.filter((r) => r.recommendedFixType === "add_to_companies_master").length,
    },
    top25MissingLogo: top25,
    top50MissingLogo: top50,
    proposedSafeAliasesMerge: proposedAliases,
    proposedLogoDomainOverridesMerge: proposedOverrides,
    filesToEditForSafeFixes: {
      aliasesJson: "lib/companyDescriptionAliases.json",
      overridesJson: "lib/companyEnrichmentOverrides.json",
      masterCsvManual: "data/companies_master.csv (manual row only when recommended; never auto-written by this script)",
    },
    allRows: rows,
  };

  await fs.writeFile(OUT_JSON, JSON.stringify(out, null, 2), "utf8");

  const esc = (v) => {
    const s = String(v ?? "");
    if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const csvHeader = [
    "company",
    "primarySlug",
    "activeJobCount",
    "hasEnrichmentRow",
    "hasCanonicalDomain",
    "hasLogoUrl",
    "bestDomainHint",
    "bestDomainHintSource",
    "recommendedFixType",
  ];
  const lines = [csvHeader.join(",")];
  for (const r of top50) {
    lines.push(
      [
        esc(r.company),
        esc(r.primarySlug),
        esc(r.activeJobCount),
        esc(r.hasEnrichmentRow),
        esc(r.hasCanonicalDomain),
        esc(r.hasLogoUrl),
        esc(r.bestDomainHint),
        esc(r.bestDomainHintSource),
        esc(r.recommendedFixType),
      ].join(",")
    );
  }
  await fs.writeFile(OUT_CSV, lines.join("\n"), "utf8");

  console.log(
    JSON.stringify(
      {
        wrote: [OUT_JSON, OUT_CSV],
        summary: out.summary,
        proposedAliasCount: Object.keys(proposedAliases).length,
        proposedOverrideSlugCount: Object.keys(proposedOverrides).length,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
