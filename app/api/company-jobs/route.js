import { NextResponse } from "next/server";
import { getActiveJobsForCompanyName } from "@/lib/jobs";

const MAX_LIMIT = 100;

function asInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const companyName = String(searchParams.get("companyName") || "").trim();
    if (!companyName || companyName.length > 240) {
      return NextResponse.json({ ok: false, error: "invalid_company" }, { status: 400 });
    }
    const offset = Math.max(0, asInt(searchParams.get("offset"), 0));
    const limit = Math.min(MAX_LIMIT, Math.max(1, asInt(searchParams.get("limit"), 40)));

    const jobs = await getActiveJobsForCompanyName(companyName, { limit, offset });

    return NextResponse.json(
      {
        ok: true,
        jobs,
        offset,
        limit,
        count: jobs.length,
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
