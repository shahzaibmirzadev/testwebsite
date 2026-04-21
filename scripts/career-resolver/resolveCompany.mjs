import {
  PROBE_PATHS,
  RESOLVER_PROBE_TIMEOUT_MS,
  RESOLVER_HOMEPAGE_TIMEOUT_MS,
  RESOLVER_CAREERS_TIMEOUT_MS,
} from "./constants.mjs";
import { classifyAtsHostname } from "./classifyAts.mjs";
import { fetchHtml } from "./fetchHttp.mjs";
import { extractCareerLinkCandidates, suspectJsRendered } from "./scanHomepage.mjs";
import { hostnamesLooselyRelated } from "./urlUtils.mjs";

/**
 * Transport-style probe failure: no HTTP status from the server (connection/DNS/TLS/timeout).
 * Breaker-eligible; 4xx/5xx with a real status are not.
 * @param {{ status: number }} res
 */
function isTransportProbeFailure(res) {
  return res.status === 0;
}

/**
 * @param {object} input
 * @param {string} input.company_name
 * @param {string} input.homepage_url
 * @param {string} input.domain
 * @param {string} input.linkedin_url
 * @param {string} input.category
 * @param {string} input.confidence_flag
 * @param {string} input.company_key
 */
export async function resolveCompanyRow(input) {
  const home = (input.homepage_url || "").trim();
  const base = {
    company_name: input.company_name,
    company_key: input.company_key,
    homepage_url: home,
    domain: input.domain,
    linkedin_url: input.linkedin_url,
    category: input.category,
    confidence_flag: input.confidence_flag,
    careers_url_candidate: "",
    careers_url_final: "",
    redirected_to: "",
    resolver_status: "manual_review",
    source_type_guess: "manual_review",
    notes: "",
    last_checked_at: new Date().toISOString(),
  };

  /** @type {object[]} */
  const probeLog = [];

  if (!home) {
    base.resolver_status = "homepage_fetch_failed";
    base.source_type_guess = "fetch_failed";
    base.notes = buildNotes(probeLog, false, "", "fetch_failed", {
      homepageUsed: "",
      error: "missing_homepage_url",
    });
    return base;
  }

  let homeUrl;
  let homeHost;
  try {
    homeUrl = new URL(home);
    homeHost = homeUrl.hostname.toLowerCase();
  } catch {
    base.resolver_status = "homepage_fetch_failed";
    base.source_type_guess = "fetch_failed";
    base.notes = buildNotes(probeLog, false, "", "fetch_failed", {
      homepageUsed: home,
      error: "invalid_homepage_url",
    });
    return base;
  }

  const originBase = `${homeUrl.origin}/`;

  /**
   * Probe circuit breaker: only for repeated transport failures (status === 0).
   * After 3 consecutive such failures, stop issuing further probe GETs and go straight
   * to the homepage fetch (one chance on `/` with the homepage timeout tier).
   * HTTP responses (including 404/403) reset the streak — they are not breaker-eligible.
   */
  let consecutiveTransportFailures = 0;
  let probeCircuitBreaker = false;

  for (const path of PROBE_PATHS) {
    let candidateUrl;
    try {
      candidateUrl = new URL(path, originBase).href;
    } catch {
      probeLog.push({ path, error: "bad_join" });
      continue;
    }

    const res = await fetchHtml(candidateUrl, {
      timeoutMs: RESOLVER_PROBE_TIMEOUT_MS,
    });
    const finalUrl = res.finalUrl;
    let finalHost = "";
    try {
      finalHost = new URL(finalUrl).hostname.toLowerCase();
    } catch {
      finalHost = "";
    }

    const ats = classifyAtsHostname(finalHost);
    const entry = {
      path,
      candidateUrl,
      status: res.status,
      finalUrl,
      ok: res.ok,
      error: res.error || null,
      ats: ats?.sourceType || null,
      relatedToHome: finalHost
        ? hostnamesLooselyRelated(homeHost, finalHost)
        : false,
    };
    probeLog.push(entry);

    if (ats) {
      base.careers_url_candidate = candidateUrl;
      base.careers_url_final = finalUrl;
      base.redirected_to = finalUrl;
      base.resolver_status = "redirected_to_ats";
      base.source_type_guess = ats.sourceType;
      base.notes = buildNotes(probeLog, false, finalUrl, base.source_type_guess, {
        homepageUsed: originBase,
      });
      return base;
    }

    if (res.ok && res.html && res.html.length > 80) {
      if (entry.relatedToHome || finalHost === homeHost) {
        base.careers_url_candidate = candidateUrl;
        base.careers_url_final = finalUrl;
        base.redirected_to = finalUrl !== candidateUrl ? finalUrl : "";
        base.resolver_status = "careers_found";
        base.source_type_guess = "custom_found";
        base.notes = buildNotes(probeLog, false, finalUrl, base.source_type_guess, {
          homepageUsed: originBase,
        });
        return base;
      }
      base.careers_url_candidate = candidateUrl;
      base.careers_url_final = finalUrl;
      base.redirected_to = finalUrl;
      base.resolver_status = "redirected_external";
      base.source_type_guess = "custom_found";
      base.notes = buildNotes(probeLog, false, finalUrl, base.source_type_guess, {
        homepageUsed: originBase,
      });
      return base;
    }

    if (isTransportProbeFailure(res)) {
      consecutiveTransportFailures += 1;
      if (consecutiveTransportFailures >= 3) {
        probeCircuitBreaker = true;
        break;
      }
    } else {
      consecutiveTransportFailures = 0;
    }
  }

  const homeRes = await fetchHtml(originBase, {
    timeoutMs: RESOLVER_HOMEPAGE_TIMEOUT_MS,
  });
  if (!homeRes.ok && !homeRes.html) {
    base.resolver_status = "homepage_fetch_failed";
    base.source_type_guess = "fetch_failed";
    base.notes = buildNotes(probeLog, false, homeRes.finalUrl, base.source_type_guess, {
      homepageUsed: originBase,
      homepageError: homeRes.error || `status_${homeRes.status}`,
      probeCircuitBreaker,
    });
    return base;
  }

  const jsSuspect = suspectJsRendered(homeRes.html);
  const candidates = extractCareerLinkCandidates(homeRes.html, homeRes.finalUrl);

  if (jsSuspect && candidates.length === 0) {
    base.resolver_status = "js_rendered_suspected";
    base.source_type_guess = "js_rendered_suspected";
    base.notes = buildNotes(probeLog, true, homeRes.finalUrl, base.source_type_guess, {
      homepageUsed: originBase,
      reason: "thin_html_no_career_links",
      probeCircuitBreaker,
    });
    return base;
  }

  if (candidates.length === 0) {
    base.resolver_status = jsSuspect ? "js_rendered_suspected" : "careers_not_found";
    base.source_type_guess = jsSuspect ? "js_rendered_suspected" : "careers_not_found";
    base.notes = buildNotes(probeLog, true, homeRes.finalUrl, base.source_type_guess, {
      homepageUsed: originBase,
      homepageScanHits: 0,
      probeCircuitBreaker,
    });
    return base;
  }

  const top = candidates[0];
  const linkRes = await fetchHtml(top.href, {
    timeoutMs: RESOLVER_CAREERS_TIMEOUT_MS,
  });
  let linkHost = "";
  try {
    linkHost = new URL(linkRes.finalUrl).hostname.toLowerCase();
  } catch {
    linkHost = "";
  }

  const atsLink = classifyAtsHostname(linkHost);
  probeLog.push({
    path: "(homepage_scan)",
    candidateUrl: top.href,
    status: linkRes.status,
    finalUrl: linkRes.finalUrl,
    ok: linkRes.ok,
    error: linkRes.error || null,
    text: top.text,
    ats: atsLink?.sourceType || null,
  });

  if (linkRes.error || (!linkRes.ok && !linkRes.html)) {
    base.careers_url_candidate = top.href;
    base.resolver_status = "careers_fetch_failed";
    base.source_type_guess = "fetch_failed";
    base.notes = buildNotes(probeLog, true, homeRes.finalUrl, base.source_type_guess, {
      homepageUsed: originBase,
      probeCircuitBreaker,
    });
    return base;
  }

  if (atsLink) {
    base.careers_url_candidate = top.href;
    base.careers_url_final = linkRes.finalUrl;
    base.redirected_to = linkRes.finalUrl;
    base.resolver_status = "redirected_to_ats";
    base.source_type_guess = atsLink.sourceType;
    base.notes = buildNotes(probeLog, true, linkRes.finalUrl, base.source_type_guess, {
      homepageUsed: originBase,
      probeCircuitBreaker,
    });
    return base;
  }

  if (linkRes.ok && linkRes.html) {
    const related = hostnamesLooselyRelated(homeHost, linkHost);
    base.careers_url_candidate = top.href;
    base.careers_url_final = linkRes.finalUrl;
    if (linkRes.finalUrl !== top.href) {
      base.redirected_to = linkRes.finalUrl;
    }
    if (!related && linkHost !== homeHost) {
      base.resolver_status = "redirected_external";
    } else {
      base.resolver_status = "careers_found";
    }
    base.source_type_guess = "custom_found";
    base.notes = buildNotes(probeLog, true, linkRes.finalUrl, base.source_type_guess, {
      homepageUsed: originBase,
      probeCircuitBreaker,
    });
    return base;
  }

  base.resolver_status = "manual_review";
  base.source_type_guess = "manual_review";
  base.notes = buildNotes(probeLog, true, homeRes.finalUrl, base.source_type_guess, {
    homepageUsed: originBase,
    probeCircuitBreaker,
  });
  return base;
}

function buildNotes(probeLog, homepageScan, finalUrl, classification, extra = {}) {
  const { homepageUsed: hu, pathsTried: pt, ...rest } = extra;
  return JSON.stringify({
    homepageUsed: hu ?? "",
    pathsTried: Array.isArray(pt) ? pt : [...PROBE_PATHS],
    probeLog,
    homepageScan,
    homepageScanHit: homepageScan,
    finalUrl,
    classification,
    ...rest,
  });
}
