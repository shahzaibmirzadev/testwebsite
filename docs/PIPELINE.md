# Ingestion pipeline (separate from the Next.js app)

This repo is primarily the **Drone Roles** marketing site (`app/`, `components/`, `lib/`).  
The folders below are **optional tooling** that feed or analyze job data — they do not run in production unless you execute the scripts locally or in CI.

## Areas

| Area | Location | Purpose |
|------|----------|---------|
| **Career URL resolver** | `scripts/career-resolver/` | From `data/companies_master.csv`, probe sites → `data/career_source_registry.csv` |
| **Routing / classification** | `scripts/career-resolver/buildRoutingTable.mjs` | Registry → `data/source_routing_table.csv` (extractor choice, ready flags) |
| **ATS job extraction** | `scripts/job-extraction/` | ATS rows → `data/extracted_jobs_raw.json` |
| **Pipeline orchestration & analysis** | `scripts/pipeline/` | Full run + `data/pipeline_analysis_report.json` |

## npm scripts

| Script | What it runs |
|--------|----------------|
| `npm run resolve:careers` | Resolver only |
| `npm run routing:table` | Routing table only |
| `npm run extract:ats` | ATS extraction only |
| `npm run pipeline:analyze` | Analysis report only (read-only) |
| `npm run pipeline:full` | resolve → routing → extract → analyze |

## Data artifacts (under `data/`)

- `companies_master.csv` — input company list  
- `career_source_registry.csv` — resolver output  
- `source_routing_table.csv` — routing output  
- `extracted_jobs_raw.json` — extracted jobs  
- `pipeline_analysis_report.json` — summary metrics  

Logs: `logs/career-resolver.log` (gitignored if present).

## Daily production sync

The existing **Supabase / `sources.csv` / `daily-sync.js`** flow is separate from this pipeline. See `OPERATIONS.md` and `scripts/daily-sync.js`.
