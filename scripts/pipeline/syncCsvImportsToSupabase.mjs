#!/usr/bin/env node
/**
 * Seeds Supabase tables from data/supabase_import/*.csv.
 * This is the fallback path when the larger canonical JSON artifacts are not checked in locally.
 *
 * Prerequisite: public.company_list and public.pipeline_extracted_jobs must already exist.
 * Create them via supabase/migrations or supabase/sql/01_create_pipeline_tables_safe.sql first.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (e.g. from .env / .env.local)
 */
import fs from "fs/promises";
import path from "path";
import { parse } from "csv-parse/sync";
import { createClient } from "@supabase/supabase-js";

import { PATHS } from "../config/pipelinePaths.mjs";

const REPO = process.cwd();
const COMPANY_CSV = path.join(REPO, PATHS.supabaseImportCompanyListCsv);
const JOBS_CSV = path.join(REPO, PATHS.supabaseImportPipelineJobsCsv);

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function nz(value) {
  const text = String(value ?? "").trim();
  return text.length ? text : null;
}

function parseTs(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parseJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value !== "string") return value;
  const text = value.trim();
  if (!text) return fallback;
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
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

async function main() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  const [companyRows, jobRows] = await Promise.all([
    readCsvRows(COMPANY_CSV),
    readCsvRows(JOBS_CSV),
  ]);

  const syncedAt = new Date().toISOString();
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const companies = companyRows
    .map((row) => ({
      company_key: nz(row.company_key) ?? "",
      company_name: nz(row.company_name),
      domain: nz(row.domain),
      homepage_url: nz(row.homepage_url),
      linkedin_url: nz(row.linkedin_url),
      category: nz(row.category),
      confidence_flag: nz(row.confidence_flag),
      homepage_input_validation: nz(row.homepage_input_validation),
      homepage_validation_note: nz(row.homepage_validation_note),
      careers_url_candidate: nz(row.careers_url_candidate),
      careers_url_final: nz(row.careers_url_final),
      redirected_to: nz(row.redirected_to),
      resolver_status: nz(row.resolver_status),
      source_type_guess: nz(row.source_type_guess),
      notes: nz(row.notes),
      last_checked_at: parseTs(row.last_checked_at),
      final_source_type: nz(row.final_source_type),
      extractor_type: nz(row.extractor_type),
      extractor_priority: nz(row.extractor_priority),
      ready_for_extraction: nz(row.ready_for_extraction),
      routing_notes: nz(row.routing_notes),
      synced_at: syncedAt,
    }))
    .filter((row) => row.company_key);

  for (let i = 0; i < companies.length; i += 100) {
    const slice = companies.slice(i, i + 100);
    const { error } = await supabase.from("company_list").upsert(slice, {
      onConflict: "company_key",
    });
    if (error) {
      throw new Error(`company_list upsert failed: ${error.message}`);
    }
  }

  const { error: deleteErr } = await supabase
    .from("pipeline_extracted_jobs")
    .delete()
    .neq("company_key", "__sync_placeholder__");
  if (deleteErr) {
    throw new Error(`pipeline_extracted_jobs delete failed: ${deleteErr.message}`);
  }

  const jobs = jobRows
    .map((row) => ({
      company_key: nz(row.company_key),
      company: nz(row.company),
      source: nz(row.source),
      source_job_id: nz(row.source_job_id),
      title: nz(row.title),
      location: nz(row.location),
      apply_url: nz(row.apply_url),
      posted_at: parseTs(row.posted_at),
      description_raw: nz(row.description_raw),
      description_html: nz(row.description_html),
      employment_type: nz(row.employment_type),
      remote_status: nz(row.remote_status),
      tags: Array.isArray(parseJson(row.tags, [])) ? parseJson(row.tags, []) : [],
      routing_final_source_type: nz(row.routing_final_source_type),
      careers_url_final: nz(row.careers_url_final),
      clean_meta: parseJson(row.clean_meta, null),
      synced_at: parseTs(row.synced_at) ?? syncedAt,
    }))
    .filter((row) => row.company_key && row.source && row.source_job_id);

  for (let i = 0; i < jobs.length; i += 100) {
    const slice = jobs.slice(i, i + 100);
    const { error } = await supabase.from("pipeline_extracted_jobs").insert(slice);
    if (error) {
      throw new Error(`pipeline_extracted_jobs insert failed: ${error.message}`);
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        mode: "csv-import-fallback",
        company_list_upserted: companies.length,
        pipeline_extracted_jobs_inserted: jobs.length,
        synced_at: syncedAt,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
