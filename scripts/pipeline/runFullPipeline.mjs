#!/usr/bin/env node
/**
 * Runs resolve:careers → routing:table → extract:ats → analyzePipeline.
 * Continues on step failure; always attempts analysis at the end.
 */
import { spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..", "..");

function runNpmScript(scriptName) {
  const r = spawnSync("npm", ["run", scriptName], {
    cwd: REPO_ROOT,
    shell: true,
    stdio: "inherit",
    env: process.env,
  });
  return {
    script: scriptName,
    ok: r.status === 0,
    status: r.status ?? -1,
    error: r.error ? String(r.error.message) : null,
  };
}

console.log(JSON.stringify({ phase: "start", cwd: REPO_ROOT }, null, 2));

const steps = [
  () => runNpmScript("resolve:careers"),
  () => runNpmScript("routing:table"),
  () => runNpmScript("extract:ats"),
  () => runNpmScript("pipeline:analyze"),
  () => runNpmScript("pipeline:decision"),
];

const results = [];
for (const fn of steps) {
  const res = fn();
  results.push(res);
  if (!res.ok) {
    console.log(
      JSON.stringify(
        { warning: "step_failed_continuing", step: res.script || res, status: res.status },
        null,
        2
      )
    );
  }
}

console.log(
  JSON.stringify({ phase: "done", pipeline_steps: results }, null, 2)
);

const analyzeOk = results[3]?.ok;
const decisionOk = results[4]?.ok;
process.exit(analyzeOk && decisionOk ? 0 : 1);
