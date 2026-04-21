/**
 * Rippling public board API — https://ats.rippling.com/api/v2/board/{board}/jobs
 *
 * Env (optional):
 *   ATS_RIPPLING_MAX_DETAIL_FETCHES — max per-job detail API calls per company (unset = unlimited)
 */
import { fetchJson } from "../http.mjs";
import { cleanText, firstIsoDate, unifiedJob } from "./unified.mjs";
import { collectUrls, parseRipplingBoardPath } from "./urlParsers.mjs";

/**
 * @returns {number}
 */
function parseRipplingMaxDetailFetches() {
  const raw = String(process.env.ATS_RIPPLING_MAX_DETAIL_FETCHES ?? "").trim();
  if (!raw) return Infinity;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : Infinity;
}

/**
 * @param {unknown} locs
 */
function formatLocations(locs) {
  if (!Array.isArray(locs) || locs.length === 0) return "";
  return cleanText(locs.map((l) => (l && typeof l === "object" ? l.name : "")).filter(Boolean).join(", "));
}

/**
 * @param {unknown} items
 */
function pageFingerprint(items) {
  if (!Array.isArray(items) || items.length === 0) return "empty";
  return items
    .map((j) => (j && typeof j === "object" ? String(j.id ?? "") : ""))
    .sort()
    .join("|");
}

/**
 * @param {unknown} d — description object or string from detail JSON
 */
function descriptionFromDetail(d) {
  if (d == null) return { html: "", raw: "" };
  if (typeof d === "string") {
    const html = d;
    return { html, raw: cleanText(html) };
  }
  if (typeof d === "object") {
    const company = typeof d.company === "string" ? d.company : "";
    const role = typeof d.role === "string" ? d.role : "";
    const html = [company, role].filter(Boolean).join("\n");
    return { html, raw: cleanText(html) };
  }
  return { html: "", raw: "" };
}

/**
 * @param {Record<string, string>} row
 */
export async function extractRippling(row) {
  const company = row.company_name || "";
  const urls = collectUrls(row);
  const board = urls.map(parseRipplingBoardPath).find(Boolean);
  if (!board) {
    throw new Error("rippling: could not parse board path from URLs");
  }

  const boardPath = board
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  const baseApi = `https://ats.rippling.com/api/v2/board/${boardPath}/jobs`;

  /** @type {Record<string, unknown>[]} */
  const allItems = [];
  let page = 0;
  let totalPages = Infinity;
  let lastFp = null;

  while (page < totalPages && page < 500) {
    let data;
    try {
      data = await fetchJson(
        `${baseApi}?page=${page}&pageSize=50`,
        `Rippling list ${company} page=${page}`
      );
    } catch (e) {
      throw new Error(`rippling: list page ${page} failed: ${e?.message || e}`);
    }

    if (typeof data?.totalPages === "number" && Number.isFinite(data.totalPages)) {
      totalPages = data.totalPages;
    }

    const items = Array.isArray(data?.items) ? data.items : [];
    if (items.length === 0) {
      break;
    }

    const fp = pageFingerprint(items);
    if (fp === lastFp) {
      console.log(
        JSON.stringify({
          level: "warn",
          provider: "rippling",
          company,
          reason: "pagination_repeated_page_contents",
          page,
        })
      );
      break;
    }
    lastFp = fp;

    allItems.push(...items);
    page += 1;

    if (page >= totalPages) {
      break;
    }
  }

  /** @type {Record<string, unknown>[] } */
  const jobs = [];

  const maxDetailFetches = parseRipplingMaxDetailFetches();
  let detailFetchesUsed = 0;
  let detailFetchCapSkipped = 0;

  for (const j of allItems) {
    if (!j || typeof j !== "object") continue;
    const id = j.id != null ? String(j.id) : "";
    const title = cleanText(j.name || "");
    let applyUrl = cleanText(j.url || "");

    let descriptionHtml = "";
    let descriptionRaw = "";
    let postedAt = null;
    let employmentType = null;
    let remoteStatus = Array.isArray(j.locations) && j.locations[0]?.workplaceType
      ? String(j.locations[0].workplaceType)
      : null;

    if (id) {
      if (detailFetchesUsed >= maxDetailFetches) {
        detailFetchCapSkipped += 1;
        console.log(
          JSON.stringify({
            level: "warn",
            provider: "rippling",
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
            `https://ats.rippling.com/api/v2/board/${boardPath}/jobs/${encodeURIComponent(id)}`,
            `Rippling detail ${company} job=${id}`
          );
          const { html, raw } = descriptionFromDetail(detail?.description);
          descriptionHtml = html;
          descriptionRaw = raw;
          postedAt = firstIsoDate(detail?.createdOn, detail?.updatedOn);
          if (detail?.employmentType && typeof detail.employmentType === "object") {
            employmentType = cleanText(detail.employmentType.label) || null;
          }
          if (detail?.locations?.[0]?.workplaceType) {
            remoteStatus = String(detail.locations[0].workplaceType);
          }
          if (detail?.url) {
            applyUrl = cleanText(detail.url);
          }
        } catch (e) {
          console.log(
            JSON.stringify({
              level: "warn",
              provider: "rippling",
              company,
              job_id: id,
              reason: "detail_fetch_failed",
              error: String(e?.message || e),
            })
          );
        }
      }
    }

    jobs.push(
      unifiedJob({
        source: "rippling",
        source_job_id: id || title || "unknown",
        company,
        title: title || "(no title)",
        location: formatLocations(j.locations),
        apply_url: applyUrl,
        posted_at: postedAt,
        description_raw: descriptionRaw,
        description_html: descriptionHtml,
        employment_type: employmentType,
        remote_status: remoteStatus,
        tags: [],
      })
    );
  }

  if (detailFetchCapSkipped > 0) {
    console.log(
      JSON.stringify({
        level: "warn",
        provider: "rippling",
        company,
        reason: "detail_fetch_cap_summary",
        detail_fetch_cap: maxDetailFetches,
        detail_fetch_cap_skipped: detailFetchCapSkipped,
      })
    );
  }

  return jobs;
}
