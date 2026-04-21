#!/usr/bin/env node
/**
 * Upserts pipeline routing rows and latest decision report to Supabase.
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (same as daily-sync / validate scripts).
 * Run SQL in supabase/migrations/20260411000000_ingestion_pipeline_tables.sql first.
 */
import fs from "fs/promises";
import path from "path";
import { parse } from "csv-parse/sync";
import { createClient } from "@supabase/supabase-js";

import { PATHS } from "../config/pipelinePaths.mjs";

const REPO = process.cwd();
const ROUTING = path.join(REPO, PATHS.sourceRoutingTable);
const REPORT = path.join(REPO, PATHS.fullPipelineDecisionReport);

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function main() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error(
      JSON.stringify({
        ok: false,
        error: "missing_env",
        message:
          "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (e.g. from .env.local).",
      })
    );
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  let routingRows = [];
  try {
    const raw = await fs.readFile(ROUTING, "utf8");
    routingRows = parse(raw, {
      columns: true,
      skip_empty_lines: true,
      relax_quotes: true,
      bom: true,
    });
  } catch (e) {
    console.error(
      JSON.stringify({
        ok: false,
        error: "missing_routing",
        message: String(e?.message || e),
      })
    );
    process.exit(1);
  }

  const syncedAt = new Date().toISOString();
  const batch = routingRows.map((row) => ({
    company_key: row.company_key || "",
    row_payload: row,
    synced_at: syncedAt,
  }));

  const chunkSize = 100;
  for (let i = 0; i < batch.length; i += chunkSize) {
    const slice = batch.slice(i, i + chunkSize);
    const { error } = await supabase.from("ingestion_company_routing").upsert(
      slice,
      { onConflict: "company_key" }
    );
    if (error) {
      console.error(JSON.stringify({ ok: false, error: error.message, detail: error }));
      process.exit(1);
    }
  }

  let reportJson = null;
  try {
    reportJson = JSON.parse(await fs.readFile(REPORT, "utf8"));
  } catch {
    reportJson = { error: "report_not_found", path: REPORT };
  }

  const { error: repErr } = await supabase.from("ingestion_pipeline_decisions").insert({
    generated_at: reportJson.generated_at || syncedAt,
    dataset_status: reportJson.metrics?.dataset_status || "unknown",
    report: reportJson,
  });

  if (repErr) {
    console.error(JSON.stringify({ ok: false, error: repErr.message, detail: repErr }));
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        upserted_routing_rows: batch.length,
        decision_row_inserted: true,
        synced_at: syncedAt,
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
