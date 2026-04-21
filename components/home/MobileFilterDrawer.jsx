"use client";

import { useEffect } from "react";


/**
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   children: React.ReactNode,
 * }} props
 */
export default function MobileFilterDrawer({ open, onClose, children }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <>
      <div
        className={`${"fixed [inset:0] [background:rgba(15,_23,_42,_0.4)] [z-index:100] [opacity:0] pointer-events-none [transition:opacity_0.2s_ease]"} ${open ? "[opacity:1] pointer-events-auto" : ""}`}
        onClick={onClose}
        role="presentation"
        aria-hidden={!open}
      />
      <div
        className={`${"fixed [top:0] [right:0] [width:min(100%,_420px)] h-full [background:var(--bg)] [z-index:101] [transform:translateX(100%)] [transition:transform_0.26s_ease] flex [flex-direction:column] [box-shadow:-8px_0_40px_rgba(15,_23,_42,_0.12)] [border-left:1px_solid_var(--border)]"} ${open ? "[transform:translateX(0)]" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-filters-title"
      >
        <div className={"flex [align-items:center] [justify-content:space-between] [padding:16px_18px] [border-bottom:1px_solid_var(--border)] [background:var(--surface)] [&h2]:m-0 [&h2]:[font-size:1rem] [&h2]:font-bold"}>
          <h2 id="drawer-filters-title">Filters</h2>
          <button
            type="button"
            className={"[border:1px_solid_var(--border)] [background:var(--surface)] [width:38px] [height:38px] [border-radius:var(--radius-sm)] cursor-pointer [font-size:1.25rem] [line-height:1] [color:var(--text)] hover:[background:#f8fafc] hover:[color:var(--primary)]"}
            onClick={onClose}
            aria-label="Close filters"
          >
            ×
          </button>
        </div>
        <div className={"[flex:1] overflow-y-auto [padding:14px_16px_24px]"}>{children}</div>
      </div>
    </>
  );
}
