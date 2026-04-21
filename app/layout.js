import { DM_Sans } from "next/font/google";
import { Suspense } from "react";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import CookieNotice from "@/components/CookieNotice";
import SiteFooter from "@/components/SiteFooter";
import SiteFooterSkeleton from "@/components/SiteFooterSkeleton";
import SiteHeaderShell from "@/components/SiteHeaderShell";
import SiteMotion from "@/components/SiteMotion";
import { CANONICAL_SITE_URL } from "@/lib/seoThresholds";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});
const MAINTENANCE_MODE = process.env.MAINTENANCE_MODE === "true";

export const metadata = {
  metadataBase: new URL(CANONICAL_SITE_URL),
  // Icons: use app/icon.tsx and app/apple-icon.tsx (file-based metadata).
  // Avoid duplicating icons here — extra /favicon.ico handling is in next.config.mjs rewrites.
  title: {
    default: "Drone Roles - Live Drone & UAV Jobs",
    template: "%s | Drone Roles",
  },
  description:
    "Find live drone, UAV, UAS, autonomy, flight test, and aerospace roles from tracked companies worldwide.",
  keywords: [
    "drone jobs",
    "uav jobs",
    "uas jobs",
    "autonomy jobs",
    "flight test jobs",
    "aerospace jobs",
  ],
  openGraph: {
    title: "Drone Roles - Live Drone & UAV Jobs",
    description:
      "Find live drone, UAV, UAS, autonomy, flight test, and aerospace roles from tracked companies worldwide.",
    url: CANONICAL_SITE_URL,
    siteName: "Drone Roles",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Drone Roles - Live Drone & UAV Jobs",
    description:
      "Find live drone, UAV, UAS, autonomy, flight test, and aerospace roles from tracked companies worldwide.",
  },
};

export default function RootLayout({ children }) {
  if (MAINTENANCE_MODE) {
    return (
      <html lang="en" className={dmSans.variable}>
        <body
          style={{
            margin: 0,
            minHeight: "100vh",
            display: "grid",
            placeItems: "center",
            padding: "24px",
            background: "#020617",
            color: "#e2e8f0",
            fontFamily:
              'var(--font-sans), ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
          }}
        >
          <main style={{ maxWidth: 720, textAlign: "center" }}>
            <h1 style={{ margin: "0 0 10px", fontSize: "2rem" }}>Drone Roles is temporarily paused</h1>
            <p style={{ margin: 0, color: "#94a3b8", lineHeight: 1.6 }}>
              We are stabilizing our database infrastructure and will be back shortly.
            </p>
          </main>
        </body>
      </html>
    );
  }

  const websiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Drone Roles",
    url: CANONICAL_SITE_URL,
    potentialAction: {
      "@type": "SearchAction",
      target: `${CANONICAL_SITE_URL}/?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <html lang="en" className={dmSans.variable}>
      <body className='m-0 bg-[#f7f7f8] text-[#1f2937] [font-family:var(--font-sans),system-ui,-apple-system,sans-serif]'>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }}
        />
        <SiteMotion />
        <SiteHeaderShell />
        {children}
        <Suspense fallback={<SiteFooterSkeleton />}>
          <SiteFooter />
        </Suspense>
        <CookieNotice />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
