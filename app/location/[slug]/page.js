import Link from "next/link";
import { notFound } from "next/navigation";
import HomeExperience from "@/components/home/HomeExperience";
import SeoLocationSnippet from "@/components/SeoLocationSnippet";
import SeoContentBlocks from "@/components/SeoContentBlocks";
import { getSearchableActiveJobs } from "@/lib/jobs";
import {
  buildLocationStats,
  getJobsForLocation,
  getLocationConfigBySlug,
  getLocationConfigs,
  getLocationPagePath,
  getTopCompaniesForJobs,
} from "@/lib/locationPages";
import { getRoleLocationPageConfigs, getRoleLocationPagePath } from "@/lib/roleLocationPages";
import { CANONICAL_SITE_URL } from "@/lib/seoThresholds";
import { getFeatureFlags } from "@/lib/featureFlags";
import { locationSnippets } from "@/lib/seo/locationSnippets";
import { getJobFamily } from "@/lib/jobFieldHelpers";

export const revalidate = 86400;

function getMonthYearLabel() {
  return new Date().toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function hexToRgbTriplet(hexColor) {
  const hex = String(hexColor || "").trim().replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(hex)) return "37, 99, 235";
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}

const LOCATION_FALLBACKS = [
  { slug: "usa", label: "USA" },
  { slug: "germany", label: "Germany" },
  { slug: "uk", label: "UK" },
];

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const config = getLocationConfigBySlug(slug);
  if (!config) {
    return {
      title: "Drone Jobs by Location (2026) – Engineering, Operator & More | DroneRoles",
      robots: { index: false, follow: true },
    };
  }
  const description = `Explore active drone jobs in ${config.label} across engineering, operations, testing, and more. Browse current openings, compare roles, and find new listings updated weekly.`;
  return {
    title: `Drone Jobs in ${config.label} (2026) – Engineering, Operator & More | DroneRoles`,
    description,
    alternates: { canonical: getLocationPagePath(config.slug) },
  };
}

export default async function LocationPage({ params }) {
  const { slug } = await params;
  const config = getLocationConfigBySlug(slug);
  if (!config) notFound();
  const flags = getFeatureFlags();

  const allJobs = await getSearchableActiveJobs();
  const locationJobs = getJobsForLocation(allJobs, config.slug);
  const topCompanies = getTopCompaniesForJobs(locationJobs, 8);
  const stats = buildLocationStats(locationJobs);
  const relatedLinks = getLocationConfigs()
    .filter((item) => item.slug !== config.slug && config.relatedSlugs.includes(item.slug))
    .slice(0, 3);
  const relatedLinksWithFallback = [
    ...relatedLinks,
    ...LOCATION_FALLBACKS.filter(
      (item) => item.slug !== config.slug && !relatedLinks.some((existing) => existing.slug === item.slug)
    ),
  ].slice(0, 3);
  const locationSnippet = locationSnippets[config.slug] || "";
  const topRoleLinks = getRoleLocationPageConfigs()
    .filter((item) => item.locationSlug === config.slug)
    .slice(0, 5);
  const locationCarouselItems = [
    { href: "/locations", title: "All Locations", meta: "Browse all markets" },
    ...relatedLinksWithFallback.map((item) => ({
      href: getLocationPagePath(item.slug),
      title: item.label,
      meta: "Nearby market",
    })),
  ];
  const topRoleCarouselItems = topRoleLinks.map((item) => ({
    href: getRoleLocationPagePath(item.roleSlug, item.locationSlug),
    title: item.roleLabel,
    meta: `${config.label} market`,
  }));
  const relatedRoleModuleItems = topRoleCarouselItems.length
    ? topRoleCarouselItems
    : [{ href: "/roles", title: "Browse Role Pages", meta: "Role directory" }];
  const topRoleLabels = Array.from(
    locationJobs.reduce((map, job) => {
      const label = String(getJobFamily(job) || "").trim();
      if (!label) return map;
      map.set(label, (map.get(label) || 0) + 1);
      return map;
    }, new Map())
  )
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([label]) => label);

  const monthYear = getMonthYearLabel();
  const heroAccent = String(config.accentColor || "#0f172a");
  const accentRgb = hexToRgbTriplet(heroAccent);
  const topCompany = topCompanies[0] || null;
  const strongTopCompany = Boolean(topCompany) && topCompany.roleCount >= 3;
  const strongTopRole = Boolean(stats.topRoleTypeLabel) && stats.topRoleTypeCount >= 4;
  const qualitySignalLabel = strongTopCompany
    ? `Top hiring company`
    : strongTopRole
      ? "Most common role"
      : "Status";
  const qualitySignalValue = strongTopCompany
    ? `${topCompany.name} (${topCompany.roleCount} roles)`
    : strongTopRole
      ? `${stats.topRoleTypeLabel} (${stats.topRoleTypeCount} roles)`
      : "Updated with latest roles this week";
  const origin = CANONICAL_SITE_URL.replace(/\/$/, "");
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: `${origin}/`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Locations",
        item: `${origin}/locations`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: config.label,
        item: `${origin}${getLocationPagePath(config.slug)}`,
      },
    ],
  };

  return (
    <main
      className={`${"[background:linear-gradient(to_bottom,_#ffffff_0%,_#f8f9ff_100%)]"} [background:#f3f6fb] [min-height:100vh]`}
      style={{ "--location-accent": heroAccent, "--location-accent-rgb": accentRgb }}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <div className={"[max-width:1240px] [margin:0_auto] [padding:26px_20px_72px]"}>
        <section className={"[padding:14px_4px_0]"}>
          <nav className={"flex [flex-wrap:wrap] [gap:14px] [margin-bottom:14px]"} aria-label="Page links">
            <Link href="/locations" className={"[color:#6b7280] no-underline [font-size:0.82rem] font-semibold hover:[color:#1f2937] hover:underline"}>
              Drone jobs by location
            </Link>
            <Link href="/" className={"[color:#6b7280] no-underline [font-size:0.82rem] font-semibold hover:[color:#1f2937] hover:underline"}>
              Drone jobs worldwide
            </Link>
            <Link href="/companies" className={"[color:#6b7280] no-underline [font-size:0.82rem] font-semibold hover:[color:#1f2937] hover:underline"}>
              Company directory
            </Link>
          </nav>
          <div className={"grid [grid-template-columns:minmax(0,_1fr)_minmax(260px,_330px)] [gap:20px] [align-items:start] relative [z-index:1] max-[980px]:[grid-template-columns:1fr]"}>
            <div>
              <p className={"inline-flex [align-items:center] [gap:8px] [margin:0_0_8px] [padding:3px_10px] [border-radius:999px] [background:#eef2ff] [border:1px_solid_#dbe4ff] [color:#4f46e5] [text-transform:uppercase] [letter-spacing:0.08em] [font-size:0.64rem] font-extrabold"}>
                <span className={"[width:7px] [height:7px] [border-radius:999px] [background:#4f46e5] [box-shadow:0_0_0_0_rgba(79,_70,_229,_0.55)] [animation:pulse_1.8s_ease-out_infinite]"} aria-hidden="true" />
                <span className={"[white-space:nowrap]"}>Live market update</span>
              </p>
              <h1 className={"m-0 [color:#0b2240] [font-size:clamp(2.35rem,_4.7vw,_4.15rem)] [line-height:1.02] [letter-spacing:-0.03em] [text-wrap:balance]"}>
                Drone Jobs in <span className={"[color:#5b4bff]"}>{config.label}</span>
              </h1>
              {flags.seoContentBlocksV1 ? (
                <SeoLocationSnippet
                  locationName={config.label}
                  curatedSnippet={locationSnippet}
                  companies={topCompanies.map((company) => company.name)}
                  topRoles={topRoleLabels}
                />
              ) : null}
              <p className={"[margin:12px_0_0] [max-width:62ch] [color:#334155] [line-height:1.58] [font-size:1rem]"}>
                Active drone job openings across engineering, operations, testing, and more in {config.label}.
              </p>
              <p className={"[margin:10px_0_0] [color:#8a96a8] [font-size:0.72rem] [letter-spacing:0.1em] font-extrabold [text-transform:uppercase]"}>
                Updated {monthYear} • {locationJobs.length} active role{locationJobs.length === 1 ? "" : "s"}
              </p>
            </div>
            <aside className={"[border:1px_solid_#e3e8f4] [border-radius:12px] [background:#ffffff] [padding:11px_12px] [box-shadow:0_4px_12px_rgba(15,_23,_42,_0.05)]"} aria-label="Market intelligence">
              <p className={"[margin:0_0_8px] [color:#0f172a] [font-size:0.66rem] [text-transform:uppercase] [letter-spacing:0.1em] font-extrabold"}>Market intelligence</p>
              <div className={"grid [gap:6px]"}>
                <p className={"m-0 flex [justify-content:space-between] [gap:10px] [font-size:0.75rem] [color:#64748b]"}>
                  <span>Open roles</span>
                  <span className={"[color:#111827] [font-weight:650] text-right"}>{stats.activeJobs}</span>
                </p>
                <p className={"m-0 flex [justify-content:space-between] [gap:10px] [font-size:0.75rem] [color:#64748b]"}>
                  <span>Companies hiring</span>
                  <span className={"[color:#111827] [font-weight:650] text-right"}>{stats.companiesHiring}</span>
                </p>
                <p className={"m-0 flex [justify-content:space-between] [gap:10px] [font-size:0.75rem] [color:#64748b]"}>
                  <span>{qualitySignalLabel}</span>
                  <span className={"[color:#111827] [font-weight:650] text-right"}>{qualitySignalValue}</span>
                </p>
              </div>
            </aside>
          </div>
        </section>

        <section className={"[margin-top:14px] [border:1px_solid_#e4e9f4] [border-radius:16px] [background:#ffffff] [padding:12px_16px_12px]"}>
          <h2 className={"m-0 [color:#0f172a] [font-size:clamp(1.35rem,_2.2vw,_1.85rem)] [letter-spacing:-0.02em]"}>Open opportunities</h2>
          <p className={"[margin:8px_0_0] [color:#64748b]"}>
            Browse current listings and compare hiring activity for companies operating in {config.label}.
          </p>
          {flags.seoContentBlocksV1 ? (
            <div style={{ marginTop: 10 }}>
              <SeoContentBlocks
                locationLabel={config.label}
                locationSlug={config.slug}
                topCompanies={topCompanies}
                relatedLocations={relatedLinks}
              />
            </div>
          ) : null}
          <div style={{ marginTop: 14 }}>
            <HomeExperience
              initialJobs={locationJobs}
              trackedCompanies={[]}
              trackedCompaniesCount={0}
              lifetimeRolesCount={locationJobs.length}
              hideDiscovery
              hideContactBanner
              hideDesktopPreviewAsideWhenEmpty
            />
          </div>
        </section>

        <section className={"[margin-top:12px] grid [grid-template-columns:minmax(0,_1fr)_minmax(0,_1.08fr)_minmax(0,_1fr)] [gap:14px] [align-items:stretch] max-[980px]:[grid-template-columns:1fr] max-[980px]:[align-items:initial]"}>
          <article className={"[border:1px_solid_#e3e8f4] [border-radius:12px] [background:#ffffff] [padding:14px] [box-shadow:0_10px_24px_rgba(15,_23,_42,_0.04)] h-full"}>
            <h3 className={"m-0 [color:#0f172a] [font-size:0.9rem]"}>Nearby markets</h3>
            <p className={"[margin:8px_0_0] [color:#64748b] [font-size:0.77rem] [line-height:1.42]"}>Explore nearby and related markets.</p>
            <div className={`${"[margin-top:8px] flex [flex-wrap:wrap] [gap:7px]"} ${"[margin-top:12px]"}`}>
              {locationCarouselItems.map((item) => (
                <Link key={item.href} href={item.href} className={`${"inline-flex [align-items:center] [min-height:26px] [padding:0_9px] [border-radius:7px] [border:1px_solid_#dbe3ef] [background:#f8fafc] [color:#475569] [font-size:0.72rem] font-semibold no-underline hover:[border-color:#5b4bff] hover:[color:#3f3aa8]"} ${"[background:#eef6ff] [border-color:#cfe0ff] [color:#1d4ed8] hover:[background:#e4f0ff] hover:[border-color:#93c5fd] hover:[color:#1e40af]"}`}>
                  {item.title}
                </Link>
              ))}
            </div>
          </article>
          <article className={`${"[border:1px_solid_#e3e8f4] [border-radius:12px] [background:#ffffff] [padding:14px] [box-shadow:0_10px_24px_rgba(15,_23,_42,_0.04)] h-full"} ${"[border-color:#8cd7ca] [background:linear-gradient(180deg,_#ffffff_0%,_#effcf9_100%)] [box-shadow:0_18px_34px_rgba(20,_184,_166,_0.16)] [transform:scale(1.03)] [transform-origin:center] [z-index:1] max-[980px]:[transform:none] max-[980px]:[z-index:auto]"}`}>
            <h3 className={"m-0 [color:#0f172a] [font-size:0.9rem]"}>Top roles in this market</h3>
            <p className={"[margin:8px_0_0] [color:#64748b] [font-size:0.77rem] [line-height:1.42]"}>Role+location pages with the strongest market fit for {config.label}.</p>
            <div className={`${"[margin-top:8px] flex [flex-wrap:wrap] [gap:7px]"} ${"[margin-top:12px]"}`}>
              {(topRoleCarouselItems.length
                ? topRoleCarouselItems
                : [{ href: "/roles", title: "Role pages expanding for this market", meta: "Browse role directory" }]
              ).map((item) => (
                <Link key={item.href} href={item.href} className={`${"inline-flex [align-items:center] [min-height:26px] [padding:0_9px] [border-radius:7px] [border:1px_solid_#dbe3ef] [background:#f8fafc] [color:#475569] [font-size:0.72rem] font-semibold no-underline hover:[border-color:#5b4bff] hover:[color:#3f3aa8]"} ${"[background:#ecfdf5] [border-color:#a7f3d0] [color:#0f766e] hover:[background:#dcfce7] hover:[border-color:#6ee7b7] hover:[color:#065f46]"}`}>
                  {item.title}
                </Link>
              ))}
            </div>
            <p className={`${"inline-flex [align-items:center] [min-height:20px] [padding:0_8px] [border-radius:999px] [background:#14b8a6] [color:#ffffff] [font-size:0.58rem] [text-transform:uppercase] [letter-spacing:0.08em] font-extrabold [margin-bottom:8px]"} ${"[margin-top:10px] [margin-bottom:0] [width:fit-content]"}`}>Recommended</p>
          </article>
          <article className={"[border:1px_solid_#e3e8f4] [border-radius:12px] [background:#ffffff] [padding:14px] [box-shadow:0_10px_24px_rgba(15,_23,_42,_0.04)] h-full"}>
            <h3 className={"m-0 [color:#0f172a] [font-size:0.9rem]"}>Related roles</h3>
            <p className={"[margin:8px_0_0] [color:#64748b] [font-size:0.77rem] [line-height:1.42]"}>Browse related role landing pages for this market.</p>
            <div className={`${"[margin-top:8px] flex [flex-wrap:wrap] [gap:7px]"} ${"[margin-top:12px]"}`}>
              {relatedRoleModuleItems.map((item) => (
                <Link key={item.href} href={item.href} className={`${"inline-flex [align-items:center] [min-height:26px] [padding:0_9px] [border-radius:7px] [border:1px_solid_#dbe3ef] [background:#f8fafc] [color:#475569] [font-size:0.72rem] font-semibold no-underline hover:[border-color:#5b4bff] hover:[color:#3f3aa8]"} ${"[background:#eef6ff] [border-color:#cfe0ff] [color:#1d4ed8] hover:[background:#e4f0ff] hover:[border-color:#93c5fd] hover:[color:#1e40af]"}`}>
                  {item.title}
                </Link>
              ))}
            </div>
          </article>
        </section>
      </div>
    </main>
  );
}
