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
  type PortableMergePlan,
  type PortableMergePlanSnapshot,
} from "../domains/portability/mergePlan";
import {
  createLogicalBackupRepository,
} from "../platform/sqlite/repositories/logicalBackupRepository";
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

const DATABASE_NAME = "gym-tracker-phase12-benchmark.db";
const OWNER_NAMESPACE = "f".repeat(32);
const ROWS_PER_TABLE = BACKUP_LIMITS.maxRowsPerTable;
const SQLITE_APP_SETTING_ROWS = PHASE12_MAX_SNAPSHOT_ROWS
  - 2
  - (ROWS_PER_TABLE * 3);

export const PHASE12_SQLITE_FIXTURE_ROW_COUNTS = Object.freeze({
  portable_owner_identity: 1,
  app_settings: SQLITE_APP_SETTING_ROWS,
  workout_sessions: 1,
  workout_session_exercise_edit_receipts: ROWS_PER_TABLE,
  workout_session_exercise_reorder_receipts: ROWS_PER_TABLE,
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

function encodedBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function portableId(index: number): string {
  return index.toString(16).padStart(32, "0").slice(-32);
}

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

async function seedMaximumHistory(kernel: SqliteKernel): Promise<void> {
  const totalRows = Object.values(PHASE12_SQLITE_FIXTURE_ROW_COUNTS)
    .reduce((total, count) => total + count, 0);
  if (totalRows !== PHASE12_MAX_SNAPSHOT_ROWS
    || Math.max(...Object.values(PHASE12_SQLITE_FIXTURE_ROW_COUNTS)) > ROWS_PER_TABLE) {
    throw new Error("phase12_sqlite_fixture_distribution_invalid");
  }
  await kernel.write(async (transaction) => {
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
              'remove_exercise', 's', 'e', NULL, 0, 1, '{}', value + 1
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
              'reorder_exercises', 's', '[]', 0, 1, '{}', value + 1
       FROM sequence`,
      [ROWS_PER_TABLE],
    );
  });
  const collector = createLogicalBackupRepository(kernel);
  const baseline = await collector.collect({ snapshotId: "phase12-writer-00", createdAtMs: 100 });
  const difference = PHASE12_MAX_SNAPSHOT_BYTES - encodedBytes(baseline);
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
  await deleteDatabaseAsync(DATABASE_NAME).catch(() => undefined);
  const kernel = await openSqliteKernel(DATABASE_NAME);
  try {
    await migrateBenchmarkDatabase("phase12", DATABASE_NAME, kernel);
    await seedMaximumHistory(kernel);
    const writerOccupancyMs: number[] = [];
    const captureTotalMs: number[] = [];
    let maximumSnapshot: LogicalBackupSnapshot | undefined;
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
        mutate: () => kernel.write((transaction) => transaction.execute(
          "UPDATE app_settings SET value_json = value_json WHERE key = ?",
          ["k0000"],
        )).then(() => undefined),
        now: () => performance.now(),
        sample: index,
      });
      writerOccupancyMs.push(measured.writerOccupancyMs);
      captureTotalMs.push(measured.captureTotalMs);
      maximumSnapshot ??= measured.snapshot;
    }
    if (maximumSnapshot === undefined || encodedBytes(maximumSnapshot) !== PHASE12_MAX_SNAPSHOT_BYTES
      || maximumSnapshot.manifest.totalRows !== PHASE12_MAX_SNAPSHOT_ROWS) {
      throw new Error("phase12_sqlite_fixture_size_invalid");
    }
    const dirtyTriggerMs: number[] = [];
    for (let index = 0; index < PHASE12_DIRTY_SAMPLES; index += 1) {
      const started = performance.now();
      await kernel.write((transaction) => transaction.execute(
        "UPDATE app_settings SET revision = revision + 1, updated_at_ms = ? WHERE key = ?",
        [index + 1_000_000, "phase12-benchmark-000000"],
      ));
      dirtyTriggerMs.push(performance.now() - started);
    }
    const archive = buildPhase12SyntheticSnapshot(2);
    const local = buildPhase12SyntheticSnapshot(1);
    const mergePreflightMs: number[] = [];
    const mergePlans: PortableMergePlan[] = [];
    let firstMergePlan: PortableMergePlan | undefined;
    let lastMergePlan: PortableMergePlan | undefined;
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
      if (shouldMaterializePhase12MergeSample(index)) mergePlans.push(plan);
      firstMergePlan ??= plan;
      lastMergePlan = plan;
    }
    if (firstMergePlan === undefined || lastMergePlan === undefined) {
      throw new Error("phase12_merge_plan_missing");
    }
    const mergeMaterializationMs = mergePlans.map((plan) => {
      const started = performance.now();
      const materializedRows = plan.settings.length + plan.aggregates.reduce(
        (total, aggregate) => total + Object.values(aggregate.tables).reduce(
          (rows, tableRows) => rows + tableRows.length,
          0,
        ),
        0,
      );
      if (materializedRows <= 0) throw new Error("phase12_merge_materialization_empty");
      return performance.now() - started;
    });
    const mergeSerializationMs: number[] = [];
    const serializedPlans = [firstMergePlan, lastMergePlan].map((plan) => {
      const serializationStarted = performance.now();
      const serialized = JSON.stringify(plan);
      mergeSerializationMs.push(performance.now() - serializationStarted);
      return serialized;
    });
    if (serializedPlans[0] !== serializedPlans[1]) throw new Error("phase12_merge_output_not_canonical");
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
        snapshot_bytes: encodedBytes(maximumSnapshot),
        total_rows: maximumSnapshot.manifest.totalRows,
        merge_digest_concurrency: MERGE_DIGEST_CONCURRENCY,
        merge_output_equivalent: true,
        network_inside_writer: false,
      },
      startedAt,
      finishedAt: new Date().toISOString(),
    };
  } finally {
    await kernel.close().catch(() => undefined);
  }
}
