"use client";

import { Children, useEffect, useMemo, useState } from "react";

function ChevronLeft() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M15.41 16.59 10.83 12l4.58-4.59L14 6l-6 6 6 6 1.41-1.41z"
      />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M8.59 16.59 13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"
      />
    </svg>
  );
}

export default function ExploreMoreRolesCarousel({ children }) {
  const items = Children.toArray(children).filter(Boolean);
  const itemCount = items.length;
  const [page, setPage] = useState(0);
  const [direction, setDirection] = useState(1);
  const [reducedMotion, setReducedMotion] = useState(false);
  const visibleCount = Math.min(3, itemCount);
  const pageCount = Math.max(1, Math.ceil(itemCount / 3));

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const onChange = () => setReducedMotion(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    setPage(0);
  }, [itemCount]);

  const visibleItems = useMemo(
    () =>
      Array.from({ length: visibleCount }, (_, index) => {
        const itemIndex = (page * 3 + index) % itemCount;
        return items[itemIndex];
      }),
    [items, itemCount, page, visibleCount]
  );

  const move = (nextDirection) => {
    if (pageCount <= 1) return;
    setDirection(nextDirection);
    setPage((current) => (current + nextDirection + pageCount) % pageCount);
  };

  if (itemCount === 0) return null;

  return (
    <div className="relative mx-auto w-full max-w-[1040px] px-11 sm:px-14">
      <button
        type="button"
        className="absolute left-0 top-1/2 z-[3] flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-[rgba(0,0,0,0.08)] bg-[#FFFFFF] p-0 text-[#1A1160] shadow-[0_8px_20px_rgba(28,28,26,0.08)] transition-colors hover:bg-[#EDE9FF] disabled:opacity-35"
        aria-label="Previous related roles"
        onClick={() => move(-1)}
        disabled={pageCount <= 1}
      >
        <ChevronLeft />
      </button>

      <div
        key={page}
        className="grid min-h-[150px] items-stretch gap-3 sm:grid-cols-3"
        style={
          reducedMotion
            ? undefined
            : {
                animation: "relatedRolesPageIn 360ms cubic-bezier(0.16, 1, 0.3, 1) both",
                "--related-roles-x": `${direction * 18}px`,
              }
        }
        role="region"
        aria-label="Related roles"
      >
        {visibleItems.map((child, index) => (
          <div key={`${page}-${index}`} className="min-w-0">
            {child}
          </div>
        ))}
      </div>

      <button
        type="button"
        className="absolute right-0 top-1/2 z-[3] flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-[rgba(0,0,0,0.08)] bg-[#FFFFFF] p-0 text-[#1A1160] shadow-[0_8px_20px_rgba(28,28,26,0.08)] transition-colors hover:bg-[#EDE9FF] disabled:opacity-35"
        aria-label="Next related roles"
        onClick={() => move(1)}
        disabled={pageCount <= 1}
      >
        <ChevronRight />
      </button>
    </div>
  );
}
