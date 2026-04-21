import Link from "next/link";
import {
  FiArrowRight,
  FiAward,
  FiBriefcase,
  FiCheck,
  FiClock,
  FiCompass,
  FiExternalLink,
  FiFileText,
  FiFlag,
  FiLayers,
  FiMap,
  FiShield,
  FiTarget,
  FiTrendingUp,
} from "react-icons/fi";
import DronePilotGuideMotion from "./DronePilotGuideMotion";

const stepNotes = [
  "Permission layer",
  "Practice layer",
  "Proof layer",
  "Application layer",
  "Career layer",
];

const stepIcons = [FiAward, FiCompass, FiFileText, FiBriefcase, FiTrendingUp];

function Eyebrow({ children, className = "" }) {
  return (
    <p className={`m-0 text-[0.72rem] font-black uppercase tracking-[0.16em] text-[#5B4FE8] ${className}`}>
      {children}
    </p>
  );
}

function SectionHeader({ eyebrow, title, description, center = false }) {
  return (
    <div className={center ? "mx-auto max-w-3xl text-center" : "max-w-3xl"}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mt-3 mb-0 text-3xl font-black leading-tight tracking-[-0.045em] text-[#171421] sm:text-[2.45rem]">
        {title}
      </h2>
      {description ? (
        <p className="mt-4 mb-0 text-sm font-semibold leading-7 text-[#665A50] sm:text-[0.98rem]">
          {description}
        </p>
      ) : null}
    </div>
  );
}

function CheckList({ items, compact = false }) {
  if (!Array.isArray(items) || items.length === 0) return null;

  return (
    <ul className={`m-0 grid list-none p-0 ${compact ? "gap-2" : "gap-3"}`}>
      {items.map((item) => (
        <li key={item} className="flex items-start gap-3 text-sm font-semibold leading-6 text-[#514B62]">
          <span className="mt-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#EDE9FF] text-[#5B4FE8]">
            <FiCheck className="h-3 w-3 shrink-0" />
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function DetailPart({ part }) {
  if (part.type === "p") {
    return <p className="m-0 text-[0.98rem] font-medium leading-8 text-[#514B62]">{part.text}</p>;
  }

  if (part.type === "ul") {
    return (
      <ul className="m-0 grid list-none gap-2.5 p-0">
        {part.items.map((item) => (
          <li key={item} className="flex items-start gap-3 rounded-[8px] bg-[#FFFCF7] px-3.5 py-3 text-sm font-bold leading-6 text-[#383246]">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#5B4FE8]" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    );
  }

  return null;
}

export default function DronePilotGuidePage({
  title,
  positioning,
  quickAnswer,
  heroStats,
  fastestPath,
  whatGetsYouHired,
  paths,
  steps,
  detailedBreakdown,
  primaryCta,
  requirements,
  timeAndCost,
  mistakes,
  relatedRoles,
  finalCta,
}) {
  const statIcons = [FiClock, FiTarget, FiTrendingUp];
  const requirementCards = [
    { title: "Certification", icon: FiAward, items: requirements?.certifications || [] },
    { title: "Core skills", icon: FiCompass, items: requirements?.skills || [] },
    { title: "Legal basics", icon: FiShield, items: requirements?.legal || [] },
  ];
  const guideSections = Array.isArray(detailedBreakdown?.sections) ? detailedBreakdown.sections : [];

  return (
    <main className="overflow-x-hidden bg-[#FFFCF7] text-[#1C1C1A]" data-guide-pilot-page>
      <DronePilotGuideMotion />

      <section className="relative overflow-hidden border-b border-[rgba(91,79,232,0.1)] bg-[#FFFCF7]">
        <div
          className="pointer-events-none absolute inset-0"
          data-guide-hero-bg
          aria-hidden="true"
          style={{
            background:
              "radial-gradient(circle at 18% 18%, rgba(91,79,232,0.16), transparent 27%), radial-gradient(circle at 88% 4%, rgba(180,83,9,0.08), transparent 28%), linear-gradient(180deg, rgba(255,255,255,0.94) 0%, rgba(255,252,247,0.98) 58%, #FFFCF7 100%), linear-gradient(rgba(91,79,232,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(180,83,9,0.025) 1px, transparent 1px)",
            backgroundSize: "auto, auto, auto, 34px 34px, 34px 34px",
          }}
        />
        <div className="pointer-events-none absolute bottom-[18%] right-[9%] hidden h-28 w-28 rounded-full border border-[rgba(180,83,9,0.12)] bg-[rgba(255,247,237,0.72)] shadow-[0_24px_54px_rgba(180,83,9,0.08)] lg:block" data-guide-float aria-hidden />

        <div className="relative mx-auto grid w-full max-w-[1220px] gap-10 px-4 pb-14 pt-12 sm:px-6 sm:pt-16 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-12 lg:px-8 lg:pb-20 lg:pt-24">
          <div className="min-w-0">
            <nav className="mb-8 flex flex-wrap items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-[#77716A]" aria-label="Guide navigation" data-guide-reveal>
              <Link href="/" className="rounded-full border border-[rgba(91,79,232,0.12)] bg-[#FFFFFF] px-3 py-1.5 text-[#5B4FE8] no-underline transition hover:bg-[#EDE9FF]">
                Home
              </Link>
              <span aria-hidden>/</span>
              <Link href="/#browse-listings" className="rounded-full border border-[rgba(91,79,232,0.12)] bg-[#FFFFFF] px-3 py-1.5 text-[#5B4FE8] no-underline transition hover:bg-[#EDE9FF]">
                Jobs
              </Link>
              <span aria-hidden>/</span>
              <span className="rounded-full border border-[rgba(91,79,232,0.1)] bg-[#F4F1FF] px-3 py-1.5 text-[#1A1160]">
                Pilot guide
              </span>
            </nav>

            <h1 className="mt-2 mb-0 max-w-4xl text-[clamp(2.75rem,7.2vw,5.9rem)] font-black leading-[0.93] tracking-[-0.065em] text-[#171421]">
              <span className="block overflow-hidden">
                <span className="inline-block" data-guide-line>Become a</span>
              </span>
              <span className="block overflow-hidden text-[#5B4FE8]">
                <span className="inline-block" data-guide-line>drone pilot</span>
              </span>
              <span className="block overflow-hidden">
                <span className="inline-block" data-guide-line>without the noise.</span>
              </span>
            </h1>
            <p className="mt-6 mb-0 max-w-2xl text-base font-semibold leading-7 text-[#665A50] sm:text-lg" data-guide-reveal>
              {positioning}
            </p>

            <div className="mt-8 grid max-w-3xl gap-3 sm:grid-cols-3" data-guide-card-grid>
              {Array.isArray(heroStats) ? heroStats.map((stat, index) => {
                const Icon = statIcons[index] || FiTarget;
                return (
                  <div key={stat.label} data-guide-card className="grid min-h-[94px] grid-cols-[42px_minmax(0,1fr)] items-center gap-3 rounded-[8px] border border-[rgba(91,79,232,0.12)] bg-[rgba(255,255,255,0.74)] p-4 shadow-[0_12px_24px_rgba(28,28,26,0.04)] backdrop-blur-[10px] sm:block sm:min-h-0">
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-[8px] bg-[#EDE9FF] text-[#5B4FE8] sm:h-auto sm:w-auto sm:bg-transparent">
                      <Icon className="h-5 w-5 shrink-0" />
                    </span>
                    <div className="min-w-0">
                      <p className="m-0 text-[0.7rem] font-black uppercase tracking-[0.12em] text-[#77716A] sm:mt-3">{stat.label}</p>
                      <p className="mt-1 mb-0 text-lg font-black tracking-[-0.03em] text-[#171421]">{stat.value}</p>
                    </div>
                  </div>
                );
              }) : null}
            </div>

            <div className="mt-8 flex flex-wrap gap-3" data-guide-reveal>
              <Link href={primaryCta?.primaryHref || "/#browse-listings"} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[8px] bg-[#5B4FE8] px-5 text-sm font-black text-[#FFFFFF] no-underline shadow-[0_16px_30px_rgba(91,79,232,0.18)] transition hover:-translate-y-0.5 hover:bg-[#1A1160]">
                {primaryCta?.primaryLabel || "View Drone Pilot Jobs"}
                <FiArrowRight className="h-4 w-4" />
              </Link>
              <Link href={primaryCta?.secondaryHref || "/companies"} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[8px] border border-[rgba(91,79,232,0.16)] bg-[#FFFFFF] px-5 text-sm font-black text-[#1A1160] no-underline transition hover:bg-[#EDE9FF]">
                {primaryCta?.secondaryLabel || "See Companies Hiring"}
                <FiExternalLink className="h-4 w-4" />
              </Link>
            </div>
          </div>

          <aside className="lg:sticky lg:top-24" data-guide-hero-card>
            <div className="relative overflow-hidden rounded-[8px] border border-[rgba(91,79,232,0.14)] bg-[#FFFFFF] p-5 shadow-[0_24px_54px_rgba(28,28,26,0.08)]">
              <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#5B4FE8,#B45309)]" aria-hidden />
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Eyebrow>Flight plan</Eyebrow>
                  <h2 className="mt-2 mb-0 text-2xl font-black tracking-[-0.04em] text-[#171421]">
                    What to do first
                  </h2>
                </div>
              </div>
              <p className="mt-4 mb-0 text-sm font-semibold leading-7 text-[#514B62]">{quickAnswer}</p>

              <div className="mt-6 grid gap-3" data-guide-stagger>
                {Array.isArray(fastestPath) ? fastestPath.map((item, index) => (
                  <div key={item} data-guide-stagger-item className="grid grid-cols-[34px_minmax(0,1fr)] gap-3 rounded-[8px] border border-[rgba(91,79,232,0.1)] bg-[#FFFCF7] p-3.5">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#5B4FE8] text-xs font-black text-[#FFFFFF]">
                      {index + 1}
                    </span>
                    <div>
                      <p className="m-0 text-xs font-black uppercase tracking-[0.1em] text-[#5B4FE8]">{stepNotes[index] || "Step"}</p>
                      <p className="mt-1 mb-0 text-sm font-black leading-5 text-[#171421]">{item}</p>
                    </div>
                  </div>
                )) : null}
              </div>
            </div>
          </aside>
        </div>
      </section>

      <div className="mx-auto w-full max-w-[1220px] px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        <section className="grid gap-8 lg:grid-cols-[360px_minmax(0,1fr)] lg:gap-12" data-guide-scroll>
          <div className="lg:sticky lg:top-24 lg:self-start">
            <SectionHeader
              eyebrow="Step-by-step"
              title="Follow the flight plan in order"
              description="Each step reveals as you scroll so the path feels manageable. The goal is not to learn everything at once. It is to build proof in the right sequence."
            />
          </div>
          <div className="relative" data-guide-step-list>
            <div className="absolute left-[25px] top-3 hidden h-[calc(100%-24px)] w-px bg-[rgba(91,79,232,0.14)] sm:block" aria-hidden />
            <div className="absolute left-[25px] top-3 hidden h-[calc(100%-24px)] w-px origin-top bg-[#5B4FE8] sm:block" aria-hidden data-guide-rail />
            <div className="grid gap-5">
              {Array.isArray(steps) ? steps.map((step, index) => {
                const Icon = stepIcons[index] || FiCheck;
                return (
                  <article key={step.title} data-guide-step className="relative grid gap-4 rounded-[8px] border border-[rgba(91,79,232,0.12)] bg-[#FFFFFF] p-5 shadow-[0_14px_30px_rgba(28,28,26,0.05)] transition sm:grid-cols-[52px_minmax(0,1fr)]">
                    <span data-guide-step-dot className="relative z-[1] inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#5B4FE8] text-[#FFFFFF] shadow-[0_14px_26px_rgba(91,79,232,0.18)]">
                      <Icon className="h-5 w-5 shrink-0" />
                    </span>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-[#EDE9FF] px-2.5 py-1 text-[0.68rem] font-black uppercase tracking-[0.12em] text-[#5B4FE8]">
                          Step {index + 1}
                        </span>
                        <span className="text-xs font-black uppercase tracking-[0.12em] text-[#77716A]">
                          {stepNotes[index] || "Career move"}
                        </span>
                      </div>
                      <h3 className="mt-3 mb-0 text-2xl font-black tracking-[-0.04em] text-[#171421]">{step.title}</h3>
                      <p className="mt-3 mb-0 max-w-2xl text-sm font-semibold leading-7 text-[#665A50]">{step.detail}</p>
                    </div>
                  </article>
                );
              }) : null}
            </div>
          </div>
        </section>

        <section className="mt-14 grid gap-8 rounded-[8px] border border-[rgba(91,79,232,0.12)] bg-[#FFFFFF] p-5 shadow-[0_18px_36px_rgba(28,28,26,0.05)] sm:p-7 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]" data-guide-scroll data-guide-tilt>
          <SectionHeader
            eyebrow="Hiring signals"
            title="What employers actually look for"
            description="This is the filter. If your resume, portfolio, and outreach show these signals, your applications feel credible instead of generic."
          />
          <div className="grid gap-3" data-guide-stagger>
            {Array.isArray(whatGetsYouHired) ? whatGetsYouHired.map((item) => (
              <div key={item} data-guide-stagger-item className="flex items-start gap-3 rounded-[8px] border border-[rgba(91,79,232,0.1)] bg-[#FFFCF7] px-4 py-3.5">
                <span className="mt-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#EDE9FF] text-[#5B4FE8]">
                  <FiCheck className="h-3 w-3 shrink-0" />
                </span>
                <p className="m-0 text-sm font-bold leading-6 text-[#423B52]">{item}</p>
              </div>
            )) : null}
          </div>
        </section>

        <section className="mt-14" data-guide-scroll>
          <SectionHeader
            eyebrow="Choose your route"
            title="Three realistic ways in"
            description="Pick one starting path. You can switch later, but a focused entry path makes your first 30 days much cleaner."
            center
          />
          <div className="mt-8 grid gap-4 lg:grid-cols-3" data-guide-stagger>
            {Array.isArray(paths) ? paths.map((path) => (
              <article key={path.title} data-guide-stagger-item className={`rounded-[8px] border p-5 shadow-[0_14px_28px_rgba(28,28,26,0.04)] ${path.mostCommon ? "border-[rgba(91,79,232,0.22)] bg-[#F7F4FF]" : "border-[rgba(91,79,232,0.12)] bg-[#FFFFFF]"}`}>
                <div className="flex items-start justify-between gap-3">
                  <h3 className="m-0 text-xl font-black tracking-[-0.03em] text-[#171421]">{path.title}</h3>
                  {path.mostCommon ? (
                    <span className="shrink-0 rounded-full bg-[#EDE9FF] px-2.5 py-1 text-[0.65rem] font-black uppercase tracking-[0.1em] text-[#5B4FE8]">
                      Common
                    </span>
                  ) : null}
                </div>
                <p className="mt-4 mb-0 text-sm font-semibold leading-7 text-[#5A556C]">{path.whoFor}</p>
                <div className="mt-5 grid gap-3 border-t border-[rgba(91,79,232,0.1)] pt-4">
                  <p className="m-0 text-sm font-bold leading-6 text-[#383246]">
                    <span className="text-[#5B4FE8]">Speed:</span> {path.speedToIncome}
                  </p>
                  <p className="m-0 text-sm font-bold leading-6 text-[#383246]">
                    <span className="text-[#5B4FE8]">Risk:</span> {path.riskLevel}
                  </p>
                </div>
              </article>
            )) : null}
          </div>
        </section>

        <section className="mt-14 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          <article className="min-h-[calc(100%+4px)] rounded-[8px] border border-[rgba(91,79,232,0.12)] bg-[#FFFFFF] p-5 shadow-[0_18px_36px_rgba(28,28,26,0.05)] sm:p-7" data-guide-scroll>
            <SectionHeader
              eyebrow={detailedBreakdown?.label || "Detailed guide"}
              title="Reference chapters, without the wall of text"
              description="Open the sections you need. The guide stays scannable, but the deeper advice is still available when you are ready."
            />
            <div className="mt-7 grid gap-3" data-guide-stagger>
              {guideSections.map((section, index) => (
                <details key={section.title} data-guide-stagger-item open={index === 0} className="group rounded-[8px] border border-[rgba(91,79,232,0.12)] bg-[#FFFCF7] p-0 [&_summary::-webkit-details-marker]:hidden">
                  <summary className="flex cursor-pointer list-none items-start justify-between gap-4 px-4 py-4">
                    <div>
                      <p className="m-0 text-[0.7rem] font-black uppercase tracking-[0.14em] text-[#5B4FE8]">Chapter {index + 1}</p>
                      <h3 className="mt-1 mb-0 text-xl font-black tracking-[-0.03em] text-[#171421]">{section.title}</h3>
                    </div>
                    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-[#EDE9FF] text-[#5B4FE8] transition group-open:rotate-90">
                      <FiArrowRight className="h-4 w-4 shrink-0" />
                    </span>
                  </summary>
                  <div className="grid gap-4 border-t border-[rgba(91,79,232,0.1)] px-4 pb-5 pt-4">
                    {Array.isArray(section.parts) ? section.parts.map((part, partIndex) => (
                      <DetailPart key={`${section.title}-${partIndex}`} part={part} />
                    )) : null}
                  </div>
                </details>
              ))}
            </div>
          </article>

          <aside className="lg:sticky lg:top-24 lg:self-start" data-guide-reveal>
            <div className="overflow-hidden rounded-[8px] border border-[rgba(91,79,232,0.12)] bg-[#FFFFFF] shadow-[0_14px_28px_rgba(28,28,26,0.04)]">
              <article className="p-5">
                <Eyebrow>Readiness</Eyebrow>
                <div className="mt-5 grid gap-5">
                  {requirementCards.map((card) => {
                    const Icon = card.icon;
                    return (
                      <section key={card.title}>
                        <div className="flex items-center gap-3">
                          <span className="inline-flex h-10 w-10 items-center justify-center rounded-[8px] bg-[#EDE9FF] text-[#5B4FE8]">
                            <Icon className="h-[18px] w-[18px] shrink-0" />
                          </span>
                          <h3 className="m-0 text-lg font-black tracking-[-0.03em] text-[#171421]">{card.title}</h3>
                        </div>
                        <div className="mt-3">
                          <CheckList items={card.items} compact />
                        </div>
                      </section>
                    );
                  })}
                </div>
              </article>

              <article className="border-t border-[rgba(91,79,232,0.1)] p-5">
                <Eyebrow>Reality check</Eyebrow>
                <div className="mt-4 grid gap-4">
                  <section>
                    <h3 className="m-0 flex items-center gap-2 text-lg font-black tracking-[-0.03em] text-[#171421]">
                    <FiClock className="h-[18px] w-[18px] shrink-0 text-[#5B4FE8]" />
                      Time and cost
                    </h3>
                    <div className="mt-3">
                      <CheckList items={timeAndCost} compact />
                    </div>
                  </section>
                  <section className="border-t border-[rgba(91,79,232,0.1)] pt-4">
                    <h3 className="m-0 flex items-center gap-2 text-lg font-black tracking-[-0.03em] text-[#171421]">
                      <FiFileText className="h-[18px] w-[18px] shrink-0 text-[#5B4FE8]" />
                      Mistakes to avoid
                    </h3>
                    <div className="mt-3">
                      <CheckList items={mistakes} compact />
                    </div>
                  </section>
                </div>
              </article>
            </div>
          </aside>
        </section>

        <section className="mt-14 rounded-[8px] border border-[rgba(91,79,232,0.12)] bg-[#FFFFFF] p-5 shadow-[0_18px_36px_rgba(28,28,26,0.05)] sm:p-7" data-guide-scroll>
          <SectionHeader
            eyebrow="Related roles"
            title="Explore adjacent paths"
            description="Drone pilot work can lead into field operations, mapping, technician roles, and more specialized aviation support roles."
            center
          />
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5" data-guide-stagger>
            {Array.isArray(relatedRoles) ? relatedRoles.map((role) => (
              <Link key={role.href} href={role.href} data-guide-stagger-item className="group flex min-h-[128px] flex-col rounded-[8px] border border-[rgba(91,79,232,0.12)] bg-[#FFFCF7] p-4 text-left no-underline transition hover:-translate-y-0.5 hover:border-[rgba(91,79,232,0.24)] hover:bg-[#FFFFFF]">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-[8px] bg-[#EDE9FF] text-[#5B4FE8] transition group-hover:bg-[#5B4FE8] group-hover:text-[#FFFFFF]">
                  <FiLayers className="h-[18px] w-[18px] shrink-0" />
                </span>
                <h3 className="mt-4 mb-0 text-base font-black leading-snug tracking-[-0.02em] text-[#171421]">{role.label}</h3>
                <p className="mt-auto mb-0 inline-flex items-center gap-2 pt-3 text-sm font-black text-[#5B4FE8]">
                  View path
                  <FiArrowRight className="h-4 w-4 shrink-0 transition group-hover:translate-x-1" />
                </p>
              </Link>
            )) : null}
          </div>
        </section>

        <section className="mt-14 rounded-[8px] border border-[rgba(91,79,232,0.12)] bg-[#FFFFFF] p-5 shadow-[0_18px_36px_rgba(28,28,26,0.05)] sm:p-8" data-guide-scroll>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div>
              <Eyebrow>Next step</Eyebrow>
              <h2 className="mt-3 mb-0 text-3xl font-black tracking-[-0.045em] text-[#171421] sm:text-[2.35rem]">
                {finalCta?.title || "Ready to start?"}
              </h2>
              <p className="mt-4 mb-0 max-w-2xl text-sm font-semibold leading-7 text-[#665A50] sm:text-[0.98rem]">
                {finalCta?.description || "Move from research into active applications and real market proof."}
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link href={finalCta?.primaryHref || "/#browse-listings"} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[8px] bg-[#5B4FE8] px-5 text-sm font-black text-[#FFFFFF] no-underline transition hover:-translate-y-0.5 hover:bg-[#1A1160]">
                {finalCta?.primaryLabel || "View Jobs"}
                <FiBriefcase className="h-4 w-4" />
              </Link>
              <Link href={finalCta?.secondaryHref || "/companies"} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[8px] border border-[rgba(91,79,232,0.16)] bg-[#FFFCF7] px-5 text-sm font-black text-[#1A1160] no-underline transition hover:bg-[#EDE9FF]">
                {finalCta?.secondaryLabel || "Browse Companies"}
                <FiMap className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
