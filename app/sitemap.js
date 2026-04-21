import { getJobsList } from "@/lib/jobs";
import { jobSlug } from "@/lib/slug";
import { getFeatureFlags } from "@/lib/featureFlags";
import { CATEGORY_PAGES } from "@/lib/categoryPages";
import { GUIDE_PAGES } from "@/lib/guidePages";
import { companySlug } from "@/lib/companyPages";
import { getLocationConfigs, getLocationPagePath } from "@/lib/locationPages";
import { BROWSE_CATEGORIES, MIN_BROWSE_ROLE_COUNT } from "@/lib/categoryMeta";
import {
  getJobsForRoleLocation,
  getRoleLocationPageConfigs,
  getRoleLocationPagePath,
} from "@/lib/roleLocationPages";
import { getGlobalRolePageConfigs } from "@/lib/landingPageRegistry";
import { shouldIndexCompanyPage, shouldIndexJobPage } from "@/lib/seoIndexing";
import {
  CANONICAL_SITE_URL,
  CATEGORY_MIN_INDEXABLE_JOBS,
  GUIDE_MIN_INDEXABLE_JOBS,
} from "@/lib/seoThresholds";

const FALLBACK_DATE = new Date("2026-01-01T00:00:00.000Z");
// Site content refreshes daily; align ISR cadence to reduce write churn.
export const revalidate = 86400;

function asValidDate(input) {
  if (!input) return null;
  const d = new Date(String(input));
  return Number.isNaN(d.getTime()) ? null : d;
}

function safeMatch(matcher, job) {
  try {
    return Boolean(typeof matcher === "function" && matcher(job));
  } catch {
    return false;
  }
}

function buildRolePages(jobs) {
  const out = [];
  const safeJobs = Array.isArray(jobs) ? jobs : [];
  for (const category of BROWSE_CATEGORIES) {
    if (typeof category?.matcher !== "function") continue;
    const roleJobs = safeJobs.filter((job) => shouldIndexJobPage(job) && safeMatch(category.matcher, job));
    if (roleJobs.length < MIN_BROWSE_ROLE_COUNT) continue;
    out.push({
      url: `${CANONICAL_SITE_URL}/roles/${category.id}`,
      lastModified: maxLastModifiedFromJobs(roleJobs),
      changeFrequency: "daily",
      priority: 0.66,
    });
  }
  for (const role of getGlobalRolePageConfigs()) {
    const roleJobs = safeJobs.filter((job) => shouldIndexJobPage(job) && safeMatch(() => true, job));
    const includeTerms = Array.isArray(role.includeTerms)
      ? role.includeTerms.map((term) => String(term || "").trim().toLowerCase()).filter(Boolean)
      : [];
    const excludeTerms = Array.isArray(role.excludeTerms)
      ? role.excludeTerms.map((term) => String(term || "").trim().toLowerCase()).filter(Boolean)
      : [];
    const matches =
      includeTerms.length === 0
        ? roleJobs
        : roleJobs.filter((job) => {
            const haystack = `${String(job?.title || "")} ${String(job?.description || "")}`.toLowerCase();
            if (!includeTerms.some((term) => haystack.includes(term))) return false;
            return !excludeTerms.some((term) => haystack.includes(term));
          });
    out.push({
      url: `${CANONICAL_SITE_URL}/roles/${role.roleSlug}`,
      lastModified: maxLastModifiedFromJobs(matches),
      changeFrequency: "daily",
      priority: 0.66,
    });
  }
  return out;
}

function buildRoleLocationPages(jobs) {
  const out = [];
  const safeJobs = Array.isArray(jobs) ? jobs : [];
  for (const config of getRoleLocationPageConfigs()) {
    const matches = getJobsForRoleLocation(safeJobs, config).filter((job) => shouldIndexJobPage(job));
    out.push({
      url: `${CANONICAL_SITE_URL}${getRoleLocationPagePath(config.roleSlug, config.locationSlug)}`,
      lastModified: maxLastModifiedFromJobs(matches),
      changeFrequency: "daily",
      priority: 0.67,
    });
  }
  return out;
}

function maxLastModifiedFromJobs(jobs) {
  const list = Array.isArray(jobs) ? jobs : [];
  let max = null;
  for (const job of list) {
    const d =
      asValidDate(job.updated_at) ??
      asValidDate(job.last_seen_at) ??
      asValidDate(job.posted_at);
    if (!d) continue;
    if (!max || d.getTime() > max.getTime()) max = d;
  }
  return max ?? FALLBACK_DATE;
}

function buildStaticPages(now = new Date()) {
  return [
    {
      url: `${CANONICAL_SITE_URL}/`,
      lastModified: now,
      changeFrequency: "hourly",
      priority: 1,
    },
    {
      url: `${CANONICAL_SITE_URL}/locations`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.72,
    },
    {
      url: `${CANONICAL_SITE_URL}/companies`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.7,
    },
    {
      url: `${CANONICAL_SITE_URL}/roles`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.68,
    },
    {
      url: `${CANONICAL_SITE_URL}/contact`,
      lastModified: FALLBACK_DATE,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${CANONICAL_SITE_URL}/privacy`,
      lastModified: FALLBACK_DATE,
      changeFrequency: "yearly",
      priority: 0.2,
    },
    {
      url: `${CANONICAL_SITE_URL}/terms`,
      lastModified: FALLBACK_DATE,
      changeFrequency: "yearly",
      priority: 0.2,
    },
    {
      url: `${CANONICAL_SITE_URL}/cookies`,
      lastModified: FALLBACK_DATE,
      changeFrequency: "yearly",
      priority: 0.2,
    },
  ];
}

export default async function sitemap() {
  try {
    const flags = getFeatureFlags();
    const jobs = await getJobsList();

    const staticPages = buildStaticPages(new Date());

    const seen = new Set();
    const safeJobs = Array.isArray(jobs) ? jobs : [];
    const jobPages = safeJobs.flatMap((job) => {
      if (!shouldIndexJobPage(job)) return [];
      const slug = jobSlug(job);
      if (!slug || seen.has(slug)) return [];
      seen.add(slug);
      const lastModified =
        asValidDate(job.updated_at) ??
        asValidDate(job.last_seen_at) ??
        asValidDate(job.posted_at) ??
        FALLBACK_DATE;
      const row = {
        url: `${CANONICAL_SITE_URL}/jobs/${slug}`,
        lastModified,
        changeFrequency: "daily",
        priority: 0.8,
      };
      return row;
    });

    const indexableByCategory = new Map();
    for (const [slug, config] of Object.entries(CATEGORY_PAGES)) {
      const count = safeJobs.filter(
        (job) => shouldIndexJobPage(job) && safeMatch(config?.match, job)
      ).length;
      indexableByCategory.set(slug, count);
    }

    const categoryPages =
      flags.categoryPagesV1 || flags.extendedCategoryPagesV1
        ? Object.keys(CATEGORY_PAGES)
            .filter((slug) => (indexableByCategory.get(slug) || 0) >= CATEGORY_MIN_INDEXABLE_JOBS)
            .map((slug) => {
              const config = CATEGORY_PAGES[slug];
              const hubJobs = safeJobs.filter(
                (job) => shouldIndexJobPage(job) && safeMatch(config?.match, job)
              );
              return {
                url: `${CANONICAL_SITE_URL}/jobs/${slug}`,
                lastModified: maxLastModifiedFromJobs(hubJobs),
                changeFrequency: "daily",
                priority: 0.7,
              };
            })
        : [];

    const companyPages = flags.companyPagesV1
      ? [...new Set(safeJobs.map((j) => companySlug(j?.company)).filter(Boolean))]
          .filter((slug) => {
            const jobsForCompany = safeJobs.filter((j) => companySlug(j?.company) === slug);
            return shouldIndexCompanyPage(slug, jobsForCompany);
          })
          .map((slug) => {
            const jobsForCompany = safeJobs.filter((j) => companySlug(j?.company) === slug);
            return {
              url: `${CANONICAL_SITE_URL}/company/${slug}`,
              lastModified: maxLastModifiedFromJobs(jobsForCompany),
              changeFrequency: "daily",
              priority: 0.65,
            };
          })
      : [];

    const locationPages = getLocationConfigs().map((config) => ({
      url: `${CANONICAL_SITE_URL}${getLocationPagePath(config.slug)}`,
      lastModified: maxLastModifiedFromJobs(
        safeJobs.filter((job) => {
          const locationText = String(job?.location || "").toLowerCase();
          return config.matchTerms.some((term) => locationText.includes(String(term).toLowerCase()));
        })
      ),
      changeFrequency: "daily",
      priority: 0.69,
    }));

    const guidePages = Object.values(GUIDE_PAGES)
      .map((guide) => ({
        guide,
        count: safeJobs.filter(
          (job) => shouldIndexJobPage(job) && safeMatch(guide?.match, job)
        ).length,
      }))
      .filter((row) => row.count >= GUIDE_MIN_INDEXABLE_JOBS)
      .map((row) => {
        const hubJobs = safeJobs.filter(
          (job) => shouldIndexJobPage(job) && safeMatch(row.guide?.match, job)
        );
        return {
          url: `${CANONICAL_SITE_URL}/${row.guide.slug}`,
          lastModified: maxLastModifiedFromJobs(hubJobs),
          changeFrequency: "daily",
          priority: 0.68,
        };
      });

    const rolePages = buildRolePages(safeJobs);
    const roleLocationPages = buildRoleLocationPages(safeJobs);
    const allPages = [
      ...staticPages,
      ...jobPages,
      ...categoryPages,
      ...companyPages,
      ...locationPages,
      ...guidePages,
      ...rolePages,
      ...roleLocationPages,
    ];
    const uniqueUrls = new Set();
    const deduped = [];
    for (const page of allPages) {
      if (!page?.url) continue;
      if (uniqueUrls.has(page.url)) continue;
      uniqueUrls.add(page.url);
      deduped.push(page);
    }
    return deduped;
  } catch (error) {
    console.error("[sitemap_error]", error);
    return buildStaticPages(FALLBACK_DATE);
  }
}
