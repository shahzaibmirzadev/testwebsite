/**
 * Teamtailor public RSS — /jobs.rss on the career subdomain.
 */
import { load } from "cheerio";

import { fetchText } from "../http.mjs";
import { cleanText, firstIsoDate, unifiedJob } from "./unified.mjs";
import { collectUrls, parseTeamtailorSubdomain } from "./urlParsers.mjs";

/**
 * @param {string} itemHtml
 */
function extractLocationNamesFromItem(itemHtml) {
  if (!itemHtml) return "";
  const names = [...itemHtml.matchAll(/<tt:name>([^<]*)<\/tt:name>/g)]
    .map((m) => String(m[1] || "").trim())
    .filter(Boolean);
  return names.join(", ");
}

/**
 * @param {Record<string, string>} row
 */
export async function extractTeamtailor(row) {
  const company = row.company_name || "";
  const urls = collectUrls(row);
  const sub = urls.map(parseTeamtailorSubdomain).find(Boolean);
  if (!sub) {
    throw new Error("teamtailor: could not parse subdomain from URLs");
  }

  const rssUrl = `https://${encodeURIComponent(sub)}.teamtailor.com/jobs.rss`;
  let xml;
  try {
    xml = await fetchText(rssUrl, `Teamtailor RSS ${company}`);
  } catch (e) {
    throw new Error(`teamtailor: RSS fetch failed (${rssUrl}): ${e?.message || e}`);
  }

  let $;
  try {
    $ = load(xml, { xml: { xmlMode: true } });
  } catch (e) {
    throw new Error(`teamtailor: RSS XML parse failed: ${e?.message || e}`);
  }

  /** @type {Record<string, unknown>[] } */
  const jobs = [];

  $("item").each((_, el) => {
    try {
      const it = $(el);
      const title = cleanText(it.find("title").first().text());
      const link = cleanText(it.find("link").first().text());
      const guid = cleanText(it.find("guid").first().text());
      const pubDate = cleanText(it.find("pubDate").first().text());
      const remoteStatus = cleanText(it.find("remoteStatus").first().text()) || null;

      const descEl = it.find("description").first();
      const descriptionHtml = String(descEl.html() ?? descEl.text() ?? "");
      const descriptionRaw = cleanText(descriptionHtml);

      const loc = extractLocationNamesFromItem(it.html() || "");

      if (!title && !link) {
        console.log(
          JSON.stringify({
            level: "warn",
            provider: "teamtailor",
            company,
            reason: "rss_item_missing_title_and_link",
          })
        );
        return;
      }

      jobs.push(
        unifiedJob({
          source: "teamtailor",
          source_job_id: String(guid || link || title || "unknown"),
          company,
          title: title || "(no title)",
          location: loc,
          apply_url: link,
          posted_at: firstIsoDate(pubDate),
          description_raw: descriptionRaw,
          description_html: descriptionHtml,
          employment_type: null,
          remote_status: remoteStatus,
          tags: [],
        })
      );
    } catch (itemErr) {
      console.log(
        JSON.stringify({
          level: "warn",
          provider: "teamtailor",
          company,
          reason: "rss_item_parse_failed",
          error: String(itemErr?.message || itemErr),
        })
      );
    }
  });

  if (jobs.length === 0) {
    console.log(
      JSON.stringify({
        level: "warn",
        provider: "teamtailor",
        company,
        reason: "rss_zero_items_parsed",
        rssUrl,
      })
    );
  }

  return jobs;
}
