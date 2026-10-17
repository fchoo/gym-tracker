import { describe, expect, it } from "@jest/globals";

import {
  GARMIN_ACCEPTANCE_CASES,
  GARMIN_ACCEPTANCE_NATIVE_PREREQUISITE_IDS,
  GARMIN_SQLITE_ACCEPTANCE_CASE_IDS,
  PHASE18_GARMIN_ACCEPTANCE_CASE_IDS,
  runGarminSqliteAcceptanceContract,
} from "./garminImport.contract";

describe("Phase 18 Garmin acceptance contract", () => {
  it("keeps one ordered no-skip ledger across every required acceptance concern", () => {
    expect(PHASE18_GARMIN_ACCEPTANCE_CASE_IDS).toEqual([
      "P18-HOST-CANONICAL-MANIFEST",
      "P18-HOST-SYNC-BOUNDED",
      "P18-HOST-SYNC-REPLAY",
      "P18-HOST-SYNC-REVISION",
      "P18-HOST-DETAIL-OUTDOOR",
      "P18-HOST-DETAIL-TREADMILL",
      "P18-HOST-DETAIL-LAPS",
      "P18-HOST-MATCH-CANDIDATES",
      "P18-HOST-MATCH-CONFIRM",
      "P18-HOST-PORTABILITY",
      "P18-HOST-LOGOUT-HISTORY",
      "P18-HOST-APPEARANCE-LIGHT",
      "P18-HOST-APPEARANCE-DARK",
      "P18-HOST-APPEARANCE-SYSTEM",
      "P18-HOST-ACCESSIBILITY",
      "P18-HOST-PROCESS-BOUNDARIES",
      "P18-HOST-PRIVACY",
      "P18-NATIVE-18-03-REAL-ACCOUNT",
      "P18-NATIVE-18-13-ADVERSARIAL",
    ]);
    expect(new Set(PHASE18_GARMIN_ACCEPTANCE_CASE_IDS).size).toBe(
      PHASE18_GARMIN_ACCEPTANCE_CASE_IDS.length,
    );
    expect(GARMIN_ACCEPTANCE_CASES.map(({ id }) => id)).toEqual(
      PHASE18_GARMIN_ACCEPTANCE_CASE_IDS,
    );
    expect(GARMIN_ACCEPTANCE_CASES.every(({ disposition }) =>
      disposition === "execute-host" || disposition === "require-native-artifact"
    )).toBe(true);
  });

  it("keeps real-account and adversarial native proof separate and never host-owned", () => {
    expect(GARMIN_ACCEPTANCE_NATIVE_PREREQUISITE_IDS).toEqual([
      "P18-NATIVE-18-03-REAL-ACCOUNT",
      "P18-NATIVE-18-13-ADVERSARIAL",
    ]);
    expect(GARMIN_ACCEPTANCE_CASES.slice(-2)).toEqual([
      expect.objectContaining({
        id: "P18-NATIVE-18-03-REAL-ACCOUNT",
        disposition: "require-native-artifact",
        ownerPlan: "18-03",
        artifact: "artifacts/native/phase18-garmin-proof/final-evidence.json",
      }),
      expect.objectContaining({
        id: "P18-NATIVE-18-13-ADVERSARIAL",
        disposition: "require-native-artifact",
        ownerPlan: "18-13",
        artifact: "artifacts/native/phase18-garmin-adversarial/final-evidence.json",
      }),
    ]);
  });

  it("covers packaging, import integrity, UI, lifecycle, accessibility, and privacy", () => {
    expect(new Set(GARMIN_ACCEPTANCE_CASES.map(({ concern }) => concern))).toEqual(
      new Set([
        "packaging",
        "canonicalization",
        "sync",
        "detail",
        "matching",
        "portability",
        "lifecycle",
        "appearance",
        "accessibility",
        "process-boundary",
        "privacy",
      ]),
    );
  });

  it("projects the exact ordered Garmin SQLite acceptance facts without relabeling UI or native prerequisites", () => {
    expect(GARMIN_SQLITE_ACCEPTANCE_CASE_IDS).toEqual([
      "phase13-import-normalized-identity",
      "phase13-import-remove-restore",
      "phase13-match-invalidation",
      "phase13-stale-replay-no-resurrection",
      "portable-merge-garmin-clean-restore",
      "portable-merge-garmin-exact-repeat-noop",
      "portable-merge-garmin-conflict-isolation",
      "portable-merge-garmin-remap-tombstone-match",
      "portable-merge-garmin-tamper-capacity-rollback",
    ]);
    const result = runGarminSqliteAcceptanceContract({
      multiPlanRunning: {
        status: "passed",
        cases: GARMIN_SQLITE_ACCEPTANCE_CASE_IDS.slice(0, 4).map((id) => ({ id, status: "passed" })),
      },
      portableMerge: {
        status: "passed",
        cases: GARMIN_SQLITE_ACCEPTANCE_CASE_IDS.slice(4).map((id) => ({ id, status: "passed" })),
      },
    });

    expect(result).toEqual({
      status: "passed",
      total: GARMIN_SQLITE_ACCEPTANCE_CASE_IDS.length,
      passed: GARMIN_SQLITE_ACCEPTANCE_CASE_IDS.length,
      failed: 0,
      skipped: 0,
      cases: GARMIN_SQLITE_ACCEPTANCE_CASE_IDS.map((id) => ({ id, status: "passed" })),
    });
  });

  it("fails Garmin SQLite facts when an exact concrete source case is missing, duplicated, or failed", () => {
    const multiPlanCases = GARMIN_SQLITE_ACCEPTANCE_CASE_IDS.slice(0, 4)
      .map((id) => ({ id, status: "passed" as const }));
    const portableCases = GARMIN_SQLITE_ACCEPTANCE_CASE_IDS.slice(4)
      .map((id) => ({ id, status: "passed" as const }));
    for (const cases of [
      multiPlanCases.slice(1),
      [...multiPlanCases, multiPlanCases[0]!],
      multiPlanCases.map((entry, index) => index === 0 ? { ...entry, status: "failed" as const } : entry),
    ]) {
      expect(() => runGarminSqliteAcceptanceContract({
        multiPlanRunning: { status: "passed", cases },
        portableMerge: { status: "passed", cases: portableCases },
      })).toThrow("garmin_sqlite_acceptance_source_invalid");
    }
  });
});
