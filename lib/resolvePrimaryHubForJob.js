import { CATEGORY_PAGES } from "@/lib/categoryPages";
import { GUIDE_PAGES } from "@/lib/guidePages";

/**
 * @typedef {{ source: "category", slug: string } | { source: "guide", slug: string }} PrimaryHub
 */

/**
 * Picks one hub for internal linking. Category pages first (key order = stable);
 * guide pages only if no category matched. Slugs come only from CATEGORY_PAGES / GUIDE_PAGES.
 *
 * @param {Record<string, unknown>} job
 * @returns {PrimaryHub|null}
 */
export function resolvePrimaryHubForJob(job) {
  for (const slug of Object.keys(CATEGORY_PAGES)) {
    const cfg = CATEGORY_PAGES[slug];
    try {
      if (typeof cfg?.match === "function" && cfg.match(job)) {
        return { source: "category", slug };
      }
    } catch {
      /* ignore matcher errors */
    }
  }
  for (const slug of Object.keys(GUIDE_PAGES)) {
    const cfg = GUIDE_PAGES[slug];
    try {
      if (typeof cfg?.match === "function" && cfg.match(job)) {
        return { source: "guide", slug };
      }
    } catch {
      /* ignore matcher errors */
    }
  }
  return null;
}

/**
 * @param {PrimaryHub|null} hub
 * @returns {string|null}
 */
export function hubPathForHub(hub) {
  if (!hub) return null;
  if (hub.source === "category") return `/jobs/${hub.slug}`;
  return `/${hub.slug}`;
}
