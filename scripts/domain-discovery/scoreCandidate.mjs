/**
 * Conservative scoring for Serp organic results → domain discovery decisions.
 */
import {
  isHardBlockedFinalDomain,
  isBlockedCareerHost,
  isBlockedDirectoryOrSocialHost,
} from "./domainUtils.mjs";

/** @param {string} s */
function tokenizeName(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 || /^[a-z0-9]$/i.test(t));
}

/** @param {string} t */
function escapeRegExp(t) {
  return t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Short tokens (under 4 chars): whole-word only. Longer: substring in hay allowed.
 * @param {string} t
 * @param {string} hay lowercased haystack
 */
function tokenMatchesInText(t, hay) {
  const h = String(hay || "").toLowerCase();
  if (!t || !h || t.length < 2) return false;
  if (t.length < 4) {
    try {
      return new RegExp(`\\b${escapeRegExp(t)}\\b`, "i").test(h);
    } catch {
      return false;
    }
  }
  return h.includes(t);
}

/**
 * @param {string[]} nameTokens
 * @param {string} text
 */
function tokenOverlapScore(nameTokens, text) {
  const hay = String(text || "").toLowerCase();
  if (!hay || nameTokens.length === 0) return 0;
  let hits = 0;
  for (const t of nameTokens) {
    if (t.length < 2) continue;
    if (tokenMatchesInText(t, hay)) hits += 1;
  }
  return Math.min(25, Math.round((hits / nameTokens.length) * 25));
}

/**
 * @param {string[]} nameTokens
 * @param {string} apex
 */
function domainTokenOverlap(nameTokens, apex) {
  const label = String(apex || "")
    .split(".")[0]
    .toLowerCase();
  if (!label) return 0;
  let best = 0;
  for (const t of nameTokens) {
    if (t.length < 2) continue;
    if (t.length < 4) {
      if (label === t) best = 20;
      continue;
    }
    if (label === t || label.startsWith(t) || t.startsWith(label)) best = 20;
    else if (label.includes(t) || t.includes(label)) best = Math.max(best, 12);
  }
  return best;
}

/**
 * @param {object} p
 * @param {string} p.companyName
 * @param {string} p.title
 * @param {string} p.snippet
 * @param {string} p.link
 * @param {number} p.serpPosition 1-based
 * @param {string} p.queryLabel primary | disambiguation | fallback_careers
 * @param {string} p.hostname
 * @param {string} p.apex
 * @param {number} [p.apexRepeatCount] same apex in this result set
 * @returns {{ score: number, matched_signals: string[], reject_reasons: string[], hard_negative: boolean }}
 */
export function scoreOrganicResult(p) {
  const {
    companyName,
    title,
    snippet,
    serpPosition,
    queryLabel,
    hostname,
    apex,
    apexRepeatCount = 1,
  } = p;

  const matched_signals = [];
  const reject_reasons = [];

  const nameTokens = tokenizeName(companyName);
  const text = `${title || ""} ${snippet || ""}`;
  const hard_negative = isHardBlockedFinalDomain(hostname, apex);

  if (hard_negative) {
    if (isBlockedCareerHost(hostname) || isBlockedCareerHost(apex)) {
      reject_reasons.push("ats_or_recruiting_host");
    }
    if (isBlockedDirectoryOrSocialHost(hostname) || isBlockedDirectoryOrSocialHost(apex)) {
      reject_reasons.push("directory_social_or_junk_host");
    }
  }

  let score = 0;

  if (queryLabel === "primary") {
    score += 5;
    matched_signals.push("quoted_primary_query_pattern");
  }
  if (queryLabel === "disambiguation") {
    score += 3;
    matched_signals.push("disambiguation_query");
  }
  if (queryLabel === "fallback_careers") {
    matched_signals.push("fallback_careers_query");
  }

  const pos = Number(serpPosition) || 99;
  if (pos <= 1) {
    score += 15;
    matched_signals.push("organic_position_1");
  } else if (pos === 2) {
    score += 12;
    matched_signals.push("organic_position_2");
  } else if (pos === 3) {
    score += 8;
    matched_signals.push("organic_position_3");
  } else if (pos <= 5) {
    score += 5;
    matched_signals.push("organic_position_top5");
  } else if (pos <= 8) {
    score += 2;
    matched_signals.push("organic_position_top8");
  }

  const titleSnip = tokenOverlapScore(nameTokens, `${title} ${snippet}`);
  if (titleSnip >= 15) {
    score += titleSnip;
    matched_signals.push("strong_name_overlap_title_snippet");
  } else if (titleSnip > 0) {
    score += Math.round(titleSnip * 0.6);
    matched_signals.push("partial_name_overlap_title_snippet");
  } else {
    reject_reasons.push("weak_name_overlap");
  }

  const domOverlap = domainTokenOverlap(nameTokens, apex);
  if (domOverlap >= 15) {
    score += domOverlap;
    matched_signals.push("domain_token_overlap");
  } else if (domOverlap > 0) {
    score += Math.round(domOverlap * 0.5);
    matched_signals.push("weak_domain_token_overlap");
  } else {
    reject_reasons.push("domain_token_mismatch");
  }

  const low = `${title} ${snippet}`.toLowerCase();
  if (/\bofficial\b/i.test(low) || /\bhomepage\b/i.test(low) || /\bhome page\b/i.test(low)) {
    score += 8;
    matched_signals.push("official_or_homepage_wording");
  }

  if (apexRepeatCount >= 2) {
    score += 10;
    matched_signals.push("repeated_apex_across_results");
  }

  try {
    const u = new URL(/^https?:\/\//i.test(p.link) ? p.link : `https://${p.link}`);
    const path = (u.pathname || "/").replace(/\/+$/, "") || "/";
    if (path === "/" || path === "/en" || path === "/us") {
      score += 5;
      matched_signals.push("clean_root_path");
    }
  } catch {
    /* ignore */
  }

  const jobOnly =
    /\bcareers?\b/i.test(title || "") &&
    !/\babout\b|\bhome\b|\bcompany\b/i.test(snippet || "") &&
    /apply now|job opening|open positions/i.test(snippet || "");
  if (jobOnly && !hard_negative) {
    score -= 25;
    reject_reasons.push("job_listing_only_signals");
  }

  if (/\.(blogspot|wordpress\.com|wixsite|github\.io|notion\.site)(\/|$)/i.test(hostname)) {
    score -= 40;
    reject_reasons.push("suspicious_free_host");
  }

  if (hard_negative) {
    score = Math.min(score, 40);
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  return { score, matched_signals, reject_reasons, hard_negative };
}

/**
 * @param {number} score
 * @param {boolean} hardNegative
 */
export function decisionFromScore(score, hardNegative) {
  if (hardNegative) {
    return "manual_review";
  }
  if (score >= 82) {
    return "auto_approve";
  }
  if (score >= 55) {
    return "manual_review";
  }
  return "reject";
}

/**
 * If two top candidates for same company within 3 points, both become manual_review.
 * Never more than one auto_approve per company.
 * @param {Array<{ score: number, decision: string, candidate_domain: string, hard_negative?: boolean }>} rows
 * @returns {typeof rows}
 */
export function applyTieRules(rows) {
  const sorted = [...rows].sort((a, b) => b.score - a.score);
  if (sorted.length === 0) return rows;

  const top = sorted[0];
  const second = sorted[1];

  const out = sorted.map((r) => ({ ...r }));

  if (second && Math.abs(top.score - second.score) <= 3 && top.candidate_domain !== second.candidate_domain) {
    for (const r of out) {
      if (r.candidate_domain === top.candidate_domain || r.candidate_domain === second.candidate_domain) {
        if (r.decision === "auto_approve") {
          r.decision = "manual_review";
          r.tie_break = "within_3_points_different_apex";
        }
      }
    }
  }

  const auto = out.filter((r) => r.decision === "auto_approve");
  if (auto.length > 1) {
    const keep = auto.sort((a, b) => b.score - a.score)[0];
    for (const r of out) {
      if (r.decision === "auto_approve" && r.candidate_domain !== keep.candidate_domain) {
        r.decision = "manual_review";
        r.tie_break = "multiple_auto_approve_blocked";
      }
    }
  }

  return out;
}
