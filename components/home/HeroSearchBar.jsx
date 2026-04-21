"use client";

import { useEffect, useState } from "react";
import { FiFilter, FiMapPin, FiSearch, FiSliders } from "react-icons/fi";
import { countAdvancedFilterSelections } from "@/lib/filterConfig";
import { trackEvent } from "@/lib/analytics";
import CustomSelect from "./CustomSelect";


/** Companies we actively monitor for new roles (update when your coverage changes). */
const TRACKED_COMPANIES_COUNT = 92;
const EMPLOYMENT_TYPE_OPTIONS = [
  { value: "", label: "Any" },
  { value: "Full-time", label: "Full Time" },
  { value: "Contract", label: "Contract" },
  { value: "Part-time", label: "Part-time" },
];

function formatNumber(value) {
  return new Intl.NumberFormat("en").format(Number(value || 0));
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

/**
 * @param {{
 *   totalJobs: number,
 *   trackedCompaniesCount?: number,
 *   liveRolesCount?: number,
 *   lifetimeRolesCount?: number,
 *   locationSuggestions?: string[],
 *   state: any,
 *   setState: (u: any) => void,
 *   toggleArray: (key: string, value: string) => void,
 *   onSearch: () => void,
 *   onGoToBrowse: () => void,
 *   onMobileFiltersOpen: () => void,
 *   isDesktop: boolean,
 * }} props
 */
export default function HeroSearchBar({
  totalJobs,
  trackedCompaniesCount = TRACKED_COMPANIES_COUNT,
  liveRolesCount = 0,
  lifetimeRolesCount = 0,
  locationSuggestions = [],
  state,
  setState,
  toggleArray,
  onSearch,
  onGoToBrowse,
  onMobileFiltersOpen,
  isDesktop,
}) {
  const advCount = countAdvancedFilterSelections(state);
  const selectedEmploymentType = state.employmentTypes[0] || "";
  const quickTypes = ["Full-time", "Contract", "Part-time"];
  const submitSearch = () => {
    trackEvent("search_submit", {
      keywordLength: state.keyword.trim().length,
      hasLocation: Boolean(state.location.trim()),
      activeFilterCount: advCount,
    });
    onSearch();
  };

  const handleFilters = () => {
    trackEvent("open_filters", {
      surface: isDesktop ? "desktop" : "mobile",
      activeFilterCount: advCount,
    });
    if (isDesktop) {
      onGoToBrowse();
    } else {
      onMobileFiltersOpen();
    }
  };

  return (
    <div className="relative z-20 w-full overflow-visible rounded-[8px] border border-[rgba(91,79,232,0.14)] bg-[linear-gradient(180deg,#FFFFFF_0%,#FFFCF7_100%)] p-4 shadow-[0_24px_54px_rgba(28,28,26,0.1)] sm:p-5">
      <div className="mb-3 grid gap-3 border-b border-[rgba(91,79,232,0.1)] pb-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div>
          <p className="m-0 text-xs font-black uppercase tracking-[0.12em] text-[#5B4FE8]">
            Search the live feed
          </p>
          <p className="mt-2 mb-0 max-w-2xl text-sm font-semibold leading-6 text-[#665A50]">
            Search by keyword, location, and contract type, then refine the full results below.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {quickTypes.map((type) => {
            const active = selectedEmploymentType === type;
            return (
              <button
                key={type}
                type="button"
                className={`inline-flex min-h-9 items-center justify-center rounded-full border px-3 text-xs font-black transition ${
                  active
                    ? "border-[rgba(91,79,232,0.2)] bg-[#EDE9FF] text-[#1A1160]"
                    : "border-[rgba(91,79,232,0.12)] bg-[#FFFFFF] text-[#665A50] hover:bg-[#F7F7F8]"
                }`}
                onClick={() =>
                  setState({
                    employmentTypes: active ? [] : [type],
                  })
                }
              >
                {type}
              </button>
            );
          })}
        </div>
      </div>

      <form
        className={"grid [grid-template-columns:minmax(0,1.3fr)_minmax(0,1fr)_160px_144px] [gap:10px] [align-items:stretch] max-[900px]:[grid-template-columns:1fr_1fr] max-[620px]:[grid-template-columns:1fr]"}
        onSubmit={(event) => {
          event.preventDefault();
          submitSearch();
        }}
      >
        <div className={"relative grid min-h-[54px] grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-[8px] border border-[rgba(91,79,232,0.12)] bg-[#FFFCF7] px-3 py-2 transition focus-within:border-[rgba(91,79,232,0.35)] focus-within:bg-[#FFFFFF]"}>
          <span className={"inline-flex h-9 w-9 items-center justify-center rounded-[8px] bg-[#EDE9FF] text-[#5B4FE8]"} aria-hidden="true">
            <FiSearch className="h-[18px] w-[18px]" />
          </span>
          <div className={"min-w-0 grid [gap:4px]"}>
            <span className={"[font-size:0.64rem] [text-transform:uppercase] [letter-spacing:0.1em] font-black [color:#5B4FE8]"}>Keyword</span>
            <input
              className={"w-full border-0 bg-transparent p-0 text-base font-bold text-[#1C1C1A] outline-none placeholder:text-[#8A8A86]"}
              type="search"
              placeholder="e.g. LiDAR"
              value={state.keyword}
              onChange={(ev) => setState({ keyword: ev.target.value })}
              autoComplete="off"
              aria-label="Keyword search"
            />
          </div>
        </div>
        <div className={"relative grid min-h-[54px] grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-[8px] border border-[rgba(91,79,232,0.12)] bg-[#FFFCF7] px-3 py-2 transition focus-within:border-[rgba(91,79,232,0.35)] focus-within:bg-[#FFFFFF]"}>
          <span className={"inline-flex h-9 w-9 items-center justify-center rounded-[8px] bg-[#EDE9FF] text-[#5B4FE8]"} aria-hidden="true">
            <FiMapPin className="h-[18px] w-[18px]" />
          </span>
          <div className={"min-w-0 grid [gap:4px]"}>
            <span className={"[font-size:0.64rem] [text-transform:uppercase] [letter-spacing:0.1em] font-black [color:#5B4FE8]"}>Location</span>
            <input
              className={"w-full border-0 bg-transparent p-0 text-base font-bold text-[#1C1C1A] outline-none placeholder:text-[#8A8A86]"}
              type="search"
              list="hero-location-suggestions"
              placeholder="e.g. Berlin, Remote, London"
              value={state.location}
              onChange={(ev) => setState({ location: ev.target.value })}
              autoComplete="off"
              aria-label="Location"
            />
          </div>
          <datalist id="hero-location-suggestions">
            {locationSuggestions.map((loc) => (
              <option key={loc} value={loc} />
            ))}
            <option value="Remote" />
            <option value="Hybrid" />
            <option value="On-site" />
            <option value="Europe" />
            <option value="North America" />
          </datalist>
        </div>
        <div className={"relative grid min-h-[54px] grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-[8px] border border-[rgba(91,79,232,0.12)] bg-[#FFFCF7] px-3 py-2 transition focus-within:border-[rgba(91,79,232,0.35)] focus-within:bg-[#FFFFFF]"}>
          <span className={"inline-flex h-9 w-9 items-center justify-center rounded-[8px] bg-[#EDE9FF] text-[#5B4FE8]"} aria-hidden="true">
            <FiSliders className="h-[18px] w-[18px]" />
          </span>
          <div className={"min-w-0 grid [gap:4px]"}>
            <span className={"[font-size:0.64rem] [text-transform:uppercase] [letter-spacing:0.1em] font-black [color:#5B4FE8]"}>Type</span>
            <CustomSelect
              value={selectedEmploymentType}
              onChange={(nextValue) => setState({ employmentTypes: nextValue ? [nextValue] : [] })}
              options={EMPLOYMENT_TYPE_OPTIONS}
              label="Employment type"
              minWidthClass="min-w-0"
              buttonClassName="border-0 bg-transparent p-0 pr-0 shadow-none hover:border-transparent"
              menuAlign="right"
              buttonMinHeightClass="min-h-0"
            />
          </div>
        </div>
        <button
          type="submit"
          className={"min-h-[54px] cursor-pointer rounded-[8px] border-0 bg-[#5B4FE8] px-5 text-sm font-black text-[#FFFFFF] shadow-[0_14px_24px_rgba(91,79,232,0.18)] transition hover:-translate-y-0.5 hover:bg-[#1A1160] max-[620px]:w-full"}
        >
          Search Jobs
        </button>
      </form>
      <div className={"grid gap-2 px-1 pt-4 text-sm font-bold text-[#665A50] sm:grid-cols-2 xl:grid-cols-[repeat(3,minmax(0,1fr))_auto] xl:items-center"}>
        <span className={"inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[8px] border border-[rgba(91,79,232,0.16)] bg-[linear-gradient(180deg,rgba(237,233,255,0.85)_0%,#FFFFFF_100%)] px-3 py-2 text-center shadow-[0_10px_20px_rgba(91,79,232,0.08)] ring-1 ring-[rgba(255,255,255,0.8)] [&strong]:font-black [&strong]:text-[#1A1160]"}>
          <strong><CountUpNumber value={liveRolesCount || totalJobs} /></strong> live roles
        </span>
        <span className={"inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[8px] border border-[rgba(91,79,232,0.16)] bg-[linear-gradient(180deg,rgba(255,248,237,0.92)_0%,#FFFFFF_100%)] px-3 py-2 text-center shadow-[0_10px_20px_rgba(180,83,9,0.08)] ring-1 ring-[rgba(255,255,255,0.85)] [&strong]:font-black [&strong]:text-[#1A1160]"}>
          <strong><CountUpNumber value={trackedCompaniesCount} /></strong> companies tracked
        </span>
        <span className={"inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[8px] border border-[rgba(91,79,232,0.16)] bg-[linear-gradient(180deg,rgba(255,255,255,1)_0%,rgba(237,233,255,0.72)_100%)] px-3 py-2 text-center shadow-[0_10px_20px_rgba(28,28,26,0.06)] ring-1 ring-[rgba(255,255,255,0.85)] [&strong]:font-black [&strong]:text-[#1A1160]"}>
          <strong><CountUpNumber value={lifetimeRolesCount} /></strong> lifetime roles
        </span>
        <button type="button" className={"inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-[8px] border border-[rgba(91,79,232,0.16)] bg-[#FFFFFF] px-3 font-black text-[#5B4FE8] hover:bg-[#EDE9FF]"} onClick={handleFilters}>
          <FiFilter aria-hidden className="h-4 w-4" />
          Filters{advCount > 0 ? ` (${advCount})` : ""}
        </button>
      </div>
    </div>
  );
}
