import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..", "..");

/**
 * @param {string} absPath
 * @returns {Promise<{ version: number, queries: { q: string, executedAt: string }[] }>}
 */
export async function loadQueryLog(absPath) {
  try {
    const raw = await fs.readFile(absPath, "utf8");
    const j = JSON.parse(raw);
    const queries = Array.isArray(j.queries) ? j.queries : [];
    return { version: Number(j.version) || 1, queries };
  } catch (e) {
    if (e && /** @type {any} */ (e).code === "ENOENT") {
      return { version: 1, queries: [] };
    }
    throw e;
  }
}

/**
 * @param {string} absPath
 * @param {{ q: string, executedAt: string }[]} entries
 */
export async function saveQueryLogMerged(absPath, entries) {
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  const payload = {
    version: 1,
    updatedAt: new Date().toISOString(),
    queries: entries,
  };
  await fs.writeFile(absPath, JSON.stringify(payload, null, 2), "utf8");
}

/**
 * @param {{ q: string, executedAt: string }[]} existing
 * @param {{ q: string, executedAt: string }[]} toAppend
 */
export function mergeQueryLogEntries(existing, toAppend) {
  /** @type {Map<string, { q: string, executedAt: string }>} */
  const byQ = new Map();
  for (const row of existing) {
    const k = String(row.q || "").trim();
    if (k) byQ.set(k, row);
  }
  for (const row of toAppend) {
    const k = String(row.q || "").trim();
    if (k && !byQ.has(k)) byQ.set(k, row);
  }
  return Array.from(byQ.values());
}

/**
 * @param {string} absPath
 * @returns {Promise<Set<string>>}
 */
export async function loadSeenSet(absPath) {
  try {
    const raw = await fs.readFile(absPath, "utf8");
    const j = JSON.parse(raw);
    const keys = Array.isArray(j.keys) ? j.keys : [];
    return new Set(keys.map((k) => String(k).trim().toLowerCase()).filter(Boolean));
  } catch (e) {
    if (e && /** @type {any} */ (e).code === "ENOENT") {
      return new Set();
    }
    throw e;
  }
}

/**
 * @param {string} absPath
 * @param {Set<string>} keys
 */
export async function saveSeenSet(absPath, keys) {
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  const payload = {
    version: 1,
    updatedAt: new Date().toISOString(),
    keys: Array.from(keys.values()).sort(),
  };
  await fs.writeFile(absPath, JSON.stringify(payload, null, 2), "utf8");
}

/**
 * @param {Set<string>} base
 * @param {Iterable<string>} add
 */
export function mergeSeenSets(base, add) {
  for (const k of add) {
    const t = String(k || "").trim().toLowerCase();
    if (t) base.add(t);
  }
  return base;
}

export { REPO_ROOT };
