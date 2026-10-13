export const V12_ACCEPTANCE_BENCHMARK_MARKER =
  "GYM_TRACKER_V12_ACCEPTANCE_BENCHMARK:" as const;

export type V12AcceptanceBenchmarkPort = Readonly<{
  markRootSwitchStart(root: string): void;
  markUsefulContent(root: string): void;
  markAuthoritativeSetCommit(): void;
  markVisibleDock(): void;
  result(): Readonly<{
    marker: typeof V12_ACCEPTANCE_BENCHMARK_MARKER;
    root_switch_ms: readonly Readonly<{ root: string; duration_ms: number }>[];
    committed_set_to_dock_ms: readonly number[];
  }>;
}>;

type Options = Readonly<{ enabled: boolean; now: () => number }>;

function duration(now: () => number, startedAt: number, code: string): number {
  const value = now() - startedAt;
  if (!Number.isFinite(value) || value < 0) throw new Error(code);
  return value;
}

/**
 * Development-test instrumentation only. Production callers pass `enabled:
 * false`, which intentionally preserves no timing state or measured output.
 */
export function createV12AcceptanceBenchmark({ enabled, now }: Options): V12AcceptanceBenchmarkPort {
  const rootSwitches: { root: string; duration_ms: number }[] = [];
  const dockDurations: number[] = [];
  let rootSwitch: { root: string; startedAt: number } | undefined;
  let authoritativeCommitAt: number | undefined;

  return Object.freeze({
    markRootSwitchStart(root) {
      if (!enabled) return;
      if (!root || rootSwitch !== undefined) throw new Error("v12_benchmark_root_switch_invalid");
      rootSwitch = { root, startedAt: now() };
    },
    markUsefulContent(root) {
      if (!enabled) return;
      if (rootSwitch === undefined || rootSwitch.root !== root) {
        throw new Error("v12_benchmark_useful_content_invalid");
      }
      rootSwitches.push({
        root,
        duration_ms: duration(now, rootSwitch.startedAt, "v12_benchmark_root_switch_duration_invalid"),
      });
      rootSwitch = undefined;
    },
    markAuthoritativeSetCommit() {
      if (!enabled) return;
      if (authoritativeCommitAt !== undefined) throw new Error("v12_benchmark_authoritative_commit_duplicate");
      authoritativeCommitAt = now();
    },
    markVisibleDock() {
      if (!enabled) return;
      if (authoritativeCommitAt === undefined) throw new Error("v12_benchmark_authoritative_commit_missing");
      dockDurations.push(duration(now, authoritativeCommitAt, "v12_benchmark_dock_duration_invalid"));
      authoritativeCommitAt = undefined;
    },
    result() {
      return Object.freeze({
        marker: V12_ACCEPTANCE_BENCHMARK_MARKER,
        root_switch_ms: Object.freeze(rootSwitches.map((sample) => Object.freeze({ ...sample }))),
        committed_set_to_dock_ms: Object.freeze([...dockDurations]),
      });
    },
  });
}
