import fs from "fs/promises";
import path from "path";

const TRACKED_COMPANIES_CACHE_MS = Number(
  process.env.TRACKED_COMPANIES_CACHE_MS || 300000
);
const SOURCES_RAW_CACHE_MS = Number(process.env.SOURCES_CSV_CACHE_MS || 300000);
const cacheKey = "__trackedCompaniesCache";
const cache = globalThis[cacheKey] || {
  companies: [],
  lastLoadedAt: 0,
};
globalThis[cacheKey] = cache;

const rawCsvCache = globalThis.__sourcesCsvRawCache || { text: null, loadedAt: 0 };
globalThis.__sourcesCsvRawCache = rawCsvCache;

function normalizeCompanyName(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    return decodeURIComponent(raw).trim();
  } catch {
    return raw;
  }
}

function normalizeSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function readSourcesCsv() {
  const now = Date.now();
  if (
    rawCsvCache.text !== null &&
    rawCsvCache.loadedAt &&
    now - rawCsvCache.loadedAt < SOURCES_RAW_CACHE_MS
  ) {
    return rawCsvCache.text;
  }

  const candidates = [path.join(/* turbopackIgnore: true */ process.cwd(), "sources.csv")];

  for (const filePath of candidates) {
    try {
      const raw = await fs.readFile(filePath, "utf8");
      rawCsvCache.text = raw;
      rawCsvCache.loadedAt = now;
      return raw;
    } catch {
      // Try next location.
    }
  }

  rawCsvCache.text = "";
  rawCsvCache.loadedAt = now;
  return "";
}

function parseNonEmptyCsvLines(raw) {
  return String(raw || "")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseCsvLine(line) {
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
}

function findFirstHeaderIndex(headers, candidates) {
  return candidates
    .map((key) => headers.indexOf(key))
    .find((idx) => idx >= 0);
}

export async function getTrackedCompanies() {
  const now = Date.now();
  if (cache.lastLoadedAt && now - cache.lastLoadedAt < TRACKED_COMPANIES_CACHE_MS) {
    return cache.companies;
  }

  const raw = await readSourcesCsv();
  if (!raw) {
    cache.companies = [];
    cache.lastLoadedAt = Date.now();
    return [];
  }

  const lines = parseNonEmptyCsvLines(raw);

  if (lines.length < 2) {
    cache.companies = [];
    cache.lastLoadedAt = Date.now();
    return [];
  }

  const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
  const companyIndex = findFirstHeaderIndex(headers, [
    "company",
    "company_name",
    "name",
    "slug",
  ]);
  const statusIndex = findFirstHeaderIndex(headers, ["status", "state"]);
  if (companyIndex == null || companyIndex < 0 || statusIndex == null || statusIndex < 0) {
    cache.companies = [];
    cache.lastLoadedAt = Date.now();
    return [];
  }

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

  cache.companies = [...new Set(approved)].sort((a, b) => a.localeCompare(b));
  cache.lastLoadedAt = Date.now();
  return cache.companies;
}

export async function getTrackedCompaniesCount() {
  const companies = await getTrackedCompanies();
  return companies.length;
}

const metaCacheKey = "__approvedSourcesMetaByCompanyCache";
const metaCache = globalThis[metaCacheKey] || {
  map: /** @type {Map<string, { provider: string, slug: string, company: string }>} */ (
    new Map()
  ),
  lastLoadedAt: 0,
};
globalThis[metaCacheKey] = metaCache;

/**
 * Approved/auto sources.csv rows keyed by normalized company name (same normalization as getTrackedCompanies).
 * Used to join source_performance (provider|slug) for directory status.
 *
 * @returns {Promise<Map<string, { provider: string, slug: string, company: string }>>}
 */
export async function getApprovedSourcesMetaByCompany() {
  const now = Date.now();
  if (metaCache.lastLoadedAt && now - metaCache.lastLoadedAt < TRACKED_COMPANIES_CACHE_MS) {
    return metaCache.map;
  }

  const raw = await readSourcesCsv();
  metaCache.map = new Map();
  metaCache.lastLoadedAt = Date.now();

  if (!raw) {
    return metaCache.map;
  }

  const lines = parseNonEmptyCsvLines(raw);
  if (lines.length < 2) {
    return metaCache.map;
  }

  const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
  const companyIndex = findFirstHeaderIndex(headers, [
    "company",
    "company_name",
    "name",
    "slug",
  ]);
  const statusIndex = findFirstHeaderIndex(headers, ["status", "state"]);
  const atsIndex = findFirstHeaderIndex(headers, ["ats", "provider"]);
  const slugIndex = findFirstHeaderIndex(headers, ["slug"]);

  if (
    companyIndex == null ||
    companyIndex < 0 ||
    statusIndex == null ||
    statusIndex < 0 ||
    atsIndex == null ||
    atsIndex < 0 ||
    slugIndex == null ||
    slugIndex < 0
  ) {
    return metaCache.map;
  }

  for (const line of lines.slice(1)) {
    const parts = parseCsvLine(line);
    const company = normalizeCompanyName(parts[companyIndex] || "");
    const status = String(parts[statusIndex] || "").trim().toLowerCase();
    const provider = String(parts[atsIndex] || "")
      .trim()
      .toLowerCase();
    const slug = String(parts[slugIndex] || "").trim();
    if (!company || (status !== "approved" && status !== "auto")) continue;
    if (!provider || !slug) continue;
    if (!metaCache.map.has(company)) {
      metaCache.map.set(company, { provider, slug, company });
    }
  }

  return metaCache.map;
}

export async function getSourcesCsvRowCount() {
  const raw = await readSourcesCsv();
  if (!raw) return 0;
  const lines = parseNonEmptyCsvLines(raw);
  if (lines.length === 0) return 0;
  return Math.max(0, lines.length - 1);
}

export async function getCompanyWebsiteFromSources(companyName) {
  const raw = await readSourcesCsv();
  if (!raw) return "";
  const lines = parseNonEmptyCsvLines(raw);
  if (lines.length < 2) return "";

  const headers = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const rows = lines.slice(1).map((line) => parseCsvLine(line));

  const companyIndexCandidates = ["company_name", "company", "name", "slug"];
  const websiteIndexCandidates = [
    "company_website",
    "website",
    "url",
    "company_url",
    "career_url",
    "careers_url",
    "careers_page",
  ];

  const companyIndex = findFirstHeaderIndex(headers, companyIndexCandidates);
  const websiteIndex = findFirstHeaderIndex(headers, websiteIndexCandidates);

  if (companyIndex == null || companyIndex < 0 || websiteIndex == null || websiteIndex < 0) {
    return "";
  }

  const target = normalizeSlug(companyName);
  const row = rows.find((parts) => normalizeSlug(parts[companyIndex] || "") === target);
  if (!row) return "";
  const url = String(row[websiteIndex] || "").trim();
  if (!/^https?:\/\//i.test(url)) return "";
  return url;
}
