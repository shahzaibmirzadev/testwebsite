"use client";

import { useId, useMemo, useState } from "react";
import {
  DOMAIN_TAGS,
  EMPLOYMENT_TYPES,
  JOB_FAMILIES,
  POSTED_WITHIN_OPTIONS,
  REGIONS,
  REMOTE_STATUS,
  SENIORITY,
} from "@/lib/filterConfig";
import FilterAccordion from "./FilterAccordion";
import CustomSelect from "./CustomSelect";


/**
 * @param {string[]} arr
 * @param {number} max
 */
function summarize(arr, max = 2) {
  if (!arr.length) return null;
  if (arr.length <= max) return arr.join(", ");
  return `${arr.slice(0, max).join(", ")} +${arr.length - max}`;
}

/**
 * @param {{
 *   state: any,
 *   setState: (u: any) => void,
 *   toggleArray: (key: string, value: string) => void,
 *   companies: string[],
 *   idPrefix?: string,
 * }} props
 */
export default function FilterForm({
  state,
  setState,
  toggleArray,
  companies,
  idPrefix = "f",
}) {
  const [openId, setOpenId] = useState(/** @type {string|null} */ (null));
  const [tagQuery, setTagQuery] = useState("");
  const [companyQuery, setCompanyQuery] = useState("");
  const postedId = useId();
  const p = idPrefix;

  const toggleSection = (id) => {
    setOpenId((cur) => (cur === id ? null : id));
  };

  const filteredTags = useMemo(() => {
    const q = tagQuery.trim().toLowerCase();
    if (!q) return DOMAIN_TAGS;
    return DOMAIN_TAGS.filter((t) => t.toLowerCase().includes(q));
  }, [tagQuery]);

  const filteredCompanies = useMemo(() => {
    const q = companyQuery.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter((c) => c.toLowerCase().includes(q));
  }, [companies, companyQuery]);

  const visibleCompanies = filteredCompanies.slice(0, 50);

  return (
    <div className={"grid [grid-template-columns:repeat(auto-fit,_minmax(165px,_1fr))] [gap:6px] [align-items:start] max-[900px]:[grid-template-columns:repeat(auto-fit,_minmax(145px,_1fr))] flex [flex-direction:column] [gap:4px]"}>
      <FilterAccordion
        id={`${p}-acc-family`}
        title="Job family"
        summary={summarize(state.jobFamilies)}
        open={openId === "family"}
        onToggle={() => toggleSection("family")}
      >
        <ul className={"[list-style:none] m-0 p-0"}>
          {JOB_FAMILIES.map((f) => (
            <li key={f}>
              <label className={"[padding:7px_8px] [font-size:0.8rem] flex [align-items:flex-start] [gap:10px] [padding:10px_12px] [font-size:0.88rem] cursor-pointer [color:var(--text)] [border-bottom:1px_solid_var(--border)] [border-bottom:none] [&input]:[margin-top:3px] [&input]:[accent-color:var(--primary)]"}>
                <input
                  type="checkbox"
                  checked={state.jobFamilies.includes(f)}
                  onChange={() => toggleArray("jobFamilies", f)}
                />
                <span>{f}</span>
              </label>
            </li>
          ))}
        </ul>
      </FilterAccordion>

      <FilterAccordion
        id={`${p}-acc-remote`}
        title="Workplace"
        summary={summarize(state.remote)}
        open={openId === "remote"}
        onToggle={() => toggleSection("remote")}
      >
        <div className={"flex [flex-wrap:wrap] [gap:8px]"}>
          {REMOTE_STATUS.map((r) => {
            const on = state.remote.includes(r);
            return (
              <button
                key={r}
                type="button"
                className={`${"[padding:7px_10px] [font-size:0.76rem] [padding:9px_13px] [border-radius:var(--radius-sm)] [font-size:0.82rem] font-semibold [border:1px_solid_var(--border)] [background:var(--bg)] [color:var(--muted)] cursor-pointer hover:[border-color:#cbd5e1] hover:[color:var(--text)]"} ${on ? "[border-color:rgba(37,_99,_235,_0.45)] [color:var(--primary)] [background:var(--primary-soft)]" : ""}`}
                aria-pressed={on}
                onClick={() => toggleArray("remote", r)}
              >
                {r}
              </button>
            );
          })}
        </div>
      </FilterAccordion>

      <FilterAccordion
        id={`${p}-acc-seniority`}
        title="Seniority"
        summary={summarize(state.seniority)}
        open={openId === "seniority"}
        onToggle={() => toggleSection("seniority")}
      >
        <ul className={"[list-style:none] m-0 p-0"}>
          {SENIORITY.map((s) => (
            <li key={s}>
              <label className={"[padding:7px_8px] [font-size:0.8rem] flex [align-items:flex-start] [gap:10px] [padding:10px_12px] [font-size:0.88rem] cursor-pointer [color:var(--text)] [border-bottom:1px_solid_var(--border)] [border-bottom:none] [&input]:[margin-top:3px] [&input]:[accent-color:var(--primary)]"}>
                <input
                  type="checkbox"
                  checked={state.seniority.includes(s)}
                  onChange={() => toggleArray("seniority", s)}
                />
                <span>{s}</span>
              </label>
            </li>
          ))}
        </ul>
      </FilterAccordion>

      <FilterAccordion
        id={`${p}-acc-emp`}
        title="Employment type"
        summary={summarize(state.employmentTypes)}
        open={openId === "employment"}
        onToggle={() => toggleSection("employment")}
      >
        <ul className={"[list-style:none] m-0 p-0"}>
          {EMPLOYMENT_TYPES.map((e) => (
            <li key={e}>
              <label className={"[padding:7px_8px] [font-size:0.8rem] flex [align-items:flex-start] [gap:10px] [padding:10px_12px] [font-size:0.88rem] cursor-pointer [color:var(--text)] [border-bottom:1px_solid_var(--border)] [border-bottom:none] [&input]:[margin-top:3px] [&input]:[accent-color:var(--primary)]"}>
                <input
                  type="checkbox"
                  checked={state.employmentTypes.includes(e)}
                  onChange={() => toggleArray("employmentTypes", e)}
                />
                <span>{e}</span>
              </label>
            </li>
          ))}
        </ul>
      </FilterAccordion>

      <FilterAccordion
        id={`${p}-acc-tags`}
        title="Domain & tags"
        summary={summarize(state.tags, 3)}
        open={openId === "tags"}
        onToggle={() => toggleSection("tags")}
      >
        <input
          className={"w-full [padding:11px_12px] [margin-bottom:4px] [border:1px_solid_var(--border)] [border-radius:var(--radius-sm)] [font-size:0.88rem] [background:var(--surface)] [color:var(--text)] focus:[outline:none] focus:[border-color:rgba(37,_99,_235,_0.5)] focus:[box-shadow:0_0_0_3px_rgba(37,_99,_235,_0.12)]"}
          type="search"
          placeholder="Search tags…"
          value={tagQuery}
          onChange={(e) => setTagQuery(e.target.value)}
          aria-label="Filter tag list"
        />
        <ul className={`${"[list-style:none] m-0 p-0"} ${"[max-height:260px] overflow-y-auto [margin-top:8px] [border-radius:var(--radius-sm)] [border:1px_solid_var(--border)] [background:var(--bg)]"}`}>
          {filteredTags.map((t) => (
            <li key={t}>
              <label className={"[padding:7px_8px] [font-size:0.8rem] flex [align-items:flex-start] [gap:10px] [padding:10px_12px] [font-size:0.88rem] cursor-pointer [color:var(--text)] [border-bottom:1px_solid_var(--border)] [border-bottom:none] [&input]:[margin-top:3px] [&input]:[accent-color:var(--primary)]"}>
                <input
                  type="checkbox"
                  checked={state.tags.includes(t)}
                  onChange={() => toggleArray("tags", t)}
                />
                <span>{t}</span>
              </label>
            </li>
          ))}
        </ul>
      </FilterAccordion>

      <FilterAccordion
        id={`${p}-acc-region`}
        title="Region"
        summary={summarize(state.regions)}
        open={openId === "region"}
        onToggle={() => toggleSection("region")}
      >
        <ul className={"[list-style:none] m-0 p-0"}>
          {REGIONS.map((r) => (
            <li key={r}>
              <label className={"[padding:7px_8px] [font-size:0.8rem] flex [align-items:flex-start] [gap:10px] [padding:10px_12px] [font-size:0.88rem] cursor-pointer [color:var(--text)] [border-bottom:1px_solid_var(--border)] [border-bottom:none] [&input]:[margin-top:3px] [&input]:[accent-color:var(--primary)]"}>
                <input
                  type="checkbox"
                  checked={state.regions.includes(r)}
                  onChange={() => toggleArray("regions", r)}
                />
                <span>{r}</span>
              </label>
            </li>
          ))}
        </ul>
      </FilterAccordion>

      <FilterAccordion
        id={`${p}-acc-company`}
        title="Company"
        summary={summarize(state.companies, 2)}
        open={openId === "company"}
        onToggle={() => toggleSection("company")}
      >
        <input
          className={"w-full [padding:11px_12px] [margin-bottom:4px] [border:1px_solid_var(--border)] [border-radius:var(--radius-sm)] [font-size:0.88rem] [background:var(--surface)] [color:var(--text)] focus:[outline:none] focus:[border-color:rgba(37,_99,_235,_0.5)] focus:[box-shadow:0_0_0_3px_rgba(37,_99,_235,_0.12)]"}
          type="search"
          placeholder="Search companies…"
          value={companyQuery}
          onChange={(e) => setCompanyQuery(e.target.value)}
          aria-label="Filter companies"
        />
        <ul className={`${"[list-style:none] m-0 p-0"} ${"[max-height:260px] overflow-y-auto [margin-top:8px] [border-radius:var(--radius-sm)] [border:1px_solid_var(--border)] [background:var(--bg)]"}`}>
          {visibleCompanies.map((c) => (
            <li key={c}>
              <label className={"[padding:7px_8px] [font-size:0.8rem] flex [align-items:flex-start] [gap:10px] [padding:10px_12px] [font-size:0.88rem] cursor-pointer [color:var(--text)] [border-bottom:1px_solid_var(--border)] [border-bottom:none] [&input]:[margin-top:3px] [&input]:[accent-color:var(--primary)]"}>
                <input
                  type="checkbox"
                  checked={state.companies.includes(c)}
                  onChange={() => toggleArray("companies", c)}
                />
                <span>{c}</span>
              </label>
            </li>
          ))}
        </ul>
        {filteredCompanies.length > 50 ? (
          <p className={"[font-size:0.72rem] [color:var(--muted)] [margin:8px_0_0]"}>Narrow search to see more companies.</p>
        ) : null}
      </FilterAccordion>

      <div className={"[margin-top:0] [border:1px_solid_#e2e8f0] [border-radius:8px] [padding:7px_8px] [gap:6px] flex [flex-direction:column] [gap:8px] [padding:14px_4px_4px] [margin-top:4px] [border-top:1px_solid_var(--border)]"}>
        <label className={"[font-size:0.62rem] [font-size:0.65rem] font-bold [text-transform:uppercase] [letter-spacing:0.08em] [color:var(--muted)]"} htmlFor={postedId}>
          Posted
        </label>
        <CustomSelect
          value={state.postedWithin == null ? "" : String(state.postedWithin)}
          onChange={(nextValue) =>
            setState({
              postedWithin: nextValue === "" ? null : parseInt(nextValue, 10),
            })
          }
          options={[
            { value: "", label: "Any time" },
            ...POSTED_WITHIN_OPTIONS.map((option) => ({
              value: String(option.value),
              label: option.label,
            })),
          ]}
          label="Posted within"
          minWidthClass="min-w-0"
          buttonMinHeightClass="min-h-10"
          menuPlacement="up"
        />
      </div>
    </div>
  );
}
