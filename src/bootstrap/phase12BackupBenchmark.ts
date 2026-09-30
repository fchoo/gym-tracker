import {
  deleteDatabaseAsync,
} from "expo-sqlite";

import {
  BACKUP_LIMITS,
  LOGICAL_BACKUP_TABLES,
  type LogicalBackupRow,
  type LogicalBackupSnapshot,
} from "../domains/portability/backupContracts";
import {
  buildPortableMergePlan,
  MERGE_DIGEST_CONCURRENCY,
  type PortableMergePlanSnapshot,
} from "../domains/portability/mergePlan";
import { canonicalMergeValue } from "../domains/portability/mergeCommands";
import {
  createLogicalBackupRepository,
} from "../platform/sqlite/repositories/logicalBackupRepository";
import {
  createFullPlanLogicalMergeWriter,
  LOGICAL_MERGE_BATCH_PARAMETER_LIMIT,
} from "../platform/sqlite/repositories/logicalMergeRepository";
import type { LogicalMergeFaultStage } from "../platform/sqlite/repositories/logicalMergeRepository";
import { createSqliteMergeLocalFactsPort } from "../platform/sqlite/repositories/restorePreflightAdapters";
import {
  type AutomaticSnapshotCapturePort,
} from "../platform/sqlite/repositories/automaticSnapshotCapture";
import {
  openSqliteKernel,
  type SqliteKernel,
} from "../platform/sqlite";
import {
  migrateBenchmarkDatabase,
} from "./benchmarkRecovery";
import {
  createProductionAutomaticSnapshotCapture,
} from "./productionAutomaticSnapshotCapture";

export const PHASE12_BENCHMARK_START_MARKER =
  "GYM_TRACKER_PHASE12_BENCHMARK_START:" as const;
export const PHASE12_BENCHMARK_PROGRESS_MARKER =
  "GYM_TRACKER_PHASE12_BENCHMARK_PROGRESS:" as const;
export const PHASE12_BENCHMARK_RESULT_MARKER =
  "GYM_TRACKER_PHASE12_BENCHMARK_RESULT:" as const;
export const PHASE12_BENCHMARK_ERROR_MARKER =
  "GYM_TRACKER_PHASE12_BENCHMARK_ERROR:" as const;

export const PHASE12_MAX_SNAPSHOT_BYTES = BACKUP_LIMITS.maxPlaintextBytes;
export const PHASE12_MAX_SNAPSHOT_ROWS = BACKUP_LIMITS.maxRowsTotal;
export const PHASE12_DIRTY_SAMPLES = 100;
export const PHASE12_WRITER_SAMPLES = 20;
export const PHASE12_MERGE_SAMPLES = 10;

const DATABASE_PREFIX = "gym-tracker-phase12-benchmark";

export function phase12BenchmarkDatabaseName(uuid: string): string {
  if (!/^[a-f0-9-]{36}$/u.test(uuid)) throw new Error("phase12_benchmark_database_identity_invalid");
  return `${DATABASE_PREFIX}-${uuid}.db`;
}

export function phase12BenchmarkError(error: unknown, sample: number, stage: LogicalMergeFaultStage | "writer_start"): Error {
  const messages: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current instanceof Error; depth += 1) {
    messages.push(current.message);
    current = current.cause;
  }
  return new Error(`phase12_merge_commit_failed:${sample}:${stage}:${messages.join(":")}`);
}
const OWNER_NAMESPACE = "f".repeat(32);
const ROWS_PER_TABLE = BACKUP_LIMITS.maxRowsPerTable;
const ALIAS_ROWS = 10_000;
const REORDER_RECEIPT_ROWS = ROWS_PER_TABLE - ALIAS_ROWS;
export const PHASE12_SQLITE_PRE_PADDING_BYTES = 23_239_960;
const SQLITE_APP_SETTING_ROWS = PHASE12_MAX_SNAPSHOT_ROWS
  - 5
  - (ROWS_PER_TABLE * 3);

export const PHASE12_SQLITE_FIXTURE_ROW_COUNTS = Object.freeze({
  portable_owner_identity: 1,
  app_settings: SQLITE_APP_SETTING_ROWS,
  workout_sessions: 1,
  session_exercises: 1,
  exercises: 1,
  exercise_library_entries: 1,
  exercise_aliases: ALIAS_ROWS,
  workout_session_exercise_edit_receipts: ROWS_PER_TABLE,
  workout_session_exercise_reorder_receipts: REORDER_RECEIPT_ROWS,
  history_audit_events: ROWS_PER_TABLE,
});

export type Phase12BackupBenchmarkResult = Readonly<{
  schemaVersion: 1;
  suite: "phase12";
  status: "passed";
  measurements: Readonly<{
    dirty_trigger_ms: readonly number[];
    writer_occupancy_ms: readonly number[];
    capture_total_ms: readonly number[];
    merge_preflight_ms: readonly number[];
    merge_materialization_ms: readonly number[];
    merge_serialization_ms: readonly number[];
    snapshot_bytes: number;
    total_rows: number;
    merge_digest_concurrency: number;
    merge_output_equivalent: true;
    network_inside_writer: false;
    sqlite_max_variable_number: number;
  }>;
  startedAt: string;
  finishedAt: string;
}>;

export function phase12BenchmarkStartupAction(input: Readonly<{
  enabled: boolean;
  launchState: "booting" | "trusted" | "failed";
  started: boolean;
  suite: string | undefined;
}>): "disabled" | "wait" | "fail" | "start" {
  if (!input.enabled || input.suite !== "phase12") return "disabled";
  if (input.started || input.launchState === "booting") return "wait";
  return input.launchState === "trusted" ? "start" : "fail";
}

export function shouldSerializePhase12MergeSample(sample: number): boolean {
  return sample === 0 || sample === PHASE12_MERGE_SAMPLES - 1;
}

export function shouldMaterializePhase12MergeSample(sample: number): boolean {
  return sample < 5;
}

export async function phase12SqliteVariableLimit(kernel: SqliteKernel): Promise<number> {
  const options = await kernel.queryAll<{ compile_options: string }>("PRAGMA compile_options");
  const value = options.find(({ compile_options }) => (
    compile_options.startsWith("MAX_VARIABLE_NUMBER=")
  ))?.compile_options.split("=")[1];
  const limit = Number(value);
  if (!Number.isSafeInteger(limit) || limit < LOGICAL_MERGE_BATCH_PARAMETER_LIMIT) {
    throw new Error("phase12_sqlite_variable_limit_invalid");
  }
  return limit;
}

function encodedBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function portableId(index: number): string {
  return index.toString(16).padStart(32, "0").slice(-32);
}
export const PHASE12_BENCHMARK_EXERCISE_PORTABLE_ID = portableId(2);

/** A schema-valid, deterministic maximum-size fixture used only by dev-test benchmarking. */
export function buildPhase12SyntheticSnapshot(
  mergeModifiedAtMs = 1,
): LogicalBackupSnapshot & PortableMergePlanSnapshot {
  const sessions = [{
    id: "s",
    portable_id: portableId(1),
    merge_modified_at_ms: mergeModifiedAtMs,
  }];
  const sessionExercises = Array.from({ length: ROWS_PER_TABLE }, (_, index) => ({
    id: `e${index.toString(36)}`,
    session_id: sessions[0]!.id,
    metric_profile: "load_reps",
    metric_contract_version: 1,
    exercise_metric_generation: 1,
  }));
  const sessionSets = Array.from({ length: ROWS_PER_TABLE }, (_, index) => ({
    id: `t${index.toString(36)}`,
    session_exercise_id: sessionExercises[index]!.id,
    metric_profile: "load_reps",
    metric_contract_version: 1,
    exercise_metric_generation: 1,
  }));
  const auditRows = Array.from({ length: ROWS_PER_TABLE }, (_, index) => ({
    id: `a${index.toString(36)}`,
    session_id: sessions[0]!.id,
    padding: "",
  }));
  const undoRows = Array.from({ length: ROWS_PER_TABLE - 3 }, (_, index) => ({
    id: `u${index.toString(36)}`,
    session_id: sessions[0]!.id,
    completed_set_id: sessionSets[0]!.id,
  }));
  const settingCount = PHASE12_MAX_SNAPSHOT_ROWS
    - 1
    - sessions.length
    - sessionExercises.length
    - sessionSets.length
    - auditRows.length
    - undoRows.length;
  const settings = Array.from({ length: settingCount }, (_, index) => ({
    key: `k${index.toString(36).padStart(4, "0")}`,
    value_version: 1,
    value_json: JSON.stringify({ padding: "" }),
    revision: index + 1,
    updated_at_ms: index + 1,
  }));
  const tables = Object.fromEntries(
    LOGICAL_BACKUP_TABLES.map((table) => [table, [] as LogicalBackupRow[]]),
  );
  tables.portable_owner_identity = [{ id: 1, owner_namespace: OWNER_NAMESPACE }];
  tables.app_settings = settings;
  tables.workout_sessions = sessions;
  tables.session_exercises = sessionExercises;
  tables.session_sets = sessionSets;
  tables.history_audit_events = auditRows;
  tables.session_undo_snapshots = undoRows;
  const fixture = {
    version: 2 as const,
    snapshotId: "phase12-maximum-merge",
    createdAtMs: 1,
    schemaVersion: 26,
    manifest: {
      catalogReferenceCount: 0,
      rowCounts: Object.fromEntries(
        LOGICAL_BACKUP_TABLES.map((table) => [table, tables[table]!.length]),
      ),
      totalRows: PHASE12_MAX_SNAPSHOT_ROWS,
    },
    tables,
    catalogReferences: [],
  };
  const difference = PHASE12_MAX_SNAPSHOT_BYTES - encodedBytes(fixture);
  if (difference < 0) throw new Error("phase12_synthetic_fixture_oversize");
  const each = Math.floor(difference / auditRows.length);
  const remainder = difference % auditRows.length;
  for (let index = 0; index < auditRows.length; index += 1) {
    auditRows[index]!.padding = "x".repeat(each + (index < remainder ? 1 : 0));
  }
  if (encodedBytes(fixture) !== PHASE12_MAX_SNAPSHOT_BYTES) {
    throw new Error("phase12_synthetic_fixture_size_invalid");
  }
  return fixture;
}

export async function seedMaximumHistory(kernel: SqliteKernel): Promise<void> {
  const totalRows = Object.values(PHASE12_SQLITE_FIXTURE_ROW_COUNTS)
    .reduce((total, count) => total + count, 0);
  if (totalRows !== PHASE12_MAX_SNAPSHOT_ROWS
    || Math.max(...Object.values(PHASE12_SQLITE_FIXTURE_ROW_COUNTS)) > ROWS_PER_TABLE) {
    throw new Error("phase12_sqlite_fixture_distribution_invalid");
  }
  await kernel.write(async (transaction) => {
    await transaction.execute(
      `INSERT INTO exercises
        (id, content_pack_id, origin, source_namespace, upstream_id, name,
         metric_profile, metric_contract_version, exercise_metric_generation,
         equipment, default_rest_seconds, revision, portable_id)
       VALUES ('benchmark-exercise', NULL, 'custom', NULL, NULL, 'Benchmark',
               'load_reps', 1, 1, 'Unspecified', 90, 1, ?)`,
      [PHASE12_BENCHMARK_EXERCISE_PORTABLE_ID],
    );
    await transaction.execute(
      `INSERT INTO exercise_library_entries
        (exercise_id, origin, canonical_name, exercise_type, movement_class,
         metric_profile, metric_contract_version, exercise_metric_generation,
         availability, revision)
       VALUES ('benchmark-exercise', 'custom', 'Benchmark', 'strength', 'compound',
               'load_reps', 1, 1, 'available', 1)`,
    );
    await transaction.execute(
      `WITH RECURSIVE sequence(value) AS (
         VALUES(0) UNION ALL SELECT value + 1 FROM sequence WHERE value + 1 < ?
       )
       INSERT INTO exercise_aliases
         (id, exercise_id, ordinal, display_text, normalized_text)
       SELECT value + 1, 'benchmark-exercise', value,
              'a' || printf('%06x', value), 'a' || printf('%06x', value)
       FROM sequence`,
      [ALIAS_ROWS],
    );
    await transaction.execute(
      `INSERT INTO workout_sessions
        (id, plan_id, plan_day_id, source, status, local_date, timezone,
         started_at_ms, completed_at_ms, revision,
         creation_timezone_offset_minutes, modified_from_plan,
         portable_id, merge_modified_at_ms)
       VALUES ('s', NULL, NULL, 'manual', 'completed', '1970-01-01', 'UTC',
               0, 0, 0, 0, 0, ?, 0)`,
      [portableId(1)],
    );
    await transaction.execute(
      `INSERT INTO session_exercises
        (id, session_id, source_plan_day_exercise_id, exercise_id, ordinal, origin,
         display_ordinal, exercise_name, metric_profile, metric_contract_version,
         exercise_metric_generation, advanced_timing_default_json,
         default_rest_seconds, target_revision, status, revision)
       VALUES ('e', 's', NULL, 'benchmark-exercise', 0, 'added', 0, 'Benchmark',
               'load_reps', 1, 1, '{"version":1,"mode":"off"}', 90, 1, 'completed', 1)`,
    );
    await transaction.execute(
      `WITH RECURSIVE sequence(value) AS (
         VALUES(0) UNION ALL SELECT value + 1 FROM sequence WHERE value + 1 < ?
       )
       INSERT INTO app_settings(key, value_version, value_json, revision, updated_at_ms)
       SELECT 'k' || printf('%06x', value), 1, '{"padding":""}', value + 1, value + 1
       FROM sequence`,
      [SQLITE_APP_SETTING_ROWS],
    );
    await transaction.execute(
      `WITH RECURSIVE sequence(value) AS (
         VALUES(0) UNION ALL SELECT value + 1 FROM sequence WHERE value + 1 < ?
       )
       INSERT INTO history_audit_events
         (id, session_id, effective_revision, event_type, field_identity,
          before_json, after_json, occurred_at_ms)
       SELECT 'a' || printf('%06x', value), 's', value + 1, 'restore', 'x', '{}', '{}', value + 1
       FROM sequence`,
      [ROWS_PER_TABLE],
    );
    await transaction.execute(
      `WITH RECURSIVE sequence(value) AS (
         VALUES(0) UNION ALL SELECT value + 1 FROM sequence WHERE value + 1 < ?
       )
       INSERT INTO workout_session_exercise_edit_receipts
         (request_id, request_sha256, operation, session_id,
          subject_session_exercise_id, replacement_session_exercise_id,
          expected_session_revision, result_session_revision, result_json,
          committed_at_ms)
       SELECT 'e' || printf('%06x', value), lower(hex(zeroblob(32))),
              'remove_exercise', 's', 'e', NULL, 0, 1,
              '{"sessionId":"s","sessionExerciseId":"e"}', value + 1
       FROM sequence`,
      [ROWS_PER_TABLE],
    );
    await transaction.execute(
      `WITH RECURSIVE sequence(value) AS (
         VALUES(0) UNION ALL SELECT value + 1 FROM sequence WHERE value + 1 < ?
       )
       INSERT INTO workout_session_exercise_reorder_receipts
         (request_id, request_sha256, operation, session_id,
          ordered_session_exercise_ids_json, expected_session_revision,
          result_session_revision, result_json, committed_at_ms)
       SELECT 'r' || printf('%06x', value), lower(hex(zeroblob(32))),
              'reorder_exercises', 's', '[]', 0, 1,
              '{"sessionId":"s","orderedSessionExerciseIds":[],"expectedSessionExerciseRevisions":[]}',
              value + 1
       FROM sequence`,
      [REORDER_RECEIPT_ROWS],
    );
  });
  const collector = createLogicalBackupRepository(kernel);
  const baseline = await collector.collect({ snapshotId: "phase12-writer-00", createdAtMs: 100 });
  const baselineBytes = encodedBytes(baseline);
  if (baselineBytes !== PHASE12_SQLITE_PRE_PADDING_BYTES) {
    throw new Error(`phase12_sqlite_fixture_baseline_invalid:${baselineBytes}`);
  }
  const difference = PHASE12_MAX_SNAPSHOT_BYTES - baselineBytes;
  if (difference < 0) throw new Error("phase12_sqlite_fixture_oversize");
  const each = Math.floor(difference / SQLITE_APP_SETTING_ROWS);
  const remainder = difference % SQLITE_APP_SETTING_ROWS;
  const maximumPaddedValue = JSON.stringify({
    padding: "x".repeat(each + (remainder > 0 ? 1 : 0)),
  });
  if (encodedBytes(maximumPaddedValue) > BACKUP_LIMITS.maxStringBytes) {
    throw new Error("phase12_sqlite_fixture_padding_invalid");
  }
  await kernel.write(async (transaction) => {
    await transaction.execute(
      "UPDATE app_settings SET value_json = ?",
      [JSON.stringify({ padding: "x".repeat(each) })],
    );
    if (remainder > 0) {
      await transaction.execute(
        "UPDATE app_settings SET value_json = ? WHERE key < ?",
        [
          JSON.stringify({ padding: "x".repeat(each + 1) }),
          `k${remainder.toString(16).padStart(6, "0")}`,
        ],
      );
    }
  });
}

export async function measureReaderSnapshotWithConcurrentMutation(input: Readonly<{
  capture: AutomaticSnapshotCapturePort;
  waitForCopyStart: Promise<void>;
  mutate(): Promise<void>;
  now(): number;
  sample: number;
}>): Promise<Readonly<{
  snapshot: Awaited<ReturnType<AutomaticSnapshotCapturePort["capture"]>>["snapshot"];
  writerOccupancyMs: number;
  captureTotalMs: number;
}>> {
  const captureStarted = input.now();
  const capturePromise = input.capture.capture({
    snapshotId: `phase12-writer-${input.sample.toString().padStart(2, "0")}`,
    createdAtMs: 100 + input.sample,
  });
  await input.waitForCopyStart;
  const writerStarted = input.now();
  await input.mutate();
  const writerOccupancyMs = input.now() - writerStarted;
  const captured = await capturePromise;
  return Object.freeze({
    snapshot: captured.snapshot,
    writerOccupancyMs,
    captureTotalMs: input.now() - captureStarted,
  });
}

export async function performPhase12BackupBenchmark(): Promise<Phase12BackupBenchmarkResult> {
  const startedAt = new Date().toISOString();
  const { randomUUID } = require("expo-crypto") as typeof import("expo-crypto");
  const databaseName = phase12BenchmarkDatabaseName(randomUUID());
  const kernel = await openSqliteKernel(databaseName);
  try {
    await migrateBenchmarkDatabase("phase12", databaseName, kernel);
    const sqliteMaxVariableNumber = await phase12SqliteVariableLimit(kernel);
    await seedMaximumHistory(kernel);
    const writerOccupancyMs: number[] = [];
    const captureTotalMs: number[] = [];
    let snapshotBytes: number | undefined;
    let totalRows: number | undefined;
    for (let index = 0; index < PHASE12_WRITER_SAMPLES; index += 1) {
      console.log(`${PHASE12_BENCHMARK_PROGRESS_MARKER}${JSON.stringify({ stage: "capture", sample: index })}`);
      let signalCopyStarted: (() => void) | undefined;
      const waitForCopyStart = new Promise<void>((resolve) => { signalCopyStarted = resolve; });
      const capture = createProductionAutomaticSnapshotCapture({
        kernel,
        onSnapshotStart: () => signalCopyStarted?.(),
      });
      const measured = await measureReaderSnapshotWithConcurrentMutation({
        capture,
        waitForCopyStart,
        mutate: async () => {
          const mutation = await kernel.write((transaction) => transaction.execute(
            "UPDATE app_settings SET value_json = value_json WHERE key = ?",
            ["k000000"],
          ));
          if (mutation.changes !== 1) throw new Error("phase12_capture_mutation_missing");
        },
        now: () => performance.now(),
        sample: index,
      });
      writerOccupancyMs.push(measured.writerOccupancyMs);
      captureTotalMs.push(measured.captureTotalMs);
      if (snapshotBytes === undefined) {
        snapshotBytes = encodedBytes(measured.snapshot);
        totalRows = measured.snapshot.manifest.totalRows;
      }
    }
    if (snapshotBytes !== PHASE12_MAX_SNAPSHOT_BYTES
      || totalRows !== PHASE12_MAX_SNAPSHOT_ROWS) {
      throw new Error("phase12_sqlite_fixture_size_invalid");
    }
    const dirtyTriggerMs: number[] = [];
    for (let index = 0; index < PHASE12_DIRTY_SAMPLES; index += 1) {
      const started = performance.now();
      const mutation = await kernel.write((transaction) => transaction.execute(
        "UPDATE app_settings SET revision = revision + 1, updated_at_ms = ? WHERE key = ?",
        [index + 1_000_000, "k000000"],
      ));
      if (mutation.changes !== 1) throw new Error("phase12_dirty_trigger_mutation_missing");
      dirtyTriggerMs.push(performance.now() - started);
    }
    const mergePreflightMs: number[] = [];
    const mergeSerializationMs: number[] = [];
    let materializationSampleCount = 0;
    let firstSerializedPlan: string | undefined;
    let mergeOutputEquivalent = false;
    {
      const archive = buildPhase12SyntheticSnapshot(2);
      const local = buildPhase12SyntheticSnapshot(1);
      for (let index = 0; index < PHASE12_MERGE_SAMPLES; index += 1) {
        console.log(`${PHASE12_BENCHMARK_PROGRESS_MARKER}${JSON.stringify({ stage: "merge", sample: index })}`);
        const started = performance.now();
        const plan = await buildPortableMergePlan({
          archive,
          local,
          payloadDigest: async (value) => {
            const { CryptoDigestAlgorithm, digestStringAsync } = require("expo-crypto") as typeof import("expo-crypto");
            return digestStringAsync(CryptoDigestAlgorithm.SHA256, value);
          },
        });
        mergePreflightMs.push(performance.now() - started);
        if (shouldMaterializePhase12MergeSample(index)) materializationSampleCount += 1;
        if (shouldSerializePhase12MergeSample(index)) {
          const serializationStarted = performance.now();
          const serialized = JSON.stringify(plan);
          mergeSerializationMs.push(performance.now() - serializationStarted);
          if (firstSerializedPlan === undefined) firstSerializedPlan = serialized;
          else {
            if (serialized !== firstSerializedPlan) throw new Error("phase12_merge_output_not_canonical");
            firstSerializedPlan = undefined;
            mergeOutputEquivalent = true;
          }
        }
      }
    }
    console.log(`${PHASE12_BENCHMARK_PROGRESS_MARKER}${JSON.stringify({
      stage: "merge_complete",
      sample: PHASE12_MERGE_SAMPLES,
    })}`);
    if (materializationSampleCount !== 5 || mergeSerializationMs.length !== 2
      || !mergeOutputEquivalent || firstSerializedPlan !== undefined) {
      throw new Error("phase12_merge_plan_missing");
    }
    const mergeMaterializationMs: number[] = [];
    let mergeStage: LogicalMergeFaultStage | "writer_start" = "writer_start";
    let materializationSample = -1;
    let materializationStarted = 0;
    const mergeWriter = createFullPlanLogicalMergeWriter(kernel, {
      sha256: async (value) => {
        const { CryptoDigestAlgorithm, digestStringAsync } = require("expo-crypto") as typeof import("expo-crypto");
        return digestStringAsync(CryptoDigestAlgorithm.SHA256, value);
      },
      faultAfter: async (stage) => {
        mergeStage = stage;
        console.log(`${PHASE12_BENCHMARK_PROGRESS_MARKER}${JSON.stringify({
          stage: "materialization_writer",
          sample: materializationSample,
          writer_stage: stage,
          elapsed_ms: performance.now() - materializationStarted,
        })}`);
      },
      observeTiming: (stage, elapsedMs) => {
        console.log(`${PHASE12_BENCHMARK_PROGRESS_MARKER}${JSON.stringify({
          stage: "materialization_timing",
          sample: materializationSample,
          writer_stage: stage,
          elapsed_ms: elapsedMs,
        })}`);
      },
    });
    for (let index = 0; index < materializationSampleCount; index += 1) {
      materializationSample = index;
      const planningStarted = performance.now();
      console.log(`${PHASE12_BENCHMARK_PROGRESS_MARKER}${JSON.stringify({
        stage: "materialization_plan",
        sample: index,
        event: "started",
      })}`);
      const live = await createSqliteMergeLocalFactsPort(kernel).read();
      const currentSession = live.tables.workout_sessions?.[0];
      if (currentSession === undefined) throw new Error("phase12_merge_materialization_empty");
      const archive = {
        version: 2 as const,
        schemaVersion: live.schemaVersion,
        tables: {
          ...live.tables,
          portable_owner_identity: [{ id: 1, owner_namespace: live.ownerNamespace }],
          workout_sessions: [{ ...currentSession, merge_modified_at_ms: Number(currentSession.merge_modified_at_ms) + index + 1 }],
        },
      };
      const plan = await buildPortableMergePlan({ archive, local: { version: 2, ...live }, payloadDigest: async (value) => {
        const { CryptoDigestAlgorithm, digestStringAsync } = require("expo-crypto") as typeof import("expo-crypto");
        return digestStringAsync(CryptoDigestAlgorithm.SHA256, value);
      } });
      const localFingerprint = await (async () => {
        const { CryptoDigestAlgorithm, digestStringAsync } = require("expo-crypto") as typeof import("expo-crypto");
        return digestStringAsync(CryptoDigestAlgorithm.SHA256, canonicalMergeValue(live));
      })();
      console.log(`${PHASE12_BENCHMARK_PROGRESS_MARKER}${JSON.stringify({
        stage: "materialization_plan",
        sample: index,
        event: "completed",
        elapsed_ms: performance.now() - planningStarted,
      })}`);
      materializationStarted = performance.now();
      mergeStage = "writer_start";
      console.log(`${PHASE12_BENCHMARK_PROGRESS_MARKER}${JSON.stringify({
        stage: "materialization",
        sample: index,
        event: "started",
      })}`);
      try {
        await mergeWriter.commitFullPlan({
          localFingerprint,
          plan,
        });
      } catch (error) { throw phase12BenchmarkError(error, index, mergeStage); }
      const materializationElapsedMs = performance.now() - materializationStarted;
      mergeMaterializationMs.push(materializationElapsedMs);
      console.log(`${PHASE12_BENCHMARK_PROGRESS_MARKER}${JSON.stringify({
        stage: "materialization",
        sample: index,
        event: "completed",
        elapsed_ms: materializationElapsedMs,
      })}`);
    }
    return {
      schemaVersion: 1,
      suite: "phase12",
      status: "passed",
      measurements: {
        dirty_trigger_ms: dirtyTriggerMs,
        writer_occupancy_ms: writerOccupancyMs,
        capture_total_ms: captureTotalMs,
        merge_preflight_ms: mergePreflightMs,
        merge_materialization_ms: mergeMaterializationMs,
        merge_serialization_ms: mergeSerializationMs,
        snapshot_bytes: snapshotBytes,
        total_rows: totalRows,
        merge_digest_concurrency: MERGE_DIGEST_CONCURRENCY,
        merge_output_equivalent: true,
        network_inside_writer: false,
        sqlite_max_variable_number: sqliteMaxVariableNumber,
      },
      startedAt,
      finishedAt: new Date().toISOString(),
    };
  } finally {
    await kernel.close().catch(() => undefined);
    await deleteDatabaseAsync(databaseName).catch(() => undefined);
  }
}
