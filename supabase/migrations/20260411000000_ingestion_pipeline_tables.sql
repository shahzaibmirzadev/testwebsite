-- Pipeline tooling: routing snapshot + decision reports (view in Supabase Table Editor).
-- Service role bypasses RLS; optional anon read for dashboards.

create table if not exists public.ingestion_company_routing (
  company_key text primary key,
  row_payload jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now()
);

create index if not exists ingestion_company_routing_synced_at_idx
  on public.ingestion_company_routing (synced_at desc);

create table if not exists public.ingestion_pipeline_decisions (
  id uuid primary key default gen_random_uuid(),
  generated_at timestamptz not null,
  dataset_status text,
  report jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists ingestion_pipeline_decisions_created_at_idx
  on public.ingestion_pipeline_decisions (created_at desc);

comment on table public.ingestion_company_routing is
  'Career pipeline routing rows (mirror of data/source_routing_table.csv as JSON).';
comment on table public.ingestion_pipeline_decisions is
  'Full pipeline decision reports (data/full_pipeline_decision_report.json).';

alter table public.ingestion_company_routing enable row level security;
alter table public.ingestion_pipeline_decisions enable row level security;

drop policy if exists "Allow public read ingestion_company_routing" on public.ingestion_company_routing;
drop policy if exists "Allow public read ingestion_pipeline_decisions" on public.ingestion_pipeline_decisions;

-- Optional: allow read-only to anon for internal dashboards (tighten in production).
create policy "Allow public read ingestion_company_routing"
  on public.ingestion_company_routing for select
  to anon, authenticated
  using (true);

create policy "Allow public read ingestion_pipeline_decisions"
  on public.ingestion_pipeline_decisions for select
  to anon, authenticated
  using (true);
