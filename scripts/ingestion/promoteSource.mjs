#!/usr/bin/env node
/**
 * Promote an ATS or HTML source into data/ingestion/production_source_registry.csv.
 * Requires explicit confirmation; checks veto layer; does not run validation.
 *
 * Usage:
 *   node scripts/ingestion/promoteSource.mjs --kind ats_api --yes \
 *     --ats-provider greenhouse --ats-board-slug acme --company-name "Acme Inc"
 *
 *   node scripts/ingestion/promoteSource.mjs --kind html_custom --yes \
 *     --company-key cm-0001 --company-name "Acme" --careers-url "https://..."
 *
 * Optional: --candidate-id <id> — sets discovery_candidates status to "promoted" (audit only).
 */
import fs from "fs/promises";
import path from "path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { fileURLToPath } from "url";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";

import { REGISTRY_COLUMNS } from "./migrateSourcesToProductionRegistry.mjs";
import { companyKeyFromLegacyAts } from "./companyKey.mjs";
import { shouldSkipDiscovery } from "./shouldSkipDiscovery.mjs";
import { loadVetoRegistry } from "./loadVetoRegistry.mjs";
import {
  DEFAULT_OPERATIONAL,
  OPERATIONAL_COLUMNS,
} from "./sourceOperationalState.mjs";
import {
  isValidHttpOrHttpsUrl,
} from "./isApprovedProductionAtsRegistryRow.mjs";
import {
  DISCOVERY_CANDIDATE_COLUMNS,
} from "./discoveryConstants.mjs";
import { PATHS } from "../config/pipelinePaths.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..", "..");

const DEFAULT_REGISTRY = path.join(REPO_ROOT, PATHS.productionSourceRegistry);
const DEFAULT_OPERATIONAL_CSV = path.join(
  REPO_ROOT,
  PATHS.sourceOperationalState
);
const DEFAULT_DISCOVERY = path.join(REPO_ROOT, PATHS.discoveryCandidates);

/**
 * @param {string[]} argv
 */
function parseArgs(argv) {
  /** @type {Record<string, string | boolean | undefined>} */
  const o = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--kind") o.kind = String(argv[++i] || "");
    else if (a === "--yes") o.yes = true;
    else if (a === "--ats-provider") o.atsProvider = String(argv[++i] || "");
    else if (a === "--ats-board-slug") o.atsBoardSlug = String(argv[++i] || "");
    else if (a === "--company-name") o.companyName = String(argv[++i] || "");
    else if (a === "--company-key") o.companyKey = String(argv[++i] || "");
    else if (a === "--careers-url") o.careersUrl = String(argv[++i] || "");
    else if (a === "--candidate-id") o.candidateId = String(argv[++i] || "");
    else if (a === "--registry") o.registryPath = String(argv[++i] || "");
    else if (a === "--operational") o.operationalPath = String(argv[++i] || "");
    else if (a === "--discovery") o.discoveryPath = String(argv[++i] || "");
  }
  return o;
}

/**
 * @param {string} p
 * @returns {Promise<Record<string, string>[]>}
 */
async function parseCsv(p) {
  const raw = await fs.readFile(p, "utf8");
  return parse(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    bom: true,
  });
}

/**
 * @param {string} provider
 * @param {string} slug
 */
function syntheticCareersUrlForVeto(provider, slug) {
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
 * @param {string} kind
 * @param {ReturnType<typeof parseArgs>} args
 */
function validatePayload(kind, args) {
  const errors = [];
  if (kind === "ats_api") {
    const ap = String(args.atsProvider || "").trim();
    const slug = String(args.atsBoardSlug || "").trim();
    const name = String(args.companyName || "").trim();
    if (!ap) errors.push("missing_ats_provider");
    if (!slug) errors.push("missing_ats_board_slug");
    if (!name) errors.push("missing_company_name");
  } else if (kind === "html_custom") {
    const ck = String(args.companyKey || "").trim();
    const name = String(args.companyName || "").trim();
    const url = String(args.careersUrl || "").trim();
    if (!ck) errors.push("missing_company_key");
    if (!name) errors.push("missing_company_name");
    if (!url) errors.push("missing_careers_url");
    else if (!isValidHttpOrHttpsUrl(url)) errors.push("invalid_careers_url");
  } else {
    errors.push("invalid_kind");
  }
  return errors;
}

/**
 * @param {{
 *   kind: string,
 *   companyKey: string,
 *   atsProvider?: string,
 *   atsBoardSlug?: string,
 *   companyName: string,
 *   careersUrl?: string,
 * }} payload
 * @param {string} promotedAt
 */
function buildRegistryRow(payload, promotedAt) {
  const base = {};
  for (const c of REGISTRY_COLUMNS) {
    base[c] = "";
  }
  base.company_key = payload.companyKey;
  base.company_name = payload.companyName;
  base.ingestion_status = "promoted";
  base.promotion_source = "promote_source_cli";
  base.promoted_at = promotedAt;
  base.source_kind = payload.kind;
  base.manual_override_lock = "false";

  if (payload.kind === "ats_api") {
    base.ats_provider = String(payload.atsProvider || "").trim().toLowerCase();
    base.ats_board_slug = String(payload.atsBoardSlug || "").trim();
    base.careers_url_canonical = "";
  } else {
    base.ats_provider = "";
    base.ats_board_slug = "";
    base.careers_url_canonical = String(payload.careersUrl || "").trim();
  }

  return base;
}

/**
 * @param {Record<string, string>} prev
 * @param {Record<string, string>} next
 */
function mergePreserveManual(prev, next) {
  const out = { ...next };
  const preserve = [
    "domain",
    "extractor_profile",
    "notes_internal",
    "manual_override_lock",
  ];
  for (const k of preserve) {
    const was = String(prev[k] ?? "").trim();
    if (was) out[k] = prev[k];
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  const kind = String(args.kind || "")
    .trim()
    .toLowerCase();
  const errs = validatePayload(kind, args);
  if (errs.length) {
    console.error(
      JSON.stringify({ ok: false, error: "validation_failed", details: errs })
    );
    process.exit(1);
  }

  if (!args.yes) {
    const rl = readline.createInterface({ input, output });
    const line = await rl.question("Type YES to promote: ");
    rl.close();
    if (line.trim() !== "YES") {
      console.error(
        JSON.stringify({ ok: false, error: "aborted_not_confirmed" })
      );
      process.exit(1);
    }
  }

  const registryPath = args.registryPath || DEFAULT_REGISTRY;
  const operationalPath = args.operationalPath || DEFAULT_OPERATIONAL_CSV;
  const discoveryPath = args.discoveryPath || DEFAULT_DISCOVERY;

  /** @type {string} */
  let companyKey;
  /** @type {string} */
  let careersForVeto = "";

  if (kind === "ats_api") {
    const ap = String(args.atsProvider || "").trim().toLowerCase();
    const slug = String(args.atsBoardSlug || "").trim();
    companyKey =
      String(args.companyKey || "").trim() ||
      companyKeyFromLegacyAts(ap, slug);
    careersForVeto = syntheticCareersUrlForVeto(ap, slug);
  } else {
    companyKey = String(args.companyKey || "").trim();
    careersForVeto = String(args.careersUrl || "").trim();
  }

  const vetoLoaded = await loadVetoRegistry();
  const emptyAllow = {
    companyKeys: new Set(),
    registrableDomains: new Set(),
    companyNamesLower: new Set(),
    rows: [],
    registry_rows_total: 0,
    approved_registry_rows: 0,
    path: "",
  };
  const emptyCand = { rows: [], pendingRows: [], path: "" };

  const vetoProbe = shouldSkipDiscovery(
    { companyKey, careersUrlCandidate: careersForVeto },
    { allowlist: emptyAllow, vetoLoaded, candidatesLoaded: emptyCand }
  );
  if (vetoProbe.skip && vetoProbe.decision === "skip_veto") {
    console.error(
      JSON.stringify({
        ok: false,
        error: "veto_active",
        veto: vetoProbe.vetoMatch,
      })
    );
    process.exit(1);
  }

  const promotedAt = new Date().toISOString();

  /** @type {Record<string, string>} */
  const payload =
    kind === "ats_api"
      ? {
          kind: "ats_api",
          companyKey,
          atsProvider: String(args.atsProvider || "").trim().toLowerCase(),
          atsBoardSlug: String(args.atsBoardSlug || "").trim(),
          companyName: String(args.companyName || "").trim(),
        }
      : {
          kind: "html_custom",
          companyKey,
          companyName: String(args.companyName || "").trim(),
          careersUrl: String(args.careersUrl || "").trim(),
        };

  const newRow = buildRegistryRow(payload, promotedAt);

  let existing = [];
  try {
    existing = await parseCsv(registryPath);
  } catch (e) {
    if (e && /** @type {any} */ (e).code !== "ENOENT") throw e;
  }

  const byKey = new Map();
  for (const r of existing) {
    const k = String(r.company_key ?? "").trim();
    if (k) byKey.set(k, r);
  }

  const prev = byKey.get(companyKey);
  const merged = prev
    ? mergePreserveManual(prev, { ...newRow, notes_internal: prev.notes_internal || newRow.notes_internal })
    : newRow;

  byKey.set(companyKey, merged);
  const outRows = [...byKey.values()].sort((a, b) =>
    String(a.company_key).localeCompare(String(b.company_key))
  );

  await fs.mkdir(path.dirname(registryPath), { recursive: true });
  const regCsv = stringify(outRows, {
    header: true,
    columns: [...REGISTRY_COLUMNS],
    quoted_string: true,
  });
  await fs.writeFile(registryPath, "\uFEFF" + regCsv, "utf8");

  let opRows = [];
  try {
    opRows = await parseCsv(operationalPath);
  } catch {
    opRows = [];
  }
  const opKeys = new Set(
    opRows.map((r) => String(r.company_key ?? "").trim()).filter(Boolean)
  );
  if (!opKeys.has(companyKey)) {
    const opNew = {
      ...DEFAULT_OPERATIONAL,
      company_key: companyKey,
    };
    opRows.push(opNew);
    opRows.sort((a, b) =>
      String(a.company_key).localeCompare(String(b.company_key))
    );
    const opCsv = stringify(opRows, {
      header: true,
      columns: [...OPERATIONAL_COLUMNS],
      quoted_string: true,
    });
    await fs.mkdir(path.dirname(operationalPath), { recursive: true });
    await fs.writeFile(operationalPath, "\uFEFF" + opCsv, "utf8");
  }

  const candidateId = String(args.candidateId || "").trim();
  if (candidateId) {
    try {
      const disc = await parseCsv(discoveryPath);
      let hit = false;
      const updated = disc.map((r) => {
        if (String(r.candidate_id ?? "").trim() !== candidateId) return r;
        hit = true;
        return { ...r, status: "promoted", updated_at: promotedAt };
      });
      if (hit) {
        const dCsv = stringify(
          updated.map((r) => {
            const o = {};
            for (const c of DISCOVERY_CANDIDATE_COLUMNS) {
              o[c] = r[c] != null ? String(r[c]) : "";
            }
            return o;
          }),
          {
            header: true,
            columns: [...DISCOVERY_CANDIDATE_COLUMNS],
            quoted_string: true,
          }
        );
        await fs.writeFile(discoveryPath, "\uFEFF" + dCsv, "utf8");
      }
    } catch {
      // optional file
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        registry: path.relative(REPO_ROOT, registryPath),
        company_key: companyKey,
        source_kind: kind,
        promoted_at: promotedAt,
        operational_seeded: !opKeys.has(companyKey),
        candidate_id_updated: Boolean(candidateId),
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
