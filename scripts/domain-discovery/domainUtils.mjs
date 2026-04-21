/**
 * Shared domain helpers aligned with scripts/expand-company-enrichment.mjs
 * and scripts/company-logo-priority-report.mjs (no second normalization system).
 */
import { parse as parseTld } from "tldts";

/** Same list as expand-company-enrichment / company-logo-priority-report ATS filters. */
export const BLOCKED_CAREER_HOST_SUFFIXES = [
  "ashbyhq.com",
  "greenhouse.io",
  "lever.co",
  "myworkdayjobs.com",
  "workday.com",
  "smartrecruiters.com",
  "icims.com",
  "jobvite.com",
  "taleo.net",
  "oraclecloud.com",
  "ultipro.com",
  "successfactors.com",
  "brassring.com",
  "workable.com",
  "bamboohr.com",
  "rippling.com",
  "recruitee.com",
  "teamtailor.com",
  "jazz.co",
  "applytojob.com",
  "breezy.hr",
  "notion.site",
  "linkedin.com",
  "indeed.com",
  "glassdoor.com",
  "ziprecruiter.com",
  "monster.com",
  "dice.com",
];

/** Extra hosts that must never be final logoDomain (directories, social, news aggregators). */
export const BLOCKED_DIRECTORY_AND_SOCIAL_SUFFIXES = [
  "crunchbase.com",
  "pitchbook.com",
  "zoominfo.com",
  "apollo.io",
  "clearbit.com",
  "facebook.com",
  "fb.com",
  "twitter.com",
  "x.com",
  "instagram.com",
  "tiktok.com",
  "youtube.com",
  "reddit.com",
  "pinterest.com",
  "wikipedia.org",
  "apple.com",
  "play.google.com",
  "apps.apple.com",
  "medium.com",
  "substack.com",
  "forbes.com",
  "bloomberg.com",
  "techcrunch.com",
  "reuters.com",
];

/** Reject dotted IPv4 hostnames (not valid corporate domains for favicons). */
function looksLikeIpv4Host(s) {
  return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(String(s || "").trim());
}

export function normalizeCanonicalDomain(raw) {
  let s = String(raw || "").trim().toLowerCase();
  if (!s) return "";
  s = s.replace(/^https?:\/\//i, "");
  s = s.split("/")[0].split("?")[0].split("#")[0];
  s = s.replace(/:\d+$/, "");
  s = s.replace(/\.+$/, "");
  if (looksLikeIpv4Host(s)) return "";
  if (!s || /[\s/]/.test(s) || s.includes("..")) return "";
  if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9.-]*[a-z0-9])?)+$/.test(s))
    return "";
  return s;
}

/**
 * @param {string} url
 * @returns {string}
 */
export function hostnameFromUrl(url) {
  const raw = String(url || "").trim();
  if (!raw || !/^https?:\/\//i.test(raw)) return "";
  try {
    const u = new URL(raw);
    return normalizeCanonicalDomain(u.hostname || "");
  } catch {
    return "";
  }
}

/**
 * Registrable / apex domain (e.g. careers.acme.com -> acme.com).
 * @param {string} url
 * @returns {{ hostname: string, apex: string }}
 */
export function apexFromUrl(url) {
  const raw = String(url || "").trim();
  if (!raw) return { hostname: "", apex: "" };
  let href = raw;
  if (!/^https?:\/\//i.test(href)) href = `https://${href}`;
  try {
    const u = new URL(href);
    const hostname = normalizeCanonicalDomain(u.hostname || "");
    if (!hostname) return { hostname: "", apex: "" };
    const p = parseTld(`https://${hostname}/`);
    const domain = p.domain === null || p.domain === undefined ? "" : String(p.domain).toLowerCase();
    const apex = domain || hostname;
    return { hostname, apex: normalizeCanonicalDomain(apex) || hostname };
  } catch {
    return { hostname: "", apex: "" };
  }
}

/**
 * ATS / recruiting hosts (final domain cannot be used for logo).
 * @param {string} host normalized hostname
 */
export function isBlockedCareerHost(host) {
  const h = String(host || "").toLowerCase();
  if (!h) return true;
  for (const suf of BLOCKED_CAREER_HOST_SUFFIXES) {
    if (h === suf || h.endsWith(`.${suf}`)) return true;
  }
  return false;
}

/**
 * Directories, social, app stores — not corporate homepage.
 * @param {string} host
 */
export function isBlockedDirectoryOrSocialHost(host) {
  const h = String(host || "").toLowerCase();
  if (!h) return true;
  for (const suf of BLOCKED_DIRECTORY_AND_SOCIAL_SUFFIXES) {
    if (h === suf || h.endsWith(`.${suf}`)) return true;
  }
  return false;
}

/**
 * True if hostname or apex must not auto-approve as logo domain.
 * @param {string} hostname
 * @param {string} apex
 */
export function isHardBlockedFinalDomain(hostname, apex) {
  const h = String(hostname || "").toLowerCase();
  const a = String(apex || "").toLowerCase();
  return (
    isBlockedCareerHost(h) ||
    isBlockedCareerHost(a) ||
    isBlockedDirectoryOrSocialHost(h) ||
    isBlockedDirectoryOrSocialHost(a)
  );
}
