/**
 * Lever postings API — scripts/daily-sync.js fetchLever.
 */
import { fetchJson } from "../http.mjs";
import { cleanText, firstIsoDate, unifiedJob } from "./unified.mjs";
import { collectUrls, parseLeverCompany } from "./urlParsers.mjs";

function buildDescriptionHtml(job) {
  const parts = [
    job.opening,
    job.descriptionBody,
    job.description,
    job.additional,
  ]
    .filter(Boolean)
    .map((h) => String(h));
  return parts.join("\n\n");
}

function buildDescriptionRaw(job) {
  const textParts = [
    job.openingPlain,
    job.descriptionBodyPlain,
    job.descriptionPlain,
    job.additionalPlain,
    job.text,
  ];
  return cleanText(textParts.filter(Boolean).join("\n\n"));
}

/**
 * @param {Record<string, string>} row
 */
export async function extractLever(row) {
  const company = row.company_name || "";
  const urls = collectUrls(row);
  let slug = urls.map(parseLeverCompany).find(Boolean);
  if (!slug) {
    throw new Error("lever: could not parse company slug from URLs");
  }

  const apiUrl = `https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`;
  const data = await fetchJson(apiUrl, `Lever ${company}`);
  const jobs = Array.isArray(data) ? data : [];

  return jobs.map((job) => {
    const loc = cleanText(job.categories?.location || job.categories?.allLocations);
    const rawHtml = buildDescriptionHtml(job);
    return unifiedJob({
      source: "lever",
      source_job_id: String(job.id),
      company,
      title: cleanText(job.text),
      location: loc,
      apply_url: job.hostedUrl || "",
      posted_at: firstIsoDate(
        job.createdAt,
        job.publishedAt,
        job.updatedAt,
        job.openedAt
      ),
      description_raw: buildDescriptionRaw(job) || cleanText(rawHtml),
      description_html: rawHtml,
      employment_type: null,
      remote_status: null,
      tags: [],
    });
  });
}
