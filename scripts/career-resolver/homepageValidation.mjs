/**
 * Reject obvious non-company "homepage" sources (social, directory, etc.)
 * before career resolution. Does not mutate master CSV — used only in run.mjs.
 */

import { normalizeToHttpsUrl } from "./urlUtils.mjs";

/** Registrable-style bases: host equals base or is a subdomain of base. */
const INVALID_HOMEPAGE_BASES = [
  "linkedin.com",
  "linkedin.co.uk",
  "linkedin.cn",
  "linkedin.com.br",
  "facebook.com",
  "fb.com",
  "instagram.com",
  "twitter.com",
  "x.com",
  "t.co",
  "crunchbase.com",
  "youtube.com",
  "youtu.be",
];

/**
 * @param {string} host
 */
export function stripWww(host) {
  const h = (host || "").toLowerCase();
  return h.startsWith("www.") ? h.slice(4) : h;
}

/**
 * True if hostname should not be used as a company careers homepage root.
 * @param {string} hostname
 */
export function isInvalidCorporateHomepageHost(hostname) {
  const h = stripWww(hostname || "");
  if (!h) return false;
  for (const base of INVALID_HOMEPAGE_BASES) {
    if (h === base || h.endsWith(`.${base}`)) return true;
  }
  return false;
}

/**
 * @param {string} rawUrl
 * @returns {{ hostname: string } | { error: string }}
 */
function tryParseHostname(rawUrl) {
  const s = (rawUrl || "").trim();
  if (!s) return { error: "empty" };
  try {
    const u = normalizeToHttpsUrl(s);
    return { hostname: new URL(u).hostname.toLowerCase() };
  } catch {
    return { error: "parse_failed" };
  }
}

/**
 * @param {string} rawDomain
 * @returns {{ host: string } | { error: string }}
 */
function normalizeDomainHost(rawDomain) {
  let d = (rawDomain || "").trim().toLowerCase();
  d = d.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  d = stripWww(d);
  if (!d || !/^[\w.-]+$/.test(d)) return { error: "invalid_domain" };
  if (isInvalidCorporateHomepageHost(d)) return { error: "invalid_domain" };
  return { host: d };
}

/**
 * Valid company homepage from master row: prefer full_url; reject social/network URLs;
 * fall back to domain → https://host/
 *
 * @param {string} fullUrl — master `full_url`
 * @param {string} domain — master `domain`
 * @returns {{
 *   homepageUrl: string,
 *   domain: string,
 *   homepage_input_validation: string,
 *   homepage_validation_note: string,
 *   used_domain_fallback_after_rejected_url: boolean,
 * } | {
 *   error: string,
 *   homepage_input_validation: string,
 *   homepage_validation_note: string,
 * }}
 */
export function resolveValidatedHomepage(fullUrl, domain) {
  const fu = (fullUrl || "").trim();
  const dom = (domain || "").trim();

  let rejectedUrl = false;
  let rejectDetail = "";

  if (fu) {
    const parsed = tryParseHostname(fu);
    if ("error" in parsed) {
      rejectedUrl = true;
      rejectDetail = "full_url could not be parsed as a URL";
    } else if (isInvalidCorporateHomepageHost(parsed.hostname)) {
      rejectedUrl = true;
      rejectDetail = `full_url host is not a company homepage (${parsed.hostname})`;
    } else {
      try {
        const u = normalizeToHttpsUrl(fu);
        const origin = new URL(u).origin;
        const host = stripWww(new URL(u).hostname);
        return {
          homepageUrl: `${origin}/`,
          domain: host,
          homepage_input_validation: "ok",
          homepage_validation_note: "",
          used_domain_fallback_after_rejected_url: false,
        };
      } catch {
        rejectedUrl = true;
        rejectDetail = "full_url normalisation failed";
      }
    }
  }

  const domNorm = normalizeDomainHost(dom);
  if ("host" in domNorm) {
    const note = rejectedUrl
      ? `${rejectDetail}; using https://${domNorm.host}/ from domain column.`
      : !fu
        ? "No full_url in master; using domain column for homepage."
        : "";
    return {
      homepageUrl: `https://${domNorm.host}/`,
      domain: domNorm.host,
      homepage_input_validation: rejectedUrl
        ? "rejected_url_domain_fallback"
        : "ok_domain_only",
      homepage_validation_note: note,
      used_domain_fallback_after_rejected_url: rejectedUrl,
    };
  }

  if (rejectedUrl) {
    return {
      error: "missing_homepage",
      homepage_input_validation: "rejected_url_no_usable_domain",
      homepage_validation_note: `${rejectDetail}; domain column missing or not a usable company host.`,
    };
  }

  if (dom && "error" in domNorm) {
    const why =
      domNorm.error === "invalid_domain"
        ? "domain column is empty, invalid, or points to a blocked network host"
        : "domain column invalid";
    return {
      error: "missing_homepage",
      homepage_input_validation: "invalid_or_blocked_domain",
      homepage_validation_note: why,
    };
  }

  return {
    error: "missing_homepage",
    homepage_input_validation: "missing_homepage",
    homepage_validation_note: "No usable full_url and no usable domain.",
  };
}
