"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  FiArrowRight,
  FiBriefcase,
  FiCheck,
  FiChevronDown,
  FiChevronUp,
  FiFilter,
  FiGlobe,
  FiMapPin,
  FiSearch,
  FiSliders,
  FiTarget,
  FiTrendingUp,
} from "react-icons/fi";
import { getRolePagePath } from "@/lib/rolePages";

const SORT_OPTIONS = [
  { value: "roles", label: "Most roles" },
  { value: "recent", label: "Recently active" },
  { value: "alphabetical", label: "A-Z" },
];

const QUICK_LINKS = [
  { href: "/", label: "Browse Jobs", icon: FiGlobe },
  { href: "/companies", label: "Companies", icon: FiBriefcase },
  { href: "/locations", label: "Locations", icon: FiMapPin },
  { href: "/roles/pilot", label: "Pilot", icon: FiTarget },
];

function formatNumber(value) {
  return new Intl.NumberFormat("en").format(Number(value || 0));
}

function RoleCountLabel({ count, recentCount, className = "" }) {
  const safeCount = Number(count || 0);
  const safeRecentCount = Math.max(0, Number(recentCount || 0));

  return (
    <span className={`inline-flex flex-wrap items-baseline gap-x-1 gap-y-0.5 ${className}`}>
      <span>{formatNumber(safeCount)}</span>
      <span className="text-xs font-bold text-[#7A7A76] sm:text-sm">Role{safeCount === 1 ? "" : "s"}</span>
      {safeRecentCount > 0 ? (
        <span className="ml-0.5 text-[11px] font-black leading-tight text-[#15803D] sm:text-xs">
          (+{formatNumber(safeRecentCount)} in the last 3 days)
        </span>
      ) : null}
    </span>
  );
}

function CountUpNumber({ value, durationMs = 1700 }) {
  const target = Math.max(0, Number(value || 0));
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || target === 0) {
      setDisplayValue(target);
      return undefined;
    }

    let frameId = 0;
    const startTime = window.performance.now();
    const easeOut = (t) => 1 - Math.pow(1 - t, 3);

    const tick = (now) => {
      const progress = Math.min(1, (now - startTime) / durationMs);
      setDisplayValue(Math.round(target * easeOut(progress)));
      if (progress < 1) frameId = window.requestAnimationFrame(tick);
    };

    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [durationMs, target]);

  return <span aria-label={formatNumber(target)}>{formatNumber(displayValue)}</span>;
}

function StatValue({ item }) {
  const safeRecentCount = Math.max(0, Number(item.recentCount || 0));

  if (item.recentCount == null) {
    return (
      <p className="m-0 text-3xl font-black leading-none" style={{ color: item.color }}>
        <CountUpNumber value={item.value} />
      </p>
    );
  }

  return (
    <>
      <p className="m-0 text-3xl font-black leading-none" style={{ color: item.color }}>
        <CountUpNumber value={item.value} />
        <span className="ml-1 text-sm font-bold text-[#7A7A76]">Roles</span>
      </p>
      {safeRecentCount > 0 ? (
        <p className="mt-2 mb-0 text-xs font-black text-[#15803D]">
          (+{formatNumber(safeRecentCount)} in the last 3 days)
        </p>
      ) : null}
    </>
  );
}

function SortControl({ sortBy, setSortBy, open, setOpen, menuRef, controlRef }) {
  const selectedSort = SORT_OPTIONS.find((option) => option.value === sortBy) || SORT_OPTIONS[0];

  return (
    <div ref={controlRef} className="relative min-w-0 sm:min-w-[190px]">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-[8px] border border-[rgba(91,79,232,0.14)] bg-[#FFFFFF] px-3 text-left text-sm font-bold text-[#1C1C1A] shadow-[0_10px_24px_rgba(28,28,26,0.04)] transition hover:border-[rgba(91,79,232,0.24)]"
        aria-expanded={open}
      >
        <span className="inline-flex items-center gap-2">
          <FiSliders aria-hidden className="h-4 w-4 text-[#5B4FE8]" />
          {selectedSort.label}
        </span>
        {open ? <FiChevronUp aria-hidden /> : <FiChevronDown aria-hidden />}
      </button>
      <div
        ref={menuRef}
        className="pointer-events-none absolute left-0 right-0 z-40 mt-2 hidden origin-top overflow-hidden rounded-[8px] border border-[rgba(91,79,232,0.14)] bg-[#FFFFFF] p-1 opacity-0 shadow-[0_18px_38px_rgba(28,28,26,0.14)]"
      >
        {SORT_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => {
              setSortBy(option.value);
              setOpen(false);
            }}
            className="flex min-h-10 w-full items-center justify-between rounded-[7px] px-3 text-left text-sm font-bold text-[#1C1C1A] transition hover:bg-[#F7F7F8]"
          >
            {option.label}
            {sortBy === option.value ? <FiCheck aria-hidden className="h-4 w-4 text-[#5B4FE8]" /> : null}
          </button>
        ))}
      </div>
    </div>
  );
}

function SearchControl({ id, queryInput, setQueryInput, clearSearch }) {
  return (
    <label
      htmlFor={id}
      className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-[8px] border border-[rgba(91,79,232,0.14)] bg-[#FFFFFF] px-3 shadow-[0_10px_24px_rgba(28,28,26,0.04)] transition focus-within:border-[rgba(91,79,232,0.24)]"
    >
      <FiSearch aria-hidden className="h-4 w-4 shrink-0 text-[#7A7A76]" />
      <input
        id={id}
        value={queryInput}
        onChange={(event) => setQueryInput(event.target.value)}
        placeholder="Search role or skill"
        className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-[#1C1C1A] outline-none placeholder:text-[#8A8A86]"
        type="search"
      />
      {queryInput ? (
        <button
          type="button"
          onClick={clearSearch}
          className="rounded-full border border-[rgba(91,79,232,0.16)] bg-[#FFFFFF] px-2.5 py-1 text-xs font-black text-[#1A1160] transition hover:bg-[#F7F7F8]"
        >
          Clear
        </button>
      ) : null}
    </label>
  );
}

function RoleRow({ role, index }) {
  const count = Number(role.roleCount || 0);
  const recentCount = Number(role.recentRoleCount || 0);
  const tags = Array.isArray(role.tags) ? role.tags.slice(0, 3) : [];
  const tagLabel = tags.length > 0 ? tags.join(" / ") : role.directoryRolesLabel;

  return (
    <Link
      href={getRolePagePath(role.slug)}
      className="group relative grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 overflow-hidden border-b border-[rgba(28,28,26,0.08)] px-0 py-3 pl-3 text-[#1C1C1A] no-underline transition hover:bg-[#FAFAFA] sm:grid-cols-[56px_minmax(0,1fr)_250px_112px] sm:items-center sm:gap-4 sm:px-4 sm:py-5"
      data-role-row
    >
      <span
        aria-hidden
        className="absolute bottom-3 left-0 top-3 w-1 rounded-full opacity-30 transition-opacity group-hover:opacity-55"
        style={{ background: role.gradient || "linear-gradient(135deg, #5B4FE8 0%, #1A1160 100%)" }}
      />
      <span className="hidden text-xs font-black uppercase tracking-[0.14em] text-[#8D86C8] sm:block">
        {String(index + 1).padStart(2, "0")}
      </span>

      <div className="min-w-0">
        <h3 className="m-0 text-base font-black leading-snug tracking-[-0.01em] text-[#1C1C1A] sm:text-xl sm:tracking-[-0.015em]">
          {role.name}
        </h3>
        <p className="mt-0.5 mb-0 overflow-hidden text-ellipsis whitespace-nowrap text-xs font-semibold leading-5 text-[#666666] sm:mt-1 sm:text-sm sm:leading-6">
          {tagLabel}
        </p>
      </div>

      <div className="col-start-1 flex min-w-0 items-center justify-between gap-3 sm:col-auto sm:block">
        <p className="m-0 text-lg font-black leading-none text-[#5B4FE8] sm:text-2xl">
          <RoleCountLabel count={count} recentCount={recentCount} />
        </p>
      </div>

      <span className="col-start-2 row-span-2 row-start-1 inline-flex shrink-0 items-center justify-end gap-1.5 self-center text-right text-xs font-black text-[#5B4FE8] transition group-hover:translate-x-1 sm:col-auto sm:row-auto sm:gap-2 sm:text-sm sm:justify-end">
        <span>View Jobs</span>
        <FiArrowRight aria-hidden className="h-3.5 w-3.5 transition group-hover:translate-x-0.5 sm:h-4 sm:w-4" />
      </span>
    </Link>
  );
}

export default function RolesDirectoryClient({ roles = [], stats = {} }) {
  const rootRef = useRef(null);
  const mobileFiltersRef = useRef(null);
  const mobileSortMenuRef = useRef(null);
  const desktopSortMenuRef = useRef(null);
  const mobileSortControlRef = useRef(null);
  const desktopSortControlRef = useRef(null);
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState("roles");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);

  const filteredRoles = useMemo(() => {
    const search = query.trim().toLowerCase();
    return roles
      .filter((role) => {
        if (!search) return true;
        const haystack = [role.name, role.directoryRolesLabel, ...(role.tags || [])]
          .join(" ")
          .toLowerCase();
        return haystack.includes(search);
      })
      .sort((a, b) => {
        if (sortBy === "alphabetical") return a.name.localeCompare(b.name);
        if (sortBy === "recent") {
          const at = Date.parse(String(a.lastSeenAt || ""));
          const bt = Date.parse(String(b.lastSeenAt || ""));
          return (Number.isFinite(bt) ? bt : 0) - (Number.isFinite(at) ? at : 0);
        }
        return Number(b.roleCount || 0) - Number(a.roleCount || 0) || a.name.localeCompare(b.name);
      });
  }, [roles, query, sortBy]);

  const statItems = [
    { label: "Live roles", value: stats.liveRoles || 0, recentCount: stats.recentRoles || 0, color: "#5B4FE8" },
    { label: "Role families", value: stats.roleFamilies || roles.length, color: "#1A1160" },
    { label: "Indexed matches", value: stats.indexedMatches || 0, color: "#6D28D9" },
    { label: "Skill tags", value: stats.specialtyTags || 0, color: "#4338CA" },
  ];

  const clearSearch = () => {
    setQueryInput("");
    setQuery("");
    setSearchLoading(false);
  };

  useEffect(() => {
    const nextQuery = queryInput.trim().toLowerCase();
    if (nextQuery === query) {
      setSearchLoading(false);
      return undefined;
    }

    setSearchLoading(true);
    const timeoutId = window.setTimeout(() => {
      setQuery(nextQuery);
      setSearchLoading(false);
    }, 160);
    return () => window.clearTimeout(timeoutId);
  }, [query, queryInput]);

  useEffect(() => {
    const onClick = (event) => {
      const controls = [mobileSortControlRef.current, desktopSortControlRef.current].filter(Boolean);
      if (controls.some((control) => control.contains(event.target))) return;
      setSortOpen(false);
    };
    window.addEventListener("click", onClick);
    return () => window.removeEventListener("click", onClick);
  }, []);

  useEffect(() => {
    if (!rootRef.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;

    gsap.registerPlugin(ScrollTrigger);
    const context = gsap.context(() => {
      const q = gsap.utils.selector(rootRef);

      gsap.fromTo(
        q("[data-hero-line]"),
        { yPercent: 80, autoAlpha: 0 },
        {
          yPercent: 0,
          autoAlpha: 1,
          duration: 0.72,
          ease: "power3.out",
          stagger: 0.06,
          clearProps: "transform,opacity,visibility",
        }
      );

      gsap.fromTo(
        q("[data-hero-reveal]"),
        { y: 14, autoAlpha: 0 },
        {
          y: 0,
          autoAlpha: 1,
          duration: 0.54,
          ease: "power2.out",
          stagger: 0.05,
          delay: 0.12,
          clearProps: "transform,opacity,visibility",
        }
      );

      q("[data-scroll-reveal]").forEach((element) => {
        gsap.set(element, { y: 22, autoAlpha: 0 });
        gsap.to(element, {
          y: 0,
          autoAlpha: 1,
          duration: 0.62,
          ease: "power2.out",
          scrollTrigger: {
            trigger: element,
            start: "top 88%",
            toggleActions: "play none none reverse",
          },
        });
      });

      gsap.fromTo(
        q("[data-directory-link]"),
        { x: -8, autoAlpha: 0 },
        {
          x: 0,
          autoAlpha: 1,
          duration: 0.4,
          ease: "power2.out",
          stagger: 0.035,
          clearProps: "transform,opacity,visibility",
        }
      );

      ScrollTrigger.refresh();
    }, rootRef);

    return () => context.revert();
  }, []);

  useEffect(() => {
    const panel = mobileFiltersRef.current;
    if (!panel) return undefined;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isMobile = window.matchMedia("(max-width: 639px)").matches;
    gsap.killTweensOf(panel);

    if (!isMobile) {
      gsap.set(panel, { clearProps: "height,opacity,visibility,transform,pointerEvents,overflow" });
      return undefined;
    }

    if (reduceMotion) {
      gsap.set(panel, {
        height: mobileFiltersOpen ? "auto" : 0,
        autoAlpha: mobileFiltersOpen ? 1 : 0,
        overflow: mobileFiltersOpen ? "visible" : "hidden",
        pointerEvents: mobileFiltersOpen ? "auto" : "none",
      });
      return undefined;
    }

    if (mobileFiltersOpen) {
      gsap.set(panel, { height: "auto", autoAlpha: 1, overflow: "hidden", pointerEvents: "auto" });
      const height = panel.offsetHeight;
      gsap.fromTo(
        panel,
        { height: 0, y: -6, autoAlpha: 0 },
        {
          height,
          y: 0,
          autoAlpha: 1,
          duration: 0.28,
          ease: "power2.out",
          onComplete: () => gsap.set(panel, { height: "auto", overflow: "visible" }),
        }
      );
    } else {
      gsap.to(panel, {
        height: 0,
        y: -6,
        autoAlpha: 0,
        overflow: "hidden",
        duration: 0.22,
        ease: "power2.inOut",
        pointerEvents: "none",
      });
    }

    return undefined;
  }, [mobileFiltersOpen]);

  useEffect(() => {
    const menus = [mobileSortMenuRef.current, desktopSortMenuRef.current].filter(Boolean);
    if (menus.length === 0) return undefined;
    gsap.killTweensOf(menus);

    if (sortOpen) {
      gsap.set(menus, { display: "block", pointerEvents: "auto" });
      gsap.fromTo(
        menus,
        { y: -5, scaleY: 0.97, autoAlpha: 0 },
        { y: 0, scaleY: 1, autoAlpha: 1, duration: 0.2, ease: "power2.out" }
      );
    } else {
      gsap.to(menus, {
        y: -5,
        scaleY: 0.97,
        autoAlpha: 0,
        duration: 0.14,
        ease: "power2.inOut",
        pointerEvents: "none",
        onComplete: () => gsap.set(menus, { display: "none" }),
      });
    }

    return undefined;
  }, [sortOpen]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    const rows = root.querySelectorAll("[data-role-row]");
    gsap.killTweensOf(rows);
    gsap.fromTo(
      rows,
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
  }, [filteredRoles.length, query, sortBy]);

  return (
    <div ref={rootRef} className="mx-auto w-full max-w-[1120px] px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <section className="py-6 sm:py-8 lg:py-10">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_390px] lg:items-end">
          <div className="max-w-3xl">
            <p className="m-0 text-xs font-black uppercase tracking-[0.12em] text-[#5B4FE8]" data-hero-reveal>
              Role Directory
            </p>
            <h1 className="mt-4 mb-0 text-4xl font-black leading-[1.04] text-[#1C1C1A] sm:text-5xl lg:text-6xl">
              <span className="block overflow-hidden">
                <span className="inline-block" data-hero-line>Explore drone jobs</span>
              </span>
              <span className="block overflow-hidden text-[#5B4FE8]">
                <span className="inline-block" data-hero-line>by role.</span>
              </span>
            </h1>
            <p className="mt-5 mb-0 max-w-2xl text-base leading-7 text-[#666666] sm:text-lg" data-hero-reveal>
              Browse active drone, UAV, autonomy, aerospace, flight test, and operations roles by specialty.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-5 border-t border-[rgba(91,79,232,0.12)] pt-5 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0" data-hero-reveal>
            {statItems.map((item) => (
              <div key={item.label}>
                <StatValue item={item} />
                <p className="mt-2 mb-0 text-sm font-bold text-[#666666]">{item.label}</p>
              </div>
            ))}
          </div>
        </div>

        <nav className="mt-7 flex gap-2 overflow-x-auto pb-1" aria-label="Role directory shortcuts">
          {QUICK_LINKS.map((link) => {
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border border-[rgba(91,79,232,0.14)] bg-[#FFFFFF] px-4 text-sm font-black text-[#1C1C1A] no-underline shadow-[0_10px_24px_rgba(28,28,26,0.04)] transition hover:border-[rgba(91,79,232,0.24)] hover:bg-[#FAFAFA]"
                data-directory-link
              >
                <Icon aria-hidden className="h-4 w-4 text-[#5B4FE8]" />
                {link.label}
              </Link>
            );
          })}
        </nav>
      </section>

      <section className="border-y border-[rgba(91,79,232,0.12)] py-5" data-scroll-reveal>
        <div className="hidden gap-3 sm:flex sm:items-center">
          <SearchControl
            id="role-search-desktop"
            queryInput={queryInput}
            setQueryInput={setQueryInput}
            clearSearch={clearSearch}
          />
          <SortControl
            sortBy={sortBy}
            setSortBy={setSortBy}
            open={sortOpen}
            setOpen={setSortOpen}
            menuRef={desktopSortMenuRef}
            controlRef={desktopSortControlRef}
          />
        </div>

        <div className="sm:hidden">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="m-0 text-xs font-black uppercase tracking-[0.12em] text-[#5B4FE8]">Find roles</p>
              <p className="mt-1 mb-0 text-sm font-semibold text-[#666666]">
                {searchLoading ? "Searching..." : `${formatNumber(filteredRoles.length)} matches`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setMobileFiltersOpen((value) => !value)}
              className="inline-flex min-h-11 items-center gap-2 rounded-[8px] bg-[#1A1160] px-4 text-sm font-black text-[#FFFFFF]"
              aria-expanded={mobileFiltersOpen}
            >
              <FiFilter aria-hidden className="h-4 w-4" />
              {mobileFiltersOpen ? "Close" : "Filter"}
            </button>
          </div>
          <div ref={mobileFiltersRef} className="h-0 overflow-hidden opacity-0">
            <div className="mt-4 grid gap-3">
              <SearchControl
                id="role-search-mobile"
                queryInput={queryInput}
                setQueryInput={setQueryInput}
                clearSearch={clearSearch}
              />
              <SortControl
                sortBy={sortBy}
                setSortBy={setSortBy}
                open={sortOpen}
                setOpen={setSortOpen}
                menuRef={mobileSortMenuRef}
                controlRef={mobileSortControlRef}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="py-7" data-scroll-reveal>
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="m-0 text-xs font-black uppercase tracking-[0.12em] text-[#5B4FE8]">
              {searchLoading ? "Searching" : `${formatNumber(filteredRoles.length)} roles`}
            </p>
            <h2 className="mt-1 mb-0 text-2xl font-black text-[#1C1C1A] sm:text-3xl">
              All role families
            </h2>
          </div>
          <p className="m-0 max-w-md text-sm font-semibold leading-6 text-[#666666] sm:text-right">
            A simple index of the active specialties in the live hiring feed.
          </p>
        </div>

        {filteredRoles.length > 0 ? (
          <div className="border-t border-[rgba(28,28,26,0.1)]">
            {filteredRoles.map((role, index) => (
              <RoleRow key={role.slug} role={role} index={index} />
            ))}
          </div>
        ) : (
          <div className="rounded-[8px] border border-dashed border-[rgba(91,79,232,0.22)] bg-[#FFFFFF] p-8 text-center">
            <p className="m-0 text-lg font-black text-[#1C1C1A]">No role matches found.</p>
            <p className="mx-auto mt-2 mb-0 max-w-md text-sm leading-6 text-[#666666]">
              Try pilot, engineering, operations, software, testing, hardware, or safety.
            </p>
            <button
              type="button"
              onClick={clearSearch}
              className="mt-5 rounded-[8px] bg-[#1A1160] px-5 py-3 text-sm font-black text-[#FFFFFF] transition hover:bg-[#5B4FE8]"
            >
              Clear search
            </button>
          </div>
        )}
      </section>

      <section className="border-t border-[rgba(91,79,232,0.12)] py-6" data-scroll-reveal>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="m-0 text-sm font-black uppercase tracking-[0.12em] text-[#5B4FE8]">
            Highest volume
          </p>
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            {roles.slice(0, 3).map((role) => (
              <Link
                key={`featured-${role.slug}`}
                href={getRolePagePath(role.slug)}
                className="group inline-flex items-center gap-2 text-sm font-black text-[#1C1C1A] no-underline transition hover:text-[#5B4FE8]"
              >
                <FiTrendingUp aria-hidden className="h-4 w-4 text-[#5B4FE8]" />
                {role.name}
                <span className="font-bold text-[#666666]">({formatNumber(role.roleCount)})</span>
                <FiArrowRight aria-hidden className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
