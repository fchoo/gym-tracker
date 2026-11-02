export const PHASE12_GOOGLE_AUTH_SMOKE_CONFIRMATION = "VERIFY-DEVELOPMENT-TEST-GOOGLE-AUTH";
export const PHASE12_GOOGLE_AUTH_SMOKE_RESULT_MARKER = "GYM_TRACKER_PHASE12_GOOGLE_AUTH_SMOKE_RESULT:";

export function phase12GoogleAuthSmokeEnabled(input: Readonly<{
  buildProfile?: unknown;
  nativeContractsEnabled?: unknown;
  suite?: unknown;
  confirmation?: unknown;
}>): boolean {
  return input.buildProfile === "development-test"
    && input.nativeContractsEnabled === true
    && input.suite === "phase12"
    && input.confirmation === PHASE12_GOOGLE_AUTH_SMOKE_CONFIRMATION;
}
