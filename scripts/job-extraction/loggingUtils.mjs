/**
 * Structured pipeline summaries (JSON files under data/) — no dashboard.
 */
import fs from "fs/promises";
import path from "path";

const REPO = process.cwd();

/**
 * @param {string} relativePath — repo-root-relative path (e.g. PATHS.summaryExtractHtml)
 * @param {Record<string, unknown>} payload
 */
export async function writeStageSummary(relativePath, payload) {
  const p = path.join(REPO, relativePath);
  const body = {
    generated_at: new Date().toISOString(),
    ...payload,
  };
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(body, null, 2), "utf8");
  return p;
}

/**
 * @param {string} line
 */
export function logLine(line) {
  console.log(line);
}
