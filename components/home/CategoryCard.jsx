"use client";

import Link from "next/link";
import { getCompanyDirectoryLogoUrlsForDisplay } from "@/lib/companyPageCopy";
import CompanyLogoPlaceholder from "./CompanyLogoPlaceholder";


/**
 * @param {{
 *   title: string,
 *   count: number,
 *   gradient: string,
 *   onSelect?: () => void,
 *   href?: string,
 *   countLabel?: string,
 *   ctaLabel?: string,
 *   iconText?: string,
 *   iconImageUrl?: string,
 *   iconImageAlt?: string,
 *   hideCount?: boolean,
 *   hideCta?: boolean,
 *   companyMeta?: { location: string; foundedYear: number | null },
 * }} props
 */
export default function CategoryCard({
  title,
  count,
  gradient,
  onSelect,
  href,
  countLabel = "jobs available",
  ctaLabel = "View specialty",
  iconText,
  iconImageUrl = "",
  iconImageAlt = "",
  hideCount = false,
  hideCta = false,
  companyMeta,
}) {
  const iconChar = (iconText || title).charAt(0);
  /** Browse-by-company: same enrichment-based logos as /companies directory */
  const logoUrls = iconText ? getCompanyDirectoryLogoUrlsForDisplay(iconText) : null;
  const hasLogo =
    logoUrls &&
    (logoUrls.primaryUrl ||
      logoUrls.fallbackUrl ||
      (Array.isArray(logoUrls.fallbackUrls) && logoUrls.fallbackUrls.length > 0));

  const logoBlock = hasLogo ? (
    <CompanyLogoPlaceholder
      url={logoUrls.primaryUrl}
      fallbackUrl={logoUrls.fallbackUrl}
      fallbackUrls={logoUrls.fallbackUrls}
      company={title}
      accentGradient={gradient}
      compact
      className={"[width:36px] [height:36px] [min-width:36px] [min-height:36px] [box-shadow:0_8px_18px_rgba(15,_23,_42,_0.12)]"}
    />
  ) : iconImageUrl ? (
    <span className={"[width:36px] [height:36px] [flex-shrink:0] [border-radius:10px] overflow-hidden [color:#ffffff] inline-flex [align-items:center] [justify-content:center] [font-size:0.9rem] font-bold [box-shadow:0_8px_18px_rgba(15,_23,_42,_0.2)]"} aria-hidden>
      <img
        src={iconImageUrl}
        alt={iconImageAlt || ""}
        className={"w-full h-full [border-radius:inherit] [object-fit:cover] [object-position:center] block"}
        loading="lazy"
        decoding="async"
      />
    </span>
  ) : iconText ? (
    <span className={"inline-flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-[8px] text-sm font-black text-[#FFFFFF] shadow-[0_8px_18px_rgba(28,28,26,0.12)]"} style={{ background: gradient }} aria-hidden>
      {iconChar}
    </span>
  ) : (
    <span className="block h-2 w-12 rounded-full" style={{ background: gradient }} aria-hidden />
  );

  const companyStack =
    companyMeta != null ? (
      <div className={"flex h-full w-full flex-col items-start gap-3"}>
        <div className="flex min-w-0 items-center gap-3">
          {logoBlock}
          <span className={"m-0 min-w-0 text-base font-black leading-snug tracking-[-0.01em] text-[#1C1C1A]"}>{title}</span>
        </div>
        <div className={"mt-auto flex w-full flex-col items-start gap-1 text-sm font-semibold leading-5 text-[#665A50]"}>
          <span className={"min-w-0"}>
            {companyMeta.location?.trim() || "—"}
          </span>
          {companyMeta.foundedYear != null ? (
            <span className={"[font-variant-numeric:tabular-nums] [color:#665A50] text-xs font-bold"}>
              Founded: {companyMeta.foundedYear}
            </span>
          ) : null}
        </div>
      </div>
    ) : null;

  const content =
    companyStack != null ? (
      companyStack
    ) : (
      <>
        <span className="absolute left-0 top-0 h-full w-1 opacity-70" style={{ background: gradient }} aria-hidden />
        <div className="flex min-w-0 items-center gap-3">
          {logoBlock}
          <span className={"min-w-0 text-lg font-black leading-snug tracking-[-0.02em] text-[#1C1C1A]"}>{title}</span>
        </div>
        <span className={"flex [flex-direction:column] [justify-content:flex-start] [align-items:flex-start] [gap:4px] [height:auto] [min-height:0] p-0"}>
          {!hideCount ? (
            <span className={"mt-1 text-sm font-bold text-[#665A50]"}>
              {count} {countLabel}
            </span>
          ) : null}
        </span>
        {hideCta ? null : <span className={"mt-auto text-xs font-black uppercase tracking-[0.1em] text-[#5B4FE8]"}>{ctaLabel}</span>}
      </>
    );

  const cardClass = `${"relative flex [flex-direction:column] [align-items:flex-start] [justify-content:space-between] w-full [min-height:144px] h-full box-border [padding:16px] [border:1px_solid_rgba(91,_79,_232,_0.14)] [border-radius:8px] [background:#ffffff] cursor-pointer text-left no-underline [color:inherit] [box-shadow:0_12px_26px_rgba(28,_28,_26,_0.04)] [transition:transform_0.2s_ease,_box-shadow_0.2s_ease,_border-color_0.2s_ease,_background_0.2s_ease] hover:[transform:translateY(-2px)] hover:[box-shadow:0_18px_34px_rgba(28,_28,_26,_0.08)] hover:[border-color:rgba(91,_79,_232,_0.24)] hover:[background:#FFFCF7] focus-visible:[outline:2px_solid_var(--primary)] focus-visible:[outline-offset:2px]"}${companyMeta != null ? ` ${"[min-height:144px] [justify-content:flex-start] [gap:0] [padding:15px_15px_16px]"}` : ""}`;

  if (href) {
    return (
      <Link href={href} className={cardClass}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" className={cardClass} onClick={onSelect}>
      {content}
    </button>
  );
}
