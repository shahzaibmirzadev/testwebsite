"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { FiX } from "react-icons/fi";
import gsap from "gsap";
import JobDetailMeta from "@/components/job-detail/JobDetailMeta";
import JobDetailProse from "@/components/job-detail/JobDetailProse";
import { formatPostedDetailLine } from "@/lib/jobDetailFormat";
import { getPreferredCompanyDisplayName } from "@/lib/companyDescriptionMatch";
import { getCompanyName, getJobFamily, getLocationDisplayText } from "@/lib/jobFieldHelpers";
import { getCategoryGradientByFamily } from "@/lib/categoryMeta";
import { getJobListingLogoUrlsForDisplay } from "@/lib/companyPageCopy";
import { jobSlug } from "@/lib/slug";
import CompanyLogoPlaceholder from "./CompanyLogoPlaceholder";

/**
 * @param {{
 *   job: Record<string, unknown>|null,
 *   open: boolean,
 *   onClose: () => void,
 *   isMobile: boolean,
 * }} props
 */
export default function JobPreviewPanel({ job, open, onClose, isMobile }) {
  const bubbleRef = useRef(null);
  const [portalHost, setPortalHost] = useState(
    /** @type {HTMLDivElement|null} */ (null)
  );

  useEffect(() => {
    if (!open || !job) return;
    const fn = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [open, onClose, job]);

  useEffect(() => {
    if (!open || !isMobile) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, isMobile]);

  useEffect(() => {
    if (!isMobile || typeof document === "undefined") return;
    const host = document.createElement("div");
    host.setAttribute("data-job-preview-portal", "true");
    document.body.appendChild(host);
    setPortalHost(host);
    return () => {
      setPortalHost(null);
      if (host.parentNode) {
        host.parentNode.removeChild(host);
      }
    };
  }, [isMobile]);

  useEffect(() => {
    if (!open || !job || isMobile || !bubbleRef.current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        bubbleRef.current,
        {
          autoAlpha: 0,
          x: 28,
          scale: 0.985,
          transformOrigin: "100% 12%",
        },
        {
          autoAlpha: 1,
          x: 0,
          scale: 1,
          duration: 0.5,
          ease: "power3.out",
          clearProps: "transform,opacity,visibility",
        }
      );

      gsap.fromTo(
        bubbleRef.current.querySelectorAll("[data-preview-reveal]"),
        {
          autoAlpha: 0,
          y: 16,
        },
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.42,
          ease: "power2.out",
          stagger: 0.06,
          delay: 0.08,
          clearProps: "transform,opacity,visibility",
        }
      );
    }, bubbleRef);

    return () => ctx.revert();
  }, [job, open, isMobile]);

  if (!job) return null;

  const slug = jobSlug(job);
  const detailPath = `/jobs/${slug}`;
  const detailUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}${detailPath}`
      : detailPath;

  const title = String(job.title ?? "Job");
  const company = getCompanyName(job);
  const companyDisplay = getPreferredCompanyDisplayName(job);
  const { primaryUrl: logoUrl, fallbackUrl: logoFallbackUrl, fallbackUrls: logoFallbackUrls } =
    getJobListingLogoUrlsForDisplay(job);
  const family = getJobFamily(job);
  const logoGradient = getCategoryGradientByFamily(family);
  const location = getLocationDisplayText(job);
  const postedLine = formatPostedDetailLine(job);
  const applyUrl = job.apply_url ? String(job.apply_url) : null;

  const bubbleAnimateOpen = isMobile || open;

  const bubble = (
    <div
      ref={bubbleRef}
      className={`${"w-full [max-width:100%] [background:#FFFFFF] [border:1px_solid_var(--border)] [border-radius:16px] [box-shadow:0_10px_28px_rgba(15,_23,_42,_0.1)] flex [flex-direction:column] [max-height:min(84vh,_860px)] overflow-hidden pointer-events-auto [transform-origin:center_top] [transition:transform_0.38s_cubic-bezier(0.4,_0,_0.2,_1),_opacity_0.32s_ease] min-[1024px]:w-full min-[1024px]:[max-height:calc(100vh_-_32px)] max-[1023px]:[border-radius:20px_20px_0_0] max-[1023px]:[max-height:78vh]"} ${bubbleAnimateOpen ? "[opacity:1] [transform:scale(1)_translateY(0)]" : "[opacity:0] [transform:scale(0.97)_translateY(6px)]"}`}
      role="dialog"
      aria-modal={isMobile ? "true" : undefined}
      aria-labelledby="job-preview-title"
    >
      <div className={"flex [align-items:flex-start] [justify-content:space-between] [gap:14px] [padding:14px_14px_10px] [border-bottom:1px_solid_var(--border)] [background:linear-gradient(180deg,_#fafbff_0%,_#ffffff_100%)] [flex-shrink:0] max-[767px]:[padding:12px_12px_10px] max-[767px]:[gap:10px]"} data-preview-reveal>
        <div className={"flex [align-items:flex-start] [gap:14px] min-w-0 max-[767px]:[gap:10px]"}>
          <div className={"flex [flex-direction:column] [align-items:center] [gap:6px] [flex-shrink:0]"}>
            <CompanyLogoPlaceholder
              url={logoUrl}
              fallbackUrl={logoFallbackUrl}
              fallbackUrls={logoFallbackUrls}
              company={companyDisplay}
              accentGradient={logoGradient}
            />
          </div>
          <div className={"min-w-0"}>
            <h2 id="job-preview-title" className={"[margin:0_0_4px] [font-size:0.98rem] font-bold [line-height:1.3] [letter-spacing:-0.02em] max-[767px]:[font-size:0.92rem]"}>
              <Link href={detailPath} className={"[color:inherit] no-underline hover:[color:var(--primary)] hover:underline hover:[text-underline-offset:3px]"}>
                {title}
              </Link>
            </h2>
            <p className={"m-0 font-semibold [font-size:0.84rem] [color:#334155] max-[767px]:[font-size:0.8rem]"}>{companyDisplay || "Company not listed"}</p>
            <p className={"[margin:6px_0_0] [font-size:0.8rem] [line-height:1.35] [color:var(--muted)] max-[767px]:[font-size:0.76rem]"}>
              {location || "Location not listed"}
            </p>
          </div>
        </div>
        <div className={"flex [flex-shrink:0] [align-items:center] [gap:10px] max-[767px]:[gap:8px]"}>
          <a
            className={"[font-size:0.82rem] font-semibold [color:var(--primary)] no-underline [white-space:nowrap] hover:underline hover:[text-underline-offset:3px] max-[767px]:hidden"}
            href={detailUrl}
            target="_blank"
            rel="noreferrer"
          >
            View Full Page
          </a>
          <button
            type="button"
            className={"inline-flex [width:38px] [height:38px] [align-items:center] [justify-content:center] [border:1px_solid_var(--border)] [border-radius:var(--radius-sm)] [background:#f8fafc] cursor-pointer [color:var(--text)] hover:[background:#f1f5f9] hover:[color:var(--primary)] max-[767px]:[width:34px] max-[767px]:[height:34px]"}
            onClick={onClose}
            aria-label="Close preview"
          >
            <FiX aria-hidden className="h-4 w-4" />
          </button>
        </div>
      </div>

      {postedLine || applyUrl ? (
        <div className={"[padding:9px_14px_0] [flex-shrink:0] max-[767px]:[padding:8px_12px_0]"} data-preview-reveal>
          <div className={"flex [align-items:flex-start] [justify-content:space-between] [gap:10px] max-[767px]:[flex-direction:column] max-[767px]:[align-items:stretch]"}>
            <div>
              {postedLine ? <p className={"[margin:0_0_6px] [font-size:0.78rem] [color:var(--muted)] max-[767px]:[font-size:0.74rem]"}>{postedLine}</p> : null}
            </div>
            {applyUrl ? (
              <a
                className={"inline-flex min-w-[110px] items-center justify-center rounded-[8px] bg-[#5B4FE8] px-4 py-2 text-sm font-black text-[#FFFFFF] no-underline hover:bg-[#1A1160] max-[900px]:w-full"}
                href={applyUrl}
                target="_blank"
                rel="noreferrer"
              >
                Apply
              </a>
            ) : null}
          </div>
        </div>
      ) : null}

      <section className="bg-[#FFFFFF] px-4 pt-4 max-[767px]:px-3 max-[767px]:pt-3" data-preview-reveal>
        <h3 className="m-0 text-xs font-black uppercase tracking-[0.12em] text-[#5B4FE8]">
          Job Snapshot
        </h3>
        <JobDetailMeta job={job} />
      </section>

      <div className={"[flex:1] [min-height:0] overflow-y-auto [padding:14px_16px_16px] [border-top:1px_solid_transparent] [background:#FFFFFF] max-[767px]:[padding:12px_12px_14px]"} data-preview-reveal>
        <h3 className="mt-0 mb-3 text-xs font-black uppercase tracking-[0.12em] text-[#5B4FE8]">
          Job Description
        </h3>
        <JobDetailProse job={job} proseClassName={"[font-size:0.9rem] [&p]:[line-height:1.72]"} />
      </div>

      <div className={"[flex-shrink:0] flex [flex-direction:column] [gap:8px] [padding:12px_14px_14px] [border-top:1px_solid_var(--border)] [background:#FFFFFF] max-[767px]:[padding:10px_12px_12px]"} data-preview-reveal>
        {applyUrl ? (
          <a
            className={`${"max-[767px]:[flex:1] inline-flex [align-items:center] [justify-content:center] [gap:8px] [padding:11px_18px] [border-radius:0] [font-size:0.9rem] font-semibold border-0 cursor-pointer [transition:background_0.12s_ease,_color_0.12s_ease,_box-shadow_0.12s_ease] w-full [border-radius:var(--radius-sm)] no-underline text-center"} ${"[background:var(--primary)] [color:#fff] [border-radius:var(--radius-sm)] hover:[background:var(--primary-hover)]"}`}
            href={applyUrl}
            target="_blank"
            rel="noreferrer"
          >
            Apply
          </a>
        ) : null}
        <a
          className={`${"max-[767px]:[flex:1] inline-flex [align-items:center] [justify-content:center] [gap:8px] [padding:11px_18px] [border-radius:0] [font-size:0.9rem] font-semibold border-0 cursor-pointer [transition:background_0.12s_ease,_color_0.12s_ease,_box-shadow_0.12s_ease] w-full [border-radius:var(--radius-sm)] no-underline text-center"} ${"[background:var(--surface)] [color:var(--primary)] [border:1px_solid_rgba(91,_79,_232,_0.28)] hover:[background:var(--primary-soft)]"}`}
          href={detailUrl}
          target="_blank"
          rel="noreferrer"
        >
          View Full Page
        </a>
        <button
          type="button"
          className={"[font-size:0.88rem] font-semibold [color:var(--muted)] [background:none] border-0 cursor-pointer [padding:8px_0] text-center hover:[color:var(--text)]"}
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </div>
  );

  if (isMobile) {
    if (!open || !portalHost || !portalHost.isConnected) return null;
    return createPortal(
      <>
        <button
          type="button"
          className={"fixed [inset:0] [z-index:230] m-0 p-0 border-0 [background:rgba(15,_23,_42,_0.28)] [cursor:default] [animation:previewFadeIn_0.22s_ease]"}
          aria-label="Close preview"
          onClick={onClose}
        />
        <div className={"fixed [left:0] [right:0] [bottom:0] [z-index:240] flex [justify-content:center] [align-items:flex-end] pointer-events-none [padding:0_10px_0] [animation:previewSheetUp_0.32s_cubic-bezier(0.22,_1,_0.36,_1)]"}>{bubble}</div>
      </>,
      portalHost
    );
  }

  return bubble;
}
