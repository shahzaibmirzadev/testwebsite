/**
 * Normalizes typography in data/Company Descriptions.xlsx (text columns only).
 * Logo columns (Logo URL, Logo Source Type, Logo Status, Logo Last Checked At, Needs Review) are
 * left unchanged; they are merged into lib/companyDescriptions.generated.json by the build script.
 * Run: npm run data:standardize-company-descriptions
 * Then: npm run data:company-descriptions
 */
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import * as XLSX from "xlsx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..");
const XLSX_PATH = path.join(REPO_ROOT, "data", "Company Descriptions.xlsx");

const TEXT_COLUMNS = ["Company", "Description", "Location", "SEO Title", "H1", "Careers Blurb"];

/**
 * @param {string} raw
 * @returns {string}
 */
function standardizeCompanyDescriptionText(raw) {
  let s = String(raw ?? "");
  try {
    s = s.normalize("NFKC");
  } catch {
    /* ignore */
  }
  s = s.replace(/\s+/g, " ");

  // Acronym: prefer "Ai" over "AI" (word-boundary; avoids FAIR, SAID, etc.)
  s = s.replace(/\bAI\b/g, "Ai");

  // Legal / suffix punctuation (prefer "Inc" not "Inc.", etc.)
  s = s.replace(/\bInc\./g, "Inc");
  s = s.replace(/\bLLC\./g, "LLC");
  s = s.replace(/\bL\.L\.C\./g, "LLC");
  s = s.replace(/\bLtd\./g, "Ltd");
  s = s.replace(/\bPLC\./g, "PLC");
  s = s.replace(/\bCorp\./g, "Corp");

  s = s.replace(/\s+/g, " ").trim();
  return s;
}

async function main() {
  const buf = await fs.readFile(XLSX_PATH);
  const wb = XLSX.read(buf, { type: "buffer" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error("standardize: workbook has no sheets");

  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  let changed = 0;

  for (const row of rows) {
    for (const col of TEXT_COLUMNS) {
      if (!(col in row)) continue;
      const prev = row[col];
      if (prev == null || prev === "") continue;
      const str = typeof prev === "number" ? String(prev) : String(prev);
      const next = standardizeCompanyDescriptionText(str);
      if (next !== str) changed += 1;
      row[col] = next;
    }
  }

  const out = XLSX.utils.book_new();
  const newSheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(out, newSheet, sheetName);
  XLSX.writeFile(out, XLSX_PATH);

  console.log(
    JSON.stringify({
      ok: true,
      path: path.relative(REPO_ROOT, XLSX_PATH),
      rows: rows.length,
      cellsUpdated: changed,
    })
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
