/**
 * SmartRecruiters list API — simplified from scripts/daily-sync.js fetchSmartRecruiters (list + merge list fields only).
 */
import { fetchJson } from "../http.mjs";
import { cleanText, firstIsoDate, unifiedJob } from "./unified.mjs";
import { collectUrls, parseSmartRecruitersCompany } from "./urlParsers.mjs";

function publicApplyUrl(slug, job) {
  const id = job.id || job.uuid || job.refNumber;
  return (
    job.referralUrl ||
    job.applyUrl ||
    job.url ||
    (id && slug ? `https://careers.smartrecruiters.com/${slug}/${id}` : "")
  );
}

/**
 * @param {Record<string, string>} row
 */
export async function extractSmartRecruiters(row) {
  const company = row.company_name || "";
  const urls = collectUrls(row);
  const slug = urls.map(parseSmartRecruitersCompany).find(Boolean);
  if (!slug) {
    throw new Error("smartrecruiters: could not parse company slug from URLs");
  }

  const apiUrl = `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(slug)}/postings?limit=100`;
  const data = await fetchJson(apiUrl, `SmartRecruiters ${company}`);

  const jobs = Array.isArray(data?.content)
    ? data.content
    : Array.isArray(data?.postings)
      ? data.postings
      : Array.isArray(data?.data)
        ? data.data
        : [];

  return jobs.map((job) => {
    const htmlParts = [
      job.jobAd?.sections?.jobDescription?.text,
      job.jobAd?.sections?.qualifications?.text,
      job.jobAd?.sections?.additionalInformation?.text,
      job.description,
    ].filter(Boolean);
    const html = htmlParts.join("\n\n");
    const rawText = cleanText(html || job.name || "");
    const id = job.id || job.uuid || job.refNumber;

    return unifiedJob({
      source: "smartrecruiters",
      source_job_id: String(id || job.name),
      company,
      title: cleanText(job.name || job.title),
      location: cleanText(
        [
          job.location?.city,
          job.location?.region,
          job.location?.country,
          job.location?.fullLocation,
        ]
          .filter(Boolean)
          .join(", ")
      ),
      apply_url: publicApplyUrl(slug, job),
      posted_at: firstIsoDate(
        job.releasedDate,
        job.postedDate,
        job.createdOn,
        job.updatedOn
      ),
      description_raw: rawText,
      description_html: String(html || ""),
      employment_type: null,
      remote_status: null,
      tags: [],
    });
  });
}
