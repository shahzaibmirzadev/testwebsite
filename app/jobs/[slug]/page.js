import Link from "next/link";
import { cache } from "react";
import { notFound } from "next/navigation";
import JobDetailHeader from "@/components/job-detail/JobDetailHeader";
import JobDetailMotion from "@/components/job-detail/JobDetailMotion";
import JobDetailProse from "@/components/job-detail/JobDetailProse";
import JobLocationPreview from "@/components/job-detail/JobLocationPreview";
import ExploreMoreRolesCarousel from "@/components/job-detail/ExploreMoreRolesCarousel";
import {
  countActiveJobsForCompanyName,
  getJobBySlug,
  getJobsListCached,
  getRelatedJobs,
} from "@/lib/jobs";
import { getJobFamily, getLocationDisplayText, getLocationText, getJobTags } from "@/lib/jobFieldHelpers";
import { buildJobSeoMeta } from "@/lib/seo";
import { buildJobMetaV1, buildJobPostingSchemaV1, validateJobSchema } from "@/lib/jobSchema";
import { getFeatureFlags } from "@/lib/featureFlags";
import { getCategoryConfig } from "@/lib/categoryPages";
import { companyPagePath, companySlug } from "@/lib/companyPages";
import { jobSlug } from "@/lib/slug";
import { CATEGORY_MIN_INDEXABLE_JOBS, CANONICAL_SITE_URL } from "@/lib/seoThresholds";
import { shouldIndexCompanyPage, shouldIndexJobPage } from "@/lib/seoIndexing";
import {
  getAdjacentIndexableHubLinks,
  getJobPageRelatedRoleHubs,
  getTopIndexableCompaniesForHub,
} from "@/lib/seoInternalLinks";
import RelatedHubs from "@/components/seo/RelatedHubs";
import PageIntro from "@/components/seo/PageIntro";
import JobCard from "@/components/home/JobCard";
import { buildCategoryIntro, buildCategoryMetaDescription, buildCategoryPageTitle } from "@/lib/seoCopy";

// Site content refreshes daily; align ISR cadence to reduce write churn.
export const revalidate = 86400;
const getJobBySlugCached = cache(getJobBySlug);
const JOB_DETAIL_AUX_JOBS_TIMEOUT_MS = Number(process.env.JOB_DETAIL_AUX_JOBS_TIMEOUT_MS || 800);

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

function buildMapQuery(locationText) {
  const text = String(locationText || "").trim();
  if (!text) return "";
  if (/remote/i.test(text)) return "";
  return encodeURIComponent(text);
}

function words(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function titleSimilarity(a, b) {
  const wa = new Set(words(a));
  const wb = new Set(words(b));
  if (!wa.size || !wb.size) return 0;
  let overlap = 0;
  for (const token of wa) {
    if (wb.has(token)) overlap += 1;
  }
  return overlap;
}

function titleCaseWords(text) {
  return String(text || "")
    .split(/(\s+)/)
    .map((part) => {
      if (/^\s+$/.test(part)) return part;
      if (!part) return part;
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join("");
}

function stableMix(items, seed) {
  const base = String(seed || "seed");
  return [...items].sort((a, b) => {
    const ka = `${base}:${String(a?.id || a?.title || "")}`;
    const kb = `${base}:${String(b?.id || b?.title || "")}`;
    const ha = ka.split("").reduce((n, ch) => (n * 33 + ch.charCodeAt(0)) % 104729, 7);
    const hb = kb.split("").reduce((n, ch) => (n * 33 + ch.charCodeAt(0)) % 104729, 7);
    return ha - hb;
  });
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const flags = getFeatureFlags();
  const job = await getJobBySlugCached(slug);
  const categoryPagesEnabled = flags.categoryPagesV1 || flags.extendedCategoryPagesV1;
  if (!job && categoryPagesEnabled) {
    const category = getCategoryConfig(slug);
    if (category) {
      const jobs = await getJobsListCached();
      const indexableCount = jobs.filter((j) => shouldIndexJobPage(j) && category.match(j)).length;
      const pageTitle = buildCategoryPageTitle(category.heading);
      const pageDesc = buildCategoryMetaDescription(category.heading);
      return {
        title: pageTitle,
        description: pageDesc,
        alternates: { canonical: `/jobs/${slug}` },
        openGraph: {
          title: pageTitle,
          description: pageDesc,
          url: `${CANONICAL_SITE_URL}/jobs/${slug}`,
          type: "website",
        },
        twitter: {
          card: "summary_large_image",
          title: pageTitle,
          description: pageDesc,
        },
        robots: { index: indexableCount >= CATEGORY_MIN_INDEXABLE_JOBS, follow: true },
      };
    }
  }
  if (!job) {
    return {
      title: "Job not found",
      alternates: { canonical: `/jobs/${slug}` },
      robots: { index: false, follow: true },
    };
  }
  const metadata = flags.seoV1 ? buildJobMetaV1(job, slug) : buildJobSeoMeta(job, slug);
  if (!shouldIndexJobPage(job)) {
    return {
      ...metadata,
      robots: { index: false, follow: true },
    };
  }
  return metadata;
}

export default async function JobDetailPage({ params }) {
  const { slug } = await params;
  const flags = getFeatureFlags();
  const categoryPagesEnabled = flags.categoryPagesV1 || flags.extendedCategoryPagesV1;
  const job = await getJobBySlugCached(slug);

  if (!job) {
    if (categoryPagesEnabled) {
      const category = getCategoryConfig(slug);
      if (category) {
        const jobs = await getJobsListCached();
        const flags = getFeatureFlags();
        const matched = jobs.filter((j) => category.match(j));
        const seen = new Set();
        const deduped = matched.filter((j) => {
          const key = `${String(j.title ?? "")}-${String(j.company ?? "")}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        const recentJobs = deduped
          .filter((j) => jobSlug(j))
          .sort(
            (a, b) =>
              new Date(b.posted_at || 0).getTime() - new Date(a.posted_at || 0).getTime()
          )
          .slice(0, 8);
        const adjacentHubLinks = getAdjacentIndexableHubLinks(slug, "category", jobs, flags, 3);
        const topCompaniesSeo = getTopIndexableCompaniesForHub(category.match, jobs, 5);
        const indexableMatched = jobs.filter((j) => shouldIndexJobPage(j) && category.match(j));
        const categoryIntro = buildCategoryIntro({
          categoryName: category.heading,
          jobs: indexableMatched,
          topCompanies: topCompaniesSeo,
        });
        return (
          <div className={"[min-height:100vh] [background:#f5f7fb] [padding:26px_14px_72px]"}>
            <div className={"[max-width:720px] [margin:0_auto] [padding:32px_16px_64px] [background:#fff] [min-height:100vh] [max-width:920px] [padding:30px_34px_40px] [border:1px_solid_#e7ebf3] [border-radius:14px] [box-shadow:0_20px_40px_rgba(15,_23,_42,_0.04)] [min-height:auto] max-[900px]:[padding:22px_16px_28px] hub-landing"}>
              <div className={"[max-width:600px] [margin-bottom:24px] [&h1]:[margin-bottom:8px] [&p]:[color:#475569] [&p]:[line-height:1.5]"}>
                <h1 className={"[margin:0_0_8px] [font-size:1.75rem] [line-height:1.25] font-bold [color:#f8fafc] [font-size:clamp(2rem,_3.2vw,_2.65rem)] [line-height:1.14] [letter-spacing:-0.03em]"} style={{ marginTop: 0 }}>{category.heading}</h1>
                <p
                  style={{
                    fontSize: "0.875rem",
                    color: "#64748b",
                    marginTop: 0,
                    marginBottom: 10,
                  }}
                >
                  {matched.length} roles currently available.
                </p>
                <PageIntro>{categoryIntro}</PageIntro>
              </div>
              <div className={"[border-top:1px_solid_#e2e8f0] [padding-top:20px] [margin-top:4px]"}>
                {topCompaniesSeo.length > 0 ? (
                  <section className={"[background:rgba(0,_0,_0,_0.01)] [border-radius:12px] [padding:16px_14px] [margin-top:0] [margin-top:28px] hub-section--emphasis"}>
                    <h2 className={"[margin:0_0_12px] [font-size:22px] font-semibold [color:#0f172a] [margin-bottom:14px]"}>Top companies hiring</h2>
                    <div className={"flex [flex-wrap:wrap] [gap:10px]"}>
                      {topCompaniesSeo.map((c) => (
                        <Link
                          key={c.slug}
                          href={companyPagePath(c.name) || `/company/${c.slug}`}
                          className={"inline-flex [align-items:center] [gap:8px] [padding:8px_14px] [border-radius:999px] [font-size:14px] font-medium [color:#0f172a] no-underline [transition:background_0.15s_ease,_border-color_0.15s_ease] [background:rgba(0,_0,_0,_0.04)] [border:1px_solid_rgba(0,_0,_0,_0.06)] hover:[background:rgba(0,_0,_0,_0.06)] hover:[border-color:rgba(0,_0,_0,_0.1)] [gap:6px] [padding:6px_10px] [font-size:13px] [background:rgba(255,_255,_255,_0.92)] [border:1px_solid_rgba(148,_163,_184,_0.4)] [box-shadow:0_1px_2px_rgba(15,_23,_42,_0.04)] hover:[background:#fff] hover:[border-color:rgba(100,_116,_139,_0.45)]"}
                        >
                          {c.name}
                          <span className={"[margin-left:0] [opacity:0.7] [font-size:12px] font-semibold"}>{c.roleCount}</span>
                        </Link>
                      ))}
                    </div>
                  </section>
                ) : null}
                <section className={"[background:rgba(0,_0,_0,_0.01)] [border-radius:12px] [padding:16px_14px] [margin-top:0] [margin-top:28px] hub-section--jobs"}>
                  <h2 className={"[margin-top:0] [margin-bottom:12px] [font-size:22px] font-semibold"}>Latest jobs in this category</h2>
                  <section className={"[border:1px_solid_#e8edf5] [border-radius:12px] [padding:22px_24px] [background:#fff] max-[900px]:[padding:16px_14px] [margin-top:0]"}>
                    {recentJobs.length === 0 ? (
                      <p className={"[color:#6b7280] [margin:0_0_24px]"}>No active roles match this category right now.</p>
                    ) : (
                      <div className={"grid [max-width:900px] [margin:0_auto] [grid-template-columns:repeat(auto-fill,_minmax(320px,_1fr))] [gap:16px]"}>
                        {recentJobs.map((jobRow) => (
                          <JobCard key={String(jobRow.source_job_id || jobRow.id)} job={jobRow} />
                        ))}
                      </div>
                    )}
                  </section>
                </section>
                {adjacentHubLinks.length > 0 ? (
                  <section className={"[background:rgba(0,_0,_0,_0.01)] [border-radius:12px] [padding:16px_14px] [margin-top:0] [margin-top:28px] hub-section--secondary"}>
                    <h2 className={"[margin:0_0_12px] [font-size:22px] font-semibold [color:#0f172a] [margin-bottom:14px] hub-section-heading--secondary"}>Related job categories</h2>
                    <div className={"[flex-wrap:nowrap] [align-items:center] flex [flex-wrap:wrap] [gap:10px] [align-items:flex-start]"}>
                      {adjacentHubLinks.map((h) => (
                        <Link key={h.key} href={h.path} className={"[flex:0_0_auto] [white-space:nowrap] inline-flex [align-items:center] [padding:8px_14px] [border-radius:999px] [font-size:0.88rem] font-semibold no-underline [border:1px_solid_#cbd5e1] [background:#fff] [color:#1e40af] [box-shadow:0_1px_2px_rgba(15,_23,_42,_0.05)] [transition:background_0.15s_ease,_border-color_0.15s_ease] hover:[background:#eff6ff] hover:[border-color:#93c5fd] [background:rgba(255,_255,_255,_0.1)] [border-color:rgba(255,_255,_255,_0.35)] [color:#e0f2fe] [box-shadow:none] hover:[background:rgba(255,_255,_255,_0.18)] hover:[border-color:rgba(255,_255,_255,_0.5)]"}>
                          {h.label}
                        </Link>
                      ))}
                    </div>
                  </section>
                ) : null}
              </div>
            </div>
          </div>
        );
      }
    }
    notFound();
  }

  const relatedAndListingsPromise = Promise.all([
    getRelatedJobs(job, 24),
    withSoftTimeout(getJobsListCached(), JOB_DETAIL_AUX_JOBS_TIMEOUT_MS, []),
  ]);

  if (flags.jobSchemaV1) {
    const validation = validateJobSchema(job);
    if (!validation.valid) {
      console.warn("job_schema_validation_issues", { slug, issues: validation.issues });
    }
  }

  const jobPostingSchema =
    shouldIndexJobPage(job) ? buildJobPostingSchemaV1(job, slug) : null;
  const currentSlug = jobSlug(job);
  const currentFamily = getJobFamily(job);
  const currentCompany = String(job.company || "").trim().toLowerCase();
  const currentLocation = getLocationText(job).toLowerCase();
  const currentTags = getJobTags(job).map((t) => t.toLowerCase());

  const [relatedCandidates, allJobs] = await relatedAndListingsPromise;

  const relatedJobs = relatedCandidates
    .filter((candidate) => {
      const s = jobSlug(candidate);
      return s && s !== currentSlug;
    })
    .map((candidate) => {
      const family = getJobFamily(candidate);
      const company = String(candidate.company || "").trim().toLowerCase();
      const location = getLocationText(candidate).toLowerCase();
      const titleScore = titleSimilarity(candidate.title, job.title);
      let score = 0;
      if (titleScore > 0) score += Math.min(5, titleScore * 2);
      if (currentFamily && family && currentFamily === family) score += 3;
      if (currentCompany && company && currentCompany === company) score += 2;
      if (currentLocation && location && currentLocation === location) score += 2;
      return { candidate, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 14)
    .map((entry) => entry.candidate);

  const exploreItems = stableMix(
    relatedJobs.filter((j) => shouldIndexJobPage(j)),
    currentSlug
  ).slice(0, 12);

  const hubLinks = getJobPageRelatedRoleHubs(job, relatedJobs, allJobs, flags);
  const coSlug = companySlug(job.company);

  const moreFromCompany = relatedCandidates
    .filter((candidate) => String(candidate.company || "").trim().toLowerCase() === currentCompany)
    .slice(0, 5);
  const companyActiveCount = await countActiveJobsForCompanyName(String(job.company || "").trim());
  const showCompanyPageLink = shouldIndexCompanyPage(
    coSlug,
    [job, ...moreFromCompany],
    companyActiveCount
  );

  const relatedByFamilyOrTags = relatedCandidates
    .filter((candidate) => {
      const family = String(getJobFamily(candidate) || "").toLowerCase();
      if (currentFamily && family === String(currentFamily).toLowerCase()) return true;
      const tags = getJobTags(candidate).map((t) => t.toLowerCase());
      return tags.some((t) => currentTags.includes(t));
    })
    .slice(0, 6);

  const locationText = getLocationText(job);
  const mapQuery = buildMapQuery(locationText);
  const companyPageHref = companyPagePath(String(job.company || "").trim()) || `/company/${companySlug(job.company)}`;

  return (
    <main className="bg-[#FFFFFF] text-[#1C1C1A]">
      {jobPostingSchema ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jobPostingSchema) }}
        />
      ) : null}
      <JobDetailMotion>
        <div className="mx-auto w-full max-w-[1180px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-12">

        <div data-job-hero>
          <JobDetailHeader job={job} />
        </div>

        <div className="mx-auto grid max-w-[1120px] gap-8 py-6 lg:grid-cols-[minmax(0,720px)_320px] lg:items-start lg:justify-between lg:gap-10 lg:py-8 xl:gap-12">
          <article className="min-w-0">
            {job.apply_url ? (
              <a
                href={job.apply_url}
                className="mb-6 inline-flex min-h-12 w-full items-center justify-center rounded-[8px] bg-[#5B4FE8] px-5 py-2 text-sm font-bold text-[#FFFFFF] no-underline shadow-[0_12px_26px_rgba(91,79,232,0.22)] transition-colors hover:bg-[#1A1160] focus:outline-none focus:ring-2 focus:ring-[#5B4FE8] focus:ring-offset-2 focus:ring-offset-[#FFFFFF] sm:hidden"
                target="_blank"
                rel="noreferrer"
              >
                Apply for role
              </a>
            ) : null}

            <section aria-labelledby="job-description-heading" className="max-w-none" data-job-reveal>
              <p className="m-0 text-sm font-bold uppercase tracking-[0.04em] text-[#5B4FE8]">
                Role details
              </p>
              <h2 id="job-description-heading" className="mt-2 mb-6 text-2xl font-bold text-[#1C1C1A]">
                Job description
              </h2>
              <JobDetailProse
                job={job}
                proseClassName="max-w-none text-[#374151] [font-size:1.02rem] [line-height:1.78] [&_a]:font-bold [&_a]:text-[#5B4FE8] [&_p]:mb-5 [&_p]:max-w-[72ch] [&_li]:mb-2 [&_ul]:mb-6 [&_ol]:mb-6 [&_h2]:mt-10 [&_h2]:mb-4 [&_h2]:text-[#1C1C1A] [&_h3]:mt-8 [&_h3]:mb-3 [&_h3]:text-[#1C1C1A]"
              />
            </section>

            {job.apply_url ? (
              <section className="mt-8 rounded-[8px] border border-[rgba(91,79,232,0.18)] bg-[#F8FAFC] p-4 sm:p-5" data-job-reveal>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="m-0 text-sm font-bold uppercase tracking-[0.04em] text-[#5B4FE8]">
                      Ready for the next step?
                    </p>
                    <h2 className="mt-2 mb-0 text-xl font-bold text-[#1C1C1A]">
                      Apply directly with {titleCaseWords(job.company || "the employer")}
                    </h2>
                  </div>
                  <a
                    href={job.apply_url}
                    className="inline-flex min-h-12 items-center justify-center rounded-[8px] bg-[#5B4FE8] px-6 py-2 text-sm font-bold text-[#FFFFFF] no-underline shadow-[0_12px_26px_rgba(91,79,232,0.22)] transition-colors hover:bg-[#1A1160] focus:outline-none focus:ring-2 focus:ring-[#5B4FE8] focus:ring-offset-2 focus:ring-offset-[#F8FAFC]"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Apply for role
                  </a>
                </div>
              </section>
            ) : null}

            {hubLinks.length > 0 ? (
              <section className="mt-8 border-t border-[rgba(0,0,0,0.08)] pt-6" data-job-reveal>
                <RelatedHubs
                  title="Related roles"
                  items={hubLinks}
                  className="[&_h2]:m-0 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-[#1C1C1A]"
                  listClassName="m-0 flex list-none flex-wrap gap-2 p-0 [&_li]:rounded-[8px] [&_li]:border [&_li]:border-[rgba(0,0,0,0.08)] [&_li]:bg-[#F8FAFC] [&_li]:px-3 [&_li]:py-1.5 [&_li]:text-sm [&_li]:font-bold [&_a]:no-underline hover:[&_li]:bg-[#EDE9FF]"
                />
              </section>
            ) : null}

            {mapQuery ? (
              <section className="mt-8 border-t border-[rgba(0,0,0,0.08)] pt-6" data-job-reveal>
                <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="m-0 text-sm font-bold uppercase tracking-[0.04em] text-[#5B4FE8]">
                      Location
                    </p>
                    <h2 className="m-0 text-xl font-bold text-[#1C1C1A]">Map preview</h2>
                  </div>
                  <p className="m-0 text-sm font-medium text-[#666666]">{locationText}</p>
                </div>
                <JobLocationPreview locationText={locationText} mapQuery={mapQuery} />
              </section>
            ) : null}

            {flags.seoV1 ? (
              <div className="mt-8 grid gap-6 border-t border-[rgba(0,0,0,0.08)] pt-6 md:grid-cols-2" data-job-reveal>
                <section>
                  <h2 className="m-0 mb-3 text-xl font-bold text-[#1C1C1A]">Related jobs</h2>
                  {relatedByFamilyOrTags.length === 0 ? (
                    <p className="m-0 text-sm text-[#666666]">No closely related roles found yet.</p>
                  ) : (
                    <ul className="m-0 grid list-none gap-2 p-0">
                      {relatedByFamilyOrTags.map((related) => {
                        const relatedSlug = jobSlug(related);
                        if (!relatedSlug) return null;
                        const label = `${String(related.title || "Drone role")} - ${String(related.company || "Unknown company")}`;
                        return (
                          <li key={`rel-${relatedSlug}`} className="text-sm leading-5 text-[#666666]">
                            {shouldIndexJobPage(related) ? (
                              <Link href={`/jobs/${relatedSlug}`} className="font-bold text-[#5B4FE8] no-underline hover:underline">
                                {label}
                              </Link>
                            ) : (
                              label
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
                <section>
                  <h2 className="m-0 mb-3 text-xl font-bold text-[#1C1C1A]">
                    More from {String(job.company || "this company")}
                  </h2>
                  {moreFromCompany.length === 0 ? (
                    <p className="m-0 text-sm text-[#666666]">
                      No additional active roles from this company right now.
                    </p>
                  ) : (
                    <ul className="m-0 grid list-none gap-2 p-0">
                      {moreFromCompany.map((related) => {
                        const relatedSlug = jobSlug(related);
                        if (!relatedSlug) return null;
                        const titleOnly = String(related.title || "Drone role");
                        return (
                          <li key={`co-${relatedSlug}`} className="text-sm leading-5 text-[#666666]">
                            {shouldIndexJobPage(related) ? (
                              <Link href={`/jobs/${relatedSlug}`} className="font-bold text-[#5B4FE8] no-underline hover:underline">
                                {titleOnly}
                              </Link>
                            ) : (
                              titleOnly
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              </div>
            ) : null}
          </article>

          <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">
            <div className="grid gap-4">
              <div className="rounded-[8px] border border-[rgba(0,0,0,0.08)] bg-[#F8FAFC] p-4">
                <p className="m-0 text-sm font-bold uppercase tracking-[0.04em] text-[#5B4FE8]">
                  Next step
                </p>
                <h2 className="mt-2 mb-2 text-xl font-bold text-[#1C1C1A]">Ready to apply?</h2>
                <p className="m-0 text-sm leading-6 text-[#666666]">
                  Review the role, then continue to the employer site when you are ready.
                </p>
                {job.apply_url ? (
                  <a
                    href={job.apply_url}
                    className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-[8px] bg-[#5B4FE8] px-5 py-2 text-sm font-bold text-[#FFFFFF] no-underline transition-colors hover:bg-[#1A1160] focus:outline-none focus:ring-2 focus:ring-[#5B4FE8] focus:ring-offset-2 focus:ring-offset-[#F8FAFC]"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Apply for role
                  </a>
                ) : null}
              </div>

              <div className="rounded-[8px] border border-[rgba(0,0,0,0.08)] bg-[#FFFFFF] p-4">
                <p className="m-0 text-sm font-bold uppercase tracking-[0.04em] text-[#5B4FE8]">
                  Not quite what you're looking for?
                </p>
                <h2 className="mt-2 mb-2 text-xl font-bold text-[#1C1C1A]">Keep exploring</h2>
                <p className="m-0 text-sm leading-6 text-[#666666]">
                  Jump back to listings, browse this company, or skip to similar roles.
                </p>
                <div className="mt-4 grid gap-2">
                  <Link
                    href="/"
                    className="inline-flex min-h-11 items-center justify-center rounded-[8px] border border-[rgba(0,0,0,0.08)] bg-[#FFFFFF] px-5 py-2 text-sm font-bold text-[#1A1160] no-underline transition-colors hover:bg-[#EDE9FF]"
                  >
                    Back to listings
                  </Link>
                  {showCompanyPageLink ? (
                    <Link
                      href={companyPageHref}
                      className="inline-flex min-h-11 items-center justify-center rounded-[8px] border border-[rgba(0,0,0,0.08)] bg-[#FFFFFF] px-5 py-2 text-center text-sm font-bold text-[#1A1160] no-underline transition-colors hover:bg-[#EDE9FF]"
                    >
                      More from {titleCaseWords(job.company || "this company")}
                    </Link>
                  ) : null}
                  <Link
                    href="#related-roles"
                    className="inline-flex min-h-11 items-center justify-center rounded-[8px] border border-[rgba(91,79,232,0.18)] bg-[rgba(91,79,232,0.10)] px-5 py-2 text-center text-sm font-bold text-[#1A1160] no-underline transition-colors hover:bg-[rgba(91,79,232,0.18)]"
                  >
                    Search related roles
                  </Link>
                </div>
              </div>
            </div>
          </aside>
        </div>

        <section id="related-roles" className="mx-auto mt-10 max-w-[1120px] scroll-mt-24 border-t border-[rgba(0,0,0,0.08)] pt-8" data-job-reveal>
          <div className="mx-auto mb-6 max-w-2xl text-center">
            <p className="m-0 text-sm font-bold uppercase tracking-[0.04em] text-[#5B4FE8]">
              Keep exploring
            </p>
            <h2 className="mt-2 mb-3 text-2xl font-bold text-[#1C1C1A]">Explore more roles</h2>
            <p className="m-0 text-sm leading-6 text-[#666666]">
              Three similar live roles at a time from the active job feed.
            </p>
            <Link
              href="/"
              className="mt-4 inline-flex min-h-10 items-center justify-center rounded-[8px] border border-[rgba(91,79,232,0.18)] bg-[#FFFFFF] px-4 py-2 text-sm font-bold text-[#5B4FE8] no-underline transition-colors hover:bg-[#EDE9FF]"
            >
              Browse all jobs
            </Link>
          </div>
          {exploreItems.length > 0 ? (
            <ExploreMoreRolesCarousel>
              {exploreItems.map((related) => {
                const relatedSlug = jobSlug(related);
                if (!relatedSlug) return null;
                return (
                  <article
                    key={relatedSlug}
                    className="flex min-h-[142px] flex-col justify-between rounded-[8px] border border-[rgba(0,0,0,0.08)] bg-[#FFFFFF] p-3.5 text-[#1C1C1A] shadow-[0_8px_22px_rgba(28,28,26,0.055)] transition-[background,border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-[rgba(91,79,232,0.24)] hover:bg-[#F8FAFC] hover:shadow-[0_14px_28px_rgba(28,28,26,0.08)]"
                  >
                    <div>
                      <p className="m-0 mb-2 overflow-hidden text-ellipsis whitespace-nowrap text-[0.68rem] font-bold uppercase tracking-[0.08em] text-[#5B4FE8]">
                        {titleCaseWords(related.company || "Unknown Company")}
                      </p>
                      <h3 className="m-0 line-clamp-2 text-[0.98rem] font-bold leading-snug">
                        <Link
                          href={`/jobs/${relatedSlug}`}
                          className="text-[#1C1C1A] no-underline hover:text-[#5B4FE8]"
                        >
                          {titleCaseWords(related.title || "Drone Role")}
                        </Link>
                      </h3>
                    </div>
                    <div className="mt-4 flex items-center justify-between gap-3 border-t border-[rgba(0,0,0,0.08)] pt-3">
                      <p className="m-0 min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-xs font-medium text-[#666666]">
                        {titleCaseWords(getLocationDisplayText(related) || "Location Not Listed")}
                      </p>
                      <Link
                        href={`/jobs/${relatedSlug}`}
                        className="shrink-0 text-xs font-bold text-[#5B4FE8] no-underline hover:underline"
                      >
                        View
                      </Link>
                    </div>
                  </article>
                );
              })}
            </ExploreMoreRolesCarousel>
          ) : (
            <p className="m-0 rounded-[8px] border border-[rgba(0,0,0,0.08)] bg-[#F8FAFC] p-4 text-center text-sm text-[#666666]">
              No related roles found yet.
            </p>
          )}
        </section>
      </div>
      </JobDetailMotion>
    </main>
  );
}
