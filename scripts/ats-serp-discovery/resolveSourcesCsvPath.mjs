/**
 * Single place to resolve the ATS Serp discovery sources.csv write/read target.
 * Override: config.sourcesCsvWritePath or env ATS_SERP_SOURCES_CSV_WRITE (absolute or relative to repo root).
 */
import path from "path";
import { PATHS } from "../config/pipelinePaths.mjs";

/**
 * @param {{ sourcesCsvWritePath?: string } | null | undefined} config
 * @param {string} repoRoot
 * @param {{ ATS_SERP_SOURCES_CSV_WRITE?: string }} [env]
 */
export function resolveSourcesCsvWritePath(config, repoRoot, env = process.env) {
  const raw =
    (config && config.sourcesCsvWritePath) || env.ATS_SERP_SOURCES_CSV_WRITE || "";
  const t = String(raw).trim();
  if (t) {
    if (path.isAbsolute(t)) return path.resolve(t);
    return path.resolve(path.join(repoRoot, t));
  }
  return path.resolve(path.join(repoRoot, PATHS.sourcesCsv));
}
