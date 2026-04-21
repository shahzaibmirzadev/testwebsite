/**
 * Greenhouse public board API — same endpoint as scripts/daily-sync.js fetchGreenhouse.
 */
import { fetchJson } from "../http.mjs";
import { cleanText, firstIsoDate, unifiedJob } from "./unified.mjs";
import { collectUrls, parseGreenhouseBoard } from "./urlParsers.mjs";

/**
 * @param {{ company_name: string, careers_url_final?: string, redirected_to?: string, careers_url_candidate?: string, homepage_url?: string }} row
 */
export async function extractGreenhouse(row) {
  const company = row.company_name || "";
  const urls = collectUrls(row);
  let board = urls.map(parseGreenhouseBoard).find(Boolean) || null;
  if (!board) {
    throw new Error("greenhouse: could not parse board token from URLs");
  }

  const apiUrl = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs?content=true`;
  const data = await fetchJson(apiUrl, `Greenhouse ${company}`);
  const jobs = Array.isArray(data?.jobs) ? data.jobs : [];

  return jobs.map((job) => {
    const rawHtml = String(job.content || "");
    const descriptionRaw = cleanText(rawHtml);
    return unifiedJob({
      source: "greenhouse",
      source_job_id: String(job.id),
      company,
      title: cleanText(job.title),
      location: cleanText(job.location?.name),
      apply_url: job.absolute_url || "",
      posted_at: firstIsoDate(
        job.posted_at,
        job.published_at,
        job.created_at,
        job.updated_at
      ),
      description_raw: descriptionRaw,
      description_html: rawHtml,
      employment_type: null,
      remote_status: null,
      tags: [],
    });
  });
}
