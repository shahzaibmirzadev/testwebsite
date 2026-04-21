import fs from "node:fs/promises";
import path from "node:path";

import * as sectorLogicModule from "../lib/sectorLogic.js";
import * as jobHelpersModule from "../lib/jobFieldHelpers.js";

import { PATHS } from "./config/pipelinePaths.mjs";

const matchesSectorId =
  sectorLogicModule.matchesSectorId ||
  sectorLogicModule.default?.matchesSectorId;

const SECTOR_RULES =
  sectorLogicModule.SECTOR_RULES ||
  sectorLogicModule.default?.SECTOR_RULES ||
  {};

const getJobFamily =
  jobHelpersModule.getJobFamily ||
  jobHelpersModule.default?.getJobFamily;

const JOBS_MASTER_PATH = path.join(process.cwd(), PATHS.jobsMaster);
const AMBIGUITY_THRESHOLD = 4;
const MAX_ROWS = 30;

function readText(v) {
  return String(v || "").trim();
}

function jobSectorHits(job) {
  const sectors = Object.keys(SECTOR_RULES);
  return sectors.filter((id) => {
    try {
      return matchesSectorId(job, id);
    } catch {
      return false;
    }
  });
}

function scoreAmbiguity(job, matchedSectors) {
  const title = readText(job?.title).toLowerCase();
  const family = readText(getJobFamily(job)).toLowerCase();
  const base = matchedSectors.length;
  const titleHasManager = /\bmanager\b|\bdirector\b|\blead\b/.test(title);
  const familyIsOther = !family || family === "other";
  return base + (titleHasManager ? 0.5 : 0) + (familyIsOther ? 0.5 : 0);
}

async function loadJobs() {
  const raw = await fs.readFile(JOBS_MASTER_PATH, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) return [];
  return parsed;
}

function printSectionHeader(label) {
  console.log("");
  console.log("=".repeat(72));
  console.log(label);
  console.log("=".repeat(72));
}

function printRows(rows) {
  for (const row of rows) {
    console.log(
      [
        `score=${row.score.toFixed(1)}`,
        `sectors=[${row.matchedSectors.join(", ")}]`,
        `family=${row.family || "other"}`,
        `company=${row.company || "unknown"}`,
        `title=${row.title || "untitled"}`,
      ].join(" | ")
    );
  }
}

async function main() {
  if (typeof matchesSectorId !== "function") {
    throw new Error("matchesSectorId is not available from lib/sectorLogic.js");
  }
  if (typeof getJobFamily !== "function") {
    throw new Error("getJobFamily is not available from lib/jobFieldHelpers.js");
  }

  const jobs = await loadJobs();
  const active = jobs.filter((j) => j?.is_active !== false);

  const rows = active.map((job) => {
    const matchedSectors = jobSectorHits(job);
    return {
      title: readText(job?.title),
      company: readText(job?.company),
      family: readText(getJobFamily(job)).toLowerCase(),
      matchedSectors,
      matchedCount: matchedSectors.length,
      score: scoreAmbiguity(job, matchedSectors),
    };
  });

  const ambiguous = rows
    .filter((r) => r.matchedCount >= AMBIGUITY_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_ROWS);

  const uncategorized = rows
    .filter((r) => r.matchedCount === 0)
    .slice(0, MAX_ROWS);

  const distribution = Object.keys(SECTOR_RULES).map((id) => ({
    id,
    count: rows.filter((r) => r.matchedSectors.includes(id)).length,
  }));

  printSectionHeader("Classification Report");
  console.log(`total_jobs=${jobs.length} | active_jobs=${active.length}`);
  console.log(`ambiguity_threshold=${AMBIGUITY_THRESHOLD} | max_rows=${MAX_ROWS}`);

  printSectionHeader("Sector Distribution");
  for (const item of distribution) {
    console.log(`${item.id}: ${item.count}`);
  }

  printSectionHeader(`Highly Ambiguous Jobs (>= ${AMBIGUITY_THRESHOLD} sector hits)`);
  if (!ambiguous.length) {
    console.log("none");
  } else {
    printRows(ambiguous);
  }

  printSectionHeader("Uncategorized Jobs (0 sector hits)");
  if (!uncategorized.length) {
    console.log("none");
  } else {
    printRows(uncategorized);
  }
}

main().catch((error) => {
  console.error(String(error?.message || error));
  process.exit(1);
});
