import { extractAshby } from "./ashby.mjs";
import { extractBamboohr } from "./bamboohr.mjs";
import { extractGreenhouse } from "./greenhouse.mjs";
import { extractLever } from "./lever.mjs";
import { extractRippling } from "./rippling.mjs";
import { extractSmartRecruiters } from "./smartrecruiters.mjs";
import { extractTeamtailor } from "./teamtailor.mjs";
import { extractWorkable } from "./workable.mjs";

/** @type {Record<string, (row: Record<string, string>) => Promise<Record<string, unknown>[]>>} */
export const ATS_HANDLERS = {
  ats_greenhouse: extractGreenhouse,
  ats_lever: extractLever,
  ats_workable: extractWorkable,
  ats_ashby: extractAshby,
  ats_smartrecruiters: extractSmartRecruiters,
  ats_teamtailor: extractTeamtailor,
  ats_bamboohr: extractBamboohr,
  ats_rippling: extractRippling,
};

/**
 * @param {string} finalSourceType
 */
export function getAtsHandler(finalSourceType) {
  const key = (finalSourceType || "").trim().toLowerCase();
  return ATS_HANDLERS[key] || null;
}

/**
 * @param {string} finalSourceType
 */
export function hasImplementedHandler(finalSourceType) {
  return Boolean(getAtsHandler(finalSourceType));
}
