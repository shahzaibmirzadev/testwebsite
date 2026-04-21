-- Monotonic "lifetime roles" counter: increments on each new job row INSERT only.
-- Deletes and deactivates do not decrement. public.jobs row count is not lifetime.

create table if not exists public.site_metrics (
  id text primary key default 'default',
  lifetime_roles bigint not null default 0,
  updated_at timestamptz not null default now()
);

insert into public.site_metrics (id, lifetime_roles)
values ('default', 0)
on conflict (id) do nothing;

-- Baseline from existing rows (one-time; trigger only fires on new inserts after this).
update public.site_metrics
set
  lifetime_roles = greatest(
    public.site_metrics.lifetime_roles,
    (select count(*)::bigint from public.jobs)
  ),
  updated_at = now()
where id = 'default';

create or replace function public.increment_lifetime_roles_on_job_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.site_metrics
  set
    lifetime_roles = lifetime_roles + 1,
    updated_at = now()
  where id = 'default';
  return new;
end;
$$;

create or replace function public.increment_lifetime_roles_by(delta bigint)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  inc bigint := greatest(0, coalesce(delta, 0));
  next_value bigint := 0;
begin
  insert into public.site_metrics (id, lifetime_roles)
  values ('default', 0)
  on conflict (id) do nothing;

  update public.site_metrics
  set
    lifetime_roles = lifetime_roles + inc,
    updated_at = now()
  where id = 'default'
  returning lifetime_roles into next_value;

  return coalesce(next_value, 0);
end;
$$;

drop trigger if exists jobs_increment_lifetime_roles on public.jobs;
create trigger jobs_increment_lifetime_roles
  after insert on public.jobs
  for each row
  execute function public.increment_lifetime_roles_on_job_insert();

comment on table public.site_metrics is
  'Site-wide counters; lifetime_roles increases only when a new row is inserted into public.jobs.';

alter table public.site_metrics enable row level security;

drop policy if exists "Allow public read site_metrics" on public.site_metrics;
create policy "Allow public read site_metrics"
  on public.site_metrics for select
  to anon, authenticated
  using (true);
