import Link from "next/link";
import { notFound } from "next/navigation";
import { FiArrowRight, FiBriefcase, FiGlobe, FiLayers, FiMapPin, FiUsers } from "react-icons/fi";
import RoleLandingMotion from "@/components/roles/RoleLandingMotion";
import RoleOpeningsSection from "@/components/roles/RoleOpeningsSection";
import { getSearchableActiveJobs } from "@/lib/jobs";
import { getRoleConfigBySlug, getJobsForRole } from "@/lib/rolePages";
import { getGlobalRolePageConfigs } from "@/lib/landingPageRegistry";
import { getRoleLocationPageConfigs, getRoleLocationPagePath } from "@/lib/roleLocationPages";

export const revalidate = 86400;

const statToneClasses = [
  "text-[#5B4FE8]",
  "text-[#B45309]",
  "text-[#1A1160]",
  "text-[#78350F]",
];

function formatNumber(value) {
  return new Intl.NumberFormat("en").format(Number(value || 0));
}

function getRoleBackground(role) {
  const roleGradient =
    typeof role?.gradient === "string" && role.gradient.trim()
      ? role.gradient
      : "linear-gradient(135deg, #5B4FE8 0%, #1A1160 100%)";

  return `linear-gradient(180deg, rgba(255, 255, 255, 0.9) 0%, #FFFFFF 360px, #FFFFFF 100%), ${roleGradient}`;
}

function titleWithoutJobs(value) {
  return String(value || "").replace(/\s+Jobs$/i, "").trim();
}

function getRoleBridgeSlug(roleId) {
  const landingRoleSlugBridge = {
    pilot: "drone-pilot",
    operations: "uav-operator",
    engineering: "uav-engineer",
    technician: "drone-technician",
  };
  return landingRoleSlugBridge[roleId] || roleId;
}

function getDominantLocation(jobs) {
  const counts = new Map();
  for (const job of Array.isArray(jobs) ? jobs : []) {
    const raw = String(job?.location || "").trim();
    if (!raw) continue;
    const label = raw.split(",")[0]?.trim();
    if (!label) continue;
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || "Global";
}

function getCompaniesHiring(jobs) {
  return new Set(
    (Array.isArray(jobs) ? jobs : [])
      .map((job) => String(job?.company || "").trim())
      .filter(Boolean)
  ).size;
}

function getHiringLevel(count) {
  if (count >= 30) return "High";
  if (count >= 12) return "Moderate";
  return "Emerging";
}

function StatItem({ label, value, index, suffix = "" }) {
  const isLongText = typeof value === "string" && value.length > 12;

  return (
    <div data-role-stat>
      <p className={`m-0 font-black leading-none tracking-[-0.03em] ${isLongText ? "text-xl sm:text-2xl" : "text-3xl"} ${statToneClasses[index % statToneClasses.length]}`}>
        {value}
        {suffix}
      </p>
      <p className="mt-2 mb-0 text-sm font-bold text-[#665A50]">{label}</p>
    </div>
  );
}

function TextLink({ href, label, meta, icon: Icon = FiArrowRight }) {
  return (
    <Link
      href={href}
      className="group grid gap-1 border-b border-[rgba(180,83,9,0.14)] py-4 text-[#1C1C1A] no-underline transition hover:bg-[#FFF7ED] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
    >
      <span className="min-w-0">
        <span className="block text-base font-black leading-snug">{label}</span>
        {meta ? <span className="mt-1 block text-sm font-semibold text-[#665A50]">{meta}</span> : null}
      </span>
      <span className="inline-flex items-center gap-2 text-sm font-black text-[#5B4FE8] transition group-hover:translate-x-1 sm:justify-self-end">
        Open
        <Icon aria-hidden className="h-4 w-4" />
      </span>
    </Link>
  );
}

function LinkColumn({ eyebrow, title, description, items, fallbackHref, fallbackLabel, icon }) {
  const list = items.length ? items : [{ href: fallbackHref, label: fallbackLabel, meta: "Explore more" }];

  return (
    <section data-role-scroll>
      <p className="m-0 text-xs font-black uppercase tracking-[0.12em] text-[#B45309]">{eyebrow}</p>
      <h2 className="mt-2 mb-0 text-2xl font-black tracking-[-0.02em] text-[#1C1C1A]">{title}</h2>
      <p className="mt-2 mb-0 min-h-12 max-w-xl text-sm font-semibold leading-6 text-[#665A50]">{description}</p>
      <div className="mt-4 border-t border-[rgba(180,83,9,0.16)]">
        {list.map((item) => (
          <TextLink key={`${title}-${item.href}-${item.label}`} href={item.href} label={item.label} meta={item.meta} icon={icon} />
        ))}
      </div>
    </section>
  );
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const role = getRoleConfigBySlug(slug);
  if (!role) {
    return {
      title: "Role not found | DroneRoles",
      robots: { index: false, follow: false },
    };
  }
  return {
    title: role?.landingSeoTitle || `${role.title} Drone Jobs`,
    description:
      role?.landingSeoDescription ||
      `Browse active ${role.title.toLowerCase()} roles across drone and UAV companies.`,
    alternates: { canonical: `/roles/${role.id}` },
  };
}

export default async function RolePage({ params }) {
  const { slug } = await params;
  const role = getRoleConfigBySlug(slug);
  if (!role) return notFound();

  const landingRoleSlug = getRoleBridgeSlug(role.id);
  const landingRole = getGlobalRolePageConfigs().find((config) => config.roleSlug === landingRoleSlug) || null;
  const jobs = await getSearchableActiveJobs();
  const roleJobs = getJobsForRole(jobs, role.id);

  const baseRoleTitle = titleWithoutJobs(landingRole?.title || `${role.title} Jobs`);
  const heroBlurb =
    landingRole?.heroBlurb ||
    `Live openings currently matching ${String(role.title || "").toLowerCase()} hiring signals across drone and UAV teams.`;

  const companiesHiring = getCompaniesHiring(roleJobs);
  const dominantLocation = getDominantLocation(roleJobs);
  const hiringLevel = getHiringLevel(roleJobs.length);

  const availableRoleLocationConfigs = getRoleLocationPageConfigs().filter(
    (config) => config.roleSlug === landingRoleSlug
  );
  const relatedRoleLinks = Array.isArray(landingRole?.relatedRoleSlugs) ? landingRole.relatedRoleSlugs : [];

  const countryLinkItems = availableRoleLocationConfigs.slice(0, 6).map((config) => ({
    href: getRoleLocationPagePath(landingRoleSlug, config.locationSlug),
    label: config.locationLabel,
    meta: `${baseRoleTitle} roles`,
  }));

  const rolePathItems = relatedRoleLinks
    .map((roleSlug) => {
      const related = getGlobalRolePageConfigs().find((item) => item.roleSlug === roleSlug);
      if (!related) return null;
      return {
        href: `/roles/${roleSlug}`,
        label: related.title,
        meta: "Adjacent role path",
      };
    })
    .filter(Boolean)
    .slice(0, 6);

  const discoveryItems = [
    { href: "/roles", label: "Role Directory", meta: "Browse all role families" },
    { href: "/companies", label: "Company Directory", meta: "Explore employers" },
    { href: "/locations", label: "Location Directory", meta: "Browse markets" },
  ];

  return (
    <main
      className="text-[#1C1C1A]"
      style={{ background: getRoleBackground(role) }}
      data-role-theme
      data-role-slug-theme
    >
      <RoleLandingMotion />
      <div className="mx-auto w-full max-w-[1120px] px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <section className="py-6 sm:py-8 lg:py-10">
          <nav className="mb-7 flex flex-wrap gap-3 text-sm font-bold" aria-label="Breadcrumb" data-role-hero-reveal>
            <Link href="/roles" className="text-[#665A50] no-underline transition hover:text-[#5B4FE8]">
              Role directory
            </Link>
            <span className="text-[#A3A3A3]" aria-hidden>/</span>
            <Link href="/" className="text-[#665A50] no-underline transition hover:text-[#5B4FE8]">
              Browse jobs
            </Link>
          </nav>

          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_390px] lg:items-end">
            <div className="max-w-3xl">
              <p className="m-0 text-xs font-black uppercase tracking-[0.12em] text-[#B45309]" data-role-hero-reveal>
                Role market
              </p>
              <h1 className="mt-4 mb-0 text-4xl font-black leading-[1.04] tracking-[-0.035em] text-[#1C1C1A] sm:text-5xl lg:text-6xl">
                <span className="block overflow-hidden">
                  <span className="inline-block" data-role-hero-line>{baseRoleTitle}</span>
                </span>
                <span className="block overflow-hidden text-[#5B4FE8]">
                  <span className="inline-block" data-role-hero-line>jobs.</span>
                </span>
              </h1>
              <p className="mt-5 mb-0 max-w-2xl text-base leading-7 text-[#665A50] sm:text-lg" data-role-hero-reveal>
                {heroBlurb}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-x-6 gap-y-5 border-t border-[rgba(180,83,9,0.16)] pt-5 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
              <StatItem label="Open roles" value={formatNumber(roleJobs.length)} index={0} />
              <StatItem label="Companies hiring" value={formatNumber(companiesHiring)} index={1} />
              <StatItem label="Hiring climate" value={hiringLevel} index={2} />
              <StatItem label="Top market" value={dominantLocation} index={3} />
            </div>
          </div>
        </section>

        <section className="border-y border-[rgba(180,83,9,0.16)] py-6" data-role-scroll>
          <div className="grid gap-5 sm:grid-cols-3">
            <div>
              <p className="m-0 text-xs font-black uppercase tracking-[0.12em] text-[#B45309]">Focus</p>
              <p className="mt-2 mb-0 text-lg font-black text-[#1C1C1A]">{baseRoleTitle}</p>
            </div>
            <div>
              <p className="m-0 text-xs font-black uppercase tracking-[0.12em] text-[#B45309]">Market</p>
              <p className="mt-2 mb-0 text-lg font-black text-[#1C1C1A]">{dominantLocation}</p>
            </div>
            <div>
              <p className="m-0 text-xs font-black uppercase tracking-[0.12em] text-[#B45309]">Source</p>
              <p className="mt-2 mb-0 text-lg font-black text-[#1C1C1A]">Live hiring feed</p>
            </div>
          </div>
        </section>

        <RoleOpeningsSection jobs={roleJobs} roleTitle={role.title} />

        <section className="grid gap-9 border-t border-[rgba(180,83,9,0.16)] py-8 lg:grid-cols-3">
          <LinkColumn
            eyebrow="Markets"
            title="Top locations"
            description={`Explore ${baseRoleTitle.toLowerCase()} landing pages by market.`}
            items={countryLinkItems}
            fallbackHref="/locations"
            fallbackLabel="Location Directory"
            icon={FiMapPin}
          />
          <LinkColumn
            eyebrow="Adjacent paths"
            title="Related roles"
            description="Move sideways into nearby role families with similar hiring signals."
            items={rolePathItems}
            fallbackHref="/roles"
            fallbackLabel="Role Directory"
            icon={FiLayers}
          />
          <LinkColumn
            eyebrow="Explore"
            title="Keep browsing"
            description="Jump back into the broader directories when this role is too narrow."
            items={discoveryItems}
            fallbackHref="/"
            fallbackLabel="Browse Jobs"
            icon={FiGlobe}
          />
        </section>

        <section className="border-t border-[rgba(180,83,9,0.16)] py-7" data-role-scroll>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="m-0 text-xs font-black uppercase tracking-[0.12em] text-[#B45309]">Next step</p>
              <h2 className="mt-2 mb-0 text-2xl font-black tracking-[-0.02em] text-[#1C1C1A]">
                Ready to compare roles?
              </h2>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/roles"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] border border-[rgba(180,83,9,0.18)] bg-[#FFFFFF] px-5 text-sm font-black text-[#78350F] no-underline transition hover:bg-[#FFF7ED]"
              >
                <FiBriefcase aria-hidden className="h-4 w-4" />
                All roles
              </Link>
              <Link
                href="/companies"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] bg-[#5B4FE8] px-5 text-sm font-black text-[#FFFFFF] no-underline transition hover:bg-[#1A1160]"
              >
                <FiUsers aria-hidden className="h-4 w-4" />
                Hiring companies
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
