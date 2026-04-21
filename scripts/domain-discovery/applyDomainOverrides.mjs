#!/usr/bin/env node
/**
 * Apply reviewed domain discovery rows to lib/companyEnrichmentOverrides.json (logoDomain only).
 * Does not modify companies_master.csv.
 *
 * Usage:
 *   node scripts/domain-discovery/applyDomainOverrides.mjs --apply-input=data/domain_discovery_candidates.csv
 *   node scripts/domain-discovery/applyDomainOverrides.mjs --include-auto-approved
 */
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { parse } from "csv-parse/sync";
import { normalizeCanonicalDomain } from "./domainUtils.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..", "..");
const OVERRIDES_PATH = path.join(REPO_ROOT, "lib", "companyEnrichmentOverrides.json");
const DEFAULT_INPUT_JSON = path.join(REPO_ROOT, "data", "domain_discovery_candidates.json");
const DEFAULT_INPUT_CSV = path.join(REPO_ROOT, "data", "domain_discovery_candidates.csv");
const REPORT_PATH = path.join(REPO_ROOT, "data", "domain_discovery_apply_report.json");

function parseArgs(argv) {
  /** @type {{ applyInput: string, force: boolean, includeAutoApproved: boolean }} */
  const o = {
    applyInput: "",
    force: false,
    includeAutoApproved: false,
  };
  for (const a of argv) {
    if (a.startsWith("--apply-input="))
      o.applyInput = path.resolve(REPO_ROOT, a.slice("--apply-input=".length));
    else if (a === "--force") o.force = true;
    else if (a === "--include-auto-approved") o.includeAutoApproved = true;
  }
  return o;
}

/**
 * @param {string} p
 * @returns {Promise<any[]>}
 */
async function loadRows(p) {
  const abs = p || DEFAULT_INPUT_CSV;
  const ext = path.extname(abs).toLowerCase();
  const raw = await fs.readFile(abs, "utf8");
  if (ext === ".json") {
    const j = JSON.parse(raw);
    return Array.isArray(j.candidates) ? j.candidates : [];
  }
  const rows = parse(raw, { columns: true, skip_empty_lines: true, relax_quotes: true, bom: true });
  return rows;
}

/**
 * @param {Record<string, unknown>} row
 */
function rowApproved(row, includeAuto) {
  const d = String(row.decision || "")
    .trim()
    .toLowerCase();
  if (d === "approved") return true;
  if (includeAuto && d === "auto_approve") return true;
  return false;
}

/**
 * @param {Record<string, unknown>} row
 */
function slugFromRow(row) {
  return String(row.company_slug || row.companySlug || "")
    .trim()
    .toLowerCase();
}

/**
 * @param {Record<string, unknown>} row
 */
function domainFromRow(row) {
  const d = normalizeCanonicalDomain(String(row.candidate_domain || row.candidateDomain || ""));
  return d;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputPath = args.applyInput || DEFAULT_INPUT_CSV;
  let rows;
  try {
    rows = await loadRows(inputPath);
  } catch (e) {
    console.error(`Failed to read ${inputPath}:`, (e && /** @type {any} */ (e).message) || e);
    process.exit(1);
  }

  const toApply = rows.filter((r) => rowApproved(r, args.includeAutoApproved) && slugFromRow(r) && domainFromRow(r));

  if (toApply.length === 0) {
    console.log(
      JSON.stringify(
        {
          message: "No rows to apply. Mark decision as 'approved' in CSV/JSON, or use --include-auto-approved.",
          input: path.relative(REPO_ROOT, inputPath),
        },
        null,
        2
      )
    );
    return;
  }

  let overrides = {};
  try {
    const raw = await fs.readFile(OVERRIDES_PATH, "utf8");
    overrides = JSON.parse(raw);
    if (typeof overrides !== "object" || !overrides) overrides = {};
  } catch (e) {
    if (e && /** @type {any} */ (e).code !== "ENOENT") throw e;
    overrides = {};
  }

  const before = JSON.stringify(overrides, null, 2);
  /** @type {any[]} */
  const changes = [];
  /** @type {any[]} */
  const skipped = [];

  for (const row of toApply) {
    const slug = slugFromRow(row);
    const domain = domainFromRow(row);
    if (!slug || !domain) {
      skipped.push({ slug, reason: "missing_slug_or_domain" });
      continue;
    }

    const prev = overrides[slug];
    const prevDomain =
      prev && typeof prev === "object" && prev.logoDomain != null
        ? normalizeCanonicalDomain(String(prev.logoDomain))
        : "";

    if (prevDomain === domain) {
      skipped.push({ slug, reason: "already_set_same_domain", domain });
      continue;
    }

    if (prevDomain && prevDomain !== domain && !args.force) {
      skipped.push({ slug, reason: "existing_logoDomain_use_force", existing: prevDomain, wanted: domain });
      continue;
    }

    const next = { ...(typeof prev === "object" && prev ? prev : {}) };
    next.logoDomain = domain;
    overrides[slug] = next;
    changes.push({
      slug,
      logoDomain: domain,
      previous_logoDomain: prevDomain || null,
    });
  }

  await fs.writeFile(OVERRIDES_PATH, JSON.stringify(overrides, null, 2) + "\n", "utf8");

  const report = {
    generated_at: new Date().toISOString(),
    input: path.relative(REPO_ROOT, inputPath),
    include_auto_approved: args.includeAutoApproved,
    applied: changes.length,
    skipped: skipped.length,
    changes,
    skipped_detail: skipped,
  };
  await fs.writeFile(REPORT_PATH, JSON.stringify(report, null, 2) + "\n", "utf8");

  console.log(
    JSON.stringify(
      {
        wrote: OVERRIDES_PATH,
        report: REPORT_PATH,
        applied: changes.length,
        skipped: skipped.length,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
