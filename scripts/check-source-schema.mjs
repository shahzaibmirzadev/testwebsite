import fs from "fs/promises";
import path from "path";

const SOURCES_PATH = path.join(process.cwd(), "sources.csv");
const REQUIRED = ["ats", "slug", "company_name", "status"];
const RECOMMENDED = ["company_website", "company_size", "hq_location"];

function parseLines(raw) {
  return String(raw || "")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

async function run() {
  const raw = await fs.readFile(SOURCES_PATH, "utf8");
  const lines = parseLines(raw);
  if (!lines.length) {
    throw new Error("sources.csv is empty.");
  }

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const missingRequired = REQUIRED.filter((h) => !headers.includes(h));
  const missingRecommended = RECOMMENDED.filter((h) => !headers.includes(h));

  if (missingRequired.length) {
    throw new Error(`Missing required sources.csv columns: ${missingRequired.join(", ")}`);
  }

  if (missingRecommended.length) {
    console.warn(`Missing recommended sources.csv columns: ${missingRecommended.join(", ")}`);
  } else {
    console.log("All recommended sources.csv columns are present.");
  }

  console.log(`sources.csv rows (excluding header): ${Math.max(0, lines.length - 1)}`);
}

run().catch((error) => {
  console.error(String(error?.message || error));
  process.exit(1);
});
