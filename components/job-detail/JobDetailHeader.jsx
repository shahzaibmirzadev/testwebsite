import Link from "next/link";
import { FiArrowLeft, FiExternalLink, FiMapPin } from "react-icons/fi";
import CompanyLogoPlaceholder from "@/components/home/CompanyLogoPlaceholder";
import { getPreferredCompanyDisplayName } from "@/lib/companyDescriptionMatch";
import { formatPostedDetailLine, formatUpdatedDetailLine } from "@/lib/jobDetailFormat";
import { getCategoryGradientByFamily } from "@/lib/categoryMeta";
import { getJobListingLogoUrlsForDisplay } from "@/lib/companyPageCopy";
import { getJobFamily, getLocationDisplayText } from "@/lib/jobFieldHelpers";
import { companyPagePath } from "@/lib/companyPages";
import JobDetailMeta from "./JobDetailMeta";

/**
 * Job detail page header (back link, posted, title, company, location, meta).
 * @param {{ job: Record<string, unknown> }} props
 */
export default function JobDetailHeader({ job }) {
  const posted = formatPostedDetailLine(job);
  const updated = formatUpdatedDetailLine(job);
  const title = String(job.title ?? "Job");
  const company = job.company != null ? String(job.company).trim() : "";
  const companyDisplay = getPreferredCompanyDisplayName(job);
  const companyHref = company ? companyPagePath(company) : null;
  const location = getLocationDisplayText(job);
  const family = getJobFamily(job);
  const sectorGradient = getCategoryGradientByFamily(family);
  const applyUrl = job.apply_url ? String(job.apply_url).trim() : "";
  const { primaryUrl: logoUrl, fallbackUrl: logoFallbackUrl, fallbackUrls: logoFallbackUrls } =
    getJobListingLogoUrlsForDisplay(job);

  return (
    <header className="border-b border-[rgba(0,0,0,0.08)] pb-6 sm:pb-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/"
          className="inline-flex min-h-10 items-center gap-2 rounded-[8px] bg-[#EDE9FF] px-4 py-2 text-sm font-bold text-[#1A1160] no-underline transition-colors hover:bg-[#5B4FE8] hover:text-[#FFFFFF] focus:outline-none focus:ring-2 focus:ring-[#5B4FE8] focus:ring-offset-2 focus:ring-offset-[#FFFFFF]"
        >
          <FiArrowLeft aria-hidden className="h-4 w-4" />
          All jobs
        </Link>
        <div className="flex flex-wrap items-center justify-end gap-3">
          {updated ? (
            <p className="m-0 inline-flex min-h-10 items-center rounded-[8px] border border-[rgba(91,79,232,0.16)] bg-[rgba(237,233,255,0.72)] px-3 text-sm font-bold text-[#1A1160]">
              {updated}
            </p>
          ) : null}
          {applyUrl ? (
            <a
              href={applyUrl}
              className="hidden min-h-10 items-center justify-center gap-2 rounded-[8px] bg-[#5B4FE8] px-5 py-2 text-sm font-bold text-[#FFFFFF] no-underline transition-colors hover:bg-[#1A1160] focus:outline-none focus:ring-2 focus:ring-[#5B4FE8] focus:ring-offset-2 focus:ring-offset-[#FFFFFF] sm:inline-flex"
              target="_blank"
              rel="noreferrer"
            >
              Apply
              <FiExternalLink aria-hidden className="h-4 w-4" />
            </a>
          ) : null}
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start">
        <div className="flex items-center gap-3">
          <CompanyLogoPlaceholder
            url={logoUrl}
            fallbackUrl={logoFallbackUrl}
            fallbackUrls={logoFallbackUrls}
            company={companyDisplay}
            accentGradient={sectorGradient}
            className="h-14 w-14 rounded-[12px] sm:h-16 sm:w-16"
          />
        </div>

        <div className="min-w-0">
          {posted ? (
            <p className="m-0 text-sm font-bold uppercase tracking-[0.04em] text-[#5B4FE8]">
              {posted}
            </p>
          ) : null}
          <h1 className="mt-2 mb-3 max-w-4xl text-3xl font-bold leading-tight text-[#1C1C1A] sm:text-5xl">
            {title}
          </h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-[#666666] sm:text-base">
            <p className="m-0 font-bold text-[#1C1C1A]">
              {companyHref ? (
                <Link
                  href={companyHref}
                  className="text-[#1C1C1A] no-underline hover:text-[#5B4FE8] hover:underline"
                >
                  {companyDisplay}
                </Link>
              ) : (
                companyDisplay
              )}
            </p>
            {location ? (
              <p className="m-0 inline-flex min-w-0 items-center gap-1.5">
                <FiMapPin aria-hidden className="h-4 w-4 shrink-0 text-[#A3A3A3]" />
                <span className="min-w-0">{location}</span>
              </p>
            ) : null}
          </div>
          <JobDetailMeta job={job} />
        </div>
      </div>
    </header>
  );
}
