"use client";

import { track } from "@vercel/analytics";

/**
 * Fire-and-forget analytics helper.
 * @param {string} eventName
 * @param {Record<string, string|number|boolean|null|undefined>} [payload]
 */
export function trackEvent(eventName, payload = {}) {
  try {
    track(eventName, payload);
  } catch {
    // Never block UX due to analytics issues.
  }
}
