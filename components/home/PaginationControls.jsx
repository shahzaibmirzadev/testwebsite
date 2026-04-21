"use client";

import CustomSelect from "./CustomSelect";

const PAGE_SIZES = [10, 20, 50, 100];

/**
 * @param {{
 *   page: number,
 *   pageSize: number,
 *   totalItems: number,
 *   totalPages: number,
 *   onPageChange: (next: number) => void,
 *   onPageSizeChange: (size: number) => void,
 * }} props
 */
export default function PaginationControls({
  page,
  pageSize,
  totalItems,
  totalPages,
  onPageChange,
  onPageSizeChange,
}) {
  if (totalItems <= 0) return null;

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(totalItems, page * pageSize);
  const canPrev = page > 1;
  const canNext = page < totalPages;

  return (
    <div className={"[margin-top:18px] [padding:14px_16px] [border:1px_solid_var(--border)] [border-radius:var(--radius-sm)] [background:var(--surface)] [box-shadow:0_12px_26px_rgba(28,_28,_26,_0.04)] flex [flex-wrap:wrap] [align-items:center] [justify-content:space-between] [gap:10px_16px] max-[639px]:[align-items:flex-start]"}>
      <p className={"m-0 [font-size:0.85rem] [color:var(--muted)]"}>
        Showing {start}-{end} of {totalItems}
      </p>

      <div className={"flex [flex-wrap:wrap] [align-items:center] [gap:10px_14px] max-[639px]:w-full max-[639px]:[justify-content:space-between]"}>
        <label className={"inline-flex [align-items:center] [gap:8px] [font-size:0.78rem] font-semibold [color:var(--muted)] [text-transform:uppercase] [letter-spacing:0.06em]"}>
          <span>Per page</span>
          <CustomSelect
            value={String(pageSize)}
            onChange={(nextValue) => onPageSizeChange(Number(nextValue))}
            options={PAGE_SIZES.map((size) => ({ value: String(size), label: String(size) }))}
            label="Results per page"
            minWidthClass="min-w-[88px]"
            menuAlign="right"
          />
        </label>

        <div className={"inline-flex [align-items:center] [gap:8px]"} aria-label="Pagination">
          <button
            type="button"
            className={"[border:1px_solid_var(--border)] [background:var(--surface)] [color:var(--text)] [border-radius:8px] [padding:7px_12px] [font-size:0.84rem] font-semibold cursor-pointer hover:[background:#F7F7F8] hover:disabled:[border-color:#cbd5e1] hover:disabled:[background:#f8fafc] disabled:[opacity:0.45] disabled:[cursor:not-allowed]"}
            disabled={!canPrev}
            onClick={() => canPrev && onPageChange(page - 1)}
          >
            Prev
          </button>
          <span className={"[font-size:0.84rem] [color:var(--muted)] [min-width:90px] text-center"}>
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            className={"[border:1px_solid_var(--border)] [background:var(--surface)] [color:var(--text)] [border-radius:8px] [padding:7px_12px] [font-size:0.84rem] font-semibold cursor-pointer hover:[background:#F7F7F8] hover:disabled:[border-color:#cbd5e1] hover:disabled:[background:#f8fafc] disabled:[opacity:0.45] disabled:[cursor:not-allowed]"}
            disabled={!canNext}
            onClick={() => canNext && onPageChange(page + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
