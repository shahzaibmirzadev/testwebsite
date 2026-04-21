/**
 * Map arbitrary URLs to (provider, slug) using existing hostname classification + urlParsers.
 * BambooHR + Rippling require successful strict parses; Teamtailor follows subdomain parser only.
 */
import { classifyAtsHostname } from "../career-resolver/classifyAts.mjs";
import {
  parseGreenhouseBoard,
  parseLeverCompany,
  parseWorkableAccount,
  parseAshbyBoard,
  parseTeamtailorSubdomain,
  parseBamboohrSubdomain,
  parseRipplingBoardPath,
} from "../job-extraction/atsHandlers/urlParsers.mjs";

/** @type {Set<string>} */
const STRICT_PROVIDERS = new Set(["bamboohr", "rippling"]);

/**
 * @param {string | undefined} urlString
 * @param {{ supportedProviders?: Set<string> }} [opts]
 * @returns {{ ok: true, provider: string, slug: string } | { ok: false, reason: string }}
 */
export function parseAtsUrlToIdentity(urlString, opts = {}) {
  const supported =
    opts.supportedProviders ||
    new Set([
      "greenhouse",
      "lever",
      "teamtailor",
      "workable",
      "ashby",
      "bamboohr",
      "rippling",
    ]);

  let url;
  try {
    url = new URL(String(urlString ?? "").trim());
  } catch {
    return { ok: false, reason: "invalid_url" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: "unsupported_scheme" };
  }

  const classified = classifyAtsHostname(url.hostname);
  if (!classified) {
    return { ok: false, reason: "not_ats_host" };
  }

  const provider = classified.provider;
  if (!supported.has(provider)) {
    return { ok: false, reason: "unsupported_provider" };
  }

  const href = url.href;
  /** @type {string | null} */
  let slug = null;

  switch (provider) {
    case "greenhouse":
      slug = parseGreenhouseBoard(href);
      break;
    case "lever":
      slug = parseLeverCompany(href);
      break;
    case "workable":
      slug = parseWorkableAccount(href);
      break;
    case "ashby":
      slug = parseAshbyBoard(href);
      break;
    case "teamtailor":
      slug = parseTeamtailorSubdomain(href);
      break;
    case "bamboohr":
      slug = parseBamboohrSubdomain(href);
      break;
    case "rippling":
      slug = parseRipplingBoardPath(href);
      break;
    default:
      return { ok: false, reason: "no_parser" };
  }

  if (STRICT_PROVIDERS.has(provider)) {
    if (!slug || !String(slug).trim()) {
      return { ok: false, reason: "strict_parse_failed" };
    }
  } else if (!slug || !String(slug).trim()) {
    return { ok: false, reason: "weak_or_missing_slug" };
  }

  return {
    ok: true,
    provider,
    slug: String(slug).trim(),
  };
}

/**
 * @param {string} provider
 * @param {string} slug
 */
export function providerSlugKey(provider, slug) {
  return `${String(provider || "")
    .trim()
    .toLowerCase()}|${String(slug || "")
    .trim()
    .toLowerCase()}`;
}
