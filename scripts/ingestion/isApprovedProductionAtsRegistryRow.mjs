/**
 * @param {string} s
 * @returns {boolean}
 */
export function isValidHttpOrHttpsUrl(s) {
  try {
    const u = new URL(String(s ?? "").trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Rows eligible for ATS export + bridge parity: promoted legacy ATS production baseline.
 * Matches scripts/ingestion/exportSourcesCsvFromRegistry.mjs and validateIngestionBridge.mjs.
 *
 * @param {Record<string, string>} reg
 * @returns {boolean}
 */
export function isApprovedProductionAtsRegistryRow(reg) {
  const company_key = (reg.company_key || "").trim();
  const ingestion_status = (reg.ingestion_status || "").trim().toLowerCase();
  const source_kind = (reg.source_kind || "").trim().toLowerCase();
  if (!company_key) return false;
  if (ingestion_status !== "promoted") return false;
  if (source_kind !== "ats_api") return false;
  const ats = (reg.ats_provider || "").trim().toLowerCase();
  const slug = (reg.ats_board_slug || "").trim();
  const company_name = (reg.company_name || "").trim();
  return Boolean(ats && slug && company_name);
}

/**
 * Promoted HTML custom sources in the production registry (discovery allowlist only).
 * Does not affect ATS export / bridge eligibility.
 *
 * @param {Record<string, string>} reg
 * @returns {boolean}
 */
export function isApprovedProductionHtmlRegistryRow(reg) {
  const company_key = (reg.company_key || "").trim();
  const ingestion_status = (reg.ingestion_status || "").trim().toLowerCase();
  const source_kind = (reg.source_kind || "").trim().toLowerCase();
  if (!company_key) return false;
  if (ingestion_status !== "promoted") return false;
  if (source_kind !== "html_custom") return false;
  const company_name = (reg.company_name || "").trim();
  const careers = (reg.careers_url_canonical || "").trim();
  if (!company_name || !careers) return false;
  return isValidHttpOrHttpsUrl(careers);
}

/**
 * Discovery short-circuit allowlist: promoted ATS API and promoted HTML custom rows.
 *
 * @param {Record<string, string>} reg
 * @returns {boolean}
 */
export function isApprovedProductionDiscoveryAllowlistRow(reg) {
  return (
    isApprovedProductionAtsRegistryRow(reg) ||
    isApprovedProductionHtmlRegistryRow(reg)
  );
}
