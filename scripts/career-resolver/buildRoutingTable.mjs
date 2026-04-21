#!/usr/bin/env node
/**
 * Reads data/career_source_registry.csv → data/source_routing_table.csv
 * (classification + extractor routing only; no scraping).
 */
import fs from "fs/promises";
import path from "path";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";

import { OUTPUT_COLUMNS as REGISTRY_COLUMNS } from "./registry.mjs";
import { routeRegistryRow } from "./routingUtils.mjs";
import { PATHS } from "../config/pipelinePaths.mjs";

const REPO_ROOT = process.cwd();
const INPUT = path.join(REPO_ROOT, PATHS.careerSourceRegistry);
const OUTPUT = path.join(REPO_ROOT, PATHS.sourceRoutingTable);

const ROUTING_COLUMNS = [
  ...REGISTRY_COLUMNS,
  "final_source_type",
  "extractor_type",
  "extractor_priority",
  "ready_for_extraction",
  "routing_notes",
];

async function main() {
  try {
    await fs.access(INPUT);
  } catch {
    console.error(
      JSON.stringify({
        ok: false,
        error: "missing_input",
        message: `Expected ${INPUT}. Run npm run resolve:careers first.`,
      })
    );
    process.exit(1);
  }

  const raw = await fs.readFile(INPUT, "utf8");
  const rows = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    bom: true,
  });

  /** @type {Record<string, string>[]} */
  const out = [];
  let atsCount = 0;
  let htmlCount = 0;
  let jsCount = 0;
  let noneCount = 0;
  let blockedCount = 0;

  for (const row of rows) {
    const normalized = {};
    for (const c of REGISTRY_COLUMNS) {
      normalized[c] = row[c] != null ? String(row[c]) : "";
    }

    const routed = routeRegistryRow(normalized);
    const merged = { ...normalized, ...routed };
    for (const c of ROUTING_COLUMNS) {
      if (merged[c] == null) merged[c] = "";
    }
    out.push(merged);

    if (routed.extractor_type === "ats_api") atsCount += 1;
    else if (routed.extractor_type === "html_scraper") htmlCount += 1;
    else if (routed.extractor_type === "browser_required") jsCount += 1;
    else if (routed.extractor_type === "none") noneCount += 1;

    if (routed.ready_for_extraction !== "true") blockedCount += 1;
  }

  const csv = stringify(out, {
    header: true,
    columns: ROUTING_COLUMNS,
    quoted_string: true,
  });
  await fs.writeFile(OUTPUT, "\uFEFF" + csv, "utf8");

  const summary = {
    ok: true,
    input: INPUT,
    output: OUTPUT,
    total_companies: rows.length,
    ats_api_rows: atsCount,
    html_scraper_rows: htmlCount,
    browser_required_rows: jsCount,
    extractor_none_rows: noneCount,
    ready_for_extraction_true: out.filter((r) => r.ready_for_extraction === "true")
      .length,
    blocked_or_not_ready: blockedCount,
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
