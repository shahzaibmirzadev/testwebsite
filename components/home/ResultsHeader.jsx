"use client";

import { useMemo } from "react";
import {
  SORT_OPTIONS,
  countAdvancedFilterSelections,
  createInitialFilterState,
  isFilterDirty,
} from "@/lib/filterConfig";
import { buildResultChips } from "@/lib/resultsChips";
import { trackEvent } from "@/lib/analytics";


/** @typedef {ReturnType<typeof createInitialFilterState>} FilterState */

/**
 * @param {{
 *   count: number,
 *   page: number,
 *   pageSize: number,
 *   totalPages: number,
 *   state: FilterState,
 *   setState: (u: Partial<FilterState>) => void,
 *   toggleArray: (key: string, value: string) => void,
 *   onClearAll: () => void,
 *   onPageChange?: (next: number) => void,
 *   onPageSizeChange?: (next: number) => void,
 * }} props
 */
export default function ResultsHeader({
  count,
  page,
  pageSize,
  totalPages,
  state,
  setState,
  toggleArray,
  onClearAll,
  onPageChange,
  onPageSizeChange,
}) {
  const removeHandlers = useMemo(
    () => ({
      clearKeyword: () => setState({ keyword: "" }),
      clearLocation: () => setState({ location: "" }),
      clearSector: () => setState({ sector: "" }),
      clearPosted: () => setState({ postedWithin: null }),
      toggleJobFamily: (v) => toggleArray("jobFamilies", v),
      toggleRemote: (v) => toggleArray("remote", v),
      toggleSeniority: (v) => toggleArray("seniority", v),
      toggleEmployment: (v) => toggleArray("employmentTypes", v),
      toggleTag: (v) => toggleArray("tags", v),
      toggleRegion: (v) => toggleArray("regions", v),
      toggleCompany: (v) => toggleArray("companies", v),
    }),
    [setState, toggleArray]
  );

  const chips = useMemo(
    () => buildResultChips(state, removeHandlers),
    [state, removeHandlers]
  );

  const dirty = isFilterDirty(state);
  const advCount = countAdvancedFilterSelections(state);

  return (
    <div className={"[margin-bottom:0] [border:1px_solid_#e2e8f0] [border-radius:10px] [background:#ffffff] [padding:8px_10px] flex [flex-wrap:wrap] [align-items:flex-start] [justify-content:space-between] [gap:16px] [margin-bottom:18px] [margin-bottom:16px]"}>
      <div className={"[flex:1] [min-width:200px]"}>
        <p className={"[margin-bottom:6px] [font-size:0.86rem] [font-size:0.95rem] font-semibold [margin:0_0_10px] [color:var(--muted)]"}>
          Showing {count} job{count === 1 ? "" : "s"}
        </p>
        {(chips.length > 0 || dirty) && (
          <div className={"[gap:6px] flex [flex-wrap:wrap] [gap:8px] [align-items:center]"}>
            {chips.map((c) => (
              <span key={c.id} className={"[font-size:0.72rem] [padding:3px_9px_3px_10px] inline-flex [align-items:center] [gap:6px] [padding:4px_10px_4px_12px] [border-radius:999px] [font-size:0.78rem] font-medium [background:var(--surface)] [color:var(--text)] [border:1px_solid_var(--border)]"}>
                {c.label}
                <button
                  type="button"
                  className={"flex [align-items:center] [justify-content:center] [width:20px] [height:20px] p-0 border-0 [border-radius:50%] bg-transparent [color:var(--muted)] cursor-pointer [font-size:1rem] [line-height:1] hover:[color:var(--primary)] hover:[background:var(--primary-soft)]"}
                  aria-label={`Remove ${c.label}`}
                  onClick={c.onRemove}
                >
                  ×
                </button>
              </span>
            ))}
            {dirty && (
              <button
                type="button"
                className={"[font-size:0.82rem] font-semibold [color:var(--primary)] [background:none] border-0 cursor-pointer [padding:0_0_0_4px] underline [text-underline-offset:3px]"}
                onClick={() => {
                  trackEvent("clear_all_filters", {
                    chipCount: chips.length,
                  });
                  onClearAll();
                }}
              >
                Clear all
              </button>
            )}
          </div>
        )}
      </div>
      <div className={"[gap:8px] flex [flex-wrap:wrap] [align-items:center] [gap:12px]"}>
        {onPageSizeChange ? (
          <div className={"[font-size:0.64rem] flex [align-items:center] [gap:8px] [&label]:[font-size:0.72rem] [&label]:font-semibold [&label]:[color:var(--muted)] [&label]:[text-transform:uppercase] [&label]:[letter-spacing:0.06em] [&label]:[white-space:nowrap]"}>
            <label htmlFor="pageSizeSelect">Per page</label>
            <select
              id="pageSizeSelect"
              className={"[min-width:118px] [font-size:0.82rem] [padding:6px_9px] [min-width:128px] [padding:6px_10px] [min-width:150px] [padding:8px_12px] [border:1px_solid_var(--border)] [border-radius:var(--radius-sm)] [font-size:0.88rem] [background:var(--surface)] [color:var(--text)] cursor-pointer [&option]:[background:#fff] [&option]:[color:var(--text)]"}
              value={pageSize}
              onChange={(e) => {
                const nextSize = Number(e.target.value);
                trackEvent("change_page_size", { pageSize: nextSize });
                onPageSizeChange(nextSize);
              }}
            >
              {[10, 20, 50, 100].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {advCount > 0 ? (
          <span className={"inline-flex [align-items:center] [border:1px_solid_#dbe6f8] [background:#f7fbff] [color:#1d4ed8] [border-radius:999px] [padding:6px_10px] [font-size:0.74rem] font-bold"}>
            {advCount} filter{advCount === 1 ? "" : "s"} active
          </span>
        ) : null}
        <div className={"[font-size:0.64rem] flex [align-items:center] [gap:8px] [&label]:[font-size:0.72rem] [&label]:font-semibold [&label]:[color:var(--muted)] [&label]:[text-transform:uppercase] [&label]:[letter-spacing:0.06em] [&label]:[white-space:nowrap]"}>
          <label htmlFor="sortResults">Sort</label>
          <select
            id="sortResults"
            className={"[min-width:118px] [font-size:0.82rem] [padding:6px_9px] [min-width:128px] [padding:6px_10px] [min-width:150px] [padding:8px_12px] [border:1px_solid_var(--border)] [border-radius:var(--radius-sm)] [font-size:0.88rem] [background:var(--surface)] [color:var(--text)] cursor-pointer [&option]:[background:#fff] [&option]:[color:var(--text)]"}
            value={state.sort}
            onChange={(e) => {
              const nextSort =
                /** @type {'newest'|'oldest'|'relevance'} */ (e.target.value);
              trackEvent("change_sort", { sort: nextSort });
              setState({
                sort: nextSort,
              });
            }}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        {onPageChange ? (
          <div className={"flex [align-items:center] [gap:8px]"}>
            <button
              type="button"
              className={"[padding:5px_8px] [font-size:0.76rem] [border:1px_solid_var(--border)] [background:var(--surface)] [color:var(--text)] [border-radius:8px] [padding:6px_10px] [font-size:0.82rem] font-semibold cursor-pointer hover:disabled:[border-color:#cbd5e1] hover:disabled:[background:#f8fafc] disabled:[opacity:0.45] disabled:[cursor:not-allowed]"}
              disabled={page <= 1}
              onClick={() => page > 1 && onPageChange(page - 1)}
            >
              Prev
            </button>
            <span className={"[font-size:0.74rem] [font-size:0.8rem] [color:var(--muted)] [white-space:nowrap]"}>
              Page {page}/{totalPages}
            </span>
            <button
              type="button"
              className={"[padding:5px_8px] [font-size:0.76rem] [border:1px_solid_var(--border)] [background:var(--surface)] [color:var(--text)] [border-radius:8px] [padding:6px_10px] [font-size:0.82rem] font-semibold cursor-pointer hover:disabled:[border-color:#cbd5e1] hover:disabled:[background:#f8fafc] disabled:[opacity:0.45] disabled:[cursor:not-allowed]"}
              disabled={page >= totalPages}
              onClick={() => page < totalPages && onPageChange(page + 1)}
            >
              Next
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
