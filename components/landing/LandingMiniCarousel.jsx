"use client";

import Link from "next/link";
import { useMemo, useState } from "react";


export default function LandingMiniCarousel({ items, ariaLabel, cardClassName = "" }) {
  const safeItems = Array.isArray(items) ? items : [];
  const [index, setIndex] = useState(0);
  const canSlide = safeItems.length > 1;

  const normalizedIndex = useMemo(() => {
    if (safeItems.length === 0) return 0;
    return ((index % safeItems.length) + safeItems.length) % safeItems.length;
  }, [index, safeItems.length]);

  const goPrev = () => {
    if (!canSlide) return;
    setIndex((prev) => prev - 1);
  };

  const goNext = () => {
    if (!canSlide) return;
    setIndex((prev) => prev + 1);
  };

  return (
    <div className={"flex [align-items:center] [gap:8px] [margin-top:12px]"}>
      {canSlide ? (
        <button
          type="button"
          className={"[flex-shrink:0] [width:32px] [height:32px] [border-radius:999px] [border:1px_solid_#d7e0ec] [background:#ffffff] [color:#334155] [font-size:1.2rem] [line-height:1] cursor-pointer [box-shadow:0_2px_10px_rgba(15,_23,_42,_0.08)] hover:[border-color:#b9c9df] hover:[color:#1d4ed8]"}
          aria-label="Previous items"
          onClick={goPrev}
        >
          ‹
        </button>
      ) : null}
      <div className={"overflow-hidden [flex:1] block"}>
        <div
          className={"grid [grid-auto-flow:column] [grid-auto-columns:100%] [gap:0] [transition:transform_280ms_ease] [will-change:transform]"}
          role="list"
          aria-label={ariaLabel}
          style={{ transform: `translateX(-${normalizedIndex * 100}%)` }}
        >
          {safeItems.map((item) => (
            <Link
              key={`${item.href}:${item.title}`}
              href={item.href}
              className={`${"[border:1px_solid_#dbe3ef] [border-radius:12px] [background:#f8fafc] [min-height:76px] [padding:8px_9px] no-underline flex [flex-direction:column] [justify-content:space-between] [width:min(220px,_100%)] [justify-self:center] hover:[border-color:#5b4bff] hover:[background:#f3f4ff]"} ${cardClassName}`.trim()}
              role="listitem"
            >
              <span className={"[color:#0f172a] font-bold [font-size:0.8rem] [line-height:1.28]"}>{item.title}</span>
              {item.meta ? <span className={"[color:#64748b] [font-size:0.67rem]"}>{item.meta}</span> : null}
            </Link>
          ))}
        </div>
      </div>
      {canSlide ? (
        <button
          type="button"
          className={"[flex-shrink:0] [width:32px] [height:32px] [border-radius:999px] [border:1px_solid_#d7e0ec] [background:#ffffff] [color:#334155] [font-size:1.2rem] [line-height:1] cursor-pointer [box-shadow:0_2px_10px_rgba(15,_23,_42,_0.08)] hover:[border-color:#b9c9df] hover:[color:#1d4ed8]"}
          aria-label="Next items"
          onClick={goNext}
        >
          ›
        </button>
      ) : null}
    </div>
  );
}
