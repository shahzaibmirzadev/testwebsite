import { getEmploymentType, getLocationText, getRemoteStatus } from "./jobFieldHelpers";
import { CANONICAL_SITE_URL } from "./seoThresholds";
import { getPreferredCompanyDisplayName } from "./companyDescriptionMatch";
import { buildJobListingTitle, buildJobMetaDescription } from "./seoCopy";

function clean(value) {
  return String(value || "").trim();
}

function stripHtml(text) {
  return clean(text).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function isoDate(value) {
  if (!value) return null;
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function plusDaysIso(value, days) {
  const d = value ? new Date(String(value)) : new Date();
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function parseLocation(locationText) {
  const text = clean(locationText);
  if (!text) return { locality: null, country: null };
  const parts = text.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 1) return { locality: parts[0], country: null };
  return {
    locality: parts[0] || null,
    country: parts[parts.length - 1] || null,
  };
}

export function validateJobSchema(job) {
  const issues = [];
  if (!clean(job?.title)) issues.push("missing_title");
  if (!clean(job?.company)) issues.push("missing_company");
  const desc = stripHtml(job?.description_html || job?.description || "");
  if (desc.length < 120) issues.push("thin_or_missing_description");
  const posted = isoDate(job?.posted_at);
  if (!posted) issues.push("invalid_or_missing_datePosted");
  return {
    valid: issues.length === 0,
    issues,
  };
}

export function buildJobPostingSchemaV1(job, slug) {
  const title = clean(job?.title);
  const company = clean(job?.company);
  const description = stripHtml(job?.description_html || job?.description || "");
  const datePosted = isoDate(job?.posted_at);
  const validThrough = plusDaysIso(job?.posted_at, 30);
  const employmentType = clean(getEmploymentType(job));
  const remoteStatus = clean(getRemoteStatus(job));
  const locationText = getLocationText(job);
  const { locality, country } = parseLocation(locationText);
  const applyUrl = clean(job?.apply_url);
  const canonicalUrl = `${CANONICAL_SITE_URL}/jobs/${slug}`;
  const schema = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: title || undefined,
    description: description || undefined,
    datePosted: datePosted || undefined,
    validThrough: validThrough || undefined,
    employmentType: employmentType || undefined,
    hiringOrganization: {
      "@type": "Organization",
      name: company || undefined,
    },
    directApply: Boolean(applyUrl),
    url: canonicalUrl,
  };

  if (locality || country) {
    schema.jobLocation = {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        addressLocality: locality || undefined,
        addressCountry: country || undefined,
      },
    };
  }

  if (remoteStatus && /remote/i.test(remoteStatus)) {
    schema.applicantLocationRequirements = {
      "@type": "Country",
      name: country || "Worldwide",
    };
    schema.jobLocationType = "TELECOMMUTE";
  }

  if (!schema.jobLocation) {
    schema.jobLocation = {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        addressCountry: country || "Worldwide",
      },
    };
  }

  return Object.fromEntries(
    Object.entries(schema).filter(([, v]) => v !== undefined && v !== null && v !== "")
  );
}

export function buildJobMetaV1(job, slug) {
  const title = clean(job?.title) || "Drone Job";
  const company =
    getPreferredCompanyDisplayName(job) || clean(job?.company) || "Drone Company";
  const metaTitle = buildJobListingTitle(title, company);
  const description = buildJobMetaDescription(title, company);
  return {
    title: metaTitle,
    description,
    alternates: { canonical: `/jobs/${slug}` },
    openGraph: {
      title: metaTitle,
      description,
      url: `${CANONICAL_SITE_URL}/jobs/${slug}`,
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      title: metaTitle,
      description,
    },
  };
}

