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
    expect(phase20InstrumentationSource).toContain('"workout" to "/"');
    expect(phase20InstrumentationSource).toContain("BuildConfig.DEBUG");
  });
  it("rejects fixture-shaped root coverage and idle-loop performance evidence", () => {
    expect(phase20InstrumentationSource).toContain('"workout" to "/"');
    expect(phase20InstrumentationSource).toContain('"calendar" to "/calendar"');
    expect(phase20InstrumentationSource).toContain('"library" to "/library"');
    expect(phase20InstrumentationSource).toContain('"progress" to "/progress"');
    expect(phase20InstrumentationSource).toContain("duplicate_product_root_semantics");
    expect(phase20InstrumentationSource).toContain("actual_product_workload_marker_required");
    const performance = phase20InstrumentationSource.slice(phase20InstrumentationSource.indexOf("private fun performance"), phase20InstrumentationSource.indexOf("private lateinit var arguments"));
    expect(performance).not.toContain("waitForIdleSync");
    expect(performance).not.toContain("timing(identity");
  });
});
