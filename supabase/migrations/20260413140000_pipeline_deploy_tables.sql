-- Deploy pipeline: run tracking, per-run staging rows, optional errors.
-- public.jobs remains the live table for the site; jobs_live is a documented alias view.
-- Apply via Supabase migrations or SQL editor. Does not modify public.jobs schema.

create table if not exists public.pipeline_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running',
  publish_allowed boolean,
  published_at timestamptz,
  published_job_count integer,
  metrics jsonb not null default '{}'::jsonb,
  gate_results jsonb,
  summary jsonb,
  constraint pipeline_runs_status_chk check (
    status in (
      'running',
      'staged',
      'gate_failed',
      'published',
      'aborted',
      'publish_skipped'
    )
  )
);

create index if not exists pipeline_runs_started_at_idx
  on public.pipeline_runs (started_at desc);

create index if not exists pipeline_runs_status_idx
  on public.pipeline_runs (status);

comment on table public.pipeline_runs is
  'One row per pipeline deploy attempt; metrics + gate outcome before touching public.jobs.';

create table if not exists public.jobs_staging (
  id uuid primary key default gen_random_uuid(),
  pipeline_run_id uuid not null references public.pipeline_runs (id) on delete cascade,
  source text not null,
  source_job_id text not null,
  row_payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (pipeline_run_id, source, source_job_id)
);

create index if not exists jobs_staging_run_idx
  on public.jobs_staging (pipeline_run_id);

comment on table public.jobs_staging is
  'DB-ready job payloads keyed by pipeline run (from jobs_db_ready.json) before publish to public.jobs.';

create table if not exists public.pipeline_run_errors (
  id uuid primary key default gen_random_uuid(),
  pipeline_run_id uuid not null references public.pipeline_runs (id) on delete cascade,
  step text not null,
  message text not null,
  detail jsonb,
  created_at timestamptz not null default now()
);

create index if not exists pipeline_run_errors_run_idx
  on public.pipeline_run_errors (pipeline_run_id);

comment on table public.pipeline_run_errors is
  'Gate failures and non-fatal issues for a pipeline run.';

alter table public.pipeline_runs enable row level security;
alter table public.jobs_staging enable row level security;
alter table public.pipeline_run_errors enable row level security;

-- No anon/authenticated policies: service_role bypasses RLS for deploy scripts.

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'jobs'
  ) then
    execute $v$
      create or replace view public.jobs_live as
      select * from public.jobs;
    $v$;
    execute 'comment on view public.jobs_live is ''Site-facing listings (alias of public.jobs).''';
  end if;
end
$$;
