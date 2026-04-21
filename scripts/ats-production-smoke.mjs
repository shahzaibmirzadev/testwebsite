#!/usr/bin/env node
/**
 * Bounded public-API smoke test for production ATS endpoints (no Supabase).
 * Mirrors URLs used by scripts/daily-sync.js fetch* handlers.
 */
import { load } from "cheerio";

async function getJson(url, label) {
  const res = await fetch(url, { headers: { "user-agent": "DroneRoles-ats-smoke/1.0" } });
  if (!res.ok) throw new Error(`${label}: HTTP ${res.status}`);
  return res.json();
}

async function getText(url, label) {
  const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`${label}: HTTP ${res.status}`);
  return res.text();
}

async function main() {
  const results = [];

  try {
    const xml = await getText("https://delair.teamtailor.com/jobs.rss", "Teamtailor Delair RSS");
    const $ = load(xml, { xml: { xmlMode: true } });
    const n = $("item").length;
    results.push({ company: "Delair", provider: "teamtailor", slug: "delair", ok: true, detail: `${n} RSS items` });
  } catch (e) {
    results.push({ company: "Delair", provider: "teamtailor", slug: "delair", ok: false, detail: String(e.message || e) });
  }

  try {
    const data = await getJson(
      "https://ats.rippling.com/api/v2/board/droneup/jobs?page=0&pageSize=50",
      "Rippling DroneUp"
    );
    const n = Array.isArray(data?.items) ? data.items.length : 0;
    results.push({ company: "DroneUp", provider: "rippling", slug: "droneup", ok: true, detail: `${n} jobs (page 0)` });
  } catch (e) {
    results.push({ company: "DroneUp", provider: "rippling", slug: "droneup", ok: false, detail: String(e.message || e) });
  }

  try {
    const data = await getJson("https://skycatch.bamboohr.com/careers/list", "BambooHR Skycatch");
    const n = Array.isArray(data?.result) ? data.result.length : 0;
    results.push({ company: "Skycatch", provider: "bamboohr", slug: "skycatch", ok: true, detail: `${n} list rows` });
  } catch (e) {
    results.push({ company: "Skycatch", provider: "bamboohr", slug: "skycatch", ok: false, detail: String(e.message || e) });
  }

  try {
    const data = await getJson(
      "https://boards-api.greenhouse.io/v1/boards/aevexaerospace/jobs?content=true",
      "Greenhouse aevexaerospace"
    );
    const n = Array.isArray(data?.jobs) ? data.jobs.length : 0;
    results.push({ company: "Aevex Aerospace (sample)", provider: "greenhouse", slug: "aevexaerospace", ok: true, detail: `${n} jobs` });
  } catch (e) {
    results.push({ company: "Aevex Aerospace (sample)", provider: "greenhouse", slug: "aevexaerospace", ok: false, detail: String(e.message || e) });
  }

  try {
    const data = await getJson("https://api.lever.co/v0/postings/achievers?mode=json", "Lever achievers");
    const n = Array.isArray(data) ? data.length : 0;
    results.push({ company: "Achievers (sample)", provider: "lever", slug: "achievers", ok: true, detail: `${n} postings` });
  } catch (e) {
    results.push({ company: "Achievers (sample)", provider: "lever", slug: "achievers", ok: false, detail: String(e.message || e) });
  }

  console.log(JSON.stringify({ ok: results.every((r) => r.ok), results }, null, 2));
  if (!results.every((r) => r.ok)) process.exit(1);
}

main().catch((e) => {
  console.error(String(e?.message || e));
  process.exit(1);
});
