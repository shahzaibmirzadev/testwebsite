/**
 * BambooHR public careers JSON — /careers/list + optional /careers/{id}/detail.
 *
 * Env (optional):
 *   ATS_BAMBOOHR_MAX_DETAIL_FETCHES — max detail fetches per company (unset = unlimited)
 */
import { fetchJson } from "../http.mjs";
import { cleanText, firstIsoDate, unifiedJob } from "./unified.mjs";
import { collectUrls, parseBamboohrSubdomain } from "./urlParsers.mjs";

/**
 * @returns {number}
 */
function parseBamboohrMaxDetailFetches() {
  const raw = String(process.env.ATS_BAMBOOHR_MAX_DETAIL_FETCHES ?? "").trim();
  if (!raw) return Infinity;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : Infinity;
}

/**
 * @param {Record<string, unknown>} job — list row
 */
function locationFromListJob(job) {
  const ats = job?.atsLocation;
  if (ats && typeof ats === "object") {
    const parts = [ats.city, ats.state, ats.country].filter(Boolean);
    return cleanText(parts.join(", "));
  }
  const loc = job?.location;
  if (loc && typeof loc === "object") {
    const parts = [loc.city, loc.state, loc.addressCountry].filter(Boolean);
    return cleanText(parts.join(", "));
  }
  return "";
}

/**
 * @param {Record<string, unknown>} job — list row
 */
function listJobHasUsableDescription(job) {
  const d = job?.description ?? job?.jobOpeningDescription;
  return Boolean(d && String(d).trim());
}

/**
 * @param {Record<string, string>} row
 */
export async function extractBamboohr(row) {
  const company = row.company_name || "";
  const urls = collectUrls(row);
  const sub = urls.map(parseBamboohrSubdomain).find(Boolean);
  if (!sub) {
    throw new Error("bamboohr: could not parse subdomain from URLs");
  }

  const base = `https://${encodeURIComponent(sub)}.bamboohr.com`;
  let listData;
  try {
    listData = await fetchJson(`${base}/careers/list`, `BambooHR list ${company}`);
  } catch (e) {
    throw new Error(`bamboohr: careers/list failed: ${e?.message || e}`);
  }

  const list = Array.isArray(listData?.result) ? listData.result : [];
  /** @type {Record<string, unknown>[] } */
  const jobs = [];

  const maxDetailFetches = parseBamboohrMaxDetailFetches();
  let detailFetchesUsed = 0;

  for (const job of list) {
    const id = job?.id != null ? String(job.id) : "";
    const title = cleanText(job?.jobOpeningName || job?.title || "");
    let applyUrl = id ? `${base}/careers/${encodeURIComponent(id)}` : "";

    let descriptionHtml = "";
    let descriptionRaw = "";
    let postedAt = null;

    const needDetail = !listJobHasUsableDescription(job);

    if (needDetail && id) {
      if (detailFetchesUsed >= maxDetailFetches) {
        console.log(
          JSON.stringify({
            level: "warn",
            provider: "bamboohr",
            company,
            job_id: id,
            reason: "detail_fetch_cap_skip",
            cap: maxDetailFetches,
          })
        );
      } else {
        detailFetchesUsed += 1;
        try {
          const detail = await fetchJson(
            `${base}/careers/${encodeURIComponent(id)}/detail`,
            `BambooHR detail ${company} job=${id}`
          );
          const opening = detail?.result?.jobOpening ?? detail?.result;
          if (opening?.jobOpeningShareUrl) {
            applyUrl = String(opening.jobOpeningShareUrl);
          }
          if (opening?.description) {
            descriptionHtml = String(opening.description);
            descriptionRaw = cleanText(opening.description);
          }
          postedAt = firstIsoDate(opening?.datePosted, opening?.postedDate, opening?.createdDate);
        } catch (e) {
          console.log(
            JSON.stringify({
              level: "warn",
              provider: "bamboohr",
              company,
              job_id: id,
              reason: "detail_fetch_failed",
              error: String(e?.message || e),
            })
          );
        }
      }
    } else if (listJobHasUsableDescription(job)) {
      const raw = String(job.description ?? job.jobOpeningDescription ?? "");
      descriptionHtml = raw;
      descriptionRaw = cleanText(raw);
    }

    jobs.push(
      unifiedJob({
        source: "bamboohr",
        source_job_id: id || title || "unknown",
        company,
        title: title || "(no title)",
        location: locationFromListJob(job),
        apply_url: applyUrl,
        posted_at: postedAt,
        description_raw: descriptionRaw,
        description_html: descriptionHtml,
        employment_type: cleanText(job?.employmentStatusLabel) || null,
        remote_status: null,
        tags: [],
      })
    );
  }

  return jobs;
}
