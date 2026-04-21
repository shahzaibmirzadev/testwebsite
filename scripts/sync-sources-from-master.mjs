import fs from "fs/promises";
import path from "path";

const REPO_ROOT = process.cwd();
const PARENT_ROOT = path.join(REPO_ROOT, "..");

const FILES = [
  "sources.csv",
  "source_performance.csv",
];

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function copyIfPresent(fileName) {
  const masterPath = path.join(PARENT_ROOT, fileName);
  const repoPath = path.join(REPO_ROOT, fileName);
  const exists = await fileExists(masterPath);
  if (!exists) {
    return { fileName, copied: false, reason: "missing_master_file" };
  }

  const content = await fs.readFile(masterPath);
  await fs.writeFile(repoPath, content);
  return { fileName, copied: true, bytes: content.length };
}

async function countCsvRows(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const rows = String(raw)
      .replace(/^\uFEFF/, "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    return Math.max(0, rows.length - 1);
  } catch {
    return null;
  }
}

async function run() {
  const results = [];
  for (const fileName of FILES) {
    // Sequential copy keeps logs deterministic and easier to debug.
    // eslint-disable-next-line no-await-in-loop
    results.push(await copyIfPresent(fileName));
  }

  const repoSourcesRows = await countCsvRows(path.join(REPO_ROOT, "sources.csv"));
  const masterSourcesRows = await countCsvRows(path.join(PARENT_ROOT, "sources.csv"));

  console.log(
    JSON.stringify(
      {
        ok: true,
        repoRoot: REPO_ROOT,
        parentRoot: PARENT_ROOT,
        copied: results,
        counts: {
          repoSourcesRows,
          masterSourcesRows,
        },
      },
      null,
      2
    )
  );
}

run().catch((error) => {
  console.error(String(error?.message || error));
  process.exit(1);
});
