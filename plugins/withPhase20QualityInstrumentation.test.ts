import { describe, expect, it } from "@jest/globals";

import { phase20InstrumentationSource, phase20QualityInstrumentationEnabled } from "./withPhase20QualityInstrumentation";

describe("Phase 20 quality instrumentation plugin", () => {
  it("is unavailable outside the exact development acceptance build", () => {
    expect(phase20QualityInstrumentationEnabled({ nativeContractsEnabled: true, nativeContractSuite: "v1.2-acceptance" })).toBe(true);
    expect(phase20QualityInstrumentationEnabled({ nativeContractsEnabled: false, nativeContractSuite: "v1.2-acceptance" })).toBe(false);
    expect(phase20QualityInstrumentationEnabled({ nativeContractsEnabled: true, nativeContractSuite: "phase14" })).toBe(false);
  });
  it("packages the exact installed component and nonce-bound chunk protocol", () => {
    expect(phase20InstrumentationSource).toContain("class Phase20QualityInstrumentation : Instrumentation()");
    expect(phase20InstrumentationSource).toContain("GYM_TRACKER_V12_QUALITY:");
    expect(phase20InstrumentationSource).toContain("qualityNonce");
    expect(phase20InstrumentationSource).toContain("__phase20-quality-probe");
    expect(phase20InstrumentationSource).toContain("workout\", \"calendar\", \"library\", \"progress");
    expect(phase20InstrumentationSource).toContain("BuildConfig.DEBUG");
  });
});
