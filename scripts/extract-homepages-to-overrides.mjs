/**
 * One-off / repeatable: read data/Company Descriptions.xlsx (Homepage URL column),
 * write data/company_descriptions_homepage_extract.json, merge logoDomain into
 * lib/companyEnrichmentOverrides.json (preserves existing displayName).
 *
 * Usage: node scripts/extract-homepages-to-overrides.mjs
 */
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import * as XLSX from "xlsx";
import { decodeUrlEncodedCompanyName } from "./lib/urlDecodeCompanyName.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..");
const XLSX_PATH = path.join(REPO_ROOT, "data", "Company Descriptions.xlsx");
const EXTRACT_OUT = path.join(REPO_ROOT, "data", "company_descriptions_homepage_extract.json");
const OVERRIDES_PATH = path.join(REPO_ROOT, "lib", "companyEnrichmentOverrides.json");

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

async function main() {
  const buf = await fs.readFile(XLSX_PATH);
  const wb = XLSX.read(buf, { type: "buffer" });
  const sheetName = wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: "" });

  /** @type {{ extractedAt: string, sheet: string, rowCount: number, records: object[] }} */
  const extract = {
    extractedAt: new Date().toISOString(),
    sheet: sheetName,
    rowCount: 0,
    records: [],
  };

  const bySlug = new Map();
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const companyRaw = String(row.Company ?? "").trim();
    if (!companyRaw) continue;
    const primarySlug = companySlug(normalizeCompanyNameForMatch(companyRaw));
    if (!primarySlug) continue;
    const homepageUrl = String(row["Homepage URL"] ?? "").trim();
    let derivedDomain = homepageUrl ? normalizeCanonicalDomain(homepageUrl) : "";
    // Apex hostnames tend to work better with favicon/logo CDNs than www.
    if (derivedDomain.startsWith("www.")) derivedDomain = derivedDomain.slice(4);
    if (bySlug.has(primarySlug)) {
      throw new Error(`duplicate primarySlug in sheet: "${primarySlug}"`);
    }
    bySlug.set(primarySlug, true);
    extract.records.push({
      sheetRow: i + 2,
      primarySlug,
      company: companyRaw,
      homepageUrl,
      derivedDomain,
    });
  }
  extract.rowCount = extract.records.length;

  await fs.writeFile(EXTRACT_OUT, `${JSON.stringify(extract, null, 2)}\n`, "utf8");
  console.log(`Wrote ${extract.rowCount} records to ${path.relative(REPO_ROOT, EXTRACT_OUT)}`);

  let existing = {};
  try {
    existing = JSON.parse(await fs.readFile(OVERRIDES_PATH, "utf8"));
  } catch {
    existing = {};
  }

  const merged = { ...existing };
  for (const rec of extract.records) {
    if (!rec.derivedDomain) continue;
    const prev = merged[rec.primarySlug] && typeof merged[rec.primarySlug] === "object" ? merged[rec.primarySlug] : {};
    merged[rec.primarySlug] = {
      ...prev,
      logoDomain: rec.derivedDomain,
    };
  }

  const sortedKeys = Object.keys(merged).sort((a, b) => a.localeCompare(b));
  const sorted = {};
  for (const k of sortedKeys) sorted[k] = merged[k];

  await fs.writeFile(OVERRIDES_PATH, `${JSON.stringify(sorted, null, 2)}\n`, "utf8");
  console.log(`Updated ${path.relative(REPO_ROOT, OVERRIDES_PATH)} (${sortedKeys.length} keys)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
