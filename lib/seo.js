import {
  getEmploymentType,
  getJobFamily,
  getJobTags,
  getLocationText,
  getRemoteStatus,
} from "./jobFieldHelpers";
import { jobSlug } from "./slug";
import { CANONICAL_SITE_URL } from "./seoThresholds";
import { shouldIndexJobPage } from "./seoIndexing";
import { getPreferredCompanyDisplayName } from "./companyDescriptionMatch";
import { buildJobListingTitle, buildJobMetaDescription } from "./seoCopy";

const SITE_URL = CANONICAL_SITE_URL;

function stripHtml(text) {
  return String(text || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * @param {Record<string, unknown>} job
 * @param {string} slug
 */
export function buildJobSeoMeta(job, slug) {
  const title = String(job.title || "Drone Role").trim();
  const company =
    getPreferredCompanyDisplayName(job) || String(job.company || "Drone Company").trim();
  const location = getLocationText(job) || "Global";
  const family = getJobFamily(job) || "Drone";
  const tags = getJobTags(job).slice(0, 4);
  const description = buildJobMetaDescription(title, company);
  const seoTitle = buildJobListingTitle(title, company);
  const url = `${SITE_URL}/jobs/${slug}`;

  return {
    title: seoTitle,
    description,
    alternates: { canonical: `/jobs/${slug}` },
    openGraph: {
      title: seoTitle,
      description,
      type: "article",
      url,
      siteName: "Drone Roles",
    },
    twitter: {
      card: "summary_large_image",
      title: seoTitle,
      description,
    },
    keywords: [
      "drone jobs",
      "uav jobs",
      "uas jobs",
      `${family} jobs`,
      `${company} jobs`,
      location,
      ...tags,
    ],
  };
}

/**
 * @param {Record<string, unknown>} job
 * @param {string} slug
 */
export function buildJobPostingSchema(job, slug) {
  const baseSalary = String(job.salary_range || job.salary || job.compensation || "").trim();
  const validThrough = job.last_seen_at || job.updated_at || null;
  const remoteStatus = getRemoteStatus(job);
  const employmentType = getEmploymentType(job);
  const location = getLocationText(job);
  const family = getJobFamily(job);
  const isRemote = remoteStatus ? /remote/i.test(remoteStatus) : false;
  const applyUrl = String(job.apply_url || "").trim();
  const company = String(job.company || "Unknown Company").trim();

  return {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: String(job.title || "").trim(),
    description: stripHtml(job.description_html || job.description || ""),
    datePosted: job.posted_at || undefined,
    dateModified: job.updated_at || undefined,
    validThrough: validThrough || undefined,
    employmentType: employmentType || undefined,
    hiringOrganization: {
      "@type": "Organization",
      name: company,
    },
    identifier: {
      "@type": "PropertyValue",
      name: "DroneRoles",
      value: String(job.id || slug),
    },
    jobLocation: {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        addressLocality: location || "Remote",
      },
    },
    industry: "Unmanned Aerial Systems",
    occupationalCategory: family || undefined,
    jobLocationType: isRemote ? "TELECOMMUTE" : undefined,
    baseSalary: baseSalary || undefined,
    directApply: Boolean(applyUrl),
    applicantLocationRequirements: remoteStatus || undefined,
    url: `${SITE_URL}/jobs/${slug}`,
  };
}

/**
 * @param {Record<string, unknown>[]} jobs
 * @returns {object|null}
 */
export function buildHomeItemListSchema(jobs) {
  const list = Array.isArray(jobs) ? jobs : [];
  const filtered = list.filter((job) => shouldIndexJobPage(job)).slice(0, 25);
  if (filtered.length === 0) return null;
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Latest drone jobs",
    itemListElement: filtered.map((job, idx) => ({
      "@type": "ListItem",
      position: idx + 1,
      url: `${SITE_URL}/jobs/${jobSlug(job)}`,
      name: String(job.title || "Drone role"),
    })),
  };
}

/**
 * @param {Record<string, unknown>[]} jobs
 */
export function deriveHomeSeoSnapshot(jobs) {
  const families = new Map();
  const locations = new Map();

  for (const job of jobs) {
    const family = getJobFamily(job);
    if (family) families.set(family, (families.get(family) || 0) + 1);
    const location = getLocationText(job);
    if (location) locations.set(location, (locations.get(location) || 0) + 1);
  }

  const topFamilies = [...families.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name]) => name);
  const topLocations = [...locations.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name]) => name);

  return { topFamilies, topLocations };
}

