import Link from "next/link";
import { cache } from "react";
import HomeExperience from "@/components/home/HomeExperience";
import { companyPagePath } from "@/lib/companyPages";
import CompanyLogoPlaceholder from "@/components/home/CompanyLogoPlaceholder";
import {
  countActiveJobsForCompanyName,
  getActiveJobsForCompanyName,
  getJobsListCached,
  resolveCompanyNameForSlug,
} from "@/lib/jobs";
import { getFeatureFlags } from "@/lib/featureFlags";
import { getCompanyWebsiteFromSources } from "@/lib/trackedCompanies";
import { CANONICAL_SITE_URL } from "@/lib/seoThresholds";
import { getLocationConfigs, getLocationPagePath, jobMatchesLocation } from "@/lib/locationPages";
import { shouldIndexCompanyPage } from "@/lib/seoIndexing";
import {
  collectIndexableRelatedCompanies,
  collectIndexableRelatedHubsForCompany,
  isIndexableCategoryHub,
} from "@/lib/seoInternalLinks";
import { CATEGORY_PAGES, getCategoryConfig } from "@/lib/categoryPages";
import { getCategoryGradientByFamily } from "@/lib/categoryMeta";
import { getJobFamily } from "@/lib/jobFieldHelpers";
import {
  buildHiringSignalBlock,
  formatCompanyCurrentTrendsLine,
  getCompanyPageLogoUrlsForDisplay,
} from "@/lib/companyPageCopy";
import {
  buildCompanyEnrichedMetaDescription,
  buildCompanyMetaDescription,
  buildCompanyPageTitle,
} from "@/lib/seoCopy";
import {
  buildOrganizationJsonLd,
  lookupCompanyDescriptionForPage,
  websiteUrlFromCanonicalDomain,
} from "@/lib/companyDescriptionMatch";
import { formatCompanyNameForDisplay } from "@/lib/companyDisplayFormat";

export const revalidate = 86400;

const COMPANY_PAGE_INITIAL_JOBS = 20;
const COMPANY_PAGE_AUX_JOBS_TIMEOUT_MS = Number(process.env.COMPANY_PAGE_AUX_JOBS_TIMEOUT_MS || 800);
const LOCATION_FALLBACKS = ["usa", "germany", "uk"];

function buildCompanyHiringLocations(companyJobs) {
  const counts = new Map();
  for (const config of getLocationConfigs()) {
    let count = 0;
    for (const job of companyJobs) {
      if (jobMatchesLocation(job, config)) count += 1;
    }
    if (count > 0) {
      counts.set(config.slug, {
        slug: config.slug,
        label: config.label,
        roleCount: count,
      });
    }
  }
  const sorted = Array.from(counts.values())
    .sort((a, b) => b.roleCount - a.roleCount || a.label.localeCompare(b.label))
    .slice(0, 4);
  if (sorted.length >= 2) return sorted;

  const bySlug = new Map(sorted.map((item) => [item.slug, item]));
  for (const slug of LOCATION_FALLBACKS) {
    if (bySlug.has(slug)) continue;
    const cfg = getLocationConfigs().find((item) => item.slug === slug);
    if (!cfg) continue;
    bySlug.set(slug, { slug: cfg.slug, label: cfg.label, roleCount: 0 });
    if (bySlug.size >= 2) break;
  }
  return Array.from(bySlug.values()).slice(0, 4);
}

function parseCompanyNameHint(raw) {
  if (raw == null) return "";
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw) && raw[0]) return String(raw[0]);
  return "";
}

async function awaitSearchParams(searchParams) {
  if (searchParams && typeof searchParams.then === "function") return await searchParams;
  return searchParams ?? {};
}

async function withSoftTimeout(promise, timeoutMs, fallbackValue) {
  let timeoutId;
  try {
    return await Promise.race([
      promise,
      new Promise((resolve) => {
        timeoutId = setTimeout(() => resolve(fallbackValue), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function CompanyEnrichmentSections({ enrichment, companyWebsite }) {
  if (!enrichment) return null;
  const desc = String(enrichment.description || "").trim();
  const careers = String(enrichment.careersBlurb || "").trim();
  const loc = String(enrichment.location || "").trim();
  const founded = enrichment.foundedYear != null;
  if (!desc && !careers && !loc && !founded) return null;

  const titleStyle = { fontSize: "1.1rem", marginTop: 0, color: "#f8fafc" };
  const hasMain = Boolean(desc || careers);
  const hasMeta = Boolean(loc || founded);

  const meta = hasMeta ? (
    <div className={"flex [flex-direction:column] [align-items:flex-end] [gap:14px] [flex:0_0_auto] [max-width:min(100%,_300px)] [padding-top:2px] max-[720px]:[align-items:flex-start] max-[720px]:text-left max-[720px]:[max-width:none] max-[720px]:w-full"} aria-label="Based out of, founded in, and website">
      {loc ? (
        <div className={"flex [flex-direction:column] [align-items:flex-end] [gap:4px] text-right max-[720px]:[align-items:flex-start] max-[720px]:text-left"}>
          <span className={"[font-size:0.65rem] font-bold [letter-spacing:0.12em] [text-transform:uppercase] [color:#93c5fd]"}>Based Out Of</span>
          <span className={"block [max-width:280px] [font-size:0.85rem] font-semibold [line-height:1.4] [color:#e0f2fe] [word-wrap:break-word]"}>{loc}</span>
        </div>
      ) : null}
      {founded ? (
        <div className={"flex [flex-direction:column] [align-items:flex-end] [gap:4px] text-right max-[720px]:[align-items:flex-start] max-[720px]:text-left"}>
          <span className={"[font-size:0.65rem] font-bold [letter-spacing:0.12em] [text-transform:uppercase] [color:#93c5fd]"}>Founded In</span>
          <span className={"block [max-width:280px] [font-size:0.85rem] font-semibold [line-height:1.4] [color:#e0f2fe] [word-wrap:break-word]"}>{enrichment.foundedYear}</span>
        </div>
      ) : null}
      <CompanyWebsiteHeroCta companyWebsite={companyWebsite} variant="meta" />
    </div>
  ) : null;

  return (
    <section className={"[margin-top:4px] [margin-bottom:8px]"} aria-label="Company profile details">
      <div
        className={`flex [flex-wrap:wrap] [align-items:flex-start] [gap:18px_24px] [justify-content:flex-start]${hasMain && hasMeta ? " flex [flex-wrap:wrap] [align-items:flex-start] [gap:18px_24px] [justify-content:flex-start]--split" : ""}${
          !hasMain && hasMeta ? " flex [flex-wrap:wrap] [align-items:flex-start] [gap:18px_24px] [justify-content:flex-start]--metaOnly" : ""
        }`}
      >
        {hasMain ? (
          <div className={"[flex:1_1_min(100%,_520px)] min-w-0"}>
            {desc ? (
              <>
                <h2 style={titleStyle}>
                  Company Overview
                </h2>
                <p className={"[margin:14px_0_0] [max-width:76ch] [line-height:1.7] [color:#e2e8f0] [line-height:1.5] [margin-top:10px]"}>{desc}</p>
              </>
            ) : null}
            {careers ? (
              <>
                <h2 style={{ ...titleStyle, marginTop: desc ? 18 : 0 }}>
                  Careers
                </h2>
                <p className={"[margin:14px_0_0] [max-width:76ch] [line-height:1.7] [color:#e2e8f0] [line-height:1.5] [margin-top:10px]"} style={{ marginBottom: 0 }}>
                  {careers}
                </p>
              </>
            ) : null}
          </div>
        ) : null}
        {meta}
      </div>
    </section>
  );
}

function CompanyPageTopNav({ fromCompanies }) {
  return (
    <nav className={"flex [flex-wrap:wrap] [gap:8px_20px] [align-items:center] [margin-bottom:12px]"} aria-label="Page">
      <Link href={fromCompanies ? "/companies" : "/"} className={"inline-block [margin-bottom:12px] [color:#dbeafe] no-underline [font-size:0.84rem] hover:underline"}>
        {fromCompanies ? "← Company drone jobs" : "← Drone jobs"}
      </Link>
      <Link href="/companies" className={"inline-block [margin-bottom:12px] [color:#dbeafe] no-underline [font-size:0.84rem] hover:underline"}>
        Company drone jobs
      </Link>
    </nav>
  );
}

function CompanyWebsiteHeroCta({ companyWebsite, variant = "hero" }) {
  const wrapClass =
    variant === "meta" ? "company-hero-actions company-hero-actions--in-meta" : "company-hero-actions";
  return (
    <div className={wrapClass}>
      {companyWebsite ? (
        <a
          href={companyWebsite}
          target="_blank"
          rel="noreferrer"
          className={"[&button:disabled]:[cursor:not-allowed] [&button:disabled]:[opacity:0.72] inline-flex [align-items:center] [justify-content:center] [min-width:136px] [padding:10px_14px] [border-radius:10px] [border:1px_solid_transparent] no-underline font-semibold [font-size:0.88rem] [background:#38bdf8] [color:#082f49]"}
        >
          Visit Website
        </a>
      ) : (
        <button type="button" disabled className={"[&button:disabled]:[cursor:not-allowed] [&button:disabled]:[opacity:0.72] inline-flex [align-items:center] [justify-content:center] [min-width:136px] [padding:10px_14px] [border-radius:10px] [border:1px_solid_transparent] no-underline font-semibold [font-size:0.88rem] [background:rgba(255,_255,_255,_0.12)] [color:#f8fafc] [border-color:rgba(255,_255,_255,_0.34)]"} aria-disabled="true">
          Website Not Linked
        </button>
      )}
    </div>
  );
}

const getCompanyPageData = cache(async (cacheKey) => {
  let slug;
  let nameHint = "";
  try {
    const p = JSON.parse(cacheKey);
    slug = p.slug;
    nameHint = p.h || "";
  } catch {
    slug = cacheKey;
  }
  const resolvedName = await resolveCompanyNameForSlug(slug, nameHint);
  if (!resolvedName) {
    const allJobs = await withSoftTimeout(
      getJobsListCached(),
      COMPANY_PAGE_AUX_JOBS_TIMEOUT_MS,
      []
    );
    return { resolvedName: "", companyJobs: [], companyJobTotal: 0, allJobs };
  }
  const [companyJobs, allJobs, companyJobTotal] = await Promise.all([
    getActiveJobsForCompanyName(resolvedName, { limit: COMPANY_PAGE_INITIAL_JOBS, offset: 0 }),
    withSoftTimeout(getJobsListCached(), COMPANY_PAGE_AUX_JOBS_TIMEOUT_MS, []),
    countActiveJobsForCompanyName(resolvedName),
  ]);
  return { resolvedName, companyJobs, companyJobTotal, allJobs };
});

export async function generateMetadata({ params, searchParams }) {
  const { companySlug: slug } = await params;
  const sp = await awaitSearchParams(searchParams);
  const nameHint = parseCompanyNameHint(sp?.c);
  const flags = getFeatureFlags();
  if (!flags.companyPagesV1) {
    return {
      title: "Company Jobs",
      alternates: { canonical: `/company/${slug}` },
      robots: { index: false, follow: true },
    };
  }

  const { companyJobs, resolvedName, companyJobTotal } = await getCompanyPageData(
    JSON.stringify({ slug, h: nameHint })
  );
  const companyName = String(companyJobs[0]?.company || resolvedName || slug.replace(/-/g, " ")).trim();
  const enrichmentRecord = lookupCompanyDescriptionForPage(slug, companyName);
  const enrichment = flags.companySeoEnrichmentV1 ? enrichmentRecord : null;
  const displayLabel =
    String(
      enrichmentRecord?.company?.trim() || formatCompanyNameForDisplay(companyName) || companyName
    ).trim() || companyName;
  const indexable = shouldIndexCompanyPage(slug, companyJobs, companyJobTotal);
  const pageTitle = enrichment?.seoTitle?.trim() || buildCompanyPageTitle(displayLabel);
  const pageDesc = flags.companySeoEnrichmentV1
    ? buildCompanyEnrichedMetaDescription(enrichment, displayLabel)
    : buildCompanyMetaDescription(displayLabel);
  return {
    title: pageTitle,
    description: pageDesc,
    alternates: { canonical: `/company/${slug}` },
    openGraph: {
      title: pageTitle,
      description: pageDesc,
      url: `${CANONICAL_SITE_URL}/company/${slug}`,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: pageTitle,
      description: pageDesc,
    },
    robots: { index: indexable, follow: true },
  };
}

export default async function CompanyPage({ params, searchParams }) {
  const { companySlug: slug } = await params;
  const sp = await awaitSearchParams(searchParams);
  const nameHint = parseCompanyNameHint(sp?.c);
  const fromCompanies = String(sp?.from ?? "").toLowerCase() === "companies";
  const flags = getFeatureFlags();
  if (!flags.companyPagesV1) {
    return (
      <main style={{ maxWidth: 860, margin: "0 auto", padding: "36px 20px" }}>
        <h1 style={{ marginTop: 0 }}>Company pages are coming soon.</h1>
        <Link href="/">Drone jobs worldwide</Link>
      </main>
    );
  }

  const { resolvedName, companyJobs, companyJobTotal, allJobs: jobs } = await getCompanyPageData(
    JSON.stringify({ slug, h: nameHint })
  );
  const companyName = String(companyJobs[0]?.company || resolvedName || slug.replace(/-/g, " ")).trim();
  /** Always resolve for logo URLs; SEO copy/JSON-LD stay behind `companySeoEnrichmentV1`. */
  const enrichmentRecord = lookupCompanyDescriptionForPage(slug, companyName);
  const enrichment = flags.companySeoEnrichmentV1 ? enrichmentRecord : null;
  const titleCaseSlug = slug
    .split("-")
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : ""))
    .join(" ");
  const displayName =
    String(
      enrichmentRecord?.company?.trim() ||
        formatCompanyNameForDisplay(companyName || titleCaseSlug) ||
        titleCaseSlug
    ).trim() || titleCaseSlug;
  const enrichmentForLogo = enrichmentRecord;

  const enrichmentWebsite =
    flags.companySeoEnrichmentV1 && enrichment?.canonicalDomain
      ? websiteUrlFromCanonicalDomain(enrichment.canonicalDomain)
      : "";
  const sourceWebsite = await getCompanyWebsiteFromSources(companyName);
  const companyWebsite =
    enrichmentWebsite ||
    sourceWebsite ||
    String(
      companyJobs.find((job) => {
        const value = String(job?.company_website || job?.website || job?.company_url || "").trim();
        return /^https?:\/\//i.test(value);
      })?.company_website ||
        companyJobs.find((job) => {
          const value = String(job?.website || "").trim();
          return /^https?:\/\//i.test(value);
        })?.website ||
        companyJobs.find((job) => {
          const value = String(job?.company_url || "").trim();
          return /^https?:\/\//i.test(value);
        })?.company_url ||
        ""
    ).trim();

  const enrichmentMetaColumn =
    enrichment &&
    (Boolean(String(enrichment.location || "").trim()) || enrichment.foundedYear != null);

  if (companyJobTotal === 0) {
    const { primaryUrl: logoUrl, fallbackUrl: logoFallbackUrl, fallbackUrls: logoFallbackUrls } =
      getCompanyPageLogoUrlsForDisplay([], enrichmentForLogo);
    const gradient = getCategoryGradientByFamily(null);
    const browseSimilarItems = [];
    for (const catSlug of Object.keys(CATEGORY_PAGES)) {
      if (isIndexableCategoryHub(catSlug, jobs, flags)) {
        const cfg = getCategoryConfig(catSlug);
        browseSimilarItems.push({
          key: `similar-${catSlug}`,
          path: `/jobs/${catSlug}`,
          label: cfg?.heading || catSlug,
        });
        if (browseSimilarItems.length >= 2) break;
      }
    }

    return (
      <main className={"[background:#f3f6fb] [min-height:100vh]"}>
        {flags.companySeoEnrichmentV1 && enrichment ? (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify(buildOrganizationJsonLd(displayName, enrichment)),
            }}
          />
        ) : null}
        <section className={"[background:linear-gradient(140deg,_rgba(5,_18,_43,_0.88),_rgba(10,_39,_94,_0.8)),_radial-gradient(circle_at_80%_10%,_rgba(56,_189,_248,_0.22),_transparent_38%)] [color:#f8fafc] [padding:30px_16px_34px]"}>
          <div className={"[max-width:1120px] [margin:0_auto]"}>
            <CompanyPageTopNav fromCompanies={fromCompanies} />
            <div
              style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16, flexWrap: "wrap" }}
            >
              <CompanyLogoPlaceholder
                url={logoUrl}
                fallbackUrl={logoFallbackUrl}
                fallbackUrls={logoFallbackUrls}
                company={displayName}
                accentGradient={gradient}
              />
              <h1 className={"m-0 [font-size:clamp(2rem,_4.2vw,_3rem)] [line-height:1.12] [letter-spacing:-0.03em]"} style={{ marginBottom: 0 }}>
                {enrichment?.h1?.trim() || `${displayName} Jobs`}
              </h1>
            </div>
            <p className={"[margin:8px_0_0] [color:#93c5fd] [font-size:0.72rem] [letter-spacing:0.14em] font-bold [text-transform:uppercase]"}>COMPANY PROFILE</p>
            {!enrichmentMetaColumn ? <CompanyWebsiteHeroCta companyWebsite={companyWebsite} /> : null}
            <CompanyEnrichmentSections enrichment={enrichment} companyWebsite={companyWebsite} />
            <section className={"company-prose-block [margin-bottom:8px]"} style={{ marginTop: 8 }}>
              {!enrichment ? (
                <h2
                  style={{ fontSize: "1.1rem", marginTop: 0, color: "#f8fafc" }}
                >
                  Company overview
                </h2>
              ) : null}
              {!enrichment ? (
                <p className={"[margin:14px_0_0] [max-width:76ch] [line-height:1.7] [color:#e2e8f0] [line-height:1.5]"} style={{ marginBottom: 12 }}>
                  {displayName} is tracked on Drone Roles.
                </p>
              ) : null}
              <p className={"[margin:14px_0_0] [max-width:76ch] [line-height:1.7] [color:#e2e8f0] [line-height:1.5]"} style={{ marginBottom: 16 }}>
                No active roles currently tracked.
              </p>
              {browseSimilarItems.length >= 1 ? (
                <section className={"[margin-top:8px]"} aria-label="Browse similar roles">
                  <h2 className={"[margin:0_0_12px] [font-size:1.1rem] font-bold [color:#f8fafc]"}>Browse similar roles</h2>
                  <div className={"[flex-wrap:nowrap] [align-items:center] flex [flex-wrap:wrap] [gap:10px] [align-items:flex-start]"}>
                    {browseSimilarItems.map((h) => (
                      <Link key={h.key} href={h.path} className={"[flex:0_0_auto] [white-space:nowrap] inline-flex [align-items:center] [padding:8px_14px] [border-radius:999px] [font-size:0.88rem] font-semibold no-underline [border:1px_solid_#cbd5e1] [background:#fff] [color:#1e40af] [box-shadow:0_1px_2px_rgba(15,_23,_42,_0.05)] [transition:background_0.15s_ease,_border-color_0.15s_ease] hover:[background:#eff6ff] hover:[border-color:#93c5fd] [background:rgba(255,_255,_255,_0.1)] [border-color:rgba(255,_255,_255,_0.35)] [color:#e0f2fe] [box-shadow:none] hover:[background:rgba(255,_255,_255,_0.18)] hover:[border-color:rgba(255,_255,_255,_0.5)]"}>
                        {h.label}
                      </Link>
                    ))}
                  </div>
                </section>
              ) : null}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: browseSimilarItems.length ? 16 : 0 }}>
                <Link href="/" className={"[&button:disabled]:[cursor:not-allowed] [&button:disabled]:[opacity:0.72] inline-flex [align-items:center] [justify-content:center] [min-width:136px] [padding:10px_14px] [border-radius:10px] [border:1px_solid_transparent] no-underline font-semibold [font-size:0.88rem] [background:#38bdf8] [color:#082f49]"}>
                  Drone jobs worldwide
                </Link>
              </div>
            </section>
          </div>
        </section>
      </main>
    );
  }

  const departments = Array.from(
    new Set(
      companyJobs
        .map((job) => String(job?.department || job?.team || job?.job_family || "").trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));

  const hiring = buildHiringSignalBlock(companyJobs);
  const hiringLocations = flags.seoLinkingV1 ? buildCompanyHiringLocations(companyJobs) : [];
  const exploreRelatedRoles = collectIndexableRelatedHubsForCompany(companyJobs, jobs, flags, 3);
  const relatedCompanies = collectIndexableRelatedCompanies(companyName, companyJobs, jobs, slug, 3);
  const showRelatedBand = exploreRelatedRoles.length >= 1 || relatedCompanies.length >= 1;
  const { primaryUrl: logoUrl, fallbackUrl: logoFallbackUrl, fallbackUrls: logoFallbackUrls } =
    getCompanyPageLogoUrlsForDisplay(companyJobs, enrichmentForLogo);
  const firstFamily = getJobFamily(companyJobs[0]);
  const logoGradient = getCategoryGradientByFamily(firstFamily);

  return (
    <main className={"[background:#f3f6fb] [min-height:100vh]"}>
      {flags.companySeoEnrichmentV1 && enrichment ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(buildOrganizationJsonLd(displayName, enrichment)),
          }}
        />
      ) : null}
      <section className={"[background:linear-gradient(140deg,_rgba(5,_18,_43,_0.88),_rgba(10,_39,_94,_0.8)),_radial-gradient(circle_at_80%_10%,_rgba(56,_189,_248,_0.22),_transparent_38%)] [color:#f8fafc] [padding:30px_16px_34px]"}>
        <div className={"[max-width:1120px] [margin:0_auto]"}>
          <CompanyPageTopNav fromCompanies={fromCompanies} />
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 12, flexWrap: "wrap" }}>
            <CompanyLogoPlaceholder
              url={logoUrl}
              fallbackUrl={logoFallbackUrl}
              fallbackUrls={logoFallbackUrls}
              company={displayName}
              accentGradient={logoGradient}
            />
            <h1 className={"m-0 [font-size:clamp(2rem,_4.2vw,_3rem)] [line-height:1.12] [letter-spacing:-0.03em]"} style={{ marginBottom: 0 }}>
              {enrichment?.h1?.trim() || `${displayName} Jobs`}
            </h1>
          </div>
          <p className={"[margin:8px_0_0] [color:#93c5fd] [font-size:0.72rem] [letter-spacing:0.14em] font-bold [text-transform:uppercase]"}>ACTIVE DRONE & UAV HIRING TEAM</p>
          {!enrichmentMetaColumn ? <CompanyWebsiteHeroCta companyWebsite={companyWebsite} /> : null}
          <CompanyEnrichmentSections enrichment={enrichment} companyWebsite={companyWebsite} />
          <div className={"flex [flex-direction:column] [gap:20px] [margin-top:4px] company-hero-block--stacked"}>
            <section
              className={"company-prose-block [margin-bottom:8px] [max-width:600px]"}
              aria-labelledby="current-trends-heading"
            >
              <h2
                id="current-trends-heading"
                style={{ fontSize: "1.15rem", marginTop: 0, color: "#f8fafc" }}
              >
                Current Trends
              </h2>
              <p className={"[margin:14px_0_0] [max-width:76ch] [line-height:1.7] [color:#e2e8f0] [line-height:1.5] [margin-top:10px] [margin-bottom:0] [margin-top:12px]"} style={{ marginTop: 12, marginBottom: 0 }}>
                {formatCompanyCurrentTrendsLine(displayName, hiring)}
              </p>
            </section>
            <section className={"[max-width:1120px] [margin:-18px_auto_0] [padding:0_16px] company-stats--in-hero company-stats--primary"} aria-label="Hiring snapshot">
              <div className={"[gap:14px] grid [grid-template-columns:repeat(auto-fit,_minmax(132px,_1fr))] [gap:10px] max-[920px]:[grid-template-columns:repeat(auto-fit,_minmax(124px,_1fr))]"}>
                <article className={"[padding:10px_12px] [background:rgba(255,_255,_255,_0.98)] [border-radius:10px] [border:1px_solid_rgba(203,_213,_225,_0.85)] font-medium [box-shadow:0_4px_14px_rgba(15,_23,_42,_0.06)] [&strong]:[font-size:17px] [&strong]:font-bold"}>
                  <p className={"[margin:0_0_4px] [font-size:0.7rem] [color:#64748b] [text-transform:uppercase] [letter-spacing:0.08em] font-bold"}>Open roles</p>
                  <p className={"m-0 [font-size:1.12rem] font-bold [color:#0f172a]"}>
                    <strong>{companyJobTotal}</strong>
                  </p>
                </article>
                {hiring.topFamilies.length > 0 ? (
                  <article className={"[padding:10px_12px] [background:rgba(255,_255,_255,_0.98)] [border-radius:10px] [border:1px_solid_rgba(203,_213,_225,_0.85)] font-medium [box-shadow:0_4px_14px_rgba(15,_23,_42,_0.06)] [&strong]:[font-size:17px] [&strong]:font-bold"}>
                    <p className={"[margin:0_0_4px] [font-size:0.7rem] [color:#64748b] [text-transform:uppercase] [letter-spacing:0.08em] font-bold"}>Top roles</p>
                    <p className={"m-0 [font-size:1.12rem] font-bold [color:#0f172a] [font-size:0.92rem] [line-height:1.35]"}>
                      <strong>{hiring.topFamilies.join(", ")}</strong>
                    </p>
                  </article>
                ) : null}
                {hiring.locationLine ? (
                  <article className={"[padding:10px_12px] [background:rgba(255,_255,_255,_0.98)] [border-radius:10px] [border:1px_solid_rgba(203,_213,_225,_0.85)] font-medium [box-shadow:0_4px_14px_rgba(15,_23,_42,_0.06)] [&strong]:[font-size:17px] [&strong]:font-bold"}>
                    <p className={"[margin:0_0_4px] [font-size:0.7rem] [color:#64748b] [text-transform:uppercase] [letter-spacing:0.08em] font-bold"}>Locations</p>
                    <p className={"m-0 [font-size:1.12rem] font-bold [color:#0f172a] [font-size:0.92rem] [line-height:1.35]"}>
                      <strong>{hiring.locationLine}</strong>
                    </p>
                  </article>
                ) : null}
              </div>
            </section>
            {flags.seoLinkingV1 && hiringLocations.length >= 1 ? (
              <section className={"company-prose-block [margin-bottom:8px]"} aria-label="Where this company is hiring">
                <h2
                  style={{ fontSize: "1.1rem", marginTop: 0, color: "#f8fafc" }}
                >
                  Where this company is hiring
                </h2>
                <ul>
                  {hiringLocations.map((loc) => (
                    <li key={loc.slug}>
                      <Link href={getLocationPagePath(loc.slug)}>Drone jobs in {loc.label}</Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        </div>
      </section>

      {showRelatedBand ? (
        <div className={"w-full [max-width:min(1120px,_100%)] [margin:0_auto] [padding:20px_16px_8px] box-border company-related-pair-wrap--fullbleed [margin-top:12px] [margin-top:28px]"}>
          <div className={"company-related-pair company-related-pair--split"}> 
            <section
              className={"w-full min-w-0 [padding:4px_14px_6px] box-border [border-right:1px_solid_rgba(148,_163,_184,_0.45)] [border-right:none] flex [flex-direction:column] [align-items:center] [justify-content:flex-start] text-center max-[768px]:[border-right:none] max-[768px]:[border-bottom:1px_solid_rgba(148,_163,_184,_0.35)] max-[768px]:[padding-bottom:12px] max-[768px]:[border-bottom:none] max-[768px]:[padding-bottom:2px] company-related-col--jobs"}
              aria-label="Related Job Categories"
            >
              <h2 className={"[margin:0_0_12px] [font-size:1.1rem] font-bold [color:#f8fafc] company-subsection-title--on-light text-center w-full"}>
                Related Job Categories
              </h2>
              {exploreRelatedRoles.length >= 1 ? (
                <div className={"flex [flex-wrap:nowrap] [justify-content:center] [align-items:center] [gap:8px] w-full [max-width:100%] m-0 [padding:2px_0_0] overflow-x-auto [overflow-y:hidden] [-webkit-overflow-scrolling:touch] [scrollbar-width:thin] [height:4px] company-related-chips-row--jobs [flex-wrap:nowrap] [align-items:center] flex [flex-wrap:wrap] [gap:10px] [align-items:flex-start]"}>
                  {exploreRelatedRoles.map((h) => (
                    <Link key={h.key} href={h.path} className={"[flex:0_0_auto] [white-space:nowrap] inline-flex [align-items:center] [padding:8px_14px] [border-radius:999px] [font-size:0.88rem] font-semibold no-underline [border:1px_solid_#cbd5e1] [background:#fff] [color:#1e40af] [box-shadow:0_1px_2px_rgba(15,_23,_42,_0.05)] [transition:background_0.15s_ease,_border-color_0.15s_ease] hover:[background:#eff6ff] hover:[border-color:#93c5fd] [background:rgba(255,_255,_255,_0.1)] [border-color:rgba(255,_255,_255,_0.35)] [color:#e0f2fe] [box-shadow:none] hover:[background:rgba(255,_255,_255,_0.18)] hover:[border-color:rgba(255,_255,_255,_0.5)]"}>
                      {h.label}
                    </Link>
                  ))}
                </div>
              ) : (
                <p className={"[margin:4px_0_0] [font-size:0.82rem] [color:#64748b] [line-height:1.45] [max-width:36ch]"}>No related category links for this company yet.</p>
              )}
            </section>
            <section
              className={"w-full min-w-0 [padding:4px_14px_6px] box-border [border-right:1px_solid_rgba(148,_163,_184,_0.45)] [border-right:none] flex [flex-direction:column] [align-items:center] [justify-content:flex-start] text-center max-[768px]:[border-right:none] max-[768px]:[border-bottom:1px_solid_rgba(148,_163,_184,_0.35)] max-[768px]:[padding-bottom:12px] max-[768px]:[border-bottom:none] max-[768px]:[padding-bottom:2px] company-related-col--companies"}
              aria-label="Companies In This Space"
            >
              <h2 className={"[margin:0_0_12px] [font-size:1.1rem] font-bold [color:#f8fafc] company-subsection-title--on-light text-center w-full"}>
                Companies In This Space
              </h2>
              {relatedCompanies.length >= 1 ? (
                <div className={"flex [flex-wrap:nowrap] [justify-content:center] [align-items:center] [gap:8px] w-full [max-width:100%] m-0 [padding:2px_0_0] overflow-x-auto [overflow-y:hidden] [-webkit-overflow-scrolling:touch] [scrollbar-width:thin] [height:4px] company-related-chips-row--companies"}>
                  {relatedCompanies.map((c) => (
                    <Link
                      key={c.slug}
                      href={companyPagePath(c.name) || `/company/${c.slug}`}
                      className={"[flex:0_0_auto] [white-space:nowrap] inline-flex [align-items:center] [gap:6px] [padding:8px_14px] [border-radius:999px] [font-size:0.88rem] font-semibold no-underline [border:1px_solid_#cbd5e1] [background:#fff] [color:#0f172a] [box-shadow:0_1px_2px_rgba(15,_23,_42,_0.05)] [transition:background_0.15s_ease,_border-color_0.15s_ease] hover:[background:#f8fafc] hover:[border-color:#94a3b8] hover:[color:#0f172a]"}
                    >
                      {c.name}
                      <span className={"[font-size:0.78rem] font-semibold [opacity:0.65]"}>{c.roleCount}</span>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className={"[margin:4px_0_0] [font-size:0.82rem] [color:#64748b] [line-height:1.45] [max-width:36ch]"}>
                  No similar companies found yet. Try browsing by sector on the{" "}
                  <Link href="/companies" className={"[color:#1d4ed8] font-semibold underline [text-underline-offset:2px] hover:[color:#1e3a8a]"}>
                    companies directory
                  </Link>
                  .
                </p>
              )}
            </section>
          </div>
        </div>
      ) : null}

      <div className={"[margin-top:48px]"}>
        <div className={"[max-width:1120px] [margin:22px_auto_0] [padding:0_16px] [margin-top:0]"}>
          <div className={"flex [flex-wrap:wrap] [align-items:flex-end] [justify-content:space-between] [gap:10px] [margin-bottom:10px] [&h2]:m-0 [&h2]:[font-size:1.9rem] [&h2]:[color:#0f172a] [&p]:m-0 [&p]:[color:#64748b] company-listings-header--solo"}>
            <h2>Open Opportunities</h2>
          </div>
        </div>
      </div>

      <div style={{ paddingBottom: 24 }}>
        <HomeExperience
          initialJobs={companyJobs}
          companyLazyLoad={
            companyJobTotal > COMPANY_PAGE_INITIAL_JOBS
              ? {
                  slug,
                  companyName,
                  total: companyJobTotal,
                  initialCount: COMPANY_PAGE_INITIAL_JOBS,
                }
              : undefined
          }
          trackedCompanies={[]}
          trackedCompaniesCount={0}
          lifetimeRolesCount={companyJobTotal}
          hideDiscovery
          hideContactBanner
          quickJobFamilies={departments}
          hideDesktopPreviewAsideWhenEmpty
        />
      </div>
    </main>
  );
}
