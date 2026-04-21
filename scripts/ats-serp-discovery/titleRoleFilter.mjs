/**
 * Second gate: title + snippet must look like technical/operational drone-adjacent hiring,
 * not generic business/support — runs after assessDroneRoboticsRelevance.
 */

import { hasDirectDroneUasSignal } from "./relevanceFilter.mjs";

const UAV_CONTEXT = /\b(uav|drone|drones|unmanned|aerial|uas|suas|rpas|uncrewed|usv)\b/i;

/** Off-target business / G&A / sales — title + snippet only. */
const HARD_REJECT_RES = [
  /\bbid\s+manager\b/i,
  /\brecruiter\b/i,
  /\btalent\s+acquisition\b/i,
  /\bpeople\s+partner\b/i,
  /\bpeople\s+operations\b/i,
  /\bHR\b/,
  /\bhuman\s+resources\b/i,
  /\blegal\b/i,
  /\bfinance\b/i,
  /\baccountant\b/i,
  /\bpayroll\b/i,
  /customer\s+success/i,
  /\bmarketing\s+manager\b/i,
  /\bgrowth\s+marketing\b/i,
  /\btruck[\s-]?driver\b/i,
  /\btrucker\b/i,
  /\bcdl\b/i,
  /\bdelivery\s+driver\b/i,
];

/**
 * When title does not carry a direct UAV/drone keyword but snippet does, require the job
 * title line to show a qualified engineering/tech role — not a bare "Engineer" with all
 * signal in the snippet.
 */
const ENGINEER_TITLE_QUALIFIER =
  /\b(software|hardware|systems|computer|mechanical|aerospace|electrical|flight|uav|drone|embedded|autonomy|senior|staff|principal|lead|sr|gnc|test|field|mission|payload|uas|avionics|robotics|autopilot|perception)\b/i;

/**
 * @param {string} text
 */
function hardReject(text) {
  for (const re of HARD_REJECT_RES) {
    if (re.test(text)) return true;
  }
  if (/\boperations manager\b/i.test(text)) {
    if (
      !/\b(uav|drone|flight|mission|unmanned|aerial|uas|bvlos|geospatial|mapping|survey|payload|field)\b/i.test(
        text
      )
    ) {
      return true;
    }
  }
  if (/\bmaritime\b/i.test(text) && !UAV_CONTEXT.test(text)) {
    return true;
  }
  return false;
}

/**
 * At least one acceptable hiring/role signal (technical / ops / geo).
 */
const ACCEPTABLE_ROLE =
  /\b(engineer|engineering|operator|operators|pilot|pilots|roboticist|business development|biz dev|partnerships|alliances|account executive|sales representative|sales manager|inside sales|sdr|bdr|administrative|administrator|admin assistant|administrative assistant|executive assistant|office manager|operations coordinator|program coordinator|project coordinator)\b|flight\s+test|test\s+engineer|mission\s+operations|\bautonomy\b|\brobotics\b|\bperception\b|computer\s+vision|\bGNC\b|\bavionics\b|\bpayload\b|\bembedded\b|\bfirmware\b|\bnavigation\b|\bgeospatial\b|\bmapping\b|\bsurvey\b|\bphotogrammetry\b|\bBVLOS\b|remote\s+sensing|field\s+engineer|systems\s+engineer|\bcontrols\b/i;

/**
 * @param {{ title?: string, snippet?: string }} fields
 * @returns {{ ok: true } | { ok: false, reason: "irrelevant_role_title" }}
 */
export function assessTitleRoleForDroneHiring(fields) {
  const title = String(fields.title ?? "").trim();
  const snippet = String(fields.snippet ?? "").trim();
  const text = [title, snippet].filter(Boolean).join("\n");

  if (!text.trim()) {
    return { ok: false, reason: "irrelevant_role_title" };
  }

  if (hardReject(text)) {
    return { ok: false, reason: "irrelevant_role_title" };
  }

  const snippetOnlyDirect =
    hasDirectDroneUasSignal(snippet) && !hasDirectDroneUasSignal(title);

  if (snippetOnlyDirect) {
    if (!ACCEPTABLE_ROLE.test(title)) {
      return { ok: false, reason: "irrelevant_role_title" };
    }
    if (
      /\bengineer\b/i.test(title) &&
      !ENGINEER_TITLE_QUALIFIER.test(title)
    ) {
      return { ok: false, reason: "irrelevant_role_title" };
    }
  } else {
    if (!ACCEPTABLE_ROLE.test(text)) {
      return { ok: false, reason: "irrelevant_role_title" };
    }
  }

  return { ok: true };
}
