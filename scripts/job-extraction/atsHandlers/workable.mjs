/**
 * Workable widget API — simplified from scripts/daily-sync.js fetchWorkable (list only, no per-job detail fetch).
 */
import { fetchJson } from "../http.mjs";
import { cleanText, firstIsoDate, unifiedJob } from "./unified.mjs";
import { collectUrls, parseWorkableAccount } from "./urlParsers.mjs";

function deriveShortcode(job) {
  const raw = job.shortcode || job.short_code || job.code;
  if (raw) return cleanText(raw);
  const u = job.url || job.apply_url || job.application_url;
  if (!u) return null;
  const m = String(u).match(/\/j\/([^/?#]+)/i);
  return m?.[1] || null;
}

/**
 * @param {Record<string, string>} row
 */
export async function extractWorkable(row) {
  const company = row.company_name || "";
  const urls = collectUrls(row);
  const slug = urls.map(parseWorkableAccount).find(Boolean);
  if (!slug) {
    throw new Error("workable: could not parse account slug from URLs");
  }

  const listUrls = [
    `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(slug)}`,
    `https://apply.workable.com/${encodeURIComponent(slug)}/jobs.json`,
  ];

  let data = null;
  let lastErr;
  for (const url of listUrls) {
    try {
      data = await fetchJson(url, `Workable list ${company}`);
      break;
    } catch (e) {
      lastErr = e;
    }
  }
  if (!data) throw lastErr || new Error("workable: list fetch failed");

  const jobs = Array.isArray(data.jobs)
    ? data.jobs
    : Array.isArray(data.results)
      ? data.results
      : Array.isArray(data)
        ? data
        : [];

  return jobs.map((job) => {
    const title = cleanText(job.title || job.name);
    const loc = cleanText(
      [job.location?.city, job.location?.region, job.location?.country]
        .filter(Boolean)
        .join(", ")
    );
    const html =
      job.description_html ||
      job.full_description ||
      job.descriptionHtml ||
      job.fullDescription ||
      "";
    const text = cleanText(
      job.description || job.short_description || job.requirements || ""
    );
    const shortcode = deriveShortcode(job);
    const applyUrl =
      job.url ||
      job.apply_url ||
      job.application_url ||
      (shortcode
        ? `https://apply.workable.com/${slug}/j/${shortcode}/`
        : `https://apply.workable.com/${slug}/`);

    return unifiedJob({
      source: "workable",
      source_job_id: String(job.id || shortcode || title),
      company,
      title,
      location: loc,
      apply_url: applyUrl,
      posted_at: firstIsoDate(
        job.published,
        job.created_at,
        job.updated_at,
        job.createdAt,
        job.updatedAt
      ),
      description_raw: text,
      description_html: String(html || ""),
      employment_type: null,
      remote_status: null,
      tags: [],
    });
  });
}
