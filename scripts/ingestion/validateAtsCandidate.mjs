#!/usr/bin/env node
/**
 * Report-only ATS validation: provider + slug, API list fetch, jobs or empty array.
 * Does not write registry or promote.
 *
 * Usage:
 *   node scripts/ingestion/validateAtsCandidate.mjs --provider greenhouse --slug acme --company-name "Acme"
 * Optional: --careers-url <url> (otherwise a synthetic board URL is used)
 */
import { getAtsHandler, hasImplementedHandler } from "../job-extraction/atsHandlers/index.mjs";
import { companyKeyFromLegacyAts } from "./companyKey.mjs";

/**
 * @param {string} provider
 * @param {string} slug
 */
function syntheticCareersUrl(provider, slug) {
  const p = String(provider || "")
    .trim()
    .toLowerCase();
  const s = String(slug || "").trim();
  if (!p || !s) return "";
  switch (p) {
    case "greenhouse":
      return `https://boards.greenhouse.io/${encodeURIComponent(s)}`;
    case "lever":
      return `https://jobs.lever.co/${encodeURIComponent(s)}`;
    case "workable":
      return `https://apply.workable.com/${encodeURIComponent(s)}`;
    case "ashby":
      return `https://jobs.ashbyhq.com/${encodeURIComponent(s)}`;
    case "smartrecruiters":
      return `https://careers.smartrecruiters.com/${encodeURIComponent(s)}`;
    case "teamtailor":
      return `https://${encodeURIComponent(s)}.teamtailor.com`;
    case "bamboohr":
      return `https://${encodeURIComponent(s)}.bamboohr.com`;
    case "rippling":
      return `https://ats.rippling.com/${encodeURIComponent(s)}/jobs`;
    default:
      return "";
  }
}

/**
 * @param {string[]} argv
 */
function parseArgs(argv) {
  /** @type {Record<string, string | undefined>} */
  const o = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--provider") o.provider = String(argv[++i] || "");
    else if (a === "--slug") o.slug = String(argv[++i] || "");
    else if (a === "--company-name") o.companyName = String(argv[++i] || "");
    else if (a === "--careers-url") o.careersUrl = String(argv[++i] || "");
  }
  return o;
}

async function main() {
  const args = parseArgs(process.argv);
  const provider = String(args.provider || "").trim().toLowerCase();
  const slug = String(args.slug || "").trim();
  const companyName = String(args.companyName || "").trim();
  let careersUrl = String(args.careersUrl || "").trim();

  /** @type {string[]} */
  const missing = [];
  if (!provider) missing.push("provider");
  if (!slug) missing.push("slug");
  if (!companyName) missing.push("company_name");
  if (missing.length) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          error: "missing_arguments",
          missing,
        },
        null,
        2
      )
    );
    process.exit(1);
  }

  if (!careersUrl) {
    careersUrl = syntheticCareersUrl(provider, slug);
  }
  if (!careersUrl) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          error: "no_careers_url",
          message:
            "Provide --careers-url or use a supported --provider for synthetic URL.",
        },
        null,
        2
      )
    );
    process.exit(1);
  }

  const finalSourceType = `ats_${provider}`;
  if (!hasImplementedHandler(finalSourceType)) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          error: "no_handler",
          final_source_type: finalSourceType,
          message: "No ATS handler implemented for this provider.",
        },
        null,
        2
      )
    );
    process.exit(1);
  }

  const company_key = companyKeyFromLegacyAts(provider, slug);
  /** @type {Record<string, string>} */
  const row = {
    company_name: companyName,
    company_key,
    careers_url_final: careersUrl,
    final_source_type: finalSourceType,
  };

  const handler = getAtsHandler(finalSourceType);
  if (!handler) {
    console.log(
      JSON.stringify({ ok: false, error: "handler_null" }, null, 2)
    );
    process.exit(1);
  }

  try {
    const jobs = await handler(row);
    const list = Array.isArray(jobs) ? jobs : [];
    console.log(
      JSON.stringify(
        {
          ok: true,
          provider,
          slug,
          company_name: companyName,
          company_key,
          final_source_type: finalSourceType,
          careers_url_used: careersUrl,
          job_count: list.length,
          empty_board: list.length === 0,
        },
        null,
        2
      )
    );
  } catch (e) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          error: "fetch_failed",
          message: String(e?.message || e),
          provider,
          slug,
          company_key,
          careers_url_used: careersUrl,
        },
        null,
        2
      )
    );
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
