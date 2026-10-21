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
      input_response_ms: { "numeric-edit": [], "rest-control": [] },
      search_after_debounce_ms: [],
      progress_ms: { "useful-content": [], "review-open": [], "targeted-rebuild": [] },
    });
  });

  it("does not emit measurements in the production runtime and rejects invalid marker order", () => {
    const disabled = createV12AcceptanceBenchmark({ enabled: false, now: () => 1 });
    disabled.markRootSwitchStart("workout");
    disabled.markUsefulContent("workout");
    disabled.markAuthoritativeSetCommit();
    disabled.markVisibleDock();
    expect(disabled.result()).toEqual({
      marker: V12_ACCEPTANCE_BENCHMARK_MARKER,
      root_switch_ms: [],
      committed_set_to_dock_ms: [],
      input_response_ms: { "numeric-edit": [], "rest-control": [] },
      search_after_debounce_ms: [],
      progress_ms: { "useful-content": [], "review-open": [], "targeted-rebuild": [] },
    });

    const enabled = createV12AcceptanceBenchmark({ enabled: true, now: () => 1 });
    expect(() => enabled.markVisibleDock()).toThrow("v12_benchmark_authoritative_commit_missing");
    expect(() => enabled.markRootSwitchStart("")).toThrow("v12_benchmark_root_switch_invalid");

    enabled.markRootSwitchStart("workout");
    expect(() => enabled.markRootSwitchStart("calendar")).toThrow("v12_benchmark_root_switch_invalid");
    expect(() => enabled.markUsefulContent("calendar")).toThrow("v12_benchmark_useful_content_invalid");

    const nonFinite = createV12AcceptanceBenchmark({ enabled: true, now: () => Number.NaN });
    nonFinite.markRootSwitchStart("workout");
    expect(() => nonFinite.markUsefulContent("workout")).toThrow("v12_benchmark_root_switch_duration_invalid");

    const negative = createV12AcceptanceBenchmark({ enabled: true, now: (() => {
      const values = [10, 9];
      return () => values.shift()!;
    })() });
    negative.markAuthoritativeSetCommit();
    expect(() => negative.markVisibleDock()).toThrow("v12_benchmark_dock_duration_invalid");

    const duplicateCommit = createV12AcceptanceBenchmark({ enabled: true, now: () => 1 });
    duplicateCommit.markAuthoritativeSetCommit();
    expect(() => duplicateCommit.markAuthoritativeSetCommit()).toThrow("v12_benchmark_authoritative_commit_duplicate");
  });

  it("publishes operation markers only after the matching real boundary executes", () => {
    const events: string[] = [];
    const benchmark = createV12AcceptanceBenchmark({
      enabled: true,
      now: (() => { let value = 10; return () => value += 5; })(),
      onMarker: (event) => events.push(`${event.kind}:${event.operation}:${event.at_ms}`),
    });
    benchmark.markRootSwitchStart("calendar");
    benchmark.markUsefulContent("calendar");
    benchmark.markAuthoritativeSetCommit();
    benchmark.markVisibleDock();
    expect(events).toEqual([
      "start:root-switch-calendar:15",
      "ready:root-switch-calendar:20",
      "commit:committed-set-visible-dock:25",
      "ready:committed-set-visible-dock:30",
    ]);
  });

  it("binds input, post-debounce search, and Progress timings to their visible endpoints", () => {
    const values = [1, 3, 5, 8, 13, 21];
    const benchmark = createV12AcceptanceBenchmark({ enabled: true, now: () => values.shift()! });
    benchmark.markInputStart("numeric-edit");
    benchmark.markInputVisible("numeric-edit");
    benchmark.markSearchDebounceEnded();
    benchmark.markSearchResultsVisible();
    benchmark.markProgressStart("review-open");
    benchmark.markProgressVisible("review-open");
    expect(benchmark.result()).toMatchObject({
      input_response_ms: { "numeric-edit": [2], "rest-control": [] },
      search_after_debounce_ms: [3],
      progress_ms: { "review-open": [8] },
    });
  });
});
