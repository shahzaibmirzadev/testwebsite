import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

import { PATHS } from "../config/pipelinePaths.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..", "..");

/**
 * @typedef {object} AtsSerpDiscoveryConfig
 * @property {number} version
 * @property {number} totalQueryBudget
 * @property {{ direct_ats?: number, title_led?: number, company_bridge?: number, geo?: number }} bucketBudgets
 * @property {Record<string, number>} providerWeights
 * @property {Record<string, string>} providerSearchSites
 * @property {Record<string, string[]>} keywordBanks
 * @property {string[]} [keywordCrossovers]
 * @property {string} [directAtsTemplate]
 * @property {string[]} [directAtsTemplates]
 * @property {string[]} [directRegionHints]
 * @property {string[]} titleLedTemplates
 * @property {string[]} [titleLedContextSuffixes]
 * @property {string[]} companyBridgeTemplates
 * @property {string[]} [bridgeRegionQualifiers]
 * @property {string[]} geoTemplates
 * @property {number} randomSeed
 * @property {string} defaultScrapeTier
 * @property {string} defaultScrapeEveryRuns
 * @property {boolean} [useVetoRegistry]
 * @property {boolean} [strictCollisionMode]
 * @property {number} [serpResultsPerQuery]
 * @property {string} [serpEngine]
 * @property {number} [serpRequestTimeoutMs]
 * @property {number} [checkpointEveryQueries]
 * @property {number} [checkpointMinBufferedRows]
 * @property {boolean} [validateAtsPageBody]
 * @property {number} [atsPageBodyFetchTimeoutMs]
 * @property {string} [sourcesCsvWritePath]
 */

/**
 * @param {string} [configPath]
 * @returns {Promise<AtsSerpDiscoveryConfig>}
 */
export async function loadAtsSerpDiscoveryConfig(configPath) {
  const p = path.isAbsolute(configPath || "")
    ? String(configPath)
    : path.join(
        REPO_ROOT,
        configPath || process.env.ATS_SERP_DISCOVERY_CONFIG || PATHS.atsSerpDiscoveryConfig
      );
  const raw = await fs.readFile(p, "utf8");
  const j = JSON.parse(raw);
  if (!j || typeof j !== "object") {
    throw new Error(`Invalid config JSON: ${p}`);
  }
  return /** @type {AtsSerpDiscoveryConfig} */ (j);
}
