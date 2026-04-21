"use client";

import Link from "next/link";
import {
  getCompanyName,
  getFreshnessBadge,
  getJobFamily,
  getJobTags,
  getLocationDisplayText,
  getPostedLabel,
  getRemoteStatus,
} from "@/lib/jobFieldHelpers";
import { getCategoryGradientByFamily } from "@/lib/categoryMeta";
import { getPreferredCompanyDisplayName } from "@/lib/companyDescriptionMatch";
import { getJobListingLogoUrlsForDisplay } from "@/lib/companyPageCopy";
import { trackEvent } from "@/lib/analytics";
import { companyPagePath } from "@/lib/companyPages";
import { shouldIndexJobPage } from "@/lib/seoIndexing";
import { jobSlug } from "@/lib/slug";
import { FiExternalLink } from "react-icons/fi";
import CompanyLogoPlaceholder from "./CompanyLogoPlaceholder";

const MAX_TAGS = 5;

function canLinkToJob(job) {
  return shouldIndexJobPage(job);
}

/**
 * @param {{
 *   job: Record<string, unknown>,
 *   onOpenPreview?: (job: Record<string, unknown>) => void,
 *   previewOpen?: boolean,
 * }} props
 */
export default function JobCard({ job, onOpenPreview, previewOpen }) {
  const slug = jobSlug(job);
  const href = `/jobs/${slug}`;
  const linkable = canLinkToJob(job);
  const title = String(job.title ?? "Untitled role");
  const company = getCompanyName(job);
  const companyDisplay = getPreferredCompanyDisplayName(job);
  const companyHref = company ? companyPagePath(company) : null;
  const { primaryUrl: logoUrl, fallbackUrl: logoFallbackUrl, fallbackUrls: logoFallbackUrls } =
    getJobListingLogoUrlsForDisplay(job);
  const location = getLocationDisplayText(job);
  const posted = getPostedLabel(job);
  const freshness = getFreshnessBadge(job);
  const family = getJobFamily(job);
  const logoGradient = getCategoryGradientByFamily(family);
  const remote = getRemoteStatus(job);
  const tags = getJobTags(job);

  const handleCardClick = (event) => {
    if (event.target.closest("a")) return;
    trackEvent("open_job_preview", {
      slug,
      company: company || null,
    });
    onOpenPreview?.(job);
  };

  const handleCardKeyDown = (event) => {
    if (event.target.closest("a")) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    trackEvent("open_job_preview", {
      slug,
      company: company || null,
    });
    onOpenPreview?.(job);
  };

  return (
    <article
      className={`cursor-pointer rounded-[8px] border border-[rgba(91,79,232,0.14)] bg-[#FFFFFF] p-4 shadow-[0_10px_24px_rgba(28,28,26,0.04)] transition hover:-translate-y-0.5 hover:border-[rgba(91,79,232,0.28)] hover:bg-[#FFFCF7] hover:shadow-[0_16px_30px_rgba(28,28,26,0.08)] ${
        previewOpen ? "border-[rgba(91,79,232,0.45)] shadow-[0_0_0_1px_rgba(91,79,232,0.15),_var(--shadow-md)]" : ""
      }`}
      onClick={handleCardClick}
      onKeyDown={handleCardKeyDown}
      role="button"
      tabIndex={0}
      aria-label={`Open quick preview for ${title}`}
    >
      <div className="grid gap-3 sm:grid-cols-[56px_minmax(0,1fr)_auto] sm:items-start">
        <CompanyLogoPlaceholder
          url={logoUrl}
          fallbackUrl={logoFallbackUrl}
          fallbackUrls={logoFallbackUrls}
          company={companyDisplay}
          accentGradient={logoGradient}
        />

        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-start gap-x-3 gap-y-2">
            <h2 className="m-0 min-w-0 flex-1 text-base font-black leading-snug tracking-[-0.02em] text-[#1C1C1A] sm:text-lg">
              {linkable ? (
                <Link
                  href={href}
                  className="text-inherit no-underline transition hover:text-[#5B4FE8]"
                  onClick={() =>
                    trackEvent("view_job_details", {
                      slug,
                      company: company || null,
                    })
                  }
                >
                  {title}
                </Link>
              ) : (
                title
              )}
            </h2>
            {freshness ? (
              <span
                className={`inline-flex min-h-7 shrink-0 items-center rounded-full px-3 text-xs font-black ${
                  freshness === "NEW"
                    ? "bg-[rgba(22,163,74,0.12)] text-[#166534]"
                    : "bg-[#EDE9FF] text-[#1A1160]"
                }`}
              >
                {freshness}
              </span>
            ) : null}
          </div>

          <p className="mt-1 mb-0 text-sm font-semibold leading-5 text-[#665A50]">
            {companyHref ? (
              <Link
                href={companyHref}
                className="text-[#1C1C1A] no-underline transition hover:text-[#5B4FE8]"
                onClick={() =>
                  trackEvent("view_company_jobs", {
                    company: company || null,
                    source: "job_card_company_name",
                  })
                }
              >
                {companyDisplay}
              </Link>
            ) : (
              <span className="text-[#8A8A86]">Company not listed</span>
            )}
            <span className="text-[#C9C9C7]" aria-hidden> / </span>
            {location || "Location not listed"}
          </p>
          {posted ? <p className="mt-1 mb-0 text-xs font-bold text-[#8A8A86]">{posted}</p> : null}

          <div className="mt-3 flex flex-wrap gap-1.5">
            {family ? (
              <span className="rounded-full border border-[rgba(91,79,232,0.14)] bg-[#EDE9FF] px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.04em] text-[#1A1160]">
                {family}
              </span>
            ) : null}
            {remote ? (
              <span className="rounded-full border border-[rgba(91,79,232,0.14)] bg-[#FFFFFF] px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.04em] text-[#1A1160]">
                {remote}
              </span>
            ) : null}
            {tags.slice(0, MAX_TAGS).map((tag) => (
              <span key={tag} className="rounded-[6px] border border-[rgba(91,79,232,0.12)] bg-[#F7F7F8] px-2 py-0.5 text-xs font-semibold text-[#665A50]">
                {tag}
              </span>
            ))}
            {tags.length > MAX_TAGS ? (
              <span className="rounded-[6px] border border-[rgba(91,79,232,0.12)] bg-[#F7F7F8] px-2 py-0.5 text-xs font-semibold text-[#665A50]">
                +{tags.length - MAX_TAGS}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 sm:flex-col sm:items-end">
          {linkable ? (
            <Link href={href} className="text-sm font-black text-[#5B4FE8] no-underline transition hover:text-[#1A1160] hover:underline">
              View role
            </Link>
          ) : (
            <span className="text-sm font-black text-[#8A8A86]">View role</span>
          )}
          {job.apply_url ? (
            <a
              href={String(job.apply_url)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-[8px] border border-[rgba(91,79,232,0.14)] bg-[#FFFFFF] px-3 text-sm font-black text-[#1A1160] no-underline transition hover:border-[rgba(91,79,232,0.24)] hover:bg-[#EDE9FF] hover:text-[#5B4FE8]"
              onClick={() =>
                trackEvent("click_apply", {
                  slug,
                  company: company || null,
                  source: "job_card",
                })
              }
            >
              Apply
              <FiExternalLink aria-hidden className="h-3.5 w-3.5" />
            </a>
          ) : null}
        </div>
      </div>
    </article>
  );
}
