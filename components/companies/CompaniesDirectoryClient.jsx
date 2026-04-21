"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  FiBriefcase,
  FiCheck,
  FiChevronDown,
  FiClock,
  FiFilter,
  FiGlobe,
  FiMapPin,
  FiNavigation,
  FiSearch,
  FiX,
} from "react-icons/fi";
import { getPreferredCompanyLabel } from "@/lib/companyDescriptionMatch";
import { getCompanyDirectoryLogoUrlsForDisplay } from "@/lib/companyPageCopy";
import { companyPagePathFromCompaniesDirectory } from "@/lib/companyPages";

const SORT_OPTIONS = [
  { value: "roles", label: "Most roles" },
  { value: "recent", label: "Recently updated" },
  { value: "alphabetical", label: "A-Z" },
];

const QUICK_LINKS = [
  { href: "/", label: "All jobs", icon: FiGlobe },
  { href: "/location/usa", label: "USA", icon: FiMapPin },
  { href: "/location/germany", label: "Germany", icon: FiMapPin },
  { href: "/location/uk", label: "UK", icon: FiMapPin },
  { href: "/roles", label: "Roles", icon: FiBriefcase },
];

function formatRelativeDays(value) {
  if (!value) return "No recent activity";
  const ts = Date.parse(String(value));
  if (!Number.isFinite(ts)) return "No recent activity";
  const diffDays = Math.max(0, Math.floor((Date.now() - ts) / (24 * 60 * 60 * 1000)));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 14) return `${diffDays} days ago`;
  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks === 1) return "1 week ago";
  if (diffWeeks < 8) return `${diffWeeks} weeks ago`;
  return `${diffDays} days ago`;
}

function formatNumber(value) {
  return new Intl.NumberFormat("en").format(Number(value || 0));
}

function RolesWithRecent({ count, recentCount, compact = false }) {
  const safeCount = Number(count || 0);
  const safeRecentCount = Math.max(0, Number(recentCount || 0));

  return (
    <span className="grid min-w-0 gap-1">
      <span className="flex min-w-0 items-baseline gap-1">
        <span>{formatNumber(safeCount)}</span>
        <span className="text-sm font-bold text-[#777777]">
          Role{safeCount === 1 ? "" : "s"}
        </span>
      </span>
      {safeRecentCount > 0 ? (
        <span className={`${compact ? "" : ""} block text-xs font-bold leading-none text-[#8A8A8A]`}>
          +{formatNumber(safeRecentCount)} in the last 3 days
        </span>
      ) : null}
    </span>
  );
}

function CountUpNumber({ value, durationMs = 1800 }) {
  const target = Math.max(0, Number(value || 0));
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || target === 0) {
      setDisplayValue(target);
      return undefined;
    }

    let animationFrameId = 0;
    const startTime = window.performance.now();
    const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

    const tick = (now) => {
      const progress = Math.min(1, (now - startTime) / durationMs);
      setDisplayValue(Math.round(target * easeOutCubic(progress)));

      if (progress < 1) {
        animationFrameId = window.requestAnimationFrame(tick);
      }
    };

    animationFrameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(animationFrameId);
  }, [durationMs, target]);

  return (
    <span aria-label={formatNumber(target)}>
      {formatNumber(displayValue)}
    </span>
  );
}

function HeroRolesMetric({ count, recentCount }) {
  const safeRecentCount = Math.max(0, Number(recentCount || 0));

  return (
    <>
      <p className="m-0 text-3xl font-bold leading-none text-[#1A1160]">
        <CountUpNumber value={count} />
        <span className="ml-1 text-sm font-bold text-[#777777]">Roles</span>
      </p>
      {safeRecentCount > 0 ? (
        <p className="mt-2 mb-0 text-xs font-bold text-[#8A8A8A]">
          (+{formatNumber(safeRecentCount)} in the last 3 days)
        </p>
      ) : null}
    </>
  );
}

function companyInitial(name) {
  return String(name || "?").trim().charAt(0).toUpperCase() || "?";
}

function cleanSectorLabel(value) {
  return String(value || "").replace(/^Sector:\s*/i, "").trim() || "Unclassified";
}

function CompanyMark({ company, logoUrls }) {
  const [failedPrimary, setFailedPrimary] = useState(false);
  const [failedFallback, setFailedFallback] = useState(false);
  const primaryUrl = logoUrls?.primaryUrl || null;
  const fallbackUrl = logoUrls?.fallbackUrl || null;
  const src = !failedPrimary && primaryUrl ? primaryUrl : !failedFallback && fallbackUrl ? fallbackUrl : null;

  useLayoutEffect(() => {
    setFailedPrimary(false);
    setFailedFallback(false);
  }, [primaryUrl, fallbackUrl]);

  return (
    <span
      className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-[10px] border border-[rgba(0,0,0,0.08)] bg-[#EDE9FF] text-sm font-bold text-[#1A1160] sm:h-12 sm:w-12 sm:rounded-[12px] sm:text-base"
      aria-label={`Logo for ${company}`}
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

function CompanyCard({ company, companyPagesEnabled }) {
  const isActiveCompany = company.roleCount > 0;
  const displayName = getPreferredCompanyLabel(company.name);
  const logoUrls = getCompanyDirectoryLogoUrlsForDisplay(company.name);
  const sectorLabel = cleanSectorLabel(company.directorySectorLabel);
  const updatedLabel = formatRelativeDays(company.lastSeenAt);
  const recentRoleCount = Number(company.recentRoleCount || 0);
  const allowCompanyLink = companyPagesEnabled && isActiveCompany;

  const content = (
    <>
      <div className="flex min-w-0 items-center gap-3">
        <CompanyMark company={displayName} logoUrls={logoUrls} />
        <div className="min-w-0 flex-1">
          <h2 className="m-0 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-base font-bold text-[#1C1C1A] sm:text-lg">
            {displayName}
          </h2>
          <p className="mt-0.5 mb-0 overflow-hidden text-ellipsis whitespace-nowrap text-sm text-[#666666] sm:mt-1">
            {sectorLabel}
          </p>
          <p className="mt-1 mb-0 flex items-center gap-1 overflow-hidden text-ellipsis whitespace-nowrap text-xs font-medium text-[#8A8A8A] sm:hidden">
            <FiClock aria-hidden className="h-3.5 w-3.5 shrink-0 text-[#A3A3A3]" />
            <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
              {updatedLabel}
            </span>
            {allowCompanyLink ? (
              <>
                <span aria-hidden className="text-[#C7C7C7]">/</span>
                <span className="text-sm font-bold text-[#5B4FE8]">See Live Jobs</span>
              </>
            ) : null}
          </p>
        </div>
        <div className="ml-2 flex shrink-0 items-baseline gap-1 text-right sm:hidden">
          <span className="text-sm font-bold leading-none text-[#0F172A]">
            {formatNumber(company.roleCount)}
          </span>
          <span className="text-xs font-bold leading-none text-[#777777]">
            role{company.roleCount === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      {recentRoleCount > 0 ? (
        <p className="mt-2 mb-0 text-xs font-medium leading-5 text-[#8A8A8A] sm:hidden">
          +{formatNumber(recentRoleCount)} in the last 3 days
        </p>
      ) : null}

      <div className="hidden min-h-[54px] items-end justify-between gap-4 sm:mt-auto sm:flex">
        <div className="min-w-0">
          <p className="m-0 text-xl font-bold text-[#0F172A] sm:text-2xl">
            <RolesWithRecent count={company.roleCount} recentCount={recentRoleCount} />
          </p>
        </div>
        <span className="grid shrink-0 justify-items-end gap-1 text-right text-xs font-medium text-[#8A8A8A]">
          <span className="inline-flex items-center gap-1">
            <FiClock aria-hidden className="h-3.5 w-3.5 shrink-0 text-[#A3A3A3]" />
            {updatedLabel}
          </span>
          {allowCompanyLink ? (
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="text-[#C7C7C7]">/</span>
              <span className="text-sm font-bold text-[#5B4FE8]">See Live Jobs</span>
            </span>
          ) : null}
        </span>
      </div>
    </>
  );

  const className = [
    "flex h-full min-h-[168px] min-w-0 flex-col rounded-[12px] border border-[rgba(0,0,0,0.08)] bg-[#FFFFFF] px-3 py-2.5 text-[#1C1C1A] no-underline transition-colors sm:p-4",
    "hover:bg-[#EDE9FF] focus:outline-none focus:ring-2 focus:ring-[#5B4FE8] focus:ring-offset-2 focus:ring-offset-[#FFFFFF]",
  ].join(" ");

  if (allowCompanyLink) {
    return (
      <Link
        href={companyPagePathFromCompaniesDirectory(company.name)}
        className={className}
        title={company.statusDetail || undefined}
        data-company-card
      >
        {content}
      </Link>
    );
  }

  return (
    <article className={className} title={company.statusDetail || undefined} data-company-card>
      {content}
    </article>
  );
}

function LoadingCompanyCard() {
  return (
    <div className="rounded-[12px] border border-[rgba(0,0,0,0.08)] bg-[#FFFFFF] px-3 py-2.5 sm:p-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className="h-10 w-10 shrink-0 animate-pulse rounded-[10px] bg-[#EDE9FF] sm:h-12 sm:w-12 sm:rounded-[12px]" />
        <div className="min-w-0 flex-1">
          <div className="h-4 w-3/4 animate-pulse rounded-[8px] bg-[#EDE9FF]" />
          <div className="mt-2 h-3 w-1/2 animate-pulse rounded-[8px] bg-[#EDE9FF]" />
        </div>
        <div className="h-4 w-12 shrink-0 animate-pulse rounded-[8px] bg-[#EDE9FF] sm:hidden" />
      </div>
      <div className="mt-5 hidden items-end justify-between sm:flex">
        <div>
          <div className="h-7 w-14 animate-pulse rounded-[8px] bg-[#EDE9FF]" />
          <div className="mt-2 h-3 w-20 animate-pulse rounded-[8px] bg-[#EDE9FF]" />
        </div>
        <div className="h-4 w-12 animate-pulse rounded-[8px] bg-[#EDE9FF]" />
      </div>
    </div>
  );
}

/**
 * @param {{
 *  companies: Array<{
 *    name: string,
 *    roleCount: number,
 *    recentRoleCount?: number,
 *    lastSeenAt: string | null,
 *    dominantSectorId?: string | null,
 *    dominantSectorTitle?: string | null,
 *    dominantSectorGradient?: string | null,
 *    sectorDots?: Array<{ id: string, title: string, gradient: string }>,
 *    directorySectorLabel?: string | null,
 *    companyStatus?: string | null,
 *    statusLabel?: string | null,
 *    statusDetail?: string | null,
 *    hasKnownSource?: boolean,
 *    hasActiveJobs?: boolean,
 *  }>,
 *  companyPagesEnabled: boolean,
 *  stats?: {
 *    liveRoles: number,
 *    recentRoles?: number,
 *    lifetimeRoles: number,
 *    trackedCompanies: number,
 *    activeCompanies: number,
 *  },
 * }} props
 */
export default function CompaniesDirectoryClient({
  companies,
  companyPagesEnabled,
  stats,
}) {
  const rootRef = useRef(null);
  const searchTimeoutRef = useRef(null);
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState("roles");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return companies
      .filter((item) => {
        if (!q) return true;
        return item.name.toLowerCase().includes(q);
      })
      .sort((a, b) => {
        if (sortBy === "alphabetical") return a.name.localeCompare(b.name);
        if (sortBy === "recent") {
          const at = Date.parse(String(a.lastSeenAt || ""));
          const bt = Date.parse(String(b.lastSeenAt || ""));
          const av = Number.isFinite(at) ? at : 0;
          const bv = Number.isFinite(bt) ? bt : 0;
          return bv - av;
        }
        return b.roleCount - a.roleCount || a.name.localeCompare(b.name);
      });
  }, [companies, query, sortBy]);

  useEffect(() => {
    if (!rootRef.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    gsap.registerPlugin(ScrollTrigger);
    const context = gsap.context(() => {
      const q = gsap.utils.selector(rootRef);

      gsap.fromTo(
        q("[data-hero-word]"),
        { yPercent: 82, autoAlpha: 0 },
        {
          yPercent: 0,
          autoAlpha: 1,
          duration: 0.8,
          ease: "power3.out",
          stagger: 0.065,
          delay: 0.08,
          clearProps: "transform,opacity,visibility",
        }
      );

      gsap.fromTo(
        q("[data-stat-item]"),
        { y: 14, autoAlpha: 0 },
        {
          y: 0,
          autoAlpha: 1,
          duration: 0.58,
          ease: "power2.out",
          stagger: 0.07,
          delay: 0.2,
          clearProps: "transform,opacity,visibility",
        }
      );

      q("[data-companies-reveal]").forEach((element) => {
        gsap.set(element, { y: 24, autoAlpha: 0 });
        gsap.to(element, {
          y: 0,
          autoAlpha: 1,
          duration: 0.72,
          ease: "power2.out",
          clearProps: "transform,opacity,visibility",
          scrollTrigger: {
            trigger: element,
            start: "top 88%",
            once: true,
          },
        });
      });

      gsap.fromTo(
        q("[data-directory-link]"),
        { x: -12, autoAlpha: 0 },
        {
          x: 0,
          autoAlpha: 1,
          duration: 0.48,
          ease: "power2.out",
          stagger: 0.045,
          clearProps: "transform,opacity,visibility",
          scrollTrigger: {
            trigger: q("[data-directory-links]")[0],
            start: "top 92%",
            once: true,
          },
        }
      );

      ScrollTrigger.refresh();
    }, rootRef);

    return () => context.revert();
  }, []);

  useEffect(() => {
    if (
      !rootRef.current ||
      searchLoading ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    gsap.registerPlugin(ScrollTrigger);
    const context = gsap.context(() => {
      const q = gsap.utils.selector(rootRef);
      const cards = q("[data-company-card]");

      gsap.set(cards, { y: 24, autoAlpha: 0 });

      ScrollTrigger.batch(cards, {
        start: "top 92%",
        once: true,
        onEnter: (batch) => {
          gsap.to(batch, {
            y: 0,
            autoAlpha: 1,
            duration: 0.62,
            ease: "power2.out",
            stagger: 0.04,
            overwrite: "auto",
            clearProps: "transform,opacity,visibility",
          });
        },
      });

      ScrollTrigger.refresh();
    }, rootRef);

    return () => context.revert();
  }, [filtered.length, searchLoading, sortBy, query]);

  const activeStats = stats || {
    liveRoles: companies.reduce((sum, company) => sum + company.roleCount, 0),
    recentRoles: companies.reduce((sum, company) => sum + Number(company.recentRoleCount || 0), 0),
    lifetimeRoles: companies.reduce((sum, company) => sum + company.roleCount, 0),
    trackedCompanies: companies.length,
    activeCompanies: companies.filter((company) => company.roleCount > 0).length,
  };
  const selectedSort = SORT_OPTIONS.find((option) => option.value === sortBy) || SORT_OPTIONS[0];
  const skeletonCount = Math.max(6, Math.min(12, filtered.length || companies.length || 6));

  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) window.clearTimeout(searchTimeoutRef.current);
    };
  }, []);

  const submitSearch = () => {
    if (searchLoading) return;
    const nextQuery = queryInput.trim();
    if (searchTimeoutRef.current) window.clearTimeout(searchTimeoutRef.current);
    setSearchLoading(true);
    searchTimeoutRef.current = window.setTimeout(() => {
      setQuery(nextQuery);
      setSearchLoading(false);
      searchTimeoutRef.current = null;
    }, 1000);
  };

  const clearSearch = () => {
    if (searchTimeoutRef.current) window.clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = null;
    setQueryInput("");
    setQuery("");
    setSearchLoading(false);
  };

  return (
    <div ref={rootRef} className="mx-auto w-full max-w-[1180px] overflow-x-hidden px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-12">
      <section className="py-4 sm:py-6 lg:py-8" data-companies-reveal>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-end">
          <div className="max-w-3xl">
            <Link
              href="/"
              className="hidden items-center gap-2 rounded-[8px] bg-[#EDE9FF] px-5 py-2 text-sm font-bold text-[#1A1160] no-underline transition-colors hover:bg-[#5B4FE8] hover:text-[#FFFFFF] focus:outline-none focus:ring-2 focus:ring-[#5B4FE8] focus:ring-offset-2 focus:ring-offset-[#FFFFFF] sm:inline-flex"
            >
              <FiNavigation aria-hidden className="h-4 w-4" />
              Back to jobs
            </Link>
            <p className="mt-6 mb-3 text-sm font-bold uppercase text-[#5B4FE8]">
              Company directory
            </p>
            <h1 className="m-0 text-3xl font-bold leading-tight text-[#1C1C1A] sm:text-5xl">
              <span className="inline-block overflow-hidden align-bottom">
                <span className="inline-block" data-hero-word>
                  Explore
                </span>
              </span>{" "}
              <span className="inline-block overflow-hidden align-bottom">
                <span className="inline-block" data-hero-word>
                  drone
                </span>
              </span>{" "}
              <span className="inline-block overflow-hidden align-bottom">
                <span className="inline-block" data-hero-word>
                  companies
                </span>
              </span>{" "}
              <span className="inline-block overflow-hidden align-bottom text-[#5B4FE8]">
                <span className="inline-block" data-hero-word>
                  hiring now
                </span>
              </span>
            </h1>
            <p className="mt-3 mb-0 max-w-2xl text-sm leading-6 text-[#666666] sm:mt-4 sm:text-lg sm:leading-7">
              Browse tracked drone, UAV, autonomy, flight test, and aerospace employers with live
              roles from the DroneRoles sourcing directory.
            </p>
          </div>

          <div className="hidden grid-cols-2 gap-x-6 gap-y-5 border-t border-[rgba(0,0,0,0.08)] pt-5 sm:grid lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
            <div data-stat-item>
              <HeroRolesMetric count={activeStats.liveRoles} recentCount={activeStats.recentRoles} />
              <p className="m-0 text-sm text-[#666666]">Live Roles</p>
            </div>
            <div data-stat-item>
              <p className="m-0 text-3xl font-bold text-[#3B365D]"><CountUpNumber value={activeStats.lifetimeRoles} /></p>
              <p className="m-0 text-sm text-[#666666]">Lifetime Roles</p>
            </div>
            <div data-stat-item>
              <p className="m-0 text-3xl font-bold text-[#5B4FE8]"><CountUpNumber value={activeStats.trackedCompanies} /></p>
              <p className="m-0 text-sm text-[#666666]">Tracked Companies</p>
            </div>
            <div data-stat-item>
              <p className="m-0 text-3xl font-bold text-[#2A225C]"><CountUpNumber value={activeStats.activeCompanies} /></p>
              <p className="m-0 text-sm text-[#666666]">Active Companies</p>
            </div>
          </div>
        </div>
      </section>

      <nav className="mt-5 flex gap-2 overflow-x-auto px-0.5 py-1" aria-label="Company directory shortcuts" data-companies-reveal data-directory-links>
        {QUICK_LINKS.map((link) => {
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-[20px] border border-[#EDE9FF] bg-[#EDE9FF] px-4 py-2 text-sm font-bold text-[#1A1160] no-underline transition-colors hover:border-[#5B4FE8] hover:bg-[#5B4FE8] hover:text-[#FFFFFF] active:border-[#5B4FE8] active:bg-[#5B4FE8] active:text-[#FFFFFF] focus:outline-none focus-visible:border-[#5B4FE8] focus-visible:shadow-[0_0_0_2px_#5B4FE8_inset]"
              data-directory-link
            >
              <Icon aria-hidden className="h-4 w-4" />
              {link.label}
            </Link>
          );
        })}
      </nav>

      <section className="mt-6 border-y border-[rgba(0,0,0,0.08)] py-4" data-companies-reveal data-filter-panel>
        <div className="flex items-center justify-between gap-3 sm:hidden">
          <div>
            <p className="m-0 text-sm font-bold text-[#1C1C1A]">Find companies</p>
            <p className="m-0 text-xs text-[#666666]">
              Search and sort {formatNumber(filtered.length)} results
            </p>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-[8px] bg-[#5B4FE8] px-5 py-2 text-sm font-bold text-[#FFFFFF] transition-colors hover:bg-[#1A1160] focus:outline-none focus:ring-2 focus:ring-[#5B4FE8] focus:ring-offset-2 focus:ring-offset-[#FFFFFF]"
            aria-expanded={mobileFiltersOpen}
            aria-controls="company-mobile-filters"
            onClick={() => setMobileFiltersOpen((open) => !open)}
          >
            <FiFilter aria-hidden className="h-4 w-4" />
            Filter
          </button>
        </div>

        <div
          id="company-mobile-filters"
          className={`${mobileFiltersOpen ? "grid" : "hidden"} mt-4 gap-3 sm:mt-0 sm:grid sm:grid-cols-[minmax(0,1fr)_220px] sm:items-end lg:grid-cols-[minmax(0,1fr)_240px]`}
        >
          <form
            className="grid gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              submitSearch();
            }}
          >
            <label className="block">
              <span className="mb-2 block text-sm font-bold text-[#1C1C1A]">Search companies</span>
              <span className="flex h-12 overflow-hidden rounded-[8px] border border-[rgba(0,0,0,0.08)] bg-[#FFFFFF] transition-colors focus-within:border-[#5B4FE8]">
                <span className="flex w-11 shrink-0 items-center justify-center text-[#5B4FE8]">
                  <FiSearch aria-hidden className="h-4 w-4" />
                </span>
                <input
                  type="text"
                  className="min-w-0 flex-1 appearance-none border-0 bg-[#FFFFFF] px-1 text-base text-[#1C1C1A] placeholder:text-[#666666] focus:outline-none"
                  value={queryInput}
                  onChange={(e) => setQueryInput(e.target.value)}
                  placeholder="Search by company name"
                  aria-label="Search companies"
                />
                {queryInput || query ? (
                  <button
                    type="button"
                    className="inline-flex shrink-0 items-center gap-1 px-3 text-xs font-bold text-[#1A1160] transition-colors hover:text-[#5B4FE8] focus:outline-none"
                    onClick={clearSearch}
                    aria-label="Clear company search"
                  >
                    <FiX aria-hidden className="h-4 w-4" />
                    Clear
                  </button>
                ) : null}
                <button
                  type="submit"
                  className="shrink-0 bg-[#5B4FE8] px-5 text-sm font-bold text-[#FFFFFF] transition-colors hover:bg-[#1A1160] disabled:cursor-wait disabled:bg-[#1A1160]"
                  disabled={searchLoading}
                >
                  {searchLoading ? "..." : "Search"}
                </button>
              </span>
            </label>
          </form>

          <div className="relative">
            <span className="mb-2 block text-sm font-bold text-[#1C1C1A]">Sort companies</span>
            <button
              type="button"
              className="flex h-12 w-full items-center justify-between gap-3 rounded-[8px] border border-[rgba(0,0,0,0.08)] bg-[#FFFFFF] px-4 text-left text-sm font-bold text-[#1C1C1A] transition-colors hover:border-[#5B4FE8] focus:border-[#5B4FE8] focus:outline-none focus:ring-2 focus:ring-[#5B4FE8] sm:text-base"
              aria-label="Sort companies"
              aria-haspopup="listbox"
              aria-expanded={sortMenuOpen}
              onClick={() => setSortMenuOpen((open) => !open)}
            >
              <span>{selectedSort.label}</span>
              <FiChevronDown
                aria-hidden
                className={`h-5 w-5 shrink-0 text-[#5B4FE8] transition-transform ${
                  sortMenuOpen ? "rotate-180" : ""
                }`}
              />
            </button>
            {sortMenuOpen ? (
              <div
                role="listbox"
                className="absolute right-0 top-[calc(100%+8px)] z-30 w-full overflow-hidden rounded-[8px] border border-[rgba(0,0,0,0.08)] bg-[#FFFFFF] shadow-[0_16px_36px_rgba(28,28,26,0.12)]"
              >
                {SORT_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={sortBy === option.value}
                    className={`flex min-h-11 w-full items-center justify-between gap-3 px-4 py-2 text-left text-sm font-bold transition-colors ${
                      sortBy === option.value
                        ? "bg-[#5B4FE8] text-[#FFFFFF]"
                        : "bg-[#FFFFFF] text-[#1C1C1A] hover:bg-[#EDE9FF]"
                    }`}
                    onClick={() => {
                      setSortBy(option.value);
                      setSortMenuOpen(false);
                    }}
                  >
                    <span>{option.label}</span>
                    {sortBy === option.value ? <FiCheck aria-hidden className="h-4 w-4" /> : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="mt-6" aria-live="polite" data-companies-reveal>
        <div className="mb-3 flex flex-col gap-1 sm:mb-4 sm:flex-row sm:items-end sm:justify-between sm:gap-2">
          <div>
            <p className="m-0 text-sm font-bold text-[#5B4FE8]">
              {searchLoading ? "Searching..." : `${formatNumber(filtered.length)} result${filtered.length === 1 ? "" : "s"}`}
            </p>
            <h2 className="m-0 text-xl font-bold text-[#1C1C1A] sm:text-2xl">Company matches</h2>
          </div>
          <p className="m-0 text-xs text-[#666666] sm:text-sm">Updated from live searchable roles.</p>
        </div>

        <div className="grid min-w-0 gap-4 max-[640px]:px-1 sm:grid-cols-2 xl:grid-cols-3" data-companies-grid>
          {searchLoading
            ? Array.from({ length: skeletonCount }).map((_, index) => (
                <LoadingCompanyCard key={`search-loading-${index}`} />
              ))
            : filtered.map((company) => (
                <CompanyCard
                  key={company.name}
                  company={company}
                  companyPagesEnabled={companyPagesEnabled}
                />
              ))}
        </div>

        {!searchLoading && filtered.length === 0 ? (
          <div className="rounded-[12px] border border-[rgba(0,0,0,0.08)] bg-[#EDE9FF] p-5 text-[#1A1160]">
            No companies match your filters.
          </div>
        ) : null}
      </section>
    </div>
  );
}
