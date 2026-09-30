import {
  describe,
  expect,
  it,
} from "@jest/globals";

import {
  BACKUP_LIMITS,
  parseLogicalBackupSnapshot,
} from "../domains/portability/backupContracts";
import {
  buildPortableMergePlan,
} from "../domains/portability/mergePlan";
import {
  PHASE12_BENCHMARK_RESULT_MARKER,
  PHASE12_BENCHMARK_START_MARKER,
  phase12BenchmarkDatabaseName,
  phase12BenchmarkError,
  phase12EncodedDriveObjectBytes,
  phase12SqliteVariableLimit,
  PHASE12_BENCHMARK_EXERCISE_PORTABLE_ID,
  PHASE12_SQLITE_FIXTURE_ROW_COUNTS,
  buildPhase12SyntheticSnapshot,
  measureReaderSnapshotWithConcurrentMutation,
  phase12BenchmarkStartupAction,
  shouldMaterializePhase12MergeSample,
  shouldSerializePhase12MergeSample,
} from "./phase12BackupBenchmark";

describe("Phase 12 native backup benchmark", () => {
  it("requires the configured batch ceiling from the active SQLite build", async () => {
    const kernel = (compileOptions: readonly string[]) => ({
      queryAll: async () => compileOptions.map((compile_options) => ({ compile_options })),
    }) as never;
    await expect(phase12SqliteVariableLimit(kernel([
      "THREADSAFE=1",
      "MAX_VARIABLE_NUMBER=32766",
    ]))).resolves.toBe(32_766);
    await expect(phase12SqliteVariableLimit(kernel([
      "MAX_VARIABLE_NUMBER=999",
    ]))).rejects.toThrow("phase12_sqlite_variable_limit_invalid");
    await expect(phase12SqliteVariableLimit(kernel([])))
      .rejects.toThrow("phase12_sqlite_variable_limit_invalid");
  });

  it("uses a unique bounded database identity for every evidence run", () => {
    expect(phase12BenchmarkDatabaseName("00000000-0000-4000-8000-000000000001"))
      .toBe("gym-tracker-phase12-benchmark-00000000-0000-4000-8000-000000000001.db");
    expect(() => phase12BenchmarkDatabaseName("../../shared.db")).toThrow("phase12_benchmark_database_identity_invalid");
  });
  it("reports the exact native writer sample, stage, and bounded cause chain", () => {
    const cause = new Error("constraint_failed");
    const outer = new Error("sqlite_transaction_failed", { cause });
    expect(phase12BenchmarkError(outer, 2, "insert:session_exercises").message)
      .toBe("phase12_merge_commit_failed:2:insert:session_exercises:sqlite_transaction_failed:constraint_failed");
  });
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
    expect(phase12EncodedDriveObjectBytes(snapshot))
      .toBe(24 * 1024 * 1024);
    expect(Math.max(...Object.values(snapshot.tables).map((rows) => rows.length)))
      .toBeLessThanOrEqual(BACKUP_LIMITS.maxRowsPerTable);
    expect(snapshot.tables.workout_sessions).toHaveLength(1);
    expect(snapshot.tables.session_exercises).toHaveLength(BACKUP_LIMITS.maxRowsPerTable);
    expect(snapshot.tables.session_sets).toHaveLength(BACKUP_LIMITS.maxRowsPerTable);
    expect(snapshot.tables.history_audit_events)
      .toHaveLength(BACKUP_LIMITS.maxRowsPerTable);
    expect(snapshot.tables.session_undo_snapshots)
      .toHaveLength(BACKUP_LIMITS.maxRowsPerTable - 3);
    expect(snapshot.tables.app_settings).toHaveLength(1);
    expect(() => parseLogicalBackupSnapshot(snapshot)).not.toThrow();
  });

  it("keeps the native writer fixture inside every canonical row bound", () => {
    expect(PHASE12_BENCHMARK_EXERCISE_PORTABLE_ID).toMatch(/^[a-f0-9]{32}$/u);
    expect(Object.values(PHASE12_SQLITE_FIXTURE_ROW_COUNTS)
      .reduce((total, count) => total + count, 0)).toBe(BACKUP_LIMITS.maxRowsTotal);
    expect(Math.max(...Object.values(PHASE12_SQLITE_FIXTURE_ROW_COUNTS)))
      .toBeLessThanOrEqual(BACKUP_LIMITS.maxRowsPerTable);
  });

  it("compares full canonical merge bytes at the first and last sample", () => {
    expect(Array.from({ length: 10 }, (_, index) => index)
      .filter(shouldSerializePhase12MergeSample)).toEqual([0, 9]);
  });

  it("materializes five distinct merge plans after compact preflight", () => {
    expect(Array.from({ length: 10 }, (_, index) => index)
      .filter(shouldMaterializePhase12MergeSample)).toEqual([0, 1, 2, 3, 4]);
  });

  it("measures a mutation only after the reader snapshot starts", async () => {
    const events: string[] = [];
    let startCopy: (() => void) | undefined;
    const waitForCopyStart = new Promise<void>((resolve) => { startCopy = resolve; });
    const times = [0, 5, 8, 20];
    const copied = buildPhase12SyntheticSnapshot();
    const capture = {
      sweepOrphans: async () => 0,
      capture: async () => {
        events.push("capture");
        startCopy?.();
        await Promise.resolve();
        events.push("captured");
        return { generation: 7, snapshot: copied };
      },
    };

    await expect(measureReaderSnapshotWithConcurrentMutation({
      capture,
      waitForCopyStart,
      mutate: async () => { events.push("mutate"); },
      now: () => times.shift()!,
      sample: 2,
    })).resolves.toEqual({
      snapshot: copied,
      writerOccupancyMs: 3,
      captureTotalMs: 20,
    });
    expect(events).toEqual(["capture", "captured", "mutate"]);
  });

  it("keeps the maximum fixture valid for indexed merge preflight", async () => {
    const archive = buildPhase12SyntheticSnapshot(2);
    const local = buildPhase12SyntheticSnapshot(1);

    const plan = await buildPortableMergePlan({
      archive,
      local,
      payloadDigest: async () => "0".repeat(64),
    });

    expect(Object.getOwnPropertyDescriptor(plan, "aggregates")?.get)
      .toEqual(expect.any(Function));
    expect(Object.keys(plan)).toEqual([
      "operations", "idRemaps", "idMappings", "settings", "aggregates", "preview",
    ]);
    expect(plan.preview).toEqual(expect.objectContaining({ archiveWon: 1 }));
  });
});
