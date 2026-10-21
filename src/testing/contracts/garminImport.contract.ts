export type GarminAcceptanceConcern =
  | "packaging"
  | "canonicalization"
  | "sync"
  | "detail"
  | "matching"
  | "portability"
  | "lifecycle"
  | "appearance"
  | "accessibility"
  | "process-boundary"
  | "privacy";

type HostAcceptanceCase = Readonly<{
  id: `P18-HOST-${string}`;
  concern: Exclude<GarminAcceptanceConcern, "packaging">;
  disposition: "execute-host";
  dataPolicy: "synthetic-redacted-only";
}>;

type NativeAcceptanceCase = Readonly<{
  id: `P18-NATIVE-${string}`;
  concern: GarminAcceptanceConcern;
  disposition: "require-native-artifact";
  ownerPlan: "18-03" | "18-13";
  artifact: string;
  dataPolicy: "privacy-scanned-exact-artifact";
}>;

export type GarminAcceptanceCase =
  | HostAcceptanceCase
  | NativeAcceptanceCase;

const hostCase = (
  id: HostAcceptanceCase["id"],
  concern: HostAcceptanceCase["concern"],
): HostAcceptanceCase => Object.freeze({
  id,
  concern,
  disposition: "execute-host",
  dataPolicy: "synthetic-redacted-only",
});

export const GARMIN_ACCEPTANCE_CASES = Object.freeze([
  hostCase("P18-HOST-CANONICAL-MANIFEST", "canonicalization"),
  hostCase("P18-HOST-SYNC-BOUNDED", "sync"),
  hostCase("P18-HOST-SYNC-REPLAY", "sync"),
  hostCase("P18-HOST-SYNC-REVISION", "sync"),
  hostCase("P18-HOST-DETAIL-OUTDOOR", "detail"),
  hostCase("P18-HOST-DETAIL-TREADMILL", "detail"),
  hostCase("P18-HOST-DETAIL-LAPS", "detail"),
  hostCase("P18-HOST-MATCH-CANDIDATES", "matching"),
  hostCase("P18-HOST-MATCH-CONFIRM", "matching"),
  hostCase("P18-HOST-PORTABILITY", "portability"),
  hostCase("P18-HOST-LOGOUT-HISTORY", "lifecycle"),
  hostCase("P18-HOST-APPEARANCE-LIGHT", "appearance"),
  hostCase("P18-HOST-APPEARANCE-DARK", "appearance"),
  hostCase("P18-HOST-APPEARANCE-SYSTEM", "appearance"),
  hostCase("P18-HOST-ACCESSIBILITY", "accessibility"),
  hostCase("P18-HOST-PROCESS-BOUNDARIES", "process-boundary"),
  hostCase("P18-HOST-PRIVACY", "privacy"),
  Object.freeze({
    id: "P18-NATIVE-18-03-REAL-ACCOUNT",
    concern: "packaging",
    disposition: "require-native-artifact",
    ownerPlan: "18-03",
    artifact: "artifacts/native/phase18-garmin-proof/final-evidence.json",
    dataPolicy: "privacy-scanned-exact-artifact",
  }),
  Object.freeze({
    id: "P18-NATIVE-18-13-ADVERSARIAL",
    concern: "lifecycle",
    disposition: "require-native-artifact",
    ownerPlan: "18-13",
    artifact: "artifacts/native/phase18-garmin-adversarial/final-evidence.json",
    dataPolicy: "privacy-scanned-exact-artifact",
  }),
] as const satisfies readonly GarminAcceptanceCase[]);

export const PHASE18_GARMIN_ACCEPTANCE_CASE_IDS = Object.freeze(
  GARMIN_ACCEPTANCE_CASES.map(({ id }) => id),
);

export const GARMIN_ACCEPTANCE_HOST_CASE_IDS = Object.freeze(
  GARMIN_ACCEPTANCE_CASES
    .filter((entry) => entry.disposition === "execute-host")
    .map(({ id }) => id),
);

export const GARMIN_ACCEPTANCE_NATIVE_PREREQUISITE_IDS = Object.freeze(
  GARMIN_ACCEPTANCE_CASES
    .filter((entry) => entry.disposition === "require-native-artifact")
    .map(({ id }) => id),
);

export type GarminAcceptanceHostCaseId =
  Extract<
    typeof GARMIN_ACCEPTANCE_CASES[number],
    Readonly<{ disposition: "execute-host" }>
  >["id"];
export type GarminAcceptanceNativePrerequisiteId =
  Extract<
    typeof GARMIN_ACCEPTANCE_CASES[number],
    Readonly<{ disposition: "require-native-artifact" }>
  >["id"];

/**
 * Real-SQLite Garmin source facts reused by the aggregate v1.2 contract.
 * These are deliberately the existing Phase 13/portable case identities,
 * rather than a second set of labels which could pass without executing the
 * concrete import, match, replay, restore, and merge boundaries.
 */
export const GARMIN_SQLITE_ACCEPTANCE_CASE_IDS = [
  "phase13-import-normalized-identity",
  "phase13-import-remove-restore",
  "phase13-match-invalidation",
  "phase13-stale-replay-no-resurrection",
  "portable-merge-garmin-clean-restore",
  "portable-merge-garmin-exact-repeat-noop",
  "portable-merge-garmin-conflict-isolation",
  "portable-merge-garmin-remap-tombstone-match",
  "portable-merge-garmin-tamper-capacity-rollback",
] as const;

type GarminSqliteSourceResult = Readonly<{
  status: "passed" | "failed";
  cases: readonly Readonly<{ id: string; status: "passed" | "failed" }>[];
}>;

export type GarminSqliteAcceptanceContractResult = Readonly<{
  status: "passed" | "failed";
  total: number;
  passed: number;
  failed: number;
  skipped: 0;
  cases: readonly Readonly<{
    id: typeof GARMIN_SQLITE_ACCEPTANCE_CASE_IDS[number];
    status: "passed" | "failed";
  }>[];
}>;

export function runGarminSqliteAcceptanceContract(input: Readonly<{
  multiPlanRunning: GarminSqliteSourceResult;
  portableMerge: GarminSqliteSourceResult;
}>): GarminSqliteAcceptanceContractResult {
  const sources = [input.multiPlanRunning, input.portableMerge];
  const cases = GARMIN_SQLITE_ACCEPTANCE_CASE_IDS.map((id) => {
    const matches = sources.flatMap((source) => source.cases).filter((entry) => entry.id === id);
    if (matches.length !== 1 || matches[0]!.status !== "passed") {
      throw new Error("garmin_sqlite_acceptance_source_invalid");
    }
    return Object.freeze({ id, status: "passed" as const });
  });
  if (sources.some(({ status }) => status !== "passed")) {
    throw new Error("garmin_sqlite_acceptance_source_invalid");
  }
  return Object.freeze({
    status: "passed",
    total: cases.length,
    passed: cases.length,
    failed: 0,
    skipped: 0,
    cases: Object.freeze(cases),
  });
}
