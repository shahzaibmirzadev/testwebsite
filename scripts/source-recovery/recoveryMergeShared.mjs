/**
 * Shared dedupe / identity helpers for recovery → production merge scripts.
 */
import fs from "fs/promises";
import { parse } from "csv-parse/sync";

/**
 * @param {string} name
 */
export function normalizeCompanyName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * @param {string} sourcesCsvPath — absolute path to sources.csv
 * @returns {Promise<{ rows: Record<string, string>[], byKey: Map<string, Record<string, string>>, byCompany: Map<string, Record<string, string>[]> }>}
 */
export async function loadTrackedSourcesIndex(sourcesCsvPath) {
  let raw;
  try {
    raw = await fs.readFile(sourcesCsvPath, "utf8");
  } catch {
    return { rows: [], byKey: new Map(), byCompany: new Map() };
  }
  const rows = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    bom: true,
  });

  /** @type {Map<string, Record<string, string>>} */
  const byKey = new Map();
  /** @type {Map<string, Record<string, string>[]>} */
  const byCompany = new Map();

  for (const row of rows) {
    const provider = (row.ats || row.provider || "").trim().toLowerCase();
    const slug = (row.slug || "").trim();
    const company_name = (row.company_name || row.company || "").trim();
    const status = (row.status || "").trim().toLowerCase();
    if (!provider || !slug || !company_name) continue;
    if (status !== "approved" && status !== "auto") continue;

    const key = `${provider}|${slug.toLowerCase()}`;
    byKey.set(key, { ...row, provider, slug, company_name });

    const cn = normalizeCompanyName(company_name);
    if (!byCompany.has(cn)) byCompany.set(cn, []);
    byCompany.get(cn).push({ provider, slug, company_name });
  }

  return { rows, byKey, byCompany };
}

/**
 * @param {string} manualCompanyNorm
 * @param {string} provider
 * @param {string} slug
 * @param {{ byKey: Map<string, Record<string, string>>, byCompany: Map<string, Record<string, string>[]> }} idx
 */
export function matchAgainstTrackedSources(manualCompanyNorm, provider, slug, idx) {
  const p = String(provider || "").trim().toLowerCase();
  const s = String(slug || "").trim();
  if (!p || !s) {
    return { kind: "blocked", detail: "missing_provider_or_slug_for_match" };
  }
  const key = `${p}|${s.toLowerCase()}`;
  if (idx.byKey.has(key)) {
    return {
      kind: "already_tracked_exact",
      detail: `sources_csv_row_${p}_${s}`,
      existing: idx.byKey.get(key),
    };
  }

  const list = idx.byCompany.get(manualCompanyNorm) || [];
  if (list.length === 0) {
    return { kind: "ready_new_source", detail: "no_company_name_collision" };
  }
  if (list.length > 1) {
    return {
      kind: "ambiguous_company_match",
      detail: `multiple_sources_rows_same_normalized_name_count_${list.length}`,
      existing: list,
    };
  }
  const one = list[0];
  if (one.provider === p && one.slug === s) {
    return { kind: "already_tracked_exact", detail: "single_list_match_same_key" };
  }
  return {
    kind: "tracked_same_company_different_source",
    detail: `existing_${one.provider}|${one.slug}`,
    existing: one,
  };
}

/**
 * @param {string} url
 */
export function normalizeCareersUrlKey(url) {
  try {
    const u = new URL(String(url || "").trim());
    u.hash = "";
    let path = u.pathname.replace(/\/+$/, "");
    if (path === "") path = "";
    return `${u.hostname.toLowerCase()}${path}`.toLowerCase();
  } catch {
    return String(url || "")
      .trim()
      .toLowerCase();
  }
}
