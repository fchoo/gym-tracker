import { phase20CalendarRequestFromNativeContract } from "../bootstrap/phase20CalendarObservation";
import { phase20CalendarFixtureRequestFromNativeContract } from "./phase20CalendarFixture";
import { createStrictIsolatedWorkoutRuntimeDependencies } from "./isolatedWorkoutRuntime";

const CALENDAR_EVIDENCE_KEYS = Object.freeze([
  "phase20CalendarStage",
  "phase20CalendarNonce",
  "phase20CalendarFlowSha256",
  "phase20CalendarFlowRevision",
  "phase20CalendarFixture",
  "phase20CalendarEvidenceNonce",
  "phase20CalendarRequirementsSha256",
  "phase20CalendarFixtureSourceSha256",
  "phase20CalendarRequirement",
  "phase20CalendarEvidenceId",
  "phase20CalendarProbe",
  "phase20CalendarProbeReceipt",
] as const);

type CalendarEvidenceKey = (typeof CALENDAR_EVIDENCE_KEYS)[number];
export type Phase20CalendarRouteParams = Readonly<
  Partial<Record<CalendarEvidenceKey, unknown>>
>;

type NativeIdentity = Readonly<{
  packageName: unknown;
  buildProfile: unknown;
  nativeContractsEnabled: unknown;
  suite: unknown;
}>;

function scalar(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function phase20CalendarEvidencePathRequested(
  params: Readonly<object>,
): boolean {
  return CALENDAR_EVIDENCE_KEYS.some((key) => Object.hasOwn(params, key));
}

export function resolvePhase20CalendarIsolatedRuntime(
  identity: NativeIdentity,
  params: Phase20CalendarRouteParams,
): Readonly<{ databaseName: string; nonce: string }> | null {
  const observation = phase20CalendarRequestFromNativeContract({
    ...identity,
    stage: scalar(params.phase20CalendarStage),
    nonce: scalar(params.phase20CalendarNonce),
    flowSha256: scalar(params.phase20CalendarFlowSha256),
    flowRevision: scalar(params.phase20CalendarFlowRevision),
  });
  const fixtureNonce = scalar(params.phase20CalendarEvidenceNonce);
  const fixture = phase20CalendarFixtureRequestFromNativeContract({
    ...identity,
    fixtureId: scalar(params.phase20CalendarFixture),
    nonce: fixtureNonce,
    requirementsSha256: scalar(params.phase20CalendarRequirementsSha256),
  });
  const nonce = observation?.nonce ?? (fixture ? fixtureNonce : undefined);
  if (nonce === undefined) return null;
  return Object.freeze({
    databaseName: `gym-tracker-phase20-calendar-${nonce}.db`,
    nonce,
  });
}

export function createPhase20CalendarRuntimeDependencies(databaseName: string) {
  return createStrictIsolatedWorkoutRuntimeDependencies({ databaseName });
}
