import Link from "next/link";
import { FiArrowRight, FiBriefcase, FiCompass, FiMapPin } from "react-icons/fi";
import { getJobsList } from "@/lib/jobs";
import { getFeatureFlags } from "@/lib/featureFlags";
import { isIndexableCategoryHub, isIndexableGuideHub } from "@/lib/seoInternalLinks";

const footerGroups = [
  {
    title: "Browse",
    links: [
      { href: "/", label: "Browse Jobs" },
      { href: "/companies", label: "Company Directory" },
      { href: "/locations", label: "Location Directory" },
      { href: "/roles", label: "Role Directory" },
    ],
  },
  {
    title: "Popular Roles",
    links: [
      { kind: "category", slug: "drone-pilot", href: "/jobs/drone-pilot", label: "Drone Pilot Jobs" },
      { kind: "category", slug: "uav-operator", href: "/jobs/uav-operator", label: "UAV Operator Jobs" },
      { kind: "category", slug: "defense-drone-jobs", href: "/jobs/defense-drone-jobs", label: "Defense Drone Jobs" },
      { kind: "guide", slug: "drone-engineering-jobs", href: "/drone-engineering-jobs", label: "Drone Engineering Jobs" },
    ],
  },
  {
    title: "Guides",
    links: [
      { href: "/guides/how-to-become-drone-pilot", label: "Drone Pilot Guide" },
      { kind: "guide", slug: "uav-pilot-jobs", href: "/uav-pilot-jobs", label: "UAV Pilot Jobs" },
      { kind: "guide", slug: "drone-jobs-europe", href: "/drone-jobs-europe", label: "Drone Jobs Europe" },
      { href: "/post-a-job", label: "Post a Job" },
      { href: "/contact", label: "Contact" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/privacy", label: "Privacy Policy" },
      { href: "/terms", label: "Terms of Service" },
      { href: "/cookies", label: "Cookie Policy" },
    ],
  },
];

export default async function SiteFooter() {
  const year = new Date().getFullYear();
  const jobs = await getJobsList();
  const flags = getFeatureFlags();

  const renderLink = (link) => {
    if (link.kind) {
      const indexable =
        link.kind === "category"
          ? isIndexableCategoryHub(link.slug, jobs, flags)
          : isIndexableGuideHub(link.slug, jobs);
      if (!indexable) {
        return (
          <span className="whitespace-nowrap text-sm font-medium leading-5 text-[#7A7A76]" data-site-footer-muted-link>
            {link.label}
          </span>
        );
      }
    }

    return (
      <Link
        href={link.href}
        className="group inline-flex items-center gap-1.5 whitespace-nowrap text-sm font-bold leading-5 text-[#4B4B47] no-underline transition-colors hover:text-[#5B4FE8]"
        data-site-footer-link
      >
        <span>{link.label}</span>
        <FiArrowRight
          aria-hidden
          className="h-3.5 w-3.5 opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100"
        />
      </Link>
    );
  };

  return (
    <footer className="border-t border-[rgba(0,0,0,0.08)] bg-[#FFFFFF] text-[#1C1C1A]" data-site-footer>
      <div className="mx-auto w-full max-w-[1180px] px-4 py-10 sm:px-6 lg:px-8 lg:py-12">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,2.45fr)] lg:items-start">
          <div className="max-w-xl">
            <Link href="/" className="inline-flex items-center gap-3 text-[#1A1160] no-underline" data-site-footer-brand>
              <span className="flex h-11 w-11 items-center justify-center rounded-[8px] bg-[#EDE9FF] text-[#5B4FE8]" data-site-footer-brand-icon>
                <FiCompass aria-hidden className="h-5 w-5" />
              </span>
              <span className="text-2xl font-bold tracking-[-0.03em]">Drone Roles</span>
            </Link>
            <p className="mt-4 mb-0 max-w-md text-sm leading-6 text-[#666666]">
              Live drone, UAV, autonomy, flight test, and aerospace jobs from tracked companies worldwide.
            </p>
            <div className="mt-5">
              <Link
                href="/"
                className="inline-flex min-h-11 w-full max-w-sm items-center justify-center gap-2 rounded-[8px] bg-[#5B4FE8] px-5 py-2 text-sm font-bold text-[#FFFFFF] no-underline transition-colors hover:bg-[#1A1160]"
                data-site-footer-primary
              >
                <FiBriefcase aria-hidden className="h-4 w-4" />
                Browse Jobs
              </Link>
            </div>
          </div>

          <nav
            className="grid gap-x-8 gap-y-7 sm:grid-cols-2 lg:grid-cols-[1.1fr_1.28fr_1fr_0.95fr]"
            aria-label="Footer navigation"
          >
            {footerGroups.map((group) => (
              <div key={group.title}>
                <p className="m-0 mb-3 text-xs font-bold uppercase tracking-[0.08em] text-[#5B4FE8]" data-site-footer-title>
                  {group.title}
                </p>
                <div className="grid gap-2.5">
                  {group.links.map((link) => (
                    <div key={`${group.title}-${link.label}`}>
                      {renderLink(link)}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </div>

        <div className="mt-9 grid gap-4 border-t border-[rgba(0,0,0,0.08)] pt-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <p className="m-0 text-sm text-[#666666]">
            {"\u00A9"} {year} Drone Roles. All rights reserved.
          </p>
          <p className="m-0 inline-flex items-center gap-2 text-sm font-medium text-[#666666] sm:justify-self-end">
            <FiMapPin aria-hidden className="h-4 w-4 text-[#A3A3A3]" data-site-footer-bottom-icon />
            Built for cleaner drone and aerospace hiring.
          </p>
        </div>
      </div>
    </footer>
  );
}
