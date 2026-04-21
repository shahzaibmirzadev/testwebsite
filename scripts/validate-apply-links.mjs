import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const PAGE_SIZE = Number(process.env.APPLY_CHECK_PAGE_SIZE || 200);
const MAX_ROWS = Number(process.env.APPLY_CHECK_MAX_ROWS || 1500);
const REQUEST_TIMEOUT_MS = Number(process.env.APPLY_CHECK_TIMEOUT_MS || 10000);
const CONCURRENCY = Number(process.env.APPLY_CHECK_CONCURRENCY || 8);
const FAIL_THRESHOLD = 2;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const BAD_TEXT_MARKERS = [
  "job not found",
  "this job is no longer available",
  "position no longer available",
  "position has been filled",
  "404",
  "not found",
];

function parseFailCount(lastError) {
  const match = String(lastError || "").match(/apply-check fail_count=(\d+)/i);
  if (!match) return 0;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : 0;
}

function isGenericLanding(urlText) {
  try {
    const u = new URL(String(urlText || ""));
    const path = u.pathname.replace(/\/+$/, "");
    const parts = path.split("/").filter(Boolean);
    if (parts.length === 0) return true;
    if (parts.length === 1 && ["jobs", "careers", "positions"].includes(parts[0].toLowerCase())) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

async function checkApplyUrl(urlText) {
  const url = String(urlText || "").trim();
  if (!url) return { ok: false, reason: "missing_apply_url" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "DroneRolesApplyLinkChecker/1.0",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    const statusOk = (res.status >= 200 && res.status < 300) || (res.status >= 300 && res.status < 400);
    if (!statusOk) {
      return { ok: false, reason: `status_${res.status}` };
    }

    if (isGenericLanding(res.url)) {
      return { ok: false, reason: "generic_landing_url" };
    }

    const contentType = String(res.headers.get("content-type") || "").toLowerCase();
    if (contentType.includes("text/html") || contentType.includes("application/xhtml+xml") || !contentType) {
      const raw = await res.text();
      const text = raw.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").toLowerCase();
      const hasBadMarker = BAD_TEXT_MARKERS.some((m) => text.includes(m));
      if (hasBadMarker) {
        return { ok: false, reason: "not_found_or_closed_marker" };
      }
    }

    return { ok: true };
  } catch (err) {
    const message = String(err?.name || err?.message || "request_error").toLowerCase();
    if (message.includes("abort")) return { ok: false, reason: "timeout" };
    return { ok: false, reason: "request_error" };
  } finally {
    clearTimeout(timer);
  }
}

async function runPool(items, worker, concurrency) {
  const out = [];
  let idx = 0;

  async function runner() {
    while (idx < items.length) {
      const current = idx++;
      out[current] = await worker(items[current], current);
    }
  }

  const n = Math.max(1, Math.min(concurrency, items.length || 1));
  await Promise.all(Array.from({ length: n }, () => runner()));
  return out;
}

async function loadActiveJobs() {
  const rows = [];
  let from = 0;
  while (rows.length < MAX_ROWS) {
    const to = Math.min(from + PAGE_SIZE - 1, MAX_ROWS - 1);
    const { data, error } = await supabase
      .from("jobs")
      .select("id, title, company, apply_url, is_active, fetch_status, last_error")
      .eq("is_active", true)
      .order("last_seen_at", { ascending: false })
      .range(from, to);

    if (error) {
      throw new Error(`Failed loading active jobs: ${error.message}`);
    }

    const batch = Array.isArray(data) ? data : [];
    if (batch.length === 0) break;
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows.slice(0, MAX_ROWS);
}

async function run() {
  const jobs = await loadActiveJobs();
  console.log(`Apply-link validation scanning ${jobs.length} active jobs.`);

  let okCount = 0;
  let softFailCount = 0;
  let deactivatedCount = 0;
  let updateErrors = 0;

  const results = await runPool(
    jobs,
    async (job) => {
      const check = await checkApplyUrl(job.apply_url);
      return { job, check };
    },
    CONCURRENCY
  );

  for (const { job, check } of results) {
    if (check.ok) {
      okCount += 1;
      if (/apply-check fail_count=/i.test(String(job.last_error || ""))) {
        const { error } = await supabase
          .from("jobs")
          .update({ last_error: null })
          .eq("id", job.id);
        if (error) updateErrors += 1;
      }
      continue;
    }

    const prevFailCount = parseFailCount(job.last_error);
    const nextFailCount = prevFailCount + 1;
    const stamp = new Date().toISOString();
    const failMessage = `apply-check fail_count=${nextFailCount}; reason=${check.reason}; checked_at=${stamp}`;

    if (nextFailCount >= FAIL_THRESHOLD) {
      const { error } = await supabase
        .from("jobs")
        .update({
          is_active: false,
          fetch_status: "apply-link-invalid",
          last_error: failMessage,
        })
        .eq("id", job.id);
      if (error) {
        updateErrors += 1;
      } else {
        deactivatedCount += 1;
      }
    } else {
      const { error } = await supabase
        .from("jobs")
        .update({ last_error: failMessage })
        .eq("id", job.id);
      if (error) {
        updateErrors += 1;
      } else {
        softFailCount += 1;
      }
    }
  }

  console.log(
    `Apply-link validation complete. healthy=${okCount}, soft_fails=${softFailCount}, deactivated=${deactivatedCount}, update_errors=${updateErrors}`
  );
}

run().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});

