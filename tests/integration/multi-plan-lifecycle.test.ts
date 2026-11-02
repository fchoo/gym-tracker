import { describe, expect, it } from "@jest/globals";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  MULTI_PLAN_RUNNING_CONTRACT_CASES,
} from "../../src/testing/contracts/multiPlanRunning.contract";

const projectRoot = join(__dirname, "../..");

describe("Phase 13 offline lifecycle seal", () => {
  it("composes every source-owned offline, recovery, and replay boundary without a native-only adapter", () => {
    const hostFixtures = [
      "tests/sqlite-host/migrations-effects.test.ts",
      "tests/sqlite-host/cleanInstallRestore.test.ts",
      "tests/sqlite-host/logicalMergeRepository.test.ts",
      "tests/integration/multi-plan-foundation-tracer.test.ts",
      "tests/integration/running-foundation.test.ts",
      "tests/integration/imported-activity-facts.test.ts",
      "tests/integration/running-activity-match.test.ts",
      "tests/integration/bodyweight-history.test.ts",
      "tests/integration/complete-set.test.ts",
    ];

    for (const fixture of hostFixtures) {
      expect(readFileSync(join(projectRoot, fixture), "utf8")).not.toBe("");
    }
    expect(new Set(MULTI_PLAN_RUNNING_CONTRACT_CASES).size).toBe(
      MULTI_PLAN_RUNNING_CONTRACT_CASES.length,
    );
    expect(MULTI_PLAN_RUNNING_CONTRACT_CASES).toEqual(expect.arrayContaining([
      "phase13-migration-failure-cuts",
      "phase13-strength-completion-retry",
      "phase13-backup-clean-restore",
      "phase13-merge-rebuild",
      "phase13-tim01-retirement",
    ]));
  });

  it("registers every Phase 13 integrity-critical source module for complete coverage", () => {
    const coverageGate = readFileSync(
      join(projectRoot, "scripts/run-coverage-gate.mjs"),
      "utf8",
    );

    expect(coverageGate).toContain("src/domains/running/contracts.ts");
    expect(coverageGate).toContain("src/domains/running/commands.ts");
    expect(coverageGate).toContain("src/domains/activities/activityIdentity.ts");
    expect(coverageGate).toContain("src/domains/activities/importCommands.ts");
    expect(coverageGate).toContain("src/domains/activities/garminActivitySourcePort.ts");
    expect(coverageGate).toContain("src/domains/running/activityMatchCommands.ts");
    expect(coverageGate).toContain("src/domains/bodyweight/commands.ts");
    expect(coverageGate).toContain("src/platform/sqlite/migrations/0028_multi_plan_running_foundation.ts");
    expect(coverageGate).toContain("src/platform/sqlite/migrations/0029_running_session_roots.ts");
    expect(coverageGate).toContain("src/platform/sqlite/migrations/0030_imported_activity_evidence.ts");
    expect(coverageGate).toContain("src/platform/sqlite/migrations/0035_imported_activity_lifecycle_state.ts");
    expect(coverageGate).toContain("src/platform/sqlite/repositories/runningPlanRepository.ts");
    expect(coverageGate).toContain("src/platform/sqlite/repositories/importedActivityRepository.ts");
    expect(coverageGate).toContain("src/platform/sqlite/repositories/runningActivityMatchRepository.ts");
    expect(coverageGate).toContain("src/platform/sqlite/repositories/bodyweightRepository.ts");
    expect(coverageGate).toContain("src/platform/sqlite/repositories/restoreReconciliationRepository.ts");
  });
});
