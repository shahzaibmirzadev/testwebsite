import Link from "next/link";
import { companyPagePath } from "@/lib/companyPages";
import { getJobsList } from "@/lib/jobs";
import { getFeatureFlags } from "@/lib/featureFlags";
import { isJobIndexable } from "@/lib/seoHealth";
import { CANONICAL_SITE_URL, isJobFreshForSitemap, GUIDE_MIN_INDEXABLE_JOBS } from "@/lib/seoThresholds";
import { jobSlug } from "@/lib/slug";
import { getAdjacentIndexableHubLinks, getTopIndexableCompaniesForHub } from "@/lib/seoInternalLinks";
import PageIntro from "@/components/seo/PageIntro";
import { buildGuideIntro, buildGuideMetaDescription, buildGuidePageTitle } from "@/lib/seoCopy";
import JobCard from "@/components/home/JobCard";


function parseJobTimestamp(job) {
  const ts = Date.parse(String(job?.last_seen_at || job?.posted_at || job?.updated_at || ""));
  return Number.isFinite(ts) ? ts : 0;
}

function safeMatch(matcher, job) {
  try {
    return Boolean(typeof matcher === "function" && matcher(job));
  } catch {
    return false;
  }
}

function getPageData(config) {
  const now = Date.now();
  return getJobsList().then((jobs) => {
    const flags = getFeatureFlags();
    const safeJobs = Array.isArray(jobs) ? jobs : [];
    const liveGuideJobs = safeJobs
      .filter((job) => isJobIndexable(job) && isJobFreshForSitemap(job) && safeMatch(config?.match, job))
      .sort((a, b) => parseJobTimestamp(b) - parseJobTimestamp(a));

    const adjacentHubLinks = getAdjacentIndexableHubLinks(config.slug, "guide", safeJobs, flags, 3);
    const topCompaniesSeo = getTopIndexableCompaniesForHub(config.match, safeJobs, 5);

    return {
      generatedAt: now,
      liveGuideJobs,
      adjacentHubLinks,
      topCompaniesSeo,
      indexable: liveGuideJobs.length >= GUIDE_MIN_INDEXABLE_JOBS,
    };
  });
}

function getFeedContextLabel(config) {
  const slug = String(config?.slug || "").toLowerCase();
  if (slug === "drone-jobs-europe") return "Europe";
  if (slug === "uav-pilot-jobs") return "pilot roles";
  if (slug === "drone-engineering-jobs") return "engineering teams";
  return "this category";
}

export async function buildGuideMetadata(config) {
  const { indexable } = await getPageData(config);
  const title = buildGuidePageTitle(config.heading);
  const description = buildGuideMetaDescription(config.heading);
  return {
    title,
    description,
    alternates: { canonical: `/${config.slug}` },
    openGraph: {
      title,
      description,
      url: `${CANONICAL_SITE_URL}/${config.slug}`,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
    robots: { index: indexable, follow: true },
  };
}

export async function GuideLandingPage({ config }) {
  const { generatedAt, liveGuideJobs, adjacentHubLinks, topCompaniesSeo } = await getPageData(config);
  const contextLabel = getFeedContextLabel(config);
  const introText = buildGuideIntro({
    guideName: config.heading,
    jobs: liveGuideJobs,
    topCompanies: topCompaniesSeo,
  });
  const renderFeaturedRouteCard = () => (
    <div className={"relative [isolation:isolate] [border:1px_solid_rgba(96,_165,_250,_0.32)] [border-radius:16px] [background:radial-gradient(circle_at_84%_14%,_rgba(56,_189,_248,_0.25),_transparent_42%),_radial-gradient(circle_at_14%_86%,_rgba(59,_130,_246,_0.18),_transparent_46%),_linear-gradient(145deg,_#0f234f_0%,_#172f66_56%,_#1f3b82_100%)] [padding:14px_14px] [box-shadow:0_16px_34px_rgba(15,_23,_42,_0.24)] before:content-[''] before:absolute before:[inset:0] before:[border-radius:inherit] before:[padding:1px] before:[background:linear-gradient(120deg,_rgba(59,_130,_246,_0.5),_rgba(124,_58,_237,_0.35))] before:[-webkit-mask:linear-gradient(#000_0_0)_content-box,_linear-gradient(#000_0_0)] before:[-webkit-mask-composite:xor] before:[mask-composite:exclude] before:pointer-events-none before:[z-index:-1]"}>
      <span className={"inline-flex [align-items:center] [border:1px_solid_rgba(94,_234,_212,_0.28)] [background:rgba(15,_23,_42,_0.32)] [color:#99f6e4] [border-radius:999px] [font-size:0.67rem] font-bold [letter-spacing:0.05em] [text-transform:uppercase] [padding:2px_7px] [margin-bottom:7px]"}>Featured Route</span>
      <h3 className={"[margin:0_0_7px] [font-size:0.98rem] [color:#eff6ff] [letter-spacing:-0.01em]"}>Not finding the right role?</h3>
      <p className={"m-0 [font-size:0.82rem] [line-height:1.5] [color:#ccfbf1]"}>
        Switch paths fast: jump into the full job feed or go straight to company-led browsing if this
        stream is too narrow.
      </p>
      <div className={"[margin-top:10px] flex [flex-wrap:wrap] [gap:9px] [align-items:center]"}>
        <Link href="/" className={"inline-flex [align-items:center] [justify-content:center] [border:1px_solid_rgba(147,_197,_253,_0.36)] [background:rgba(37,_99,_235,_0.34)] [color:#fff] no-underline [border-radius:9px] [padding:7px_11px] [font-size:0.8rem] font-bold [box-shadow:0_8px_18px_rgba(37,_99,_235,_0.24)] hover:[border-color:rgba(125,_211,_252,_0.72)] hover:[background:rgba(56,_189,_248,_0.22)] hover:[color:#ffffff]"}>Browse All Drone Jobs</Link>
        <Link href="/companies" className={"[color:#ccfbf1] no-underline [font-size:0.77rem] font-semibold hover:[color:#ffffff] hover:underline"}>Browse Top Companies</Link>
      </div>
    </div>
  );
  const schema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: config.heading,
    description: buildGuideMetaDescription(config.heading),
    dateModified: new Date(generatedAt).toISOString(),
    mainEntity: {
      "@type": "ItemList",
      itemListElement: liveGuideJobs.slice(0, 20).map((job, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: `${CANONICAL_SITE_URL}/jobs/${jobSlug(job)}`,
        name: String(job?.title || "Drone role"),
      })),
    },
  };

  return (
    <main className={"[max-width:960px] [margin:0_auto] [padding:34px_20px_64px] [background:radial-gradient(circle_at_90%_-2%,_rgba(59,_130,_246,_0.16),_transparent_34%),_radial-gradient(circle_at_4%_24%,_rgba(124,_58,_237,_0.08),_transparent_32%),_linear-gradient(180deg,_#eef3ff_0%,_#f2f6ff_26%,_#edf3ff_100%)] [border-radius:16px]"}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
      <header className={"relative [margin-bottom:14px]"}>
        <div className={"absolute [inset:-10px_-8px_auto_auto] [width:210px] [height:210px] pointer-events-none [background:radial-gradient(circle,_rgba(59,_130,_246,_0.26),_transparent_64%)] [filter:blur(8px)]"} aria-hidden />
        <div className={"relative [z-index:1] [border:1px_solid_#c4d6f0] [border-radius:18px] [padding:16px_16px_14px] [background:radial-gradient(circle_at_92%_12%,_rgba(56,_189,_248,_0.2),_transparent_38%),_linear-gradient(140deg,_#0f1f44_0%,_#17316b_56%,_#1f3b82_100%)] [box-shadow:0_18px_44px_rgba(15,_23,_42,_0.22)]"}>
          <nav className={"flex [flex-wrap:wrap] [gap:6px] [align-items:center] [margin-bottom:8px]"} aria-label="Page navigation">
            <Link href="/" className={"[font-size:0.82rem] [color:#dbeafe] no-underline hover:[color:#ffffff] hover:underline"}>← Back To Home</Link>
            <span className={"[color:#93c5fd] [font-size:0.72rem]"} aria-hidden>•</span>
            <Link href="/#browse-listings" className={"[font-size:0.82rem] [color:#dbeafe] no-underline hover:[color:#ffffff] hover:underline"}>Browse All Jobs</Link>
          </nav>
          <p className={"[margin:0_0_8px] [font-size:0.7rem] font-bold [text-transform:uppercase] [letter-spacing:0.11em] [color:#93c5fd]"}>Live curated landing page</p>
          <h1 className={"[margin:0_0_10px] [font-size:clamp(1.85rem,_3.5vw,_2.25rem)] [line-height:1.2] [letter-spacing:-0.02em] [color:#eff6ff]"}>{config.heading}</h1>
          <PageIntro paragraphClassName={"m-0 [max-width:62ch] [color:#d6e6ff] [line-height:1.62]"}>{introText}</PageIntro>
          <div className={"[margin-top:12px] flex [flex-wrap:wrap] [gap:7px]"}>
            <span className={"inline-flex [align-items:center] [gap:5px] [font-size:0.75rem] [color:#dbeafe] [border:1px_solid_rgba(148,_197,_255,_0.34)] [background:rgba(15,_23,_42,_0.25)] [border-radius:999px] [padding:4px_9px] [&strong]:[font-size:0.8rem] [&strong]:[color:#ffffff]"}>
              <strong>{liveGuideJobs.length}</strong> live roles
            </span>
            <span className={"inline-flex [align-items:center] [gap:5px] [font-size:0.75rem] [color:#dbeafe] [border:1px_solid_rgba(148,_197,_255,_0.34)] [background:rgba(15,_23,_42,_0.25)] [border-radius:999px] [padding:4px_9px] [&strong]:[font-size:0.8rem] [&strong]:[color:#ffffff]"}>
              <strong>{topCompaniesSeo.length}</strong> hiring companies
            </span>
            <span className={"inline-flex [align-items:center] [gap:5px] [font-size:0.75rem] [color:#dbeafe] [border:1px_solid_rgba(148,_197,_255,_0.34)] [background:rgba(15,_23,_42,_0.25)] [border-radius:999px] [padding:4px_9px] [&strong]:[font-size:0.8rem] [&strong]:[color:#ffffff]"}>
              <strong>{adjacentHubLinks.length}</strong> related hubs
            </span>
          </div>
        </div>
      </header>

      <section className={"[border:1px_solid_#d6e1f2] [border-radius:14px] [padding:10px_10px_8px] [background:linear-gradient(180deg,_#ffffff_0%,_#fbfdff_100%)] [margin-bottom:10px] [box-shadow:0_12px_30px_rgba(15,_23,_42,_0.08)]"}>
        <div className={"grid [gap:8px] [margin-bottom:10px]"}>
          {adjacentHubLinks.length > 0 ? (
            <div className={"grid [gap:5px]"}>
              <div className={"flex [align-items:baseline] [justify-content:space-between] [gap:10px]"}>
                <span className={"[font-size:0.71rem] [text-transform:uppercase] [letter-spacing:0.05em] [color:#64748b] font-bold [color:#53627d]"}>Related hubs</span>
                <span className={"[font-size:0.72rem] [color:#7587a2]"}>More paths</span>
              </div>
              <div className={"flex [flex-wrap:wrap] [gap:7px] max-[900px]:[gap:6px]"}>
                {adjacentHubLinks.map((entry) => (
                  <Link key={entry.key} href={entry.path} className={"inline-flex [align-items:center] [gap:7px] [border:1px_solid_#d3e0f1] [background:#f7fbff] [color:#1f2937] [border-radius:999px] no-underline [font-size:0.76rem] [padding:5px_10px] [transition:border-color_0.16s_ease,_background_0.16s_ease,_color_0.16s_ease,_transform_0.16s_ease,_box-shadow_0.16s_ease] hover:[border-color:#a5bee3] hover:[background:#f0f7ff] hover:[color:#1d4ed8] hover:[transform:translateY(-1px)] hover:[box-shadow:0_6px_14px_rgba(15,_23,_42,_0.06)] max-[900px]:[padding:5px_9px]"}>
                    <span className={"[font-size:0.78rem] font-semibold [color:#0f172a] [line-height:1.3]"}>{entry.label}</span>
                    <span className={"inline-flex [align-items:center] [gap:6px]"}>
                      <span className={"[font-size:0.66rem] [color:#64748b] [text-transform:uppercase] [letter-spacing:0.05em]"}>Hub</span>
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
          {topCompaniesSeo.length > 0 ? (
            <div className={"grid [gap:5px]"}>
              <div className={"flex [align-items:baseline] [justify-content:space-between] [gap:10px]"}>
                <span className={"[font-size:0.71rem] [text-transform:uppercase] [letter-spacing:0.05em] [color:#64748b] font-bold [color:#53627d]"}>Top companies hiring</span>
                <span className={"[font-size:0.72rem] [color:#7587a2]"}>Indexable listings</span>
              </div>
              <div className={"flex [flex-wrap:wrap] [gap:7px] max-[900px]:[gap:6px]"}>
                {topCompaniesSeo.map((entry) => (
                  <Link
                    key={entry.slug}
                    href={companyPagePath(entry.name) || `/company/${entry.slug}`}
                    className={"inline-flex [align-items:center] [gap:7px] [border:1px_solid_#d3e0f1] [background:#f7fbff] [color:#1f2937] [border-radius:999px] no-underline [font-size:0.76rem] [padding:5px_10px] [transition:border-color_0.16s_ease,_background_0.16s_ease,_color_0.16s_ease,_transform_0.16s_ease,_box-shadow_0.16s_ease] hover:[border-color:#a5bee3] hover:[background:#f0f7ff] hover:[color:#1d4ed8] hover:[transform:translateY(-1px)] hover:[box-shadow:0_6px_14px_rgba(15,_23,_42,_0.06)] max-[900px]:[padding:5px_9px]"}
                  >
                    <span className={"[font-size:0.78rem] font-semibold [color:#0f172a] [line-height:1.3]"}>{entry.name}</span>
                    <span className={"inline-flex [align-items:center] [gap:6px]"}>
                      <span className={"[font-size:0.66rem] [color:#64748b] [text-transform:uppercase] [letter-spacing:0.05em]"}>Company</span>
                      <span className={"[border:1px_solid_#c7d7ef] [background:#eef5ff] [color:#1d4ed8] [border-radius:999px] [font-size:0.66rem] font-bold [padding:1px_6px]"}>{entry.roleCount}</span>
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </div>
        <h2 className={"[margin:0_0_6px] [font-size:1.04rem] font-bold [color:#0f172a]"}>Live jobs in {contextLabel}</h2>
        <p className={"[margin:-1px_0_9px] [font-size:0.8rem] [color:#64748b] [padding-bottom:8px] [border-bottom:1px_solid_#e5ecf8]"}>
          {liveGuideJobs.length} active role{liveGuideJobs.length === 1 ? "" : "s"} across{" "}
          {topCompaniesSeo.length} compan{topCompaniesSeo.length === 1 ? "y" : "ies"}
        </p>
        {liveGuideJobs.length === 0 ? (
          <p className={"m-0 [color:#64748b] [line-height:1.5]"}>
            There are no fresh jobs in this landing page right now. Check back soon for new live roles.
          </p>
        ) : (
          <div className={"[background:linear-gradient(180deg,_#f7faff_0%,_#f1f7ff_100%)] [border:1px_solid_#d4e1f3] [border-radius:14px] [padding:7px] [box-shadow:inset_0_1px_0_rgba(255,_255,_255,_0.94),_0_8px_24px_rgba(15,_23,_42,_0.05)]"}>
            <div className={"grid [gap:5px] [&>_article]:m-0"}>
              {liveGuideJobs.slice(0, 20).map((job, index) => {
                const slug = jobSlug(job);
                if (!slug) return null;
                const listedPosition = index + 1;
                const showFeaturedAfter =
                  listedPosition === 4 || (listedPosition > 4 && (listedPosition - 4) % 20 === 0);
                return (
                  <div key={slug} className={"[&>_article]:m-0 grid [gap:8px]"}>
                    <JobCard job={job} />
                    {showFeaturedAfter ? (
                      renderFeaturedRouteCard()
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>
      <section className={"[margin:22px_-16px_0] [padding:10px_14px_0] max-[900px]:[margin:16px_0_0] max-[900px]:[padding:8px_0_0]"} aria-label="Next step">
        <div className={"relative [margin-bottom:10px] text-center before:content-[''] before:absolute before:[left:0] before:[right:0] before:[top:50%] before:[height:1px] before:[background:rgba(71,_85,_105,_0.2)] [&span]:relative [&span]:[z-index:1] [&span]:inline-block [&span]:[padding:0_10px] [&span]:[background:#eef3ff] [&span]:[color:rgba(71,_85,_105,_0.7)] [&span]:[font-size:0.7rem] [&span]:[letter-spacing:0.05em] [&span]:[text-transform:uppercase] [&span]:font-bold"}>
          <span>End of results</span>
        </div>
        <div className={"relative overflow-hidden [border-radius:18px] [padding:16px_24px_14px] [background:radial-gradient(circle_at_84%_18%,_rgba(99,_102,_241,_0.18),_transparent_42%),_linear-gradient(112deg,_#e8ecff_0%,_#dde5ff_46%,_#d7e0fb_100%)] [box-shadow:0_20px_44px_rgba(15,_23,_42,_0.14),_inset_0_1px_0_rgba(255,_255,_255,_0.78)] before:content-[''] before:absolute before:[left:0] before:[top:14px] before:[bottom:14px] before:[width:4px] before:[border-radius:999px] before:[background:linear-gradient(180deg,_#3b82f6_0%,_#6366f1_100%)] before:[opacity:0.9] after:content-[''] after:absolute after:[inset:0] after:[background-image:radial-gradient(rgba(255,_255,_255,_0.18)_1px,_transparent_1px)] after:[background-size:8px_8px] after:[opacity:0.14] after:pointer-events-none max-[900px]:[padding:16px_14px_14px] max-[900px]:[border-radius:20px]"}>
          <h3 className={"m-0 [font-size:clamp(1.22rem,_1.8vw,_1.55rem)] [line-height:1.12] [letter-spacing:-0.02em] [color:#0f172a] relative [z-index:1] text-center"}>Didn&apos;t find the right role?</h3>
          <div className={"[margin-top:10px] grid [justify-items:center] [gap:8px] relative [z-index:1]"}>
            <Link href="/" className={"relative inline-flex [align-items:center] [justify-content:center] [width:fit-content] [min-height:48px] [border-radius:15px] [padding:11px_18px] no-underline [font-size:0.9rem] font-extrabold [letter-spacing:0.01em] [color:#ffffff] [background:linear-gradient(135deg,_#334155_0%,_#2563eb_56%,_#1d4ed8_100%)] [border:1px_solid_rgba(219,_234,_254,_0.45)] [box-shadow:0_16px_30px_rgba(37,_99,_235,_0.28),_0_4px_10px_rgba(15,_23,_42,_0.22)] [transform:none] hover:[filter:brightness(1.08)] hover:[transform:translateY(-1px)] after:content-[''] after:absolute after:[inset:auto_8%_-12px_8%] after:[height:22px] after:[border-radius:999px] after:[background:radial-gradient(circle,_rgba(37,_99,_235,_0.3),_transparent_70%)] after:[filter:blur(8px)] after:pointer-events-none max-[900px]:[min-height:46px] max-[900px]:w-full max-[900px]:hover:[transform:translateY(-1px)]"}>Browse All Drone Jobs</Link>
            <div className={"flex [flex-wrap:wrap] [gap:8px_14px] [margin-left:0] [justify-content:center]"}>
              <Link href="/uav-pilot-jobs" className={"inline-flex [align-items:center] [gap:6px] [color:rgba(30,_58,_138,_0.84)] no-underline [font-size:0.8rem] font-semibold [opacity:0.9] hover:[color:#1d4ed8] hover:underline"}>
                <span className={"[font-size:0.78rem] [color:rgba(30,_58,_138,_0.68)]"} aria-hidden>↗</span>
                UAV Pilot Jobs
              </Link>
              <Link href="/drone-engineering-jobs" className={"inline-flex [align-items:center] [gap:6px] [color:rgba(30,_58,_138,_0.84)] no-underline [font-size:0.8rem] font-semibold [opacity:0.9] hover:[color:#1d4ed8] hover:underline"}>
                <span className={"[font-size:0.78rem] [color:rgba(30,_58,_138,_0.68)]"} aria-hidden>↗</span>
                Drone Engineering Jobs
              </Link>
              <Link href="/companies" className={"inline-flex [align-items:center] [gap:6px] [color:rgba(30,_58,_138,_0.84)] no-underline [font-size:0.8rem] font-semibold [opacity:0.9] hover:[color:#1d4ed8] hover:underline"}>
                <span className={"[font-size:0.78rem] [color:rgba(30,_58,_138,_0.68)]"} aria-hidden>↗</span>
                Top Companies
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
