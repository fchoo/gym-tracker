import {
  describe,
  expect,
  it,
} from "@jest/globals";

import {
  PHASE12_BENCHMARK_RESULT_MARKER,
  PHASE12_BENCHMARK_START_MARKER,
  buildPhase12SyntheticSnapshot,
  phase12BenchmarkStartupAction,
} from "./phase12BackupBenchmark";

describe("Phase 12 native backup benchmark", () => {
  it("fails closed outside the exact development-test Phase 12 benchmark route", () => {
    expect(phase12BenchmarkStartupAction({
      enabled: false,
      launchState: "trusted",
      started: false,
      suite: "phase12",
    })).toBe("disabled");
    expect(phase12BenchmarkStartupAction({
      enabled: true,
      launchState: "trusted",
      started: false,
      suite: "phase11",
    })).toBe("disabled");
    expect(phase12BenchmarkStartupAction({
      enabled: true,
      launchState: "booting",
      started: false,
      suite: "phase12",
    })).toBe("wait");
    expect(phase12BenchmarkStartupAction({
      enabled: true,
      launchState: "trusted",
      started: false,
      suite: "phase12",
    })).toBe("start");
    expect(PHASE12_BENCHMARK_START_MARKER).toContain("PHASE12");
    expect(PHASE12_BENCHMARK_RESULT_MARKER).toContain("PHASE12");
  });

  it("creates exactly the supported maximum synthetic merge fixture", () => {
    const snapshot = buildPhase12SyntheticSnapshot();
    expect(snapshot.manifest.totalRows).toBe(100_000);
    expect(new TextEncoder().encode(JSON.stringify(snapshot)).byteLength)
      .toBe(24 * 1024 * 1024);
  });
});
