#!/usr/bin/env node

import {
  getGlobalRolePageConfigs,
  getRoleLocationLandingConfigs,
  validateLandingRegistry,
} from "../lib/landingPageRegistry.js";

function main() {
  const roleLocation = getRoleLocationLandingConfigs();
  const globalRoles = getGlobalRolePageConfigs();
  const errors = validateLandingRegistry();

  console.log(`[landing-registry] role-location pages: ${roleLocation.length}`);
  console.log(`[landing-registry] global role pages: ${globalRoles.length}`);
  console.log(`[landing-registry] total target pages: ${roleLocation.length + globalRoles.length}`);

  if (errors.length > 0) {
    console.error("[landing-registry] validation errors:");
    for (const error of errors) console.error(` - ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log("[landing-registry] validation passed.");
}

main();

