# Launch Checklist

Use this before every production push. Target runtime: 15-20 minutes.

## 1) Data + Sync Health (P0)

- Confirm latest `Daily Job Sync` workflow run is green.
- Confirm latest `Post Sync Retry` (if run) is green.
- Inspect run logs for:
  - `Jobs upsert errors: 0`
  - `Jobs RLS errors: 0`
  - sensible `Jobs inserted` / `Jobs updated` counts
- Check `source_performance.csv` for obvious anomalies:
  - unexpectedly large `fetch_failed` spikes
  - major tier drops across many sources in one run
  - unusually high `jobs_marked_inactive`

## 2) Core UX Smoke Test (P0)

- Home page loads with jobs visible and no console errors.
- Filter flow:
  - apply 2-3 filters
  - paginate
  - clear all
  - verify results recover correctly
- Deep link flow:
  - open a URL with query params (`?loc=...&sort=...`)
  - verify filters hydrate and results match the URL
- Open a job detail page and verify apply link works.

## 3) Accessibility Quick Pass (P0)

- Keyboard-only test on home:
  - focus ring visible on interactive controls
  - card preview opens via Enter/Space
  - tab order remains logical
- Mobile viewport:
  - filter drawer opens/closes
  - page remains scrollable and readable

## 4) SEO + Indexability (P1)

- Validate JSON-LD on:
  - home page
  - at least one guide page
- Confirm canonical URLs are correct.
- Spot-check that empty/thin guide pages are not accidentally indexable if that is expected.

## 5) Final Go/No-Go

- If any P0 item fails, do not push live.
- If only P1 issues remain, launch is usually acceptable with a same-day follow-up patch.

