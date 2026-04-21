/**
 * Shared host / registrable-domain normalization for discovery + veto matching.
 * Reuses career-resolver URL helpers; uses tldts for eTLD+1 where applicable.
 */
import { parse as tldParse } from "tldts";
import {
  normalizeToHttpsUrl,
  stripWwwHost,
} from "../career-resolver/urlUtils.mjs";

/**
 * @param {string} raw
 * @returns {{ ok: true, hostname: string, registrableDomain: string, isIp: boolean } | { ok: false, error: string }}
 */
export function normalizeDomainInput(raw) {
  const s = String(raw ?? "").trim();
  if (!s) {
    return { ok: false, error: "empty" };
  }

  let hostname;
  try {
    const href = /^https?:\/\//i.test(s) ? s : `https://${s}`;
    const u = new URL(href);
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      return { ok: false, error: "unsupported_scheme" };
    }
    hostname = stripWwwHost(u.hostname.toLowerCase());
  } catch {
    return { ok: false, error: "parse_failed" };
  }

  if (!hostname) {
    return { ok: false, error: "empty_host" };
  }

  const isIp = /^[\d.:]+$/.test(hostname) || hostname.includes(":");
  const parsed = tldParse(hostname);
  const registrable =
    parsed.domain && !isIp ? parsed.domain.toLowerCase() : hostname;

  return {
    ok: true,
    hostname,
    registrableDomain: registrable,
    isIp: Boolean(isIp || !parsed.domain),
  };
}

/**
 * Normalize a full URL to hostname + registrable domain (for careers/homepage columns).
 * @param {string} rawUrl
 * @returns {{ ok: true, hostname: string, registrableDomain: string, isIp: boolean } | { ok: false, error: string }}
 */
export function normalizeUrlToRegistrableDomain(rawUrl) {
  const s = String(rawUrl ?? "").trim();
  if (!s) {
    return { ok: false, error: "empty" };
  }
  try {
    const normalized = normalizeToHttpsUrl(s);
    return normalizeDomainInput(normalized);
  } catch {
    return { ok: false, error: "invalid_url" };
  }
}
