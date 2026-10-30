import { describe, expect, it } from "@jest/globals";

import {
  phase20VisualGate,
  resolvePhase20VisualRequest,
} from "./phase20VisualRequest";

const params = Object.freeze({
  state: "BW-001",
  configuration: "AP-SD-X840-L-F200",
  fixture: "v12-synthetic-fixtures-r18",
  nonce: "a".repeat(32),
  mode: "capture",
});

describe("Phase 20 visual request", () => {
  it("accepts only a complete nonce-bound state/configuration request", () => {
    expect(resolvePhase20VisualRequest(params)).toEqual({
      nonce: "a".repeat(32),
      state: "BW-001",
      configuration: "AP-SD-X840-L-F200",
      appearance: "System",
      mode: "capture",
    });
    for (const invalid of [
      { ...params, state: "BW-000" },
      { ...params, configuration: "AP-L-C390-P-F300" },
      { ...params, fixture: "personal-data" },
      { ...params, nonce: "short" },
      { ...params, mode: "preview" },
    ]) {
      expect(resolvePhase20VisualRequest(invalid)).toBeNull();
    }
  });

  it("requires the exact route, build profile, enabled flag, and suite", () => {
    const input = {
      pathname: "/__phase20-visual-probe",
      buildProfile: "development-test",
      nativeContractsEnabled: true,
      nativeContractSuite: "v1.2-acceptance",
      params,
    } as const;
    expect(phase20VisualGate(input)).not.toBeNull();
    expect(phase20VisualGate({ ...input, pathname: "/" })).toBeNull();
    expect(phase20VisualGate({ ...input, buildProfile: "production" })).toBeNull();
    expect(phase20VisualGate({ ...input, nativeContractsEnabled: false })).toBeNull();
    expect(phase20VisualGate({ ...input, nativeContractSuite: "phase20" })).toBeNull();
  });
});
