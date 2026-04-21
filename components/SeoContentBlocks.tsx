import Link from "next/link";
import { companyPagePath } from "@/lib/companyPages";
import { getLocationPagePath } from "@/lib/locationPages";

type TopCompany = {
  name: string;
  roleCount?: number;
};

type RelatedLocation = {
  slug: string;
  label: string;
};

type SeoContentBlocksProps = {
  locationLabel: string;
  locationSlug: string;
  topCompanies: TopCompany[];
  relatedLocations: RelatedLocation[];
};

const ROLE_LINKS = [
  { key: "drone-pilot", labelPrefix: "Drone pilot jobs in" },
  { key: "uav-pilot", labelPrefix: "UAV pilot jobs in" },
  { key: "drone-operator", labelPrefix: "Drone operator jobs in" },
  { key: "uav-engineer", labelPrefix: "UAV engineer jobs in" },
];

const FALLBACK_COMPANIES: TopCompany[] = [
  { name: "Anduril" },
  { name: "Skydio" },
  { name: "Zipline" },
];

const FALLBACK_LOCATIONS: RelatedLocation[] = [
  { slug: "usa", label: "USA" },
  { slug: "germany", label: "Germany" },
  { slug: "uk", label: "UK" },
];

function buildRoleHref(roleKey: string, locationSlug: string) {
  return `/roles/${roleKey}?location=${encodeURIComponent(locationSlug)}`;
}

function withFallbackCompanies(companies: TopCompany[]) {
  const deduped = new Map<string, TopCompany>();
  for (const company of companies || []) {
    const key = String(company.name || "").trim().toLowerCase();
    if (!key) continue;
    deduped.set(key, company);
  }
  for (const company of FALLBACK_COMPANIES) {
    const key = String(company.name || "").trim().toLowerCase();
    if (!key || deduped.has(key)) continue;
    deduped.set(key, company);
    if (deduped.size >= 3) break;
  }
  return Array.from(deduped.values()).slice(0, 8);
}

function withFallbackLocations(locations: RelatedLocation[], currentSlug: string) {
  const deduped = new Map<string, RelatedLocation>();
  for (const location of locations || []) {
    const key = String(location.slug || "").trim().toLowerCase();
    if (!key || key === currentSlug) continue;
    deduped.set(key, location);
  }
  for (const location of FALLBACK_LOCATIONS) {
    const key = String(location.slug || "").trim().toLowerCase();
    if (!key || key === currentSlug || deduped.has(key)) continue;
    deduped.set(key, location);
    if (deduped.size >= 3) break;
  }
  return Array.from(deduped.values()).slice(0, 3);
}

export default function SeoContentBlocks({
  locationLabel,
  locationSlug,
  topCompanies,
  relatedLocations,
}: SeoContentBlocksProps) {
  const normalizedCompanies = withFallbackCompanies(topCompanies);
  const normalizedLocations = withFallbackLocations(relatedLocations, locationSlug);

  return (
    <section aria-label={`SEO content blocks for ${locationLabel}`}>
      <section aria-label={`Top companies in ${locationLabel}`}>
        <h2>Top Companies in {locationLabel}</h2>
        {normalizedCompanies.length ? (
          <ul>
            {normalizedCompanies.map((company) => (
              <li key={company.name}>
                <Link href={companyPagePath(company.name)}>{company.name} drone jobs</Link>
                {typeof company.roleCount === "number" ? ` (${company.roleCount} roles)` : ""}
              </li>
            ))}
          </ul>
        ) : (
          <p>No company clusters yet.</p>
        )}
      </section>

      <section aria-label={`Popular drone roles in ${locationLabel}`}>
        <h2>Popular Drone Roles in {locationLabel}</h2>
        <ul>
          {ROLE_LINKS.map((role) => (
            <li key={role.key}>
              <Link href={buildRoleHref(role.key, locationSlug)}>
                {role.labelPrefix} {locationLabel}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label={`Explore related locations for ${locationLabel}`}>
        <h2>Explore Nearby / Related Locations</h2>
        {normalizedLocations.length ? (
          <ul>
            {normalizedLocations.map((location) => (
              <li key={location.slug}>
                <Link href={getLocationPagePath(location.slug)}>
                  Drone jobs in {location.label}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p>No related locations configured yet.</p>
        )}
      </section>
    </section>
  );
}
