/**
 * Basic full_url / domain → homepage (no social-network rejection).
 * Career resolver uses `homepageValidation.mjs` → `resolveValidatedHomepage`.
 *
 * @param {string} fullUrl
 * @param {string} domain
 * @returns {{ homepageUrl: string, domain: string } | { error: string }}
 */
export function resolveHomepageInput(fullUrl, domain) {
  const fu = (fullUrl || "").trim();
  const dom = (domain || "").trim();
  if (fu) {
    try {
      const u = normalizeToHttpsUrl(fu);
      const origin = new URL(u).origin;
      const host = new URL(u).hostname.toLowerCase();
      /** Site root for probing (paths like /careers are always off the registrable origin). */
      const homepageUrl = `${origin}/`;
      return { homepageUrl, domain: stripWwwHost(host) };
    } catch {
      return { error: "invalid_full_url" };
    }
  }
  if (!dom) {
    return { error: "missing_homepage" };
  }
  const host = stripWwwHost(dom.toLowerCase().replace(/^https?:\/\//, ""));
  if (!host || !/^[\w.-]+$/.test(host)) {
    return { error: "invalid_domain" };
  }
  return { homepageUrl: `https://${host}/`, domain: host };
}

/**
 * Canonical homepage: https scheme, no fragment, trailing slash on path-only root.
 * @param {string} raw
 */
export function normalizeToHttpsUrl(raw) {
  let s = raw.trim();
  if (!/^https?:\/\//i.test(s)) {
    s = `https://${s}`;
  }
  const u = new URL(s);
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error("unsupported_scheme");
  }
  u.protocol = "https:";
  u.hash = "";
  u.username = "";
  u.password = "";
  if ((u.pathname === "/" || u.pathname === "") && !u.search) {
    u.pathname = "/";
  } else {
    u.pathname = u.pathname.replace(/\/+$/, "") || "/";
  }
  return u.href;
}

export function stripWwwHost(host) {
  const h = host.toLowerCase();
  return h.startsWith("www.") ? h.slice(4) : h;
}

/**
 * @param {number} index1Based
 */
export function companyKeyFromRow(index1Based) {
  return `cm-${String(index1Based).padStart(4, "0")}`;
}

/**
 * @param {string} a
 * @param {string} b
 */
export function hostnamesLooselyRelated(a, b) {
  const ha = a.toLowerCase();
  const hb = b.toLowerCase();
  if (ha === hb) return true;
  if (ha.endsWith(`.${hb}`) || hb.endsWith(`.${ha}`)) return true;
  return false;
}

/**
 * Same-run resolver cache key: normalized origin (protocol + host, www stripped).
 * @param {string} homepageUrl
 * @returns {string | null}
 */
export function resolverCacheKeyFromHomepageUrl(homepageUrl) {
  const s = (homepageUrl || "").trim();
  if (!s) return null;
  try {
    const u = new URL(s);
    const host = stripWwwHost(u.hostname.toLowerCase());
    return `${u.protocol}//${host}`;
  } catch {
    return null;
  }
}
