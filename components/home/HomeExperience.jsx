"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import gsap from "gsap";
import {
  countAdvancedFilterSelections,
  createInitialFilterState,
  isFilterDirty,
} from "@/lib/filterConfig";
import { filterAndSortJobs } from "@/lib/filterJobs";
import { getCompanyName, getLocationDisplayText } from "@/lib/jobFieldHelpers";
import { jobSlug } from "@/lib/slug";
import { filtersToSearchParams, searchParamsToFilters } from "@/lib/urlFilters";
import CategoryGrid from "./CategoryGrid";
import ContactBanner from "./ContactBanner";
import FilterPanel from "./FilterPanel";
import HeroSearchBar from "./HeroSearchBar";
import HeroSection from "./HeroSection";
import HomeMotion from "./HomeMotion";
import JobPreviewPanel from "./JobPreviewPanel";
import JobResultsList from "./JobResultsList";
import MobileFilterDrawer from "./MobileFilterDrawer";
import PaginationControls from "./PaginationControls";
import CustomSelect from "./CustomSelect";

function formatCompactStat(value, label) {
  return `${new Intl.NumberFormat("en").format(Math.max(0, Number(value || 0)))} ${label}`;
}

/**
 * @param {{
 *   initialJobs: Record<string, unknown>[],
 *   trackedCompanies?: string[],
 *   trackedCompaniesCount?: number,
 *   liveRolesCount?: number,
 *   lifetimeRolesCount?: number,
 *   hideDiscovery?: boolean,
 *   hideContactBanner?: boolean,
 *   hideDesktopPreview?: boolean,
 *   quickJobFamilies?: string[],
 *   previewStartsHidden?: boolean,
 *   hideDesktopPreviewAsideWhenEmpty?: boolean,
 *   companyLazyLoad?: { slug: string, companyName: string, total: number, initialCount: number },
 * }} props
 */
export default function HomeExperience({
  initialJobs,
  trackedCompanies = [],
  trackedCompaniesCount = 0,
  liveRolesCount = 0,
  lifetimeRolesCount = 0,
  hideDiscovery = false,
  hideContactBanner = false,
  hideDesktopPreview = false,
  quickJobFamilies = [],
  /** When true, do not auto-select the first listing (avoids mobile job sheet on load). */
  previewStartsHidden = true,
  /** When true, omit the desktop preview column until a job is opened (e.g. company page). */
  hideDesktopPreviewAsideWhenEmpty = false,
  companyLazyLoad,
}) {
  const PAGE_SIZE_OPTIONS = [10, 20, 50, 100].map((size) => ({
    value: String(size),
    label: String(size),
  }));
  const SORT_OPTIONS = [
    { value: "newest", label: "Newest first" },
    { value: "oldest", label: "Oldest first" },
    { value: "relevance", label: "Relevance" },
  ];
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState(createInitialFilterState);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);
  const [previewJob, setPreviewJob] = useState(
    /** @type {Record<string, unknown>|null} */ (null)
  );
  const [desktopPreviewDismissed, setDesktopPreviewDismissed] = useState(false);
  const [isDesktop, setIsDesktop] = useState(true);
  const [showTopFilters, setShowTopFilters] = useState(false);
  const [renderTopFilters, setRenderTopFilters] = useState(false);
  const [urlSyncEnabled, setUrlSyncEnabled] = useState(false);
  const [remoteJobs, setRemoteJobs] = useState(
    /** @type {Record<string, unknown>[]} */ ([])
  );
  const [remoteTotalItems, setRemoteTotalItems] = useState(0);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteError, setRemoteError] = useState("");
  const [lazyCompanyJobs, setLazyCompanyJobs] = useState(
    /** @type {Record<string, unknown>[]} */ ([])
  );
  const [companyLoading, setCompanyLoading] = useState(false);
  const remoteReqId = useRef(0);
  const urlDebounce = useRef(null);
  const hydratedFromUrl = useRef(false);
  const topFiltersRef = useRef(null);
  const previewSlotRef = useRef(null);

  useEffect(() => {
    if (showTopFilters) setRenderTopFilters(true);
  }, [showTopFilters]);

  const jobsForListing = useMemo(() => {
    if (!companyLazyLoad) return initialJobs;
    return [...initialJobs, ...lazyCompanyJobs];
  }, [initialJobs, lazyCompanyJobs, companyLazyLoad]);

  useEffect(() => {
    if (!companyLazyLoad) {
      setLazyCompanyJobs([]);
      setCompanyLoading(false);
      return;
    }
    setLazyCompanyJobs([]);
    setCompanyLoading(false);
  }, [companyLazyLoad]);

  useEffect(() => {
    if (!companyLazyLoad) return;
    if (isFilterDirty(state)) return;

    let cancelled = false;
    const { companyName, total } = companyLazyLoad;
    const loadedCount = initialJobs.length + lazyCompanyJobs.length;
    const neededCount = Math.min(total, page * pageSize);
    if (loadedCount >= neededCount) return;

    const fetchMissing = async () => {
      setCompanyLoading(true);
      let offset = loadedCount;
      while (offset < neededCount && !cancelled) {
        const limit = Math.min(100, neededCount - offset);
        const res = await fetch(
          `/api/company-jobs?companyName=${encodeURIComponent(companyName)}&offset=${offset}&limit=${limit}`
        );
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.ok || cancelled) break;
        const chunk = Array.isArray(json.jobs) ? json.jobs : [];
        if (chunk.length === 0) break;
        setLazyCompanyJobs((prev) => [...prev, ...chunk]);
        offset += chunk.length;
      }
      if (!cancelled) setCompanyLoading(false);
    };

    fetchMissing().catch(() => {
      if (!cancelled) setCompanyLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [companyLazyLoad, initialJobs.length, lazyCompanyJobs.length, page, pageSize, state]);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (hydratedFromUrl.current) return;
    const params = new URLSearchParams(window.location.search);
    const hasParams = params.toString().length > 0;
    if (hasParams) {
      setState(searchParamsToFilters(params));
    }
    hydratedFromUrl.current = true;
    setUrlSyncEnabled(true);
  }, []);

  useEffect(() => {
    if (!urlSyncEnabled) return;
    if (urlDebounce.current) clearTimeout(urlDebounce.current);
    urlDebounce.current = setTimeout(() => {
      const p = filtersToSearchParams(state);
      const s = p.toString();
      const next = s ? `${pathname}?${s}` : pathname;
      router.replace(next, { scroll: false });
    }, 320);
    return () => {
      if (urlDebounce.current) clearTimeout(urlDebounce.current);
    };
  }, [state, pathname, router, urlSyncEnabled]);

  const setPartial = useCallback((u) => {
    setState((s) => ({ ...s, ...u }));
  }, []);

  const toggleArray = useCallback((key, value) => {
    setState((s) => {
      const arr = s[key];
      if (!Array.isArray(arr)) return s;
      const has = arr.includes(value);
      return {
        ...s,
        [key]: has ? arr.filter((x) => x !== value) : [...arr, value],
      };
    });
  }, []);

  const onClearAll = useCallback(() => {
    setState(createInitialFilterState());
  }, []);

  const goToBrowse = useCallback(() => {
    if (!isDesktop) {
      setMobileFiltersOpen(true);
      setTimeout(() => {
        document
          .getElementById("latest-jobs")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 120);
      return;
    }
    document
      .getElementById("browse-listings")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [isDesktop]);

  const scrollToJobs = useCallback(() => {
    document
      .getElementById("latest-jobs")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const onSelectCategory = useCallback(
    (category) => {
      const nextSector = category?.id ? String(category.id) : "";
      setDesktopPreviewDismissed(false);
      setPreviewJob(null);
      setState((s) => ({
        ...createInitialFilterState(),
        sort: s.sort,
        location: s.location,
        sector: nextSector,
      }));
      requestAnimationFrame(() => scrollToJobs());
    },
    [scrollToJobs]
  );

  const toggleQuickFamily = useCallback((family) => {
    setState((s) => {
      const has = s.jobFamilies.includes(family);
      return {
        ...s,
        jobFamilies: has ? s.jobFamilies.filter((x) => x !== family) : [...s.jobFamilies, family],
      };
    });
  }, []);

  const openPreview = useCallback((job) => {
    setDesktopPreviewDismissed(false);
    if (previewSlotRef.current) {
      gsap.killTweensOf(previewSlotRef.current);
    }
    setPreviewJob(job);
  }, []);

  const closePreview = useCallback(() => {
    setDesktopPreviewDismissed(true);
    if (isDesktop && previewJob && previewSlotRef.current) {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        setPreviewJob(null);
        return;
      }

      const element = previewSlotRef.current;
      gsap.killTweensOf(element);
      gsap.to(element, {
        autoAlpha: 0,
        x: 28,
        scale: 0.985,
        filter: "blur(6px)",
        duration: 0.24,
        ease: "power2.in",
        onComplete: () => {
          setPreviewJob(null);
          gsap.set(element, {
            clearProps: "opacity,visibility,transform,filter",
          });
        },
      });
      return;
    }

    setPreviewJob(null);
  }, [isDesktop, previewJob]);

  const handlePageChange = useCallback((nextPage) => {
    setPage(nextPage);
    requestAnimationFrame(() => {
      document
        .getElementById("latest-jobs")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  const companies = useMemo(() => {
    const set = new Set();
    jobsForListing.forEach((j) => {
      const c = getCompanyName(j);
      if (c) set.add(c);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [jobsForListing]);

  const locationSuggestions = useMemo(() => {
    const seen = new Set();
    for (const job of jobsForListing) {
      const line = getLocationDisplayText(job);
      if (!line) continue;
      if (line.length < 2 || line.length > 80) continue;
      seen.add(line);
      if (seen.size >= 250) break;
    }
    return Array.from(seen).sort((a, b) => a.localeCompare(b));
  }, [jobsForListing]);

  const filteredJobs = useMemo(
    () => filterAndSortJobs(jobsForListing, state),
    [jobsForListing, state]
  );
  const canClearAll = useMemo(() => isFilterDirty(state), [state]);
  const useRemoteResults = !companyLazyLoad && canClearAll;
  const advancedFilterCount = useMemo(
    () => countAdvancedFilterSelections(state),
    [state]
  );
  const totalItems = useRemoteResults
    ? remoteTotalItems
    : companyLazyLoad && !canClearAll
      ? companyLazyLoad.total
      : filteredJobs.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  useEffect(() => {
    setPage(1);
  }, [state, pageSize]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const pagedJobs = useMemo(() => {
    if (useRemoteResults) return remoteJobs;
    const start = (page - 1) * pageSize;
    return filteredJobs.slice(start, start + pageSize);
  }, [filteredJobs, page, pageSize, remoteJobs, useRemoteResults]);

  useEffect(() => {
    if (!useRemoteResults) {
      setRemoteJobs([]);
      setRemoteTotalItems(0);
      setRemoteLoading(false);
      setRemoteError("");
      return;
    }

    const reqId = ++remoteReqId.current;
    const controller = new AbortController();
    setRemoteLoading(true);
    setRemoteError("");

    const timer = setTimeout(() => {
      fetch("/api/jobs-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          state,
          page,
          pageSize,
        }),
        signal: controller.signal,
      })
        .then(async (res) => {
          const json = await res
            .json()
            .catch(() => ({ ok: false, error: `search_invalid_json:${res.status}` }));
          if (!res.ok || !json?.ok) {
            throw new Error(String(json?.error || `search_request_failed:${res.status}`));
          }
          if (reqId !== remoteReqId.current) return;
          setRemoteJobs(Array.isArray(json.jobs) ? json.jobs : []);
          setRemoteTotalItems(Math.max(0, Number(json.totalItems || 0)));
        })
        .catch((error) => {
          if (controller.signal.aborted) return;
          if (reqId !== remoteReqId.current) return;
          setRemoteError(String(error?.message || error));
          setRemoteJobs([]);
          setRemoteTotalItems(0);
        })
        .finally(() => {
          if (reqId !== remoteReqId.current) return;
          setRemoteLoading(false);
        });
    }, 220);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [useRemoteResults, state, page, pageSize]);

  useEffect(() => {
    if (!isDesktop) return;
    if (pagedJobs.length === 0) {
      setPreviewJob(null);
      return;
    }
    const previewSlug = previewJob ? jobSlug(previewJob) : null;
    const hasPreviewInPage = previewSlug
      ? pagedJobs.some((job) => jobSlug(job) === previewSlug)
      : false;

    if (hasPreviewInPage) return;
    if (desktopPreviewDismissed && previewJob == null) return;
    if (desktopPreviewDismissed && !previewSlug) return;
    if (previewStartsHidden && !previewSlug) return;
    setDesktopPreviewDismissed(false);
    setPreviewJob(pagedJobs[0]);
  }, [isDesktop, previewJob, pagedJobs, desktopPreviewDismissed, previewStartsHidden]);

  const desktopPreviewVisible =
    isDesktop && !hideDesktopPreview && (!hideDesktopPreviewAsideWhenEmpty || previewJob);

  useLayoutEffect(() => {
    if (!isDesktop || !desktopPreviewVisible || !previewSlotRef.current) return undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;

    const element = previewSlotRef.current;
    gsap.killTweensOf(element);

    const ctx = gsap.context(() => {
      if (previewJob) {
        gsap.fromTo(
          element,
          {
            autoAlpha: 0,
            x: 34,
            scale: 0.985,
            filter: "blur(8px)",
            transformOrigin: "100% 12%",
          },
          {
            autoAlpha: 1,
            x: 0,
            scale: 1,
            filter: "blur(0px)",
            duration: 0.46,
            ease: "power3.out",
            clearProps: "opacity,visibility,transform,filter",
          }
        );
        return;
      }

      gsap.fromTo(
        element,
        {
          autoAlpha: 0,
          y: 14,
          scale: 0.99,
        },
        {
          autoAlpha: 1,
          y: 0,
          scale: 1,
          duration: 0.34,
          ease: "power2.out",
          clearProps: "opacity,visibility,transform",
        }
      );

      gsap.fromTo(
        element.querySelectorAll("[data-preview-empty-item]"),
        {
          autoAlpha: 0,
          y: 10,
        },
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.32,
          ease: "power2.out",
          stagger: 0.06,
          delay: 0.08,
          clearProps: "opacity,visibility,transform",
        }
      );
    }, element);

    return () => ctx.revert();
  }, [desktopPreviewVisible, isDesktop, previewJob]);

  useLayoutEffect(() => {
    if (!renderTopFilters || !topFiltersRef.current) return undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      if (!showTopFilters) setRenderTopFilters(false);
      return undefined;
    }

    const element = topFiltersRef.current;
    const contentHeight = element.scrollHeight;
    gsap.killTweensOf(element);

    if (showTopFilters) {
      gsap.fromTo(
        element,
        {
          height: 0,
          autoAlpha: 0,
          y: -12,
        },
        {
          height: contentHeight,
          autoAlpha: 1,
          y: 0,
          duration: 0.28,
          ease: "power2.out",
          onComplete: () => {
            gsap.set(element, { clearProps: "height" });
          },
        }
      );
      return undefined;
    }

    gsap.fromTo(
      element,
      {
        height: element.offsetHeight,
        autoAlpha: 1,
        y: 0,
      },
      {
        height: 0,
        autoAlpha: 0,
        y: -10,
        duration: 0.22,
        ease: "power2.in",
        onComplete: () => setRenderTopFilters(false),
      }
    );
    return undefined;
  }, [showTopFilters, renderTopFilters]);

  return (
    <div
      className={"[min-height:100vh] [background:#FFFCF7] [color:#1C1C1A]"}
      style={{
        "--bg": "#FFFCF7",
        "--surface": "#FFFFFF",
        "--text": "#1C1C1A",
        "--muted": "#665A50",
        "--border": "rgba(91, 79, 232, 0.14)",
        "--primary": "#5B4FE8",
        "--primary-hover": "#1A1160",
        "--primary-soft": "#EDE9FF",
        "--radius": "8px",
        "--radius-sm": "8px",
        "--shadow-md": "0 18px 40px rgba(28, 28, 26, 0.08)",
      }}
      data-home-page
    >
      <HomeMotion />
      {hideDiscovery ? null : (
        <div className={"overflow-visible"}>
          <HeroSection>
            <HeroSearchBar
              totalJobs={totalItems}
              trackedCompaniesCount={trackedCompaniesCount}
              liveRolesCount={liveRolesCount}
              lifetimeRolesCount={lifetimeRolesCount}
              locationSuggestions={locationSuggestions}
              state={state}
              setState={setPartial}
              toggleArray={toggleArray}
              onSearch={scrollToJobs}
              onGoToBrowse={goToBrowse}
              onMobileFiltersOpen={() => setMobileFiltersOpen(true)}
              isDesktop={isDesktop}
            />
          </HeroSection>

          <CategoryGrid
            jobs={jobsForListing}
            trackedCompanies={trackedCompanies}
            onSelectCategory={onSelectCategory}
          />
        </div>
      )}

      <div
        className={`${"[max-width:1120px] [margin:0_auto] [padding:0_20px] [transition:max-width_0.48s_cubic-bezier(0.4,_0,_0.2,_1)]"} ${desktopPreviewVisible ? "min-[1024px]:[max-width:min(1480px,_calc(100vw_-_40px))]" : ""}`}
      >
        <div id="browse-listings" className={"scroll-mt-24 [padding-top:12px]"}>
          <div
            className={`${"min-w-0"} ${isDesktop ? "min-w-0" : ""}`}
          >
            <section id="latest-jobs" className={"relative z-[20] grid [gap:16px] [margin-bottom:16px] [padding-top:28px]"} data-home-scroll>
              <div className="rounded-[8px] border border-[rgba(91,79,232,0.14)] bg-[#FFFFFF] px-5 py-5 shadow-[0_16px_34px_rgba(28,28,26,0.05)] sm:px-6">
                <div className={"flex [align-items:flex-end] [justify-content:space-between] [gap:14px] max-[980px]:[flex-direction:column] max-[980px]:[align-items:stretch]"}>
                  <div>
                    <p className={"m-0 [font-size:0.72rem] font-black [letter-spacing:0.12em] [text-transform:uppercase] [color:#5B4FE8]"}>Live roles</p>
                    <h2 className={"font-black [letter-spacing:-0.03em] [color:#1C1C1A] [margin:4px_0_8px] [font-size:clamp(1.65rem,_2.7vw,_2.35rem)]"}>Featured openings</h2>
                    <p className={"m-0 max-w-2xl [font-size:0.95rem] [line-height:1.6] [color:#665A50]"}>
                      High-priority roles based on recency and data quality from tracked drone companies.
                    </p>
                  </div>
                  <div className={"flex [flex-direction:column] [align-items:flex-end] [gap:10px] [width:min(520px,_46vw)] [margin-left:auto] max-[980px]:[align-items:flex-start] max-[980px]:w-full"}>
                    <div className={"flex [flex-wrap:wrap] [justify-content:flex-end] [gap:8px] max-[980px]:[justify-content:flex-start]"}>
                      <span className={"inline-flex min-h-9 items-center justify-center rounded-full border border-[rgba(91,79,232,0.16)] bg-[rgba(237,233,255,0.72)] px-3 text-[0.72rem] font-black text-[#1A1160]"}>
                        {formatCompactStat(liveRolesCount || totalItems, "live")}
                      </span>
                      <span className={"inline-flex min-h-9 items-center justify-center rounded-full border border-[rgba(180,83,9,0.16)] bg-[rgba(255,248,237,0.92)] px-3 text-[0.72rem] font-black text-[#7C3F12]"}>
                        {formatCompactStat(trackedCompaniesCount, "tracked")}
                      </span>
                      <span className={"inline-flex min-h-9 items-center justify-center rounded-full border border-[rgba(91,79,232,0.16)] bg-[#FFFFFF] px-3 text-[0.72rem] font-black text-[#1A1160]"}>
                        {formatCompactStat(lifetimeRolesCount, "lifetime")}
                      </span>
                    </div>
                    <div className={"grid [grid-template-columns:repeat(2,minmax(0,1fr))] [align-items:end] [gap:10px] [width:min(440px,_40vw)] [margin-left:auto] max-[980px]:w-full max-[540px]:[grid-template-columns:1fr]"}>
                      <div className={"[font-size:0.64rem] grid [gap:6px] [&label]:[font-size:0.72rem] [&label]:font-semibold [&label]:[color:var(--muted)] [&label]:[text-transform:uppercase] [&label]:[letter-spacing:0.06em] [&label]:[white-space:nowrap]"}>
                        <label htmlFor="topPageSize">Per page</label>
                        <CustomSelect
                          value={String(pageSize)}
                          onChange={(nextValue) => setPageSize(Number(nextValue))}
                          options={PAGE_SIZE_OPTIONS}
                          label="Per page"
                          minWidthClass="min-w-0"
                          buttonMinHeightClass="min-h-10"
                        />
                      </div>
                      <div className={"[font-size:0.64rem] grid [gap:6px] [&label]:[font-size:0.72rem] [&label]:font-semibold [&label]:[color:var(--muted)] [&label]:[text-transform:uppercase] [&label]:[letter-spacing:0.06em] [&label]:[white-space:nowrap]"}>
                        <label htmlFor="topSort">Sort</label>
                        <CustomSelect
                          value={state.sort}
                          onChange={(nextValue) => setPartial({ sort: nextValue })}
                          options={SORT_OPTIONS}
                          label="Sort"
                          minWidthClass="min-w-0"
                          buttonMinHeightClass="min-h-10"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>
            <section
              className={`${"flex [align-items:center] [gap:10px] [margin:0_0_14px] [padding:12px_14px] [border:1px_solid_rgba(91,_79,_232,_0.14)] [border-radius:8px] [background:#ffffff] max-[980px]:[flex-wrap:wrap] max-[980px]:[align-items:flex-start]"} ${showTopFilters ? "[box-shadow:0_14px_30px_rgba(28,_28,_26,_0.05)]" : ""}`}
              aria-label="Quick filters"
            >
              <button
                type="button"
                className={`${"max-[767px]:[flex:1] inline-flex [align-items:center] [justify-content:center] [gap:8px] [padding:9px_14px] [font-size:0.85rem] font-black border cursor-pointer [transition:background_0.12s_ease,_color_0.12s_ease,_box-shadow_0.12s_ease] w-auto [border-radius:8px] no-underline text-center"} ${"[background:#FFFFFF] [color:#1A1160] [border-color:rgba(91,_79,_232,_0.16)] hover:[background:#EDE9FF]"}`}
                onClick={() => setShowTopFilters((s) => !s)}
              >
                {showTopFilters ? "Hide filters" : "Show filters"}
                {advancedFilterCount > 0 ? (
                  <span className={"inline-flex [align-items:center] [justify-content:center] [min-width:1.35rem] [height:1.35rem] [padding:0_6px] [border-radius:999px] [font-size:0.72rem] font-bold [background:var(--primary)] [color:#fff]"}>{advancedFilterCount}</span>
                ) : null}
              </button>
              <p className={"m-0 [font-size:0.8rem] [color:#64748b]"}>
                Expand to refine by role, tags, company, location, and recency.
              </p>
              {canClearAll ? (
                <button type="button" className={"[font-size:0.82rem] font-semibold [color:var(--primary)] [background:none] border-0 cursor-pointer [padding:0_0_0_4px] underline [text-underline-offset:3px]"} onClick={onClearAll}>
                  Clear all
                </button>
              ) : null}
            </section>
            {renderTopFilters ? (
              <div ref={topFiltersRef} className={"overflow-visible"}>
              <section className={"[margin:0_0_16px] grid [gap:8px] w-full [margin-left:0] relative [z-index:80] [padding-left:0] overflow-visible max-[980px]:w-full max-[980px]:[border-left:none] max-[980px]:[padding-left:0]"}>
                {quickJobFamilies.length > 0 ? (
                  <div className={"[margin:0_0_12px] [border:1px_solid_#dce4f1] [background:#ffffff] [border-radius:12px] [padding:12px]"}>
                    <p className={"[margin:0_0_10px] [font-size:0.68rem] font-bold [text-transform:uppercase] [letter-spacing:0.08em] [color:#64748b]"}>Departments</p>
                    <div className={"flex [flex-wrap:wrap] [gap:8px]"}>
                      {quickJobFamilies.map((family) => {
                        const on = state.jobFamilies.includes(family);
                        return (
                          <button
                            key={family}
                            type="button"
                            className={`${"[border:1px_solid_#d7deea] [background:#f8fbff] [color:#334155] [border-radius:999px] [padding:6px_10px] [font-size:0.76rem] font-semibold cursor-pointer"} ${on ? "[border-color:rgba(37,_99,_235,_0.45)] [background:rgba(37,_99,_235,_0.12)] [color:#1d4ed8]" : ""}`}
                            aria-pressed={on}
                            onClick={() => toggleQuickFamily(family)}
                          >
                            {family}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
                <FilterPanel
                  variant="topbar"
                  idPrefix="sidebar"
                  state={state}
                  setState={setPartial}
                  toggleArray={toggleArray}
                  companies={companies}
                  onClearAll={onClearAll}
                  canClearAll={canClearAll}
                />
              </section>
              </div>
            ) : null}
            <div
              className={`${"w-full min-w-0"} ${isDesktop ? "min-[1024px]:flex min-[1024px]:[align-items:flex-start] min-[1024px]:[justify-content:flex-start] min-[1024px]:[gap:18px] min-[1024px]:w-full min-[1024px]:box-border" : ""} ${desktopPreviewVisible ? "[&_.resultsListCol]:[flex:0_0_min(520px,_36vw)] [&_.resultsListCol]:[width:min(520px,_36vw)]" : ""}`}
            >
              <div className={"resultsListCol min-[1024px]:[flex:1_1_auto] min-[1024px]:min-w-0 min-[1024px]:w-full"}>
                <JobResultsList
                  jobs={pagedJobs}
                  onOpenPreview={openPreview}
                  previewSlug={previewJob ? jobSlug(previewJob) : null}
                />
                {companyLazyLoad && companyLoading ? (
                  <p className={"m-0 [font-size:0.86rem] [margin:0_0_22px] [font-size:0.95rem] [color:#64748b]"} style={{ marginTop: 10 }}>
                    Loading more openings…
                  </p>
                ) : null}
                {useRemoteResults && remoteLoading ? (
                  <p className={"m-0 [font-size:0.86rem] [margin:0_0_22px] [font-size:0.95rem] [color:#64748b]"} style={{ marginTop: 10 }}>
                    Loading full matching results...
                  </p>
                ) : null}
                {useRemoteResults && remoteError ? (
                  <p className={"m-0 [font-size:0.86rem] [margin:0_0_22px] [font-size:0.95rem] [color:#64748b]"} style={{ marginTop: 10, color: "#b91c1c" }}>
                    Search sync issue: {remoteError}
                  </p>
                ) : null}
                <PaginationControls
                  page={page}
                  pageSize={pageSize}
                  totalItems={totalItems}
                  totalPages={totalPages}
                  onPageChange={handlePageChange}
                  onPageSizeChange={setPageSize}
                />
              </div>

              {desktopPreviewVisible ? (
                <div className={"min-[1024px]:[flex:1_1_0] min-[1024px]:box-border min-[1024px]:sticky min-[1024px]:[top:16px] min-[1024px]:[align-self:flex-start] min-[1024px]:[max-height:calc(100vh_-_40px)] min-[1024px]:[width:auto] min-[1024px]:[min-width:0] min-[1024px]:[max-width:none] min-[1024px]:overflow-hidden"}>
                  <div ref={previewSlotRef} className={"w-full"}>
                    {previewJob ? (
                      <JobPreviewPanel
                        job={previewJob}
                        open
                        onClose={closePreview}
                        isMobile={false}
                      />
                    ) : (
                      <div
                        data-preview-empty
                        className={"[border:1px_dashed_#cfd7e3] [border-radius:14px] [background:#ffffff] [padding:20px] [color:#5b687a] overflow-hidden"}
                      >
                        <p
                          data-preview-empty-item
                          className={"[margin:0_0_8px] [font-size:0.95rem] font-bold [color:#1f2937]"}
                        >
                          Select a role
                        </p>
                        <p
                          data-preview-empty-item
                          className={"m-0 [font-size:0.86rem] [line-height:1.5]"}
                        >
                          Choose a listing to view description and apply details.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <MobileFilterDrawer
        open={mobileFiltersOpen}
        onClose={() => setMobileFiltersOpen(false)}
      >
        <FilterPanel
          variant="drawer"
          idPrefix="drawer"
          state={state}
          setState={setPartial}
          toggleArray={toggleArray}
          companies={companies}
          onClearAll={onClearAll}
          canClearAll={canClearAll}
        />
        <button
          type="button"
          className={`${"max-[767px]:[flex:1] inline-flex [align-items:center] [justify-content:center] [gap:8px] [padding:11px_18px] [border-radius:0] [font-size:0.9rem] font-semibold border-0 cursor-pointer [transition:background_0.12s_ease,_color_0.12s_ease,_box-shadow_0.12s_ease] w-full [border-radius:var(--radius-sm)] no-underline text-center"} ${"[background:var(--primary)] [color:#fff] [border-radius:var(--radius-sm)] hover:[background:var(--primary-hover)]"}`}
          style={{ width: "100%", marginTop: 16 }}
          onClick={() => setMobileFiltersOpen(false)}
        >
          View results
        </button>
      </MobileFilterDrawer>

      {!isDesktop && !hideDesktopPreview ? (
        <JobPreviewPanel
          job={previewJob}
          open={previewJob != null}
          onClose={closePreview}
          isMobile
        />
      ) : null}

      {hideContactBanner ? null : <ContactBanner />}
    </div>
  );
}
