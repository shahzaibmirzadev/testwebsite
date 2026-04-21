# Rollback Runbook

Use this if a live release causes data, UX, or SEO regressions.

## Trigger Conditions

- Broken core flow (home/jobs/apply) for users.
- Daily sync producing abnormal deactivations or failed upserts.
- Major SEO metadata/schema regression in production.

## Immediate Containment (5 minutes)

1. Pause release traffic/actions:
   - Temporarily disable or pause the triggering deployment workflow if needed.
2. Stop automation churn:
   - Temporarily disable scheduled job sync workflow dispatches until diagnosis completes.
3. Communicate status:
   - Log incident start time and visible impact.

## Fast Recovery Path

1. Revert to last known good commit and redeploy.
2. Re-run post-sync maintenance only after stable deploy:
   - run `Post Sync Retry` manually if snapshot data must be re-generated.
3. Verify production smoke tests:
   - home load
   - filter + pagination
   - job detail + apply
   - no obvious errors in logs

## Data Safety Checks (after rollback)

- Confirm latest sync logs contain:
  - `Jobs upsert errors: 0`
  - `Jobs RLS errors: 0`
- Confirm no unexpected spike in `jobs_marked_inactive`.
- Validate `source_performance.csv` and `sources.csv` consistency.

## Resume Criteria

Only re-enable normal release/sync schedule when:

- core user flow is stable,
- sync metrics return to expected range,
- and root cause + fix are documented.

