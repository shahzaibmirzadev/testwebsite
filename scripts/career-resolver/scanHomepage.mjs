import * as cheerio from "cheerio";

const KEYWORDS =
  /\b(careers|jobs|join\s+us|work\s+with\s+us|open\s+positions|hiring|employment)\b/i;

/**
 * @param {string} html
 * @param {string} baseUrl
 * @returns {{ href: string, score: number, text: string }[]}
 */
export function extractCareerLinkCandidates(html, baseUrl) {
  const $ = cheerio.load(html);
  const base = new URL(baseUrl);
  const origin = base.origin;
  /** @type {{ href: string, score: number, text: string }[]} */
  const out = [];

  $("a[href]").each((_, el) => {
    const raw = $(el).attr("href");
    if (!raw || raw.startsWith("#") || raw.startsWith("mailto:")) return;
    let abs;
    try {
      abs = new URL(raw, baseUrl).href;
    } catch {
      return;
    }
    const u = new URL(abs);
    if (u.protocol !== "http:" && u.protocol !== "https:") return;

    const text = $(el).text().replace(/\s+/g, " ").trim();
    let score = 0;
    if (KEYWORDS.test(text)) score += 4;
    const path = u.pathname.toLowerCase();
    if (/(careers|jobs|join|hiring|opportunities)/.test(path)) score += 3;
    if (u.origin === origin) score += 2;
    if (KEYWORDS.test(u.href)) score += 1;
    if (score > 0) {
      out.push({ href: u.href.split("#")[0], score, text: text.slice(0, 120) });
    }
  });

  out.sort((a, b) => b.score - a.score);
  const seen = new Set();
  const deduped = [];
  for (const c of out) {
    if (seen.has(c.href)) continue;
    seen.add(c.href);
    deduped.push(c);
  }
  return deduped.slice(0, 12);
}

/**
 * Very rough SPA / thin HTML heuristic for v1.
 * @param {string} html
 */
export function suspectJsRendered(html) {
  const t = html.replace(/<script[\s\S]*?<\/script>/gi, " ");
  const textLen = t.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().length;
  const scriptCount = (html.match(/<script/gi) || []).length;
  if (textLen < 400 && scriptCount >= 8) return true;
  if (textLen < 200) return true;
  return false;
}
