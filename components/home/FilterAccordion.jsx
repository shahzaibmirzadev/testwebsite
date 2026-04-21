"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";

/**
 * @param {{
 *   title: string,
 *   summary?: string|null,
 *   open: boolean,
 *   onToggle: () => void,
 *   children: React.ReactNode,
 *   id: string,
 * }} props
 */
export default function FilterAccordion({
  title,
  summary,
  open,
  onToggle,
  children,
  id,
}) {
  const panelId = `${id}-panel`;
  const panelRef = useRef(null);
  const [renderPanel, setRenderPanel] = useState(open);

  useEffect(() => {
    if (open) setRenderPanel(true);
  }, [open]);

  useEffect(() => {
    if (!renderPanel || !panelRef.current) return undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      if (!open) setRenderPanel(false);
      return undefined;
    }

    const element = panelRef.current;
    gsap.killTweensOf(element);

    if (open) {
      gsap.fromTo(
        element,
        {
          autoAlpha: 0,
          y: -10,
          scale: 0.985,
          transformOrigin: "50% 0%",
        },
        {
          autoAlpha: 1,
          y: 0,
          scale: 1,
          duration: 0.24,
          ease: "power2.out",
        }
      );
      return undefined;
    }

    gsap.to(element, {
      autoAlpha: 0,
      y: -8,
      scale: 0.985,
      duration: 0.18,
      ease: "power2.in",
      onComplete: () => setRenderPanel(false),
    });
    return undefined;
  }, [open, renderPanel]);

  return (
    <div className={`relative ${open ? "[z-index:70]" : "[z-index:1]"} [border:1px_solid_#e2e8f0] [border-radius:8px] [background:#ffffff] [border-bottom:1px_solid_var(--border)] [border-bottom:none]`}>
      <button
        type="button"
        id={`${id}-btn`}
        className={"[padding:7px_8px] [min-height:36px] flex [align-items:center] [gap:10px] w-full [padding:14px_4px] border-0 bg-transparent [color:var(--text)] cursor-pointer text-left [font:inherit] hover:[color:var(--primary)]"}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
      >
        <span className={"[font-size:0.79rem] [white-space:nowrap] overflow-hidden [text-overflow:ellipsis] [font-size:0.87rem] font-semibold [flex:1]"}>{title}</span>
        {summary ? (
          <span className={"[font-size:0.68rem] [max-width:48%] [font-size:0.72rem] font-medium [color:var(--muted)] [max-width:42%] overflow-hidden [text-overflow:ellipsis] [white-space:nowrap] text-right"}>{summary}</span>
        ) : null}
        <span className={"[font-size:1rem] [color:var(--muted)] [width:1.25rem] text-center"} aria-hidden>
          {open ? "−" : "+"}
        </span>
      </button>
      {renderPanel ? (
        <div
          ref={panelRef}
          id={panelId}
          role="region"
          aria-labelledby={`${id}-btn`}
          className={"absolute [top:calc(100%_+_6px)] [left:0] [right:0] [z-index:90] [background:#ffffff] [border:1px_solid_#d9e3f3] [border-radius:10px] [box-shadow:0_10px_24px_rgba(15,_23,_42,_0.12)] [padding:8px] [max-height:320px] [overflow:visible] [padding:4px_4px_14px]"}
        >
          <div className={"[max-height:302px] overflow-y-auto [padding:0_0_2px]"}>
            {children}
          </div>
        </div>
      ) : null}
    </div>
  );
}
