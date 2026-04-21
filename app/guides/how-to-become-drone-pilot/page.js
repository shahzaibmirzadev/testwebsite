import DronePilotGuidePage from "@/components/guides/DronePilotGuidePage";
import { CANONICAL_SITE_URL } from "@/lib/seoThresholds";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "How to Become a Drone Pilot",
  description:
    "Practical guide for becoming a drone pilot: requirements, routes, costs, mistakes, and the next steps to get hired.",
  alternates: { canonical: `${CANONICAL_SITE_URL}/guides/how-to-become-drone-pilot` },
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
};

function waitForGuideSkeleton() {
  return new Promise((resolve) => {
    setTimeout(resolve, 350);
  });
}

const guideContent = {
  title: "How to Become a Drone Pilot",
  positioning:
    "A practical, employer-focused guide to getting hired as a drone pilot without wasting months on the wrong proof.",
  quickAnswer:
    "Most employers hire drone pilots who can fly safely under commercial rules, collect usable data, and document flights cleanly. In practice, that means getting the right certificate for your market, logging real flight time, and building a focused portfolio for the work type you want.",
  heroStats: [
    { label: "Time", value: "2-8 weeks" },
    { label: "Cost", value: "EUR200-EUR1,500" },
    { label: "Entry difficulty", value: "Low-Medium" },
  ],
  fastestPath: [
    "Get certified in your market",
    "Log 10-20 structured flight hours",
    "Build 2-3 sample projects in one niche",
    "Apply to live jobs and small contracts",
  ],
  whatGetsYouHired: [
    "This is not just flying - most work is planning, data capture, and reporting.",
    "Logged flight hours matter more than certifications alone.",
    "Clean data output matters more than raw footage.",
    "Industry-specific experience beats generic flying.",
    "Entry is accessible, but competition is real at the beginning.",
  ],
  paths: [
    {
      title: "Freelance starter path",
      whoFor: "Career switchers who need early income and are willing to hustle for proof.",
      speedToIncome: "Fast: often 2-6 weeks after certification.",
      riskLevel: "Medium-High: uneven early demand and pricing pressure.",
      mostCommon: true,
    },
    {
      title: "Technician to pilot path",
      whoFor: "Candidates who want team structure, mentoring, and a steadier ramp.",
      speedToIncome: "Medium: around 1-3 months depending on openings.",
      riskLevel: "Low-Medium: slower start, stronger long-term progression.",
    },
    {
      title: "Adjacent industry transition path",
      whoFor: "Pilots, survey staff, GIS techs, inspectors, and field operators.",
      speedToIncome: "Medium-fast: around 2-8 weeks with a targeted portfolio.",
      riskLevel: "Low-Medium: strong transferability if you prove outcomes.",
    },
  ],
  steps: [
    {
      title: "Pick one lane",
      detail: "Choose inspection, mapping, media, or public safety so your proof looks coherent.",
    },
    {
      title: "Get certified",
      detail: "Complete the commercial license for your market, usually in about 7-14 days.",
    },
    {
      title: "Log real missions",
      detail: "Aim for 10-20 structured flight hours with clear objectives and usable outputs.",
    },
    {
      title: "Build a focused portfolio",
      detail: "Show 3-5 projects in one niche with short explanations and visible results.",
    },
    {
      title: "Convert proof into work",
      detail: "Apply to live roles while taking small contracts that build credibility fast.",
    },
  ],
  detailedBreakdown: {
    label: "Detailed guide",
    heading: "Detailed breakdown",
    sections: [
      {
        title: "Choosing your lane",
        parts: [
          {
            type: "p",
            text: "Most beginners stay too general for too long. In practice, employers hire for outcomes: inspection reports, mapping deliverables, utility scans, or media packages. Picking one lane early gives your learning and your proof a clear direction.",
          },
          {
            type: "p",
            text: "Inspection and mapping are often the fastest business-driven entry points. Media is attractive but usually more saturated and harder to monetize consistently.",
          },
        ],
      },
      {
        title: "Getting certified the useful way",
        parts: [
          {
            type: "p",
            text: "The certificate is important, but employers assume you have it. What they really assess is whether you can apply that knowledge under real conditions.",
          },
          {
            type: "ul",
            items: [
              "Airspace decisions and route planning",
              "Weather-based go or no-go judgment",
              "On-site risk awareness and documentation",
            ],
          },
        ],
      },
      {
        title: "Building flight experience that counts",
        parts: [
          {
            type: "p",
            text: "Random flying does not read as professional experience. Strong signals come from repeatable missions with logs, objectives, and outputs that another person can review.",
          },
          {
            type: "ul",
            items: [
              "Consistent flight logs",
              "Defined mission goals",
              "Documented deliverables after the flight",
            ],
          },
        ],
      },
      {
        title: "Portfolio that converts",
        parts: [
          {
            type: "p",
            text: "Most portfolios fail because they show footage instead of proof. Hiring teams want evidence that you can produce something usable for a customer or internal stakeholder.",
          },
          {
            type: "ul",
            items: [
              "Focus on one niche instead of everything",
              "Show outputs, not just pretty visuals",
              "Explain what you did, why it mattered, and what the result was",
            ],
          },
        ],
      },
      {
        title: "Getting your first paid work",
        parts: [
          {
            type: "p",
            text: "First income usually comes from a mix of local contracts, small freelance jobs, and entry-level field roles. Applications work better when they are backed by even a small amount of proof.",
          },
          {
            type: "p",
            text: "The goal is not to land a perfect role immediately. The goal is to build credibility quickly enough that better roles become realistic.",
          },
        ],
      },
    ],
  },
  primaryCta: {
    primaryLabel: "View Drone Pilot Jobs",
    primaryHref: "/#browse-listings",
    secondaryLabel: "See Companies Hiring",
    secondaryHref: "/companies",
  },
  requirements: {
    certifications: ["Commercial drone license for your region."],
    skills: [
      "Flight planning and airspace checks.",
      "Consistent data capture and documentation.",
      "Basic mapping or inspection literacy.",
    ],
    legal: [
      "Airspace and line-of-sight rules.",
      "License, registration, and logs when needed.",
    ],
  },
  timeAndCost: [
    "Time to first paid work is often about 2-8 weeks.",
    "Costs commonly land between EUR200 and EUR1,500.",
    "Specialist paths usually take longer but can pay more.",
  ],
  mistakes: [
    "No niche focus.",
    "Over-indexing on cinematic footage.",
    "Weak documentation quality.",
    "Applying without proof of outcomes.",
  ],
  relatedRoles: [
    { label: "UAV Pilot Jobs", href: "/uav-pilot-jobs" },
    { label: "Drone Engineering Jobs", href: "/drone-engineering-jobs" },
    { label: "UAV Technician", href: "/roles/uav-technician" },
    { label: "GIS / Mapping Specialist", href: "/roles/drone-mapping" },
    { label: "Field Operations", href: "/roles/operations" },
  ],
  finalCta: {
    title: "Ready to start?",
    description: "Move from research into active applications and real market proof.",
    primaryLabel: "View Jobs",
    primaryHref: "/#browse-listings",
    secondaryLabel: "Browse Companies",
    secondaryHref: "/companies",
  },
};

export default async function HowToBecomeDronePilotPage() {
  await waitForGuideSkeleton();
  return <DronePilotGuidePage {...guideContent} />;
}
