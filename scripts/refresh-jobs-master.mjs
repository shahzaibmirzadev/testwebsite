import fs from "fs/promises";
import path from "path";
import { createClient } from "@supabase/supabase-js";

import { PATHS } from "./config/pipelinePaths.mjs";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ROOT_DIR = process.cwd();
const OUT_PATH = path.join(ROOT_DIR, PATHS.jobsMaster);
const PAGE_SIZE = 500;
const MAX_ROWS = 5000;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const jobs = [];
  let from = 0;

  while (jobs.length < MAX_ROWS) {
    const to = Math.min(from + PAGE_SIZE - 1, MAX_ROWS - 1);
    const { data, error } = await supabase
      .from("jobs")
      .select("*")
      .eq("is_active", true)
      .order("posted_at", { ascending: false })
      .range(from, to);

    if (error) {
      throw new Error(`Failed to fetch jobs snapshot: ${error.message}`);
    }

    const rows = Array.isArray(data) ? data : [];
    if (rows.length === 0) break;
    jobs.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    total: jobs.length,
    jobs,
  };

  await fs.writeFile(OUT_PATH, JSON.stringify(payload, null, 2), "utf8");
  console.log(`Wrote ${jobs.length} active jobs to data/jobs-master.json`);
}

run().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
