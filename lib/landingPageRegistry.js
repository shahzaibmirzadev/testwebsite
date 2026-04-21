const LOCATION_LABEL_BY_SLUG = {
  netherlands: "Netherlands",
  germany: "Germany",
  uk: "United Kingdom",
  usa: "United States",
};

const ROLE_DEFS = {
  "drone-pilot": {
    slug: "drone-pilot",
    label: "Drone Pilot Jobs",
    includeTerms: ["drone pilot", "uav pilot", "pilot", "rpic", "remote pilot", "uas pilot"],
    excludeTerms: ["warehouse", "forklift", "logistics"],
    relatedRoleSlugs: ["uav-operator", "uav-engineer", "drone-technician"],
    fallbackCompanies: ["Anduril", "Skydio", "Zipline"],
  },
  "uav-operator": {
    slug: "uav-operator",
    label: "UAV Operator Jobs",
    includeTerms: ["uav operator", "drone operator", "operator", "mission specialist", "flight operations"],
    excludeTerms: ["warehouse", "forklift", "logistics"],
    relatedRoleSlugs: ["drone-pilot", "drone-technician", "drone-inspection"],
    fallbackCompanies: ["Anduril", "Wing", "Percepto"],
  },
  "uav-engineer": {
    slug: "uav-engineer",
    label: "UAV Engineer Jobs",
    includeTerms: [
      "uav engineer",
      "drone engineer",
      "autonomy engineer",
      "systems engineer",
      "avionics",
      "robotics",
      "embedded",
    ],
    excludeTerms: ["sales engineer", "support engineer"],
    relatedRoleSlugs: ["uav-operator", "drone-technician", "drone-mapping"],
    fallbackCompanies: ["Skydio", "Zipline", "AeroVironment"],
  },
  "drone-technician": {
    slug: "drone-technician",
    label: "Drone Technician Jobs",
    includeTerms: ["drone technician", "uav technician", "maintenance", "repair", "field technician", "assembly"],
    excludeTerms: ["it technician", "lab technician"],
    relatedRoleSlugs: ["uav-operator", "uav-engineer", "drone-pilot"],
    fallbackCompanies: ["Zipline", "Skydio", "Wing"],
  },
  "drone-inspection": {
    slug: "drone-inspection",
    label: "Drone Inspection Jobs",
    includeTerms: ["inspection", "inspector", "asset monitoring", "infrastructure inspection", "utility inspection"],
    excludeTerms: ["quality inspector", "warehouse inspector"],
    relatedRoleSlugs: ["drone-pilot", "uav-operator", "drone-mapping"],
    fallbackCompanies: ["Percepto", "Skydio", "Flyability"],
  },
  "bvlos-pilot": {
    slug: "bvlos-pilot",
    label: "BVLOS Pilot Jobs",
    includeTerms: ["bvlos", "beyond visual line of sight", "remote pilot"],
    excludeTerms: [],
    relatedRoleSlugs: ["drone-pilot", "uav-operator", "uav-engineer"],
    fallbackCompanies: ["Zipline", "Wing", "Matternet"],
  },
  "drone-mapping": {
    slug: "drone-mapping",
    label: "Drone Mapping Jobs",
    includeTerms: ["mapping", "survey", "surveyor", "geospatial", "photogrammetry", "gis"],
    excludeTerms: [],
    relatedRoleSlugs: ["drone-inspection", "uav-operator", "drone-pilot"],
    fallbackCompanies: ["DroneDeploy", "Wingtra", "Skycatch"],
  },
  "fpv-drone": {
    slug: "fpv-drone",
    label: "FPV Drone Jobs",
    includeTerms: ["fpv", "first person view", "cinelifter", "acrobatic pilot"],
    excludeTerms: [],
    relatedRoleSlugs: ["drone-pilot", "uav-operator", "drone-mapping"],
    fallbackCompanies: ["DJI", "Skydio", "Parrot"],
  },
  "drone-jobs": {
    slug: "drone-jobs",
    label: "Drone Jobs",
    includeTerms: [],
    excludeTerms: [],
    relatedRoleSlugs: ["drone-pilot", "uav-operator", "uav-engineer"],
    fallbackCompanies: ["Anduril", "Skydio", "Zipline"],
  },
};

const NEARBY_MARKETS_BY_LOCATION = {
  netherlands: ["germany", "uk", "usa"],
  germany: ["netherlands", "uk", "usa"],
  uk: ["netherlands", "germany", "usa"],
  usa: ["uk", "germany", "netherlands"],
};

const ROLE_LOCATION_PAGE_ROWS = [
  {
    roleSlug: "drone-pilot",
    locationSlug: "netherlands",
    blurb:
      "Drone pilot roles in the Netherlands are shaped by inspection, mapping, and operational deployments. Activity is concentrated around The Hague, where much of the country’s UAV ecosystem is based.",
  },
  {
    roleSlug: "uav-operator",
    locationSlug: "netherlands",
    blurb:
      "UAV operator roles in the Netherlands are centered on field operations, inspections, and commercial drone deployments. Demand is strongest around The Hague and other active operational clusters.",
  },
  {
    roleSlug: "uav-engineer",
    locationSlug: "netherlands",
    blurb:
      "UAV engineering roles in the Netherlands are driven by autonomy, systems integration, and platform development. Demand is strongest near companies building operational and technical drone capabilities.",
  },
  {
    roleSlug: "drone-technician",
    locationSlug: "netherlands",
    blurb:
      "Drone technician roles in the Netherlands focus on maintenance, testing, repair, and hardware readiness. These roles are most relevant in operational markets with active UAV fleets and support teams.",
  },
  {
    roleSlug: "drone-inspection",
    locationSlug: "netherlands",
    blurb:
      "Drone inspection work in the Netherlands is tied to infrastructure, utilities, industrial sites, and commercial asset monitoring. Opportunities are most relevant where operators and service providers are clustered.",
  },
  {
    roleSlug: "bvlos-pilot",
    locationSlug: "netherlands",
    blurb:
      "BVLOS pilot roles in the Netherlands are linked to advanced operations, regulated flight activity, and higher-complexity deployments. These opportunities are typically concentrated around more mature UAV operators.",
  },
  {
    roleSlug: "drone-mapping",
    locationSlug: "netherlands",
    blurb:
      "Drone mapping roles in the Netherlands are driven by surveying, geospatial work, and site documentation. Demand is strongest where commercial operators support construction, land, and infrastructure workflows.",
  },
  {
    roleSlug: "fpv-drone",
    locationSlug: "netherlands",
    blurb:
      "FPV-related drone roles in the Netherlands are more niche and usually tied to specialized capture, demonstrations, or technical piloting work. This page should guide users toward adjacent operational roles when live demand is thin.",
  },
  {
    roleSlug: "drone-pilot",
    locationSlug: "germany",
    blurb:
      "Drone pilot roles in Germany are shaped by inspection, mapping, industrial operations, and public-sector use cases. Opportunities are spread across a larger market with demand tied to both operational service providers and drone-focused companies.",
  },
  {
    roleSlug: "uav-operator",
    locationSlug: "germany",
    blurb:
      "UAV operator jobs in Germany are concentrated around field deployments, commercial operations, and technical flight work. Demand spans industrial regions and major logistics corridors that support a wide mix of operational roles.",
  },
  {
    roleSlug: "uav-engineer",
    locationSlug: "germany",
    blurb:
      "UAV engineering roles in Germany are driven by platform development, robotics, autonomy, and technical integration. Demand is strongest where drone manufacturers and advanced aerospace teams are active.",
  },
  {
    roleSlug: "drone-technician",
    locationSlug: "germany",
    blurb:
      "Drone technician roles in Germany focus on fleet readiness, repair, integration support, and testing. These roles are most relevant in markets with active UAV operators, manufacturers, and deployment teams.",
  },
  {
    roleSlug: "drone-jobs",
    locationSlug: "germany",
    blurb:
      "Germany supports one of Europe’s broader drone job markets across operations, engineering, inspection, and technical support. This page should act as a wide entry point into the country’s UAV hiring landscape.",
  },
  {
    roleSlug: "drone-inspection",
    locationSlug: "germany",
    blurb:
      "Drone inspection roles in Germany are tied to industrial assets, utilities, infrastructure, and commercial monitoring work. Demand is strongest where UAV operators support enterprise and field inspection workflows.",
  },
  {
    roleSlug: "bvlos-pilot",
    locationSlug: "germany",
    blurb:
      "BVLOS pilot roles in Germany are tied to advanced mission profiles and more regulated operational environments. These positions tend to appear in higher-complexity UAV programs and mature flight operations teams.",
  },
  {
    roleSlug: "drone-mapping",
    locationSlug: "germany",
    blurb:
      "Drone mapping jobs in Germany are connected to surveying, construction, geospatial services, and site intelligence. Opportunities are strongest where UAV operations support technical data capture.",
  },
  {
    roleSlug: "drone-pilot",
    locationSlug: "uk",
    blurb:
      "Drone pilot roles in the UK are driven by inspection, surveying, media-adjacent operations, and commercial field deployments. This market supports a mix of operator-led work and technical UAV roles.",
  },
  {
    roleSlug: "uav-operator",
    locationSlug: "uk",
    blurb:
      "UAV operator jobs in the UK are focused on field execution, inspections, and commercial flight operations. Demand is strongest where drone services are tied to infrastructure, surveying, and enterprise use cases.",
  },
  {
    roleSlug: "uav-engineer",
    locationSlug: "uk",
    blurb:
      "UAV engineering roles in the UK are linked to autonomy, systems integration, technical development, and aerospace-adjacent innovation. This page should position engineering as distinct from operational pilot roles.",
  },
  {
    roleSlug: "drone-technician",
    locationSlug: "uk",
    blurb:
      "Drone technician jobs in the UK focus on maintenance, diagnostics, flight readiness, and hardware support. These roles are most relevant where active fleets or advanced UAV systems are being deployed.",
  },
  {
    roleSlug: "drone-jobs",
    locationSlug: "uk",
    blurb:
      "The UK drone market spans operations, engineering, inspection, and technical support across commercial and public-sector applications. This page should serve as a broad entry point into UK UAV hiring.",
  },
  {
    roleSlug: "drone-inspection",
    locationSlug: "uk",
    blurb:
      "Drone inspection jobs in the UK are tied to infrastructure, utilities, industrial monitoring, and asset documentation. Demand is strongest where UAV operators support repeat commercial workflows.",
  },
  {
    roleSlug: "bvlos-pilot",
    locationSlug: "uk",
    blurb:
      "BVLOS pilot roles in the UK are associated with higher-complexity drone operations and regulated flight programs. These opportunities are more specialized and should connect users to adjacent operational roles where useful.",
  },
  {
    roleSlug: "drone-mapping",
    locationSlug: "uk",
    blurb:
      "Drone mapping jobs in the UK are driven by geospatial capture, surveying, and site analysis. These roles are most relevant where UAV data supports construction, land, and infrastructure workflows.",
  },
  {
    roleSlug: "drone-pilot",
    locationSlug: "usa",
    blurb:
      "Drone pilot roles in the United States cover a broad mix of inspection, mapping, field operations, and specialized deployments. This is a larger and more fragmented market, so users should also be guided toward adjacent roles and strong employer pages.",
  },
  {
    roleSlug: "uav-operator",
    locationSlug: "usa",
    blurb:
      "UAV operator jobs in the United States are tied to operational flying, mission execution, inspections, and technical field work. Demand is broad and should be framed as part of a larger, active UAV market.",
  },
  {
    roleSlug: "uav-engineer",
    locationSlug: "usa",
    blurb:
      "UAV engineering roles in the United States are driven by autonomy, robotics, avionics, systems integration, and platform development. This page should clearly target engineering users rather than operational pilots.",
  },
  {
    roleSlug: "drone-technician",
    locationSlug: "usa",
    blurb:
      "Drone technician jobs in the United States focus on maintenance, hardware support, troubleshooting, and fleet readiness. These roles are especially relevant in larger operational and manufacturing environments.",
  },
  {
    roleSlug: "drone-jobs",
    locationSlug: "usa",
    blurb:
      "The US drone market supports one of the broadest hiring landscapes across piloting, engineering, operations, inspection, and support roles. This page should act as a broad discovery page for the full UAV job market.",
  },
  {
    roleSlug: "drone-inspection",
    locationSlug: "usa",
    blurb:
      "Drone inspection roles in the United States are tied to infrastructure, utilities, construction, industrial sites, and enterprise asset monitoring. This page should connect inspection demand to operational and technical adjacent roles.",
  },
  {
    roleSlug: "bvlos-pilot",
    locationSlug: "usa",
    blurb:
      "BVLOS pilot jobs in the United States are linked to advanced commercial operations, technical mission profiles, and more mature deployment programs. These roles should be presented as more specialized than standard pilot listings.",
  },
  {
    roleSlug: "drone-mapping",
    locationSlug: "usa",
    blurb:
      "Drone mapping roles in the United States are driven by surveying, geospatial workflows, land documentation, and site intelligence. This page should connect users to both technical capture roles and adjacent operational markets.",
  },
];

const GLOBAL_ROLE_PAGE_ROWS = [
  {
    roleSlug: "drone-pilot",
    title: "Drone Pilot Jobs",
    blurb:
      "Drone pilot jobs span inspection, mapping, field operations, and commercial flight work across multiple markets. This page should help users branch into the strongest countries, nearby markets, and adjacent UAV roles.",
  },
  {
    roleSlug: "uav-operator",
    title: "UAV Operator Jobs",
    blurb:
      "UAV operator jobs focus on mission execution, field deployments, inspections, and day-to-day drone operations. This page should clearly separate operator work from engineering-heavy paths.",
  },
  {
    roleSlug: "uav-engineer",
    title: "UAV Engineer Jobs",
    blurb:
      "UAV engineering jobs are centered on autonomy, systems integration, hardware, software, and platform development. This page should connect users to the strongest engineering markets and adjacent robotics roles.",
  },
  {
    roleSlug: "drone-technician",
    title: "Drone Technician Jobs",
    blurb:
      "Drone technician jobs support maintenance, testing, troubleshooting, and fleet readiness across UAV operations. This page should position technician work as a practical adjacent path to both operator and engineering roles.",
  },
  {
    roleSlug: "drone-inspection",
    title: "Drone Inspection Jobs",
    blurb:
      "Drone inspection jobs are tied to commercial asset monitoring, infrastructure, utilities, and industrial site workflows. This page should guide users toward the strongest operational markets and inspection-heavy employers.",
  },
  {
    roleSlug: "drone-mapping",
    title: "Drone Mapping Jobs",
    blurb:
      "Drone mapping jobs focus on surveying, geospatial capture, and aerial site documentation. This page should connect mapping demand to the countries and employers where technical UAV data work is most relevant.",
  },
  {
    roleSlug: "bvlos-pilot",
    title: "BVLOS Pilot Jobs",
    blurb:
      "BVLOS pilot jobs are associated with advanced drone operations, regulated missions, and more specialized flight programs. This page should present BVLOS as a narrower but higher-complexity operational path.",
  },
  {
    roleSlug: "drone-jobs",
    title: "Drone Jobs",
    blurb:
      "Drone jobs span piloting, operations, engineering, inspection, mapping, and technical support across multiple markets. This page should serve as the broadest discovery layer and route users into the most relevant role and location pages.",
  },
];

function getRoleDef(roleSlug) {
  return ROLE_DEFS[String(roleSlug || "").trim().toLowerCase()] || null;
}

function getLocationLabel(locationSlug) {
  return LOCATION_LABEL_BY_SLUG[String(locationSlug || "").trim().toLowerCase()] || String(locationSlug || "").trim();
}

function compactLabel(label) {
  return String(label || "").replace(/\s+jobs$/i, "").trim();
}

export function getLandingRoleDefinitions() {
  return Object.values(ROLE_DEFS).map((x) => ({ ...x }));
}

export function getGlobalRolePageConfigs() {
  return GLOBAL_ROLE_PAGE_ROWS.map((row) => {
    const role = getRoleDef(row.roleSlug);
    const title = row.title;
    return {
      roleSlug: row.roleSlug,
      roleLabel: role?.label || `${title} Jobs`,
      title,
      heroBlurb: row.blurb,
      seoTitle: `${title} (2026) | DroneRoles`,
      seoDescription: row.blurb,
      includeTerms: role?.includeTerms || [],
      excludeTerms: role?.excludeTerms || [],
      relatedRoleSlugs: role?.relatedRoleSlugs || [],
      focusCountries: ["netherlands", "germany", "uk", "usa"],
    };
  });
}

function buildRoleLocationConfig(row, availableKeys) {
  const role = getRoleDef(row.roleSlug);
  if (!role) return null;
  const locationSlug = String(row.locationSlug || "").trim().toLowerCase();
  const locationLabel = getLocationLabel(locationSlug);
  const nearbyLocations = (NEARBY_MARKETS_BY_LOCATION[locationSlug] || []).filter((slug) => slug !== locationSlug);
  const relatedRoleLocationLinks = role.relatedRoleSlugs
    .map((adjacentSlug) => {
      const adjacentRole = getRoleDef(adjacentSlug);
      if (!adjacentRole) return null;
      return {
        roleSlug: adjacentSlug,
        roleLabel: adjacentRole.label,
        locationSlug,
        locationLabel,
      };
    })
    .filter(Boolean)
    .slice(0, 3);

  const relatedLocationLinks = nearbyLocations
    .map((marketSlug) => {
      const key = `${row.roleSlug}:${marketSlug}`;
      if (!availableKeys.has(key)) return null;
      return {
        roleSlug: row.roleSlug,
        roleLabel: role.label,
        locationSlug: marketSlug,
        locationLabel: getLocationLabel(marketSlug),
      };
    })
    .filter(Boolean)
    .slice(0, 3);

  const title = `${compactLabel(role.label)} Jobs in ${locationLabel}`;
  const seoDescription = row.blurb;

  return {
    roleSlug: row.roleSlug,
    roleLabel: role.label,
    locationSlug,
    locationLabel,
    roleTitleIncludeTerms: role.includeTerms,
    roleTitleExcludeTerms: role.excludeTerms,
    relatedRoleLocationLinks,
    relatedLocationLinks,
    fallbackCompanies: role.fallbackCompanies,
    heroBlurb: row.blurb,
    seoTitle: `${title} (2026) | DroneRoles`,
    seoDescription,
  };
}

export function getRoleLocationLandingConfigs() {
  const availableKeys = new Set(
    ROLE_LOCATION_PAGE_ROWS.map((row) => `${String(row.roleSlug)}:${String(row.locationSlug)}`)
  );
  return ROLE_LOCATION_PAGE_ROWS.map((row) => buildRoleLocationConfig(row, availableKeys)).filter(Boolean);
}

export function getRoleLocationLandingConfig(roleSlug, locationSlug) {
  const role = String(roleSlug || "").trim().toLowerCase();
  const location = String(locationSlug || "").trim().toLowerCase();
  return (
    getRoleLocationLandingConfigs().find(
      (config) => config.roleSlug === role && config.locationSlug === location
    ) || null
  );
}

export function validateLandingRegistry() {
  const errors = [];
  const roleLocation = getRoleLocationLandingConfigs();
  const globalRoles = getGlobalRolePageConfigs();

  const dupRoleLocation = new Set();
  for (const config of roleLocation) {
    const key = `${config.roleSlug}:${config.locationSlug}`;
    if (dupRoleLocation.has(key)) errors.push(`duplicate role-location config: ${key}`);
    dupRoleLocation.add(key);
    if (!config.heroBlurb) errors.push(`missing hero blurb: ${key}`);
    if (!config.seoDescription) errors.push(`missing seo description: ${key}`);
  }

  const blurbs = new Map();
  for (const config of [...roleLocation, ...globalRoles]) {
    const key = String(config.heroBlurb || "").trim().toLowerCase();
    const pageKey = config.locationSlug
      ? `${config.roleSlug}/${config.locationSlug}`
      : `${config.roleSlug}`;
    if (!key) continue;
    if (blurbs.has(key)) errors.push(`duplicate blurb: ${pageKey} and ${blurbs.get(key)}`);
    else blurbs.set(key, pageKey);
  }

  return errors;
}

