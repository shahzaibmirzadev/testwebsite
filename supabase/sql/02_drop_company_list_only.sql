-- Run when CSV import fails OR you were importing into the WRONG table.
--
-- Supabase often shows two different tables:
--   * "Company List"  →  public."Company List"   (space + caps — OLD UI stub, WRONG schema)
--   * company_list    →  public.company_list   (underscore — our CSV targets THIS one)
--
-- Our CSV matches company_list only. If you import into "Company List", you always get
-- "incompatible headers" because that table does not have company_key, etc.
--
-- Next: run 01_create_pipeline_tables_safe.sql, then in Table Editor open **company_list**
-- (not "Company List"), then import company_list.csv.
-- Does not touch public.jobs.

drop table if exists public."Company List" cascade;
drop table if exists public.company_list cascade;
