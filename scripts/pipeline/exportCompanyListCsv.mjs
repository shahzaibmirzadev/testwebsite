#!/usr/bin/env node
/**
 * Writes data/supabase_import/company_list.csv for Supabase Table Editor → Import data from CSV.
 * Column order matches public.company_list (except synced_at — DB default applies on insert).
 */
import fs from "fs/promises";
import path from "path";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";

import { PATHS } from "../config/pipelinePaths.mjs";

const REPO = process.cwd();
const REGISTRY = path.join(REPO, PATHS.careerSourceRegistry);
const ROUTING = path.join(REPO, PATHS.sourceRoutingTable);
const OUT_DIR = path.join(REPO, PATHS.supabaseImportDir);
const OUT = path.join(REPO, PATHS.supabaseImportCompanyListCsv);

const COLUMNS = [
  "company_key",
  "company_name",
  "domain",
  "homepage_url",
  "linkedin_url",
  "category",
  "confidence_flag",
  "homepage_input_validation",
  "homepage_validation_note",
  "careers_url_candidate",
  "careers_url_final",
  "redirected_to",
  "resolver_status",
  "source_type_guess",
  "notes",
  "last_checked_at",
  "final_source_type",
  "extractor_type",
  "extractor_priority",
  "ready_for_extraction",
  "routing_notes",
];

async function main() {
  const registryRaw = await fs.readFile(REGISTRY, "utf8");
  const routingRaw = await fs.readFile(ROUTING, "utf8");

  const registryRows = parse(registryRaw, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    bom: true,
  });
  const routingRows = parse(routingRaw, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    bom: true,
  });

  /** @type {Map<string, Record<string, string>>} */
  const routingByKey = new Map();
  for (const row of routingRows) {
    const k = String(row.company_key ?? "").trim();
    if (k) routingByKey.set(k, /** @type {Record<string, string>} */ (row));
  }

  /** @type {Record<string, string>[]} */
  const outRows = [];
  for (const row of registryRows) {
    const reg = /** @type {Record<string, string>} */ (row);
    const key = String(reg.company_key ?? "").trim();
    if (!key) continue;
    const r = routingByKey.get(key) || {};
    outRows.push({
      company_key: key,
      company_name: reg.company_name ?? "",
      domain: reg.domain ?? "",
      homepage_url: reg.homepage_url ?? "",
      linkedin_url: reg.linkedin_url ?? "",
      category: reg.category ?? "",
      confidence_flag: reg.confidence_flag ?? "",
      homepage_input_validation: reg.homepage_input_validation ?? "",
      homepage_validation_note: reg.homepage_validation_note ?? "",
      careers_url_candidate: reg.careers_url_candidate ?? "",
      careers_url_final: reg.careers_url_final ?? "",
      redirected_to: reg.redirected_to ?? "",
      resolver_status: reg.resolver_status ?? "",
      source_type_guess: reg.source_type_guess ?? "",
      notes: reg.notes ?? "",
      last_checked_at: reg.last_checked_at ?? "",
      final_source_type: r.final_source_type ?? "",
      extractor_type: r.extractor_type ?? "",
      extractor_priority: r.extractor_priority ?? "",
      ready_for_extraction: r.ready_for_extraction ?? "",
      routing_notes: r.routing_notes ?? "",
    });
  }

  await fs.mkdir(OUT_DIR, { recursive: true });
  const csv = stringify(outRows, {
    header: true,
    columns: COLUMNS,
    quoted_string: true,
    quoted_empty: false,
  });
  await fs.writeFile(OUT, "\uFEFF" + csv, "utf8");
  const st = await fs.stat(OUT);
  console.log(`Wrote ${OUT} (${outRows.length} rows, ${Math.round(st.size / 1024)} KB)`);
  console.log(
    'Import into table **company_list** (underscore), not "Company List" (space). Table Editor → company_list → Import CSV.'
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
