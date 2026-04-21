import HomeExperience from "@/components/home/HomeExperience";
import Link from "next/link";
import { getActiveListingsCount, getJobsList, getTotalListingsCount } from "@/lib/jobs";
import { buildHomeItemListSchema } from "@/lib/seo";
import { getSourcesCsvRowCount, getTrackedCompanies } from "@/lib/trackedCompanies";
import { CANONICAL_SITE_URL } from "@/lib/seoThresholds";

// Site content refreshes daily; align ISR cadence to reduce write churn.
export const revalidate = 86400;

export async function generateMetadata() {
  return {
    title: "Drone Jobs & UAV Jobs",
    description: "Find live drone jobs and UAV jobs from tracked companies worldwide.",
    alternates: { canonical: "/" },
    openGraph: {
      title: "Drone Jobs & UAV Jobs | Drone Roles",
      description: "Find live drone jobs and UAV jobs from tracked companies worldwide.",
      url: CANONICAL_SITE_URL,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: "Drone Jobs & UAV Jobs | Drone Roles",
      description: "Find live drone jobs and UAV jobs from tracked companies worldwide.",
    },
  };
}

export default async function HomePage() {
  const [jobs, trackedCompanies, lifetimeRolesCount, trackedCompaniesCount, liveRolesCount] =
    await Promise.all([
      getJobsList(),
      getTrackedCompanies(),
      getTotalListingsCount(),
      getSourcesCsvRowCount(),
      getActiveListingsCount(),
    ]);
  const itemListSchema = buildHomeItemListSchema(jobs);

  return (
    <>
      {itemListSchema ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListSchema) }}
        />
      ) : null}
      <HomeExperience
        initialJobs={jobs}
        trackedCompanies={trackedCompanies}
        trackedCompaniesCount={trackedCompaniesCount}
        liveRolesCount={liveRolesCount}
        lifetimeRolesCount={lifetimeRolesCount}
        hideContactBanner
      />
      <section className="mx-auto w-full max-w-[1120px] px-5 py-10 transition-[max-width] duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] min-[1024px]:max-w-[min(1480px,calc(100vw_-_40px))]" aria-label="Next step" data-home-scroll>
        <div className="rounded-[8px] border border-[rgba(91,79,232,0.14)] bg-[#FFFFFF] px-5 py-7 text-center shadow-[0_16px_34px_rgba(28,28,26,0.05)] sm:px-6">
          <p className="m-0 text-xs font-black uppercase tracking-[0.12em] text-[#5B4FE8]">
            End of results
          </p>
          <h2 className="mt-3 mb-0 text-2xl font-black tracking-[-0.03em] text-[#1C1C1A]">
            Didn&apos;t find the right role?
          </h2>
          <p className="mx-auto mt-3 mb-0 max-w-2xl text-sm font-semibold leading-6 text-[#665A50]">
            Jump back into the live feed, explore role pages, or browse the strongest hiring companies.
          </p>
          <div className="mt-5 grid justify-items-center gap-3">
            <Link
              className="inline-flex min-h-11 items-center justify-center rounded-[8px] bg-[#5B4FE8] px-5 text-sm font-black text-[#FFFFFF] no-underline shadow-[0_14px_26px_rgba(91,79,232,0.16)] hover:bg-[#1A1160]"
              href="/#browse-listings"
            >
              Browse All Drone Jobs
            </Link>
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-2">
              <Link className="inline-flex items-center gap-1.5 text-xs font-bold text-[#5B4FE8] no-underline hover:underline" href="/uav-pilot-jobs">
                <span aria-hidden>-</span>
                UAV Pilot Jobs
              </Link>
              <Link className="inline-flex items-center gap-1.5 text-xs font-bold text-[#5B4FE8] no-underline hover:underline" href="/drone-engineering-jobs">
                <span aria-hidden>-</span>
                Drone Engineering Jobs
              </Link>
              <Link className="inline-flex items-center gap-1.5 text-xs font-bold text-[#5B4FE8] no-underline hover:underline" href="/companies">
                <span aria-hidden>-</span>
                Top Companies
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
