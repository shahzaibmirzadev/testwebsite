#!/usr/bin/env node
/**
 * Export rows needing human review from career_source_registry.csv → manual_review_queue.csv
 * Read-only; does not modify the registry.
 */
import fs from "fs/promises";
import path from "path";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";

import { PATHS } from "../config/pipelinePaths.mjs";

const REPO = process.cwd();
const INPUT = path.join(REPO, PATHS.careerSourceRegistry);
const OUTPUT = path.join(REPO, PATHS.manualReviewQueue);

/** Rows included in the manual review queue */
const QUEUE_STATUSES = new Set([
  "manual_review",
  "homepage_missing",
  "careers_not_found",
  "homepage_fetch_failed",
  "careers_fetch_failed",
  "js_rendered_suspected",
]);

const OUTPUT_COLUMNS = [
  "company_name",
  "company_key",
  "homepage_url",
  "domain",
  "linkedin_url",
  "category",
  "confidence_flag",
  "careers_url_candidate",
  "careers_url_final",
  "redirected_to",
  "resolver_status",
  "source_type_guess",
  "homepage_input_validation",
  "homepage_validation_note",
  "notes",
  "last_checked_at",
  "review_priority",
  "review_reason",
];

/**
 * @param {Record<string, string>} row
 * @returns {{ review_priority: string, review_reason: string }}
 */
function reviewPriorityAndReason(row) {
  const status = (row.resolver_status || "").trim();
  const inv = (row.homepage_input_validation || "").trim();

  switch (status) {
    case "homepage_missing":
      return {
        review_priority: "high",
        review_reason:
          "No usable homepage URL after validation; cannot probe careers without manual URL/domain.",
      };
    case "manual_review":
      return {
        review_priority: "high",
        review_reason:
          "Resolver could not classify automatically; needs human decision on careers source.",
      };
    case "js_rendered_suspected":
      return {
        review_priority: "medium",
        review_reason:
          "Careers content may be JavaScript-rendered; static HTML extraction may miss listings.",
      };
    case "careers_not_found":
      return {
        review_priority: "medium",
        review_reason:
          "No careers URL discovered with default probes; may need alternate path or manual link.",
      };
    case "homepage_fetch_failed": {
      const highInput =
        inv === "rejected_url_no_usable_domain" ||
        inv === "invalid_or_blocked_domain";
      return {
        review_priority: highInput ? "high" : "medium",
        review_reason: highInput
          ? "Homepage fetch failed and domain column could not supply a usable company site."
          : "Homepage request failed (network, TLS, or block); retry later or set URL manually.",
      };
    }
    case "careers_fetch_failed":
      return {
        review_priority: "medium",
        review_reason:
          "Careers URL was found but the page could not be fetched; check URL or availability.",
      };
    default:
      return {
        review_priority: "medium",
        review_reason: `Resolver status "${status}" requires review.`,
      };
  }
}

/**
 * @param {Record<string, string>} row
 */
function normalizeRow(row) {
  const o = {};
  for (const c of OUTPUT_COLUMNS) {
    if (c === "review_priority" || c === "review_reason") continue;
    o[c] = row[c] != null ? String(row[c]) : "";
  }
  const pr = reviewPriorityAndReason(row);
  o.review_priority = pr.review_priority;
  o.review_reason = pr.review_reason;
  return o;
}

async function main() {
  let raw;
  try {
    raw = await fs.readFile(INPUT, "utf8");
  } catch (e) {
    console.error(
      JSON.stringify({
        ok: false,
        error: "missing_input",
        path: INPUT,
        message: String(e?.message || e),
      })
    );
    process.exit(1);
  }

  const rows = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    bom: true,
  });

  const queue = [];
  for (const row of rows) {
    const status = (row.resolver_status || "").trim();
    if (!QUEUE_STATUSES.has(status)) continue;
    queue.push(normalizeRow(/** @type {Record<string, string>} */ (row)));
  }

  const csv = stringify(queue, {
    header: true,
    columns: OUTPUT_COLUMNS,
    quoted_string: true,
  });
  await fs.writeFile(OUTPUT, "\uFEFF" + csv, "utf8");

  /** @type {Record<string, number>} */
  const byStatus = {};
  /** @type {Record<string, number>} */
  const byPriority = {};

  for (const r of queue) {
    const st = (r.resolver_status || "").trim() || "(empty)";
    byStatus[st] = (byStatus[st] || 0) + 1;
    const pr = (r.review_priority || "").trim() || "(empty)";
    byPriority[pr] = (byPriority[pr] || 0) + 1;
  }

  console.log("\n=== Manual review queue export ===\n");
  console.log(`Total rows in queue: ${queue.length}`);
  console.log("By resolver_status:", byStatus);
  console.log("By review_priority:", byPriority);
  console.log(`\nWrote: ${OUTPUT}\n`);

  console.log(
    JSON.stringify(
      {
        ok: true,
        total_in_queue: queue.length,
        by_resolver_status: byStatus,
        by_review_priority: byPriority,
        output: OUTPUT,
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
