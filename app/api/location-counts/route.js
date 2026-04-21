import { NextResponse } from "next/server";
import { getSearchableActiveJobs } from "@/lib/jobs";
import { buildLocationSlugCounts } from "@/lib/locationPages";

const SEARCH_RESPONSE_LIMIT = Number(process.env.SEARCH_RESPONSE_LIMIT || 5000);

export async function GET() {
  try {
    const jobs = await getSearchableActiveJobs(SEARCH_RESPONSE_LIMIT);
    const counts = buildLocationSlugCounts(jobs);
    return NextResponse.json({ ok: true, counts }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: String(error?.message || error), counts: {} },
      { status: 500 }
    );
  }
}
