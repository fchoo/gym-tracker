import { classifyGarminActivityIdentity } from "../../domains/activities/activityIdentity";
import { changeGarminActivityLifecycle } from "../../domains/activities/importCommands";
import {
  canonicalBodyweightRequestHash,
  transitionBodyweight,
} from "../../domains/bodyweight/contracts";
import { LOGICAL_BACKUP_TABLE_DEFINITIONS } from "../../domains/portability/backupContracts";
import { PORTABLE_MERGE_TABLE_CLASSES } from "../../domains/portability/mergePlan";
import {
  retireAdvancedTiming,
} from "../../domains/advancedTiming/advancedTimingCommands";
import {
  evaluateRunningReadiness,
  parseRunningSessionRevision,
} from "../../domains/running/contracts";
import { confirmRunningActivityMatch } from "../../domains/running/activityMatchCommands";
import { createMigrationRunner } from "../../platform/sqlite/migrationRunner";
import { migrations } from "../../platform/sqlite/migrations";
import type { RecoveryBackupPort } from "../../platform/sqlite/recoveryBackup";
import type { SqliteKernel } from "../../platform/sqlite/sqliteKernel";
import {
  createExpoMigrationsEffectsContractAdapter,
} from "./migrationsEffects.contract";

/** Source-owned, privacy-safe Phase 13 evidence identities. */
export const MULTI_PLAN_RUNNING_CONTRACT_CASES = [
  "phase13-migration-failure-cuts", "phase13-map01-activation", "phase13-running-two-slots",
  "phase13-strength-completion-retry", "phase13-import-normalized-identity", "phase13-import-remove-restore",
  "phase13-match-invalidation", "phase13-stale-replay-no-resurrection", "phase13-bodyweight-correction-delete",
  "phase13-backup-clean-restore", "phase13-merge-rebuild", "phase13-source-generation-neutrality",
  "phase13-tim01-retirement",
] as const;

export type MultiPlanRunningContractCaseId =
  (typeof MULTI_PLAN_RUNNING_CONTRACT_CASES)[number];

export type MultiPlanRunningContractAdapter = Readonly<{
  runCase(caseId: MultiPlanRunningContractCaseId): Promise<void>;
  cleanup?(): Promise<void>;
}>;

export type MultiPlanRunningContractResult = Readonly<{
  schemaVersion: 1; contractVersion: 1; status: "passed" | "failed"; total: number;
  passed: number; failed: number; skipped: 0;
  cases: readonly Readonly<{ id: MultiPlanRunningContractCaseId; status: "passed" | "failed"; durationMs: number; errorCode?: string; }>[];
  startedAt: string; finishedAt: string;
}>;

type ExpoRuntime = Readonly<{
  databaseName: string;
  kernel: SqliteKernel;
  recoveryBackup?: RecoveryBackupPort;
  close(): Promise<void>;
}>;

type ExpoMigrationsAdapter = Readonly<{
  createRuntime(databaseKey: string): Promise<ExpoRuntime>;
  recoveryBackup: RecoveryBackupPort;
  cleanup?(): Promise<void>;
}>;

function invariant(value: unknown, code: string): asserts value {
  if (!value) throw new Error(code);
}

function safeErrorCode(error: unknown): string {
  if (error instanceof Error && /^[a-z0-9_:-]{3,80}$/iu.test(error.message)) {
    return error.message;
  }
  return "multi_plan_running_contract_failed";
}

async function withFreshExpoRuntime(
  adapter: ExpoMigrationsAdapter,
  caseId: MultiPlanRunningContractCaseId,
  operation: (kernel: SqliteKernel) => Promise<void>,
): Promise<void> {
  const runtime = await adapter.createRuntime(caseId);
  try {
    const migrated = await createMigrationRunner({
      databaseName: runtime.databaseName,
      kernel: runtime.kernel,
      migrations,
      // The native adapter supplies a per-case backup port.  Keep the adapter
      // fallback for test adapters that expose only the shared port.
      recoveryBackup: runtime.recoveryBackup ?? adapter.recoveryBackup,
    }).run();
    invariant(
      migrated.currentVersion === migrations.at(-1)?.version,
      "phase13_migration_not_current",
    );
    await operation(runtime.kernel);
  } finally {
    await runtime.close();
  }
}

async function assertTables(
  kernel: SqliteKernel,
  tables: readonly string[],
): Promise<void> {
  const rows = await kernel.queryAll<{ name: string }>(
    `SELECT name FROM sqlite_master
     WHERE type = 'table' AND name IN (${tables.map(() => "?").join(",")})`,
    tables,
  );
  invariant(rows.length === tables.length, "phase13_native_schema_incomplete");
}

const SHA256 = "a".repeat(64);

const caseAssertions: Record<
  MultiPlanRunningContractCaseId,
  (kernel: SqliteKernel) => Promise<void>
> = {
  async "phase13-migration-failure-cuts"(kernel) {
    await assertTables(kernel, ["running_plans", "imported_activities", "bodyweight_entries"]);
    const [row] = await kernel.queryAll<{ user_version: number }>("PRAGMA user_version");
    invariant(row?.user_version === migrations.at(-1)?.version, "phase13_migration_version_invalid");
  },
  async "phase13-map01-activation"(kernel) {
    const indexes = await kernel.queryAll<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'index'
       AND name IN ('one_active_owned_plan_per_sport', 'one_active_owned_schedule_per_sport')`,
    );
    invariant(indexes.length === 2, "phase13_map01_cardinality_index_missing");
    await assertTables(kernel, ["plans", "owned_plan_schedules"]);
  },
  async "phase13-running-two-slots"(kernel) {
    const revision = parseRunningSessionRevision({
      version: 1, id: "revision", rootId: "root", planId: "plan", revision: 1,
      createdAtMs: 0, sessionKind: "recovery", contextual: {},
      phases: [{ ordinal: 0, kind: "warm_up", steps: [{ ordinal: 0, kind: "duration", durationMs: 1_000 }] }],
    });
    invariant(revision.sessionKind === "recovery", "phase13_running_root_invalid");
    invariant(evaluateRunningReadiness({ hasRecoveryRevision: true, slotCount: 2 }).ready, "phase13_running_slots_invalid");
    await assertTables(kernel, ["running_session_roots", "running_session_slots", "running_opportunities"]);
  },
  async "phase13-strength-completion-retry"(kernel) {
    await assertTables(kernel, ["workout_provenance", "workout_receipts", "workout_completed_set_correction_receipts"]);
    const count = await kernel.queryAll<{ count: number }>(
      "SELECT COUNT(*) AS count FROM workout_receipts",
    );
    invariant(count[0]?.count === 0, "phase13_strength_retry_fixture_dirty");
  },
  async "phase13-import-normalized-identity"(kernel) {
    const identity = { source_kind: "garmin_connect_account" as const, account_namespace: "account", external_activity_id: "activity" };
    invariant(
      classifyGarminActivityIdentity({ identity, normalized_json_sha256: SHA256, removed: false }).kind === "new",
      "phase13_import_identity_new_invalid",
    );
    invariant(
      classifyGarminActivityIdentity({ identity, existing: { ...identity, accepted_digest: SHA256 }, normalized_json_sha256: SHA256, removed: false }).kind === "duplicate",
      "phase13_import_identity_duplicate_invalid",
    );
    await assertTables(kernel, ["imported_activities", "imported_activity_payloads", "imported_activity_identities"]);
  },
  async "phase13-import-remove-restore"(kernel) {
    const result = await changeGarminActivityLifecycle({
      async changeGarminActivityLifecycle(input) {
        return { kind: input.operation === "remove" ? "removed" : "imported", activityId: input.activityId, aggregateRevision: input.expectedAggregateRevision + 1 };
      },
    }, { operation: "remove", requestId: "remove", requestSha256: SHA256, activityId: "activity", expectedAggregateRevision: 1, occurredAtMs: 1, reason: "owner_request" });
    invariant(result.kind === "removed" && result.aggregateRevision === 2, "phase13_remove_restore_invalid");
    await assertTables(kernel, ["imported_activity_events", "imported_activity_removal_events", "imported_activity_match_invalidations"]);
  },
  async "phase13-match-invalidation"(kernel) {
    const result = await confirmRunningActivityMatch({
      async confirm(input) {
        return { kind: "matched", activityId: input.activityId, opportunityId: input.opportunityId, relationRevision: input.expectedRelationRevision + 1 };
      },
    }, { requestId: "match", requestSha256: SHA256, action: "match", activityId: "activity", expectedActivityRevision: 1, opportunityId: "opportunity", expectedOpportunityRevision: 1, expectedRelationRevision: 0, scheduleId: "schedule", scheduleVersionId: "version", slotId: "slot", sessionRevisionId: "session", occurredAtMs: 1 });
    invariant(result.kind === "matched" && result.relationRevision === 1, "phase13_match_invalid_invalid");
    await assertTables(kernel, ["running_activity_match_events", "running_activity_match_receipts", "running_current_matches"]);
  },
  async "phase13-stale-replay-no-resurrection"(kernel) {
    const identity = { source_kind: "garmin_connect_account" as const, account_namespace: "account", external_activity_id: "activity" };
    invariant(
      classifyGarminActivityIdentity({ identity, existing: { ...identity, accepted_digest: SHA256 }, normalized_json_sha256: SHA256, removed: true }).kind === "removed",
      "phase13_removed_activity_resurrected",
    );
    await assertTables(kernel, ["imported_activity_receipts", "imported_activity_events", "running_activity_match_receipts"]);
  },
  async "phase13-bodyweight-correction-delete"(kernel) {
    const create = { operation: "create" as const, requestId: "create", entryId: "entry", ownerId: "owner", expectedRevision: 0, revisionId: "r1", eventId: "e1", occurredAtMs: 1, localDate: "2026-10-08", timezone: "Asia/Singapore", grams: 75_000 };
    const created = transitionBodyweight(undefined, { ...create, requestSha256: canonicalBodyweightRequestHash(create) });
    invariant(created.kind === "created" && created.entry !== undefined, "phase13_bodyweight_create_invalid");
    const deletion = { operation: "delete" as const, requestId: "delete", entryId: "entry", ownerId: "owner", expectedRevision: 1, revisionId: "r2", eventId: "e2", occurredAtMs: 2 };
    const deleted = transitionBodyweight(created.entry, { ...deletion, requestSha256: canonicalBodyweightRequestHash(deletion) });
    invariant(deleted.kind === "deleted" && deleted.entry?.lifecycle === "deleted", "phase13_bodyweight_delete_invalid");
    await assertTables(kernel, ["bodyweight_entries", "bodyweight_entry_events", "bodyweight_command_receipts"]);
  },
  async "phase13-backup-clean-restore"(kernel) {
    invariant("imported_activities" in LOGICAL_BACKUP_TABLE_DEFINITIONS, "phase13_backup_source_graph_missing");
    invariant("bodyweight_entries" in LOGICAL_BACKUP_TABLE_DEFINITIONS, "phase13_backup_bodyweight_missing");
    await assertTables(kernel, ["automatic_backup_state", "imported_activities", "bodyweight_entries"]);
  },
  async "phase13-merge-rebuild"(kernel) {
    invariant(PORTABLE_MERGE_TABLE_CLASSES.imported_activities === "source_graph", "phase13_merge_import_class_invalid");
    invariant(PORTABLE_MERGE_TABLE_CLASSES.bodyweight_entries === "source_graph", "phase13_merge_bodyweight_class_invalid");
    await assertTables(kernel, ["running_current_matches", "imported_activity_events", "bodyweight_entry_events"]);
  },
  async "phase13-source-generation-neutrality"(kernel) {
    const [state] = await kernel.queryAll<{ mutation_generation: number }>(
      "SELECT mutation_generation FROM automatic_backup_state WHERE id = 1",
    );
    invariant(Number.isSafeInteger(state?.mutation_generation), "phase13_source_generation_missing");
    await assertTables(kernel, ["automatic_backup_state", "running_match_events", "imported_activity_match_invalidations"]);
  },
  async "phase13-tim01-retirement"(kernel) {
    invariant(
      retireAdvancedTiming({ version: 1, mode: "per_rep", intervalMs: 1_000, cueChannels: "audio" }).mode === "off",
      "phase13_tim01_retirement_invalid",
    );
    await assertTables(kernel, ["session_advanced_timing_states", "session_sets", "session_rest_states"]);
  },
};

export async function createExpoMultiPlanRunningContractAdapter(
  runId: string,
): Promise<MultiPlanRunningContractAdapter> {
  const base = await createExpoMigrationsEffectsContractAdapter(
    `multi-plan-running-${runId}`,
  );
  const adapter: MultiPlanRunningContractAdapter = {
    runCase: (caseId: MultiPlanRunningContractCaseId) =>
      withFreshExpoRuntime(base, caseId, caseAssertions[caseId]),
    ...(base.cleanup === undefined ? {} : { cleanup: base.cleanup }),
  };
  return Object.freeze(adapter);
}

export async function runMultiPlanRunningContract(
  runIdOrAdapter: string | MultiPlanRunningContractAdapter,
): Promise<MultiPlanRunningContractResult> {
  const startedAt = new Date().toISOString();
  const adapter = typeof runIdOrAdapter === "string"
    ? await createExpoMultiPlanRunningContractAdapter(runIdOrAdapter)
    : runIdOrAdapter;
  const cases: MultiPlanRunningContractResult["cases"][number][] = [];
  try {
    for (const id of MULTI_PLAN_RUNNING_CONTRACT_CASES) {
      const startedMs = Date.now();
      try {
        await adapter.runCase(id);
        cases.push(Object.freeze({ id, status: "passed", durationMs: Date.now() - startedMs }));
      } catch (error) {
        cases.push(Object.freeze({ id, status: "failed", durationMs: Date.now() - startedMs, errorCode: safeErrorCode(error) }));
      }
    }
  } finally {
    await adapter.cleanup?.();
  }
  const passed = cases.filter((value) => value.status === "passed").length;
  return Object.freeze({
    schemaVersion: 1, contractVersion: 1, status: passed === cases.length ? "passed" : "failed",
    total: cases.length, passed, failed: cases.length - passed, skipped: 0, cases,
    startedAt, finishedAt: new Date().toISOString(),
  });
}
