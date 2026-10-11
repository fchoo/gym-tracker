import {
  GARMIN_ACCEPTANCE_HOST_CASE_IDS,
  GARMIN_ACCEPTANCE_NATIVE_PREREQUISITE_IDS,
  type GarminAcceptanceHostCaseId,
} from "./contracts/garminImport.contract";

export const PHASE18_GARMIN_ACCEPTANCE_CONFIRMATION =
  "VERIFY-PHASE18-GARMIN-ACCEPTANCE";

const HASH = /^[a-f0-9]{64}$/u;
const SAFE_SEMANTIC_STATE = /^[a-z][a-z0-9-]{0,63}$/u;
const PRIVATE_TEXT = /(?:@|account|credential|email|external|filename|heart|json|latitude|longitude|password|raw|route|serial|token)/iu;
const RESULT_KEYS = new Set([
  "duration_ms",
  "source_digest",
  "match_digest",
  "semantic_state",
]);

export type Phase18GarminAcceptanceCaseOutput = Readonly<{
  duration_ms: number;
  source_digest?: string;
  match_digest?: string;
  semantic_state?: string;
}>;

type PassedCase = Readonly<Phase18GarminAcceptanceCaseOutput & {
  id: GarminAcceptanceHostCaseId;
  status: "passed";
}>;

type FailedCase = Readonly<{
  id: GarminAcceptanceHostCaseId;
  status: "failed";
  duration_ms: 0;
  code: "acceptance_case_failed" | "acceptance_case_invalid";
}>;

class InvalidAcceptanceCaseOutput extends Error {}

export function phase18GarminAcceptanceEnabled(input: Readonly<{
  buildProfile?: unknown;
  nativeContractsEnabled?: unknown;
  suite?: unknown;
  confirmation?: unknown;
}>): boolean {
  return input.buildProfile === "development-test"
    && input.nativeContractsEnabled === true
    && input.suite === "phase18-garmin-acceptance"
    && input.confirmation === PHASE18_GARMIN_ACCEPTANCE_CONFIRMATION;
}

function validOutput(value: unknown): Phase18GarminAcceptanceCaseOutput {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new InvalidAcceptanceCaseOutput();
  }
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !RESULT_KEYS.has(key))) {
    throw new InvalidAcceptanceCaseOutput();
  }
  if (
    !Number.isFinite(record.duration_ms)
    || (record.duration_ms as number) < 0
    || !Number.isInteger(record.duration_ms)
  ) {
    throw new InvalidAcceptanceCaseOutput();
  }
  for (const key of ["source_digest", "match_digest"] as const) {
    const digest = record[key];
    if (digest !== undefined && (typeof digest !== "string" || !HASH.test(digest))) {
      throw new InvalidAcceptanceCaseOutput();
    }
  }
  const semanticState = record.semantic_state;
  if (
    semanticState !== undefined
    && (
      typeof semanticState !== "string"
      || !SAFE_SEMANTIC_STATE.test(semanticState)
      || PRIVATE_TEXT.test(semanticState)
    )
  ) {
    throw new InvalidAcceptanceCaseOutput();
  }
  return Object.freeze({
    duration_ms: record.duration_ms as number,
    ...(record.source_digest === undefined
      ? {}
      : { source_digest: record.source_digest as string }),
    ...(record.match_digest === undefined
      ? {}
      : { match_digest: record.match_digest as string }),
    ...(semanticState === undefined ? {} : { semantic_state: semanticState }),
  });
}

export function createPhase18GarminAcceptanceHarness(input: Readonly<{
  runCase(
    id: GarminAcceptanceHostCaseId,
  ): Promise<Phase18GarminAcceptanceCaseOutput>;
}>) {
  return Object.freeze({
    async run() {
      const cases: (PassedCase | FailedCase)[] = [];
      for (const id of GARMIN_ACCEPTANCE_HOST_CASE_IDS) {
        try {
          const output = validOutput(await input.runCase(id));
          cases.push(Object.freeze({ id, status: "passed", ...output }));
        } catch (error) {
          cases.push(Object.freeze({
            id,
            status: "failed",
            duration_ms: 0,
            code: error instanceof InvalidAcceptanceCaseOutput
              ? "acceptance_case_invalid"
              : "acceptance_case_failed",
          }));
        }
      }
      const passed = cases.filter(({ status }) => status === "passed").length;
      const failed = cases.length - passed;
      return Object.freeze({
        schema_version: 1 as const,
        suite: "phase18-garmin-acceptance" as const,
        status: failed === 0
          ? "host-passed-native-deferred" as const
          : "failed" as const,
        host: Object.freeze({
          expected_count: GARMIN_ACCEPTANCE_HOST_CASE_IDS.length,
          passed,
          failed,
          skipped: 0 as const,
          cases: Object.freeze(cases),
        }),
        native_prerequisites: Object.freeze(
          GARMIN_ACCEPTANCE_NATIVE_PREREQUISITE_IDS.map((id) =>
            Object.freeze({ id, status: "deferred" as const })
          ),
        ),
      });
    },
  });
}
