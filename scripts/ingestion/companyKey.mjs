/**
 * Stable production keys for legacy ATS rows migrated from sources.csv.
 * Must stay aligned with scripts/ingestion/migrateSourcesToProductionRegistry.mjs history.
 *
 * @param {string} provider
 * @param {string} slug
 */
export function companyKeyFromLegacyAts(provider, slug) {
  const p = String(provider || "")
    .trim()
    .toLowerCase();
  const s = String(slug || "").trim();
  return `legacy__${p}__${s}`;
}
