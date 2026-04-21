import assert from "node:assert/strict";

import * as sectorLogicModule from "../lib/sectorLogic.js";
import * as categoryPagesModule from "../lib/categoryPages.js";

const matchesSectorId =
  sectorLogicModule.matchesSectorId ||
  sectorLogicModule.default?.matchesSectorId;

const CATEGORY_PAGES =
  categoryPagesModule.CATEGORY_PAGES ||
  categoryPagesModule.default?.CATEGORY_PAGES;

/**
 * Minimal fixture builder for sector/category regression checks.
 * @param {{
 *   title: string,
 *   description?: string,
 *   location?: string,
 *   job_family?: string,
 *   tags?: string[]|string
 * }} input
 */
function job(input) {
  return {
    title: input.title,
    description: input.description || "",
    location: input.location || "",
    job_family: input.job_family || "other",
    tags: input.tags || [],
  };
}

function runSectorCases() {
  const cases = [
    {
      name: "pilot_true_remote_pilot_title",
      sector: "pilot",
      expected: true,
      job: job({ title: "Remote Pilot - UAS Operations", description: "Operate UAV systems", job_family: "pilot" }),
    },
    {
      name: "pilot_false_program_manager_safety",
      sector: "pilot",
      expected: false,
      job: job({
        title: "Senior Program Manager, Standards and Safety",
        description: "Support flight operations and pilot training in test environments for UAS programs",
        job_family: "other",
      }),
    },
    {
      name: "pilot_false_compliance_title",
      sector: "pilot",
      expected: false,
      job: job({
        title: "Flight Safety Compliance Manager",
        description: "Pilot procedures and operations governance",
        job_family: "other",
      }),
    },
    {
      name: "operations_true_uav_operator",
      sector: "operations",
      expected: true,
      job: job({
        title: "UAV Operator",
        description: "Mission operations for drone deployments",
        job_family: "operator",
        tags: ["uav", "operations"],
      }),
    },
    {
      name: "operations_false_generic_operations_no_drone_signal",
      sector: "operations",
      expected: false,
      job: job({
        title: "Operations Manager",
        description: "Own manufacturing operations and process excellence",
        job_family: "other",
      }),
    },
    {
      name: "testing_true_flight_test_engineer",
      sector: "testing",
      expected: true,
      job: job({
        title: "Flight Test Engineer",
        description: "Execute flight test campaigns for unmanned aircraft",
        job_family: "testing",
      }),
    },
    {
      name: "testing_false_generic_test_no_drone_signal",
      sector: "testing",
      expected: false,
      job: job({
        title: "Program Test Coordinator",
        description: "Create test plans and acceptance criteria for enterprise software",
        job_family: "other",
      }),
    },
    {
      name: "engineering_true_systems_engineer",
      sector: "engineering",
      expected: true,
      job: job({
        title: "Systems Engineer",
        description: "UAS avionics and controls integration",
        job_family: "engineering",
      }),
    },
    {
      name: "defense_true_military_uas",
      sector: "defense",
      expected: true,
      job: job({
        title: "Autonomy Engineer",
        description: "Build UAS software for military programs",
      }),
    },
    {
      name: "technician_true_maintenance",
      sector: "technician",
      expected: true,
      job: job({
        title: "UAS Maintenance Technician",
        description: "Repair drone components and perform maintenance",
        job_family: "technician",
      }),
    },
    {
      name: "pilot_true_test_pilot_title",
      sector: "pilot",
      expected: true,
      job: job({
        title: "Test Pilot - UAV",
        description: "Execute flight tests for unmanned systems",
      }),
    },
    {
      name: "pilot_false_pilot_program_manager",
      sector: "pilot",
      expected: false,
      job: job({
        title: "Pilot Program Manager",
        description: "Manage program milestones and reporting",
      }),
    },
    {
      name: "operations_true_mission_ops_with_drone_signal",
      sector: "operations",
      expected: true,
      job: job({
        title: "Mission Operations Specialist",
        description: "Support unmanned aircraft mission execution",
      }),
    },
    {
      name: "operations_false_mission_ops_no_drone_signal",
      sector: "operations",
      expected: false,
      job: job({
        title: "Mission Operations Specialist",
        description: "Support satellite communication operations",
      }),
    },
    {
      name: "testing_true_verification_engineer_drone_context",
      sector: "testing",
      expected: true,
      job: job({
        title: "Verification Engineer",
        description: "Verification and validation for UAV flight software",
      }),
    },
    {
      name: "testing_false_verification_no_drone_context",
      sector: "testing",
      expected: false,
      job: job({
        title: "Verification Engineer",
        description: "Verification and validation for fintech platform APIs",
      }),
    },
    {
      name: "software_true_embedded_software",
      sector: "software",
      expected: true,
      job: job({
        title: "Embedded Software Engineer",
        description: "C++ and Python on UAV onboard compute",
      }),
    },
    {
      name: "hardware_true_avionics",
      sector: "hardware",
      expected: true,
      job: job({
        title: "Avionics Engineer",
        description: "Hardware integration for unmanned aircraft systems",
      }),
    },
    {
      name: "defense_false_non_defense_context",
      sector: "defense",
      expected: false,
      job: job({
        title: "Product Engineer",
        description: "Build robotics tools for warehouse automation",
      }),
    },
    {
      name: "engineering_false_without_engineering_signals",
      sector: "engineering",
      expected: false,
      job: job({
        title: "Customer Success Manager",
        description: "Manage enterprise onboarding and renewals",
      }),
    },
  ];

  for (const testCase of cases) {
    const actual = matchesSectorId(testCase.job, testCase.sector);
    assert.equal(
      actual,
      testCase.expected,
      `Sector case failed: ${testCase.name} (sector=${testCase.sector}, expected=${testCase.expected}, got=${actual})`
    );
  }
}

function runCategoryCases() {
  const dronePilotMatch = CATEGORY_PAGES["drone-pilot"]?.match;
  const uavOperatorMatch = CATEGORY_PAGES["uav-operator"]?.match;
  const flightTestMatch = CATEGORY_PAGES["flight-test"]?.match;
  const defenseMatch = CATEGORY_PAGES["defense-drone-jobs"]?.match;
  const mappingMatch = CATEGORY_PAGES["mapping-surveying-drone-jobs"]?.match;
  const inspectionMatch = CATEGORY_PAGES["inspection-drone-jobs"]?.match;
  const deliveryMatch = CATEGORY_PAGES["delivery-logistics-drone-jobs"]?.match;
  const entryMatch = CATEGORY_PAGES["entry-level-drone-jobs"]?.match;
  const seniorMatch = CATEGORY_PAGES["senior-drone-jobs"]?.match;

  assert.equal(typeof dronePilotMatch, "function", "drone-pilot category matcher should exist");
  assert.equal(typeof uavOperatorMatch, "function", "uav-operator category matcher should exist");
  assert.equal(typeof flightTestMatch, "function", "flight-test category matcher should exist");
  assert.equal(typeof defenseMatch, "function", "defense-drone-jobs category matcher should exist");
  assert.equal(typeof mappingMatch, "function", "mapping-surveying-drone-jobs category matcher should exist");
  assert.equal(typeof inspectionMatch, "function", "inspection-drone-jobs category matcher should exist");
  assert.equal(typeof deliveryMatch, "function", "delivery-logistics-drone-jobs category matcher should exist");
  assert.equal(typeof entryMatch, "function", "entry-level-drone-jobs category matcher should exist");
  assert.equal(typeof seniorMatch, "function", "senior-drone-jobs category matcher should exist");

  const pilotPositive = job({
    title: "Drone Pilot",
    description: "Operate UAV platforms in field missions",
    job_family: "pilot",
  });
  const pilotNegative = job({
    title: "Senior Program Manager, Standards and Safety",
    description: "Oversee pilot procedures and flight operations policies",
    job_family: "other",
  });

  assert.equal(dronePilotMatch(pilotPositive), true, "drone-pilot category should include true pilot roles");
  assert.equal(dronePilotMatch(pilotNegative), false, "drone-pilot category should exclude management/safety non-pilot roles");

  const operatorPositive = job({
    title: "UAS Operator",
    description: "Flight operations for drone deployment missions",
    job_family: "operator",
  });
  const operatorNegative = job({
    title: "Operations Manager",
    description: "Lead fulfillment operations for e-commerce distribution",
    job_family: "other",
  });
  assert.equal(uavOperatorMatch(operatorPositive), true, "uav-operator category should include real operator roles");
  assert.equal(uavOperatorMatch(operatorNegative), false, "uav-operator category should exclude generic operations roles");

  const flightTestPositive = job({
    title: "Flight Test Engineer",
    description: "Qualification testing on unmanned systems",
    tags: ["flight-test", "uav"],
  });
  const flightTestNegative = job({
    title: "QA Analyst",
    description: "Website testing and bug verification",
    tags: ["qa"],
  });
  assert.equal(flightTestMatch(flightTestPositive), true, "flight-test category should include true flight test roles");
  assert.equal(flightTestMatch(flightTestNegative), false, "flight-test category should exclude generic QA roles");

  const defensePositive = job({
    title: "Systems Engineer",
    description: "Military UAS mission software",
    tags: ["defense"],
  });
  const defenseNegative = job({
    title: "Warehouse Engineer",
    description: "Automation systems for retail logistics",
  });
  assert.equal(defenseMatch(defensePositive), true, "defense category should include military/defense roles");
  assert.equal(defenseMatch(defenseNegative), false, "defense category should exclude non-defense roles");

  const mappingPositive = job({
    title: "UAV Survey Pilot",
    description: "Photogrammetry and geospatial mission planning",
    tags: ["mapping", "surveying"],
  });
  const mappingNegative = job({
    title: "Computer Vision Engineer",
    description: "Perception models for autonomous navigation",
    tags: ["autonomy"],
  });
  assert.equal(mappingMatch(mappingPositive), true, "mapping category should include mapping/survey roles");
  assert.equal(mappingMatch(mappingNegative), false, "mapping category should exclude unrelated autonomy-only roles");

  const inspectionPositive = job({
    title: "Drone Inspection Pilot",
    description: "Utility inspection flights for powerline assets",
    tags: ["inspection", "uav"],
  });
  const inspectionNegative = job({
    title: "Asset Manager",
    description: "Manage enterprise software assets and compliance records",
    tags: ["asset"],
  });
  assert.equal(inspectionMatch(inspectionPositive), true, "inspection category should require drone + inspection context");
  assert.equal(inspectionMatch(inspectionNegative), false, "inspection category should exclude generic asset roles");

  const deliveryPositive = job({
    title: "UAS Delivery Operations Specialist",
    description: "Last-mile drone delivery mission planning",
    tags: ["delivery", "uas"],
  });
  const deliveryNegative = job({
    title: "Logistics Analyst",
    description: "Warehouse and trucking logistics optimization",
    tags: ["logistics"],
  });
  assert.equal(deliveryMatch(deliveryPositive), true, "delivery category should require drone + delivery context");
  assert.equal(deliveryMatch(deliveryNegative), false, "delivery category should exclude non-drone logistics roles");

  const entryPositive = job({
    title: "Junior UAV Systems Engineer",
    description: "Work with senior team members on UAS software",
  });
  const entryNegative = job({
    title: "UAV Systems Engineer",
    description: "Mentor junior engineers and interns",
  });
  assert.equal(entryMatch(entryPositive), true, "entry category should use title-level junior signals");
  assert.equal(entryMatch(entryNegative), false, "entry category should not match description-only junior mentions");

  const seniorPositive = job({
    title: "Senior UAS Integration Engineer",
    description: "Build flight-critical integration pipelines",
  });
  const seniorNegative = job({
    title: "UAS Integration Engineer",
    description: "Collaborate with senior staff and lead engineers",
  });
  assert.equal(seniorMatch(seniorPositive), true, "senior category should use title-level senior signals");
  assert.equal(seniorMatch(seniorNegative), false, "senior category should not match description-only senior mentions");
}

function main() {
  assert.equal(typeof matchesSectorId, "function", "matchesSectorId should be available");
  assert.equal(typeof CATEGORY_PAGES, "object", "CATEGORY_PAGES should be available");
  runSectorCases();
  runCategoryCases();
  console.log("classification regression tests passed");
}

main();
