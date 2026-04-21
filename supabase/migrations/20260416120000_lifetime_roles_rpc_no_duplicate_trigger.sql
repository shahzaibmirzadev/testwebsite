-- lifetime_roles is incremented by application code (increment_lifetime_roles_by) on each true
-- INSERT from daily-sync and pipeline deploy. Drop the AFTER INSERT trigger so RPC is the only
-- path and rows are never double-counted.
drop trigger if exists jobs_increment_lifetime_roles on public.jobs;

grant execute on function public.increment_lifetime_roles_by(bigint) to service_role;
