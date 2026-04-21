"use client";

import FilterForm from "./FilterForm";
import { trackEvent } from "@/lib/analytics";


/**
 * Shell around FilterForm for sidebar / drawer surfaces.
 * @param {{
 *   state: any,
 *   setState: (u: any) => void,
 *   toggleArray: (key: string, value: string) => void,
 *   companies: string[],
 *   onClearAll?: () => void,
 *   canClearAll?: boolean,
 *   variant?: 'sidebar' | 'drawer' | 'topbar',
 *   idPrefix?: string,
 * }} props
 */
export default function FilterPanel({
  state,
  setState,
  toggleArray,
  companies,
  onClearAll,
  canClearAll = false,
  variant = "sidebar",
  idPrefix = "sidebar",
}) {
  const shellClass =
    variant === "drawer"
      ? "[background:var(--surface)] [border:1px_solid_var(--border)] [border-radius:var(--radius)] [padding:20px_20px_22px] [box-shadow:var(--shadow-md)]"
      : variant === "topbar"
        ? "[background:#ffffff] [border:1px_solid_#e2e8f0] [border-radius:10px] [padding:8px_10px] [box-shadow:none] overflow-visible"
        : "[background:var(--surface)] [border:1px_solid_var(--border)] [border-radius:var(--radius)] [padding:20px_20px_22px] [box-shadow:var(--shadow-md)] [border-color:#e2e8f0] [padding:14px_16px_16px] [box-shadow:0_5px_16px_rgba(15,_23,_42,_0.06)]";

  return (
    <div className={shellClass}>
      {variant !== "drawer" && canClearAll && onClearAll ? (
        <div className={"[margin-bottom:2px] flex [justify-content:flex-end] [margin-bottom:6px]"}>
          <button
            type="button"
            className={"[font-size:0.74rem] [font-size:0.82rem] font-semibold [color:var(--primary)] [background:none] border-0 cursor-pointer p-0 underline [text-underline-offset:3px]"}
            onClick={() => {
              trackEvent("clear_all_filters", {
                source: variant,
              });
              onClearAll();
            }}
          >
            Clear all
          </button>
        </div>
      ) : null}
      <FilterForm
        idPrefix={idPrefix}
        state={state}
        setState={setState}
        toggleArray={toggleArray}
        companies={companies}
      />
    </div>
  );
}
