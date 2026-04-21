const LOCKED_COMPANY_BLURBS = {
  zone5technologies: `At Zone 5 Technologies, we're redefining what's possible in unmanned aircraft systems. Our team of engineers and innovators is developing cutting-edge autonomous solutions that push the boundaries of UAS technology - solving complex challenges that matter.

We're building the future of UAS capabilities, and we're looking for exceptional talent to join us. If you're driven by hard problems, energized by rapid innovation, and ready to make an impact on next-generation flight systems, you belong here.

Join our dynamic team as a Systems Engineer IV/V! Your role is critical in applying cutting-edge model-based systems engineering (MBSE) techniques, with a focus on leveraging tools like Cameo and Simulink to innovate, design, prototype, integrate, and test unmanned systems and munitions. Embracing Cameo, holistic thinking, interdisciplinary collaboration, and product line innovation are pivotal in this journey.`,
};

export function companySlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Path to the company page. Slug-only URL; server resolves `jobs.company` from the slug.
 */
export function companyPagePath(companyName) {
  const name = String(companyName || "").trim();
  if (!name) return "";
  return `/company/${companySlug(name)}`;
}

/** Same as `companyPagePath` plus `from=companies` for directory → company navigation. */
export function companyPagePathFromCompaniesDirectory(companyName) {
  const base = companyPagePath(companyName);
  if (!base) return "";
  return `${base}?from=companies`;
}

function stripHtml(text) {
  return String(text || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildCompanyIntro(companyName, companyJobs) {
  const slug = companySlug(companyName);
  if (LOCKED_COMPANY_BLURBS[slug]) return LOCKED_COMPANY_BLURBS[slug];

  const candidate = companyJobs
    .map((job) => stripHtml(job?.description_html || job?.description || ""))
    .find((t) => t.length >= 280);

  if (candidate) return candidate.slice(0, 900).trim();

  return `${companyName} is actively hiring across drone, UAV, and autonomous systems roles. This page lists all currently active openings we track for ${companyName}, with direct apply links and the same filtering tools used across DroneRoles. Explore current opportunities across engineering, operations, flight test, and field teams, and check back frequently as roles update throughout the week.`;
}

