function envFlag(name, defaultValue = false) {
  const raw = String(process.env[name] || "").trim().toLowerCase();
  if (!raw) return Boolean(defaultValue);
  return raw === "true";
}

export function getFeatureFlags() {
  return {
    /** When true, company directory may use operational metadata from reporting (default off). */
    companyDirectoryOperationalStatusV1: envFlag(
      "COMPANY_DIRECTORY_OPERATIONAL_STATUS_V1"
    ),
    seoV1: envFlag("SEO_V1"),
    jobSchemaV1: envFlag("JOB_SCHEMA_V1"),
    categoryPagesV1: envFlag("CATEGORY_PAGES_V1", true),
    companyPagesV1: envFlag("COMPANY_PAGES_V1", true),
    extendedCategoryPagesV1: envFlag("EXTENDED_CATEGORY_PAGES_V1", true),
    seoInternalLinksV2: envFlag("SEO_INTERNAL_LINKS_V2"),
    companySeoEnrichmentV1: envFlag("COMPANY_SEO_ENRICHMENT_V1", true),
    seoContentBlocksV1: envFlag("SEO_CONTENT_BLOCKS_V1"),
    seoLinkingV1: envFlag("SEO_LINKING_V1"),
  };
}

