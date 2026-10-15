import { describe, expect, it } from "@jest/globals";

import { phase20InstrumentationSource, phase20QualityInstrumentationEnabled } from "./withPhase20QualityInstrumentation";

describe("Phase 20 quality instrumentation plugin", () => {
  it("is unavailable outside the exact development acceptance build", () => {
    expect(phase20QualityInstrumentationEnabled({ buildProfile: "development-test", nativeContractsEnabled: true, nativeContractSuite: "v1.2-acceptance" })).toBe(true);
    expect(phase20QualityInstrumentationEnabled({ buildProfile: "production", nativeContractsEnabled: true, nativeContractSuite: "v1.2-acceptance" })).toBe(false);
    expect(phase20QualityInstrumentationEnabled({ buildProfile: "development-test", nativeContractsEnabled: false, nativeContractSuite: "v1.2-acceptance" })).toBe(false);
    expect(phase20QualityInstrumentationEnabled({ buildProfile: "development-test", nativeContractsEnabled: true, nativeContractSuite: "phase14" })).toBe(false);
  });
  it("packages the exact installed component and nonce-bound chunk protocol", () => {
    expect(phase20InstrumentationSource).toContain("class Phase20QualityInstrumentation : Instrumentation()");
    expect(phase20InstrumentationSource).toContain("GYM_TRACKER_V12_QUALITY:");
    expect(phase20InstrumentationSource).toContain("qualityNonce");
    expect(phase20InstrumentationSource).toContain('"workout" to "/"');
    expect(phase20InstrumentationSource).toContain("BuildConfig.DEBUG");
    expect(phase20InstrumentationSource).toContain("GYM_TRACKER_PHASE20_WORKLOAD:");
    expect(phase20InstrumentationSource).toContain("qualityOperation");
    expect(phase20InstrumentationSource).toContain("qualitySequence");
  });
  it("rejects fixture-shaped root coverage and idle-loop performance evidence", () => {
    expect(phase20InstrumentationSource).toContain('"workout" to "/"');
    expect(phase20InstrumentationSource).toContain('"calendar" to "/calendar"');
    expect(phase20InstrumentationSource).toContain('"library" to "/library"');
    expect(phase20InstrumentationSource).toContain('"progress" to "/progress"');
    expect(phase20InstrumentationSource).toContain("duplicate_product_root_semantics");
    const performance = phase20InstrumentationSource.slice(
      phase20InstrumentationSource.indexOf("private fun performance"),
      phase20InstrumentationSource.indexOf("private fun output"),
    );
    expect(performance).toContain('repeated(nonce, "committed-set-visible-dock", 100)');
    expect(performance).toContain('runOperation(nonce, "performance", "phase12-backup", 1)');
    expect(performance).toContain('runOperation(nonce, "performance", "garmin-json-normalization", 1)');
    expect(performance).not.toContain("waitForIdleSync");
    expect(performance).not.toContain("SystemClock.sleep");
  });

  it("drives real native input, settings, frames, screenshots, and memory observations", () => {
    for (const source of [
      "SystemClock.elapsedRealtimeNanos()",
      "Choreographer.getInstance()",
      "Debug.getPss()",
      "ActivityManager",
      "uiAutomation.injectInputEvent",
      "uiAutomation.takeScreenshot()",
      '"font_scale"',
      '"animator_duration_scale"',
      '"software-keyboard"',
      '"hardware-keyboard"',
      '"dpad"',
    ]) expect(phase20InstrumentationSource).toContain(source);
  });

  it("rejects duplicate or mismatched app markers and derives evidence from native nodes", () => {
    for (const source of [
      "workload_marker_duplicate",
      "workload_marker_identity_mismatch",
      "workload_marker_order_invalid",
      "sqlite_receipt_sha256",
      "command_receipt_sha256",
      "readiness_sha256",
      "AccessibilityNodeInfo",
      "overlaps(",
      "focusedNodeId",
    ]) expect(phase20InstrumentationSource).toContain(source);
    expect(phase20InstrumentationSource).not.toContain("actual_product_workload_marker_required");
    expect(phase20InstrumentationSource).not.toContain("actual_accessibility_operation_marker_required");
  });
});
