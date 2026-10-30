import type { GarminConnectNativeModule } from "../../modules/garmin-connect/src";
import {
  confirmGarminImportDate,
  prepareGarminImport,
  type ImportedActivityCommandRepository,
} from "../domains/activities/importCommands";
import { confirmRunningActivityMatch } from "../domains/running/activityMatchCommands";
import { canonicalJson } from "../domains/activities/importContracts";
import {
  createGarminActivityAdapter,
  type GarminActivityMapper,
  type GarminNativeDriver,
} from "../platform/garmin/garminActivityAdapter";
import {
  createGarminSharedImportCommitter,
  createGarminSyncCoordinator,
} from "../platform/garmin/garminSyncCoordinator";
import { normalizeGarminActivity } from "../platform/garmin/normalizeGarminActivity";
import { createMigrationRunner } from "../platform/sqlite/migrationRunner";
import { migrations } from "../platform/sqlite/migrations";
import { createExpoRecoveryBackupPort } from "../platform/sqlite/recoveryBackup";
import { createImportedActivityRepository } from "../platform/sqlite/repositories/importedActivityRepository";
import { createRunningActivityMatchRepository } from "../platform/sqlite/repositories/runningActivityMatchRepository";
import { createRunningPlanRepository } from "../platform/sqlite/repositories/runningPlanRepository";
import { openSqliteKernel, type SqliteKernel } from "../platform/sqlite";
import {
  assertPhase18GarminAdversarialRunNonce,
  collectPhase18GarminAdversarialNativeObservations,
  type Phase18GarminAdversarialBuildIdentity,
  type Phase18GarminAdversarialCase,
  type Phase18GarminAdversarialNativeCase,
  type Phase18GarminSourceComponents,
} from "../testing/phase18GarminAdversarial";

type Sha256 = (value: string) => Promise<string>;

export type Phase18GarminAdversarialSqliteRuntime = Readonly<{
  kernel: SqliteKernel;
  close(): Promise<void>;
}>;

type DatabaseSnapshot = Readonly<{
  history: string;
  source: string;
  match: string;
  sourceRows: number;
}>;

const DATABASE_NAME = "phase18-garmin-adversarial.db";
const ACCOUNT_NAMESPACE = "garmin:abcdefabcdefabcdefabcdefabcdefab";
const RETAINED_EXTERNAL_ID = "313131";
const RETAINED_ACTIVITY_ID = "phase18-retained-activity";

const HISTORY_TABLES = Object.freeze([
  "imported_activities",
  "imported_activity_current_lifecycle",
  "imported_activity_events",
]);
const SOURCE_TABLES = Object.freeze([
  "imported_activity_identities",
  "imported_activity_payloads",
  "imported_activity_receipts",
  "imported_activity_revision_proposals",
  "imported_activity_revision_decisions",
]);
const MATCH_TABLES = Object.freeze([
  "running_activity_current_matches",
  "running_activity_match_events",
  "running_activity_match_receipts",
  "imported_activity_match_invalidations",
]);

function mapper(sha256: Sha256): GarminActivityMapper {
  return Object.freeze({
    fromActivity: (activity) => normalizeGarminActivity({
      account_namespace: ACCOUNT_NAMESPACE,
      external_activity_id: activity.external_activity_id,
      activity: activity.activity,
      splits: activity.splits,
      details: activity.details,
    }, sha256),
  });
}

function nativeResult(generation: number, data: unknown) {
  return Object.freeze({ status: "ok" as const, generation, data });
}

function nativeFailure(code: string, retryAfterMs?: number) {
  return Object.freeze({
    status: "error" as const,
    error: Object.freeze({ code, ...(retryAfterMs === undefined ? {} : { retryAfterMs }) }),
  });
}

function sourceActivity(
  components: Phase18GarminSourceComponents,
  externalActivityId: string,
): Readonly<{ activity: unknown; splits: unknown; details: unknown }> {
  const activity = components.activity as Readonly<Record<string, unknown>>;
  return Object.freeze({
    activity: Object.freeze({ ...activity, activityId: Number(externalActivityId) }),
    splits: components.splits,
    details: components.details,
  });
}

function observationDriver(
  entry: Phase18GarminAdversarialNativeCase,
  components: Phase18GarminSourceComponents,
  externalActivityId = "424242",
): GarminNativeDriver {
  const generation = entry.generation_before;
  const successComponents = sourceActivity(components, externalActivityId);
  const connected = () => nativeResult(generation, {
    kind: "connected",
    account_namespace: ACCOUNT_NAMESPACE,
  });
  const discovery = (identifier: string) => ({
    activityId: Number(identifier),
    activityType: { typeKey: "running" },
  });
  return Object.freeze({
    connectionState: async () => connected(),
    restoreSession: async () => connected(),
    login: async () => nativeFailure("operation_rejected"),
    resumeMfa: async () => nativeFailure("operation_rejected"),
    logout: async () => nativeResult(generation + 1, { kind: "disconnected" }),
    getActivities: async () => {
      switch (entry.id) {
        case "PH18-ADV-403": return nativeFailure("data_access_denied");
        case "PH18-ADV-429": return nativeFailure("rate_limited", entry.retry_after_ms);
        case "PH18-ADV-OFFLINE": return nativeFailure("offline");
        case "PH18-ADV-TIMEOUT": return nativeFailure("timeout");
        case "PH18-ADV-5XX": return nativeFailure("temporary_failure");
        case "PH18-ADV-LATE-GENERATION": return nativeFailure("stale_generation");
        case "PH18-ADV-MALFORMED": return { status: "unexpected" };
        case "PH18-ADV-OVERSIZED": return nativeResult(generation, {
          items: [discovery(externalActivityId), discovery("424243")],
        });
        case "PH18-ADV-PARTIAL-PAGE": return nativeResult(generation, {
          items: [discovery(externalActivityId), discovery("424243")],
        });
        default: return nativeResult(generation, { items: [discovery(externalActivityId)] });
      }
    },
    getActivity: async ({ externalActivityId: identifier }) => {
      if (entry.id === "PH18-ADV-PARTIAL-PAGE" && identifier === "424243") {
        return nativeFailure("temporary_failure");
      }
      return nativeResult(generation, sourceActivity(components, identifier).activity);
    },
    getActivitySplits: async () => entry.id === "PH18-ADV-MISSING-COMPONENT"
      ? nativeResult(generation, null)
      : entry.id === "PH18-ADV-ROTATION"
        ? nativeFailure("stale_generation")
        : nativeResult(generation, successComponents.splits),
    getActivityDetails: async () => nativeResult(generation, successComponents.details),
  });
}

function requestFor(sha256: Sha256) {
  return async (prepared: Readonly<{ envelope: Readonly<{ external_activity_id: string }> }>) => {
    const externalId = prepared.envelope.external_activity_id;
    const requestSha256 = await sha256(canonicalJson({ external_activity_id: externalId }));
    return Object.freeze({
      requestId: `phase18-garmin-import-${externalId}`,
      requestSha256,
      activityId: `phase18-garmin-activity-${externalId}`,
      expectedAggregateRevision: 0,
      confirmedLocalDate: "2026-10-06",
    });
  };
}

async function syncCase(
  kernel: SqliteKernel,
  repository: ImportedActivityCommandRepository,
  entry: Phase18GarminAdversarialNativeCase,
  components: Phase18GarminSourceComponents,
  sha256: Sha256,
) {
  const source = createGarminActivityAdapter({
    driver: observationDriver(entry, components),
    mapper: mapper(sha256),
  });
  return createGarminSyncCoordinator({
    source,
    limits: entry.id === "PH18-ADV-PARTIAL-PAGE"
      ? { pageSize: 2, maxPages: 1, maxActivities: 2 }
      : { pageSize: 1, maxPages: 1, maxActivities: 1 },
    importActivity: createGarminSharedImportCommitter({
      repository,
      sha256,
      requestFor: requestFor(sha256),
    }),
  }).syncNow();
}

async function verifyGenerationFence(
  kernel: SqliteKernel,
  repository: ImportedActivityCommandRepository,
  components: Phase18GarminSourceComponents,
  sha256: Sha256,
): Promise<void> {
  const before = await snapshot(kernel, sha256);
  const envelope = await normalizeGarminActivity({
    account_namespace: ACCOUNT_NAMESPACE,
    external_activity_id: "919191",
    ...sourceActivity(components, "919191"),
  }, sha256);
  const staged = await prepareGarminImport(envelope, sha256);
  let rejected = false;
  try {
    await confirmGarminImportDate(repository, {
      requestId: "phase18-generation-fence-probe",
      requestSha256: await sha256("phase18-generation-fence-probe"),
      activityId: "phase18-generation-fence-probe",
      expectedAggregateRevision: 0,
      confirmedLocalDate: "2026-10-06",
      staged,
      assertCurrentGeneration: async () => {
        throw new Error("phase18_expected_stale_generation");
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "phase18_expected_stale_generation") {
      rejected = true;
    } else {
      throw error;
    }
  }
  const after = await snapshot(kernel, sha256);
  if (!rejected
    || before.history !== after.history
    || before.source !== after.source
    || before.match !== after.match
    || before.sourceRows !== after.sourceRows) {
    throw new Error("phase18_garmin_generation_fence_invalid");
  }
}

function syncState(result: Awaited<ReturnType<typeof syncCase>>): string {
  return result.kind === "success"
    ? "success"
    : result.kind === "cancelled"
      ? "cancelled"
      : `${result.kind}-${result.failure.code.replaceAll("_", "-")}`;
}

async function canonicalTables(kernel: SqliteKernel, tables: readonly string[]): Promise<string> {
  const observed: Record<string, readonly unknown[]> = {};
  for (const table of tables) {
    const rows = await kernel.queryAll<Record<string, unknown>>(`SELECT * FROM ${table}`);
    observed[table] = [...rows].sort((left, right) =>
      canonicalJson(left).localeCompare(canonicalJson(right)));
  }
  return canonicalJson(observed);
}

async function snapshot(kernel: SqliteKernel, sha256: Sha256): Promise<DatabaseSnapshot> {
  const [historyJson, sourceJson, matchJson] = await Promise.all([
    canonicalTables(kernel, HISTORY_TABLES),
    canonicalTables(kernel, SOURCE_TABLES),
    canonicalTables(kernel, MATCH_TABLES),
  ]);
  const source = JSON.parse(sourceJson) as Record<string, readonly unknown[]>;
  return Object.freeze({
    history: await sha256(historyJson),
    source: await sha256(sourceJson),
    match: await sha256(matchJson),
    sourceRows: Object.values(source).reduce((total, rows) => total + rows.length, 0),
  });
}

async function seedRetainedGraph(
  kernel: SqliteKernel,
  components: Phase18GarminSourceComponents,
  sha256: Sha256,
): Promise<void> {
  const seedCase: Phase18GarminAdversarialNativeCase = Object.freeze({
    id: "PH18-ADV-READ",
    status: "passed",
    provenance: "native-exact-artifact",
    stage: "read",
    code: "completed",
    duration_ms: 0,
    call_count: 4,
    automatic_retry_count: 0,
    retry_after_ms: 0,
    connection_state: "connected",
    sync_state: "success",
    session_digest: "0".repeat(64),
    generation_before: 1,
    generation_after: 1,
  });
  const source = createGarminActivityAdapter({
    driver: observationDriver(seedCase, components, RETAINED_EXTERNAL_ID),
    mapper: mapper(sha256),
  });
  const imported = await createGarminSyncCoordinator({
    source,
    limits: { pageSize: 1, maxPages: 1, maxActivities: 1 },
    importActivity: createGarminSharedImportCommitter({
      repository: createImportedActivityRepository(kernel),
      sha256,
      requestFor: async (prepared) => ({
        requestId: "phase18-retained-import",
        requestSha256: await sha256(canonicalJson(prepared.envelope)),
        activityId: RETAINED_ACTIVITY_ID,
        expectedAggregateRevision: 0,
        confirmedLocalDate: "2026-10-06",
      }),
    }),
  }).syncNow();
  if (imported.kind !== "success" || imported.counts.newActivities !== 1) {
    throw new Error("phase18_garmin_seed_failed");
  }

  const plans = createRunningPlanRepository(kernel);
  await kernel.write((transaction) => transaction.execute(
    "UPDATE workout_sessions SET status = 'completed', completed_at_ms = COALESCE(completed_at_ms, started_at_ms), active_session_exercise_id = NULL, active_set_id = NULL WHERE status = 'in_progress'",
  ));
  await kernel.write((transaction) => transaction.execute(
    "INSERT INTO owned_plan_schedules (id, plan_id, lifecycle, revision, activated_at_ms, deactivated_at_ms, plan_kind) VALUES ('phase18-strength-schedule', 'plan-copy', 'active', 1, 1, NULL, 'strength')",
  ));
  await plans.createInactiveMinimum({
    planId: "phase18-running-plan",
    planName: "Running",
    anchorDayId: "phase18-running-anchor",
    scheduleId: "phase18-running-schedule",
    scheduleVersionId: "phase18-running-version",
    scheduleBindingId: "phase18-running-binding",
    createdAtMs: 1_000,
    effectiveLocalDate: "2026-10-05",
    timezone: "Asia/Singapore",
    recoveryRevisionId: "phase18-running-session-v1",
    slots: [{
      id: "phase18-running-slot",
      weekday: "Monday",
      ordinal: 0,
      sessionRevisionId: "phase18-running-session-v1",
    }],
  });
  await plans.activateMinimum({
    planId: "phase18-running-plan",
    scheduleId: "phase18-running-schedule",
    expectedPlanRevision: 1,
    expectedScheduleRevision: 1,
    activatedAtMs: 2_000,
  });
  await plans.materializeOccurrences({
    planId: "phase18-running-plan",
    scheduleId: "phase18-running-schedule",
    scheduleVersionId: "phase18-running-version",
    localDate: "2026-10-05",
    timezone: "Asia/Singapore",
    createdAtMs: 3_000,
    occurrenceIds: ["phase18-running-opportunity"],
  });
  const [activity] = await kernel.queryAll<{ accepted_normalized_sha256: string }>(
    "SELECT accepted_normalized_sha256 FROM imported_activity_identities WHERE activity_id = ?",
    [RETAINED_ACTIVITY_ID],
  );
  if (activity === undefined) throw new Error("phase18_garmin_seed_failed");
  await confirmRunningActivityMatch(createRunningActivityMatchRepository(kernel), {
    requestId: "phase18-running-match",
    requestSha256: await sha256("phase18-running-match"),
    action: "match",
    activityId: RETAINED_ACTIVITY_ID,
    expectedActivityRevision: 1,
    expectedAcceptedPayloadSha256: activity.accepted_normalized_sha256,
    opportunityId: "phase18-running-opportunity",
    expectedOpportunityRevision: 1,
    expectedRelationRevision: 0,
    planId: "phase18-running-plan",
    scheduleId: "phase18-running-schedule",
    scheduleVersionId: "phase18-running-version",
    expectedScheduleRevision: 2,
    planDayId: "phase18-running-anchor",
    expectedPlanDayRevision: 1,
    slotId: "phase18-running-slot",
    slotRevisionId: "phase18-running-slot:revision:1",
    expectedSlotRevision: 1,
    sessionRevisionId: "phase18-running-session-v1",
    expectedSessionRevision: 1,
    occurredAtMs: 4_000,
  });
}

function needsSync(id: Phase18GarminAdversarialNativeCase["id"]): boolean {
  return id === "PH18-ADV-READ" || id === "PH18-ADV-LATE-GENERATION"
    || id.startsWith("PH18-ADV-") && ![
      "PH18-ADV-RESTORE",
      "PH18-ADV-REFRESH",
      "PH18-ADV-LOGOUT",
      "PH18-ADV-RESTART",
    ].includes(id);
}

function evidenceValid(
  entry: Phase18GarminAdversarialNativeCase,
  before: DatabaseSnapshot,
  after: DatabaseSnapshot,
  sourceWriteCount: number,
  observedSyncState: string,
): boolean {
  const retainedMatch = before.match === after.match;
  if (entry.id === "PH18-ADV-READ") {
    return observedSyncState === "success"
      && sourceWriteCount > 0
      && before.history !== after.history
      && before.source !== after.source
      && retainedMatch;
  }
  return observedSyncState === entry.sync_state
    && sourceWriteCount === 0
    && before.history === after.history
    && before.source === after.source
    && retainedMatch;
}

export async function bindPhase18GarminAdversarialDatabaseEvidence(input: Readonly<{
  kernel: SqliteKernel;
  nativeCases: readonly Phase18GarminAdversarialNativeCase[];
  sourceComponents: Phase18GarminSourceComponents;
  sha256: Sha256;
  repositoryFactory?: (kernel: SqliteKernel) => ImportedActivityCommandRepository;
}>): Promise<readonly Phase18GarminAdversarialCase[]> {
  await seedRetainedGraph(input.kernel, input.sourceComponents, input.sha256);
  const repository = input.repositoryFactory?.(input.kernel)
    ?? createImportedActivityRepository(input.kernel);
  await verifyGenerationFence(
    input.kernel,
    repository,
    input.sourceComponents,
    input.sha256,
  );
  const results: Phase18GarminAdversarialCase[] = [];
  for (const entry of input.nativeCases) {
    const before = await snapshot(input.kernel, input.sha256);
    let observedSyncState = entry.sync_state;
    if (needsSync(entry.id)) {
      observedSyncState = syncState(await syncCase(
        input.kernel,
        repository,
        entry,
        input.sourceComponents,
        input.sha256,
      ));
    }
    const after = await snapshot(input.kernel, input.sha256);
    const sourceWriteCount = Math.max(0, after.sourceRows - before.sourceRows);
    const valid = entry.status === "passed"
      && evidenceValid(entry, before, after, sourceWriteCount, observedSyncState);
    results.push(Object.freeze({
      ...entry,
      status: valid ? "passed" : "TECHNICAL_REVIEW_REQUIRED",
      provenance: valid ? "native-exact-artifact" : "unexpected",
      source_write_count: sourceWriteCount,
      history_digest_before: before.history,
      history_digest_after: after.history,
      source_digest_before: before.source,
      source_digest_after: after.source,
      match_digest_before: before.match,
      match_digest_after: after.match,
    }));
  }
  return Object.freeze(results);
}

async function productionRuntime(): Promise<Phase18GarminAdversarialSqliteRuntime> {
  const sqlite = require("expo-sqlite") as typeof import("expo-sqlite");
  const backupName = "phase18-adversarial-migration-recovery-v0-to-v44.db";
  await sqlite.deleteDatabaseAsync(DATABASE_NAME).catch(() => undefined);
  await sqlite.deleteDatabaseAsync(backupName).catch(() => undefined);
  const kernel = await openSqliteKernel(DATABASE_NAME);
  const openOptions = {
    useNewConnection: true,
    finalizeUnusedStatementsBeforeClosing: false,
  } as const;
  const recoveryBackup = createExpoRecoveryBackupPort({
    backupIdPrefix: "phase18-adversarial-",
    openSource: (databaseName) => sqlite.openDatabaseAsync(databaseName, openOptions),
    openDestination: (databaseName) => sqlite.openDatabaseAsync(databaseName, openOptions),
    backup: (options) => sqlite.backupDatabaseAsync(options as Parameters<typeof sqlite.backupDatabaseAsync>[0]),
    close: (database) => (database as Awaited<ReturnType<typeof sqlite.openDatabaseAsync>>).closeAsync(),
    validate: openSqliteKernel,
    remove: sqlite.deleteDatabaseAsync,
    writeManifest: async () => undefined,
  });
  try {
    await createMigrationRunner({ databaseName: DATABASE_NAME, kernel, migrations, recoveryBackup }).run();
  } catch (error) {
    await kernel.close().catch(() => undefined);
    await sqlite.deleteDatabaseAsync(DATABASE_NAME).catch(() => undefined);
    await sqlite.deleteDatabaseAsync(backupName).catch(() => undefined);
    throw error;
  }
  return Object.freeze({
    kernel,
    async close() {
      await kernel.close();
      await sqlite.deleteDatabaseAsync(DATABASE_NAME).catch(() => undefined);
      await sqlite.deleteDatabaseAsync(backupName).catch(() => undefined);
    },
  });
}

export async function runPhase18GarminAdversarialNativeSuite(
  nativeModule: GarminConnectNativeModule | undefined,
  buildIdentity: Phase18GarminAdversarialBuildIdentity | undefined,
  runNonce: unknown,
  deviceIdentitySha256: unknown,
  openRuntime: () => Promise<Phase18GarminAdversarialSqliteRuntime> = productionRuntime,
  sha256: Sha256 = (value) => {
    const {
      CryptoDigestAlgorithm,
      digestStringAsync,
    } = require("expo-crypto") as typeof import("expo-crypto");
    return digestStringAsync(CryptoDigestAlgorithm.SHA256, value);
  },
): Promise<Readonly<{
  status: "passed" | "TECHNICAL_REVIEW_REQUIRED";
  run_nonce: string;
  cases: readonly Phase18GarminAdversarialCase[];
  current_identity: Awaited<ReturnType<typeof collectPhase18GarminAdversarialNativeObservations>>["currentIdentity"];
}>> {
  assertPhase18GarminAdversarialRunNonce(runNonce);
  const native = await collectPhase18GarminAdversarialNativeObservations(
    nativeModule,
    buildIdentity,
    deviceIdentitySha256 as string,
  );
  const runtime = await openRuntime();
  try {
    const cases = await bindPhase18GarminAdversarialDatabaseEvidence({
      kernel: runtime.kernel,
      nativeCases: native.cases,
      sourceComponents: native.sourceComponents,
      sha256,
    });
    return Object.freeze({
      status: native.status === "passed" && cases.every((entry) => entry.status === "passed")
        ? "passed"
        : "TECHNICAL_REVIEW_REQUIRED",
      run_nonce: runNonce,
      cases,
      current_identity: native.currentIdentity,
    });
  } finally {
    await runtime.close();
  }
}
