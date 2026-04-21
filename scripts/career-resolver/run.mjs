#!/usr/bin/env node
/**
 * Career page resolver — reads data/companies_master.csv, writes data/career_source_registry.csv
 *
 * Usage:
 *   node scripts/career-resolver/run.mjs [--force]
 *   node scripts/career-resolver/run.mjs [--offset=N] [--max=M] [--only-keys=cm-0001,cm-0002]
 *
 * Selection: --offset (0-based master row index), --max (row count), --only-keys (comma-separated).
 * Rows outside the selection keep existing registry values when present.
 *
 * Env (optional; CI/GitHub Actions): RESOLVER_OFFSET, RESOLVER_MAX, RESOLVER_ONLY_KEYS — applied only
 * for selection fields not set via CLI flags (CLI wins).
 */
import fs from "fs/promises";
import path from "path";
import { parse } from "csv-parse/sync";

import {
  RESOLVER_INTER_COMPANY_DELAY_MS,
  RESOLVER_ORIGIN_CACHE_ENABLED,
} from "./constants.mjs";
import {
  loadRegistryByKey,
  writeRegistry,
  shouldReprocess,
  OUTPUT_COLUMNS,
} from "./registry.mjs";
import { resolveCompanyRow } from "./resolveCompany.mjs";
import { companyKeyFromRow, resolverCacheKeyFromHomepageUrl } from "./urlUtils.mjs";
import { resolveValidatedHomepage } from "./homepageValidation.mjs";
import { PATHS } from "../config/pipelinePaths.mjs";

const REPO_ROOT = process.cwd();
const INPUT_CSV = path.join(REPO_ROOT, PATHS.companiesMaster);
const OUTPUT_CSV = path.join(REPO_ROOT, PATHS.careerSourceRegistry);
const LOG_FILE = path.join(REPO_ROOT, "logs", "career-resolver.log");

/**
 * @param {string[]} argv
 * @returns {{
 *   force: boolean,
 *   offset: number,
 *   max: number | null,
 *   onlyKeys: Set<string> | null,
 *   offsetFromCli: boolean,
 *   maxFromCli: boolean,
 *   onlyKeysFromCli: boolean,
 * }}
 */
function parseArgs(argv) {
  const force = argv.includes("--force");
  let offset = 0;
  /** @type {number | null} */
  let max = null;
  /** @type {Set<string> | null} */
  let onlyKeys = null;
  let offsetFromCli = false;
  let maxFromCli = false;
  let onlyKeysFromCli = false;

  for (const a of argv) {
    if (a.startsWith("--offset=")) {
      const n = parseInt(a.slice("--offset=".length), 10);
      if (Number.isFinite(n) && n >= 0) {
        offset = n;
        offsetFromCli = true;
      }
    } else if (a.startsWith("--max=")) {
      const n = parseInt(a.slice("--max=".length), 10);
      if (Number.isFinite(n) && n > 0) {
        max = n;
        maxFromCli = true;
      }
    } else if (a.startsWith("--only-keys=")) {
      const s = a.slice("--only-keys=".length).trim();
      const keys = s.split(",").map((x) => x.trim()).filter(Boolean);
      onlyKeysFromCli = true;
      onlyKeys = keys.length ? new Set(keys) : null;
    }
  }

  return {
    force,
    offset,
    max,
    onlyKeys,
    offsetFromCli,
    maxFromCli,
    onlyKeysFromCli,
  };
}

/**
 * Optional selection overrides from env (e.g. GitHub Actions). CLI flags take precedence.
 * @param {{
 *   offset: number,
 *   max: number | null,
 *   onlyKeys: Set<string> | null,
 *   offsetFromCli: boolean,
 *   maxFromCli: boolean,
 *   onlyKeysFromCli: boolean,
 * }} parsed
 */
function mergeEnvSelection(parsed) {
  const o = { ...parsed };
  const off = String(process.env.RESOLVER_OFFSET ?? "").trim();
  if (!o.offsetFromCli && off) {
    const n = parseInt(off, 10);
    if (Number.isFinite(n) && n >= 0) o.offset = n;
  }
  const mx = String(process.env.RESOLVER_MAX ?? "").trim();
  if (!o.maxFromCli && mx) {
    const n = parseInt(mx, 10);
    if (Number.isFinite(n) && n > 0) o.max = n;
  }
  const ok = String(process.env.RESOLVER_ONLY_KEYS ?? "").trim();
  if (!o.onlyKeysFromCli && ok) {
    const keys = ok.split(",").map((x) => x.trim()).filter(Boolean);
    o.onlyKeys = keys.length ? new Set(keys) : null;
  }
  return o;
}

/**
 * @param {number} i — 0-based index into masterRows
 * @param {string} key — company_key
 * @param {number} offset
 * @param {number | null} max
 * @param {Set<string> | null} onlyKeys
 */
function rowInSelection(i, key, offset, max, onlyKeys) {
  const inSlice = i >= offset && (max == null || i < offset + max);
  const keyOk = onlyKeys === null || onlyKeys.has(key);
  return inSlice && keyOk;
}

/**
 * @param {Record<string, string>} cached
 * @param {Record<string, string | boolean | null | undefined>} mapped
 */
function cloneCachedResolverRow(cached, mapped) {
  const row = { ...cached };
  row.company_name = mapped.company_name;
  row.company_key = mapped.company_key;
  row.homepage_url = mapped.homepage_url;
  row.domain = mapped.domain;
  row.linkedin_url = mapped.linkedin_url;
  row.category = mapped.category;
  row.confidence_flag = mapped.confidence_flag;
  row.homepage_input_validation = mapped.homepage_input_validation ?? "";
  row.homepage_validation_note = mapped.homepage_validation_note ?? "";
  row.last_checked_at = new Date().toISOString();
  return row;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * @param {Record<string, string>} row
 */
function mapInputRow(row, index1Based) {
  const company_name = (row.Company ?? "").trim();
  const domain = (row.domain ?? "").trim();
  const full_url = (row.full_url ?? "").trim();
  const linkedin_url = (row.LinkedIn ?? "").trim();
  const category = (row.Category ?? "").trim();
  const confidence_flag = (row.confidence_flag ?? "").trim();

  const resolved = resolveValidatedHomepage(full_url, domain);
  if ("error" in resolved) {
    return {
      company_key: companyKeyFromRow(index1Based),
      company_name,
      homepage_url: "",
      domain: domain || "",
      linkedin_url,
      category,
      confidence_flag,
      resolveError: resolved.error,
      homepage_input_validation: resolved.homepage_input_validation,
      homepage_validation_note: resolved.homepage_validation_note,
      used_domain_fallback_after_rejected_url: false,
    };
  }

  return {
    company_key: companyKeyFromRow(index1Based),
    company_name,
    homepage_url: resolved.homepageUrl,
    domain: resolved.domain,
    linkedin_url,
    category,
    confidence_flag,
    resolveError: null,
    homepage_input_validation: resolved.homepage_input_validation,
    homepage_validation_note: resolved.homepage_validation_note,
    used_domain_fallback_after_rejected_url:
      resolved.used_domain_fallback_after_rejected_url,
  };
}

async function appendLog(line) {
  const dir = path.dirname(LOG_FILE);
  await fs.mkdir(dir, { recursive: true });
  await fs.appendFile(LOG_FILE, line + "\n", "utf8");
}

async function main() {
  const argv = process.argv.slice(2);
  const merged = mergeEnvSelection(parseArgs(argv));
  const { force, offset, max, onlyKeys } = merged;

  const raw = await fs.readFile(INPUT_CSV, "utf8");
  const masterRows = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    bom: true,
  });

  const existing = await loadRegistryByKey(OUTPUT_CSV);

  /** @type {Map<string, Record<string, string>>} */
  const originCache = new Map();
  let originCacheHits = 0;

  /** @type {Record<string, string>[]} */
  const output = [];
  let processed = 0;
  let skipped = 0;
  let keptExistingOutOfSelection = 0;

  /** Counts by `homepage_input_validation` for processed rows */
  const homepageValidationHistogram = {};
  let rejectedUrlDomainFallbackCount = 0;

  for (let i = 0; i < masterRows.length; i++) {
    const idx = i + 1;
    const mapped = mapInputRow(masterRows[i], idx);
    const key = mapped.company_key;

    const selected = rowInSelection(i, key, offset, max, onlyKeys);
    const prior = existing.get(key);

    if (!selected) {
      if (prior) {
        output.push(prior);
        keptExistingOutOfSelection += 1;
        continue;
      }
      // No prior for this row — must resolve (e.g. first run, new company).
    }

    if (!force && prior && !shouldReprocess(prior.resolver_status)) {
      output.push(prior);
      skipped += 1;
      continue;
    }

    /** @type {Record<string, string>} */
    let result;
    /** @type {boolean} */
    let originCacheHit = false;

    if (mapped.resolveError) {
      const isMissingHomepage = mapped.resolveError === "missing_homepage";
      result = {
        company_name: mapped.company_name,
        company_key: mapped.company_key,
        homepage_url: mapped.homepage_url,
        domain: mapped.domain,
        linkedin_url: mapped.linkedin_url,
        category: mapped.category,
        confidence_flag: mapped.confidence_flag,
        homepage_input_validation: mapped.homepage_input_validation,
        homepage_validation_note: mapped.homepage_validation_note,
        careers_url_candidate: "",
        careers_url_final: "",
        redirected_to: "",
        resolver_status: isMissingHomepage ? "homepage_missing" : "homepage_fetch_failed",
        source_type_guess: isMissingHomepage ? "manual_review" : "fetch_failed",
        notes: JSON.stringify({
          homepageUsed: "",
          pathsTried: [],
          error: mapped.resolveError,
          probeLog: [],
          homepageScan: false,
          finalUrl: "",
          classification: "fetch_failed",
          homepageInputValidation: mapped.homepage_input_validation,
          homepageValidationNote: mapped.homepage_validation_note,
        }),
        last_checked_at: new Date().toISOString(),
      };
    } else {
      const cacheKey = resolverCacheKeyFromHomepageUrl(mapped.homepage_url);
      const useCache =
        RESOLVER_ORIGIN_CACHE_ENABLED &&
        cacheKey &&
        originCache.has(cacheKey);

      if (useCache) {
        result = cloneCachedResolverRow(
          /** @type {Record<string, string>} */ (originCache.get(cacheKey)),
          mapped
        );
        originCacheHits += 1;
        originCacheHit = true;
      } else {
        result = await resolveCompanyRow({
          company_name: mapped.company_name,
          company_key: mapped.company_key,
          homepage_url: mapped.homepage_url,
          domain: mapped.domain,
          linkedin_url: mapped.linkedin_url,
          category: mapped.category,
          confidence_flag: mapped.confidence_flag,
        });
        result.homepage_input_validation = mapped.homepage_input_validation;
        result.homepage_validation_note = mapped.homepage_validation_note;

        if (RESOLVER_ORIGIN_CACHE_ENABLED && cacheKey) {
          originCache.set(cacheKey, { ...result });
        }
      }
    }

    for (const col of OUTPUT_COLUMNS) {
      if (result[col] == null) result[col] = "";
    }

    const hv = (result.homepage_input_validation || "").trim() || "(empty)";
    homepageValidationHistogram[hv] = (homepageValidationHistogram[hv] || 0) + 1;
    if (mapped.used_domain_fallback_after_rejected_url) {
      rejectedUrlDomainFallbackCount += 1;
    }

    output.push(result);
    processed += 1;

    const logPayload = {
      ts: new Date().toISOString(),
      company_key: key,
      company_name: mapped.company_name,
      homepage: mapped.homepage_url || mapped.resolveError,
      resolver_status: result.resolver_status,
      source_type_guess: result.source_type_guess,
    };
    if (originCacheHit) {
      logPayload.origin_cache_hit = true;
    }
    const logLine = JSON.stringify(logPayload);
    console.log(logLine);
    await appendLog(logLine);

    if (output.length > 0 && output.length % 25 === 0) {
      await writeRegistry(OUTPUT_CSV, output);
    }

    if (i < masterRows.length - 1 && RESOLVER_INTER_COMPANY_DELAY_MS > 0) {
      await sleep(RESOLVER_INTER_COMPANY_DELAY_MS);
    }
  }

  await writeRegistry(OUTPUT_CSV, output);

  console.log(
    JSON.stringify(
      {
        ok: true,
        inputRows: masterRows.length,
        processed,
        skipped,
        kept_existing_out_of_selection: keptExistingOutOfSelection,
        origin_cache_hits: originCacheHits,
        origin_cache_enabled: RESOLVER_ORIGIN_CACHE_ENABLED,
        selection: { offset, max, only_keys: onlyKeys ? [...onlyKeys] : null },
        inter_company_delay_ms: RESOLVER_INTER_COMPANY_DELAY_MS,
        outputPath: OUTPUT_CSV,
        force,
        homepage_validation: {
          rejected_url_replaced_by_domain_fallback: rejectedUrlDomainFallbackCount,
          by_flag: homepageValidationHistogram,
        },
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
