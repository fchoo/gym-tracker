import {
  deleteDatabaseAsync,
} from "expo-sqlite";

import {
  buildPortableMergePlan,
  MERGE_DIGEST_CONCURRENCY,
  type PortableMergePlanSnapshot,
} from "../domains/portability/mergePlan";
import {
  createLogicalBackupRepository,
} from "../platform/sqlite/repositories/logicalBackupRepository";
import {
  openSqliteKernel,
  type SqliteKernel,
} from "../platform/sqlite";
import {
  migrateBenchmarkDatabase,
} from "./benchmarkRecovery";

export const PHASE12_BENCHMARK_START_MARKER =
  "GYM_TRACKER_PHASE12_BENCHMARK_START:" as const;
export const PHASE12_BENCHMARK_PROGRESS_MARKER =
  "GYM_TRACKER_PHASE12_BENCHMARK_PROGRESS:" as const;
export const PHASE12_BENCHMARK_RESULT_MARKER =
  "GYM_TRACKER_PHASE12_BENCHMARK_RESULT:" as const;
export const PHASE12_BENCHMARK_ERROR_MARKER =
  "GYM_TRACKER_PHASE12_BENCHMARK_ERROR:" as const;

export const PHASE12_MAX_SNAPSHOT_BYTES = 24 * 1024 * 1024;
export const PHASE12_MAX_SNAPSHOT_ROWS = 100_000;
export const PHASE12_DIRTY_SAMPLES = 100;
export const PHASE12_WRITER_SAMPLES = 20;
export const PHASE12_MERGE_SAMPLES = 10;

const DATABASE_NAME = "gym-tracker-phase12-benchmark.db";
const OWNER_NAMESPACE = "f".repeat(32);

export type Phase12BackupBenchmarkResult = Readonly<{
  schemaVersion: 1;
  suite: "phase12";
  status: "passed";
  measurements: Readonly<{
    dirty_trigger_ms: readonly number[];
    writer_occupancy_ms: readonly number[];
    merge_preflight_ms: readonly number[];
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

function encodedBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function portableId(index: number): string {
  return index.toString(16).padStart(32, "0").slice(-32);
}

/** A schema-valid, deterministic maximum-size fixture used only by dev-test benchmarking. */
export function buildPhase12SyntheticSnapshot(
  mergeModifiedAtMs = 1,
): PortableMergePlanSnapshot & Readonly<{ manifest: Readonly<{ totalRows: number }> }> {
  const sessions = Array.from({ length: PHASE12_MAX_SNAPSHOT_ROWS - 1 }, (_, index) => ({
    id: `benchmark-session-${index}`,
    portable_id: portableId(index + 1),
    merge_modified_at_ms: mergeModifiedAtMs,
    padding: "",
  }));
  const fixture = {
    version: 2 as const,
    schemaVersion: 26,
    manifest: { totalRows: PHASE12_MAX_SNAPSHOT_ROWS },
    tables: {
      portable_owner_identity: [{ id: 1, owner_namespace: OWNER_NAMESPACE }],
      workout_sessions: sessions,
      session_exercises: [],
      session_sets: [],
    },
  };
  const difference = PHASE12_MAX_SNAPSHOT_BYTES - encodedBytes(fixture);
  if (difference < 0) throw new Error("phase12_synthetic_fixture_oversize");
  const each = Math.floor(difference / sessions.length);
  const remainder = difference % sessions.length;
  for (let index = 0; index < sessions.length; index += 1) {
    sessions[index]!.padding = "x".repeat(each + (index < remainder ? 1 : 0));
  }
  if (encodedBytes(fixture) !== PHASE12_MAX_SNAPSHOT_BYTES) {
    throw new Error("phase12_synthetic_fixture_size_invalid");
  }
  return fixture;
}

async function seedMaximumHistory(kernel: SqliteKernel): Promise<void> {
  const rowCount = PHASE12_MAX_SNAPSHOT_ROWS - 1;
  const rows = Array.from({ length: rowCount }, (_, index) => ({
    key: `phase12-benchmark-${index.toString().padStart(6, "0")}`,
    value: JSON.stringify({ padding: "" }),
  }));
  for (let start = 0; start < rows.length; start += 250) {
    await kernel.write(async (transaction) => {
      for (const row of rows.slice(start, start + 250)) {
        await transaction.execute(
          "INSERT INTO app_settings(key, value_version, value_json, revision, updated_at_ms) VALUES (?, 1, ?, 0, 0)",
          [row.key, row.value],
        );
      }
    });
  }
  const collector = createLogicalBackupRepository(kernel);
  // Establish the final revision/timestamp widths before sizing padding. The
  // subsequent value-only update still exercises the v23 trigger but cannot
  // change the serialized non-padding shape.
  for (let start = 0; start < rows.length; start += 250) {
    await kernel.write(async (transaction) => {
      for (let offset = 0; offset < Math.min(250, rows.length - start); offset += 1) {
        const index = start + offset;
        await transaction.execute(
          "UPDATE app_settings SET revision = ?, updated_at_ms = ? WHERE key = ?",
          [index + 1, index + 1, rows[index]!.key],
        );
      }
    });
  }
  const baseline = await collector.collect({ snapshotId: "phase12-writer-00", createdAtMs: 100 });
  const difference = PHASE12_MAX_SNAPSHOT_BYTES - encodedBytes(baseline);
  if (difference < 0) throw new Error("phase12_sqlite_fixture_oversize");
  const each = Math.floor(difference / rows.length);
  const remainder = difference % rows.length;
  for (let start = 0; start < rows.length; start += 250) {
    await kernel.write(async (transaction) => {
      for (let offset = 0; offset < Math.min(250, rows.length - start); offset += 1) {
        const index = start + offset;
        await transaction.execute(
          "UPDATE app_settings SET value_json = ? WHERE key = ?",
          [JSON.stringify({ padding: "x".repeat(each + (index < remainder ? 1 : 0)) }), rows[index]!.key],
        );
      }
    });
  }
}

async function collectMaximumSnapshot(kernel: SqliteKernel, sample: number) {
  return createLogicalBackupRepository(kernel).collect({
    snapshotId: `phase12-writer-${sample.toString().padStart(2, "0")}`,
    createdAtMs: 100 + sample,
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
    let maximumSnapshot: Awaited<ReturnType<typeof collectMaximumSnapshot>> | undefined;
    for (let index = 0; index < PHASE12_WRITER_SAMPLES; index += 1) {
      const started = performance.now();
      const snapshot = await collectMaximumSnapshot(kernel, index);
      writerOccupancyMs.push(performance.now() - started);
      maximumSnapshot ??= snapshot;
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
    let canonicalPlan: string | undefined;
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
      const serialized = JSON.stringify(plan);
      canonicalPlan ??= serialized;
      if (canonicalPlan !== serialized) throw new Error("phase12_merge_output_not_canonical");
    }
    return {
      schemaVersion: 1,
      suite: "phase12",
      status: "passed",
      measurements: {
        dirty_trigger_ms: dirtyTriggerMs,
        writer_occupancy_ms: writerOccupancyMs,
        merge_preflight_ms: mergePreflightMs,
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
