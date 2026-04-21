# Career page resolver (v1)

Reads `data/companies_master.csv` (columns: `Company`, `domain`, `full_url`, `LinkedIn`, `Category`, `confidence_flag`) and writes `data/career_source_registry.csv`. The master file is never modified.

## Usage

```bash
npm run resolve:careers
```

- **Default:** re-resolves only rows that are missing, or have `resolver_status` in: `careers_not_found`, `manual_review`, `homepage_fetch_failed`, `careers_fetch_failed` (empty status is always reprocessed).
- **`--force`:** reprocess every row.

```bash
node scripts/career-resolver/run.mjs --force
```

Logs append to `logs/career-resolver.log` (JSON lines). Console prints one JSON line per company processed.

## Output

See `registry.mjs` → `OUTPUT_COLUMNS`. `notes` contains JSON with `homepageUsed`, `pathsTried`, `probeLog`, `homepageScan`, and `finalUrl`.

## Source routing (classifier + extractor router)

After `career_source_registry.csv` exists:

```bash
npm run routing:table
```

Writes `data/source_routing_table.csv` (all registry columns plus `final_source_type`, `extractor_type`, `extractor_priority`, `ready_for_extraction`, `routing_notes`). Does not modify the registry.
