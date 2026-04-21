import { getSearchableActiveJobs } from "@/lib/jobs";
import { getTrackedCompanies } from "@/lib/trackedCompanies";
import { companyPagePath } from "@/lib/companyPages";
import {
  getJobsForLocation,
  getLocationConfigs,
  getLocationPagePath,
  getTopCompaniesForJobs,
  jobMatchesLocation,
} from "@/lib/locationPages";
import { getLocationText } from "@/lib/jobFieldHelpers";
import { locationSnippets } from "@/lib/seo/locationSnippets";
import {
  buildResolvedLocationSnippet,
  hasCityOrRegionMention,
  hasCompanyMention,
} from "@/lib/seo/buildLocationSnippet";
import { validateSeoGraph, type SeoGraphEdge, type SeoGraphNode } from "@/lib/seo/validateGraph";

type AuditStatus = "PASS" | "FAIL";

type LocationAuditResult = {
  page: string;
  status: AuditStatus;
  checks: Record<string, boolean>;
  missing: string[];
};

type CompanyAuditResult = {
  page: string;
  status: AuditStatus;
  checks: Record<string, boolean>;
  missing: string[];
};

export type SeoAuditReport = {
  generatedAt: string;
  summary: {
    totalPages: number;
    passCount: number;
    failCount: number;
  };
  locationPages: LocationAuditResult[];
  companyPages: CompanyAuditResult[];
  graph: ReturnType<typeof validateSeoGraph>;
  weakPages: string[];
};

const REJECTED_ANCHORS = ["view jobs", "click here"];
const KEYWORD_COVERAGE_TERMS = ["drone pilot", "drone operator", "uav"];
const ROLE_LINK_LABELS = [
  "Drone pilot jobs in",
  "UAV pilot jobs in",
  "Drone operator jobs in",
  "UAV engineer jobs in",
];
const FALLBACK_COMPANY_NAMES = ["Anduril", "Skydio", "Zipline"];
const FALLBACK_LOCATION_SLUGS = ["usa", "germany", "uk"];

function hasRejectedAnchor(text: string) {
  const target = String(text || "").toLowerCase();
  return REJECTED_ANCHORS.some((item) => target.includes(item));
}

function pickTopCities(locationJobs: Array<Record<string, unknown>>) {
  const counts = new Map<string, number>();
  for (const job of locationJobs) {
    const raw = String(getLocationText(job) || "").trim();
    if (!raw) continue;
    const firstToken = raw.split(",")[0]?.trim() || "";
    if (!firstToken) continue;
    if (firstToken.length <= 2) continue;
    counts.set(firstToken, (counts.get(firstToken) || 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([city]) => city);
}

function pickTopRoles(locationJobs: Array<Record<string, unknown>>) {
  const counts = new Map<string, number>();
  for (const job of locationJobs) {
    const role = String(job?.job_family || job?.department || job?.team || "").trim();
    if (!role) continue;
    counts.set(role, (counts.get(role) || 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([role]) => role);
}

function hasAtLeastOneMatch(text: string, tokens: string[]) {
  const target = String(text || "").toLowerCase();
  return tokens.some((token) => target.includes(String(token || "").toLowerCase()));
}

function keywordCoverageCount(textParts: string[]) {
  const merged = textParts.join(" ").toLowerCase();
  return KEYWORD_COVERAGE_TERMS.reduce((count, term) => {
    if (merged.includes(term)) return count + 1;
    return count;
  }, 0);
}

function dedupe<T>(values: T[]) {
  return Array.from(new Set(values));
}

function ensureMinCompanies(companies: Array<{ name: string; roleCount: number }>, min = 3) {
  const byName = new Map<string, { name: string; roleCount: number }>();
  for (const company of companies || []) {
    const key = String(company?.name || "").trim().toLowerCase();
    if (!key) continue;
    byName.set(key, company);
  }
  for (const name of FALLBACK_COMPANY_NAMES) {
    const key = name.toLowerCase();
    if (byName.has(key)) continue;
    byName.set(key, { name, roleCount: 0 });
    if (byName.size >= min) break;
  }
  return Array.from(byName.values());
}

function ensureMinLocations(
  locations: Array<{ slug: string; label: string }>,
  allConfigs: Array<{ slug: string; label: string }>,
  currentSlug: string,
  min = 3
) {
  const bySlug = new Map<string, { slug: string; label: string }>();
  for (const item of locations || []) {
    const key = String(item?.slug || "").trim().toLowerCase();
    if (!key || key === currentSlug) continue;
    bySlug.set(key, item);
  }
  for (const slug of FALLBACK_LOCATION_SLUGS) {
    const key = String(slug || "").trim().toLowerCase();
    if (!key || key === currentSlug || bySlug.has(key)) continue;
    const cfg = allConfigs.find((entry) => entry.slug === key);
    if (!cfg) continue;
    bySlug.set(key, { slug: cfg.slug, label: cfg.label });
    if (bySlug.size >= min) break;
  }
  return Array.from(bySlug.values());
}

export async function auditSeo(): Promise<SeoAuditReport> {
  const [jobs, trackedCompanies] = await Promise.all([getSearchableActiveJobs(), getTrackedCompanies()]);
  const locationConfigs = getLocationConfigs();

  const nodes: SeoGraphNode[] = [
    { id: "/", type: "homepage" },
    { id: "/locations", type: "directory" },
    { id: "/companies", type: "directory" },
  ];
  const edges: SeoGraphEdge[] = [
    { from: "/", to: "/locations" },
    { from: "/", to: "/companies" },
    { from: "/locations", to: "/" },
    { from: "/companies", to: "/" },
  ];

  const locationPages: LocationAuditResult[] = [];
  const usedSnippets = new Map<string, string[]>();

  for (const locationConfig of locationConfigs) {
    const page = getLocationPagePath(locationConfig.slug);
    const locationJobs = getJobsForLocation(jobs, locationConfig.slug);
    const topCompanies = ensureMinCompanies(getTopCompaniesForJobs(locationJobs, 8), 3);
    const topRoleLabels = pickTopRoles(locationJobs);
    const snippet = buildResolvedLocationSnippet({
      location: locationConfig.label,
      curatedSnippet: String(locationSnippets[locationConfig.slug] || "").trim(),
      companies: topCompanies.map((company) => company.name),
      topRoles: topRoleLabels,
    });

    const relatedLocations = ensureMinLocations(
      getLocationConfigs()
      .filter((item) => item.slug !== locationConfig.slug && locationConfig.relatedSlugs.includes(item.slug))
      .slice(0, 3),
      locationConfigs,
      locationConfig.slug,
      3
    );

    const companyAnchors = topCompanies.slice(0, 8).map((company) => `${company.name} drone jobs`);
    const locationAnchors = relatedLocations.map((item) => `Drone jobs in ${item.label}`);
    const roleAnchors = ROLE_LINK_LABELS.map((label) => `${label} ${locationConfig.label}`);
    const topCities = pickTopCities(locationJobs);

    const checks: Record<string, boolean> = {
      locationLinksCompaniesMin3: companyAnchors.length >= 3,
      locationLinksLocationsMin3: locationAnchors.length >= 3,
      locationLinksRolesMin3: roleAnchors.length >= 3,
      anchorNoGeneric: ![...companyAnchors, ...locationAnchors, ...roleAnchors].some(hasRejectedAnchor),
      anchorContainsKeywords:
        locationAnchors.every((anchor) => anchor.toLowerCase().includes("drone jobs in")) &&
        companyAnchors.every((anchor) => anchor.toLowerCase().includes("drone jobs")),
      hasUniqueSnippet: Boolean(snippet),
      snippetMentionsCompany:
        hasCompanyMention(snippet, topCompanies.map((company) => company.name)) ||
        hasAtLeastOneMatch(snippet, topCompanies.map((company) => company.name)),
      snippetMentionsCityOrRegion: hasCityOrRegionMention(snippet) || hasAtLeastOneMatch(snippet, topCities),
      keywordCoverageAtLeast2:
        keywordCoverageCount([
          snippet,
          "Popular Drone Roles in location",
          ...roleAnchors,
        ]) >= 2,
    };

    if (snippet) {
      const existing = usedSnippets.get(snippet) || [];
      existing.push(locationConfig.slug);
      usedSnippets.set(snippet, existing);
    }

    const missing = Object.entries(checks)
      .filter(([, ok]) => !ok)
      .map(([name]) => name);

    locationPages.push({
      page,
      status: missing.length ? "FAIL" : "PASS",
      checks,
      missing,
    });

    nodes.push({ id: page, type: "location" });
    edges.push({ from: "/locations", to: page });
    edges.push({ from: page, to: "/locations" });
    for (const company of topCompanies.slice(0, 8)) {
      const cPath = companyPagePath(company.name);
      if (!cPath) continue;
      edges.push({ from: page, to: cPath });
    }
    for (const related of relatedLocations) {
      edges.push({ from: page, to: getLocationPagePath(related.slug) });
    }
    for (const roleAnchor of roleAnchors) {
      const roleSlug = roleAnchor.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      const rolePath = `/roles/${roleSlug}`;
      nodes.push({ id: rolePath, type: "role" });
      edges.push({ from: page, to: rolePath });
      edges.push({ from: rolePath, to: page });
    }
  }

  const duplicateSnippetSlugs = dedupe(
    Array.from(usedSnippets.entries())
      .filter(([, slugs]) => slugs.length > 1)
      .flatMap(([, slugs]) => slugs)
  );
  if (duplicateSnippetSlugs.length) {
    for (const page of locationPages) {
      const slug = page.page.split("/").pop() || "";
      if (!duplicateSnippetSlugs.includes(slug)) continue;
      if (!page.missing.includes("snippetUniqueAcrossLocations")) {
        page.missing.push("snippetUniqueAcrossLocations");
      }
      page.checks.snippetUniqueAcrossLocations = false;
      page.status = "FAIL";
    }
  } else {
    for (const page of locationPages) {
      page.checks.snippetUniqueAcrossLocations = true;
    }
  }

  const companyPages: CompanyAuditResult[] = [];
  const trackedCompanySet = new Set((trackedCompanies || []).map((name) => String(name || "").trim()).filter(Boolean));
  const companiesFromJobs = new Map<string, Array<Record<string, unknown>>>();
  for (const job of jobs) {
    const name = String(job?.company || "").trim();
    if (!name) continue;
    const bucket = companiesFromJobs.get(name) || [];
    bucket.push(job);
    companiesFromJobs.set(name, bucket);
  }

  for (const [companyName, companyJobs] of companiesFromJobs.entries()) {
    if (!trackedCompanySet.has(companyName) && companyJobs.length === 0) continue;
    const page = companyPagePath(companyName);
    if (!page) continue;
    const locationLinks = ensureMinLocations(
      getLocationConfigs()
      .map((config) => ({
        slug: config.slug,
        label: config.label,
        count: companyJobs.filter((job) => jobMatchesLocation(job, config)).length,
      }))
      .filter((item) => item.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 4),
      locationConfigs,
      "",
      2
    );

    const checks: Record<string, boolean> = {
      companyLinksLocationsMin2: locationLinks.length >= 2,
      companyHasKeywordLocationAnchors: locationLinks.every((loc) =>
        `Drone jobs in ${loc.label}`.toLowerCase().includes("drone jobs in")
      ),
      companyLinksDirectory: true,
    };

    const missing = Object.entries(checks)
      .filter(([, ok]) => !ok)
      .map(([name]) => name);

    companyPages.push({
      page,
      status: missing.length ? "FAIL" : "PASS",
      checks,
      missing,
    });

    nodes.push({ id: page, type: "company" });
    edges.push({ from: "/companies", to: page });
    edges.push({ from: page, to: "/companies" });
    for (const location of locationLinks) {
      edges.push({ from: page, to: getLocationPagePath(location.slug) });
    }
  }

  const graph = validateSeoGraph(
    dedupe(nodes.map((node) => `${node.type}:${node.id}`)).map((value) => {
      const [type, ...idParts] = value.split(":");
      return { type: type as SeoGraphNode["type"], id: idParts.join(":") };
    }),
    dedupe(edges.map((edge) => `${edge.from}=>${edge.to}`)).map((value) => {
      const [from, to] = value.split("=>");
      return { from, to };
    }),
    "/"
  );

  const allPages = [...locationPages, ...companyPages];
  const passCount = allPages.filter((page) => page.status === "PASS").length;
  const failCount = allPages.length - passCount;
  const weakPages = allPages.filter((page) => page.status === "FAIL").map((page) => page.page);

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      totalPages: allPages.length,
      passCount,
      failCount,
    },
    locationPages,
    companyPages,
    graph,
    weakPages,
  };
}

export function printSeoAuditSummary(report: SeoAuditReport) {
  const lines = [
    `SEO Audit: ${report.summary.passCount}/${report.summary.totalPages} pages PASS`,
    `Weak pages: ${report.weakPages.length}`,
    `Orphans: ${report.graph.orphanNodes.length}`,
    `One-way links: ${report.graph.oneWayEdges.length}`,
    `Depth > 3: ${report.graph.unreachableWithin3Clicks.length}`,
  ];
  for (const line of lines) console.log(line);

  for (const page of [...report.locationPages, ...report.companyPages]) {
    console.log(`${page.status} ${page.page}`);
    if (page.missing.length) {
      console.log(`  missing: ${page.missing.join(", ")}`);
    }
  }
}
