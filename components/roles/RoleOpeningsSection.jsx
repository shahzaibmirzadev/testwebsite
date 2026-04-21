"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import gsap from "gsap";
import { FiArrowRight, FiBriefcase, FiCheck, FiChevronDown, FiExternalLink, FiMapPin } from "react-icons/fi";
import {
  getCompanyName,
  getEmploymentType,
  getJobFamily,
  getJobTags,
  getLocationDisplayText,
  getRemoteStatus,
} from "@/lib/jobFieldHelpers";
import { getPreferredCompanyDisplayName } from "@/lib/companyDescriptionMatch";
import { getJobListingLogoUrlsForDisplay } from "@/lib/companyPageCopy";
import { companyPagePath } from "@/lib/companyPages";
import { shouldIndexJobPage } from "@/lib/seoIndexing";
import { jobSlug } from "@/lib/slug";

const PAGE_SIZE = 10;

const SORT_OPTIONS = [
  { value: "recent", label: "Most recent" },
  { value: "company", label: "Company" },
  { value: "title", label: "Role title" },
];

function toTimestamp(job) {
  const raw = String(job?.posted_at || job?.last_seen_at || job?.updated_at || "").trim();
  const ts = Date.parse(raw);
  return Number.isFinite(ts) ? ts : 0;
}

function companyInitial(name) {
  return String(name || "?").trim().charAt(0).toUpperCase() || "?";
}

function JobCompanyLogo({ job, company }) {
  const [failedPrimary, setFailedPrimary] = useState(false);
  const [failedFallback, setFailedFallback] = useState(false);
  const logoUrls = useMemo(() => getJobListingLogoUrlsForDisplay(job), [job]);
  const primaryUrl = logoUrls.primaryUrl || null;
  const fallbackUrl = logoUrls.fallbackUrl || null;
  const src = !failedPrimary && primaryUrl ? primaryUrl : !failedFallback && fallbackUrl ? fallbackUrl : null;

  useLayoutEffect(() => {
    setFailedPrimary(false);
    setFailedFallback(false);
  }, [primaryUrl, fallbackUrl]);

  return (
    <span
      className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-[10px] border border-[rgba(180,83,9,0.14)] bg-[#FFFFFF] text-sm font-black text-[#1A1160] shadow-[0_8px_18px_rgba(120,53,15,0.06)] sm:h-12 sm:w-12"
      aria-label={`Logo for ${company || "company"}`}
      role="img"
    >
      {src ? (
        <img
          src={src}
          alt=""
          className="block h-full w-full bg-[#FFFFFF] object-contain p-1.5 sm:p-2"
          loading="lazy"
          decoding="async"
          onError={() => {
            if (src === primaryUrl) {
              setFailedPrimary(true);
            } else {
              setFailedFallback(true);
            }
          }}
        />
      ) : (
        <span aria-hidden>{companyInitial(company)}</span>
      )}
    </span>
  );
}

function JobMetaLine({ job }) {
  const company = getCompanyName(job);
  const companyDisplay = getPreferredCompanyDisplayName(job);
  const companyHref = company ? companyPagePath(company) : null;
  const location = getLocationDisplayText(job);

  return (
    <p className="mt-1.5 mb-0 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold leading-5 text-[#665A50] sm:mt-2 sm:text-sm sm:leading-6">
      {companyHref ? (
        <Link href={companyHref} className="text-[#1C1C1A] no-underline transition hover:text-[#5B4FE8]">
          {companyDisplay}
        </Link>
      ) : (
        <span className="text-[#1C1C1A]">{companyDisplay || "Company not listed"}</span>
      )}
      <span className="text-[#C9C9C7]" aria-hidden>/</span>
      <span className="inline-flex items-center gap-1.5">
        <FiMapPin aria-hidden className="h-3.5 w-3.5 text-[#B45309]" />
        {location || "Location not listed"}
      </span>
    </p>
  );
}

function JobRow({ job, index }) {
  const router = useRouter();
  const title = String(job?.title || "Untitled role");
  const companyDisplay = getPreferredCompanyDisplayName(job);
  const slug = jobSlug(job);
  const href = `/jobs/${slug}`;
  const linkable = shouldIndexJobPage(job);
  const family = getJobFamily(job);
  const remote = getRemoteStatus(job);
  const employment = getEmploymentType(job);
  const tags = getJobTags(job).slice(0, 4);
  const chips = [family, remote, employment, ...tags].filter(Boolean).slice(0, 5);
  const openRow = (event) => {
    if (!linkable) return;
    if (event.target?.closest?.("a,button")) return;
    router.push(href);
  };
  const onRowKeyDown = (event) => {
    if (!linkable) return;
    if (event.target?.closest?.("a,button")) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      router.push(href);
    }
  };

  return (
    <article
      className={`grid grid-cols-[40px_minmax(0,1fr)_auto] gap-x-3 gap-y-2 border-b border-[rgba(180,83,9,0.14)] px-0 py-3 transition hover:bg-[#FFF7ED] sm:grid-cols-[52px_48px_minmax(0,1fr)_190px] sm:items-center sm:gap-4 sm:px-3 sm:py-4 ${
        linkable ? "cursor-pointer focus:outline-none focus-visible:bg-[#FFF7ED] focus-visible:ring-2 focus-visible:ring-[#5B4FE8]/25" : ""
      }`}
      role={linkable ? "link" : undefined}
      tabIndex={linkable ? 0 : undefined}
      onClick={openRow}
      onKeyDown={onRowKeyDown}
      aria-label={linkable ? `View ${title}` : undefined}
      data-role-opening-row
    >
      <span className="hidden text-xs font-black uppercase tracking-[0.14em] text-[#B45309] sm:block">
        {String(index + 1).padStart(2, "0")}
      </span>

      <JobCompanyLogo job={job} company={companyDisplay} />

      <div className="min-w-0">
        <h3 className="m-0 text-base font-black leading-snug tracking-[-0.01em] text-[#1C1C1A] sm:text-xl sm:tracking-[-0.015em]">
          {linkable ? (
            <Link href={href} className="text-inherit no-underline transition hover:text-[#5B4FE8]">
              {title}
            </Link>
          ) : (
            title
          )}
        </h3>
        <JobMetaLine job={job} />
        {chips.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5 sm:mt-3 sm:gap-2">
            {chips.map((chip) => (
              <span
                key={`${slug}-${chip}`}
                className="rounded-full border border-[rgba(180,83,9,0.14)] bg-[#FFFFFF] px-2 py-0.5 text-[11px] font-bold text-[#665A50] sm:px-2.5 sm:py-1 sm:text-xs"
              >
                {chip}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <div className="col-start-3 row-span-2 row-start-1 flex shrink-0 flex-col items-end justify-center gap-2 text-right sm:col-auto sm:row-auto sm:flex-row sm:flex-wrap sm:items-center sm:gap-3 sm:justify-end">
        {linkable ? (
          <Link
            href={href}
            className="inline-flex items-center justify-end gap-1.5 text-xs font-black text-[#5B4FE8] no-underline transition hover:translate-x-0.5 hover:text-[#1A1160] sm:gap-2 sm:text-sm"
          >
            View role
            <FiArrowRight aria-hidden className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </Link>
        ) : null}
        {job?.apply_url ? (
          <a
            href={String(job.apply_url)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-end gap-1.5 text-xs font-black text-[#1A1160] no-underline transition hover:translate-x-0.5 hover:text-[#5B4FE8] sm:gap-2 sm:text-sm"
          >
            Apply
            <FiExternalLink aria-hidden className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </a>
        ) : null}
      </div>
    </article>
  );
}

export default function RoleOpeningsSection({ jobs = [], roleTitle = "role" }) {
  const rootRef = useRef(null);
  const sortMenuRef = useRef(null);
  const sortControlRef = useRef(null);
  const previousVisibleCountRef = useRef(0);
  const previousSortRef = useRef("recent");
  const [sortBy, setSortBy] = useState("recent");
  const [sortOpen, setSortOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const sortedJobs = useMemo(() => {
    return [...jobs].sort((a, b) => {
      if (sortBy === "company") {
        return getPreferredCompanyDisplayName(a).localeCompare(getPreferredCompanyDisplayName(b));
      }
      if (sortBy === "title") {
        return String(a?.title || "").localeCompare(String(b?.title || ""));
      }
      return toTimestamp(b) - toTimestamp(a);
    });
  }, [jobs, sortBy]);

  const visibleJobs = sortedJobs.slice(0, visibleCount);
  const canShowMore = visibleCount < sortedJobs.length;
  const selectedSort = SORT_OPTIONS.find((option) => option.value === sortBy) || SORT_OPTIONS[0];

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [sortBy, jobs.length]);

  useEffect(() => {
    const onClick = (event) => {
      if (sortControlRef.current?.contains(event.target)) return;
      setSortOpen(false);
    };
    window.addEventListener("click", onClick);
    return () => window.removeEventListener("click", onClick);
  }, []);

  useEffect(() => {
    const menu = sortMenuRef.current;
    if (!menu) return undefined;
    gsap.killTweensOf(menu);

    if (sortOpen) {
      gsap.set(menu, { display: "block", pointerEvents: "auto" });
      gsap.fromTo(
        menu,
        { y: -5, scaleY: 0.97, autoAlpha: 0 },
        { y: 0, scaleY: 1, autoAlpha: 1, duration: 0.2, ease: "power2.out" }
      );
    } else {
      gsap.to(menu, {
        y: -5,
        scaleY: 0.97,
        autoAlpha: 0,
        duration: 0.14,
        ease: "power2.inOut",
        pointerEvents: "none",
        onComplete: () => gsap.set(menu, { display: "none" }),
      });
    }

    return undefined;
  }, [sortOpen]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    const rows = root.querySelectorAll("[data-role-opening-row]");
    const previousVisibleCount = previousVisibleCountRef.current;
    const previousSort = previousSortRef.current;
    const rowsToAnimate =
      previousSort === sortBy && visibleJobs.length > previousVisibleCount
        ? Array.from(rows).slice(previousVisibleCount)
        : Array.from(rows);

    previousVisibleCountRef.current = visibleJobs.length;
    previousSortRef.current = sortBy;
    if (rowsToAnimate.length === 0) return undefined;

    gsap.killTweensOf(rowsToAnimate);
    gsap.fromTo(
      rowsToAnimate,
      { y: 12, autoAlpha: 0 },
      {
        y: 0,
        autoAlpha: 1,
        duration: 0.36,
        ease: "power2.out",
        stagger: 0.025,
        clearProps: "transform,opacity,visibility",
      }
    );
    return undefined;
  }, [visibleJobs.length, sortBy]);

  return (
    <section className="py-7" data-role-scroll ref={rootRef}>
      <div className="mb-5 grid gap-4 border-b border-[rgba(180,83,9,0.16)] pb-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div>
          <p className="m-0 text-xs font-black uppercase tracking-[0.12em] text-[#B45309]">
            {new Intl.NumberFormat("en").format(jobs.length)} active jobs
          </p>
          <h2 className="mt-1 mb-0 text-2xl font-black tracking-[-0.02em] text-[#1C1C1A] sm:text-3xl">
            Open opportunities
          </h2>
          <p className="mt-2 mb-0 max-w-xl text-sm font-semibold leading-6 text-[#665A50]">
            Current {String(roleTitle || "role").toLowerCase()} openings from the live hiring feed.
          </p>
        </div>

        <div ref={sortControlRef} className="relative w-full sm:w-[250px]">
          <button
            type="button"
            onClick={() => setSortOpen((open) => !open)}
            className="flex min-h-12 w-full items-center justify-between gap-3 rounded-[8px] border border-[rgba(180,83,9,0.18)] bg-[#FFFFFF] px-4 text-left text-sm font-black text-[#1C1C1A] shadow-[0_10px_24px_rgba(120,53,15,0.05)] transition hover:border-[#5B4FE8]"
            aria-expanded={sortOpen}
            aria-label="Sort role openings"
          >
            <span className="inline-flex items-center gap-3">
              <FiBriefcase aria-hidden className="h-4 w-4 text-[#5B4FE8]" />
              <span className="text-[#665A50]">Sort</span>
              <span>{selectedSort.label}</span>
            </span>
            <FiChevronDown aria-hidden className={`h-4 w-4 text-[#1A1160] transition-transform ${sortOpen ? "rotate-180" : ""}`} />
          </button>
          <div
            ref={sortMenuRef}
            className="pointer-events-none absolute left-0 right-0 z-30 mt-2 hidden origin-top overflow-hidden rounded-[8px] border border-[rgba(180,83,9,0.18)] bg-[#FFFFFF] p-1 opacity-0 shadow-[0_18px_38px_rgba(120,53,15,0.14)]"
          >
            {SORT_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  setSortBy(option.value);
                  setSortOpen(false);
                }}
                className={`flex min-h-10 w-full items-center justify-between rounded-[7px] px-3 text-left text-sm font-bold transition ${
                  sortBy === option.value
                    ? "bg-[#5B4FE8] text-[#FFFFFF]"
                    : "bg-[#FFFFFF] text-[#1C1C1A] hover:bg-[#FFF7ED]"
                }`}
              >
                {option.label}
                {sortBy === option.value ? <FiCheck aria-hidden className="h-4 w-4" /> : null}
              </button>
            ))}
          </div>
        </div>
      </div>

      {visibleJobs.length > 0 ? (
        <>
          <div className="border-t border-[rgba(180,83,9,0.16)]">
            {visibleJobs.map((job, index) => (
              <JobRow key={job?.id != null ? String(job.id) : `${jobSlug(job)}-${index}`} job={job} index={index} />
            ))}
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="m-0 text-sm font-semibold text-[#665A50]">
              Showing {new Intl.NumberFormat("en").format(visibleJobs.length)} of{" "}
              {new Intl.NumberFormat("en").format(sortedJobs.length)} roles, sorted by {selectedSort.label.toLowerCase()}.
            </p>
            {canShowMore ? (
              <button
                type="button"
                onClick={() => setVisibleCount((count) => Math.min(count + PAGE_SIZE, sortedJobs.length))}
                className="inline-flex min-h-11 items-center justify-center rounded-[8px] bg-[#5B4FE8] px-5 text-sm font-black text-[#FFFFFF] transition hover:bg-[#1A1160]"
              >
                Show more roles
              </button>
            ) : null}
          </div>
        </>
      ) : (
        <div className="rounded-[8px] border border-dashed border-[rgba(180,83,9,0.24)] bg-[#FFFFFF] p-8 text-center">
          <p className="m-0 text-lg font-black text-[#1C1C1A]">No open roles found.</p>
          <p className="mx-auto mt-2 mb-0 max-w-md text-sm leading-6 text-[#665A50]">
            This role family has no active listings in the current feed.
          </p>
        </div>
      )}
    </section>
  );
}
