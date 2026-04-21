#!/usr/bin/env node
/**
 * Applies supabase/sql/03_site_metrics_lifetime_roles.sql via direct Postgres connection.
 *
 * Requires DATABASE_URL (or SUPABASE_DB_URL) in .env.local — Supabase Dashboard:
 * Project Settings → Database → Connection string → URI (use "Session mode" / port 5432 if pooler fails).
 *
 * Alternative: paste the same file into SQL Editor and run.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, "..");
const sqlPath = path.join(REPO, "supabase", "sql", "03_site_metrics_lifetime_roles.sql");

const connectionString =
  process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || "";

if (!connectionString) {
  console.error(
    "Missing DATABASE_URL or SUPABASE_DB_URL. Add the Postgres URI from Supabase (Settings → Database) to .env.local, then:\n" +
      "  npm run ops:apply-site-metrics\n\n" +
      "Or run supabase/sql/03_site_metrics_lifetime_roles.sql in the SQL Editor."
  );
  process.exit(1);
}

const sql = fs.readFileSync(sqlPath, "utf8");

const client = new pg.Client({
  connectionString,
  ssl: connectionString.includes("localhost")
    ? undefined
    : { rejectUnauthorized: false },
});

try {
  await client.connect();
  await client.query(sql);
  console.log("OK: site_metrics + lifetime_roles trigger applied.");
  const { rows } = await client.query(
    "select id, lifetime_roles, updated_at from public.site_metrics where id = 'default'"
  );
  console.log(JSON.stringify(rows?.[0] ?? {}, null, 2));
} catch (e) {
  console.error("Apply failed:", e?.message || e);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
