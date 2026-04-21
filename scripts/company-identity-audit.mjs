#!/usr/bin/env node
/**
 * Bulk audit for company identity / logo coverage (jobs ∪ tracked directory).
 * Safe apply only touches lib/companyDescriptionAliases.json and lib/companyEnrichmentOverrides.json.
 * Never writes data/companies_master.csv.
 *
 * Usage:
 *   node scripts/company-identity-audit.mjs [--jobs-file=path] [--apply-safe]
 *
 * Env: JOBS_JSON_PATH — default data/jobs-master.json
 */
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { parse } from "csv-parse/sync";
import { decodeUrlEncodedCompanyName } from "./lib/urlDecodeCompanyName.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..");

const CAREER_REGISTRY_PATH = path.join(REPO_ROOT, "data", "career_source_registry.csv");
const COMPANIES_MASTER_PATH = path.join(REPO_ROOT, "data", "companies_master.csv");
const SOURCES_CSV_PATH = path.join(REPO_ROOT, "sources.csv");
const DESCRIPTIONS_PATH = path.join(REPO_ROOT, "lib", "companyDescriptions.generated.json");
const ALIASES_PATH = path.join(REPO_ROOT, "lib", "companyDescriptionAliases.json");
const ENRICHMENT_OVERRIDES_PATH = path.join(REPO_ROOT, "lib", "companyEnrichmentOverrides.json");
const OUT_JSON = path.join(REPO_ROOT, "data", "company_identity_audit.latest.json");
const OUT_CSV = path.join(REPO_ROOT, "data", "company_identity_review_queue.csv");

const ENRICHMENT_LOGO_SUPPRESSED = new Set(["omit", "none", "invalid", "hidden"]);

/** @type {Set<string>} */
const BUCKET_KEYS = new Set([
  "has_logo_working",
  "ambiguous_match",
  "missing_master_row",
  "missing_resolver_row",
  "missing_enrichment_row",
  "no_usable_domain",
  "needs_logo_override",
  "name_slug_mismatch",
]);

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

/**
 * @param {string} raw
 */
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
 * @param {Record<string, string>} row
 * @param {string} key
 */
function cellString(row, key) {
  const v = row[key];
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return String(v).trim();
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
 * @param {Record<string, unknown>} desc
 * @param {string} primarySlug
 * @param {Record<string, { logoDomain?: string }>} overrides
 */
function isLogoWorking(desc, primarySlug, overrides) {
  const o = overrides[primarySlug];
  const hint = o?.logoDomain != null && String(o.logoDomain).trim() !== "";
  if (hint) {
    const d = normalizeCanonicalDomain(String(o.logoDomain));
    return Boolean(d);
  }
  if (!desc || typeof desc !== "object") return false;
  const url = String(/** @type {any} */ (desc).logoUrl || "").trim();
  const status = String(/** @type {any} */ (desc).logoStatus ?? "")
    .trim()
    .toLowerCase();
  if (!url) return false;
  return !ENRICHMENT_LOGO_SUPPRESSED.has(status);
}

/**
 * Parse sources.csv like lib/trackedCompanies.js (approved + auto only).
 * @returns {Promise<string[]>}
 */
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

  const approved = lines
    .slice(1)
    .map((line) => parseCsvLine(line))
    .map((parts) => ({
      company: normalizeCompanyName(parts[companyIndex] || ""),
      status: String(parts[statusIndex] || "").trim().toLowerCase(),
    }))
    .filter((row) => row.company)
    .filter((row) => row.status === "approved" || row.status === "auto")
    .map((row) => row.company);

  return [...new Set(approved)];
}

/**
 * @param {string} filePath
 * @returns {Promise<{ companies: string[], fromFile: boolean, note?: string }>}
 */
async function loadActiveJobCompanies(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    const jobs = Array.isArray(parsed?.jobs) ? parsed.jobs : [];
    const companies = jobs
      .map((j) => String(j?.company || "").trim())
      .filter(Boolean);
    const distinct = [...new Set(companies)];
    return { companies: distinct, fromFile: true };
  } catch (e) {
    if (e && /** @type {any} */ (e).code === "ENOENT") {
      return {
        companies: [],
        fromFile: false,
        note: `Active job companies excluded: file not found (${filePath}). Export with scripts/refresh-jobs-master.mjs or pass --jobs-file=.`,
      };
    }
    return {
      companies: [],
      fromFile: false,
      note: `Active job companies excluded: ${/** @type {any} */ (e).message || e}`,
    };
  }
}

/**
 * @returns {Promise<Map<string, Record<string, string>>>}
 */
async function loadCompaniesMasterBySlug() {
  /** @type {Map<string, Record<string, string>>} */
  const map = new Map();
  let raw;
  try {
    raw = await fs.readFile(COMPANIES_MASTER_PATH, "utf8");
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
    const company = cellString(row, "Company");
    if (!company) continue;
    const slug = companySlug(normalizeCompanyNameForMatch(company));
    if (!slug) continue;
    const normalized = {};
    for (const k of Object.keys(row)) {
      normalized[k] = row[k] != null ? String(row[k]) : "";
    }
    if (!map.has(slug)) map.set(slug, normalized);
  }
  return map;
}

function registryIdentityKey(row) {
  const k = String(row?.company_key || "").trim().toLowerCase();
  if (k) return k;
  return String(row?.company_name || "")
    .trim()
    .toLowerCase();
}

/**
 * @param {Record<string, unknown>|null} desc
 * @param {Record<string, string>|null} reg
 * @param {Map<string, Record<string, string>>} registryBySlug
 * @param {Map<string, Set<string>>} primaryToJobSlugs
 * @param {string} primarySlug
 * @param {Record<string, { logoDomain?: string }>} overrides
 */
function classifyTarget(
  desc,
  reg,
  masterBySlug,
  registryBySlug,
  primaryToJobSlugs,
  primarySlug,
  jobSlug,
  aliases,
  overrides
) {
  const P = primarySlug;
  const S = jobSlug;
  const hasAlias = Object.prototype.hasOwnProperty.call(aliases, S);

  if (isLogoWorking(desc || null, P, overrides)) {
    return { bucket: "has_logo_working", detail: "" };
  }

  if (!desc) {
    return {
      bucket: "missing_enrichment_row",
      detail: "No companyDescriptions.generated.json row for resolved primarySlug",
    };
  }

  if (!masterBySlug.has(P)) {
    return { bucket: "missing_master_row", detail: "No data/companies_master.csv row for slug" };
  }

  if (!reg) {
    return { bucket: "missing_resolver_row", detail: "No career_source_registry match for slug" };
  }

  const dom = normalizeCanonicalDomain(reg.domain || "");
  if (!dom) {
    return { bucket: "no_usable_domain", detail: "Resolver row has empty/invalid domain" };
  }

  if (S !== P && hasAlias) {
    const regS = findRegistryRowForPrimarySlug(S, registryBySlug, primaryToJobSlugs);
    if (regS && reg && registryIdentityKey(regS) !== registryIdentityKey(reg)) {
      return {
        bucket: "name_slug_mismatch",
        detail: "Alias maps job slug to primarySlug but resolver rows disagree (company_key/identity)",
      };
    }
  }

  return {
    bucket: "needs_logo_override",
    detail: "Enrichment logo not usable; resolver domain may fix after rebuild",
  };
}

/**
 * @param {Record<string, string>} aliases
 * @param {Map<string, Record<string, unknown>>} descriptionsByPrimary
 * @param {Map<string, Record<string, string>>} registryBySlug
 * @param {Map<string, Set<string>>} primaryToJobSlugs
 * @param {Set<string>} extraJobSlugsFromTargets
 * @returns {Record<string, string>}
 */
function proposeSafeAliases(
  aliases,
  descriptionsByPrimary,
  registryBySlug,
  primaryToJobSlugs,
  extraJobSlugsFromTargets
) {
  /** @type {Record<string, string>} */
  const proposed = {};

  const registryKey = (row) => registryIdentityKey(row);

  const rowForSlug = (slug) =>
    findRegistryRowForPrimarySlug(slug, registryBySlug, primaryToJobSlugs);

  const candidateSlugs = new Set([...descriptionsByPrimary.keys()]);
  for (const js of Object.keys(aliases)) {
    candidateSlugs.add(js);
  }
  for (const prim of primaryToJobSlugs.keys()) {
    candidateSlugs.add(prim);
    const set = primaryToJobSlugs.get(prim);
    if (set) for (const j of set) candidateSlugs.add(j);
  }
  for (const s of extraJobSlugsFromTargets) {
    if (s) candidateSlugs.add(s);
  }

  for (const S of candidateSlugs) {
    if (!S) continue;
    if (aliases[S]) continue;

    const currentPrimary = String(aliases[S] || S)
      .trim()
      .toLowerCase();
    if (descriptionsByPrimary.has(currentPrimary)) continue;

    const regS = rowForSlug(S);
    if (!regS) continue;

    const k = registryKey(regS);
    if (!k) continue;

    /** @type {string[]} */
    const primariesWithDesc = [];
    for (const P of descriptionsByPrimary.keys()) {
      const regP = rowForSlug(P);
      if (!regP) continue;
      if (registryKey(regP) === k) {
        primariesWithDesc.push(P);
      }
    }

    if (primariesWithDesc.length === 1) {
      const P = primariesWithDesc[0];
      if (P !== S) {
        proposed[S] = P;
      }
    }
  }

  return proposed;
}

/**
 * @param {Set<string>} targetPrimarySlugs
 * @param {Map<string, Record<string, unknown>>} descriptionsByPrimary
 * @param {Map<string, Record<string, string>>} registryBySlug
 * @param {Map<string, Set<string>>} primaryToJobSlugs
 * @param {Record<string, { logoDomain?: string; displayName?: string }>} overrides
 * @returns {Record<string, { logoDomain: string }>}
 */
function proposeSafeLogoDomains(
  targetPrimarySlugs,
  descriptionsByPrimary,
  registryBySlug,
  primaryToJobSlugs,
  overrides
) {
  /** @type {Record<string, { logoDomain: string }>} */
  const proposed = {};

  for (const P of targetPrimarySlugs) {
    const desc = descriptionsByPrimary.get(P) || null;
    const o = overrides[P];
    if (o?.logoDomain != null && String(o.logoDomain).trim() !== "") continue;
    if (isLogoWorking(desc, P, overrides)) continue;

    const reg = findRegistryRowForPrimarySlug(P, registryBySlug, primaryToJobSlugs);
    if (!reg) continue;
    const dom = normalizeCanonicalDomain(reg.domain || "");
    if (!dom) continue;

    proposed[P] = { logoDomain: dom };
  }

  return proposed;
}

/**
 * @param {Record<string, { bucket: string }>} byName
 */
function countBuckets(byName) {
  /** @type {Record<string, number>} */
  const counts = {};
  for (const k of BUCKET_KEYS) counts[k] = 0;
  for (const { bucket } of Object.values(byName)) {
    if (counts[bucket] != null) counts[bucket] += 1;
  }
  return counts;
}

function parseArgs(argv) {
  let jobsFile = process.env.JOBS_JSON_PATH || path.join(REPO_ROOT, "data", "jobs-master.json");
  let applySafe = false;
  for (const a of argv) {
    if (a === "--apply-safe") applySafe = true;
    else if (a.startsWith("--jobs-file=")) jobsFile = path.resolve(REPO_ROOT, a.slice("--jobs-file=".length));
  }
  return { jobsFile, applySafe };
}

async function main() {
  const { jobsFile, applySafe } = parseArgs(process.argv.slice(2));

  const [
    registryBySlug,
    masterBySlug,
    descriptionsRaw,
    aliasesFileRaw,
    overridesFileRaw,
  ] = await Promise.all([
    loadCareerRegistryBySlug(),
    loadCompaniesMasterBySlug(),
    fs.readFile(DESCRIPTIONS_PATH, "utf8").catch(() => "{}"),
    fs.readFile(ALIASES_PATH, "utf8").catch(() => "{}"),
    fs.readFile(ENRICHMENT_OVERRIDES_PATH, "utf8").catch(() => "{}"),
  ]);

  /** @type {{ jobCompanySlugToPrimarySlug?: Record<string, string> }} */
  const aliasesJson = JSON.parse(aliasesFileRaw);
  /** @type {Record<string, string>} */
  const aliases = { ...(aliasesJson.jobCompanySlugToPrimarySlug || {}) };

  /** @type {Record<string, { logoDomain?: string; displayName?: string }>} */
  const overrides = JSON.parse(overridesFileRaw);
  if (typeof overrides !== "object" || !overrides) {
    throw new Error("company-identity-audit: invalid companyEnrichmentOverrides.json");
  }

  /** @type {{ records?: unknown[] }} */
  const descDoc = JSON.parse(descriptionsRaw);
  const records = Array.isArray(descDoc?.records) ? descDoc.records : [];

  /** @type {Map<string, Record<string, unknown>>} */
  const descriptionsByPrimary = new Map();
  for (const r of records) {
    const p = String(/** @type {any} */ (r).primarySlug || "").trim().toLowerCase();
    if (p) descriptionsByPrimary.set(p, /** @type {Record<string, unknown>} */ (r));
  }

  const jobLoad = await loadActiveJobCompanies(jobsFile);
  const tracked = await loadTrackedCompanyNames();

  const targetNames = [...new Set([...jobLoad.companies, ...tracked])].sort((a, b) =>
    a.localeCompare(b)
  );

  /** @type {Set<string>} */
  const targetJobSlugs = new Set();
  for (const name of targetNames) {
    const S = companySlug(normalizeCompanyNameForMatch(name));
    if (S) targetJobSlugs.add(S);
  }

  const exclusions = [];
  if (!jobLoad.fromFile && jobLoad.note) exclusions.push(jobLoad.note);
  if (tracked.length === 0) {
    exclusions.push(
      "Tracked directory: 0 companies (sources.csv missing, empty, or headers not matched approved/auto)."
    );
  }

  /**
   * @param {Record<string, string>} aliasMap
   * @param {Record<string, { logoDomain?: string; displayName?: string }>} ov
   */
  function runMetrics(aliasMap, ov) {
    const p2j = invertAliasesToPrimaryToJobSlugs(aliasMap);
    /** @type {Record<string, { bucket: string; detail: string; companyName: string; jobSlug: string; primarySlug: string }>} */
    const byName = {};
    let logoCount = 0;

    const targetPrimaries = new Set();
    for (const name of targetNames) {
      const S = companySlug(normalizeCompanyNameForMatch(name));
      if (!S) continue;
      const P = String(aliasMap[S] || S)
        .trim()
        .toLowerCase();
      targetPrimaries.add(P);
    }

    for (const name of targetNames) {
      const S = companySlug(normalizeCompanyNameForMatch(name));
      if (!S) {
        byName[name] = {
          bucket: "name_slug_mismatch",
          detail: "Empty slug after normalize",
          companyName: name,
          jobSlug: "",
          primarySlug: "",
        };
        continue;
      }
      const P = String(aliasMap[S] || S)
        .trim()
        .toLowerCase();
      const desc = descriptionsByPrimary.get(P) || null;
      const reg = findRegistryRowForPrimarySlug(P, registryBySlug, p2j);

      const cls = classifyTarget(
        desc,
        reg,
        masterBySlug,
        registryBySlug,
        p2j,
        P,
        S,
        aliasMap,
        ov
      );
      byName[name] = {
        bucket: cls.bucket,
        detail: cls.detail,
        companyName: name,
        jobSlug: S,
        primarySlug: P,
      };

      if (isLogoWorking(desc, P, ov)) logoCount += 1;
    }

    return {
      targetCompanyCount: targetNames.length,
      logoCoverageCount: logoCount,
      bucketCounts: countBuckets(byName),
      byName,
      targetResolvedPrimarySlugs: [...targetPrimaries].sort(),
    };
  }

  const before = runMetrics(aliases, overrides);

  const primaryToJobSlugs = invertAliasesToPrimaryToJobSlugs(aliases);
  const safeAliases = proposeSafeAliases(
    aliases,
    descriptionsByPrimary,
    registryBySlug,
    primaryToJobSlugs,
    targetJobSlugs
  );

  const mergedAliasPreview = { ...aliases, ...safeAliases };

  /** @type {Set<string>} */
  const targetPrimariesForOverrides = new Set();
  for (const name of targetNames) {
    const S = companySlug(normalizeCompanyNameForMatch(name));
    if (!S) continue;
    const P = String(mergedAliasPreview[S] || S)
      .trim()
      .toLowerCase();
    targetPrimariesForOverrides.add(P);
  }

  const primaryToJobSlugsAfterAliases = invertAliasesToPrimaryToJobSlugs(mergedAliasPreview);

  const safeLogoDomains = proposeSafeLogoDomains(
    targetPrimariesForOverrides,
    descriptionsByPrimary,
    registryBySlug,
    primaryToJobSlugsAfterAliases,
    overrides
  );

  /** @type {Record<string, string>} */
  const mergedAliases = { ...aliases, ...safeAliases };
  /** @type {Record<string, { logoDomain?: string; displayName?: string }>} */
  const mergedOverrides = { ...overrides };
  for (const [p, o] of Object.entries(safeLogoDomains)) {
    mergedOverrides[p] = { ...mergedOverrides[p], ...o };
  }

  const after = runMetrics(mergedAliases, mergedOverrides);

  const unresolved = targetNames.filter((n) => after.byName[n]?.bucket !== "has_logo_working");
  /** @type {Record<string, number>} */
  const blockerCounts = {};
  for (const n of unresolved) {
    const b = after.byName[n]?.bucket || "unknown";
    blockerCounts[b] = (blockerCounts[b] || 0) + 1;
  }
  const topBlockers = Object.entries(blockerCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  const mergedP2j = invertAliasesToPrimaryToJobSlugs(mergedAliases);

  /** @type {Record<string, string>[]} */
  const masterCsvSuggestedRows = [];
  for (const name of targetNames) {
    const S = companySlug(normalizeCompanyNameForMatch(name));
    const P = String(mergedAliases[S] || S)
      .trim()
      .toLowerCase();
    const reg = findRegistryRowForPrimarySlug(P, registryBySlug, mergedP2j);
    const master = masterBySlug.get(P);
    const company =
      (master && cellString(master, "Company")) ||
      (reg ? cellString(reg, "company_name") : "") ||
      name;
    const domain =
      (master && cellString(master, "domain")) ||
      (reg ? normalizeCanonicalDomain(cellString(reg, "domain")) : "");
    const fullUrl =
      (master && cellString(master, "full_url")) ||
      (reg ? cellString(reg, "homepage_url") : "");
    const linkedIn =
      (master && cellString(master, "LinkedIn")) ||
      (reg ? cellString(reg, "linkedin_url") : "");
    const category =
      (master && cellString(master, "Category")) ||
      (reg ? cellString(reg, "category") : "");
    const confidence =
      (master && cellString(master, "confidence_flag")) ||
      (reg ? cellString(reg, "confidence_flag") : "");
    masterCsvSuggestedRows.push({
      company_name_target: name,
      resolved_primary_slug: P,
      Company: company,
      domain,
      full_url: fullUrl,
      LinkedIn: linkedIn,
      Category: category,
      confidence_flag: confidence,
    });
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    jobsFile,
    activeJobsDistinctCompaniesLoaded: jobLoad.fromFile,
    exclusions,
    metricsBeforeSafeApply: {
      targetCompanyCount: before.targetCompanyCount,
      logoCoverageCount: before.logoCoverageCount,
      bucketCounts: before.bucketCounts,
    },
    metricsAfterSafeApply: {
      targetCompanyCount: after.targetCompanyCount,
      logoCoverageCount: after.logoCoverageCount,
      bucketCounts: after.bucketCounts,
    },
    safeApply: {
      aliasesAdded: safeAliases,
      logoDomainOverridesAdded: safeLogoDomains,
      aliasCount: Object.keys(safeAliases).length,
      logoDomainOverrideCount: Object.keys(safeLogoDomains).length,
    },
    unresolvedAfterSafeApply: {
      count: unresolved.length,
      topBlockerCategories: topBlockers,
    },
    perCompany: before.byName,
    perCompanyAfter: after.byName,
    masterCsvSuggestedRows,
    masterCsvColumnOrderHint: [
      "Company",
      "domain",
      "full_url",
      "LinkedIn",
      "Category",
      "confidence_flag",
    ],
  };

  await fs.writeFile(OUT_JSON, JSON.stringify(payload, null, 2), "utf8");

  const csvHeader = [
    "company_name",
    "job_slug",
    "resolved_primary_slug",
    "bucket_before",
    "bucket_after",
    "master_csv_company",
    "master_csv_domain",
    "registry_company_name",
    "registry_domain",
    "suggested_Company",
    "suggested_domain",
    "suggested_full_url",
    "suggested_LinkedIn",
    "suggested_Category",
    "suggested_confidence_flag",
  ];
  const esc = (v) => {
    const s = String(v ?? "");
    if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const csvLines = [csvHeader.join(",")];
  for (const name of targetNames) {
    const S = companySlug(normalizeCompanyNameForMatch(name));
    const P = String(mergedAliases[S] || S)
      .trim()
      .toLowerCase();
    const reg = findRegistryRowForPrimarySlug(
      P,
      registryBySlug,
      invertAliasesToPrimaryToJobSlugs(mergedAliases)
    );
    const master = masterBySlug.get(P);
    const sug = masterCsvSuggestedRows.find((r) => r.company_name_target === name);
    csvLines.push(
      [
        esc(name),
        esc(S),
        esc(P),
        esc(before.byName[name]?.bucket),
        esc(after.byName[name]?.bucket),
        esc(master ? cellString(master, "Company") : ""),
        esc(master ? cellString(master, "domain") : ""),
        esc(reg ? cellString(reg, "company_name") : ""),
        esc(reg ? cellString(reg, "domain") : ""),
        esc(sug?.Company ?? ""),
        esc(sug?.domain ?? ""),
        esc(sug?.full_url ?? ""),
        esc(sug?.LinkedIn ?? ""),
        esc(sug?.Category ?? ""),
        esc(sug?.confidence_flag ?? ""),
      ].join(",")
    );
  }
  await fs.writeFile(OUT_CSV, csvLines.join("\n"), "utf8");

  if (applySafe) {
    const aliasesOut = {
      jobCompanySlugToPrimarySlug: mergedAliases,
    };
    await fs.writeFile(ALIASES_PATH, JSON.stringify(aliasesOut, null, 2) + "\n", "utf8");
    await fs.writeFile(ENRICHMENT_OVERRIDES_PATH, JSON.stringify(mergedOverrides, null, 2) + "\n", "utf8");
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        wrote: [OUT_JSON, OUT_CSV],
        applySafe,
        metricsBefore: payload.metricsBeforeSafeApply,
        metricsAfter: payload.metricsAfterSafeApply,
        safeApply: payload.safeApply,
        unresolved: payload.unresolvedAfterSafeApply,
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
