#!/usr/bin/env node
/**
 * Runs one or more SQL files against Supabase/Postgres using DATABASE_URL or SUPABASE_DB_URL.
 *
 * Example:
 *   node --env-file=.env scripts/supabase/runSqlFiles.mjs supabase/migrations/*.sql
 */
import fs from "fs/promises";
import path from "path";
import pg from "pg";

const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || "";

if (!connectionString) {
  console.error(
    "Missing DATABASE_URL or SUPABASE_DB_URL. Add the direct Postgres URI from Supabase Settings > Database."
  );
  process.exit(1);
}

const inputPaths = process.argv.slice(2);
if (inputPaths.length === 0) {
  console.error("Provide at least one .sql file path.");
  process.exit(1);
}

const files = inputPaths
  .map((filePath) => path.resolve(process.cwd(), filePath))
  .sort((a, b) => a.localeCompare(b));

const client = new pg.Client({
  connectionString,
  ssl: connectionString.includes("localhost")
    ? undefined
    : { rejectUnauthorized: false },
});

try {
  await client.connect();
  for (const filePath of files) {
    const sql = await fs.readFile(filePath, "utf8");
    console.log(`Applying ${path.relative(process.cwd(), filePath)} ...`);
    await client.query(sql);
  }
  console.log(`Applied ${files.length} SQL file(s).`);
} catch (error) {
  console.error(error?.message || error);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
