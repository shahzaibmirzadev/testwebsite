Lifetime roles counter (homepage)
=================================
The homepage "lifetime roles" number reads public.site_metrics.lifetime_roles. It increases
when sync code inserts a new row into public.jobs (daily-sync and pipeline call
increment_lifetime_roles_by). Apply migration 20260416120000_lifetime_roles_rpc_no_duplicate_trigger.sql
(or re-run 03_site_metrics_lifetime_roles.sql) so the legacy AFTER INSERT trigger is dropped and
the RPC is the only increment path.

UI "NEW" on job cards is based on posted_at (roughly "posted in the last few days"), not on
whether the row was newly inserted. Refreshed listings (upsert UPDATE) can look "new" in the
UI without bumping lifetime_roles.

Apply once:
  A) SQL Editor → paste and run: supabase/sql/03_site_metrics_lifetime_roles.sql
  B) Or: add DATABASE_URL (Postgres URI from Supabase → Settings → Database) to .env.local
     then: npm run ops:apply-site-metrics

Migration file (same SQL): supabase/migrations/20260415120000_site_metrics_lifetime_roles.sql

---
FAST PATH — Excel-style import (no pipeline rerun)
================================================
You already have JSON/CSV under data/. Generate import files anytime:

  npm run pipeline:export-csv

Writes:
  data/supabase_import/company_list.csv
  data/supabase_import/pipeline_extracted_jobs.csv

Steps:
  1) SQL Editor: run 01_create_pipeline_tables_safe.sql once (creates empty tables if needed).
  2) Table Editor → import into **company_list** (underscore, lowercase) — NOT "Company List"
     (space + capital C/L). Those are two different tables; the CSV only matches company_list.
  3) Import data from CSV → pick company_list.csv
  4) Table Editor → **pipeline_extracted_jobs** (underscore) → Import → pipeline_extracted_jobs.csv
     (Map columns; `tags` and `clean_meta` are JSON text → jsonb. Skip `id` — default uuid.)

Connect / test your app AFTER. No need to rerun resolve:careers or extract:* for this.

TROUBLESHOOT — "columns are not present" / incompatible headers
==============================================================
Most common: you are importing into **"Company List"** (space in the name) instead of
**company_list** (underscore). Open the table **company_list** in the sidebar, then Import.

If it still fails, old stubs blocked the real schema:
  1) SQL Editor → run 02_drop_company_list_only.sql (drops BOTH "Company List" and company_list)
  2) Run 01_create_pipeline_tables_safe.sql again
  3) Import into **company_list** only

Same idea for pipeline_extracted_jobs if needed:
  drop table if exists public.pipeline_extracted_jobs cascade;
  then run 01 again, then import the jobs CSV.

---
Chunked SQL / GitHub sync (optional)
---
See below if CSV import is too large for the dashboard.

A) Recreate empty tables — one paste, small file
   Run: 01_create_pipeline_tables_safe.sql

B) Load data without service role — many small SQL files
   npm run pipeline:export-sql
   Then run data/supabase_seed_parts/001_*.sql … in order (see 00_README in that folder).

C) Automatic updates via GitHub Actions
   Workflow: sync-pipeline-to-supabase.yml (uses SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).
   Or locally: npm run pipeline:sync-companies

---
HTML Scraper Results (cleaned previews, not raw JSON files)
---
Migration: supabase/migrations/20260414120000_html_scraper_results.sql (table: html_scraper_results)

After: npm run extract:html && npm run filter:jobs
Run:    npm run pipeline:sync-html-results

Loads cleaned HTML rows (source custom_html) with short description_preview into Supabase.
