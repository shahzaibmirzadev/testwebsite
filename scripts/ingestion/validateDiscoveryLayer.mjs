#!/usr/bin/env node
/**
 * Discovery / suppression CSV validation (warnings-first).
 * Read-only — does not mutate CSVs.
 *
 * Writes data/ingestion/discovery_validation_report.latest.json
 * Exits 0 after a successful run (warnings do not fail the process).
 *
 * Env:
 *   DISCOVERY_VALIDATE_OUT — optional report path override
 *   DISCOVERY_VALIDATE_STRICT=true — fail (exit 1) on duplicate shadowing, invalid
 *     veto expires_at, or unknown veto reason_code (warnings-only issues otherwise stay warn-only).
 */
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

import { loadProductionAllowlist } from "./loadProductionAllowlist.mjs";
import { loadVetoRegistry, parseOptionalIso } from "./loadVetoRegistry.mjs";
import { loadDiscoveryCandidates } from "./loadDiscoveryCandidates.mjs";
import { REASON_CODE_SET } from "./reasonCodes.mjs";
import {
  registrableDomainsForVetoLikeRow,
  registrableDomainsForCandidateLikeRow,
} from "./discoveryRowDomains.mjs";
import {
  isApprovedProductionAtsRegistryRow,
  isApprovedProductionHtmlRegistryRow,
} from "./isApprovedProductionAtsRegistryRow.mjs";
import { DISCOVERY_SOURCE_HINT_ALLOWED } from "./discoveryConstants.mjs";
import { PATHS } from "../config/pipelinePaths.mjs";

/** When DISCOVERY_VALIDATE_STRICT=true, any matching warning fails the run. */
export const STRICT_DISCOVERY_VALIDATION_CODES = new Set([
  "veto_duplicate_company_key_shadow",
  "veto_duplicate_domain_shadow",
  "pending_duplicate_domain_shadow",
  "veto_invalid_expires_at",
  "veto_unknown_reason_code",
]);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..", "..");

const DEFAULT_REPORT_OUT = path.join(
  REPO_ROOT,
  PATHS.discoveryValidationReportLatest
);

/**
 * @typedef {{ severity: 'warning', code: string, detail: string } & Record<string, string>} ValidationWarning
 */

/**
 * Active veto rows only — mirrors shouldSkipDiscovery indexing order (CSV row order).
 * @param {Record<string, string>[]} activeRows
 * @returns {ValidationWarning[]}
 */
export function analyzeVetoKeyAndDomainShadowing(activeRows) {
  /** @type {ValidationWarning[]} */
  const warnings = [];
  /** @type {Map<string, string>} */
  const keyOwner = new Map();
  /** @type {Map<string, string>} */
  const domainOwner = new Map();

  for (const row of activeRows) {
    const vid = String(row.veto_id ?? "").trim() || "(missing veto_id)";
    const ck = String(row.company_key ?? "").trim();
    if (ck) {
      if (keyOwner.has(ck)) {
        const winner = keyOwner.get(ck);
        if (winner !== vid) {
          warnings.push({
            severity: "warning",
            code: "veto_duplicate_company_key_shadow",
            company_key: ck,
            winner_veto_id: winner,
            shadowed_veto_id: vid,
            detail:
              "Duplicate company_key among active veto rows; first row wins in shouldSkipDiscovery.",
          });
        }
      } else {
        keyOwner.set(ck, vid);
      }
    }

    for (const d of registrableDomainsForVetoLikeRow(row)) {
      if (domainOwner.has(d)) {
        const winner = domainOwner.get(d);
        if (winner !== vid) {
          warnings.push({
            severity: "warning",
            code: "veto_duplicate_domain_shadow",
            registrable_domain: d,
            winner_veto_id: winner,
            shadowed_veto_id: vid,
            detail:
              "Duplicate registrable domain among active veto rows; first row wins in shouldSkipDiscovery.",
          });
        }
      } else {
        domainOwner.set(d, vid);
      }
    }
  }
  return warnings;
}

/**
 * @param {Record<string, string>[]} pendingRows
 * @returns {ValidationWarning[]}
 */
export function analyzePendingDomainShadowing(pendingRows) {
  /** @type {ValidationWarning[]} */
  const warnings = [];
  /** @type {Map<string, string>} */
  const domainOwner = new Map();

  for (const row of pendingRows) {
    const cid =
      String(row.candidate_id ?? "").trim() || "(missing candidate_id)";
    for (const d of registrableDomainsForCandidateLikeRow(row)) {
      if (domainOwner.has(d)) {
        const winner = domainOwner.get(d);
        if (winner !== cid) {
          warnings.push({
            severity: "warning",
            code: "pending_duplicate_domain_shadow",
            registrable_domain: d,
            winner_candidate_id: winner,
            shadowed_candidate_id: cid,
            detail:
              "Duplicate registrable domain among pending candidates; first row wins in shouldSkipDiscovery.",
          });
        }
      } else {
        domainOwner.set(d, cid);
      }
    }
  }
  return warnings;
}

/**
 * Non-empty expires_at that does not parse — same ambiguous handling as runtime (treated like permanent).
 * @param {Record<string, string>[]} allVetoRows
 * @returns {ValidationWarning[]}
 */
export function analyzeInvalidVetoExpires(allVetoRows) {
  /** @type {ValidationWarning[]} */
  const warnings = [];
  for (const row of allVetoRows) {
    const raw = String(row.expires_at ?? "").trim();
    if (!raw) continue;
    const parsed = parseOptionalIso(row.expires_at);
    if (parsed === null) {
      warnings.push({
        severity: "warning",
        code: "veto_invalid_expires_at",
        veto_id: String(row.veto_id ?? "").trim(),
        expires_at_raw: raw,
        detail:
          "expires_at is non-empty but not a valid ISO date; runtime treats like no expiry (permanent suppression).",
      });
    }
  }
  return warnings;
}

/**
 * @param {Record<string, string>[]} vetoRows
 * @returns {ValidationWarning[]}
 */
export function analyzeUnknownVetoReasonCodes(vetoRows) {
  /** @type {ValidationWarning[]} */
  const warnings = [];
  for (const row of vetoRows) {
    const rc = String(row.reason_code ?? "").trim();
    if (!rc) continue;
    if (!REASON_CODE_SET.has(rc)) {
      warnings.push({
        severity: "warning",
        code: "veto_unknown_reason_code",
        veto_id: String(row.veto_id ?? "").trim(),
        reason_code: rc,
        detail:
          "reason_code is not in scripts/ingestion/reasonCodes.mjs REASON_CODES (possible typo).",
      });
    }
  }
  return warnings;
}

/**
 * @param {Record<string, string>[]} pendingRows
 * @returns {ValidationWarning[]}
 */
export function analyzeDuplicatePendingCandidateIds(pendingRows) {
  /** @type {ValidationWarning[]} */
  const warnings = [];
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const row of pendingRows) {
    const cid = String(row.candidate_id ?? "").trim();
    if (!cid) continue;
    counts.set(cid, (counts.get(cid) ?? 0) + 1);
  }
  for (const [cid, n] of counts) {
    if (n > 1) {
      warnings.push({
        severity: "warning",
        code: "pending_duplicate_candidate_id",
        candidate_id: cid,
        occurrence_count: String(n),
        detail: "Duplicate candidate_id among pending candidate rows.",
      });
    }
  }
  return warnings;
}

/**
 * Non-empty source_hint must be ats | html | unknown (case-insensitive). Empty = implicit unknown.
 * @param {Record<string, string>[]} allCandidateRows
 * @returns {ValidationWarning[]}
 */
export function analyzeCandidateSourceHintsUnknown(allCandidateRows) {
  /** @type {ValidationWarning[]} */
  const warnings = [];
  for (const row of allCandidateRows) {
    const raw = String(row.source_hint ?? "").trim();
    if (!raw) continue;
    const lower = raw.toLowerCase();
    if (!DISCOVERY_SOURCE_HINT_ALLOWED.has(lower)) {
      warnings.push({
        severity: "warning",
        code: "candidate_unknown_source_hint",
        candidate_id: String(row.candidate_id ?? "").trim(),
        source_hint: raw,
        detail:
          "source_hint must be empty (implicit unknown) or one of: ats, html, unknown.",
      });
    }
  }
  return warnings;
}

/**
 * @returns {Promise<{ report_version: number, generated_at: string, pass: boolean, strict_mode: boolean, strict_failure_count: number, paths: object, summary: object, warnings: ValidationWarning[] }>}
 */
export async function runDiscoveryValidation() {
  const allowlist = await loadProductionAllowlist();
  const vetoLoaded = await loadVetoRegistry();
  const candidatesLoaded = await loadDiscoveryCandidates();
  const strictMode = process.env.DISCOVERY_VALIDATE_STRICT === "true";

  /** @type {ValidationWarning[]} */
  const warnings = [
    ...analyzeVetoKeyAndDomainShadowing(vetoLoaded.activeRows),
    ...analyzePendingDomainShadowing(candidatesLoaded.pendingRows),
    ...analyzeInvalidVetoExpires(vetoLoaded.rows),
    ...analyzeUnknownVetoReasonCodes(vetoLoaded.rows),
    ...analyzeDuplicatePendingCandidateIds(candidatesLoaded.pendingRows),
    ...analyzeCandidateSourceHintsUnknown(candidatesLoaded.rows),
  ];

  const strictFailures = warnings.filter((w) =>
    STRICT_DISCOVERY_VALIDATION_CODES.has(w.code)
  );
  const pass = !strictMode || strictFailures.length === 0;

  const approvedAtsRows = allowlist.rows.filter(isApprovedProductionAtsRegistryRow)
    .length;
  const approvedHtmlRows = allowlist.rows.filter(isApprovedProductionHtmlRegistryRow)
    .length;

  const summary = {
    warnings_count: warnings.length,
    veto_rows_total: vetoLoaded.rows.length,
    veto_active_rows: vetoLoaded.activeRows.length,
    candidate_rows_total: candidatesLoaded.rows.length,
    candidate_pending_rows: candidatesLoaded.pendingRows.length,
    allowlist_company_keys: allowlist.companyKeys.size,
    allowlist_registrable_domains: allowlist.registrableDomains.size,
    allowlist_approved_registry_rows: allowlist.approved_registry_rows,
    allowlist_approved_ats_rows: approvedAtsRows,
    allowlist_approved_html_rows: approvedHtmlRows,
    /** Explains why this can be 0 while approved_sources_master still lists html_rows. */
    html_metrics_note:
      "allowlist_approved_html_rows counts only promoted html_custom rows in production_source_registry.csv (discovery allowlist). For master-build HTML volume see approved_sources_master_report totals.html_rows.",
    registry_rows_total_unfiltered: allowlist.registry_rows_total,
    strict_mode: strictMode,
    strict_failure_count: strictFailures.length,
  };

  const report = {
    report_version: 2,
    generated_at: new Date().toISOString(),
    pass,
    strict_mode: strictMode,
    strict_failure_count: strictFailures.length,
    paths: {
      production_registry_csv: path.relative(REPO_ROOT, allowlist.path),
      veto_registry_csv: path.relative(REPO_ROOT, vetoLoaded.path),
      candidates_csv: path.relative(REPO_ROOT, candidatesLoaded.path),
    },
    summary,
    warnings,
  };

  return report;
}

/**
 * @param {string} [outPath]
 * @returns {Promise<Awaited<ReturnType<typeof runDiscoveryValidation>>>}
 */
export async function runDiscoveryValidationAndWriteReport(
  outPath = DEFAULT_REPORT_OUT
) {
  const report = await runDiscoveryValidation();
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(report, null, 2), "utf8");
  return report;
}

async function main() {
  const outPath =
    process.env.DISCOVERY_VALIDATE_OUT || DEFAULT_REPORT_OUT;
  const report = await runDiscoveryValidationAndWriteReport(outPath);

  const ok = report.pass;

  console.log(
    JSON.stringify(
      {
        ok,
        report_written: path.relative(REPO_ROOT, outPath),
        summary: report.summary,
        warnings_count: report.warnings.length,
        pass: report.pass,
        strict_mode: report.strict_mode,
        strict_failure_count: report.strict_failure_count,
      },
      null,
      2
    )
  );

  if (report.warnings.length) {
    console.log(
      JSON.stringify(
        { warnings: report.warnings },
        null,
        2
      )
    );
  }

  if (!ok) {
    process.exit(1);
  }
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
