import { describe, expect, it } from "@jest/globals";

import {
  V12_ACCEPTANCE_BENCHMARK_MARKER,
  createV12AcceptanceBenchmark,
} from "./v12AcceptanceBenchmark";

describe("v1.2 acceptance benchmark marker bridge", () => {
  it("records only production-disabled useful endpoints with monotonic timestamps", () => {
    const values = [10, 37, 91, 140];
    const benchmark = createV12AcceptanceBenchmark({
      enabled: true,
      now: () => values.shift()!,
    });

    benchmark.markRootSwitchStart("workout");
    benchmark.markUsefulContent("workout");
    benchmark.markAuthoritativeSetCommit();
    benchmark.markVisibleDock();

    expect(benchmark.result()).toEqual({
      marker: V12_ACCEPTANCE_BENCHMARK_MARKER,
      root_switch_ms: [{ root: "workout", duration_ms: 27 }],
      committed_set_to_dock_ms: [49],
    });
  });

  it("does not emit measurements in the production runtime and rejects invalid marker order", () => {
    const disabled = createV12AcceptanceBenchmark({ enabled: false, now: () => 1 });
    disabled.markRootSwitchStart("workout");
    disabled.markUsefulContent("workout");
    expect(disabled.result()).toEqual({
      marker: V12_ACCEPTANCE_BENCHMARK_MARKER,
      root_switch_ms: [],
      committed_set_to_dock_ms: [],
    });

    const enabled = createV12AcceptanceBenchmark({ enabled: true, now: () => 1 });
    expect(() => enabled.markVisibleDock()).toThrow("v12_benchmark_authoritative_commit_missing");
  });
});
