import {
  canonicalMergeValue,
  type StoredMergePreflight,
} from "../../domains/portability/mergeCommands";
import {
  createLogicalBackupRepository,
} from "../../platform/sqlite/repositories/logicalBackupRepository";
import {
  createLogicalMergeRepository,
} from "../../platform/sqlite/repositories/logicalMergeRepository";
import {
  createSqliteMergeLocalFactsPort,
} from "../../platform/sqlite/repositories/restorePreflightAdapters";
import {
  createMigrationRunner,
} from "../../platform/sqlite/migrationRunner";
import { migrations } from "../../platform/sqlite/migrations";
import type {
  RecoveryBackupPort,
} from "../../platform/sqlite/recoveryBackup";
import type {
  SqliteKernel,
  SqliteKernelTestObserver,
} from "../../platform/sqlite/sqliteKernel";
import {
  createExpoMigrationsEffectsContractAdapter,
} from "./migrationsEffects.contract";

export const PORTABLE_MERGE_CONTRACT_VERSION = 1 as const;

export const PORTABLE_MERGE_CONTRACT_CASES = [
  "portable-merge-archive-wins",
  "portable-merge-insert-rollback",
  "portable-merge-verification-rollback",
] as const;

export type PortableMergeContractCaseId =
  (typeof PORTABLE_MERGE_CONTRACT_CASES)[number];

type PortableMergeContractRuntime = Readonly<{
  databaseName: string;
  kernel: SqliteKernel;
  close(): Promise<void>;
}>;

export type PortableMergeContractAdapter = Readonly<{
  createRuntime(
    databaseKey: string,
    observer?: SqliteKernelTestObserver,
  ): Promise<PortableMergeContractRuntime>;
  recoveryBackup: RecoveryBackupPort;
  cleanup?(): Promise<void>;
  sha256(value: string): Promise<string>;
}>;

export type PortableMergeContractCaseResult = Readonly<{
  id: PortableMergeContractCaseId;
  status: "passed" | "failed";
  durationMs: number;
  errorCode?: string;
}>;

export type PortableMergeContractResult = Readonly<{
  schemaVersion: 1;
  contractVersion: typeof PORTABLE_MERGE_CONTRACT_VERSION;
  status: "passed" | "failed";
  total: number;
  passed: number;
  failed: number;
  skipped: 0;
  cases: readonly PortableMergeContractCaseResult[];
  startedAt: string;
  finishedAt: string;
}>;

export async function createExpoPortableMergeContractAdapter(
  runId: string,
): Promise<PortableMergeContractAdapter> {
  const base = await createExpoMigrationsEffectsContractAdapter(
    `portable-merge-${runId}`,
  );
  const {
    CryptoDigestAlgorithm,
    digestStringAsync,
  } = require("expo-crypto") as typeof import("expo-crypto");
  return {
    createRuntime: base.createRuntime,
    recoveryBackup: base.recoveryBackup,
    ...(base.cleanup === undefined ? {} : { cleanup: base.cleanup }),
    sha256: (value) => digestStringAsync(CryptoDigestAlgorithm.SHA256, value),
  };
}

function invariant(value: unknown, code: string): asserts value {
  if (!value) throw new Error(code);
}

function safeErrorCode(error: unknown): string {
  if (typeof error === "object" && error !== null
    && "code" in error && typeof error.code === "string") {
    return error.code.slice(0, 80);
  }
  if (error instanceof Error && /^[a-z0-9_:-]{3,80}$/iu.test(error.message)) {
    return error.message;
  }
  return "portable_merge_contract_failed";
}

async function migrate(
  runtime: PortableMergeContractRuntime,
  recoveryBackup: RecoveryBackupPort,
): Promise<void> {
  await createMigrationRunner({
    databaseName: runtime.databaseName,
    kernel: runtime.kernel,
    migrations,
    recoveryBackup,
  }).run();
}

async function seedBundledExercise(kernel: SqliteKernel): Promise<void> {
  await kernel.write(async (transaction) => {
    await transaction.execute(
      "INSERT INTO exercises (id, content_pack_id, origin, source_namespace, upstream_id, name, metric_profile, metric_contract_version, exercise_metric_generation, equipment, default_rest_seconds, revision) VALUES ('portable-merge-bundled', NULL, 'bundled', 'catalog', 'portable-merge-bundled', 'Portable merge bundled', 'load_reps', 1, 1, 'Unspecified', 90, 1)",
    );
    await transaction.execute(
      "INSERT INTO exercise_library_entries (exercise_id, origin, canonical_name, exercise_type, movement_class, metric_profile, metric_contract_version, exercise_metric_generation, availability, revision) VALUES ('portable-merge-bundled', 'bundled', 'Portable merge bundled', 'strength', 'compound', 'load_reps', 1, 1, 'available', 1)",
    );
  });
}

async function seedSession(
  kernel: SqliteKernel,
  input: Readonly<{ id: string; portableId: string; modifiedAtMs: number }>,
): Promise<void> {
  await seedBundledExercise(kernel);
  await kernel.write(async (transaction) => {
    await transaction.execute(
      "INSERT INTO workout_sessions (id, plan_id, plan_day_id, source, status, local_date, timezone, started_at_ms, completed_at_ms, active_session_exercise_id, active_set_id, revision, portable_id, merge_modified_at_ms) VALUES (?, NULL, NULL, 'manual', 'completed', '2026-09-20', 'Asia/Singapore', 1, 2, NULL, NULL, 1, ?, ?)",
      [input.id, input.portableId, input.modifiedAtMs],
    );
    await transaction.execute(
      "INSERT INTO session_exercises (id, session_id, source_plan_day_exercise_id, exercise_id, ordinal, origin, display_ordinal, exercise_name, metric_profile, metric_contract_version, exercise_metric_generation, advanced_timing_default_json, default_rest_seconds, target_revision, status, revision) VALUES (?, ?, NULL, 'portable-merge-bundled', 0, 'planned', 0, 'Portable merge bundled', 'load_reps', 1, 1, '{\"version\":1,\"mode\":\"off\"}', 90, 1, 'completed', 1)",
      [`exercise-${input.id}`, input.id],
    );
    await transaction.execute(
      "INSERT INTO session_sets (id, session_exercise_id, set_kind, ordinal, source_plan_working_set_target_id, source_owned_plan_working_set_target_id, advanced_timing_override_json, advanced_timing_resolved_json, target_load_grams, target_min_reps, target_max_reps, target_json, unit_json, rule_type, rule_version, metric_profile, metric_contract_version, exercise_metric_generation, status, completed_at_ms, revision) VALUES (?, ?, 'working', 0, NULL, NULL, NULL, '{\"version\":1,\"mode\":\"off\"}', 10000, 8, 10, '{}', '{}', 'load_reps', 1, 'load_reps', 1, 1, 'completed', 2, 1)",
      [`set-${input.id}`, `exercise-${input.id}`],
    );
  });
}

async function snapshot(kernel: SqliteKernel, snapshotId: string) {
  return createLogicalBackupRepository(kernel).collect({
    createdAtMs: 1,
    snapshotId,
  });
}

async function canonicalState(kernel: SqliteKernel): Promise<string> {
  const [backup, state, schema, userVersion] = await Promise.all([
    snapshot(kernel, "portable-merge-canonical"),
    kernel.queryAll("SELECT state, updated_at_ms FROM portability_restore_state"),
    kernel.queryAll("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE type IN ('trigger', 'index') ORDER BY type, name"),
    kernel.queryAll("PRAGMA user_version"),
  ]);
  return canonicalMergeValue({ backup, state, schema, userVersion });
}

async function plannedMerge(
  adapter: PortableMergeContractAdapter,
  archiveKernel: SqliteKernel,
  localKernel: SqliteKernel,
): Promise<StoredMergePreflight> {
  const [archive, local] = await Promise.all([
    snapshot(archiveKernel, "portable-merge-archive"),
    createSqliteMergeLocalFactsPort(localKernel).read(),
  ]);
  const archiveWithLocalOwner = {
    ...archive,
    tables: {
      ...archive.tables,
      portable_owner_identity: [{ id: 1, owner_namespace: local.ownerNamespace }],
    },
  };
  return {
    archiveDigest: "a".repeat(64),
    localFingerprint: await adapter.sha256(canonicalMergeValue(local)),
    operation: { kind: "archive_won", portableId: "a".repeat(32) },
    snapshot: archiveWithLocalOwner,
  };
}

async function withRuntimes(
  adapter: PortableMergeContractAdapter,
  caseId: PortableMergeContractCaseId,
  action: (archive: PortableMergeContractRuntime, local: PortableMergeContractRuntime) => Promise<void>,
): Promise<void> {
  const archive = await adapter.createRuntime(`${caseId}-archive`);
  const local = await adapter.createRuntime(`${caseId}-local`);
  try {
    await migrate(archive, adapter.recoveryBackup);
    await migrate(local, adapter.recoveryBackup);
    await action(archive, local);
  } finally {
    await Promise.all([archive.close(), local.close()]);
  }
}

type ContractCase = (
  adapter: PortableMergeContractAdapter,
  caseId: PortableMergeContractCaseId,
) => Promise<void>;

const contractCases: Record<PortableMergeContractCaseId, ContractCase> = {
  async "portable-merge-archive-wins"(adapter, caseId) {
    await withRuntimes(adapter, caseId, async (archive, local) => {
      await seedSession(archive.kernel, {
        id: "archive-session", portableId: "a".repeat(32), modifiedAtMs: 20,
      });
      await seedSession(local.kernel, {
        id: "local-session", portableId: "a".repeat(32), modifiedAtMs: 10,
      });
      const plan = await plannedMerge(adapter, archive.kernel, local.kernel);
      const result = await createLogicalMergeRepository(local.kernel, {
        nowMs: () => 99,
        sha256: adapter.sha256,
      }).commit(plan);
      invariant(result.state === "rebuild_pending", "portable_merge_pending_missing");
      const [merged] = await local.kernel.queryAll<{ id: string; merge_modified_at_ms: number }>(
        "SELECT id, merge_modified_at_ms FROM workout_sessions",
      );
      invariant(merged?.id === "archive-session" && merged.merge_modified_at_ms === 20,
        "portable_merge_archive_winner_missing");
    });
  },

  async "portable-merge-insert-rollback"(adapter, caseId) {
    await assertRollback(adapter, caseId, "insert:session_sets");
  },

  async "portable-merge-verification-rollback"(adapter, caseId) {
    await assertRollback(adapter, caseId, "verified");
  },
};

async function assertRollback(
  adapter: PortableMergeContractAdapter,
  caseId: PortableMergeContractCaseId,
  faultStage: "insert:session_sets" | "verified",
): Promise<void> {
    await withRuntimes(adapter, caseId, async (archive, local) => {
      await seedSession(archive.kernel, {
        id: "archive-session", portableId: "a".repeat(32), modifiedAtMs: 20,
      });
      await seedSession(local.kernel, {
        id: "local-session", portableId: "a".repeat(32), modifiedAtMs: 10,
      });
      const plan = await plannedMerge(adapter, archive.kernel, local.kernel);
      const before = await canonicalState(local.kernel);
      let rejected = false;
      try {
        await createLogicalMergeRepository(local.kernel, {
          sha256: adapter.sha256,
          faultAfter: async (stage) => {
            if (stage === faultStage) throw new Error("portable_merge_injected_fault");
          },
        }).commit(plan);
      } catch {
        rejected = true;
      }
      invariant(rejected, "portable_merge_fault_not_observed");
      invariant(await canonicalState(local.kernel) === before,
        "portable_merge_rollback_changed_source");
    });
}

export async function runPortableMergeContract(
  adapter: PortableMergeContractAdapter,
): Promise<PortableMergeContractResult> {
  const startedAt = new Date().toISOString();
  const cases: PortableMergeContractCaseResult[] = [];
  try {
    for (const id of PORTABLE_MERGE_CONTRACT_CASES) {
      const started = Date.now();
      try {
        await contractCases[id](adapter, id);
        cases.push({ id, status: "passed", durationMs: Date.now() - started });
      } catch (error) {
        cases.push({
          id,
          status: "failed",
          durationMs: Date.now() - started,
          errorCode: safeErrorCode(error),
        });
      }
    }
  } finally {
    await adapter.cleanup?.().catch(() => undefined);
  }
  const failed = cases.filter((item) => item.status === "failed").length;
  return {
    schemaVersion: 1,
    contractVersion: PORTABLE_MERGE_CONTRACT_VERSION,
    status: failed === 0 ? "passed" : "failed",
    total: cases.length,
    passed: cases.length - failed,
    failed,
    skipped: 0,
    cases,
    startedAt,
    finishedAt: new Date().toISOString(),
  };
}
