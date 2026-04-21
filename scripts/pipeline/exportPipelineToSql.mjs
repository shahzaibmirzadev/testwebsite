#!/usr/bin/env node
/**
 * Writes small SQL chunks under data/supabase_seed_parts/ (Supabase SQL Editor paste limit).
 * Run supabase/sql/01_create_pipeline_tables_safe.sql first, then these files in numeric order.
 * See supabase/sql/00_README.txt.
 *
 * Optional: node scripts/pipeline/exportPipelineToSql.mjs --single
 * → also writes data/supabase_pipeline_seed.sql (large; use with psql, not the web editor).
 */
import fs from "fs/promises";
import path from "path";
import { parse } from "csv-parse/sync";

import { PATHS } from "../config/pipelinePaths.mjs";

const REPO = process.cwd();
const REGISTRY = path.join(REPO, PATHS.careerSourceRegistry);
const ROUTING = path.join(REPO, PATHS.sourceRoutingTable);
const CLEAN_JOBS = path.join(REPO, PATHS.extractedJobsClean);
const PARTS_DIR = path.join(REPO, PATHS.supabaseSeedPartsDir);
const SINGLE_OUT = path.join(REPO, PATHS.supabasePipelineSeedSql);
const IMPORT_COMPANY_CSV = path.join(REPO, PATHS.supabaseImportCompanyListCsv);
const IMPORT_JOBS_CSV = path.join(REPO, PATHS.supabaseImportPipelineJobsCsv);

/** Target max bytes per file (UTF-8); stay under typical SQL editor limits. */
const MAX_CHUNK_BYTES = 48 * 1024;

/**
 * @param {string} tag
 * @param {string} s
 */
function dollar(tag, s) {
  let t = tag;
  const body = String(s ?? "");
  while (body.includes(`$${t}$`)) t += "x";
  return `$${t}$${body}$${t}$`;
}

/** @param {unknown} obj */
function sqlJsonb(obj) {
  if (obj == null || obj === undefined) return "NULL";
  const j = JSON.stringify(obj);
  return dollar("jb", j) + "::jsonb";
}

/**
 * @param {string[]} lines
 * @param {number} maxBytes
 * @returns {string[][]}
 */
function chunkByByteSize(lines, maxBytes) {
  /** @type {string[][]} */
  const chunks = [];
  /** @type {string[]} */
  let buf = [];
  let size = 0;
  for (const line of lines) {
    const lineBytes = Buffer.byteLength(line + "\n", "utf8");
    if (size + lineBytes > maxBytes && buf.length > 0) {
      chunks.push(buf);
      buf = [];
      size = 0;
    }
    buf.push(line);
    size += lineBytes;
  }
  if (buf.length) chunks.push(buf);
  return chunks;
}

async function readCsvRows(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return parse(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    bom: true,
  });
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function nullishSql(value, formatter) {
  const text = String(value ?? "").trim();
  if (!text) return "NULL";
  return formatter(text);
}

async function main() {
  const wantSingle = process.argv.includes("--single");

  const canBuildFromCanonical =
    (await pathExists(REGISTRY)) &&
    (await pathExists(ROUTING)) &&
    (await pathExists(CLEAN_JOBS));

  /** @type {Record<string, string>[]} */
  let registryRows = [];
  /** @type {Record<string, string>[]} */
  let routingRows = [];
  /** @type {Record<string, unknown>[]} */
  let cleanJobs = [];
  let sourceMode = "canonical";

  if (canBuildFromCanonical) {
    registryRows = await readCsvRows(REGISTRY);
    routingRows = await readCsvRows(ROUTING);
    const cleanPayload = JSON.parse(await fs.readFile(CLEAN_JOBS, "utf8"));
    cleanJobs = Array.isArray(cleanPayload.clean_jobs) ? cleanPayload.clean_jobs : [];
  } else {
    sourceMode = "csv-import-fallback";
    if (!(await pathExists(IMPORT_COMPANY_CSV)) || !(await pathExists(IMPORT_JOBS_CSV))) {
      throw new Error(
        "Missing canonical pipeline inputs and fallback CSV imports. Need either data/career_source_registry.csv + data/source_routing_table.csv + data/extracted_jobs_clean.json, or data/supabase_import/company_list.csv + data/supabase_import/pipeline_extracted_jobs.csv."
      );
    }
    registryRows = await readCsvRows(IMPORT_COMPANY_CSV);
    routingRows = [];
    cleanJobs = await readCsvRows(IMPORT_JOBS_CSV);
  }

  /** @type {Map<string, Record<string, string>>} */
  const routingByKey = new Map();
  for (const row of routingRows) {
    const k = String(row.company_key ?? "").trim();
    if (k) routingByKey.set(k, /** @type {Record<string, string>} */ (row));
  }

  /** @param {string | null | undefined} s */
  const ts = (s) => {
    const t = String(s ?? "").trim();
    if (!t) return "NULL";
    const d = new Date(t);
    if (Number.isNaN(d.getTime())) return "NULL";
    return dollar("ts", d.toISOString()) + "::timestamptz";
  };

  /** @type {string[]} */
  const companyInserts = [];
  for (const row of registryRows) {
    const reg = /** @type {Record<string, string>} */ (row);
    const key = String(reg.company_key ?? "").trim();
    if (!key) continue;
    const r = routingByKey.get(key) || {};

    const cols = [
      dollar("v", key),
      dollar("v", reg.company_name ?? ""),
      dollar("v", reg.domain ?? ""),
      dollar("v", reg.homepage_url ?? ""),
      dollar("v", reg.linkedin_url ?? ""),
      dollar("v", reg.category ?? ""),
      dollar("v", reg.confidence_flag ?? ""),
      dollar("v", reg.homepage_input_validation ?? ""),
      dollar("v", reg.homepage_validation_note ?? ""),
      dollar("v", reg.careers_url_candidate ?? ""),
      dollar("v", reg.careers_url_final ?? ""),
      dollar("v", reg.redirected_to ?? ""),
      dollar("v", reg.resolver_status ?? ""),
      dollar("v", reg.source_type_guess ?? ""),
      dollar("n", reg.notes ?? ""),
      ts(reg.last_checked_at),
      dollar("v", r.final_source_type ?? ""),
      dollar("v", r.extractor_type ?? ""),
      dollar("v", r.extractor_priority ?? ""),
      dollar("v", r.ready_for_extraction ?? ""),
      dollar("v", r.routing_notes ?? ""),
      "now()",
    ];
    companyInserts.push(
      `INSERT INTO public.company_list (company_key, company_name, domain, homepage_url, linkedin_url, category, confidence_flag, homepage_input_validation, homepage_validation_note, careers_url_candidate, careers_url_final, redirected_to, resolver_status, source_type_guess, notes, last_checked_at, final_source_type, extractor_type, extractor_priority, ready_for_extraction, routing_notes, synced_at) VALUES (${cols.join(", ")});`
    );
  }

  /** @type {string[]} */
  const jobInserts = [];
  for (const j of cleanJobs) {
    if (!j || typeof j !== "object") continue;
    const source = String(j.source ?? "").trim();
    const sourceJobId = String(j.source_job_id ?? "").trim();
    const companyKey = String(j.company_key ?? "").trim();
    if (!source || !sourceJobId || !companyKey) continue;

    const posted = String(j.posted_at ?? "").trim();
    const postedSql = posted ? ts(posted) : "NULL";
    const meta = j._clean_meta != null ? j._clean_meta : null;

    const vals = [
      dollar("v", companyKey),
      dollar("v", j.company ?? ""),
      dollar("v", source),
      dollar("v", sourceJobId),
      dollar("v", j.title ?? ""),
      dollar("v", j.location ?? ""),
      dollar("v", j.apply_url ?? ""),
      postedSql,
      dollar("dr", j.description_raw ?? ""),
      dollar("dh", j.description_html ?? ""),
      nullishSql(j.employment_type, (value) => dollar("v", value)),
      nullishSql(j.remote_status, (value) => dollar("v", value)),
      (() => {
        if (Array.isArray(j.tags)) return sqlJsonb(j.tags);
        if (typeof j.tags === "string" && j.tags.trim()) {
          try {
            return sqlJsonb(JSON.parse(j.tags));
          } catch {
            return sqlJsonb([]);
          }
        }
        return sqlJsonb([]);
      })(),
      dollar("v", j.routing_final_source_type ?? ""),
      dollar("v", j.careers_url_final ?? ""),
      (() => {
        if (typeof meta === "string" && meta.trim()) {
          try {
            return sqlJsonb(JSON.parse(meta));
          } catch {
            return "NULL";
          }
        }
        return sqlJsonb(meta);
      })(),
      nullishSql(j.synced_at, (value) => {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return "now()";
        return dollar("ts", date.toISOString()) + "::timestamptz";
      }),
    ];

    jobInserts.push(
      `INSERT INTO public.pipeline_extracted_jobs (company_key, company, source, source_job_id, title, location, apply_url, posted_at, description_raw, description_html, employment_type, remote_status, tags, routing_final_source_type, careers_url_final, clean_meta, synced_at) VALUES (${vals.join(", ")});`
    );
  }

  const companyChunks = chunkByByteSize(companyInserts, MAX_CHUNK_BYTES);
  const jobChunks = chunkByByteSize(jobInserts, MAX_CHUNK_BYTES);

  await fs.mkdir(PARTS_DIR, { recursive: true });

  /** @type {string[]} */
  const written = [];
  let n = 1;
  const pad = (i) => String(i).padStart(3, "0");

  for (let i = 0; i < companyChunks.length; i++) {
    const chunk = companyChunks[i];
    const header =
      i === 0
        ? [
            "-- company_list (part " +
              (i + 1) +
              "/" +
              companyChunks.length +
              ") — first file clears both tables",
            "BEGIN;",
            "DELETE FROM public.pipeline_extracted_jobs;",
            "DELETE FROM public.company_list;",
            "",
          ]
        : [
            "-- company_list (part " +
              (i + 1) +
              "/" +
              companyChunks.length +
              ")",
            "BEGIN;",
            "",
          ];
    const footer = ["", "COMMIT;", ""];
    const name = `${pad(n++)}_company_list.sql`;
    const body = [...header, ...chunk, ...footer].join("\n");
    await fs.writeFile(path.join(PARTS_DIR, name), body, "utf8");
    written.push(name);
  }

  for (let i = 0; i < jobChunks.length; i++) {
    const chunk = jobChunks[i];
    const header = [
      "-- pipeline_extracted_jobs (part " +
        (i + 1) +
        "/" +
        jobChunks.length +
        ")",
      "BEGIN;",
      "",
    ];
    const footer = ["", "COMMIT;", ""];
    const name = `${pad(n++)}_pipeline_extracted_jobs.sql`;
    const body = [...header, ...chunk, ...footer].join("\n");
    await fs.writeFile(path.join(PARTS_DIR, name), body, "utf8");
    written.push(name);
  }

  const readme = [
    "Supabase SQL Editor — run these files in order (numeric prefix).",
    "Prerequisite: run supabase/sql/01_create_pipeline_tables_safe.sql once (see supabase/sql/00_README.txt).",
    "",
    "Each file is wrapped in BEGIN/COMMIT. Run one file per query, then the next.",
    "",
    "Files:",
    ...written.map((f) => `  - ${f}`),
    "",
    `Or use: npm run pipeline:sync-companies (needs SUPABASE_SERVICE_ROLE_KEY in .env.local).`,
    `Easier company import: npm run pipeline:export-csv → import company_list.csv in Table Editor.`,
    "",
  ].join("\n");

  await fs.writeFile(path.join(PARTS_DIR, "00_README.txt"), readme, "utf8");

  let totalKb = 0;
  for (const f of written) {
    const st = await fs.stat(path.join(PARTS_DIR, f));
    totalKb += st.size / 1024;
  }
  console.log(
    `Wrote ${written.length} parts under ${PARTS_DIR} (~${Math.round(totalKb)} KB total)`
  );
  console.log(readme);

  if (wantSingle) {
    const single = [
      "-- Generated by exportPipelineToSql.mjs --single",
      "BEGIN;",
      "DELETE FROM public.pipeline_extracted_jobs;",
      "DELETE FROM public.company_list;",
      "",
      ...companyInserts,
      ...jobInserts,
      "COMMIT;",
      "",
    ].join("\n");
    await fs.writeFile(SINGLE_OUT, single, "utf8");
    const st = await fs.stat(SINGLE_OUT);
    console.log(`\nAlso wrote ${SINGLE_OUT} (${Math.round(st.size / 1024)} KB) for psql/CLI use.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
