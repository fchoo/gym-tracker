export const V12_ACCEPTANCE_BENCHMARK_MARKER =
  "GYM_TRACKER_V12_ACCEPTANCE_BENCHMARK:" as const;

export type V12AcceptanceBenchmarkPort = Readonly<{
  markRootSwitchStart(root: string): void;
  markUsefulContent(root: string): void;
  markAuthoritativeSetCommit(): void;
  markSetActivation(): void;
  markVisibleDock(): void;
  markInputStart(path: "numeric-edit" | "rest-control"): void;
  markInputVisible(path: "numeric-edit" | "rest-control"): void;
  markSearchDebounceEnded(): void;
  markSearchResultsVisible(): void;
  markProgressStart(path: "useful-content" | "review-open" | "targeted-rebuild"): void;
  markProgressVisible(path: "useful-content" | "review-open" | "targeted-rebuild"): void;
  result(): Readonly<{
    marker: typeof V12_ACCEPTANCE_BENCHMARK_MARKER;
    root_switch_ms: readonly Readonly<{ root: string; duration_ms: number }>[];
    committed_set_to_dock_ms: readonly number[];
    input_response_ms: Readonly<Record<"numeric-edit" | "rest-control", readonly number[]>>;
    search_after_debounce_ms: readonly number[];
    progress_ms: Readonly<Record<"useful-content" | "review-open" | "targeted-rebuild", readonly number[]>>;
  }>;
}>;

export type V12AcceptanceBenchmarkMarker = Readonly<{
  kind: "start" | "commit" | "ready";
  operation:
    | `root-switch-${string}`
    | "committed-set-visible-dock"
    | "numeric-edit"
    | "rest-control"
    | "search-after-debounce"
    | "progress-useful-content"
    | "progress-review-open"
    | "progress-targeted-rebuild";
  at_ms: number;
}>;

type Options = Readonly<{
  enabled: boolean;
  now: () => number;
  onMarker?: (marker: V12AcceptanceBenchmarkMarker) => void;
}>;

function duration(endedAt: number, startedAt: number, code: string): number {
  const value = endedAt - startedAt;
  if (!Number.isFinite(value) || value < 0) throw new Error(code);
  return value;
}

/**
 * Development-test instrumentation only. Production callers pass `enabled:
 * false`, which intentionally preserves no timing state or measured output.
 */
export function createV12AcceptanceBenchmark({ enabled, now, onMarker }: Options): V12AcceptanceBenchmarkPort {
  const rootSwitches: { root: string; duration_ms: number }[] = [];
  const dockDurations: number[] = [];
  const inputDurations = { "numeric-edit": [] as number[], "rest-control": [] as number[] };
  const searchDurations: number[] = [];
  const progressDurations = { "useful-content": [] as number[], "review-open": [] as number[], "targeted-rebuild": [] as number[] };
  let rootSwitch: { root: string; startedAt: number } | undefined;
  let authoritativeCommitAt: number | undefined;
  let setActivationAt: number | undefined;
  let input: { path: "numeric-edit" | "rest-control"; startedAt: number } | undefined;
  let searchStartedAt: number | undefined;
  let progress: { path: "useful-content" | "review-open" | "targeted-rebuild"; startedAt: number } | undefined;

  return Object.freeze({
    markRootSwitchStart(root) {
      if (!enabled) return;
      if (!root || rootSwitch !== undefined) throw new Error("v12_benchmark_root_switch_invalid");
      const startedAt = now();
      rootSwitch = { root, startedAt };
      onMarker?.({ kind: "start", operation: `root-switch-${root}`, at_ms: startedAt });
    },
    markUsefulContent(root) {
      if (!enabled) return;
      if (rootSwitch === undefined || rootSwitch.root !== root) {
        throw new Error("v12_benchmark_useful_content_invalid");
      }
      const observedAt = now();
      rootSwitches.push({
        root,
        duration_ms: duration(observedAt, rootSwitch.startedAt, "v12_benchmark_root_switch_duration_invalid"),
      });
      onMarker?.({ kind: "ready", operation: `root-switch-${root}`, at_ms: observedAt });
      rootSwitch = undefined;
    },
    markAuthoritativeSetCommit() {
      if (!enabled) return;
      if (authoritativeCommitAt !== undefined) throw new Error("v12_benchmark_authoritative_commit_duplicate");
      authoritativeCommitAt = now();
      onMarker?.({ kind: "commit", operation: "committed-set-visible-dock", at_ms: authoritativeCommitAt });
    },
    markSetActivation() {
      if (!enabled) return;
      if (setActivationAt !== undefined || authoritativeCommitAt !== undefined) {
        throw new Error("v12_benchmark_set_activation_duplicate");
      }
      setActivationAt = now();
      onMarker?.({ kind: "start", operation: "committed-set-visible-dock", at_ms: setActivationAt });
    },
    markVisibleDock() {
      if (!enabled) return;
      if (authoritativeCommitAt === undefined) throw new Error("v12_benchmark_authoritative_commit_missing");
      const observedAt = now();
      dockDurations.push(duration(observedAt, authoritativeCommitAt, "v12_benchmark_dock_duration_invalid"));
      onMarker?.({ kind: "ready", operation: "committed-set-visible-dock", at_ms: observedAt });
      authoritativeCommitAt = undefined;
      setActivationAt = undefined;
    },
    markInputStart(path) {
      if (!enabled) return;
      if (input !== undefined) throw new Error("v12_benchmark_input_duplicate");
      const startedAt = now();
      input = { path, startedAt };
      onMarker?.({ kind: "start", operation: path, at_ms: startedAt });
    },
    markInputVisible(path) {
      if (!enabled) return;
      if (input === undefined || input.path !== path) throw new Error("v12_benchmark_input_missing");
      const observedAt = now();
      inputDurations[path].push(duration(observedAt, input.startedAt, "v12_benchmark_input_duration_invalid"));
      onMarker?.({ kind: "ready", operation: path, at_ms: observedAt });
      input = undefined;
    },
    markSearchDebounceEnded() {
      if (!enabled) return;
      if (searchStartedAt !== undefined) throw new Error("v12_benchmark_search_duplicate");
      searchStartedAt = now();
      onMarker?.({ kind: "start", operation: "search-after-debounce", at_ms: searchStartedAt });
    },
    markSearchResultsVisible() {
      if (!enabled) return;
      if (searchStartedAt === undefined) throw new Error("v12_benchmark_search_missing");
      const observedAt = now();
      searchDurations.push(duration(observedAt, searchStartedAt, "v12_benchmark_search_duration_invalid"));
      onMarker?.({ kind: "ready", operation: "search-after-debounce", at_ms: observedAt });
      searchStartedAt = undefined;
    },
    markProgressStart(path) {
      if (!enabled) return;
      if (progress !== undefined) throw new Error("v12_benchmark_progress_duplicate");
      const startedAt = now();
      progress = { path, startedAt };
      onMarker?.({ kind: "start", operation: `progress-${path}`, at_ms: startedAt });
    },
    markProgressVisible(path) {
      if (!enabled) return;
      if (progress === undefined || progress.path !== path) throw new Error("v12_benchmark_progress_missing");
      const observedAt = now();
      progressDurations[path].push(duration(observedAt, progress.startedAt, "v12_benchmark_progress_duration_invalid"));
      onMarker?.({ kind: "ready", operation: `progress-${path}`, at_ms: observedAt });
      progress = undefined;
    },
    result() {
      return Object.freeze({
        marker: V12_ACCEPTANCE_BENCHMARK_MARKER,
        root_switch_ms: Object.freeze(rootSwitches.map((sample) => Object.freeze({ ...sample }))),
        committed_set_to_dock_ms: Object.freeze([...dockDurations]),
        input_response_ms: Object.freeze({
          "numeric-edit": Object.freeze([...inputDurations["numeric-edit"]]),
          "rest-control": Object.freeze([...inputDurations["rest-control"]]),
        }),
        search_after_debounce_ms: Object.freeze([...searchDurations]),
        progress_ms: Object.freeze({
          "useful-content": Object.freeze([...progressDurations["useful-content"]]),
          "review-open": Object.freeze([...progressDurations["review-open"]]),
          "targeted-rebuild": Object.freeze([...progressDurations["targeted-rebuild"]]),
        }),
      });
    },
  });
}
