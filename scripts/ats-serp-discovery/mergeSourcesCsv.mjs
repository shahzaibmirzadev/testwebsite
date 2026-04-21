/**
 * Read sources.csv → append new provider|slug rows → rewrite with stable column order.
 *
 * `added` in the return value is always `toAppend.length` — rows included in the same
 * `combined` array passed to `fs.writeFile`. There is no success path that increments
 * `added` without writing `combined` to `sourcesPath` (a failed write throws).
 */
import fs from "fs/promises";
import crypto from "crypto";
import path from "path";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";

import { providerSlugKey } from "./parseAtsUrl.mjs";

const LOG = "[mergeSourcesCsv]";

/** @param {number} ms */
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * @param {string} filePath
 * @param {string} contents utf8
 */
function sha256Utf8(contents) {
  return crypto.createHash("sha256").update(contents, "utf8").digest("hex");
}

/**
 * @param {Record<string, string>[]} rows
 */
function keysFromParsedRows(rows) {
  /** @type {Set<string>} */
  const keys = new Set();
  for (const row of rows) {
    const p = String(row.ats || row.provider || "")
      .trim()
      .toLowerCase();
    const s = String(row.slug || "").trim();
    if (p && s) keys.add(providerSlugKey(p, s));
  }
  return keys;
}

/**
 * @param {string} sourcesPath
 * @param {{ provider: string, slug: string, company_name: string, defaultScrapeTier: string, defaultScrapeEveryRuns: string }[]} newRows
 * @param {{
 *   appendLogPath?: string,
 *   backupBeforeMerge?: boolean,
 *   backupDir?: string,
 * }} [options]
 * backupBeforeMerge: copy sources.csv to data/ingestion/backups before overwrite (live runs).
 * @returns {Promise<{
 *   added: number,
 *   skipped_duplicates: number,
 *   columns: string[],
 *   verified_appended_keys: number,
 *   verification_expected: number,
 *   parsed_row_count_after_readback: number,
 *   parsed_row_delta_vs_before: number,
 *   sha256_immediate_readback: string,
 *   sha256_delayed_readback: string,
 *   parsed_row_count_delayed_readback: number,
 *   post_merge_file_changed_after_delay: boolean,
 *   mtime_ms_immediate_after_write: number,
 *   mtime_ms_delayed_after_write: number,
 * }>}
 */
export async function mergeNewSourcesIntoCsv(sourcesPath, newRows, options = {}) {
  const appendLogPath = options.appendLogPath
    ? path.resolve(options.appendLogPath)
    : undefined;
  const backupBeforeMerge = Boolean(options.backupBeforeMerge);
  const backupDirResolved = options.backupDir
    ? path.resolve(options.backupDir)
    : path.join(path.dirname(path.resolve(sourcesPath)), "data", "ingestion", "backups");
  const absTarget = path.resolve(sourcesPath);
  console.log(`${LOG} write target (absolute, pinned): ${absTarget}`);

  const raw = await fs.readFile(sourcesPath, "utf8");
  const sha256Before = crypto.createHash("sha256").update(raw, "utf8").digest("hex");
  const bytesBefore = Buffer.byteLength(raw, "utf8");

  const existing = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    bom: true,
  });

  if (!existing.length) {
    throw new Error(`sources.csv has no rows: ${sourcesPath}`);
  }

  const rowCountBefore = existing.length;
  const candidateCount = newRows.length;
  console.log(`${LOG} data rows before merge (parsed): ${rowCountBefore}`);
  console.log(`${LOG} candidate rows passed in: ${candidateCount}`);

  const columns = Object.keys(existing[0]);
  /** @type {Set<string>} */
  const existingKeys = new Set();
  for (const row of existing) {
    const p = String(row.ats || row.provider || "")
      .trim()
      .toLowerCase();
    const s = String(row.slug || "").trim();
    if (p && s) existingKeys.add(providerSlugKey(p, s));
  }

  let skipped_duplicates = 0;
  /** @type {Record<string, string>[] } */
  const toAppend = [];

  for (const nr of newRows) {
    const k = providerSlugKey(nr.provider, nr.slug);
    if (existingKeys.has(k)) {
      skipped_duplicates += 1;
      continue;
    }
    existingKeys.add(k);
    toAppend.push(
      buildSourcesRow(columns, nr.provider, nr.slug, nr.company_name, {
        scrapeTier: nr.defaultScrapeTier,
        scrapeEveryRuns: nr.defaultScrapeEveryRuns,
      })
    );
  }

  const combined = [...existing, ...toAppend];
  const rowCountAfterInMemory = combined.length;
  const actuallyAdded = toAppend.length;

  console.log(`${LOG} rows to append (unique vs existing/candidates): ${actuallyAdded}`);
  console.log(`${LOG} skipped duplicate keys: ${skipped_duplicates}`);
  console.log(`${LOG} data rows after merge (in-memory): ${rowCountAfterInMemory}`);
  if (candidateCount > 0 && actuallyAdded === 0) {
    console.log(
      `${LOG} note: no new rows — all ${candidateCount} candidate(s) were duplicate provider|slug keys; file still rewritten (stringify)`
    );
  }

  const out = stringify(combined, {
    header: true,
    columns,
    quoted_string: true,
  });

  const payload = "\uFEFF" + out;

  if (backupBeforeMerge && actuallyAdded > 0) {
    await fs.mkdir(backupDirResolved, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = path.join(
      backupDirResolved,
      `sources.pre_merge.${stamp}.csv`
    );
    await fs.copyFile(absTarget, backupPath);
    console.log(`${LOG} pre-merge backup written: ${backupPath}`);
  }

  await fs.writeFile(sourcesPath, payload, "utf8");

  const statAfterWrite = await fs.stat(absTarget);
  const mtimeImmediateMs = statAfterWrite.mtimeMs;
  console.log(
    `${LOG} mtime immediately after write: ${new Date(mtimeImmediateMs).toISOString()} (mtimeMs=${mtimeImmediateMs})`
  );

  const rawAfter = await fs.readFile(sourcesPath, "utf8");
  const sha256After = sha256Utf8(rawAfter);
  const bytesAfter = Buffer.byteLength(rawAfter, "utf8");
  const diskChanged = sha256Before !== sha256After;

  console.log(`${LOG} SHA-256 immediately after write (readback): ${sha256After}`);

  console.log(`${LOG} bytes on disk before: ${bytesBefore}`);
  console.log(`${LOG} bytes on disk after:  ${bytesAfter}`);
  console.log(`${LOG} sha256 before write: ${sha256Before}`);
  console.log(`${LOG} sha256 after readback: ${sha256After}`);
  console.log(
    `${LOG} file contents changed on disk (sha256 differs): ${diskChanged}`
  );
  if (!diskChanged && actuallyAdded > 0) {
    console.warn(
      `${LOG} WARNING: added ${actuallyAdded} row(s) but SHA256 unchanged — unexpected; check path or concurrent writers`
    );
  }

  const parsedAfter = parse(rawAfter, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    bom: true,
  });
  const parsedRowCountAfter = parsedAfter.length;
  const deltaFromBefore = parsedRowCountAfter - rowCountBefore;

  console.log(
    `${LOG} parsed data rows after readback (csv-parse): ${parsedRowCountAfter}`
  );
  console.log(
    `${LOG} parsed row delta vs before merge: ${deltaFromBefore} (expected +${actuallyAdded} when append succeeded)`
  );

  await sleep(2000);

  const statDelayed = await fs.stat(absTarget);
  const mtimeDelayedMs = statDelayed.mtimeMs;
  console.log(
    `${LOG} mtime ~2s after write: ${new Date(mtimeDelayedMs).toISOString()} (mtimeMs=${mtimeDelayedMs})`
  );

  const rawDelayed = await fs.readFile(sourcesPath, "utf8");
  const sha256Delayed = sha256Utf8(rawDelayed);
  console.log(`${LOG} SHA-256 ~2s after write (re-read): ${sha256Delayed}`);

  const parsedDelayed = parse(rawDelayed, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    bom: true,
  });
  const parsedRowCountDelayed = parsedDelayed.length;
  console.log(
    `${LOG} parsed data rows ~2s after write (csv-parse): ${parsedRowCountDelayed}`
  );

  let postMergeFileChangedAfterDelay = false;
  if (
    sha256Delayed !== sha256After ||
    parsedRowCountDelayed !== parsedRowCountAfter
  ) {
    postMergeFileChangedAfterDelay = true;
    console.warn(
      `${LOG} WARNING: sources.csv changed again after merge; possible external overwrite/revert`
    );
    console.warn(
      `${LOG}   immediate readback: sha256=${sha256After} rows=${parsedRowCountAfter}`
    );
    console.warn(
      `${LOG}   delayed readback: sha256=${sha256Delayed} rows=${parsedRowCountDelayed}`
    );
  }

  const keysAfterReadback = keysFromParsedRows(parsedAfter);
  /** @type {string[]} */
  const expectedKeys = toAppend.map((r) => {
    const p = String(r.ats || r.provider || "")
      .trim()
      .toLowerCase();
    const s = String(r.slug || "").trim();
    return providerSlugKey(p, s);
  });

  let verified = 0;
  /** @type {string[]} */
  const missingKeys = [];
  for (const ek of expectedKeys) {
    if (keysAfterReadback.has(ek)) {
      verified += 1;
    } else {
      missingKeys.push(ek);
    }
  }

  const expectedLen = expectedKeys.length;
  console.log(
    `${LOG} verified appended keys after readback: ${verified}/${expectedLen}`
  );
  const verificationFailed =
    expectedLen > 0 && (verified !== expectedLen || missingKeys.length > 0);
  if (verificationFailed) {
    console.warn(
      `${LOG} WARNING: merge verification failed — append proof incomplete`
    );
    console.warn(`${LOG}   absolute target: ${absTarget}`);
    console.warn(
      `${LOG}   parsed rows before merge: ${rowCountBefore} | after immediate readback: ${parsedRowCountAfter}`
    );
    console.warn(
      `${LOG}   sha256 before write: ${sha256Before} | immediate readback: ${sha256After}`
    );
    console.warn(
      `${LOG}   missing provider|slug keys: ${missingKeys.length ? missingKeys.join(", ") : "(none enumerated)"}`
    );
    console.warn(`${LOG}   verified appended keys: ${verified}/${expectedLen}`);
  }

  if (expectedLen > 0) {
    console.log(`${LOG} appended provider|slug keys:`);
    for (const k of expectedKeys) {
      console.log(`- ${k}`);
    }
    const firstSlug = String(toAppend[0]?.slug ?? "").trim();
    if (firstSlug) {
      console.log(`Verify with: findstr /i "${firstSlug}" sources.csv`);
    }
  }

  if (appendLogPath && toAppend.length > 0) {
    const lines = toAppend.map((row) => {
      const lineStamp = new Date().toISOString();
      const p = String(row.ats || row.provider || "")
        .trim()
        .toLowerCase();
      const s = String(row.slug || "").trim();
      const cn = String(row.company_name || "").trim();
      return `APPEND_ROW\t${lineStamp}\t${p}\t${s}\t${cn.replace(/\t/g, " ")}\t${absTarget}\n`;
    });
    await fs.appendFile(appendLogPath, lines.join(""), "utf8");
  }

  return {
    added: actuallyAdded,
    skipped_duplicates,
    columns,
    verified_appended_keys: verified,
    verification_expected: expectedKeys.length,
    parsed_row_count_after_readback: parsedRowCountAfter,
    parsed_row_delta_vs_before: deltaFromBefore,
    sha256_immediate_readback: sha256After,
    sha256_delayed_readback: sha256Delayed,
    parsed_row_count_delayed_readback: parsedRowCountDelayed,
    post_merge_file_changed_after_delay: postMergeFileChangedAfterDelay,
    mtime_ms_immediate_after_write: mtimeImmediateMs,
    mtime_ms_delayed_after_write: mtimeDelayedMs,
  };
}

/**
 * @param {string[]} columns
 * @param {string} provider
 * @param {string} slug
 * @param {string} companyName
 * @param {{ scrapeTier: string, scrapeEveryRuns: string }} opts
 */
function buildSourcesRow(columns, provider, slug, companyName, opts) {
  const p = String(provider || "")
    .trim()
    .toLowerCase();
  const s = String(slug || "").trim();
  /** @type {Record<string, string>} */
  const o = {};
  for (const c of columns) o[c] = "";
  o.ats = p;
  o.slug = s;
  o.company_name = companyName;
  o.status = "auto";
  o.last_checked_at = "";
  o.last_successful_fetch_at = "";
  o.jobs_last_run = "0";
  o.jobs_relevant_last_run = "0";
  o.jobs_inserted_last_run = "0";
  o.jobs_updated_last_run = "0";
  o.jobs_irrelevant_last_run = "0";
  o.jobs_partial_last_run = "0";
  o.jobs_old_last_run = "0";
  o.fetch_failed_last_run = "false";
  o.yield_last_run = "0";
  o.times_seen_empty = "0";
  o.times_failed = "0";
  o.scrape_tier = opts.scrapeTier || "low";
  o.scrape_every_runs = opts.scrapeEveryRuns || "2";
  o.bucket_last_run = "";
  o.last_error = "";
  if ("provider" in o) o.provider = p;
  if ("company" in o) o.company = companyName;
  return o;
}
