#!/usr/bin/env node
/**
 * Entry point for `npm run daily:pipeline`.
 * Sets a safe default ORCHESTRATOR_MODE, then runs scripts/pipeline-deploy.mjs (no duplicated steps).
 */
import { spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..");

if (!String(process.env.ORCHESTRATOR_MODE || "").trim()) {
  process.env.ORCHESTRATOR_MODE = "shadow";
}

const r = spawnSync(process.execPath, [path.join(REPO_ROOT, "scripts", "pipeline-deploy.mjs")], {
  cwd: REPO_ROOT,
  stdio: "inherit",
  env: process.env,
});

process.exit(r.status === null ? 1 : r.status);
