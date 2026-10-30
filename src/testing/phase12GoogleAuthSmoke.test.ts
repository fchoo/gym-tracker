import { describe, expect, it } from "@jest/globals";

import {
  PHASE12_GOOGLE_AUTH_SMOKE_CONFIRMATION,
  phase12GoogleAuthSmokeEnabled,
} from "./phase12GoogleAuthSmoke";

describe("Phase 12 Google auth smoke", () => {
  const enabled = {
    buildProfile: "development-test",
    nativeContractsEnabled: true,
    suite: "phase12",
    confirmation: PHASE12_GOOGLE_AUTH_SMOKE_CONFIRMATION,
  };

  it("requires the exact development-test gate", () => {
    expect(phase12GoogleAuthSmokeEnabled(enabled)).toBe(true);
    for (const override of [
      { buildProfile: "production" },
      { nativeContractsEnabled: false },
      { suite: "phase11" },
      { confirmation: "verify-development-test-google-auth" },
    ]) expect(phase12GoogleAuthSmokeEnabled({ ...enabled, ...override })).toBe(false);
  });
});
