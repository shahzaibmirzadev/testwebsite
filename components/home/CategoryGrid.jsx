"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BROWSE_CATEGORIES,
  MIN_BROWSE_ROLE_COUNT,
  countJobsForSector,
} from "@/lib/categoryMeta";
import { inferCompanySector } from "@/lib/companySectorMeta";
import { getCompanyName } from "@/lib/jobFieldHelpers";
import {
  buildLocationSlugCounts,
  getHomepageLocationCardDefinitions,
  getLocationPagePath,
  MIN_LOCATION_DIRECTORY_ROLES,
} from "@/lib/locationPages";
import { formatCompanyNameForDisplay } from "@/lib/companyDisplayFormat";
import { lookupCompanyDescription } from "@/lib/companyDescriptionMatch";
import { formatLocationSummary } from "@/lib/companyPageCopy";
import { companyPagePath } from "@/lib/companyPages";
import CategoryCard from "./CategoryCard";


function pickRandomCompanies(companies, count = 4) {
  const copy = [...companies];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
}

function wrapIndex(index, length) {
  if (length <= 0) return 0;
  return ((index % length) + length) % length;
}

function windowedItems(items, start, size) {
  if (!Array.isArray(items) || items.length === 0) return [];
  if (items.length <= size) return items;
  const out = [];
  for (let i = 0; i < size; i += 1) {
    out.push(items[wrapIndex(start + i, items.length)]);
  }
  return out;
}

/**
 * @param {{
 *   jobs: Record<string, unknown>[],
 *   trackedCompanies: string[],
 *   onSelectCategory: (category: any) => void,
 * }} props
 */
export default function CategoryGrid({
  jobs,
  trackedCompanies,
  onSelectCategory,
}) {
  const defaultCompanyGradient = "linear-gradient(135deg, #2563eb 0%, #3b82f6 50%, #93c5fd 100%)";
  const [apiRegionCounts, setApiRegionCounts] = useState(null);
  const [mode, setMode] = useState("role");
  const [specialtyStart, setSpecialtyStart] = useState(0);
  const [companyStart, setCompanyStart] = useState(0);
  const [locationStart, setLocationStart] = useState(0);
  const [specialtyAnim, setSpecialtyAnim] = useState("");
  const [companyAnim, setCompanyAnim] = useState("");
  const [locationAnim, setLocationAnim] = useState("");
  const counts = useMemo(() => {
    const map = new Map();
    BROWSE_CATEGORIES.forEach((c) => {
      map.set(c.id, countJobsForSector(jobs, c));
    });
    return map;
  }, [jobs]);
  const eligibleRoleCategories = useMemo(
    () => BROWSE_CATEGORIES.filter((c) => (counts.get(c.id) ?? 0) >= MIN_BROWSE_ROLE_COUNT),
    [counts]
  );
  const liveCompanies = useMemo(() => {
    const set = new Set();
    jobs.forEach((job) => {
      const company = getCompanyName(job);
      if (company) set.add(company);
    });
    return set;
  }, [jobs]);
  const trackedCompaniesWithLiveJobs = useMemo(
    () => trackedCompanies.filter((company) => liveCompanies.has(company)),
    [trackedCompanies, liveCompanies]
  );
  const featuredCompanies = useMemo(
    () => pickRandomCompanies(trackedCompaniesWithLiveJobs, 8),
    [trackedCompaniesWithLiveJobs]
  );
  const companyGradients = useMemo(() => {
    const jobsByCompany = new Map();
    jobs.forEach((job) => {
      const company = getCompanyName(job);
      if (!company) return;
      const existing = jobsByCompany.get(company) || [];
      existing.push(job);
      jobsByCompany.set(company, existing);
    });

    const specialties = BROWSE_CATEGORIES.filter((c) => typeof c?.matcher === "function");
    const gradients = new Map();
    trackedCompanies.forEach((company) => {
      const companyJobs = jobsByCompany.get(company) || [];
      const sector = inferCompanySector(company, companyJobs);
      let dominantSpecialty = null;
      let dominantSpecialtyCount = 0;
      for (const specialty of specialties) {
        const count = companyJobs.reduce((n, job) => (specialty.matcher(job) ? n + 1 : n), 0);
        if (count > dominantSpecialtyCount) {
          dominantSpecialtyCount = count;
          dominantSpecialty = specialty;
        }
      }
      gradients.set(
        company,
        dominantSpecialty?.gradient || sector?.gradient || defaultCompanyGradient
      );
    });
    return gradients;
  }, [jobs, trackedCompanies]);

  const companyBrowseMeta = useMemo(() => {
    const jobsByCompany = new Map();
    jobs.forEach((job) => {
      const company = getCompanyName(job);
      if (!company) return;
      const existing = jobsByCompany.get(company) || [];
      existing.push(job);
      jobsByCompany.set(company, existing);
    });
    const map = new Map();
    for (const company of trackedCompanies) {
      const list = jobsByCompany.get(company) || [];
      const rec = lookupCompanyDescription(company);
      const location =
        (rec?.location && String(rec.location).trim()) || formatLocationSummary(list) || "";
      const foundedYear =
        rec?.foundedYear != null && Number.isFinite(Number(rec.foundedYear))
          ? Math.trunc(Number(rec.foundedYear))
          : null;
      map.set(company, { location, foundedYear });
    }
    return map;
  }, [jobs, trackedCompanies]);

  const visibleSectorCards = useMemo(
    () => windowedItems(eligibleRoleCategories, specialtyStart, 4),
    [eligibleRoleCategories, specialtyStart]
  );
  const visibleCompanyCards = useMemo(
    () => windowedItems(featuredCompanies, companyStart, 4),
    [featuredCompanies, companyStart]
  );
  const fallbackLocationCounts = useMemo(() => buildLocationSlugCounts(jobs), [jobs]);
  const locationSlugCounts = apiRegionCounts || fallbackLocationCounts;
  const locationCardDefinitions = useMemo(() => getHomepageLocationCardDefinitions(), []);
  const eligibleLocationItems = useMemo(() => {
    const enriched = locationCardDefinitions.map((item) => ({
      ...item,
      count: locationSlugCounts[item.slug] ?? 0,
    }));
    return enriched.filter((item) => item.count >= MIN_LOCATION_DIRECTORY_ROLES);
  }, [locationCardDefinitions, locationSlugCounts]);
  const visibleLocationCards = useMemo(
    () => windowedItems(eligibleLocationItems, locationStart, 4),
    [eligibleLocationItems, locationStart]
  );
  const canRotateSectors = eligibleRoleCategories.length > 4;
  const canRotateCompanies = featuredCompanies.length > 4;
  const locationCarouselLength = eligibleLocationItems.length;
  const canRotateLocations = locationCarouselLength > 4;
  const rotatePrev = () => {
    if (mode === "role") {
      setSpecialtyAnim("left");
      setSpecialtyStart((s) => wrapIndex(s - 1, eligibleRoleCategories.length));
      return;
    }
    if (mode === "location") {
      setLocationAnim("left");
      setLocationStart((s) => wrapIndex(s - 1, locationCarouselLength));
      return;
    }
    setCompanyAnim("left");
    setCompanyStart((s) => wrapIndex(s - 1, featuredCompanies.length));
  };
  const rotateNext = () => {
    if (mode === "role") {
      setSpecialtyAnim("right");
      setSpecialtyStart((s) => wrapIndex(s + 1, eligibleRoleCategories.length));
      return;
    }
    if (mode === "location") {
      setLocationAnim("right");
      setLocationStart((s) => wrapIndex(s + 1, locationCarouselLength));
      return;
    }
    setCompanyAnim("right");
    setCompanyStart((s) => wrapIndex(s + 1, featuredCompanies.length));
  };

  useEffect(() => {
    if (!specialtyAnim) return;
    const timer = setTimeout(() => setSpecialtyAnim(""), 280);
    return () => clearTimeout(timer);
  }, [specialtyAnim]);

  useEffect(() => {
    setSpecialtyStart((s) => wrapIndex(s, eligibleRoleCategories.length));
  }, [eligibleRoleCategories.length]);

  useEffect(() => {
    if (!companyAnim) return;
    const timer = setTimeout(() => setCompanyAnim(""), 280);
    return () => clearTimeout(timer);
  }, [companyAnim]);

  useEffect(() => {
    if (!locationAnim) return;
    const timer = setTimeout(() => setLocationAnim(""), 280);
    return () => clearTimeout(timer);
  }, [locationAnim]);

  useEffect(() => {
    let cancelled = false;
    const fetchRegionCounts = async () => {
      try {
        const res = await fetch("/api/location-counts", { cache: "no-store" });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.ok || !json?.counts || cancelled) return;
        setApiRegionCounts(json.counts);
      } catch {
        // Keep using local fallback counts if API fetch fails.
      }
    };
    fetchRegionCounts();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className={"border-y border-[rgba(91,79,232,0.1)] bg-[#FFFFFF] py-8 sm:py-10"} aria-labelledby="browse-cat-heading" data-home-scroll>
      <div className={"[max-width:1120px] [margin:0_auto] [padding:0_20px] [transition:max-width_0.48s_cubic-bezier(0.4,_0,_0.2,_1)] min-[1024px]:[max-width:min(1480px,_calc(100vw_-_40px))]"}>
        <div className={"mb-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"}>
          <div>
            <p className="m-0 text-xs font-black uppercase tracking-[0.12em] text-[#5B4FE8]">Explore the market</p>
            <h2 id="browse-cat-heading" className={"mt-2 mb-0 text-[2rem] font-black tracking-[-0.03em] text-[#1C1C1A] sm:text-[2.45rem]"}>
              {mode === "role"
                ? "Browse by Role"
                : mode === "company"
                  ? "Browse by Company"
                  : "Browse by Location"}
            </h2>
          </div>
          <div className={"inline-flex [align-items:center] [gap:6px] [background:#F7F7F8] [border:1px_solid_rgba(91,_79,_232,_0.14)] [border-radius:999px] [padding:4px] sm:[margin-inline:auto]"} role="group" aria-label="Browse mode">
            <button
              type="button"
              className={`${"border-0 bg-transparent [color:#665A50] [border-radius:999px] [font-size:0.78rem] font-black [padding:7px_13px] cursor-pointer"} ${mode === "role" ? "[background:#EDE9FF] [color:#1A1160]" : ""}`}
              onClick={() => setMode("role")}
            >
              Role
            </button>
            <button
              type="button"
              className={`${"border-0 bg-transparent [color:#665A50] [border-radius:999px] [font-size:0.78rem] font-black [padding:7px_13px] cursor-pointer"} ${mode === "company" ? "[background:#EDE9FF] [color:#1A1160]" : ""}`}
              onClick={() => setMode("company")}
            >
              Company
            </button>
            <button
              type="button"
              className={`${"border-0 bg-transparent [color:#665A50] [border-radius:999px] [font-size:0.78rem] font-black [padding:7px_13px] cursor-pointer"} ${mode === "location" ? "[background:#EDE9FF] [color:#1A1160]" : ""}`}
              onClick={() => setMode("location")}
            >
              Location
            </button>
          </div>
        </div>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <p className={"m-0 [font-size:0.98rem] [line-height:1.6] [color:#665A50] [max-width:72ch]"}>
          {mode === "role"
            ? "Specialized opportunities across high-demand drone roles."
            : mode === "company"
              ? "Explore roles by tracked companies from the sourcing directory."
              : "Explore jobs by location; each card links to a dedicated page."}
          </p>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[rgba(91,79,232,0.14)] bg-[#FFFFFF] text-lg font-black text-[#1A1160] shadow-[0_8px_18px_rgba(28,28,26,0.05)] transition hover:bg-[#EDE9FF] disabled:cursor-not-allowed disabled:opacity-40"
              aria-label={
                mode === "role"
                  ? "Previous roles"
                  : mode === "company"
                    ? "Previous companies"
                    : "Previous regions"
              }
              onClick={rotatePrev}
              disabled={
                mode === "role"
                  ? !canRotateSectors
                  : mode === "company"
                    ? !canRotateCompanies
                    : !canRotateLocations
              }
            >
              {"<"}
            </button>
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[rgba(91,79,232,0.14)] bg-[#FFFFFF] text-lg font-black text-[#1A1160] shadow-[0_8px_18px_rgba(28,28,26,0.05)] transition hover:bg-[#EDE9FF] disabled:cursor-not-allowed disabled:opacity-40"
              aria-label={
                mode === "role"
                  ? "Next roles"
                  : mode === "company"
                    ? "Next companies"
                    : "Next regions"
              }
              onClick={rotateNext}
              disabled={
                mode === "role"
                  ? !canRotateSectors
                  : mode === "company"
                    ? !canRotateCompanies
                    : !canRotateLocations
              }
            >
              {">"}
            </button>
          </div>
        </div>
        {mode === "role" ? (
          <>
            {eligibleRoleCategories.length === 0 ? (
              <p className={"[margin:0_0_22px] [font-size:0.95rem] [color:#64748b] text-center [max-width:72ch] [margin-inline:auto]"}>
                No role categories currently meet the minimum of {MIN_BROWSE_ROLE_COUNT} live jobs.
              </p>
            ) : (
              <div className={"flex [align-items:center] [gap:10px] max-[560px]:[align-items:stretch]"}>
                <div
                  className={`${"grid [grid-template-columns:repeat(4,_minmax(0,_1fr))] [grid-auto-rows:minmax(144px,_auto)] [gap:14px] [flex:1] [align-items:stretch] [transition:transform_220ms_ease,_opacity_220ms_ease] [&>_*]:min-w-0 [&>_*]:h-full [&>_*]:[align-self:stretch] max-[1023px]:[grid-template-columns:repeat(2,_minmax(0,_1fr))] max-[560px]:[grid-template-columns:1fr]"} ${
                    specialtyAnim === "left"
                      ? "[transform:translateX(-20px)_scale(0.97)] [opacity:0.82] [&>_*]:[animation:carouselCardsSlideLeft_480ms_cubic-bezier(0.22,_1,_0.36,_1)]"
                      : specialtyAnim === "right"
                        ? "[transform:translateX(20px)_scale(0.97)] [opacity:0.82] [&>_*]:[animation:carouselCardsSlideRight_480ms_cubic-bezier(0.22,_1,_0.36,_1)]"
                        : ""
                  }`}
                >
                  {visibleSectorCards.map((c) => (
                    <CategoryCard
                      key={c.id}
                      title={c.title}
                      gradient={c.gradient}
                      count={counts.get(c.id) ?? 0}
                      onSelect={() => onSelectCategory(c)}
                    />
                  ))}
                </div>
              </div>
            )}
            <div className={"[margin-top:16px] flex [justify-content:center]"}>
              <a className={"inline-flex min-h-11 [align-items:center] [justify-content:center] [border:1px_solid_rgba(91,_79,_232,_0.14)] [background:#ffffff] [color:#1A1160] [border-radius:999px] [padding:0_16px] [font-size:0.82rem] font-black no-underline hover:[background:#EDE9FF]"} href="/roles">
                View all job roles
              </a>
            </div>
          </>
        ) : mode === "company" ? (
          <>
            <div className={"flex [align-items:center] [gap:10px] max-[560px]:[align-items:stretch]"}>
              <div
                className={`${"grid [grid-template-columns:repeat(4,_minmax(0,_1fr))] [grid-auto-rows:minmax(144px,_auto)] [gap:14px] [flex:1] [align-items:stretch] [transition:transform_220ms_ease,_opacity_220ms_ease] [&>_*]:min-w-0 [&>_*]:h-full [&>_*]:[align-self:stretch] max-[1023px]:[grid-template-columns:repeat(2,_minmax(0,_1fr))] max-[560px]:[grid-template-columns:1fr]"} ${
                  companyAnim === "left"
                    ? "[transform:translateX(-20px)_scale(0.97)] [opacity:0.82] [&>_*]:[animation:carouselCardsSlideLeft_480ms_cubic-bezier(0.22,_1,_0.36,_1)]"
                    : companyAnim === "right"
                      ? "[transform:translateX(20px)_scale(0.97)] [opacity:0.82] [&>_*]:[animation:carouselCardsSlideRight_480ms_cubic-bezier(0.22,_1,_0.36,_1)]"
                      : ""
                }`}
              >
                {visibleCompanyCards.map((company) => (
                  <CategoryCard
                    key={company}
                    title={formatCompanyNameForDisplay(company)}
                    gradient={companyGradients.get(company) || defaultCompanyGradient}
                    count={0}
                    iconText={company}
                    hideCount
                    hideCta
                    href={companyPagePath(company)}
                    companyMeta={companyBrowseMeta.get(company)}
                  />
                ))}
              </div>
            </div>
            <div className={"[margin-top:16px] flex [justify-content:center]"}>
              <a className={"inline-flex min-h-11 [align-items:center] [justify-content:center] [border:1px_solid_rgba(91,_79,_232,_0.14)] [background:#ffffff] [color:#1A1160] [border-radius:999px] [padding:0_16px] [font-size:0.82rem] font-black no-underline hover:[background:#EDE9FF]"} href="/companies">
                All companies
              </a>
            </div>
          </>
        ) : (
          <>
            <div className={"flex [align-items:center] [gap:10px] max-[560px]:[align-items:stretch]"}>
              <div
                className={`${"grid [grid-template-columns:repeat(4,_minmax(0,_1fr))] [grid-auto-rows:minmax(144px,_auto)] [gap:14px] [flex:1] [align-items:stretch] [transition:transform_220ms_ease,_opacity_220ms_ease] [&>_*]:min-w-0 [&>_*]:h-full [&>_*]:[align-self:stretch] max-[1023px]:[grid-template-columns:repeat(2,_minmax(0,_1fr))] max-[560px]:[grid-template-columns:1fr]"} ${
                  locationAnim === "left"
                    ? "[transform:translateX(-20px)_scale(0.97)] [opacity:0.82] [&>_*]:[animation:carouselCardsSlideLeft_480ms_cubic-bezier(0.22,_1,_0.36,_1)]"
                    : locationAnim === "right"
                      ? "[transform:translateX(20px)_scale(0.97)] [opacity:0.82] [&>_*]:[animation:carouselCardsSlideRight_480ms_cubic-bezier(0.22,_1,_0.36,_1)]"
                      : ""
                }`}
              >
                {visibleLocationCards.map((item) => (
                  <CategoryCard
                    key={item.slug}
                    title={item.label}
                    gradient={item.gradient}
                    count={item.count}
                    ctaLabel="View jobs"
                    iconImageUrl={item.flagUrl}
                    iconImageAlt={item.slug === "europe" ? "European Union flag" : `${item.label} flag`}
                    href={getLocationPagePath(item.slug)}
                  />
                ))}
              </div>
            </div>
            <div className={"[margin-top:16px] flex [justify-content:center]"}>
              <a className={"inline-flex min-h-11 [align-items:center] [justify-content:center] [border:1px_solid_rgba(91,_79,_232,_0.14)] [background:#ffffff] [color:#1A1160] [border-radius:999px] [padding:0_16px] [font-size:0.82rem] font-black no-underline hover:[background:#EDE9FF]"} href="/locations">
                View all locations
              </a>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
