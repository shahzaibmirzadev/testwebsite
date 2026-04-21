import fs from "fs/promises";
import path from "path";

import { PATHS } from "./config/pipelinePaths.mjs";

const ROOT = process.cwd();
const SNAPSHOT_PATH = path.join(ROOT, PATHS.jobsMaster);
const OUTPUT_PATH = path.join(ROOT, PATHS.opsHealth);

/** Fail CI if active jobs drop more than this fraction vs last committed snapshot. */
const MAX_DROP_FRACTION = 0.2;

async function readJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function run() {
  const snapshot = await readJson(SNAPSHOT_PATH, { jobs: [] });
  const previous = await readJson(OUTPUT_PATH, null);
  const jobs = Array.isArray(snapshot?.jobs) ? snapshot.jobs : [];
  const activeJobs = jobs.length;

  const oldJobs = Number(previous?.metrics?.activeJobs);
  if (oldJobs > 0) {
    const minAllowed = oldJobs * (1 - MAX_DROP_FRACTION);
    if (activeJobs < minAllowed) {
      throw new Error(
        `ALERT_ACTIVE_JOBS_DROP: active jobs dropped from ${oldJobs} to ${activeJobs} (>${MAX_DROP_FRACTION * 100}%).`
      );
    }
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    metrics: { activeJobs },
  };
  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(payload, null, 2) + "\n", "utf8");
  console.log(`ops-health: ok activeJobs=${activeJobs}`);
}

run().catch((error) => {
  console.error(String(error?.message || error));
  process.exit(1);
});
