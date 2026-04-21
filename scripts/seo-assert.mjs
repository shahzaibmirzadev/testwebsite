/**
 * Fetch sitemap.xml and assert each URL returns 200, is indexable (no noindex robots meta),
 * and canonical href matches the fetched URL.
 */
function normalizeBaseUrl(raw) {
  const s = String(raw || "").trim().replace(/\/$/, "");
  return s || "https://droneroles.com";
}

const BASE_URL = normalizeBaseUrl(
  process.env.SEO_ASSERT_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL
);
const LIMIT = Number(process.env.SEO_ASSERT_LIMIT || 500);

function extractLocs(xml) {
  const out = [];
  const re = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) {
    out.push(m[1].trim());
  }
  return out;
}

function hasNoindexRobots(html) {
  const robotsMeta = [
    ...html.matchAll(/<meta\s+[^>]*name=["']robots["'][^>]*>/gi),
  ].map((x) => x[0]);
  for (const tag of robotsMeta) {
    const content = /content=["']([^"']*)["']/i.exec(tag);
    if (content && /noindex/i.test(content[1])) return true;
  }
  return false;
}

function extractCanonicalHref(html) {
  const m = html.match(/<link[^>]+rel=["']canonical["'][^>]*>/i);
  if (!m) return "";
  const href = /href=["']([^"']+)["']/i.exec(m[0]);
  return href ? href[1].trim() : "";
}

function normalizeUrlForCompare(u) {
  try {
    const x = new URL(u);
    x.hash = "";
    let path = x.pathname;
    if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
    x.pathname = path || "/";
    return x.href;
  } catch {
    return String(u || "").trim();
  }
}

async function checkUrl(url) {
  const res = await fetch(url, {
    redirect: "follow",
    headers: { "user-agent": "DroneRoles-seo-assert/1.0" },
  });
  if (res.status !== 200) {
    return { url, ok: false, reason: `status ${res.status}` };
  }
  const html = await res.text();
  if (hasNoindexRobots(html)) {
    return { url, ok: false, reason: "noindex robots meta" };
  }
  const canon = extractCanonicalHref(html);
  if (!canon) {
    return { url, ok: false, reason: "missing canonical" };
  }
  const a = normalizeUrlForCompare(url);
  const b = normalizeUrlForCompare(canon);
  if (a !== b) {
    return { url, ok: false, reason: `canonical mismatch: expected ${a}, got ${b}` };
  }
  return { url, ok: true, reason: "" };
}

async function main() {
  const sitemapUrl = `${BASE_URL}/sitemap.xml`;
  const sitemapRes = await fetch(sitemapUrl);
  if (!sitemapRes.ok) {
    console.error("[seo-assert] Failed to fetch sitemap:", sitemapRes.status, sitemapUrl);
    process.exit(1);
  }
  const xml = await sitemapRes.text();
  let locs = extractLocs(xml);
  if (locs.length === 0) {
    console.error("[seo-assert] No URLs in sitemap");
    process.exit(1);
  }
  if (Number.isFinite(LIMIT) && LIMIT > 0 && locs.length > LIMIT) {
    locs = locs.slice(0, LIMIT);
  }

  const failures = [];
  for (const loc of locs) {
    const result = await checkUrl(loc);
    if (!result.ok) {
      console.error("[seo-assert] FAIL", loc, result.reason);
      failures.push(result);
    }
  }

  if (failures.length > 0) {
    console.error(`[seo-assert] ${failures.length} failure(s) of ${locs.length} URL(s)`);
    process.exit(1);
  }
  console.log(`[seo-assert] OK ${locs.length} URL(s)`);
}

main().catch((e) => {
  console.error("[seo-assert]", e);
  process.exit(1);
});
