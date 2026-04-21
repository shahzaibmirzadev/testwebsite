#!/usr/bin/env node
/**
 * Loads discovery layer CSVs + production allowlist, runs validateDiscoveryLayer,
 * and executes synthetic shouldSkipDiscovery scenarios (in-memory).
 * Does not mutate CSVs.
 *
 * Exit 0 only if validation + all scenario checks pass.
 */
import { loadProductionAllowlist } from "./loadProductionAllowlist.mjs";
import { loadVetoRegistry } from "./loadVetoRegistry.mjs";
import { loadDiscoveryCandidates } from "./loadDiscoveryCandidates.mjs";
import { shouldSkipDiscovery } from "./shouldSkipDiscovery.mjs";
import {
  runDiscoveryValidationAndWriteReport,
  analyzeVetoKeyAndDomainShadowing,
  analyzePendingDomainShadowing,
  analyzeInvalidVetoExpires,
  analyzeUnknownVetoReasonCodes,
} from "./validateDiscoveryLayer.mjs";
import { PATHS } from "../config/pipelinePaths.mjs";

/** @returns {{ rows: Record<string, string>[], pendingRows: Record<string, string>[], path: string }} */
function emptyCandidates() {
  return { rows: [], pendingRows: [], path: "synthetic" };
}

/** @returns {Awaited<ReturnType<typeof loadProductionAllowlist>>} */
function syntheticAllowlist(partial) {
  return {
    companyKeys: new Set(),
    registrableDomains: new Set(),
    companyNamesLower: new Set(),
    rows: [],
    registry_rows_total: 0,
    approved_registry_rows: 0,
    path: "synthetic",
    ...partial,
  };
}

/** @returns {Awaited<ReturnType<typeof loadVetoRegistry>>} */
function syntheticVeto(partial) {
  return {
    rows: [],
    activeRows: [],
    path: "synthetic",
    ...partial,
  };
}

/**
 * Minimal veto-shaped row for indexing / validation tests (extra keys ignored).
 * @returns {Record<string, string>}
 */
function vetoRow(o) {
  return {
    veto_id: "",
    company_key: "",
    canonical_company_key: "",
    supersedes_candidate_id: "",
    company_name: "",
    domain_normalized: "",
    homepage_url: "",
    careers_url_candidate: "",
    status: "rejected",
    reason_category: "operational",
    reason_code: "MANUAL_REJECT",
    reason_detail: "",
    first_seen_at: "",
    last_seen_at: "",
    reviewed_at: "",
    reviewed_by: "",
    expires_at: "",
    retry_after: "",
    notes_internal: "",
    ...o,
  };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

/**
 * @returns {{ id: string, ok: boolean, detail?: unknown, error?: string }[]}
 */
function runScenarioTests() {
  /** @type {{ id: string, ok: boolean, detail?: unknown, error?: string }[]} */
  const results = [];

  const push = (id, fn) => {
    try {
      fn();
      results.push({ id, ok: true });
    } catch (e) {
      results.push({ id, ok: false, error: String(e?.message || e) });
    }
  };

  push("allowlist_key_hit", () => {
    const allow = syntheticAllowlist({
      companyKeys: new Set(["legacy__smoke__slug"]),
    });
    const r = shouldSkipDiscovery(
      { companyKey: "legacy__smoke__slug" },
      {
        allowlist: allow,
        vetoLoaded: syntheticVeto({}),
        candidatesLoaded: emptyCandidates(),
      }
    );
    assert(r.skip === true && r.decision === "skip_approved", "expected skip_approved");
  });

  push("allowlist_domain_hit", () => {
    const allow = syntheticAllowlist({
      registrableDomains: new Set(["smoke-allow.test"]),
    });
    const r = shouldSkipDiscovery(
      { domainInput: "smoke-allow.test" },
      {
        allowlist: allow,
        vetoLoaded: syntheticVeto({}),
        candidatesLoaded: emptyCandidates(),
      }
    );
    assert(r.skip === true && r.decision === "skip_approved", "expected skip_approved by domain");
  });

  push("html_allowlist_key_hit", () => {
    const allow = syntheticAllowlist({
      companyKeys: new Set(["cm-html-smoke"]),
    });
    const r = shouldSkipDiscovery(
      { companyKey: "cm-html-smoke" },
      {
        allowlist: allow,
        vetoLoaded: syntheticVeto({}),
        candidatesLoaded: emptyCandidates(),
      }
    );
    assert(r.skip === true && r.decision === "skip_approved", "expected skip_approved for HTML key");
  });

  push("active_veto_domain_hit", () => {
    const v = vetoRow({
      veto_id: "v-smoke-1",
      domain_normalized: "badactor-smoke.test",
      status: "rejected",
    });
    const r = shouldSkipDiscovery(
      { domainInput: "badactor-smoke.test" },
      {
        allowlist: syntheticAllowlist({}),
        vetoLoaded: syntheticVeto({ rows: [v], activeRows: [v] }),
        candidatesLoaded: emptyCandidates(),
      }
    );
    assert(r.skip === true && r.decision === "skip_veto", "expected skip_veto");
  });

  push("expired_veto_ignored", () => {
    const expired = vetoRow({
      veto_id: "v-expired",
      domain_normalized: "expired-smoke.test",
      status: "rejected",
      expires_at: "2000-01-01T00:00:00.000Z",
    });
    const vetoLoaded = syntheticVeto({
      rows: [expired],
      activeRows: [],
    });
    const r = shouldSkipDiscovery(
      { domainInput: "expired-smoke.test" },
      {
        allowlist: syntheticAllowlist({}),
        vetoLoaded,
        candidatesLoaded: emptyCandidates(),
      }
    );
    assert(r.skip === false && r.decision === "proceed", "expired veto must not block");
  });

  push("blocking_candidate_domain_hit", () => {
    const p = {
      candidate_id: "cand-smoke-1",
      company_name: "Pending Co",
      domain_normalized: "inbox-smoke.test",
      homepage_url: "",
      careers_url_candidate: "",
      source_hint: "",
      status: "new",
      created_at: "",
      updated_at: "",
      last_seen_at: "",
      notes_internal: "",
    };
    const r = shouldSkipDiscovery(
      { domainInput: "inbox-smoke.test" },
      {
        allowlist: syntheticAllowlist({}),
        vetoLoaded: syntheticVeto({}),
        candidatesLoaded: {
          rows: [p],
          pendingRows: [p],
          path: "synthetic",
        },
      }
    );
    assert(r.skip === true && r.decision === "skip_pending", "expected skip_pending");
  });

  push("validated_candidate_domain_hit", () => {
    const p = {
      candidate_id: "cand-smoke-validated",
      company_name: "Validated Co",
      domain_normalized: "validated-inbox-smoke.test",
      homepage_url: "",
      careers_url_candidate: "",
      source_hint: "html",
      status: "validated",
      created_at: "",
      updated_at: "",
      last_seen_at: "",
      notes_internal: "",
    };
    const r = shouldSkipDiscovery(
      { domainInput: "validated-inbox-smoke.test" },
      {
        allowlist: syntheticAllowlist({}),
        vetoLoaded: syntheticVeto({}),
        candidatesLoaded: {
          rows: [p],
          pendingRows: [p],
          path: "synthetic",
        },
      }
    );
    assert(r.skip === true && r.decision === "skip_pending", "expected skip_pending for validated");
  });

  push("blocking_by_candidate_id_key", () => {
    const p = {
      candidate_id: "cand-smoke-2",
      company_name: "Other",
      domain_normalized: "other.test",
      homepage_url: "",
      careers_url_candidate: "",
      source_hint: "",
      status: "new",
      created_at: "",
      updated_at: "",
      last_seen_at: "",
      notes_internal: "",
    };
    const r = shouldSkipDiscovery(
      { companyKey: "cand-smoke-2" },
      {
        allowlist: syntheticAllowlist({}),
        vetoLoaded: syntheticVeto({}),
        candidatesLoaded: {
          rows: [p],
          pendingRows: [p],
          path: "synthetic",
        },
      }
    );
    assert(r.skip === true && r.decision === "skip_pending", "expected skip_pending by id");
  });

  push("domain_only_probe_no_throw", () => {
    const allow = syntheticAllowlist({
      registrableDomains: new Set(["domain-only.test"]),
    });
    const r = shouldSkipDiscovery(
      { domainInput: "domain-only.test" },
      {
        allowlist: allow,
        vetoLoaded: syntheticVeto({}),
        candidatesLoaded: emptyCandidates(),
      }
    );
    assert(r.skip === true, "domain-only should hit allowlist");
  });

  push("malformed_urls_do_not_throw", () => {
    const r = shouldSkipDiscovery(
      {
        companyKey: "",
        homepageUrl: ":::not-a-valid-url:::",
        careersUrlCandidate: "also ??? bad",
        domainInput: "unrelated-smoke.test",
      },
      {
        allowlist: syntheticAllowlist({}),
        vetoLoaded: syntheticVeto({}),
        candidatesLoaded: emptyCandidates(),
      }
    );
    assert(typeof r.skip === "boolean" && r.decision === "proceed", "should proceed without throw");
  });

  push("name_collision_warning_only", () => {
    const allow = syntheticAllowlist({
      companyNamesLower: new Set(["collision name co"]),
      registrableDomains: new Set(["real-domain.test"]),
    });
    const r = shouldSkipDiscovery(
      {
        companyName: "Collision Name Co",
        domainInput: "different-smoke.test",
      },
      {
        allowlist: allow,
        vetoLoaded: syntheticVeto({}),
        candidatesLoaded: emptyCandidates(),
      }
    );
    assert(r.skip === false, "name collision does not skip alone");
    assert(
      r.warnings.some((w) => w.type === "name_collision"),
      "expected name_collision warning"
    );
  });

  push("blocking_name_collision_warning_only", () => {
    const p = {
      candidate_id: "cand-nm-1",
      company_name: "Pending Collision Co",
      domain_normalized: "pending-real.test",
      homepage_url: "",
      careers_url_candidate: "",
      source_hint: "",
      status: "new",
      created_at: "",
      updated_at: "",
      last_seen_at: "",
      notes_internal: "",
    };
    const r = shouldSkipDiscovery(
      {
        companyName: "Pending Collision Co",
        domainInput: "unrelated-pending.test",
      },
      {
        allowlist: syntheticAllowlist({}),
        vetoLoaded: syntheticVeto({}),
        candidatesLoaded: {
          rows: [p],
          pendingRows: [p],
          path: "synthetic",
        },
      }
    );
    assert(r.skip === false, "pending name collision does not skip alone");
    assert(
      r.warnings.length >= 1 &&
        r.warnings.some((w) => w.type === "name_collision"),
      "expected pending name_collision warning"
    );
  });

  push("duplicate_veto_domain_shadow_warning", () => {
    const a = vetoRow({
      veto_id: "dup-a",
      domain_normalized: "dup-shadow.test",
      status: "rejected",
    });
    const b = vetoRow({
      veto_id: "dup-b",
      domain_normalized: "dup-shadow.test",
      status: "rejected",
    });
    const w = analyzeVetoKeyAndDomainShadowing([a, b]);
    assert(w.some((x) => x.code === "veto_duplicate_domain_shadow"), "expected shadow warning");
  });

  push("duplicate_veto_company_key_shadow_warning", () => {
    const a = vetoRow({
      veto_id: "ck-a",
      company_key: "legacy__dup__key",
      domain_normalized: "ck-a.test",
      status: "rejected",
    });
    const b = vetoRow({
      veto_id: "ck-b",
      company_key: "legacy__dup__key",
      domain_normalized: "ck-b.test",
      status: "rejected",
    });
    const w = analyzeVetoKeyAndDomainShadowing([a, b]);
    assert(
      w.some((x) => x.code === "veto_duplicate_company_key_shadow"),
      "expected company_key shadow warning"
    );
  });

  push("duplicate_blocking_domain_shadow_warning", () => {
    const base = {
      company_name: "X",
      homepage_url: "",
      careers_url_candidate: "",
      source_hint: "",
      status: "new",
      created_at: "",
      updated_at: "",
      last_seen_at: "",
      notes_internal: "",
    };
    const p1 = { ...base, candidate_id: "pdup-1", domain_normalized: "pdup-shadow.test" };
    const p2 = { ...base, candidate_id: "pdup-2", domain_normalized: "pdup-shadow.test" };
    const w = analyzePendingDomainShadowing([p1, p2]);
    assert(
      w.some((x) => x.code === "pending_duplicate_domain_shadow"),
      "expected pending shadow warning"
    );
  });

  push("invalid_expires_at_warning", () => {
    const w = analyzeInvalidVetoExpires([
      vetoRow({ veto_id: "bad-exp", expires_at: "not-iso-date" }),
    ]);
    assert(w.some((x) => x.code === "veto_invalid_expires_at"), "expected invalid expires warning");
  });

  push("unknown_reason_code_warning", () => {
    const w = analyzeUnknownVetoReasonCodes([
      vetoRow({ veto_id: "bad-rc", reason_code: "TYPO_NOT_IN_ENUM" }),
    ]);
    assert(w.some((x) => x.code === "veto_unknown_reason_code"), "expected unknown reason warning");
  });

  return results;
}

const validationReport = await runDiscoveryValidationAndWriteReport();
const allowlist = await loadProductionAllowlist();
const vetoLoaded = await loadVetoRegistry();
const candidatesLoaded = await loadDiscoveryCandidates();

const firstKey = allowlist.companyKeys.values().next().value;
const liveProbe = shouldSkipDiscovery(
  {
    companyKey: firstKey || "legacy__noop__noop",
    companyName: "Smoke Test Nonexistent Company XYZ",
    domainInput: "example.invalid",
  },
  { allowlist, vetoLoaded, candidatesLoaded }
);

if (typeof liveProbe.skip !== "boolean" || !liveProbe.decision) {
  console.error(
    JSON.stringify({ ok: false, error: "unexpected_result_shape", liveProbe })
  );
  process.exit(1);
}

const scenarioResults = runScenarioTests();
const failed = scenarioResults.filter((s) => !s.ok);

const out = {
  ok: failed.length === 0,
  validation_report_path: PATHS.discoveryValidationReportLatest,
  validation_summary: validationReport.summary,
  validation_warnings_count: validationReport.warnings.length,
  live_data: {
    allowlist_company_keys: allowlist.companyKeys.size,
    allowlist_approved_registry_rows: allowlist.approved_registry_rows,
    registry_rows_total_unfiltered: allowlist.registry_rows_total,
    veto_rows: vetoLoaded.rows.length,
    candidate_rows: candidatesLoaded.rows.length,
    live_probe: liveProbe,
  },
  scenario_tests: scenarioResults,
};

console.log(JSON.stringify(out, null, 2));

if (failed.length) {
  console.error(
    JSON.stringify(
      { ok: false, failed_scenarios: failed },
      null,
      2
    )
  );
  process.exit(1);
}
