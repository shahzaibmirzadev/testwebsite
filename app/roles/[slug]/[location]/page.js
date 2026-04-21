import Link from "next/link";
import { notFound } from "next/navigation";
import HomeExperience from "@/components/home/HomeExperience";
import { getSearchableActiveJobs } from "@/lib/jobs";
import { getJobsForLocation } from "@/lib/locationPages";
import { getHomeUpdatedBadgeText } from "@/lib/updateBadge";
import {
  getJobsForRoleLocation,
  getRoleLocationLinkLabel,
  getRoleLocationPageConfig,
  getRoleLocationPagePath,
  resolveLocationLabel,
} from "@/lib/roleLocationPages";
import { getGlobalRolePageConfigs } from "@/lib/landingPageRegistry";


export const revalidate = 86400;

function deriveTopUseCase(jobs) {
  const counts = { inspection: 0, mapping: 0, defense: 0 };
  for (const job of Array.isArray(jobs) ? jobs : []) {
    const haystack = `${String(job?.title || "")} ${String(job?.description || "")} ${
      Array.isArray(job?.tags) ? job.tags.join(" ") : String(job?.tags || "")
    }`.toLowerCase();
    if (haystack.includes("inspection") || haystack.includes("inspect")) counts.inspection += 1;
    if (haystack.includes("mapping") || haystack.includes("survey") || haystack.includes("geospatial")) {
      counts.mapping += 1;
    }
    if (haystack.includes("defense") || haystack.includes("defence") || haystack.includes("military")) {
      counts.defense += 1;
    }
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (sorted[0]?.[1] > 0) return sorted[0][0];
  return "commercial drone operations";
}

function deriveCityOrRegionHint(jobs) {
  const counts = new Map();
  for (const job of Array.isArray(jobs) ? jobs : []) {
    const raw = String(job?.location || "").trim();
    if (!raw) continue;
    const firstToken = raw.split(",")[0]?.trim();
    if (!firstToken || firstToken.length < 3) continue;
    counts.set(firstToken, (counts.get(firstToken) || 0) + 1);
  }
  const top = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];
  return top || "core Dutch hubs";
}

function pickNearbyMarketPhrase(roleSlug, locationSlug) {
  const key = `${String(roleSlug || "")}:${String(locationSlug || "")}`;
  const hash = key.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return hash % 2 === 0 ? "Explore nearby markets" : "Check opportunities in nearby regions";
}

function deriveHiringLevel(count) {
  if (count >= 10) return "High";
  if (count >= 3) return "Moderate";
  return "Low";
}

function titleCaseWords(value) {
  return String(value || "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export async function generateMetadata({ params }) {
  const { slug, location } = await params;
  const pageConfig = getRoleLocationPageConfig(slug, location);
  if (!pageConfig) {
    return {
      title: "Role + location not found | DroneRoles",
      robots: { index: false, follow: false },
    };
  }
  return {
    title: pageConfig.seoTitle || `${titleCaseWords(pageConfig.roleLabel)} in ${pageConfig.locationLabel} (2026) | DroneRoles`,
    description: pageConfig.seoDescription || pageConfig.heroBlurb,
    alternates: { canonical: getRoleLocationPagePath(pageConfig.roleSlug, pageConfig.locationSlug) },
  };
}

export default async function RoleLocationPage({ params }) {
  const { slug, location } = await params;
  const pageConfig = getRoleLocationPageConfig(slug, location);
  if (!pageConfig) return notFound();

  const allJobs = await getSearchableActiveJobs();
  const locationJobs = getJobsForLocation(allJobs, pageConfig.locationSlug);
  const roleLocationJobs = getJobsForRoleLocation(allJobs, pageConfig);
  const topUseCase = deriveTopUseCase(roleLocationJobs);
  const cityOrRegionHint = deriveCityOrRegionHint(locationJobs);
  const nearbyMarketPhrase = pickNearbyMarketPhrase(pageConfig.roleSlug, pageConfig.locationSlug);
  const hiringLevel = deriveHiringLevel(roleLocationJobs.length);
  const rawTitlePrefix = String(pageConfig.roleLabel || "Drone jobs").replace(/\s+jobs$/i, "");
  const titlePrefix = titleCaseWords(rawTitlePrefix);
  const focusLabel = titlePrefix.endsWith("s") ? titlePrefix : `${titlePrefix}s`;
  const hasListings = roleLocationJobs.length > 0;
  const updatedBadgeText = getHomeUpdatedBadgeText();
  const hasBroaderRolePage = getGlobalRolePageConfigs().some((role) => role.roleSlug === pageConfig.roleSlug);
  const locationCarouselItems = pageConfig.relatedLocationLinks.map((item) => ({
    href: getRoleLocationPagePath(item.roleSlug, item.locationSlug),
    title: String(item.locationLabel || resolveLocationLabel(item.locationSlug)).trim(),
    meta: `${titlePrefix} jobs`,
  }));
  const fallbackNearbyItems =
    locationCarouselItems.length > 0
      ? locationCarouselItems
      : (["germany", "uk", "usa"]
          .filter((marketSlug) => marketSlug !== pageConfig.locationSlug)
          .map((marketSlug) => ({
            href: getRoleLocationPagePath("drone-pilot", marketSlug),
            title: resolveLocationLabel(marketSlug),
            meta: "Nearby pilot market",
          })));
  const relatedRoleItems = [
    ...pageConfig.relatedRoleLocationLinks.map((item) => ({
      href: getRoleLocationPagePath(item.roleSlug, item.locationSlug),
      title: getRoleLocationLinkLabel(item.roleLabel, pageConfig.locationLabel),
      meta: "Adjacent role, same market",
    })),
    ...(hasBroaderRolePage
      ? [
          {
            href: `/roles/${pageConfig.roleSlug}`,
            title: `${titlePrefix} Jobs`,
            meta: "Broader role page",
          },
        ]
      : []),
  ];
  const primaryAdjacentRole = pageConfig.relatedRoleLocationLinks[0] || null;
  const primaryCtaHref = primaryAdjacentRole
    ? getRoleLocationPagePath(primaryAdjacentRole.roleSlug, primaryAdjacentRole.locationSlug)
    : "/roles";
  const primaryCtaLabel = primaryAdjacentRole
    ? `Explore ${titleCaseWords(String(primaryAdjacentRole.roleLabel || "").replace(/\s+jobs$/i, ""))} roles`
    : "Explore related roles";
  const discoveryCarouselItems = [
    {
      href: `/roles/${pageConfig.roleSlug}`,
      title: `${titlePrefix} Jobs`,
      meta: "Broader role page",
    },
    {
      href: `/location/${pageConfig.locationSlug}`,
      title: `Drone Jobs in ${pageConfig.locationLabel}`,
      meta: "Broader location page",
    },
    ...pageConfig.relatedLocationLinks.map((item) => ({
      href: getRoleLocationPagePath(item.roleSlug, item.locationSlug),
      title: `${titlePrefix} in ${String(item.locationLabel || resolveLocationLabel(item.locationSlug)).trim()}`,
      meta: "Same role, different market",
    })),
    ...pageConfig.relatedRoleLocationLinks.map((item) => ({
      href: getRoleLocationPagePath(item.roleSlug, item.locationSlug),
      title: getRoleLocationLinkLabel(item.roleLabel, pageConfig.locationLabel),
      meta: "Adjacent role, same market",
    })),
    {
      href: "/companies",
      title: "Company Directory",
      meta: "Browse hiring companies",
    },
  ];

  return (
    <main className={"[background:linear-gradient(to_bottom,_#ffffff_0%,_#f8f9ff_100%)]"}>
      <div className={"[max-width:1240px] [margin:0_auto] [padding:26px_20px_72px]"}>
        <section className={"[padding:14px_4px_0]"}>
          <nav className={"flex [flex-wrap:wrap] [gap:14px] [margin-bottom:14px]"} aria-label="Breadcrumb">
            <Link href="/roles" className={"[color:#6b7280] no-underline [font-size:0.82rem] font-semibold hover:[color:#1f2937] hover:underline"}>
              Browse roles
            </Link>
            <Link href="/roles" className={"[color:#6b7280] no-underline [font-size:0.82rem] font-semibold hover:[color:#1f2937] hover:underline"}>
              {titlePrefix} roles
            </Link>
          </nav>
          <div className={"relative [border:1px_solid_#eceffc] [border-radius:14px] [background:linear-gradient(140deg,_rgba(30,_64,_175,_0.16)_0%,_rgba(59,_130,_246,_0.13)_44%,_rgba(224,_242,_254,_0.16)_100%),_linear-gradient(180deg,_#ffffff_0%,_#fbfcff_100%)] [padding:14px_14px_12px] overflow-hidden before:content-[''] before:absolute before:[inset:0] before:pointer-events-none before:[opacity:0.06] before:[background-image:radial-gradient(circle,_#7c8aa4_1px,_transparent_1px)] before:[background-size:32px_32px]"}>
            <div className={"grid [grid-template-columns:minmax(0,_1fr)_minmax(260px,_330px)] [gap:20px] [align-items:start] relative [z-index:1] max-[980px]:[grid-template-columns:1fr]"}>
              <div>
                <p className={"inline-flex [align-items:center] [gap:8px] [margin:0_0_8px] [padding:3px_10px] [border-radius:999px] [background:#eef2ff] [border:1px_solid_#dbe4ff] [color:#4f46e5] [text-transform:uppercase] [letter-spacing:0.08em] [font-size:0.64rem] font-extrabold"}>
                  <span className={"[width:7px] [height:7px] [border-radius:999px] [background:#4f46e5] [box-shadow:0_0_0_0_rgba(79,_70,_229,_0.55)] [animation:pulse_1.8s_ease-out_infinite]"} aria-hidden="true" />
                  <span className={"[white-space:nowrap]"}>Live market update</span>
                </p>
                <h1 className={"m-0 [color:#0b2240] [font-size:clamp(2.35rem,_4.7vw,_4.15rem)] [line-height:1.02] [letter-spacing:-0.03em] [text-wrap:balance]"}>
                  {titlePrefix} Jobs in <span className={"[color:#5b4bff]"}>{pageConfig.locationLabel}</span>
                </h1>
                <p className={"[margin:12px_0_0] [max-width:62ch] [color:#334155] [line-height:1.58] [font-size:1rem]"}>
                  {pageConfig.heroBlurb}
                </p>
                <p className={"[margin:8px_0_0] [max-width:66ch] [color:#4b5563] [font-size:0.9rem] [line-height:1.5]"}>
                  Current signal strength is strongest around {cityOrRegionHint}, with recurring demand tied to{" "}
                  {topUseCase}.
                </p>
                <p className={"[margin:10px_0_0] [color:#8a96a8] [font-size:0.72rem] [letter-spacing:0.1em] font-extrabold [text-transform:uppercase]"}>Last scan: {updatedBadgeText}</p>
              </div>
              <aside className={"[border:1px_solid_#e3e8f4] [border-radius:12px] [background:#ffffff] [padding:11px_12px] [box-shadow:0_4px_12px_rgba(15,_23,_42,_0.05)]"} aria-label="Market intelligence">
                <p className={"[margin:0_0_8px] [color:#0f172a] [font-size:0.66rem] [text-transform:uppercase] [letter-spacing:0.1em] font-extrabold"}>Market intelligence</p>
                <div className={"grid [gap:6px]"}>
                  <p className={"m-0 flex [justify-content:space-between] [gap:10px] [font-size:0.75rem] [color:#64748b]"}>
                    <span>Active market</span>
                    <span className={"[color:#111827] [font-weight:650] text-right"}>{pageConfig.locationLabel}</span>
                  </p>
                  <p className={"m-0 flex [justify-content:space-between] [gap:10px] [font-size:0.75rem] [color:#64748b]"}>
                    <span>Hiring climate</span>
                    <span className={"[color:#111827] [font-weight:650] text-right"}>{hiringLevel}</span>
                  </p>
                  <p className={"m-0 flex [justify-content:space-between] [gap:10px] [font-size:0.75rem] [color:#64748b]"}>
                    <span>Role focus</span>
                    <span className={"[color:#111827] [font-weight:650] text-right"}>{focusLabel}</span>
                  </p>
                  <p className={"m-0 flex [justify-content:space-between] [gap:10px] [font-size:0.75rem] [color:#64748b]"}>
                    <span>Industry hotspot</span>
                    <span className={"[color:#111827] [font-weight:650] text-right"}>{cityOrRegionHint}</span>
                  </p>
                </div>
              </aside>
            </div>
          </div>
        </section>

        <section className={"[margin-top:14px] [border:1px_solid_#e4e9f4] [border-radius:16px] [background:#ffffff] [padding:12px_16px_12px]"}>
          {hasListings ? (
            <div style={{ marginTop: 14 }}>
              <HomeExperience
                initialJobs={roleLocationJobs}
                hideDiscovery
                hideContactBanner
                hideDesktopPreviewAsideWhenEmpty
                previewStartsHidden
              />
            </div>
          ) : (
            <div className={"[margin-top:8px] [border:1px_solid_#ebeff7] [border-radius:14px] [background:linear-gradient(180deg,_#ffffff_0%,_#f9fbff_100%)] [padding:24px_18px_20px] text-center relative overflow-hidden before:content-[''] before:absolute before:[inset:0] before:pointer-events-none before:[opacity:0.12] before:[background-image:radial-gradient(circle,_#c7c4d8_1px,_transparent_1px)] before:[background-size:36px_36px]"}>
              <div className={"[width:86px] [height:86px] [border-radius:999px] [margin:0_auto_18px] grid [place-items:center] [background:#eeecff] [color:#5b4bff] [font-size:2.2rem] [box-shadow:0_0_0_11px_rgba(91,_75,_255,_0.09)] relative [z-index:1]"} aria-hidden="true">
                ⌾
              </div>
              <h3 className={"m-0 [color:#0f172a] [font-size:clamp(1.65rem,_3.3vw,_2.1rem)] [letter-spacing:-0.03em] [text-wrap:balance]"}>
                No active {titlePrefix.toLowerCase()} roles detected right now
              </h3>
              <p className={"[margin:8px_auto_0] [max-width:52ch] [color:#5b6472] [line-height:1.52]"}>
                The {pageConfig.locationLabel} {titlePrefix.toLowerCase()} market is in a high-retention cycle.
                Candidates typically shift toward adjacent tracks or nearby markets during this window.
              </p>
              <p className={"[margin:10px_0_0] [color:#1f2937] [font-size:0.87rem] font-bold"}>Hiring activity is currently low in this market.</p>
              <div className={"[margin-top:14px] flex [justify-content:center] [flex-wrap:wrap] [gap:10px]"}>
                <a href={primaryCtaHref} className={"inline-flex [align-items:center] [justify-content:center] [min-height:40px] [border-radius:8px] [padding:0_18px] no-underline [font-size:0.86rem] font-bold relative [z-index:1] [color:#ffffff] [background:linear-gradient(135deg,_#3730a3_0%,_#312e81_100%)] [box-shadow:0_14px_30px_rgba(49,_46,_129,_0.34)]"}>
                  {primaryCtaLabel}
                </a>
                <a href="#nearby-markets" className={"inline-flex [align-items:center] [justify-content:center] [min-height:40px] [border-radius:8px] [padding:0_18px] no-underline [font-size:0.86rem] font-bold relative [z-index:1] [color:#526174] [background:#ffffff] [border:1px_solid_#dbe4ef]"}>
                  Explore nearby markets
                </a>
              </div>
              <p className={"[margin:10px_0_0] [color:#8a96a8] [font-size:0.72rem] [letter-spacing:0.1em] font-extrabold [text-transform:uppercase]"} style={{ marginTop: 16 }}>
                Last scan: {updatedBadgeText}
              </p>
            </div>
          )}
        </section>

        <section className={"[margin-top:12px] grid [grid-template-columns:minmax(0,_1fr)_minmax(0,_1.08fr)_minmax(0,_1fr)] [gap:14px] [align-items:stretch] max-[980px]:[grid-template-columns:1fr] max-[980px]:[align-items:initial]"}>
          <article id="nearby-markets" className={"[border:1px_solid_#e3e8f4] [border-radius:12px] [background:#ffffff] [padding:14px] [box-shadow:0_10px_24px_rgba(15,_23,_42,_0.04)] h-full"}>
            <h3 className={"m-0 [color:#0f172a] [font-size:0.9rem]"}>Nearby markets</h3>
            <p className={"[margin:8px_0_0] [color:#64748b] [font-size:0.77rem] [line-height:1.42]"}>Explore related location landing pages for this role.</p>
            <div className={`${"[margin-top:8px] flex [flex-wrap:wrap] [gap:7px]"} ${"[margin-top:12px]"}`}>
              {fallbackNearbyItems.map((item) => (
                <Link key={item.href} href={item.href} className={`${"inline-flex [align-items:center] [min-height:26px] [padding:0_9px] [border-radius:7px] [border:1px_solid_#dbe3ef] [background:#f8fafc] [color:#475569] [font-size:0.72rem] font-semibold no-underline hover:[border-color:#5b4bff] hover:[color:#3f3aa8]"} ${"[background:#eef6ff] [border-color:#cfe0ff] [color:#1d4ed8] hover:[background:#e4f0ff] hover:[border-color:#93c5fd] hover:[color:#1e40af]"}`}>
                  {item.title}
                </Link>
              ))}
            </div>
          </article>
          <article id="related-roles" className={`${"[border:1px_solid_#e3e8f4] [border-radius:12px] [background:#ffffff] [padding:14px] [box-shadow:0_10px_24px_rgba(15,_23,_42,_0.04)] h-full"} ${"[border-color:#8cd7ca] [background:linear-gradient(180deg,_#ffffff_0%,_#effcf9_100%)] [box-shadow:0_18px_34px_rgba(20,_184,_166,_0.16)] [transform:scale(1.03)] [transform-origin:center] [z-index:1] max-[980px]:[transform:none] max-[980px]:[z-index:auto]"}`}>
            <h3 className={"m-0 [color:#0f172a] [font-size:0.9rem]"}>Related roles</h3>
            <p className={"[margin:8px_0_0] [color:#64748b] [font-size:0.77rem] [line-height:1.42]"}>Browse related role landing pages for this market.</p>
            <div className={`${"[margin-top:8px] flex [flex-wrap:wrap] [gap:7px]"} ${"[margin-top:12px]"}`}>
              {relatedRoleItems.map((item) => (
                <Link key={item.href} href={item.href} className={`${"inline-flex [align-items:center] [min-height:26px] [padding:0_9px] [border-radius:7px] [border:1px_solid_#dbe3ef] [background:#f8fafc] [color:#475569] [font-size:0.72rem] font-semibold no-underline hover:[border-color:#5b4bff] hover:[color:#3f3aa8]"} ${"[background:#ecfdf5] [border-color:#a7f3d0] [color:#0f766e] hover:[background:#dcfce7] hover:[border-color:#6ee7b7] hover:[color:#065f46]"}`}>
                  {item.title}
                </Link>
              ))}
            </div>
            <p className={`${"inline-flex [align-items:center] [min-height:20px] [padding:0_8px] [border-radius:999px] [background:#14b8a6] [color:#ffffff] [font-size:0.58rem] [text-transform:uppercase] [letter-spacing:0.08em] font-extrabold [margin-bottom:8px]"} ${"[margin-top:10px] [margin-bottom:0] [width:fit-content]"}`}>Recommended</p>
          </article>
          <article className={"[border:1px_solid_#e3e8f4] [border-radius:12px] [background:#ffffff] [padding:14px] [box-shadow:0_10px_24px_rgba(15,_23,_42,_0.04)] h-full"}>
            <h3 className={"m-0 [color:#0f172a] [font-size:0.9rem]"}>Top locations for this role</h3>
            <p className={"[margin:8px_0_0] [color:#64748b] [font-size:0.77rem] [line-height:1.42]"}>Browse top location landing pages for this role.</p>
            <div className={`${"[margin-top:8px] flex [flex-wrap:wrap] [gap:7px]"} ${"[margin-top:12px]"}`}>
              {discoveryCarouselItems.map((item) => (
                <Link key={item.href} href={item.href} className={`${"inline-flex [align-items:center] [min-height:26px] [padding:0_9px] [border-radius:7px] [border:1px_solid_#dbe3ef] [background:#f8fafc] [color:#475569] [font-size:0.72rem] font-semibold no-underline hover:[border-color:#5b4bff] hover:[color:#3f3aa8]"} ${"[background:#eef6ff] [border-color:#cfe0ff] [color:#1d4ed8] hover:[background:#e4f0ff] hover:[border-color:#93c5fd] hover:[color:#1e40af]"}`}>
                  {item.title}
                </Link>
              ))}
            </div>
          </article>
        </section>
        <p style={{ margin: "14px 0 0", color: "#64748b", fontSize: "0.84rem" }}>{nearbyMarketPhrase}.</p>
      </div>
    </main>
  );
}
