import fs from "fs/promises";
import path from "path";

import { PATHS } from "./config/pipelinePaths.mjs";

const ROOT = process.cwd();
const SNAPSHOT_PATH = path.join(ROOT, PATHS.jobsMaster);
const OUTPUT_PATH = path.join(ROOT, PATHS.seoValidation);
function normalizeBaseUrl(raw) {
  const s = String(raw || "").trim().replace(/\/$/, "");
  return s || "https://droneroles.com";
}

const BASE_URL = normalizeBaseUrl(
  process.env.SEO_VALIDATION_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL
);
const LIMIT = Number(process.env.SEO_VALIDATION_LIMIT || 20);

function extractCanonical(html) {
  return [...html.matchAll(/<link[^>]+rel=["']canonical["'][^>]*>/gi)].map((m) => m[0]);
}

function extractJsonLd(html) {
  return [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map(
    (m) => m[1]
  );
}

function safeParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function toSlug(job) {
  return String(job?.slug || "").trim();
}

function canonicalHref(tag) {
  const m = String(tag || "").match(/href=["']([^"']+)["']/i);
  return m ? m[1] : "";
}

async function run() {
  const raw = await fs.readFile(SNAPSHOT_PATH, "utf8");
  const snapshot = JSON.parse(raw);
  const jobs = Array.isArray(snapshot?.jobs) ? snapshot.jobs : [];
  const slugs = jobs.map(toSlug).filter(Boolean).slice(0, LIMIT);
  const urls = slugs.map((slug) => `${BASE_URL}/jobs/${slug}`);
  const results = [];

  for (const url of urls) {
    try {
      const res = await fetch(url);
      const html = await res.text();
      const canonTags = extractCanonical(html);
      const canon = canonicalHref(canonTags[0]);
      const blocks = extractJsonLd(html);
      const parsed = blocks.map(safeParseJson).filter(Boolean);
      const posting = parsed.find((p) => p?.["@type"] === "JobPosting");
      const missing = posting
        ? ["title", "description", "datePosted", "validThrough", "hiringOrganization", "jobLocation"].filter(
            (k) => posting[k] == null || posting[k] === ""
          )
        : ["JobPosting missing"];
      const pass = res.status === 200 && canonTags.length > 0 && missing.length === 0;

      results.push({
        url,
        status: res.status,
        canonical: canon,
        canonicalCount: canonTags.length,
        hasJobPosting: Boolean(posting),
        missing,
        pass,
      });
    } catch (error) {
      results.push({
        url,
        status: 0,
        canonical: "",
        canonicalCount: 0,
        hasJobPosting: false,
        missing: [String(error?.message || error)],
        pass: false,
      });
    }
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    total: results.length,
    passed: results.filter((r) => r.pass).length,
    failed: results.filter((r) => !r.pass).length,
  };

  await fs.writeFile(OUTPUT_PATH, JSON.stringify({ summary, results }, null, 2) + "\n", "utf8");
  console.log(JSON.stringify({ ok: true, output: OUTPUT_PATH, summary }, null, 2));
}

run().catch((error) => {
  console.error(String(error?.message || error));
  process.exit(1);
});
