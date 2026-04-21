/**
 * Reads data/Company Descriptions.xlsx and writes lib/companyDescriptions.generated.json
 * Run after editing the spreadsheet: npm run data:company-descriptions
 *
 * Logo fields (optional columns on Sheet1): Logo URL, Logo Source Type, Logo Status,
 * Logo Last Checked At, Needs Review — spreadsheet overrides win; when Logo URL is empty,
 * the build merges canonical domain from data/career_source_registry.csv (resolver output)
 * and derives a Google favicon service URL (no network I/O). Resolver remains source of truth for domains.
 *
 * Optional union: rows from data/company_enrichment_expanded.json are appended for primarySlugs
 * not present in the spreadsheet (spreadsheet rows always take precedence).
 */
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import * as XLSX from "xlsx";
import { parse } from "csv-parse/sync";
import { decodeUrlEncodedCompanyName } from "./lib/urlDecodeCompanyName.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..");
const XLSX_PATH = path.join(REPO_ROOT, "data", "Company Descriptions.xlsx");
const CAREER_REGISTRY_PATH = path.join(REPO_ROOT, "data", "career_source_registry.csv");
const ALIASES_PATH = path.join(REPO_ROOT, "lib", "companyDescriptionAliases.json");
const ENRICHMENT_OVERRIDES_PATH = path.join(REPO_ROOT, "lib", "companyEnrichmentOverrides.json");
const EXPANDED_ENRICHMENT_PATH = path.join(REPO_ROOT, "data", "company_enrichment_expanded.json");
const OUT_PATH = path.join(REPO_ROOT, "lib", "companyDescriptions.generated.json");

/** Aligns with lib/companyPageCopy.js resolveCompanyPageLogoUrl suppression */
const LOGO_STATUS_SUPPRESSED = new Set(["omit", "none", "invalid", "hidden"]);

/** Google favicon service — deterministic; runtime UI may still fall back if image fails to load. */
const GOOGLE_FAVICON_BASE = "https://www.google.com/s2/favicons?sz=128&domain=";

function companySlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Mirrors lib/companyDescriptionMatch.js — keep in sync manually or extract later */
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

function parseYear(cell) {
  if (cell == null || cell === "") return null;
  if (typeof cell === "number" && Number.isFinite(cell)) {
    const y = Math.trunc(cell);
    return y >= 1800 && y <= 2100 ? y : null;
  }
  const t = String(cell).trim();
  const n = parseInt(t, 10);
  if (!Number.isFinite(n)) return null;
  return n >= 1800 && n <= 2100 ? n : null;
}

function cellString(row, key) {
  const v = row[key];
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return String(v).trim();
}

/**
 * @param {unknown} v
 * @returns {boolean | null} null = unspecified (use derived default)
 */
function parseOptionalBoolCell(v) {
  if (v == null || v === "") return null;
  if (typeof v === "boolean") return v;
  const s = String(v).trim().toLowerCase();
  if (["1", "true", "yes", "y"].includes(s)) return true;
  if (["0", "false", "no", "n"].includes(s)) return false;
  return null;
}

/**
 * @param {unknown} cell
 * @returns {string} ISO string or ""
 */
function cellToIsoDateString(cell) {
  if (cell == null || cell === "") return "";
  if (cell instanceof Date && !Number.isNaN(cell.getTime())) {
    return cell.toISOString();
  }
  if (typeof cell === "number" && Number.isFinite(cell)) {
    const excelEpoch = Date.UTC(1899, 11, 30);
    const ms = excelEpoch + cell * 86400000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? "" : d.toISOString();
  }
  const t = String(cell).trim();
  if (!t) return "";
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? t : d.toISOString();
}

/**
 * @param {Record<string, string>} a
 * @param {Record<string, string>} b
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
 * Load jobCompanySlug → primarySlug and invert to primary → job slugs for registry merge.
 * @returns {Promise<Map<string, Set<string>>>}
 */
async function loadPrimarySlugToJobSlugs() {
  /** @type {Map<string, Set<string>>} */
  const map = new Map();
  let raw;
  try {
    raw = await fs.readFile(ALIASES_PATH, "utf8");
  } catch {
    return map;
  }
  try {
    const j = JSON.parse(raw);
    const m = j?.jobCompanySlugToPrimarySlug;
    if (!m || typeof m !== "object") return map;
    for (const [jobSlug, primary] of Object.entries(m)) {
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
  } catch {
    /* ignore */
  }
  return map;
}

/**
 * @returns {Promise<Record<string, { displayName?: string, logoDomain?: string }>>}
 */
async function loadEnrichmentOverrides() {
  try {
    const raw = await fs.readFile(ENRICHMENT_OVERRIDES_PATH, "utf8");
    const j = JSON.parse(raw);
    return typeof j === "object" && j != null ? j : {};
  } catch {
    return {};
  }
}

/**
 * Fix common spreadsheet / ATS mangling when no explicit override exists.
 * @param {string} raw
 */
function prettifyCompanyDisplayString(raw) {
  let s = String(raw || "").trim();
  if (!s) return s;
  s = s.replace(/\bZone5\b/gi, "Zone 5");
  s = s.replace(/\bAevexaerospace\b/gi, "Aevex Aerospace");
  return s;
}

/**
 * Keep SEO Title / H1 / blurb in sync when display name uses proper spacing.
 * @param {string} displayCompany
 * @param {string} seoTitle
 * @param {string} h1
 * @param {string} careersBlurb
 */
function alignMarketingCopyWithDisplayName(displayCompany, seoTitle, h1, careersBlurb) {
  let st = seoTitle;
  let h = h1;
  let cb = careersBlurb;
  if (/\bZone 5\b/i.test(displayCompany)) {
    st = st.replace(/\bZone5\b/g, "Zone 5");
    h = h.replace(/\bZone5\b/g, "Zone 5");
    cb = cb.replace(/\bZone5\b/g, "Zone 5");
  }
  if (/\bAevex Aerospace\b/i.test(displayCompany)) {
    st = st.replace(/\bAevexaerospace\b/gi, "Aevex Aerospace");
    h = h.replace(/\bAevexaerospace\b/gi, "Aevex Aerospace");
    cb = cb.replace(/\bAevexaerospace\b/gi, "Aevex Aerospace");
  }
  return { seoTitle: st, h1: h, careersBlurb: cb };
}

/**
 * Resolver rows are keyed by slug(company_name from master). Descriptions rows may use a shorter
 * name (e.g. anduril vs anduril-industries) — merge via alias inverse + prefix match on registry slugs.
 *
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
    if (e && /** @type {any} */ (e).code === "ENOENT") {
      console.warn(
        "company-descriptions: career_source_registry.csv missing — logo fields will use spreadsheet only"
      );
      return map;
    }
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
 * Bare hostname: no protocol, path, port; lowercase. Empty if invalid.
 * @param {string} raw
 * @returns {string}
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
 * @param {Record<string, string>} reg
 */
function deriveLogoFieldsFromRegistry(reg) {
  const rawDomain = (reg.domain || "").trim();
  const domain = normalizeCanonicalDomain(rawDomain);
  const lastChecked = (reg.last_checked_at || "").trim();

  if (!domain) {
    return {
      canonicalDomain: "",
      logoUrl: "",
      logoSourceType: "none",
      logoStatus: "failed",
      logoLastCheckedAt: lastChecked,
      needsReview: true,
    };
  }

  const logoUrl = `${GOOGLE_FAVICON_BASE}${encodeURIComponent(domain)}`;

  return {
    canonicalDomain: domain,
    logoUrl,
    logoSourceType: "google_favicon",
    logoStatus: "ok",
    logoLastCheckedAt: lastChecked,
    needsReview: false,
  };
}

/**
 * Logo from known public domain when company is not in career resolver (curated hints only).
 * @param {string} host
 * @param {string} generatedAt
 */
function deriveLogoFieldsFromHintDomain(host, generatedAt) {
  const domain = normalizeCanonicalDomain(host);
  if (!domain) {
    return {
      canonicalDomain: "",
      logoUrl: "",
      logoSourceType: "hint_domain",
      logoStatus: "invalid_domain",
      logoLastCheckedAt: generatedAt,
      needsReview: true,
    };
  }
  return {
    canonicalDomain: domain,
    logoUrl: `${GOOGLE_FAVICON_BASE}${encodeURIComponent(domain)}`,
    logoSourceType: "google_favicon",
    logoStatus: "ok",
    logoLastCheckedAt: generatedAt,
    needsReview: true,
  };
}

/**
 * @param {Record<string, unknown>[]} records
 */
function countDomainBackedRecords(records) {
  return records.filter((r) => String(/** @type {any} */ (r).canonicalDomain || "").trim()).length;
}

/**
 * @param {Record<string, unknown>[]} records
 */
function countLogoBackedRecords(records) {
  return records.filter((r) => {
    const u = String(/** @type {any} */ (r).logoUrl || "").trim();
    const st = String(/** @type {any} */ (r).logoStatus ?? "")
      .trim()
      .toLowerCase();
    return u && !LOGO_STATUS_SUPPRESSED.has(st);
  }).length;
}

/**
 * @returns {Promise<Record<string, unknown>[]>}
 */
async function loadExpandedEnrichmentRecords() {
  try {
    const raw = await fs.readFile(EXPANDED_ENRICHMENT_PATH, "utf8");
    const j = JSON.parse(raw);
    return Array.isArray(j?.records) ? j.records : [];
  } catch {
    return [];
  }
}

/**
 * One record — same rules as a spreadsheet row; `primarySlug` is the registry/override key.
 *
 * @param {object} ctx
 * @param {Record<string, unknown>} ctx.row
 * @param {string} ctx.primarySlug
 * @param {Map<string, Record<string, string>>} ctx.registryBySlug
 * @param {Map<string, Set<string>>} ctx.primaryToJobSlugs
 * @param {Record<string, { displayName?: string, logoDomain?: string }>} ctx.enrichmentOverrides
 * @param {string} ctx.generatedAt
 */
function buildRecordFromSheetLikeRow(ctx) {
  const { row, primarySlug, registryBySlug, primaryToJobSlugs, enrichmentOverrides, generatedAt } = ctx;

  const companyRaw = cellString(row, "Company");
  const sheetLogoUrl = cellString(row, "Logo URL");
  const sheetLogoSource = cellString(row, "Logo Source Type");
  const sheetLogoStatus = cellString(row, "Logo Status");
  const sheetLogoChecked = cellToIsoDateString(row["Logo Last Checked At"]);
  const sheetNeedsReview = parseOptionalBoolCell(row["Needs Review"]);

  const rowOverride =
    enrichmentOverrides[primarySlug] && typeof enrichmentOverrides[primarySlug] === "object"
      ? enrichmentOverrides[primarySlug]
      : null;

  const reg = findRegistryRowForPrimarySlug(primarySlug, registryBySlug, primaryToJobSlugs);
  let derived = reg ? deriveLogoFieldsFromRegistry(reg) : null;

  if (!derived?.logoUrl && rowOverride?.logoDomain) {
    derived = deriveLogoFieldsFromHintDomain(String(rowOverride.logoDomain), generatedAt);
  }

  const displayCompany =
    (rowOverride && String(rowOverride.displayName || "").trim()) ||
    prettifyCompanyDisplayString(companyRaw);

  let canonicalDomain = "";
  let logoUrl = "";
  let logoSourceType = "";
  let logoStatus = "";
  let logoLastCheckedAt = "";
  let needsReview = false;

  if (sheetLogoUrl) {
    logoUrl = sheetLogoUrl;
    logoSourceType = sheetLogoSource || "manual";
    logoStatus = sheetLogoStatus || "manual";
    logoLastCheckedAt = sheetLogoChecked || generatedAt;
    needsReview = sheetNeedsReview !== null ? sheetNeedsReview : false;
    canonicalDomain = derived?.canonicalDomain || "";
  } else if (derived && derived.logoUrl) {
    canonicalDomain = derived.canonicalDomain;
    logoUrl = derived.logoUrl;
    logoSourceType = derived.logoSourceType;
    logoStatus = sheetLogoStatus || derived.logoStatus;
    logoLastCheckedAt = sheetLogoChecked || derived.logoLastCheckedAt || generatedAt;
    needsReview = sheetNeedsReview !== null ? sheetNeedsReview : derived.needsReview;
  } else {
    canonicalDomain = derived?.canonicalDomain || "";
    logoUrl = "";
    logoStatus = sheetLogoStatus || (derived ? derived.logoStatus : "no_resolver_match");
    logoSourceType = sheetLogoSource || (derived ? derived.logoSourceType : "") || "";
    logoLastCheckedAt = sheetLogoChecked || derived?.logoLastCheckedAt || generatedAt;
    needsReview =
      sheetNeedsReview !== null
        ? sheetNeedsReview
        : Boolean(derived && derived.needsReview) || !derived;
  }

  const seoRaw = cellString(row, "SEO Title");
  const h1Raw = cellString(row, "H1");
  const blurbRaw = cellString(row, "Careers Blurb");
  const aligned = alignMarketingCopyWithDisplayName(displayCompany, seoRaw, h1Raw, blurbRaw);

  return {
    primarySlug,
    company: displayCompany,
    description: cellString(row, "Description"),
    location: cellString(row, "Location"),
    foundedYear: parseYear(row["Founded In"]),
    seoTitle: aligned.seoTitle,
    h1: aligned.h1,
    careersBlurb: aligned.careersBlurb,
    canonicalDomain,
    logoUrl,
    logoSourceType,
    logoStatus,
    logoLastCheckedAt,
    needsReview,
  };
}

async function main() {
  const buf = await fs.readFile(XLSX_PATH);
  const wb = XLSX.read(buf, { type: "buffer" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    throw new Error("company-descriptions: workbook has no sheets");
  }
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  const byPrimary = new Map();
  const registryBySlug = await loadCareerRegistryBySlug();
  const primaryToJobSlugs = await loadPrimarySlugToJobSlugs();
  const enrichmentOverrides = await loadEnrichmentOverrides();
  const generatedAt = new Date().toISOString();

  const records = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const companyRaw = cellString(row, "Company");
    if (!companyRaw) continue;

    const primarySlug = companySlug(normalizeCompanyNameForMatch(companyRaw));
    if (!primarySlug) {
      console.warn(`company-descriptions: skip row ${i + 2} — empty slug after normalize: ${JSON.stringify(companyRaw)}`);
      continue;
    }

    if (byPrimary.has(primarySlug)) {
      const prev = byPrimary.get(primarySlug);
      throw new Error(
        `company-descriptions: duplicate primary slug "${primarySlug}" for companies ${JSON.stringify(prev)} and ${JSON.stringify(companyRaw)} — fix spreadsheet or aliases`
      );
    }
    byPrimary.set(primarySlug, companyRaw);

    records.push(
      buildRecordFromSheetLikeRow({
        row,
        primarySlug,
        registryBySlug,
        primaryToJobSlugs,
        enrichmentOverrides,
        generatedAt,
      })
    );
  }

  const sheetOnlyRecords = records.length;
  const domainBackedBeforeUnion = countDomainBackedRecords(records);
  const logoBackedBeforeUnion = countLogoBackedRecords(records);

  const expandedRows = await loadExpandedEnrichmentRecords();
  let expansionRecordsMerged = 0;
  let expansionCanonicalLogoFallbacks = 0;

  for (const expRec of expandedRows) {
    const ps = String(expRec?.primarySlug || "").trim().toLowerCase();
    if (!ps || byPrimary.has(ps)) continue;

    const fy = expRec?.foundedYear;
    const foundedIn =
      fy == null || fy === ""
        ? ""
        : typeof fy === "number"
          ? fy
          : String(fy);

    /** @type {Record<string, unknown>} */
    const fakeRow = {
      Company: String(expRec.company || "").trim() || ps,
      Description: expRec.description ?? "",
      Location: expRec.location ?? "",
      "Founded In": foundedIn,
      "SEO Title": expRec.seoTitle ?? "",
      H1: expRec.h1 ?? "",
      "Careers Blurb": expRec.careersBlurb ?? "",
      "Logo URL": "",
      "Logo Source Type": "",
      "Logo Status": "",
      "Logo Last Checked At": "",
      "Needs Review": "",
    };

    let rec = buildRecordFromSheetLikeRow({
      row: fakeRow,
      primarySlug: ps,
      registryBySlug,
      primaryToJobSlugs,
      enrichmentOverrides,
      generatedAt,
    });

    const expDomain = normalizeCanonicalDomain(String(expRec.canonicalDomain || ""));
    if (!String(rec.logoUrl || "").trim() && expDomain) {
      const hint = deriveLogoFieldsFromHintDomain(expDomain, generatedAt);
      rec = {
        ...rec,
        canonicalDomain: hint.canonicalDomain,
        logoUrl: hint.logoUrl,
        logoSourceType: hint.logoSourceType,
        logoStatus: hint.logoStatus,
        logoLastCheckedAt: hint.logoLastCheckedAt,
        needsReview: false,
      };
      expansionCanonicalLogoFallbacks += 1;
    }

    records.push(rec);
    expansionRecordsMerged += 1;
  }

  const domainBackedAfterUnion = countDomainBackedRecords(records);
  const logoBackedAfterUnion = countLogoBackedRecords(records);

  const payload = {
    generatedAt,
    sourceSheet: sheetName,
    sourceCareerRegistry: "data/career_source_registry.csv",
    sourceExpansionEnrichment: "data/company_enrichment_expanded.json",
    rowCount: records.length,
    sheetRowCount: sheetOnlyRecords,
    expansionRecordsMerged,
    expansionCanonicalLogoFallbacks,
    unionReport: {
      enrichmentCountBeforeUnion: sheetOnlyRecords,
      enrichmentCountAfterUnion: records.length,
      domainBackedBeforeUnion,
      domainBackedAfterUnion,
      logoBackedBeforeUnion,
      logoBackedAfterUnion,
    },
    records,
  };

  await fs.writeFile(OUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Wrote ${records.length} records to ${path.relative(REPO_ROOT, OUT_PATH)}`);
  console.log(
    JSON.stringify(
      {
        enrichmentCountBeforeUnion: sheetOnlyRecords,
        enrichmentCountAfterUnion: records.length,
        domainBackedBeforeUnion,
        domainBackedAfterUnion,
        logoBackedBeforeUnion,
        logoBackedAfterUnion,
        expansionRecordsMerged,
        expansionCanonicalLogoFallbacks,
        expansionFileRecordCount: expandedRows.length,
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
