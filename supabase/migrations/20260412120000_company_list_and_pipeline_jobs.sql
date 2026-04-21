-- Human-readable company + pipeline-extracted jobs (view in Supabase Table Editor).
--
-- SAFETY: This file never drops public.jobs.
-- WARNING: It DOES drop public."Company List" (quoted name, space + caps). If you renamed
-- your production jobs table to "Company List" in the Table Editor, running this migration
-- would remove that table. Only run when "Company List" is the empty stub you created.
--
-- Drops the UI-created stub "Company List" if present, then creates public.company_list.

drop table if exists public."Company List" cascade;
drop table if exists public.company_list cascade;

create table public.company_list (
  company_key text primary key,
  company_name text,
  domain text,
  homepage_url text,
  linkedin_url text,
  category text,
  confidence_flag text,
  homepage_input_validation text,
  homepage_validation_note text,
  careers_url_candidate text,
  careers_url_final text,
  redirected_to text,
  resolver_status text,
  source_type_guess text,
  notes text,
  last_checked_at timestamptz,
  final_source_type text,
  extractor_type text,
  extractor_priority text,
  ready_for_extraction text,
  routing_notes text,
  synced_at timestamptz not null default now()
);

create index if not exists company_list_synced_at_idx
  on public.company_list (synced_at desc);

create index if not exists company_list_resolver_status_idx
  on public.company_list (resolver_status);

comment on table public.company_list is
  'Resolver + routing snapshot per company (merged from career_source_registry + source_routing_table).';

-- Distinct from public.jobs (production site). Holds ATS/HTML pipeline extractions only.
create table if not exists public.pipeline_extracted_jobs (
  id uuid primary key default gen_random_uuid(),
  company_key text not null,
  company text,
  source text not null,
  source_job_id text not null,
  title text,
  location text,
  apply_url text,
  posted_at timestamptz,
  description_raw text,
  description_html text,
  employment_type text,
  remote_status text,
  tags jsonb default '[]'::jsonb,
  routing_final_source_type text,
  careers_url_final text,
  clean_meta jsonb,
  synced_at timestamptz not null default now(),
  unique (company_key, source, source_job_id)
);

create index if not exists pipeline_extracted_jobs_company_key_idx
  on public.pipeline_extracted_jobs (company_key);

create index if not exists pipeline_extracted_jobs_posted_at_idx
  on public.pipeline_extracted_jobs (posted_at desc);

comment on table public.pipeline_extracted_jobs is
  'Clean extracted job rows from data/extracted_jobs_clean.json (pipeline; not the live jobs table).';

alter table public.company_list enable row level security;
alter table public.pipeline_extracted_jobs enable row level security;

drop policy if exists "Allow public read company_list" on public.company_list;
drop policy if exists "Allow public read pipeline_extracted_jobs" on public.pipeline_extracted_jobs;

create policy "Allow public read company_list"
  on public.company_list for select
  to anon, authenticated
  using (true);

create policy "Allow public read pipeline_extracted_jobs"
  on public.pipeline_extracted_jobs for select
  to anon, authenticated
  using (true);
