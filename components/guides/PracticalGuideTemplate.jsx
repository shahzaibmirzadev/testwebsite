import Link from "next/link";

function BulletList({ items, className }) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return (
    <ul className={className}>
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function MicroLabel({ children }) {
  return <p className="guide-micro-label">{children}</p>;
}

function DetailedReadingBlock({ part }) {
  if (part.type === "p") {
    return <p>{part.text}</p>;
  }
  if (part.type === "ul") {
    return (
      <ul className="guide-detailed-list">
        {part.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    );
  }
  return null;
}

export default function PracticalGuideTemplate({
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
  return (
    <main className="guide-template-page">
      <article className="guide-template-inner">
        <nav className="guide-template-nav" aria-label="Guide navigation">
          <Link href="/">Browse Jobs</Link>
          <span aria-hidden>•</span>
          <Link href="/#browse-listings">Live Listings</Link>
        </nav>

        {/* 1. Hero — decision block */}
        <section className="guide-hero-block" aria-label="Introduction">
          <h1 className="guide-hero-title">{title}</h1>
          <p className="guide-hero-positioning">{positioning}</p>
          <div className="guide-quick-answer-wrap">
            <div className="guide-quick-answer-box">
              <h2 className="guide-quick-answer-heading">Quick answer</h2>
              <p className="guide-quick-answer-text">{quickAnswer}</p>
            </div>
          </div>
          <div className="guide-hero-stats guide-hero-stats--inline" role="list">
            {Array.isArray(heroStats)
              ? heroStats.map((stat) => (
                  <div key={stat.label} className="guide-stat-inline" role="listitem">
                    <span className="guide-stat-label">{stat.label}</span>
                    <span className="guide-stat-value">{stat.value}</span>
                  </div>
                ))
              : null}
          </div>
          <div className="guide-hero-cta">
            <Link className="guide-template-primary-cta guide-cta--hero" href="/#browse-listings">
              View Drone Pilot Jobs
            </Link>
          </div>
        </section>

        {/* 2. Fastest path — shortcut strip */}
        <section
          className="guide-section-band guide-section-band--muted"
          aria-labelledby="fastest-path-heading"
        >
          <MicroLabel>Fastest route</MicroLabel>
          <h2 id="fastest-path-heading">Fastest path to getting hired</h2>
          <ol className="guide-fastest-track">
            {Array.isArray(fastestPath)
              ? fastestPath.map((line, index) => (
                  <li key={line}>
                    <span className="guide-fastest-step-num" aria-hidden>
                      {index + 1}
                    </span>
                    <span className="guide-fastest-step-text">{line}</span>
                  </li>
                ))
              : null}
          </ol>
        </section>

        {/* 3. What actually gets you hired */}
        <section className="guide-hired-block guide-section-band guide-section-band--dark" aria-labelledby="hired-heading">
          <MicroLabel>What matters to employers</MicroLabel>
          <h2 id="hired-heading">What actually gets you hired</h2>
          <BulletList items={whatGetsYouHired} />
        </section>

        {/* 4. Paths */}
        <section className="guide-section-band guide-section-band--light" aria-labelledby="paths-heading">
          <MicroLabel>Choose your path</MicroLabel>
          <h2 id="paths-heading">Paths into the role</h2>
          <div className="guide-card-grid guide-card-grid--three">
            {Array.isArray(paths)
              ? paths.map((path) => (
                  <article
                    key={path.title}
                    className={`guide-info-card${path.mostCommon ? " guide-info-card--featured" : ""}`}
                  >
                    <div className="guide-path-card-head">
                      <h3>{path.title}</h3>
                      {path.mostCommon ? (
                        <span className="guide-path-badge">Most common path</span>
                      ) : null}
                    </div>
                    <div className="guide-path-card-body">
                      <p>
                        <strong>Who it&apos;s for:</strong> {path.whoFor}
                      </p>
                      <p>
                        <strong>Speed to income:</strong> {path.speedToIncome}
                      </p>
                      <p>
                        <strong>Risk level:</strong> {path.riskLevel}
                      </p>
                    </div>
                  </article>
                ))
              : null}
          </div>
        </section>

        {/* 5. Step-by-step */}
        <section className="guide-section-band guide-section-band--muted" aria-labelledby="steps-heading">
          <MicroLabel>Execution plan</MicroLabel>
          <h2 id="steps-heading">Step-by-step process</h2>
          <ol className="guide-checklist guide-checklist--process">
            {Array.isArray(steps)
              ? steps.map((step, index) => (
                  <li key={step.title}>
                    <span className="guide-step-circle" aria-hidden>
                      {index + 1}
                    </span>
                    <span className="guide-step-body">
                      <strong className="guide-step-action">{step.title}</strong>
                      <span className="guide-step-detail">{step.detail}</span>
                    </span>
                  </li>
                ))
              : null}
          </ol>
        </section>

        {/* Deep-dive reading layer */}
        {Array.isArray(detailedBreakdown?.sections) && detailedBreakdown.sections.length > 0 ? (
          <section
            className="guide-section-band guide-section-band--light guide-detailed-breakdown"
            aria-labelledby="detailed-breakdown-heading"
          >
            <p className="guide-detailed-label">{detailedBreakdown.label || "Detailed guide"}</p>
            <h2 id="detailed-breakdown-heading">{detailedBreakdown.heading || "Detailed breakdown"}</h2>
            {detailedBreakdown.sections.map((sec) => (
              <div key={sec.title} className="guide-detailed-subsection">
                <h3>{sec.title}</h3>
                {Array.isArray(sec.parts)
                  ? sec.parts.map((part, i) => (
                      <DetailedReadingBlock key={`${sec.title}-${i}`} part={part} />
                    ))
                  : null}
              </div>
            ))}
          </section>
        ) : null}

        {/* Primary CTA */}
        <section className="guide-primary-cta-band" aria-label="Primary call to action">
          <h2>{primaryCta?.title}</h2>
          {primaryCta?.urgencyLine ? (
            <p className="guide-primary-cta-urgency">{primaryCta.urgencyLine}</p>
          ) : null}
          <div className="guide-template-cta-actions guide-template-cta-actions--large">
            <Link className="guide-template-primary-cta guide-cta--primary-band" href={primaryCta?.primaryHref || "/#browse-listings"}>
              {primaryCta?.primaryLabel || "View Drone Pilot Jobs"}
            </Link>
            <Link
              className="guide-template-secondary-cta guide-cta--primary-band-secondary"
              href={primaryCta?.secondaryHref || "/companies"}
            >
              {primaryCta?.secondaryLabel || "See Companies Hiring"}
            </Link>
          </div>
        </section>

        {/* Requirements */}
        <section className="guide-section-band guide-section-band--light" aria-labelledby="req-heading">
          <h2 id="req-heading">Requirements</h2>
          <div className="guide-card-grid guide-card-grid--three">
            <article className="guide-info-card guide-info-card--soft">
              <h3>Certifications</h3>
              <BulletList items={requirements?.certifications} />
            </article>
            <article className="guide-info-card guide-info-card--soft">
              <h3>Skills</h3>
              <BulletList items={requirements?.skills} />
            </article>
            <article className="guide-info-card guide-info-card--soft">
              <h3>Legal</h3>
              <BulletList items={requirements?.legal} />
            </article>
          </div>
        </section>

        {/* Time & cost */}
        <section className="guide-section-band guide-section-band--muted" aria-labelledby="time-cost-heading">
          <h2 id="time-cost-heading">Time &amp; cost</h2>
          <BulletList items={timeAndCost} className="guide-plain-list" />
        </section>

        {/* Common mistakes */}
        <section className="guide-section-band guide-section-band--light" aria-labelledby="mistakes-heading">
          <h2 id="mistakes-heading">Common mistakes</h2>
          <BulletList items={mistakes} className="guide-plain-list" />
        </section>

        {/* Related roles */}
        <section className="guide-section-band guide-section-band--muted" aria-labelledby="related-heading">
          <h2 id="related-heading">Related roles</h2>
          <div className="guide-card-grid guide-card-grid--roles">
            {Array.isArray(relatedRoles)
              ? relatedRoles.map((role) => (
                  <div key={role.href} className="guide-role-tile">
                    <Link href={role.href}>{role.label}</Link>
                  </div>
                ))
              : null}
          </div>
        </section>

        {/* Final CTA */}
        <section className="guide-final-cta guide-section-band guide-section-band--light" aria-label="Final call to action">
          <h2>{finalCta?.title}</h2>
          <p>{finalCta?.description}</p>
          <div className="guide-template-cta-actions">
            <Link className="guide-template-primary-cta" href={finalCta?.primaryHref || "/#browse-listings"}>
              {finalCta?.primaryLabel || "View Jobs"}
            </Link>
            <Link className="guide-template-secondary-cta" href={finalCta?.secondaryHref || "/companies"}>
              {finalCta?.secondaryLabel || "Browse Companies"}
            </Link>
          </div>
        </section>
      </article>
    </main>
  );
}