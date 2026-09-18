import {
  describe,
  expect,
  it,
} from "@jest/globals";

import type {
  SqliteKernel,
  SqliteTransactionExecutor,
} from "../sqliteKernel";
import {
  createAdvancedTimingRepository,
} from "./advancedTimingRepository";

const perRepJson = '{"version":1,"mode":"per_rep","intervalMs":1000,"cueChannels":"haptic"}';
const clusterJson = '{"version":1,"mode":"cluster","groupSizes":[3,3],"intraRestMs":1000,"cueChannels":"haptic"}';
const offJson = '{"version":1,"mode":"off"}';

function kernelForRows(
  rows: Readonly<Record<string, unknown>>,
): SqliteKernel {
  const transaction: SqliteTransactionExecutor = {
    execute: async () => ({ changes: 1, lastInsertRowId: 0 }),
    queryAll: async <Row extends Record<string, unknown>>(sql: string) => {
      if (sql.includes("FROM workout_sessions")) {
        return [{ revision: 1, active_set_id: "set-1" }] as unknown as readonly Row[];
      }
      if (sql.includes("FROM session_advanced_timing_states")) {
        return [rows] as unknown as readonly Row[];
      }
      if (sql.includes("FROM session_sets")) {
        return [{
          status: "planned",
          advanced_timing_resolved_json: perRepJson,
        }] as unknown as readonly Row[];
      }
      return [] as readonly Row[];
    },
  };
  return {
    write: async <Result>(command: (executor: SqliteTransactionExecutor) => Promise<Result>) =>
      command(transaction),
    queryAll: transaction.queryAll,
    connectionConfiguration: async () => ({
      reader: { busyTimeoutMs: 1, foreignKeys: true, journalMode: "wal" },
      writer: { busyTimeoutMs: 1, foreignKeys: true, journalMode: "wal" },
    }),
    close: async () => undefined,
  };
}

function row(
  changes: Partial<Record<string, unknown>> = {},
): Readonly<Record<string, unknown>> {
  return {
    session_set_id: "set-1",
    state_version: 1,
    revision: 2,
    status: "running",
    mode: "per_rep",
    config_json: perRepJson,
    progress_json: '{"nextRepetitionIndex":3}',
    started_at_ms: 1_000,
    next_boundary_at_ms: 2_000,
    remaining_ms: null,
    stopped_at_ms: null,
    ...changes,
  };
}

function kernelForTransition(input: Readonly<{
  session?: Readonly<{ revision: number; active_set_id: string | null }> | null;
  state?: Readonly<Record<string, unknown>> | null;
  target?: Readonly<{
    status: "planned" | "draft" | "completed" | "skipped";
    advanced_timing_resolved_json: string;
  }> | null;
  storedStateError?: Error;
  executeError?: Error;
}>) {
  let executeCount = 0;
  const transaction: SqliteTransactionExecutor = {
    execute: async () => {
      if (input.executeError !== undefined) {
        throw input.executeError;
      }
      executeCount += 1;
      return { changes: 1, lastInsertRowId: 0 };
    },
    queryAll: async <Row extends Record<string, unknown>>(sql: string) => {
      if (sql.includes("FROM workout_sessions")) {
        return input.session === null
          ? [] as readonly Row[]
          : [input.session ?? { revision: 1, active_set_id: "set-1" }] as unknown as readonly Row[];
      }
      if (sql.includes("FROM session_sets")) {
        return input.target === null
          ? [] as readonly Row[]
          : [input.target ?? {
            status: "planned",
            advanced_timing_resolved_json: perRepJson,
          }] as unknown as readonly Row[];
      }
      if (sql.includes("FROM session_advanced_timing_states")) {
        if (input.storedStateError !== undefined) {
          throw input.storedStateError;
        }
        return input.state === null
          ? [] as readonly Row[]
          : [input.state ?? row()] as unknown as readonly Row[];
      }
      return [] as readonly Row[];
    },
  };
  const kernel: SqliteKernel = {
    write: async <Result>(command: (executor: SqliteTransactionExecutor) => Promise<Result>) =>
      command(transaction),
    queryAll: transaction.queryAll,
    connectionConfiguration: async () => ({
      reader: { busyTimeoutMs: 1, foreignKeys: true, journalMode: "wal" },
      writer: { busyTimeoutMs: 1, foreignKeys: true, journalMode: "wal" },
    }),
    close: async () => undefined,
  };
  return { kernel, executeCount: () => executeCount };
}

describe("advanced timing repository state decoding", () => {
  it.each([
    ["invalid progress json", row({ progress_json: "{" })],
    ["missing progress index", row({ progress_json: "{}" })],
    ["fractional progress index", row({ progress_json: '{"nextRepetitionIndex":1.5}' })],
    ["invalid config", row({ config_json: "{}" })],
    ["wrong state version", row({ state_version: 2 })],
    ["idle target", row({ status: "idle", session_set_id: "set-1", mode: null, config_json: '{"version":1,"mode":"off"}' })],
    ["idle mode", row({ status: "idle", session_set_id: null, mode: "per_rep", config_json: offJson })],
    ["idle config", row({ status: "idle", session_set_id: null, mode: null })],
    ["expired state", row({ status: "expired", stopped_at_ms: 3_000 })],
    ["cluster/per-rep mismatch", row({ mode: "cluster" })],
    ["per-rep/cluster mismatch", row({ config_json: clusterJson })],
    ["cluster invalid progress json", row({ mode: "cluster", config_json: clusterJson, progress_json: "{" })],
    ["cluster missing group index", row({ mode: "cluster", config_json: clusterJson, progress_json: "{}" })],
    ["cluster fractional group index", row({ mode: "cluster", config_json: clusterJson, progress_json: '{"currentGroupIndex":1.5}' })],
    ["cluster invalid phase", row({ mode: "cluster", config_json: clusterJson, progress_json: '{"currentGroupIndex":0,"phase":"waiting"}' })],
    ["cluster out-of-range group index", row({ mode: "cluster", config_json: clusterJson, progress_json: '{"currentGroupIndex":2}' })],
    ["cluster running missing timestamps", row({ mode: "cluster", config_json: clusterJson, progress_json: '{"currentGroupIndex":0}', started_at_ms: null })],
    ["cluster paused missing remaining", row({ mode: "cluster", config_json: clusterJson, progress_json: '{"currentGroupIndex":0}', status: "paused", started_at_ms: null, next_boundary_at_ms: null, remaining_ms: null })],
    ["cluster stopped missing timestamp", row({ mode: "cluster", config_json: clusterJson, progress_json: '{"currentGroupIndex":0,"phase":"stopped"}', status: "stopped", started_at_ms: null, next_boundary_at_ms: null, stopped_at_ms: null })],
    ["cluster stopped missing phase", row({ mode: "cluster", config_json: clusterJson, progress_json: '{"currentGroupIndex":0}', status: "stopped", started_at_ms: null, next_boundary_at_ms: null, stopped_at_ms: 1_000 })],
    ["cluster impossible status", row({ mode: "cluster", config_json: clusterJson, progress_json: '{"currentGroupIndex":0}', status: "skipped" })],
    ["missing target", row({ session_set_id: null })],
    ["missing mode", row({ mode: null })],
    ["missing running timestamps", row({ started_at_ms: null })],
    ["missing running boundary", row({ next_boundary_at_ms: null })],
    ["missing paused remaining", row({ status: "paused", started_at_ms: null, next_boundary_at_ms: null, remaining_ms: null })],
    ["missing stopped timestamp", row({ status: "stopped", started_at_ms: null, next_boundary_at_ms: null, stopped_at_ms: null })],
  ])("rejects %s", async (_label, malformed) => {
    const repository = createAdvancedTimingRepository(kernelForRows(malformed));
    await expect(repository.getAdvancedTimingContext("session-1"))
      .rejects.toThrow("advanced_timing_state_invalid");
  });

  it.each([
    ["idle", row({
      session_set_id: null,
      status: "idle",
      mode: null,
      config_json: offJson,
      progress_json: "{}",
      started_at_ms: null,
      next_boundary_at_ms: null,
    }), { state: "idle", revision: 2, targetSessionSetId: null }],
    ["paused", row({
      status: "paused",
      started_at_ms: null,
      next_boundary_at_ms: null,
      remaining_ms: 500,
    }), { state: "paused", remainingMs: 500, nextRepetitionIndex: 3 }],
    ["stopped", row({
      status: "stopped",
      started_at_ms: null,
      next_boundary_at_ms: null,
      stopped_at_ms: 3_000,
    }), { state: "stopped", stoppedAtMs: 3_000, nextRepetitionIndex: 3 }],
    ["cluster running", row({
      mode: "cluster",
      config_json: clusterJson,
      progress_json: '{"currentGroupIndex":0}',
    }), { state: "cluster_gap_running", gapStartedAtMs: 1_000, gapEndsAtMs: 2_000, currentGroupIndex: 0 }],
    ["cluster paused", row({
      mode: "cluster",
      config_json: clusterJson,
      progress_json: '{"currentGroupIndex":0}',
      status: "paused",
      started_at_ms: null,
      next_boundary_at_ms: null,
      remaining_ms: 500,
    }), { state: "cluster_gap_paused", remainingMs: 500, currentGroupIndex: 0 }],
    ["cluster ready", row({
      mode: "cluster",
      config_json: clusterJson,
      progress_json: '{"currentGroupIndex":1,"phase":"ready"}',
      status: "stopped",
      started_at_ms: null,
      next_boundary_at_ms: null,
      stopped_at_ms: 0,
    }), { state: "cluster_ready", currentGroupIndex: 1 }],
    ["cluster stopped", row({
      mode: "cluster",
      config_json: clusterJson,
      progress_json: '{"currentGroupIndex":1,"phase":"stopped"}',
      status: "stopped",
      started_at_ms: null,
      next_boundary_at_ms: null,
      stopped_at_ms: 9_000,
    }), { state: "stopped", stoppedAtMs: 9_000, currentGroupIndex: 1 }],
  ])("reconstructs a valid %s persisted state", async (_label, persisted, expected) => {
    await expect(createAdvancedTimingRepository(kernelForRows(persisted))
      .getAdvancedTimingContext("session-1")).resolves.toEqual(expect.objectContaining({
      sessionId: "session-1",
      sessionRevision: 1,
      state: expect.objectContaining(expected),
    }));
  });

  it("returns null for an inactive or absent session and filters inactive contexts", async () => {
    const inactiveKernel: SqliteKernel = {
      ...kernelForRows(row()),
      queryAll: async () => [],
    };
    await expect(createAdvancedTimingRepository(inactiveKernel)
      .getAdvancedTimingContext("missing")).resolves.toBeNull();

    const activeRowsKernel: SqliteKernel = {
      ...kernelForRows(row()),
      queryAll: async <Row extends Record<string, unknown>>(sql: string) => {
        if (sql.includes("JOIN session_advanced_timing_states")) {
          return [{ id: "session-1" }] as unknown as readonly Row[];
        }
        if (sql.includes("FROM workout_sessions")) {
          return [{ revision: 1, active_set_id: "set-1" }] as unknown as readonly Row[];
        }
        if (sql.includes("FROM session_advanced_timing_states")) {
          return [row()] as unknown as readonly Row[];
        }
        return [] as readonly Row[];
      },
    };
    await expect(createAdvancedTimingRepository(activeRowsKernel)
      .listActiveTimingContexts()).resolves.toEqual([expect.objectContaining({
      sessionId: "session-1",
      state: expect.objectContaining({ state: "running" }),
    })]);
  });

  it("returns the implicit idle state when an active session has no stored advanced state", async () => {
    const { kernel } = kernelForTransition({ state: null });
    await expect(createAdvancedTimingRepository(kernel)
      .getAdvancedTimingContext("session-1")).resolves.toEqual({
      sessionId: "session-1",
      sessionRevision: 1,
      state: {
        version: 1,
        state: "idle",
        revision: 0,
        targetSessionSetId: null,
      },
    });
  });

  it("rejects command conflicts before persisting advanced state", async () => {
    const repository = createAdvancedTimingRepository(kernelForRows(row()));
    await expect(repository.startAdvancedTiming({
      sessionId: "session-1",
      sessionSetId: "set-1",
      expectedSessionRevision: 0,
      expectedAdvancedTimingRevision: 2,
      nowMs: 1_000,
      config: {
        version: 1,
        mode: "per_rep",
        intervalMs: 1_000,
        cueChannels: "haptic",
      },
    })).rejects.toThrow("advanced_timing_session_revision_conflict");
  });

  it("persists an active set timing override without changing advanced state", async () => {
    let configJson: string | undefined;
    const { kernel, executeCount } = kernelForTransition({
      state: null,
      target: { status: "draft", advanced_timing_resolved_json: offJson },
    });
    const configuredKernel: SqliteKernel = {
      ...kernel,
      write: async <Result>(command: (executor: SqliteTransactionExecutor) => Promise<Result>) =>
        command({
          execute: async (sql, params) => {
            if (sql.includes("advanced_timing_override_json")) {
              configJson = String(params?.[0]);
            }
            return { changes: 1, lastInsertRowId: 0 };
          },
          queryAll: kernel.queryAll,
        }),
    };
    await expect(createAdvancedTimingRepository(configuredKernel).configureAdvancedTiming({
      sessionId: "session-1",
      sessionSetId: "set-1",
      expectedSessionRevision: 1,
      expectedAdvancedTimingRevision: 0,
      nowMs: 1_000,
      config: { version: 1, mode: "per_rep", intervalMs: 1_000, cueChannels: "haptic" },
    })).resolves.toEqual({
      invalidationScopes: [["active-workout", "session-1"], ["today"]],
      sessionRevision: 2,
      state: {
        version: 1,
        state: "idle",
        revision: 0,
        targetSessionSetId: null,
      },
    });
    expect(configJson).toBe(perRepJson);
    expect(executeCount()).toBe(0);
  });

  it.each([
    ["set update", [0]],
    ["session revision update", [1, 0]],
  ])("rejects failed %s while configuring timing", async (_label, changes) => {
    let executeIndex = 0;
    const { kernel } = kernelForTransition({
      state: null,
      target: { status: "draft", advanced_timing_resolved_json: offJson },
    });
    const configuredKernel: SqliteKernel = {
      ...kernel,
      write: async <Result>(command: (executor: SqliteTransactionExecutor) => Promise<Result>) =>
        command({
          execute: async () => {
            const change = changes[Math.min(executeIndex, changes.length - 1)]!;
            executeIndex += 1;
            return { changes: change, lastInsertRowId: 0 };
          },
          queryAll: kernel.queryAll,
        }),
    };
    await expect(createAdvancedTimingRepository(configuredKernel).configureAdvancedTiming({
      sessionId: "session-1",
      sessionSetId: "set-1",
      expectedSessionRevision: 1,
      expectedAdvancedTimingRevision: 0,
      nowMs: 1_000,
      config: { version: 1, mode: "per_rep", intervalMs: 1_000, cueChannels: "haptic" },
    })).rejects.toThrow(_label === "set update"
      ? "advanced_timing_config_conflict"
      : "advanced_timing_session_revision_conflict");
  });

  it.each([
    ["missing session", { session: null }, "advanced_timing_session_missing"],
    ["missing target ownership", { target: null }, "advanced_timing_target_not_owned"],
    ["invalid stored state", { state: row({ config_json: "{}" }) }, "advanced_timing_state_invalid"],
    ["invalid snapshot", { target: { status: "planned" as const, advanced_timing_resolved_json: "{}" } }, "advanced_timing_snapshot_invalid"],
    ["cluster snapshot mismatch", { target: { status: "planned" as const, advanced_timing_resolved_json: clusterJson } }, "advanced_timing_config_mismatch"],
    ["different start config", {}, "advanced_timing_config_mismatch"],
  ])("rejects %s without writing durable state", async (_label, scenario, code) => {
    const { kernel, executeCount } = kernelForTransition(scenario);
    await expect(createAdvancedTimingRepository(kernel).startAdvancedTiming({
      sessionId: "session-1",
      sessionSetId: "set-1",
      expectedSessionRevision: 1,
      expectedAdvancedTimingRevision: 2,
      nowMs: 1_000,
      config: {
        version: 1,
        mode: "per_rep",
        intervalMs: _label === "different start config" ? 2_000 : 1_000,
        cueChannels: "haptic",
      },
    })).rejects.toThrow(code);
    expect(executeCount()).toBe(0);
  });

  it("rejects timing configuration while a timer is active", async () => {
    const { kernel, executeCount } = kernelForTransition({ state: row() });
    await expect(createAdvancedTimingRepository(kernel).configureAdvancedTiming({
      sessionId: "session-1",
      sessionSetId: "set-1",
      expectedSessionRevision: 1,
      expectedAdvancedTimingRevision: 2,
      nowMs: 1_000,
      config: { version: 1, mode: "per_rep", intervalMs: 1_000, cueChannels: "haptic" },
    })).rejects.toThrow("advanced_timing_config_active");
    expect(executeCount()).toBe(0);
  });

  it("persists stopped cluster state distinctly from cluster readiness", async () => {
    const { kernel } = kernelForTransition({
      state: row({
        mode: "cluster",
        config_json: clusterJson,
        progress_json: '{"currentGroupIndex":1,"phase":"ready"}',
        status: "stopped",
        started_at_ms: null,
        next_boundary_at_ms: null,
        stopped_at_ms: 0,
      }),
      target: { status: "draft", advanced_timing_resolved_json: clusterJson },
    });
    await expect(createAdvancedTimingRepository(kernel).stopAdvancedTiming({
      sessionId: "session-1",
      sessionSetId: "set-1",
      expectedSessionRevision: 1,
      expectedAdvancedTimingRevision: 2,
      nowMs: 10_000,
    })).resolves.toEqual(expect.objectContaining({
      state: {
        version: 1,
        state: "stopped",
        mode: "cluster",
        revision: 3,
        targetSessionSetId: "set-1",
        stoppedAtMs: 10_000,
        currentGroupIndex: 1,
      },
    }));
  });

  it("maps shared context conflicts while configuring timing", async () => {
    const { kernel, executeCount } = kernelForTransition({ session: null });
    await expect(createAdvancedTimingRepository(kernel).configureAdvancedTiming({
      sessionId: "session-1",
      sessionSetId: "set-1",
      expectedSessionRevision: 1,
      expectedAdvancedTimingRevision: 0,
      nowMs: 1_000,
      config: { version: 1, mode: "per_rep", intervalMs: 1_000, cueChannels: "haptic" },
    })).rejects.toThrow("advanced_timing_session_missing");
    expect(executeCount()).toBe(0);
  });

  it("accepts a draft target and maps target and state transition conflicts", async () => {
    const draft = kernelForTransition({
      state: null,
      target: { status: "draft", advanced_timing_resolved_json: perRepJson },
    });
    await expect(createAdvancedTimingRepository(draft.kernel).startAdvancedTiming({
      sessionId: "session-1",
      sessionSetId: "set-1",
      expectedSessionRevision: 1,
      expectedAdvancedTimingRevision: 0,
      nowMs: 1_000,
      config: { version: 1, mode: "per_rep", intervalMs: 1_000, cueChannels: "haptic" },
    })).resolves.toEqual(expect.objectContaining({
      state: expect.objectContaining({ state: "running", revision: 1 }),
    }));
    expect(draft.executeCount()).toBe(1);

    const inactive = kernelForTransition({
      session: { revision: 1, active_set_id: "different-set" },
    });
    await expect(createAdvancedTimingRepository(inactive.kernel).startAdvancedTiming({
      sessionId: "session-1", sessionSetId: "set-1", expectedSessionRevision: 1,
      expectedAdvancedTimingRevision: 2, nowMs: 1_000,
      config: { version: 1, mode: "per_rep", intervalMs: 1_000, cueChannels: "haptic" },
    })).rejects.toThrow("advanced_timing_target_not_active");

    const unavailable = kernelForTransition({
      target: { status: "completed", advanced_timing_resolved_json: perRepJson },
    });
    await expect(createAdvancedTimingRepository(unavailable.kernel).startAdvancedTiming({
      sessionId: "session-1", sessionSetId: "set-1", expectedSessionRevision: 1,
      expectedAdvancedTimingRevision: 2, nowMs: 1_000,
      config: { version: 1, mode: "per_rep", intervalMs: 1_000, cueChannels: "haptic" },
    })).rejects.toThrow("advanced_timing_target_not_available");

    const mismatched = kernelForTransition({
      state: row({ session_set_id: "different-set" }),
    });
    await expect(createAdvancedTimingRepository(mismatched.kernel).pauseAdvancedTiming({
      sessionId: "session-1", sessionSetId: "set-1", expectedSessionRevision: 1,
      expectedAdvancedTimingRevision: 2, nowMs: 1_000,
    })).rejects.toThrow("advanced_timing_target_mismatch");

    const stopped = kernelForTransition({
      state: row({
        status: "stopped", started_at_ms: null, next_boundary_at_ms: null, stopped_at_ms: 1_000,
      }),
    });
    await expect(createAdvancedTimingRepository(stopped.kernel).pauseAdvancedTiming({
      sessionId: "session-1", sessionSetId: "set-1", expectedSessionRevision: 1,
      expectedAdvancedTimingRevision: 2, nowMs: 1_000,
    })).rejects.toThrow("advanced_timing_not_running");
  });

  it("does not write when foreground reconciliation has no elapsed boundary", async () => {
    const { kernel, executeCount } = kernelForTransition({ state: row() });
    await expect(createAdvancedTimingRepository(kernel).reconcileAdvancedTiming({
      sessionId: "session-1",
      sessionSetId: "set-1",
      expectedSessionRevision: 1,
      expectedAdvancedTimingRevision: 2,
      nowMs: 1_500,
      foregroundSinceMs: 1_500,
    })).resolves.toEqual(expect.objectContaining({
      cue: null,
      state: expect.objectContaining({ state: "running", revision: 2 }),
    }));
    expect(executeCount()).toBe(0);
  });

  it("propagates unexpected stored-state read failures", async () => {
    const { kernel } = kernelForTransition({
      storedStateError: new Error("injected_stored_state_read_failure"),
    });
    await expect(createAdvancedTimingRepository(kernel).startAdvancedTiming({
      sessionId: "session-1", sessionSetId: "set-1", expectedSessionRevision: 1,
      expectedAdvancedTimingRevision: 2, nowMs: 1_000,
      config: { version: 1, mode: "per_rep", intervalMs: 1_000, cueChannels: "haptic" },
    })).rejects.toThrow("injected_stored_state_read_failure");
  });

  it("propagates unexpected durable-write failures", async () => {
    const { kernel } = kernelForTransition({
      state: null,
      executeError: new Error("injected_advanced_timing_write_failure"),
    });
    await expect(createAdvancedTimingRepository(kernel).startAdvancedTiming({
      sessionId: "session-1", sessionSetId: "set-1", expectedSessionRevision: 1,
      expectedAdvancedTimingRevision: 0, nowMs: 1_000,
      config: { version: 1, mode: "per_rep", intervalMs: 1_000, cueChannels: "haptic" },
    })).rejects.toThrow("injected_advanced_timing_write_failure");
  });
});
