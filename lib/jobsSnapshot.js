import fs from "fs/promises";
import path from "path";

const SNAPSHOT_PATH = path.join(
  /* turbopackIgnore: true */ process.cwd(),
  "data",
  "jobs-master.json"
);

const cacheKey = "__jobsSnapshotCache";
const cache = globalThis[cacheKey] || {
  jobs: [],
  loadedAt: 0,
};
globalThis[cacheKey] = cache;

export async function loadJobsSnapshot() {
  if (cache.jobs.length > 0) return cache.jobs;
  try {
    const raw = await fs.readFile(SNAPSHOT_PATH, "utf8");
    const parsed = JSON.parse(raw);
    const jobs = Array.isArray(parsed?.jobs) ? parsed.jobs : [];
    cache.jobs = jobs;
    cache.loadedAt = Date.now();
    return jobs;
  } catch {
    return [];
  }
}
