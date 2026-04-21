#!/usr/bin/env node
import { spawn } from "child_process";

// Pacing / backoff: see WORKABLE_* in daily-sync.js and .env.example (cold start, max Retry-After cap, min interval).
const env = {
  ...process.env,
  DAILY_SYNC_ONLY_PROVIDERS: process.env.DAILY_SYNC_ONLY_PROVIDERS || "workable",
  WORKABLE_INTER_SOURCE_DELAY_MS: process.env.WORKABLE_INTER_SOURCE_DELAY_MS || "45000",
  FETCH_MAX_ATTEMPTS: process.env.FETCH_MAX_ATTEMPTS || "8",
  RETRY_DELAY_MS: process.env.RETRY_DELAY_MS || "18000",
  REQUEST_TIMEOUT_MS: process.env.REQUEST_TIMEOUT_MS || "25000",
};

const child = spawn(process.execPath, ["scripts/daily-sync.js"], {
  stdio: "inherit",
  env,
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
