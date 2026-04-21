# Operations Runbook

## Daily Automation

- Workflow: `.github/workflows/daily-job-sync.yml`
- Trigger strategy: runs hourly but only executes at `17:00 Europe/Brussels`
- Daily tasks:
  - scrape/sync jobs
  - validate apply links
  - refresh `data/jobs-master.json`
  - validate `sources.csv` schema
  - update `data/ops-health.json` (activeJobs baseline for CI drop guardrail)
  - generate `data/seo-validation.json`

## Health Signals

- API endpoint: `/api/ops-health` (live metrics from the app, not `data/ops-health.json`)

## Alert Guardrail

- `scripts/ops-health-check.mjs` compares `jobs-master.json` job count to the last committed `data/ops-health.json`.
- If active jobs drop more than **20%** day-over-day, the workflow fails with `ALERT_ACTIVE_JOBS_DROP`.

## Source Schema

- Required `sources.csv` columns:
  - `ats`, `slug`, `company_name`, `status`
- Recommended columns:
  - `company_website`, `company_size`, `hq_location`

## Useful Commands

- `npm run ops:health`
- `npm run ops:seo-validate`
- `npm run ops:check-sources`
