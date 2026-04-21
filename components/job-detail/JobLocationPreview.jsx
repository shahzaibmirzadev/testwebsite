import Link from "next/link";
import { FiExternalLink, FiMapPin, FiNavigation } from "react-icons/fi";

/**
 * Lightweight location preview.
 * @param {{ locationText: string, mapQuery: string }} props
 */
export default function JobLocationPreview({ locationText, mapQuery }) {
  const mapHref = mapQuery ? `https://www.google.com/maps/search/?api=1&query=${mapQuery}` : "";

  return (
    <div className="overflow-hidden rounded-[8px] border border-[rgba(0,0,0,0.08)] bg-[#FFFFFF] shadow-[0_10px_24px_rgba(28,28,26,0.06)]">
      <div className="relative min-h-[280px] bg-[#EEF7F6] sm:min-h-[330px]">
        <div className="absolute inset-0">
          <svg className="h-full w-full" viewBox="0 0 900 380" role="presentation" aria-hidden>
            <rect width="900" height="380" fill="#eef7f6" />
            <path d="M-80 78 C108 12 238 144 374 100 S612 26 782 86 966 100 1015 18 L1015 -40 L-80 -40 Z" fill="#dcefeb" />
            <path d="M-40 322 C126 238 262 292 412 214 S654 122 950 174 L950 430 L-40 430 Z" fill="#d8eadf" />
            <path d="M-20 72 C120 38 210 140 350 106 S590 35 760 84 970 108 1010 32" fill="none" stroke="#c2e0da" strokeWidth="38" strokeLinecap="round" opacity="0.86" />
            <path d="M-20 315 C155 230 260 288 410 214 S640 120 925 170" fill="none" stroke="#c7e5d0" strokeWidth="50" strokeLinecap="round" opacity="0.82" />
            <path d="M96 -35 C145 88 176 175 248 415" fill="none" stroke="#ffffff" strokeWidth="22" strokeLinecap="round" opacity="0.92" />
            <path d="M430 -30 C402 96 442 196 506 410" fill="none" stroke="#ffffff" strokeWidth="20" strokeLinecap="round" opacity="0.9" />
            <path d="M760 -25 C700 125 704 228 666 424" fill="none" stroke="#ffffff" strokeWidth="22" strokeLinecap="round" opacity="0.86" />
            <path d="M96 -35 C145 88 176 175 248 415" fill="none" stroke="#9fb6c8" strokeWidth="4" strokeLinecap="round" opacity="0.48" />
            <path d="M430 -30 C402 96 442 196 506 410" fill="none" stroke="#9fb6c8" strokeWidth="4" strokeLinecap="round" opacity="0.44" />
            <path d="M760 -25 C700 125 704 228 666 424" fill="none" stroke="#9fb6c8" strokeWidth="4" strokeLinecap="round" opacity="0.42" />
            <path d="M-20 176 L920 62" fill="none" stroke="#5B4FE8" strokeWidth="7" strokeLinecap="round" opacity="0.24" />
            <path d="M-26 218 L930 314" fill="none" stroke="#1A1160" strokeWidth="6" strokeLinecap="round" opacity="0.18" />
            <path d="M12 24 H888 M12 94 H888 M12 164 H888 M12 234 H888 M12 304 H888" fill="none" stroke="#ffffff" strokeWidth="1" opacity="0.42" />
            <path d="M78 0 V380 M190 0 V380 M302 0 V380 M414 0 V380 M526 0 V380 M638 0 V380 M750 0 V380 M862 0 V380" fill="none" stroke="#ffffff" strokeWidth="1" opacity="0.34" />
            <circle cx="254" cy="188" r="6" fill="#5B4FE8" opacity="0.28" />
            <circle cx="520" cy="146" r="5" fill="#1A1160" opacity="0.22" />
            <circle cx="672" cy="250" r="7" fill="#0F766E" opacity="0.24" />
          </svg>
        </div>

        <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-[#F8FCFB] to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#EEF7F6] to-transparent" />

        <div className="absolute left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[#5B4FE8] text-[#FFFFFF] shadow-[0_16px_34px_rgba(91,79,232,0.30)]">
          <FiMapPin aria-hidden className="h-6 w-6" />
        </div>

        <div className="absolute left-4 right-4 top-4 max-w-[440px] rounded-[8px] border border-[rgba(91,79,232,0.14)] bg-[rgba(255,255,255,0.94)] p-4 shadow-[0_12px_28px_rgba(28,28,26,0.10)] backdrop-blur">
          <p className="m-0 text-xs font-bold uppercase tracking-[0.05em] text-[#5B4FE8]">
            Location
          </p>
          <h3 className="mt-1 mb-1 text-lg font-bold leading-snug text-[#1C1C1A]">
            {locationText}
          </h3>
          <p className="m-0 text-sm leading-5 text-[#666666]">
            Approximate role location based on the employer listing.
          </p>
        </div>

        <div className="absolute bottom-4 right-4 flex h-12 w-12 items-center justify-center rounded-full border border-[rgba(91,79,232,0.16)] bg-[rgba(255,255,255,0.92)] text-[#5B4FE8] shadow-[0_10px_24px_rgba(28,28,26,0.12)]">
          <FiNavigation aria-hidden className="h-5 w-5" />
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-[rgba(0,0,0,0.08)] bg-[#FFFFFF] p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="m-0 text-sm font-medium text-[#666666]">
          {locationText}
        </p>
        {mapHref ? (
          <Link
            href={mapHref}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[8px] bg-[#5B4FE8] px-4 py-2 text-sm font-bold text-[#FFFFFF] no-underline transition-colors hover:bg-[#1A1160]"
            target="_blank"
            rel="noreferrer"
          >
            Open map
            <FiExternalLink aria-hidden className="h-4 w-4" />
          </Link>
        ) : null}
      </div>
    </div>
  );
}
