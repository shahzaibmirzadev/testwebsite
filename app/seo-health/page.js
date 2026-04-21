import { notFound } from "next/navigation";
import { getJobsList } from "@/lib/jobs";
import { getJobSeoHealth } from "@/lib/seoHealth";
import { jobSlug } from "@/lib/slug";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "SEO Health",
  alternates: { canonical: "/seo-health" },
  robots: { index: false, follow: false },
};

function pct(part, total) {
  if (!total) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}

export default async function SeoHealthPage({ searchParams }) {
  const params = await searchParams;
  const requiredKey = process.env.SEO_HEALTH_KEY;
  const providedKey = String(params?.key || "");

  // Hide this endpoint completely unless the correct key is provided.
  if (!requiredKey || !providedKey || providedKey !== requiredKey) {
    notFound();
  }

  const jobs = await getJobsList();
  const rows = jobs.map((job) => {
    const health = getJobSeoHealth(job);
    return {
      id: String(job.id || ""),
      slug: jobSlug(job),
      title: String(job.title || "").trim(),
      company: String(job.company || "").trim(),
      issues: health.issues,
      indexable: health.isIndexable,
      descriptionLength: health.descriptionLength,
    };
  });

  const total = rows.length;
  const indexable = rows.filter((r) => r.indexable).length;
  const excluded = total - indexable;

  const issueCounts = new Map();
  for (const row of rows) {
    for (const issue of row.issues) {
      issueCounts.set(issue, (issueCounts.get(issue) || 0) + 1);
    }
  }

  const topIssues = [...issueCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const sampleExcluded = rows.filter((r) => !r.indexable).slice(0, 50);

  return (
    <main className={"[min-height:100vh] [background:#f5f7fb] [padding:26px_14px_72px]"}>
      <div className={"[max-width:720px] [margin:0_auto] [padding:32px_16px_64px] [background:#fff] [min-height:100vh] [max-width:920px] [padding:30px_34px_40px] [border:1px_solid_#e7ebf3] [border-radius:14px] [box-shadow:0_20px_40px_rgba(15,_23,_42,_0.04)] [min-height:auto] max-[900px]:[padding:22px_16px_28px]"} style={{ maxWidth: 1100 }}>
        <h1 className={"[margin:0_0_8px] [font-size:1.75rem] [line-height:1.25] font-bold [color:#f8fafc] [font-size:clamp(2rem,_3.2vw,_2.65rem)] [line-height:1.14] [letter-spacing:-0.03em]"}>SEO Health Report</h1>
        <p className={"[margin:0_0_12px] [font-size:0.875rem] [color:#6b7280] [color:#f8fafc] [opacity:0.9]"}>Private quality overview for indexable job pages.</p>

        <section className={"[border:1px_solid_#e8edf5] [border-radius:12px] [padding:22px_24px] [background:#fff] max-[900px]:[padding:16px_14px] [margin-top:0]"} style={{ marginTop: 16 }}>
          <div style={{ display: "grid", gap: 8 }}>
            <p style={{ margin: 0 }}><strong>Total jobs:</strong> {total}</p>
            <p style={{ margin: 0 }}><strong>Indexable:</strong> {indexable} ({pct(indexable, total)})</p>
            <p style={{ margin: 0 }}><strong>Excluded:</strong> {excluded} ({pct(excluded, total)})</p>
          </div>
        </section>

        <section className={"[border:1px_solid_#e8edf5] [border-radius:12px] [padding:22px_24px] [background:#fff] max-[900px]:[padding:16px_14px] [margin-top:0]"} style={{ marginTop: 16 }}>
          <h2 style={{ marginTop: 0 }}>Top exclusion reasons</h2>
          {topIssues.length === 0 ? (
            <p style={{ marginBottom: 0 }}>No exclusion issues found.</p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {topIssues.map(([issue, count]) => (
                <li key={issue}>
                  <strong>{issue}</strong>: {count}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={"[border:1px_solid_#e8edf5] [border-radius:12px] [padding:22px_24px] [background:#fff] max-[900px]:[padding:16px_14px] [margin-top:0]"} style={{ marginTop: 16 }}>
          <h2 style={{ marginTop: 0 }}>Sample excluded jobs</h2>
          {sampleExcluded.length === 0 ? (
            <p style={{ marginBottom: 0 }}>None. All current jobs pass the SEO quality gate.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.92rem" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb", padding: "8px 6px" }}>Title</th>
                    <th style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb", padding: "8px 6px" }}>Company</th>
                    <th style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb", padding: "8px 6px" }}>Description len</th>
                    <th style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb", padding: "8px 6px" }}>Issues</th>
                  </tr>
                </thead>
                <tbody>
                  {sampleExcluded.map((row) => (
                    <tr key={row.id || row.slug || row.title}>
                      <td style={{ borderBottom: "1px solid #f1f5f9", padding: "8px 6px" }}>{row.title || "Untitled"}</td>
                      <td style={{ borderBottom: "1px solid #f1f5f9", padding: "8px 6px" }}>{row.company || "Unknown"}</td>
                      <td style={{ borderBottom: "1px solid #f1f5f9", padding: "8px 6px" }}>{row.descriptionLength}</td>
                      <td style={{ borderBottom: "1px solid #f1f5f9", padding: "8px 6px" }}>{row.issues.join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

