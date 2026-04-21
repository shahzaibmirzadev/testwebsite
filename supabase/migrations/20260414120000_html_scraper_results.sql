-- Cleaned HTML scraper rows for Supabase Table Editor (short previews, no full HTML blobs).
-- Populated by scripts/pipeline/syncHtmlScraperResultsToSupabase.mjs from extracted_jobs_filtered.json (source = custom_html).

create table if not exists public.html_scraper_results (
  id uuid primary key default gen_random_uuid(),
  imported_at timestamptz not null default now(),
  pipeline_generated_at timestamptz,
  company_key text not null default '',
  company text not null default '',
  careers_url_final text not null default '',
  title text not null default '',
  location text not null default '',
  apply_url text not null default '',
  posted_at text,
  is_relevant boolean not null default false,
  relevance_reasons jsonb not null default '[]'::jsonb,
  relevance_notes text not null default '',
  description_preview text not null default '',
  source_job_id text not null default '',
  content_hash text not null default '',
  tags jsonb not null default '[]'::jsonb,
  employment_type text,
  remote_status text
);

create index if not exists html_scraper_results_company_key_idx
  on public.html_scraper_results (company_key);

create index if not exists html_scraper_results_is_relevant_idx
  on public.html_scraper_results (is_relevant);

create index if not exists html_scraper_results_imported_at_idx
  on public.html_scraper_results (imported_at desc);

comment on table public.html_scraper_results is
  'HTML Scraper Results: cleaned modular HTML jobs (previews only). Full pipeline: extract:html → filter:jobs → sync script.';

-- Full refresh before each sync (service_role only).
create or replace function public.truncate_html_scraper_results()
returns void
language sql
security definer
set search_path = public
as $$
  truncate table public.html_scraper_results restart identity;
$$;

revoke all on function public.truncate_html_scraper_results() from public;
grant execute on function public.truncate_html_scraper_results() to service_role;

alter table public.html_scraper_results enable row level security;
