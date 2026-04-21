import { NextResponse } from "next/server";
import { getJobsList } from "@/lib/jobs";
import { getSourcesCsvRowCount } from "@/lib/trackedCompanies";

function isValidHttpUrl(value) {
  try {
    const u = new URL(String(value || "").trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export async function GET() {
  try {
    const jobs = await getJobsList();
    const trackedSources = await getSourcesCsvRowCount();
    const activeJobs = jobs.length;
    const missingApplyUrl = jobs.filter((job) => !String(job?.apply_url || "").trim()).length;
    const invalidApplyUrl = jobs.filter((job) => {
      const url = String(job?.apply_url || "").trim();
      if (!url) return false;
      return !isValidHttpUrl(url);
    }).length;
    const postedLast24h = jobs.filter((job) => {
      const ts = Date.parse(String(job?.posted_at || job?.created_at || ""));
      if (!Number.isFinite(ts)) return false;
      return Date.now() - ts <= 24 * 60 * 60 * 1000;
    }).length;

    return NextResponse.json(
      {
        ok: true,
        generatedAt: new Date().toISOString(),
        metrics: {
          activeJobs,
          trackedSources,
          postedLast24h,
          missingApplyUrl,
          invalidApplyUrl,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: String(error?.message || error) },
      { status: 500 }
    );
  }
}
