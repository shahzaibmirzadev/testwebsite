"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  FiBriefcase,
  FiCheck,
  FiChevronDown,
  FiChevronUp,
  FiClock,
  FiCompass,
  FiFilter,
  FiGlobe,
  FiMapPin,
  FiNavigation,
  FiSearch,
  FiTrendingUp,
  FiUsers,
  FiX,
} from "react-icons/fi";
import { getLocationPagePath } from "@/lib/locationPages";

const SORT_OPTIONS = [
  { value: "roles", label: "Most roles" },
  { value: "recent", label: "Recently active" },
  { value: "alphabetical", label: "A-Z" },
];

const QUICK_LINKS = [
  { href: "/", label: "All jobs", icon: FiGlobe },
  { href: "/location/usa", label: "USA", icon: FiMapPin },
  { href: "/location/germany", label: "Germany", icon: FiMapPin },
  { href: "/location/uk", label: "UK", icon: FiMapPin },
  { href: "/roles", label: "Roles", icon: FiBriefcase },
];

const LOCATION_DIRECTORY_FLAG_URLS = {
  germany: "https://flagcdn.com/w80/de.png",
  uk: "https://flagcdn.com/w80/gb-eng.png",
  usa: "https://flagcdn.com/w80/us.png",
  france: "https://flagcdn.com/w80/fr.png",
  netherlands: "https://flagcdn.com/w80/nl.png",
  canada: "https://flagcdn.com/w80/ca.png",
  australia: "https://flagcdn.com/w80/au.png",
  spain: "https://flagcdn.com/w80/es.png",
  italy: "https://flagcdn.com/w80/it.png",
  india: "https://flagcdn.com/w80/in.png",
  europe: "https://flagcdn.com/w80/eu.png",
};

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

function RolesWithRecent({ count, recentCount }) {
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
        <span className="block text-xs font-black leading-none" style={{ color: "#0F766E" }}>
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
      if (progress < 1) animationFrameId = window.requestAnimationFrame(tick);
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
      <p className="m-0 text-3xl font-bold leading-none text-[#374151]">
        <CountUpNumber value={count} />
        <span className="ml-1 text-sm font-bold text-[#777777]">Roles</span>
      </p>
      {safeRecentCount > 0 ? (
        <p className="mt-2 mb-0 text-xs font-black" style={{ color: "#0F766E" }}>
          (+{formatNumber(safeRecentCount)} in the last 3 days)
        </p>
      ) : null}
    </>
  );
}

function directoryFlagUrlForSlug(slug) {
  const key = String(slug || "").trim().toLowerCase();
  return LOCATION_DIRECTORY_FLAG_URLS[key] ?? null;
}

function locationInitial(name) {
  return String(name || "?").trim().charAt(0).toUpperCase() || "?";
}

function LocationMark({ slug, name }) {
  const flagUrl = directoryFlagUrlForSlug(slug);
  const flagLabel =
    slug === "uk" ? "England flag" : slug === "europe" ? "European Union flag" : `${name} flag`;

  return (
    <span
      className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-[10px] border border-[rgba(180,83,9,0.16)] bg-[#FFF7ED] text-sm font-bold text-[#78350F] sm:h-12 sm:w-12 sm:rounded-[12px] sm:text-base"
      aria-label={flagUrl ? flagLabel : `${name} location`}
      role="img"
    >
      {flagUrl ? (
        <img
          src={flagUrl}
          alt=""
          className="block h-full w-full bg-[#FFFFFF] object-cover"
          loading="lazy"
          decoding="async"
        />
      ) : (
        <span aria-hidden>{locationInitial(name)}</span>
      )}
    </span>
  );
}

function LocationCard({ location }) {
  const updatedLabel = formatRelativeDays(location.lastSeenAt);
  const roleCount = Number(location.roleCount || 0);
  const recentRoleCount = Number(location.recentRoleCount || 0);

  return (
    <Link
      href={getLocationPagePath(location.slug)}
      className="group flex h-full min-h-[168px] min-w-0 flex-col rounded-[12px] border border-[rgba(0,0,0,0.08)] bg-[#FFFFFF] px-3 py-2.5 text-[#1C1C1A] no-underline transition-colors hover:border-[rgba(180,83,9,0.24)] hover:bg-[#FFF7ED] focus:outline-none focus:ring-2 focus:ring-[#B45309] focus:ring-offset-2 focus:ring-offset-[#FFFFFF] sm:p-4"
      data-location-card
    >
      <div className="flex min-w-0 items-center gap-3">
        <LocationMark slug={location.slug} name={location.name} />
        <div className="min-w-0 flex-1">
          <h2 className="m-0 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-base font-bold text-[#1C1C1A] sm:text-lg">
            {location.name}
          </h2>
          <p className="mt-0.5 mb-0 overflow-hidden text-ellipsis whitespace-nowrap text-sm text-[#666666] sm:mt-1">
            {location.directoryRolesLabel || "Active drone and UAV roles"}
          </p>
          <p className="mt-1 mb-0 flex items-center gap-1 overflow-hidden text-ellipsis whitespace-nowrap text-xs font-medium text-[#8A8A8A] sm:hidden">
            <FiClock aria-hidden className="h-3.5 w-3.5 shrink-0 text-[#A3A3A3]" />
            <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
              {updatedLabel}
            </span>
            <span aria-hidden className="text-[#C7C7C7]">/</span>
            <span className="font-bold text-[#B45309]">View</span>
          </p>
        </div>
        <div className="ml-2 flex shrink-0 items-baseline gap-1 text-right sm:hidden">
          <span className="text-sm font-bold leading-none text-[#0F172A]">
            {formatNumber(roleCount)}
          </span>
          <span className="text-xs font-bold leading-none text-[#777777]">
            role{roleCount === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      {recentRoleCount > 0 ? (
        <p className="mt-2 mb-0 text-xs font-black leading-5 sm:hidden" style={{ color: "#0F766E" }}>
          +{formatNumber(recentRoleCount)} in the last 3 days
        </p>
      ) : null}

      <div className="hidden min-h-[54px] items-end justify-between gap-4 sm:mt-auto sm:flex">
        <div className="min-w-0">
          <p className="m-0 text-xl font-bold text-[#0F172A] sm:text-2xl">
            <RolesWithRecent count={roleCount} recentCount={recentRoleCount} />
          </p>
        </div>
        <span className="grid shrink-0 justify-items-end gap-1 text-right text-xs font-medium text-[#8A8A8A]">
          <span className="inline-flex items-center gap-1">
            <FiClock aria-hidden className="h-3.5 w-3.5 shrink-0 text-[#A3A3A3]" />
            {updatedLabel}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="text-[#C7C7C7]">/</span>
            <span className="text-sm font-bold text-[#B45309]">View</span>
          </span>
        </span>
      </div>
    </Link>
  );
}

function LoadingLocationCard() {
  return (
    <div className="rounded-[12px] border border-[rgba(0,0,0,0.08)] bg-[#FFFFFF] px-3 py-2.5 sm:p-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className="h-10 w-10 shrink-0 animate-pulse rounded-[10px] bg-[#FFF7ED] sm:h-12 sm:w-12 sm:rounded-[12px]" />
        <div className="min-w-0 flex-1">
          <div className="h-4 w-3/4 animate-pulse rounded-[8px] bg-[#FFF7ED]" />
          <div className="mt-2 h-3 w-1/2 animate-pulse rounded-[8px] bg-[#FFF7ED]" />
        </div>
        <div className="h-4 w-12 shrink-0 animate-pulse rounded-[8px] bg-[#FFF7ED] sm:hidden" />
      </div>
      <div className="mt-5 hidden items-end justify-between sm:flex">
        <div>
          <div className="h-7 w-14 animate-pulse rounded-[8px] bg-[#FFF7ED]" />
          <div className="mt-2 h-3 w-20 animate-pulse rounded-[8px] bg-[#FFF7ED]" />
        </div>
        <div className="h-4 w-14 animate-pulse rounded-[8px] bg-[#FFF7ED]" />
      </div>
    </div>
  );
}

/**
 * @param {{
 *  locations: Array<{
 *    slug: string,
 *    name: string,
 *    roleCount: number,
 *    lastSeenAt: string | null,
 *    directoryRolesLabel: string,
 *  }>,
 *  stats?: {
 *    activeJobs: number,
 *    recentActiveJobs?: number,
 *    companiesHiring: number,
 *    freshThisWeek: number,
 *    topRoleTypeLabel: string,
 *    topRoleTypeCount: number,
 *  },
 * }} props
 */
export default function LocationsDirectoryClient({ locations, stats }) {
  const rootRef = useRef(null);
  const searchTimeoutRef = useRef(null);
  const mobileFiltersRef = useRef(null);
  const sortMenuRef = useRef(null);
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState("roles");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return locations
      .filter((item) => {
        if (!q) return true;
        return (
          item.name.toLowerCase().includes(q) ||
          String(item.directoryRolesLabel || "").toLowerCase().includes(q)
        );
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
  }, [locations, query, sortBy]);

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

      q("[data-locations-reveal]").forEach((element) => {
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
    const panel = mobileFiltersRef.current;
    if (!panel) return undefined;

    const isMobile = window.matchMedia("(max-width: 639px)").matches;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    gsap.killTweensOf(panel);

    if (!isMobile) {
      gsap.set(panel, {
        clearProps: "height,opacity,visibility,transform,pointerEvents,overflow",
      });
      return undefined;
    }

    if (reduceMotion) {
      gsap.set(panel, {
        height: mobileFiltersOpen ? "auto" : 0,
        autoAlpha: mobileFiltersOpen ? 1 : 0,
        pointerEvents: mobileFiltersOpen ? "auto" : "none",
      });
      return undefined;
    }

    if (mobileFiltersOpen) {
      gsap.set(panel, { height: "auto", autoAlpha: 1, pointerEvents: "auto" });
      const panelHeight = panel.offsetHeight;
      gsap.fromTo(
        panel,
        { height: 0, y: -8, autoAlpha: 0 },
        {
          height: panelHeight,
          y: 0,
          autoAlpha: 1,
          duration: 0.32,
          ease: "power3.out",
          overflow: "visible",
          pointerEvents: "auto",
        }
      );
    } else {
      gsap.to(panel, {
        height: 0,
        y: -8,
        autoAlpha: 0,
        duration: 0.24,
        ease: "power2.inOut",
        pointerEvents: "none",
      });
    }

    return undefined;
  }, [mobileFiltersOpen]);

  useEffect(() => {
    const menu = sortMenuRef.current;
    if (!menu) return undefined;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const items = menu.querySelectorAll("[data-sort-option]");
    gsap.killTweensOf([menu, items]);

    if (reduceMotion) {
      gsap.set(menu, {
        autoAlpha: sortMenuOpen ? 1 : 0,
        y: sortMenuOpen ? 0 : -6,
        pointerEvents: sortMenuOpen ? "auto" : "none",
      });
      return undefined;
    }

    if (sortMenuOpen) {
      gsap.fromTo(
        menu,
        { y: -8, scale: 0.98, autoAlpha: 0 },
        {
          y: 0,
          scale: 1,
          autoAlpha: 1,
          duration: 0.22,
          ease: "power2.out",
          pointerEvents: "auto",
        }
      );
      gsap.fromTo(
        items,
        { y: 6, autoAlpha: 0 },
        {
          y: 0,
          autoAlpha: 1,
          duration: 0.22,
          ease: "power2.out",
          stagger: 0.035,
          delay: 0.04,
        }
      );
    } else {
      gsap.to(menu, {
        y: -6,
        scale: 0.98,
        autoAlpha: 0,
        duration: 0.16,
        ease: "power2.in",
        pointerEvents: "none",
      });
    }

    return undefined;
  }, [sortMenuOpen]);

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
      const cards = q("[data-location-card]");

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
    activeJobs: locations.reduce((sum, location) => sum + location.roleCount, 0),
    recentActiveJobs: locations.reduce((sum, location) => sum + Number(location.recentRoleCount || 0), 0),
    companiesHiring: 0,
    freshThisWeek: 0,
    topRoleTypeLabel: "",
    topRoleTypeCount: 0,
  };
  const selectedSort = SORT_OPTIONS.find((option) => option.value === sortBy) || SORT_OPTIONS[0];
  const skeletonCount = Math.max(6, Math.min(12, filtered.length || locations.length || 6));
  const topRoleLabel = activeStats.topRoleTypeLabel
    ? `${activeStats.topRoleTypeLabel}`
    : "Role types";

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
    }, 650);
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
      <section className="py-4 sm:py-6 lg:py-8" data-locations-reveal>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-end">
          <div className="max-w-3xl">
            <Link
              href="/"
              className="hidden items-center gap-2 rounded-[8px] bg-[#FFF7ED] px-5 py-2 text-sm font-bold text-[#78350F] no-underline transition-colors hover:bg-[#B45309] hover:text-[#FFFFFF] focus:outline-none focus:ring-2 focus:ring-[#B45309] focus:ring-offset-2 focus:ring-offset-[#FFFFFF] sm:inline-flex"
            >
              <FiNavigation aria-hidden className="h-4 w-4" />
              Back to jobs
            </Link>
            <p className="mt-6 mb-3 text-sm font-bold uppercase text-[#B45309]">
              Location directory
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
                  jobs
                </span>
              </span>{" "}
              <span className="inline-block overflow-hidden align-bottom text-[#B45309]">
                <span className="inline-block" data-hero-word>
                  by location
                </span>
              </span>
            </h1>
            <p className="mt-3 mb-0 max-w-2xl text-sm leading-6 text-[#666666] sm:mt-4 sm:text-lg sm:leading-7">
              Browse active drone, UAV, autonomy, flight test, and aerospace roles by market,
              region, and hiring footprint.
            </p>
          </div>

          <div className="hidden grid-cols-2 gap-x-6 gap-y-5 border-t border-[rgba(0,0,0,0.08)] pt-5 sm:grid lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
            <div data-stat-item>
              <p className="m-0 text-3xl font-bold text-[#B45309]">
                <CountUpNumber value={locations.length} />
              </p>
              <p className="m-0 text-sm text-[#666666]">Active Locations</p>
            </div>
            <div data-stat-item>
              <HeroRolesMetric count={activeStats.activeJobs} recentCount={activeStats.recentActiveJobs} />
              <p className="m-0 text-sm text-[#666666]">Live Roles</p>
            </div>
            <div data-stat-item>
              <p className="m-0 text-3xl font-bold text-[#B45309]">
                <CountUpNumber value={activeStats.companiesHiring} />
              </p>
              <p className="m-0 text-sm text-[#666666]">Companies Hiring</p>
            </div>
            <div data-stat-item>
              <p className="m-0 text-3xl font-bold text-[#92400E]">
                <CountUpNumber value={activeStats.freshThisWeek} />
              </p>
              <p className="m-0 text-sm text-[#666666]">Fresh This Week</p>
            </div>
          </div>
        </div>
      </section>

      <nav className="mt-5 flex gap-2 overflow-x-auto px-0.5 py-1" aria-label="Location directory shortcuts" data-locations-reveal data-directory-links>
        {QUICK_LINKS.map((link) => {
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-[20px] border border-[#FED7AA] bg-[#FFF7ED] px-4 py-2 text-sm font-bold text-[#78350F] no-underline transition-colors hover:border-[#B45309] hover:bg-[#B45309] hover:text-[#FFFFFF] active:border-[#B45309] active:bg-[#B45309] active:text-[#FFFFFF] focus:outline-none focus-visible:border-[#B45309] focus-visible:shadow-[0_0_0_2px_#B45309_inset]"
              data-directory-link
            >
              <Icon aria-hidden className="h-4 w-4" />
              {link.label}
            </Link>
          );
        })}
      </nav>

      <section className="mt-6 grid gap-4 border-y border-[rgba(0,0,0,0.08)] py-4 sm:grid-cols-3" data-locations-reveal>
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-[#FFF7ED] text-[#B45309]">
            <FiCompass aria-hidden className="h-4 w-4" />
          </span>
          <div>
            <p className="m-0 text-sm font-bold text-[#1C1C1A]">Market coverage</p>
            <p className="mt-1 mb-0 text-sm leading-6 text-[#666666]">
              Active regions are built from the current searchable role feed.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-[#FFF7ED] text-[#B45309]">
            <FiTrendingUp aria-hidden className="h-4 w-4" />
          </span>
          <div>
            <p className="m-0 text-sm font-bold text-[#1C1C1A]">{topRoleLabel}</p>
            <p className="mt-1 mb-0 text-sm leading-6 text-[#666666]">
              {formatNumber(activeStats.topRoleTypeCount)} matching role{activeStats.topRoleTypeCount === 1 ? "" : "s"} in the leading category.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-[#FEF3C7] text-[#92400E]">
            <FiUsers aria-hidden className="h-4 w-4" />
          </span>
          <div>
            <p className="m-0 text-sm font-bold text-[#1C1C1A]">Hiring footprint</p>
            <p className="mt-1 mb-0 text-sm leading-6 text-[#666666]">
              {formatNumber(activeStats.companiesHiring)} companies represented across these locations.
            </p>
          </div>
        </div>
      </section>

      <section className="mt-6 border-b border-[rgba(0,0,0,0.08)] pb-4" data-locations-reveal data-filter-panel>
        <div className="flex items-center justify-between gap-3 sm:hidden">
          <div>
            <p className="m-0 text-sm font-bold text-[#1C1C1A]">Find locations</p>
            <p className="m-0 text-xs text-[#666666]">
              Search and sort {formatNumber(filtered.length)} results
            </p>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-[8px] bg-[#B45309] px-5 py-2 text-sm font-bold text-[#FFFFFF] transition-colors hover:bg-[#78350F] focus:outline-none focus:ring-2 focus:ring-[#B45309] focus:ring-offset-2 focus:ring-offset-[#FFFFFF]"
            aria-expanded={mobileFiltersOpen}
            aria-controls="location-mobile-filters"
            onClick={() => setMobileFiltersOpen((open) => !open)}
          >
            {mobileFiltersOpen ? (
              <FiChevronUp aria-hidden className="h-4 w-4" />
            ) : (
              <FiFilter aria-hidden className="h-4 w-4" />
            )}
            {mobileFiltersOpen ? "Close" : "Filter"}
          </button>
        </div>

        <div
          id="location-mobile-filters"
          ref={mobileFiltersRef}
          className="mt-4 grid h-0 gap-3 overflow-hidden opacity-0 pointer-events-none sm:mt-0 sm:h-auto sm:overflow-visible sm:opacity-100 sm:pointer-events-auto sm:grid sm:grid-cols-[minmax(0,1fr)_220px] sm:items-end lg:grid-cols-[minmax(0,1fr)_240px]"
        >
          <form
            className="grid gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              submitSearch();
            }}
          >
            <label className="block">
              <span className="mb-2 block text-sm font-bold text-[#1C1C1A]">Search locations</span>
              <span className="flex h-12 overflow-hidden rounded-[8px] border border-[rgba(0,0,0,0.08)] bg-[#FFFFFF] transition-colors focus-within:border-[#B45309]">
                <span className="flex w-9 shrink-0 items-center justify-center text-[#B45309] sm:w-11">
                  <FiSearch aria-hidden className="h-4 w-4" />
                </span>
                <input
                  type="text"
                  className="min-w-0 flex-1 appearance-none border-0 bg-[#FFFFFF] px-0 text-sm text-[#1C1C1A] placeholder:text-[#666666] focus:outline-none sm:px-1 sm:text-base"
                  value={queryInput}
                  onChange={(e) => setQueryInput(e.target.value)}
                  placeholder="Search location or role"
                  aria-label="Search locations"
                />
                {queryInput || query ? (
                  <button
                    type="button"
                    className="inline-flex shrink-0 items-center gap-1 px-3 text-xs font-bold text-[#78350F] transition-colors hover:text-[#B45309] focus:outline-none"
                    onClick={clearSearch}
                    aria-label="Clear location search"
                  >
                    <FiX aria-hidden className="h-4 w-4" />
                    Clear
                  </button>
                ) : null}
                <button
                  type="submit"
                  className="shrink-0 bg-[#B45309] px-4 text-sm font-bold text-[#FFFFFF] transition-colors hover:bg-[#78350F] disabled:cursor-wait disabled:bg-[#78350F] sm:px-5"
                  disabled={searchLoading}
                >
                  {searchLoading ? "..." : "Search"}
                </button>
              </span>
            </label>
          </form>

          <div className="relative">
            <span className="mb-2 block text-sm font-bold text-[#1C1C1A]">Sort locations</span>
            <button
              type="button"
              className="flex h-12 w-full items-center justify-between gap-3 rounded-[8px] border border-[rgba(0,0,0,0.08)] bg-[#FFFFFF] px-4 text-left text-sm font-bold text-[#1C1C1A] transition-colors hover:border-[#B45309] focus:border-[#B45309] focus:outline-none focus:ring-2 focus:ring-[#B45309] sm:text-base"
              aria-label="Sort locations"
              aria-haspopup="listbox"
              aria-expanded={sortMenuOpen}
              onClick={() => setSortMenuOpen((open) => !open)}
            >
              <span>{selectedSort.label}</span>
              <FiChevronDown
                aria-hidden
                className={`h-5 w-5 shrink-0 text-[#B45309] transition-transform ${
                  sortMenuOpen ? "rotate-180" : ""
                }`}
              />
            </button>
            <div
              ref={sortMenuRef}
              role="listbox"
              aria-hidden={!sortMenuOpen}
              className="pointer-events-none absolute right-0 top-[calc(100%+8px)] z-30 w-full origin-top overflow-hidden rounded-[8px] border border-[rgba(0,0,0,0.08)] bg-[#FFFFFF] opacity-0 shadow-[0_16px_36px_rgba(28,28,26,0.12)]"
            >
              {SORT_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={sortBy === option.value}
                  data-sort-option
                  className={`flex min-h-11 w-full items-center justify-between gap-3 px-4 py-2 text-left text-sm font-bold transition-colors ${
                    sortBy === option.value
                      ? "bg-[#B45309] text-[#FFFFFF]"
                      : "bg-[#FFFFFF] text-[#1C1C1A] hover:bg-[#FFF7ED]"
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
          </div>
        </div>
      </section>

      <section className="mt-6" aria-live="polite" data-locations-reveal>
        <div className="mb-3 flex flex-col gap-1 sm:mb-4 sm:flex-row sm:items-end sm:justify-between sm:gap-2">
          <div>
            <p className="m-0 text-sm font-bold text-[#B45309]">
              {searchLoading ? "Searching..." : `${formatNumber(filtered.length)} result${filtered.length === 1 ? "" : "s"}`}
            </p>
            <h2 className="m-0 text-xl font-bold text-[#1C1C1A] sm:text-2xl">Location matches</h2>
          </div>
          <p className="m-0 text-xs text-[#666666] sm:text-sm">Updated from live searchable roles.</p>
        </div>

        <div className="grid min-w-0 gap-4 max-[640px]:px-1 sm:grid-cols-2 xl:grid-cols-3" data-locations-grid>
          {searchLoading
            ? Array.from({ length: skeletonCount }).map((_, index) => (
                <LoadingLocationCard key={`search-loading-${index}`} />
              ))
            : filtered.map((location) => (
                <LocationCard key={location.slug} location={location} />
              ))}
        </div>

        {!searchLoading && filtered.length === 0 ? (
          <div className="rounded-[12px] border border-[rgba(180,83,9,0.16)] bg-[#FFF7ED] p-5 text-[#78350F]">
            No locations match your filters.
          </div>
        ) : null}
      </section>
    </div>
  );
}
