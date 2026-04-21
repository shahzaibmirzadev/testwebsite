#!/usr/bin/env node
/**
 * Summarize career_source_registry.csv after resolve:careers → resolver_summary_report.json
 * Read-only; does not modify the registry.
 */
import fs from "fs/promises";
import path from "path";
import { parse } from "csv-parse/sync";

import { PATHS } from "../config/pipelinePaths.mjs";

const REPO = process.cwd();
const INPUT = path.join(REPO, PATHS.careerSourceRegistry);
const OUTPUT = path.join(REPO, PATHS.resolverSummaryReport);

/** @param {Record<string, number>} counts */
function sortEntriesDesc(counts) {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([key, count]) => ({ key, count }));
}

/** @param {string} s */
function nonempty(s) {
  return String(s ?? "").trim().length > 0;
}

/**
 * @param {Record<string, string>} row
 * @returns {string}
 */
function atsProviderFromGuess(guess) {
  const g = String(guess ?? "").trim();
  const m = /^ats_(.+)$/i.exec(g);
  return m ? m[1].toLowerCase() : "(unknown)";
}

async function main() {
  let raw;
  try {
    raw = await fs.readFile(INPUT, "utf8");
  } catch (e) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          error: "missing_input",
          path: INPUT,
          message: String(e?.message || e),
        },
        null,
        2
      )
    );
    process.exit(1);
  }

  const rows = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    bom: true,
  });

  /** @type {Set<string>} */
  const domains = new Set();
  let withCareersFinal = 0;
  let withRedirectedTo = 0;
  let homepageMissingRows = 0;

  /** @type {Record<string, number>} */
  const byResolverStatus = {};
  /** @type {Record<string, number>} */
  const bySourceTypeGuess = {};
  /** @type {Record<string, number>} */
  const byHomepageValidation = {};

  let rejectedUrlDomainFallback = 0;
  let rejectedUrlNoUsableDomain = 0;
  let invalidOrBlockedDomain = 0;

  let atsRows = 0;
  /** @type {Record<string, number>} */
  const byAtsProvider = {};

  let customFound = 0;
  let jsRenderedSuspected = 0;
  let manualReview = 0;
  let careersNotFound = 0;

  /** @type {Record<string, number>} */
  const byCategory = {};
  /** @type {Record<string, Record<string, number>>} */
  const categoryByStatus = {};

  for (const row of rows) {
    const r = /** @type {Record<string, string>} */ (row);
    const domain = String(r.domain ?? "").trim().toLowerCase();
    if (domain) domains.add(domain);

    const resolverStatus = String(r.resolver_status ?? "").trim();
    const sourceGuess = String(r.source_type_guess ?? "").trim();
    const homepageInv = String(r.homepage_input_validation ?? "").trim();
    const category = String(r.category ?? "").trim() || "(empty)";

    if (nonempty(r.careers_url_final)) withCareersFinal++;
    if (nonempty(r.redirected_to)) withRedirectedTo++;
    if (resolverStatus === "homepage_missing") homepageMissingRows++;

    const rsKey = resolverStatus || "(empty)";
    byResolverStatus[rsKey] = (byResolverStatus[rsKey] || 0) + 1;

    const sgKey = sourceGuess || "(empty)";
    bySourceTypeGuess[sgKey] = (bySourceTypeGuess[sgKey] || 0) + 1;

    const hvKey = homepageInv || "(empty)";
    byHomepageValidation[hvKey] = (byHomepageValidation[hvKey] || 0) + 1;

    if (homepageInv === "rejected_url_domain_fallback") rejectedUrlDomainFallback++;
    if (homepageInv === "rejected_url_no_usable_domain") rejectedUrlNoUsableDomain++;
    if (homepageInv === "invalid_or_blocked_domain") invalidOrBlockedDomain++;

    if (sourceGuess.toLowerCase().startsWith("ats_")) {
      atsRows++;
      const prov = atsProviderFromGuess(sourceGuess);
      byAtsProvider[prov] = (byAtsProvider[prov] || 0) + 1;
    }

    if (sourceGuess === "custom_found") customFound++;
    if (resolverStatus === "js_rendered_suspected") jsRenderedSuspected++;
    if (resolverStatus === "manual_review") manualReview++;
    if (resolverStatus === "careers_not_found") careersNotFound++;

    byCategory[category] = (byCategory[category] || 0) + 1;
    if (!categoryByStatus[category]) categoryByStatus[category] = {};
    categoryByStatus[category][rsKey] =
      (categoryByStatus[category][rsKey] || 0) + 1;
  }

  const failureStatuses = sortEntriesDesc(byResolverStatus).filter(
    (x) => x.key !== "careers_found"
  );

  const missingOrBlockedHomepage =
    homepageMissingRows +
    invalidOrBlockedDomain +
    rejectedUrlNoUsableDomain;

  const likelyBrowserExtraction = jsRenderedSuspected;

  const report = {
    generated_at: new Date().toISOString(),
    input: INPUT,
    totals: {
      total_rows: rows.length,
      unique_domains: domains.size,
      rows_with_careers_url_final: withCareersFinal,
      rows_with_redirected_to: withRedirectedTo,
      rows_with_homepage_missing: homepageMissingRows,
    },
    resolver_status: byResolverStatus,
    source_type_guess: bySourceTypeGuess,
    homepage_validation: {
      by_homepage_input_validation: byHomepageValidation,
      rejected_url_domain_fallback: rejectedUrlDomainFallback,
      rejected_url_no_usable_domain: rejectedUrlNoUsableDomain,
      invalid_or_blocked_domain: invalidOrBlockedDomain,
    },
    ats_detection: {
      rows_source_type_guess_starts_with_ats_: atsRows,
      by_ats_provider: byAtsProvider,
    },
    custom_non_ats: {
      custom_found: customFound,
      js_rendered_suspected: jsRenderedSuspected,
      manual_review: manualReview,
      careers_not_found: careersNotFound,
    },
    category: {
      by_category: byCategory,
      category_by_resolver_status: categoryByStatus,
    },
    top_problem_groups: {
      most_common_failure_resolver_statuses: failureStatuses,
      rows_missing_or_blocked_homepage: {
        total_flagged: missingOrBlockedHomepage,
        resolver_status_homepage_missing: homepageMissingRows,
        homepage_input_validation_invalid_or_blocked_domain: invalidOrBlockedDomain,
        homepage_input_validation_rejected_url_no_usable_domain:
          rejectedUrlNoUsableDomain,
      },
      rows_likely_needing_browser_extraction: likelyBrowserExtraction,
    },
  };

  await fs.writeFile(OUTPUT, JSON.stringify(report, null, 2) + "\n", "utf8");

  console.log("\n=== Resolver output summary ===\n");
  console.log(`Rows: ${report.totals.total_rows} | Domains (unique): ${report.totals.unique_domains}`);
  console.log(
    `With careers_url_final: ${report.totals.rows_with_careers_url_final} | redirected_to: ${report.totals.rows_with_redirected_to} | homepage_missing status: ${report.totals.rows_with_homepage_missing}`
  );
  console.log(`ATS (source_type_guess starts with ats_): ${atsRows}`);
  console.log(
    `Custom / review: custom_found=${customFound} | js_rendered=${jsRenderedSuspected} | manual_review=${manualReview} | careers_not_found=${careersNotFound}`
  );
  console.log(
    `Problem slice: missing/blocked homepage (aggregate)=${missingOrBlockedHomepage} | browser_extraction suspected=${likelyBrowserExtraction}`
  );
  const topFail = failureStatuses.slice(0, 8);
  if (topFail.length) {
    console.log(
      "Top failure resolver_status:",
      topFail.map((x) => `${x.key}:${x.count}`).join(", ")
    );
  }
  console.log(`\nWrote: ${OUTPUT}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
