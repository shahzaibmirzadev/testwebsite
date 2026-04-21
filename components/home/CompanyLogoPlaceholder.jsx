"use client";

import { useEffect, useMemo, useState } from "react";


/**
 * @param {unknown} u
 * @returns {string|null}
 */
function normalizeLogoUrl(u) {
  const t = u == null ? "" : String(u).trim();
  return t || null;
}

/**
 * Dedupe while preserving order (case-sensitive string match).
 * @param {(string|null|undefined)[]} urls
 * @returns {string[]}
 */
function dedupeLogoUrls(urls) {
  const seen = new Set();
  const out = [];
  for (const raw of urls) {
    const n = normalizeLogoUrl(raw);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

/**
 * @param {{ url: string|null, fallbackUrl?: string|null, fallbackUrls?: string[], company: string, accentGradient?: string, compact?: boolean, className?: string }} props
 */
export default function CompanyLogoPlaceholder({
  url,
  fallbackUrl,
  fallbackUrls,
  company,
  accentGradient,
  compact,
  className,
}) {
  const initial = (company || "?").trim().charAt(0).toUpperCase() || "?";
  const label = company ? `Logo for ${company}` : "Company logo";

  const fallbackKey = (fallbackUrls || []).join("\0");

  const candidates = useMemo(
    () => dedupeLogoUrls([url, fallbackUrl, ...(Array.isArray(fallbackUrls) ? fallbackUrls : [])]),
    [url, fallbackUrl, fallbackKey]
  );

  const [failedThrough, setFailedThrough] = useState(0);

  useEffect(() => {
    setFailedThrough(0);
  }, [url, fallbackUrl, fallbackKey]);

  const currentSrc = candidates[failedThrough] ?? null;

  const handleImgError = () => {
    setFailedThrough((n) => n + 1);
  };

  /** Sector gradient only for the initial-letter fallback — real logos use the neutral frame. */
  const useAccentFill = Boolean(!currentSrc && accentGradient);

  return (
    <div
      className={`${"[flex-shrink:0] [width:52px] [height:52px] [border-radius:10px] [border:1px_solid_var(--border)] [background:#f8fafc] flex [align-items:center] [justify-content:center] overflow-hidden box-border"}${compact ? ` ${"[width:36px] [height:36px] [min-width:36px] [min-height:36px] [box-shadow:0_8px_18px_rgba(15,_23,_42,_0.12)] [width:40px] [height:40px] [border-radius:9px]"}` : ""}${
        currentSrc ? ` ${"[background:#ffffff] [border-color:#e2e8f0]"}` : ""
      }${className ? ` ${className}` : ""}`.trim()}
      style={
        useAccentFill ? { background: accentGradient, borderColor: "transparent" } : undefined
      }
      aria-label={label}
      role="img"
    >
      {currentSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={currentSrc}
          src={currentSrc}
          alt=""
          className={"[padding:4px] box-border w-full h-full [object-fit:contain] [object-position:center] [padding:5px]"}
          onError={handleImgError}
        />
      ) : (
        <span className={"[color:#fff] [font-size:0.95rem] [font-size:1.1rem] font-bold [color:var(--muted)]"} aria-hidden>
          {initial}
        </span>
      )}
    </div>
  );
}
