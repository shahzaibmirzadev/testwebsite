"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { FiArrowRight } from "react-icons/fi";
import { getHomeUpdatedBadgeText } from "@/lib/updateBadge";

/**
 * @param {{ children?: React.ReactNode }} props
 */
export default function HeroSection({ children }) {
  const [updatedBadgeText, setUpdatedBadgeText] = useState(() => getHomeUpdatedBadgeText());

  useEffect(() => {
    const interval = window.setInterval(() => {
      setUpdatedBadgeText(getHomeUpdatedBadgeText());
    }, 60000);
    return () => window.clearInterval(interval);
  }, []);

  const handleBrowseClick = (event) => {
    event.preventDefault();
    document
      .getElementById("browse-listings")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <header className="relative overflow-x-hidden overflow-y-visible bg-[#FFFCF7]">
      <div
        className="absolute inset-0 opacity-90"
        style={{
          background:
            "radial-gradient(circle at top, rgba(91,79,232,0.16) 0%, rgba(91,79,232,0.05) 24%, rgba(255,252,247,0) 58%), linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(237,233,255,0.36) 40%, rgba(255,252,247,0.98) 72%, #FFFCF7 100%), linear-gradient(rgba(91,79,232,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(180,83,9,0.03) 1px, transparent 1px)",
          backgroundSize: "auto, auto, 34px 34px, 34px 34px",
        }}
        aria-hidden="true"
      />
      <div className="absolute left-1/2 top-0 h-[560px] w-[min(1080px,94vw)] -translate-x-1/2 rounded-b-[36px] border-x border-b border-[rgba(91,79,232,0.08)] bg-[linear-gradient(180deg,rgba(255,255,255,0.74)_0%,rgba(255,255,255,0.24)_100%)]" aria-hidden="true" />
      <div className="pointer-events-none absolute right-[-52px] top-[42px] z-20 w-[230px] rotate-45 border border-[rgba(91,79,232,0.16)] bg-[#EDE9FF] py-2 text-center text-[11px] font-black uppercase tracking-[0.12em] text-[#1A1160] shadow-[0_16px_34px_rgba(91,79,232,0.16)] sm:right-[-46px] sm:top-[52px]">
        {updatedBadgeText}
      </div>

      <div className="relative z-10 mx-auto w-full max-w-[1180px] px-4 pb-12 pt-12 sm:px-6 sm:pt-16 lg:px-8 lg:pb-18 lg:pt-24">
        <section className="mx-auto max-w-[1040px] text-center">
          <h1 className="mt-1 mb-0 px-[0.04em] pb-[0.08em] text-5xl font-black leading-[1] tracking-[-0.05em] text-[#1C1C1A] sm:text-6xl lg:text-[5.3rem]">
            <span className="block overflow-visible">
              <span className="inline-block" data-home-line>Find the right</span>
            </span>
            <span className="block overflow-visible text-[#5B4FE8]">
              <span className="inline-block" data-home-line>drone jobs</span>
            </span>
            <span className="block overflow-visible">
              <span className="inline-block" data-home-line>faster.</span>
            </span>
          </h1>
          <p className="mx-auto mt-5 mb-0 max-w-3xl text-base font-semibold leading-7 text-[#665A50] sm:text-lg" data-home-hero-reveal>
            Search UAV, autonomy, robotics, flight test, and aerospace openings from tracked company career pages, with cleaner filters and fresher signals than the usual job boards.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3" data-home-hero-reveal>
            <Link
              href="#browse-listings"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[8px] bg-[#5B4FE8] px-5 text-sm font-black text-[#FFFFFF] no-underline shadow-[0_16px_30px_rgba(91,79,232,0.18)] transition hover:bg-[#1A1160]"
              onClick={handleBrowseClick}
            >
              Browse jobs
              <FiArrowRight aria-hidden className="h-4 w-4" />
            </Link>
            <Link href="/roles" className="inline-flex min-h-12 items-center justify-center rounded-[8px] border border-[rgba(91,79,232,0.16)] bg-[#FFFFFF] px-5 text-sm font-black text-[#1A1160] no-underline transition hover:bg-[#EDE9FF]">
              Explore roles
            </Link>
          </div>
          <div className="mt-6 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm font-semibold text-[#665A50]" data-home-hero-reveal>
            <span>Tracked companies</span>
            <span className="text-[#C9C9C7]">/</span>
            <span>Live roles</span>
            <span className="text-[#C9C9C7]">/</span>
            <span>Fast search and preview</span>
          </div>
        </section>

        {children ? (
          <div className="relative z-20 mx-auto mt-12 max-w-[1120px] overflow-visible sm:mt-14" data-home-hero-reveal>
            {children}
          </div>
        ) : null}
      </div>
    </header>
  );
}
