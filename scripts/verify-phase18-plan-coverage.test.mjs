import assert from "node:assert/strict";
import test from "node:test";

import {
  EXPECTED_DECISIONS,
  EXPECTED_PLAN_MANIFEST,
  EXPECTED_REQUIREMENTS,
  findExecutableExclusionViolations,
  verifyPhase18PlanCoverage,
} from "./verify-phase18-plan-coverage.mjs";

const projectRoot = process.cwd();

test("the Phase 18 source set covers every requirement, decision, plan, dependency, wave, and selected transport fact", async () => {
  const report = await verifyPhase18PlanCoverage(projectRoot);

  assert.equal(report.planCount, 14);
  assert.deepEqual(report.plans, Object.keys(EXPECTED_PLAN_MANIFEST));
  assert.deepEqual(report.requirements, EXPECTED_REQUIREMENTS);
  assert.deepEqual(report.decisions, EXPECTED_DECISIONS);
  assert.ok(report.executableTaskCount >= 14);
  assert.ok(report.transportFactCount >= 20);
  assert.deepEqual(report.executableExclusionViolations, []);
});

test("every stale executable architecture family is rejected", () => {
  const staleExecutableFixtures = [
    ["manual-file", "<action>Implement a manual FIT decoder and file picker.</action>"],
    ["official-provider", "<action>Build the official Garmin partner Activity API integration.</action>"],
    ["broker", "<action>Deploy an OAuth broker for Garmin requests.</action>"],
    ["desktop-bridge", "<action>Add a desktop helper and Drive inbox bridge.</action>"],
    ["generic-bridge", "<action>Expose a generic bridge with arbitrary method forwarding.</action>"],
    ["runtime-agent", "<action>Start a runtime AI agent inside the installed app.</action>"],
    ["server", "<action>Start a local HTTP server for Garmin sync.</action>"],
    ["installer", "<action>Add an on-device pip installer for Python packages.</action>"],
    ["js-engine", "<action>Switch the JavaScript engine from Hermes for Garmin.</action>"],
  ];

  for (const [family, task] of staleExecutableFixtures) {
    assert.deepEqual(
      findExecutableExclusionViolations(task).map((violation) => violation.family),
      [family],
      family,
    );
  }
});

test("explicit exclusion documentation is allowed inside implementation tasks", () => {
  const exclusions = `
    <action>
      Do not add manual FIT decoding, an official provider API, an OAuth broker,
      a desktop or Drive bridge, a generic bridge, a runtime AI agent, a local
      HTTP server, an on-device pip installer, or a JavaScript-engine switch.
      These paths are outside this milestone and must remain prohibited.
    </action>
  `;

  assert.deepEqual(findExecutableExclusionViolations(exclusions), []);
});
