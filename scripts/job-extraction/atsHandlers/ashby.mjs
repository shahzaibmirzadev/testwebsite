/**
 * Ashby job board API — scripts/daily-sync.js fetchAshby.
 */
import { fetchJson } from "../http.mjs";
import { cleanText, firstIsoDate, unifiedJob } from "./unified.mjs";
import { collectUrls, parseAshbyBoard } from "./urlParsers.mjs";

/**
 * @param {Record<string, string>} row
 */
export async function extractAshby(row) {
  const company = row.company_name || "";
  const urls = collectUrls(row);
  const board = urls.map(parseAshbyBoard).find(Boolean);
  if (!board) {
    throw new Error("ashby: could not parse board slug from URLs");
  }

  const apiUrl = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(board)}`;
  const data = await fetchJson(apiUrl, `Ashby ${company}`);

  const jobs = Array.isArray(data?.jobs)
    ? data.jobs
    : Array.isArray(data?.jobPostings)
      ? data.jobPostings
      : Array.isArray(data?.postings)
        ? data.postings
        : [];

  return jobs.map((job) => {
    const html =
      job.descriptionHtml ||
      job.descriptionHTML ||
      job.htmlDescription ||
      job.content ||
      "";
    const rawText = cleanText(
      [job.descriptionPlain, job.descriptionText, job.description].filter(Boolean).join("\n")
    );
    return unifiedJob({
      source: "ashby",
      source_job_id: String(
        job.id || job.jobPostingId || job.requisitionId || job.title
      ),
      company,
      title: cleanText(job.title),
      location: cleanText(
        [job.location?.name, job.locationName, job.location].filter(Boolean).join(", ")
      ),
      apply_url: job.jobUrl || job.absoluteUrl || job.applyUrl || "",
      posted_at: firstIsoDate(
        job.publishedAt,
        job.createdAt,
        job.updatedAt,
        job.postedAt
      ),
      description_raw: rawText,
      description_html: String(html || ""),
      employment_type: null,
      remote_status: null,
      tags: [],
    });
  });
}
