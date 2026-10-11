import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: {
      android: { package: "com.fchoo.gymtracker.devtest" },
      extra: {
        buildProfile: "development-test",
        nativeContractsEnabled: true,
        nativeContractSuite: "phase17",
      },
    },
  },
}));

import type { SqliteConnection, SqlitePreparedResult, SqlitePreparedStatement } from "../../src/platform/sqlite/connection";
import { configureSqliteConnection } from "../../src/platform/sqlite/connection";
import { createMigrationRunner } from "../../src/platform/sqlite/migrationRunner";
import { migrations } from "../../src/platform/sqlite/migrations";
import { createLogicalBackupRepository } from "../../src/platform/sqlite/repositories/logicalBackupRepository";
import type { OwnedPlanCommittedResult, OwnedPlanRepositoryResult } from "../../src/platform/sqlite/repositories/ownedPlanRepository";
import { createSqliteKernel, type SqliteKernel } from "../../src/platform/sqlite/sqliteKernel";
import { createOwnedPlanRuntimePort } from "../../src/bootstrap/ownedPlanRuntime";
import { createPhase17ActionEnvelopeSource, phase17ActionEnvelopePlan, type Phase17ActionEnvelopeContext } from "../../src/bootstrap/phase17ActionEnvelope";
import { cleanupPhase17FamilyAManifest, createPhase17FamilyACleanupManifest, materializePhase17FamilyACleanupManifest } from "../../src/bootstrap/phase17FamilyACleanup";
import { createPhase17FixtureProtocol } from "../../src/bootstrap/phase17NativeFixture";
import { createCustomExerciseRepository } from "../../src/platform/sqlite/repositories/customExerciseRepository";
import { readCustomExerciseMigration } from "../../src/bootstrap/customExerciseRuntimeReadPort";
import {
  archiveCustomExercise,
  createCustomCopy,
  createCustomExercise,
  editCustomExercise,
  previewCustomExerciseArchive,
  restoreCustomExercise,
  setExerciseFavorite,
  setExerciseHidden,
} from "../../src/domains/library/customExerciseCommands";
import { migrateCustomExerciseMetricProfile } from "../../src/domains/metrics/migrateCustomExerciseMetricProfile";
import { createMetricRepository } from "../../src/platform/sqlite/repositories/metricRepository";
import type { OwnedPlanDraftInput } from "../../src/domains/plans/ownedPlanCommands";
import {
  activateStarterPlan,
  createStarterPlanActivationConfirmationToken,
  createStarterPlanCopy,
  parseAcceptedStarterPlanPack,
  type AcceptedStarterPack,
  type AcceptedStarterTemplate,
} from "../../src/domains/plans/activateStarterPlan";
import { parseExerciseCatalog } from "../../src/domains/content/catalog";
import { createContentRepository } from "../../src/platform/sqlite/repositories/contentRepository";
import { createStarterPlanRepository, installAcceptedStarterPlanSources } from "../../src/platform/sqlite/repositories/starterPlanRepository";
import { createWorkoutOutcomeRepository } from "../../src/platform/sqlite/repositories/workoutOutcomeRepository";
import { discardWorkout } from "../../src/domains/workout/finishWorkout";
import { PHASE17_CASE_ACTION_CONTRACTS, PHASE17_FAMILY_A_CUSTOM_METRIC_MATRIX_CONTRACTS, PHASE17_FAMILY_A_MUTATION_RECEIPTS } from "../../src/testing/contracts/phase17LibraryRunning.contract";
import { createScheduleRuntimePort } from "../../src/bootstrap/scheduleRuntime";
import { createStarterTemplateUpdatePreview, legacyFullBodySourceJson } from "../../src/bootstrap/starterPlanRuntime";
import fullBodyFoundationAsset from "../../assets/content/full-body-foundation.v1.json";

/**
 * These are deliberately the only Family A matrix rows migrated in this pass.
 * Each row drives its labelled runtime command and proves the exact receipt,
 * resulting plan facts, fixture probe, and migration-42 cleanup boundary.
 */
const FAMILY_A_PLAN_MUTATION_ROWS = Object.freeze([
  { caseId: "library.true-no-plans", label: "owned-plan-create", operation: "create", preRevision: null, postRevision: 1, preLifecycle: null, postLifecycle: "draft" },
  { caseId: "library.owned-lifecycle", label: "owned-plan-lifecycle", operation: "archive", preRevision: 1, postRevision: 2, preLifecycle: "draft", postLifecycle: "archived" },
  { caseId: "library.create-strength", label: "owned-plan-save", operation: "save", preRevision: 1, postRevision: 2, preLifecycle: "draft", postLifecycle: "ready" },
  { caseId: "library.plan-editor", label: "owned-plan-save", operation: "save", preRevision: 2, postRevision: 3, preLifecycle: "ready", postLifecycle: "ready" },
] as const);
const PHASE17_MATRIX_CONTRACTS = Object.freeze([
  ...PHASE17_CASE_ACTION_CONTRACTS,
  ...PHASE17_FAMILY_A_CUSTOM_METRIC_MATRIX_CONTRACTS.filter(
    ({ id }) => !PHASE17_CASE_ACTION_CONTRACTS.some((contract) => contract.id === id),
  ),
]);

type FamilyARow = (typeof FAMILY_A_PLAN_MUTATION_ROWS)[number];

class Result<Row extends Record<string, unknown>> implements SqlitePreparedResult<Row> {
  constructor(readonly changes: number, readonly lastInsertRowId: number, private readonly rows: readonly Row[]) {}
  async getAllAsync(): Promise<readonly Row[]> { return this.rows; }
}

class Statement implements SqlitePreparedStatement {
  constructor(private readonly statement: ReturnType<DatabaseSync["prepare"]>) {}
  async executeAsync<Row extends Record<string, unknown>>(parameters: readonly SQLInputValue[] = []): Promise<SqlitePreparedResult<Row>> {
    if (this.statement.columns().length > 0) return new Result(0, 0, this.statement.all(...parameters) as Row[]);
    const result = this.statement.run(...parameters);
    return new Result(Number(result.changes), Number(result.lastInsertRowid), []);
  }
  async finalizeAsync(): Promise<void> {}
}

class Connection implements SqliteConnection {
  constructor(private readonly database: DatabaseSync) {}
  async execAsync(sql: string): Promise<void> { this.database.exec(sql); }
  async prepareAsync(sql: string): Promise<SqlitePreparedStatement> { return new Statement(this.database.prepare(sql)); }
  async isInTransactionAsync(): Promise<boolean> { return this.database.isTransaction; }
  async closeAsync(): Promise<void> { this.database.close(); }
}

const directories = new Set<string>();
const kernels = new Set<SqliteKernel>();
const NOW_MS = 1_794_225_600_000;
const ENVELOPE_KEY = "development-test.phase17.action-envelope.v1";
const SENTINEL_KEY = "phase17-matrix-nonfixture-sentinel";
const repositoryRoot = join(__dirname, "../..");
const starterPackBytes = readFileSync(join(repositoryRoot, "assets/content/starter-plans.v2.json"), "utf8");
const starterAcceptanceBytes = readFileSync(join(repositoryRoot, "artifacts/review/phase2/starter-plans-acceptance.json"), "utf8");
const catalogBytes = readFileSync(join(repositoryRoot, "assets/content/exercise-library.v1.json"), "utf8");
const catalogManifestBytes = readFileSync(join(repositoryRoot, "assets/content/exercise-library.v1.manifest.json"), "utf8");
const catalogAcceptanceBytes = readFileSync(join(repositoryRoot, "artifacts/review/phase2/exercise-library-acceptance.json"), "utf8");
let acceptedStarterPack: Promise<AcceptedStarterPack> | undefined;

afterEach(async () => {
  await Promise.all([...kernels].map((kernel) => kernel.close()));
  kernels.clear();
  for (const directory of directories) rmSync(directory, { force: true, recursive: true });
  directories.clear();
});

async function migratedKernel(): Promise<SqliteKernel> {
  const directory = mkdtempSync(join(tmpdir(), "gym-phase17-family-a-"));
  directories.add(directory);
  const path = join(directory, "gym-tracker.db");
  const fixture = new DatabaseSync(path);
  fixture.exec(readFileSync(join(__dirname, "../migrations/fixtures/v6-metric-profiles.sql"), "utf8"));
  fixture.close();
  const writer = new Connection(new DatabaseSync(path));
  const reader = new Connection(new DatabaseSync(path));
  await configureSqliteConnection(writer, { enableWal: true });
  await configureSqliteConnection(reader, { enableWal: false });
  const kernel = createSqliteKernel({ writer, reader });
  kernels.add(kernel);
  await createMigrationRunner({
    databaseName: path,
    kernel,
    migrations: migrations.filter(({ version }) => version <= 40),
    recoveryBackup: { async createAndValidate(request) {
      return { backupId: "phase17-matrix", databaseName: request.databaseName, fromVersion: request.fromVersion, toVersion: request.toVersion, validated: true as const };
    } },
  }).run();
  const sha256 = async (value: string) => createHash("sha256").update(value).digest("hex");
  const catalog = await parseExerciseCatalog({
    catalogBytes,
    manifestBytes: catalogManifestBytes,
    acceptanceBytes: catalogAcceptanceBytes,
    sha256,
  });
  try {
    await createContentRepository(kernel).importAcceptedCatalog({ catalog, expectedInstalled: null });
  } catch (error) {
    throw new Error("phase17_matrix_catalog_install_failed", { cause: error });
  }
  await createMigrationRunner({
    databaseName: path,
    kernel,
    migrations,
    recoveryBackup: { async createAndValidate(request) {
      return { backupId: "phase17-matrix-final", databaseName: request.databaseName, fromVersion: request.fromVersion, toVersion: request.toVersion, validated: true as const };
    } },
  }).run();
  const activeWorkouts = await kernel.queryAll<{ id: string; revision: number }>(
    "SELECT id, revision FROM workout_sessions WHERE status = 'in_progress' ORDER BY id",
  );
  for (const active of activeWorkouts) {
    await discardWorkout({
      repository: createWorkoutOutcomeRepository(kernel),
      input: {
        sessionId: active.id,
        expectedSessionRevision: active.revision,
        confirmation: "discard_workout",
        endedAtMs: NOW_MS,
      },
    });
  }
  // The v6 migration fixture predates the owned-schedule activation model and
  // carries an active plan without an active schedule.  Normalize that legacy
  // fixture-only state before capturing the matrix baseline so each journey's
  // activation owns the entire active-plan transition it later cleans up.
  await kernel.write((transaction) => transaction.execute(
    "UPDATE plans SET is_active = 0 WHERE is_active = 1",
  ));
  await installAcceptedStarterPlanSources(kernel, await starterPack());
  return kernel;
}

async function logicalDigest(kernel: SqliteKernel): Promise<Readonly<{ digest: string; snapshot: unknown }>> {
  const snapshot = await createLogicalBackupRepository(kernel).collect({ snapshotId: "phase17-family-a", createdAtMs: 1 });
  expect(snapshot.version).toBe(8);
  return Object.freeze({ digest: createHash("sha256").update(JSON.stringify(snapshot)).digest("hex"), snapshot });
}

function completePlan(planId: string, dayId: string, exerciseId: string, suffix: string, name: string): OwnedPlanDraftInput {
  return {
    id: planId,
    name,
    days: [{
      id: dayId,
      name: "Fixture day",
      ordinal: 0,
      occurrences: [{
        id: `phase17:owned-plan-occurrence:${suffix}`,
        exerciseId,
        ordinal: 0,
        restSeconds: 60,
        metricIdentity: { profile: "load_reps" as const, contractVersion: 1, exerciseMetricGeneration: 1 },
        warmups: [{ id: `phase17:owned-plan-warmup:${suffix}`, ordinal: 0, loadGrams: 10_000, reps: 5 }],
        targets: [{
          id: `phase17:owned-plan-target:${suffix}`,
          ordinal: 0,
          target: { profile: "load_reps" as const, version: 1 as const, loadGrams: 20_000, minReps: 8, maxReps: 12, incrementGrams: 2_500, perSide: false },
          units: { version: 1 as const, load: "grams" as const, count: "repetitions" as const },
        }],
        policy: {
          id: `phase17:owned-plan-policy:${suffix}`,
          kind: "manual_hold" as const,
          policyId: "manual-hold-v1",
          version: 1,
          rule: { kind: "manual_hold" as const, id: "manual-hold-v1", version: 1 },
        },
      }],
    }],
  };
}

function actionPlanId(row: FamilyARow, suffix: string): string {
  return row.caseId === "library.true-no-plans"
    // Fixture-token issuance consumes the first deterministic UUID; the
    // neutral chooser's real create command then owns the next runtime ID.
    ? "owned-plan:phase17-host-2"
    : `phase17:owned-plan:${suffix}`;
}

function postFacts(row: FamilyARow, fixtureToken: string, planId: string, exerciseId: string, actionReceiptId: string) {
  return {
    caseId: row.caseId,
    fixtureToken,
    planId,
    exerciseId,
    actionReceiptId,
    operation: row.operation,
    planRevision: row.postRevision,
    lifecycle: row.postLifecycle,
  };
}

function committed(result: OwnedPlanRepositoryResult): OwnedPlanCommittedResult {
  if (result.outcome !== "committed") throw new Error("phase17_matrix_command_not_committed");
  return result;
}

async function starterPack(): Promise<AcceptedStarterPack> {
  acceptedStarterPack ??= parseAcceptedStarterPlanPack({
    starterPackBytes,
    acceptanceBytes: starterAcceptanceBytes,
    sha256: async (value) => createHash("sha256").update(value).digest("hex"),
  });
  return acceptedStarterPack;
}

function starterSchedule(template: AcceptedStarterTemplate) {
  const suggestion = template.scheduleSuggestion;
  return suggestion.mode === "rotation"
    ? {
        startLocalDate: "2026-08-24",
        timeZone: "Asia/Singapore",
        mode: "rotation" as const,
        bindings: suggestion.rotation.map((planDaySourceId, ordinal) => ({ planDaySourceId, ordinal })),
      }
    : {
        startLocalDate: "2026-08-24",
        timeZone: "Asia/Singapore",
        mode: "weekday" as const,
        bindings: suggestion.cycleWeeks.flatMap((week, weekIndex) => week.map((binding, ordinal) => ({
          planDaySourceId: binding.dayId,
          ordinal: suggestion.cycleWeeks.slice(0, weekIndex).reduce((count, value) => count + value.length, 0) + ordinal,
          weekIndex,
          weekday: binding.weekday,
        }))),
      };
}

async function activateStarterFixture(input: Readonly<{
  kernel: SqliteKernel;
  template: AcceptedStarterTemplate;
  requestId: string;
  expectedActiveScheduleRevision: number | null;
}>) {
  const schedule = starterSchedule(input.template);
  const pack = await starterPack();
  return activateStarterPlan({
    kind: "accepted",
    starterPackBytes,
    acceptanceBytes: starterAcceptanceBytes,
    sha256: async (value) => createHash("sha256").update(value).digest("hex"),
    repository: createStarterPlanRepository(input.kernel),
    requestId: input.requestId,
    activatedAtMs: NOW_MS,
    expectedActiveScheduleRevision: input.expectedActiveScheduleRevision,
    confirmationToken: createStarterPlanActivationConfirmationToken({
      assetSha256: pack.assetSha256,
      templateId: input.template.id,
      templateRevision: input.template.revision,
      startLocalDate: schedule.startLocalDate,
      timeZone: schedule.timeZone,
      mode: schedule.mode,
      bindings: schedule.bindings,
      copyChoice: null,
    }),
    templateId: input.template.id,
    templateRevision: input.template.revision,
    copyChoice: null,
    ...schedule,
  });
}

describe("Phase 17 Family A cleanup matrix", () => {
  it("keeps the schema-42 instruction and durable custom-library receipt paths live after the v8 upgrade", async () => {
    const kernel = await migratedKernel();

    await expect(kernel.queryAll<{ user_version: number }>("PRAGMA user_version"))
      .resolves.toEqual([{ user_version: 42 }]);

    const [instructionCount] = await kernel.queryAll<{ count: number }>(
      "SELECT COUNT(*) AS count FROM exercise_instruction_sets",
    );
    const [exerciseCount] = await kernel.queryAll<{ count: number }>(
      "SELECT COUNT(*) AS count FROM exercise_library_entries",
    );
    expect(instructionCount?.count).toBeGreaterThan(0);
    expect(instructionCount?.count).toBeLessThanOrEqual(exerciseCount?.count ?? 0);
    const [invalidInstruction] = await kernel.queryAll<{ count: number }>(
      `SELECT COUNT(*) AS count
       FROM exercise_instruction_sets
       WHERE length(trim(source_namespace)) = 0
          OR length(trim(source_revision)) = 0
          OR length(trim(source_license)) = 0
          OR length(trim(source_attribution)) = 0
          OR json_array_length(steps_json) < 1`,
    );
    expect(invalidInstruction?.count).toBe(0);

    await kernel.write((transaction) => transaction.execute(
      `INSERT INTO custom_exercise_mutation_receipts
        (request_id, mutation_kind, request_json, result_json, committed_at_ms)
       VALUES (?, 'favorite', ?, ?, ?)`,
      [
        "phase17:migration-42-receipt",
        JSON.stringify({ exerciseId: "phase17:probe", favorite: true }),
        JSON.stringify({ outcome: "committed", revision: 2 }),
        NOW_MS,
      ],
    ));
    await expect(kernel.write((transaction) => transaction.execute(
      `INSERT INTO custom_exercise_mutation_receipts
        (request_id, mutation_kind, request_json, result_json, committed_at_ms)
       VALUES (?, 'favorite', ?, ?, ?)`,
      [
        "phase17:migration-42-receipt",
        JSON.stringify({ exerciseId: "phase17:probe", favorite: true }),
        JSON.stringify({ outcome: "committed", revision: 2 }),
        NOW_MS,
      ],
    ))).rejects.toMatchObject({ code: "sqlite_transaction_failed" });

    const [receipt] = await kernel.queryAll<{ mutation_kind: string; result_json: string }>(
      "SELECT mutation_kind, result_json FROM custom_exercise_mutation_receipts WHERE request_id = ?",
      ["phase17:migration-42-receipt"],
    );
    expect(receipt).toEqual({
      mutation_kind: "favorite",
      result_json: JSON.stringify({ outcome: "committed", revision: 2 }),
    });
  });

  it.each(FAMILY_A_PLAN_MUTATION_ROWS)("keeps $caseId bound to its labelled production command and durable receipt", ({ caseId, label }) => {
    const contract = PHASE17_CASE_ACTION_CONTRACTS.find(({ id }) => id === caseId);
    expect(contract).toMatchObject({ id: caseId, actionReceiptRequired: true });
    expect(phase17ActionEnvelopePlan(caseId, "phase17:matrix-token-0000000000000001")[0])
      .toMatchObject({ label });
    expect(PHASE17_FAMILY_A_MUTATION_RECEIPTS)
      .toContainEqual([caseId, "owned_plan_mutation_requests", expect.any(String)]);
  });

  it.each(FAMILY_A_PLAN_MUTATION_ROWS)("runs migrated schema-42/v8 $caseId through the real $label command, exact receipt probe, and cleanup", async (row) => {
    const kernel = await migratedKernel();
    const [schema] = await kernel.queryAll<{ user_version: number }>("PRAGMA user_version");
    expect(schema?.user_version).toBe(42);
    await kernel.write((transaction) => transaction.execute(
      "INSERT INTO app_settings (key, value_version, value_json, revision, updated_at_ms) VALUES (?, 1, ?, 1, ?)",
      [SENTINEL_KEY, JSON.stringify({ preserve: true }), NOW_MS],
    ));
    const before = await logicalDigest(kernel);

    let sequence = 0;
    const sha256 = async (value: string) => createHash("sha256").update(value).digest("hex");
    const ownedPlans = createOwnedPlanRuntimePort(kernel, {
      nowMs: () => NOW_MS,
      randomUUID: () => `phase17-host-${++sequence}`,
      sha256,
    });
    const customExercises = createCustomExerciseRepository(kernel);
    const envelope = createPhase17ActionEnvelopeSource({
      contracts: PHASE17_MATRIX_CONTRACTS,
      identity: () => ({ packageName: "com.fchoo.gymtracker.devtest", buildProfile: "development-test", nativeContractsEnabled: true, suite: "phase17" }),
      store: {
        read: async () => {
          const [setting] = await kernel.queryAll<{ value_json: string }>("SELECT value_json FROM app_settings WHERE key = ?", [ENVELOPE_KEY]);
          return setting === undefined ? null : JSON.parse(setting.value_json) as Phase17ActionEnvelopeContext;
        },
        write: async (value) => {
          await kernel.write((transaction) => transaction.execute(
            `INSERT INTO app_settings (key, value_version, value_json, revision, updated_at_ms)
             VALUES (?, 1, ?, 1, ?)
             ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json,
               revision = app_settings.revision + 1, updated_at_ms = excluded.updated_at_ms`,
            [ENVELOPE_KEY, JSON.stringify(value), NOW_MS],
          ));
        },
        clear: async (value) => {
          const result = await kernel.write((transaction) => transaction.execute(
            "DELETE FROM app_settings WHERE key = ? AND value_json = ?",
            [ENVELOPE_KEY, JSON.stringify(value)],
          ));
          if (result.changes !== 1) throw new Error("phase17_matrix_envelope_clear_failed");
        },
      },
    });
    const protocol = createPhase17FixtureProtocol({
      contracts: PHASE17_MATRIX_CONTRACTS,
      createToken: () => `phase17:matrix-token-${String(++sequence).padStart(16, "0")}`,
      adapter: {
        baselineDigest: async () => (await logicalDigest(kernel)).digest,
        canonicalHash: async (value) => sha256(JSON.stringify(value)),
        selectorSchema: () => ({ selectors: ["ownedPlanId", "customExerciseId"], actionInputs: ["phase17ActionReceiptId"] }),
        seed: async ({ fixtureToken }) => {
          const suffix = fixtureToken.slice("phase17:".length);
          const exerciseId = `phase17:custom:${suffix}`;
          const planId = actionPlanId(row, suffix);
          const setupRequest = `phase17:fixture:custom-exercise-create:${suffix}:setup`;
          await createCustomExercise({ repository: customExercises, invalidate: async () => undefined, input: {
            requestId: setupRequest,
            exerciseId,
            name: `Matrix ${row.caseId}`,
            aliases: ["Matrix"],
            exerciseType: "strength",
            movementClass: "compound",
            primaryMuscles: ["quadriceps"],
            secondaryMuscles: [],
            equipment: ["barbell"],
            metricIdentity: { profile: "load_reps", contractVersion: 1, exerciseMetricGeneration: 1 },
            defaultRestSeconds: 60,
            createdAtMs: NOW_MS,
          } });
          if (row.caseId !== "library.true-no-plans") {
            const fixturePlanId = `phase17:owned-plan:${suffix}`;
            const dayId = `phase17:owned-plan-day:${suffix}`;
            const created = committed(await ownedPlans.createFixtureDraft({
              requestId: `phase17:fixture:owned-plan-create:${suffix}:setup`,
              planId: fixturePlanId,
              dayId,
              name: `Matrix ${row.caseId}`,
              dayName: "Fixture day",
            }));
            if (row.caseId === "library.plan-editor") {
              committed(await ownedPlans.savePlan({
                requestId: `phase17:fixture:owned-plan-save:${suffix}:setup`,
                expectedRevision: created.plan.revision,
                plan: completePlan(fixturePlanId, dayId, exerciseId, suffix, `Matrix ${row.caseId}`),
              }));
            }
          }
          const actionReceiptId = `phase17:${row.caseId}:${suffix}:action`;
          const preFacts = {
            caseId: row.caseId,
            fixtureToken,
            planId,
            exerciseId,
            actionReceiptId: null,
            operation: null,
            planRevision: row.preRevision,
            lifecycle: row.preLifecycle,
          };
          return {
            selectors: { ownedPlanId: planId, customExerciseId: exerciseId },
            actionInputs: { phase17ActionReceiptId: actionReceiptId },
            expectedPreState: preFacts,
            expectedPostState: postFacts(row, fixtureToken, planId, exerciseId, actionReceiptId),
            actionReceiptId,
          };
        },
        probe: async ({ fixtureToken, selectors }) => {
          const actionReceiptId = `phase17:${row.caseId}:${fixtureToken.slice("phase17:".length)}:action`;
          const [receipt] = await kernel.queryAll<{
            operation: string;
            source_plan_id: string | null;
            result_plan_id: string;
            expected_revision: number | null;
            result_revision: number;
            result_json: string;
          }>(
            `SELECT operation, source_plan_id, result_plan_id, expected_revision, result_revision, result_json
             FROM owned_plan_mutation_requests WHERE request_id = ?`,
            [actionReceiptId],
          );
          if (receipt === undefined) throw new Error("phase17_matrix_receipt_missing");
          expect(receipt).toMatchObject({
            operation: row.operation,
            source_plan_id: row.caseId === "library.true-no-plans" ? null : selectors.ownedPlanId,
            result_plan_id: selectors.ownedPlanId,
            expected_revision: row.preRevision,
            result_revision: row.postRevision,
          });
          expect(JSON.parse(receipt.result_json)).toMatchObject({ outcome: "committed" });
          const [plan] = await kernel.queryAll<{ id: string; revision: number; lifecycle: string }>(
            `SELECT plan.id, plan.revision, state.lifecycle
             FROM plans plan JOIN owned_plan_aggregate_states state ON state.plan_id = plan.id
             WHERE plan.id = ? AND plan.revision = ? AND state.lifecycle = ?`,
            [receipt.result_plan_id, receipt.result_revision, row.postLifecycle],
          );
          if (plan === undefined) throw new Error("phase17_matrix_authoritative_plan_missing");
          const facts = postFacts(row, fixtureToken, plan.id, selectors.customExerciseId!, actionReceiptId);
          return { rowCount: 1, identityHash: await sha256(JSON.stringify(facts)), facts };
        },
        cleanup: async ({ caseId, fixtureToken, selectors }) => cleanupPhase17FamilyAManifest(
          kernel,
          createPhase17FamilyACleanupManifest(caseId, fixtureToken, {
            ownedPlanId: selectors.ownedPlanId!,
            customExerciseId: selectors.customExerciseId!,
          }),
        ),
        finalizeCleanup: async ({ caseId, fixtureToken }) => envelope.clear({ caseId, fixtureToken }),
      },
    });

    const fixture = await protocol.setup(row.caseId);
    expect(fixture.baselineDigest).toBe(before.digest);
    await envelope.activate({
      caseId: fixture.caseId,
      fixtureToken: fixture.fixtureToken,
      envelopes: phase17ActionEnvelopePlan(fixture.caseId, fixture.fixtureToken),
      cleanupManifest: createPhase17FamilyACleanupManifest(fixture.caseId, fixture.fixtureToken, {
        ownedPlanId: fixture.selectors.ownedPlanId!,
        customExerciseId: fixture.selectors.customExerciseId!,
      }),
    });
    await expect(envelope.hydrate()).resolves.toMatchObject({
      caseId: row.caseId,
      fixtureToken: fixture.fixtureToken,
      envelopes: [{ label: row.label, requestId: fixture.actionReceiptId }],
    });
    const requestId = await envelope.claim({ caseId: fixture.caseId, fixtureToken: fixture.fixtureToken, label: row.label });
    if (requestId === null) throw new Error("phase17_matrix_action_request_missing");

    const suffix = fixture.fixtureToken.slice("phase17:".length);
    if (row.caseId === "library.true-no-plans") {
      const result = committed(await ownedPlans.createDraft({ name: "Matrix Strength", dayName: "Strength day", requestId }));
      expect(result.plan).toMatchObject({ id: fixture.selectors.ownedPlanId, revision: row.postRevision, lifecycle: row.postLifecycle });
    } else if (row.caseId === "library.owned-lifecycle") {
      const result = committed(await ownedPlans.archivePlan({ planId: fixture.selectors.ownedPlanId!, expectedRevision: row.preRevision!, requestId }));
      expect(result.plan).toMatchObject({ id: fixture.selectors.ownedPlanId, revision: row.postRevision, lifecycle: row.postLifecycle });
    } else {
      const result = committed(await ownedPlans.savePlan({
        expectedRevision: row.preRevision!,
        requestId,
        plan: completePlan(
          fixture.selectors.ownedPlanId!,
          `phase17:owned-plan-day:${suffix}`,
          fixture.selectors.customExerciseId!,
          suffix,
          row.caseId === "library.plan-editor" ? "Matrix editor saved" : "Matrix Strength saved",
        ),
      }));
      expect(result.plan).toMatchObject({ id: fixture.selectors.ownedPlanId, revision: row.postRevision, lifecycle: row.postLifecycle });
    }

    await expect(protocol.probe({ caseId: fixture.caseId, fixtureToken: fixture.fixtureToken, sourceTable: fixture.sourceTable }))
      .resolves.toMatchObject({ verdict: "matched", expectedPostStateHash: fixture.expectedPostStateHash });
    await envelope.assertConsumed({ caseId: fixture.caseId, fixtureToken: fixture.fixtureToken });
    await envelope.updateCleanupManifest({
      caseId: fixture.caseId,
      fixtureToken: fixture.fixtureToken,
      cleanupManifest: await materializePhase17FamilyACleanupManifest(kernel, createPhase17FamilyACleanupManifest(fixture.caseId, fixture.fixtureToken, {
        ownedPlanId: fixture.selectors.ownedPlanId!,
        customExerciseId: fixture.selectors.customExerciseId!,
      })),
    });
    await expect(protocol.cleanup({ caseId: fixture.caseId, fixtureToken: fixture.fixtureToken }))
      .resolves.toMatchObject({ verdict: "restored", baselineDigest: before.digest });
    await expect(kernel.queryAll("SELECT key FROM app_settings WHERE key = ?", [ENVELOPE_KEY])).resolves.toEqual([]);
    await expect(kernel.queryAll<{ value_json: string }>("SELECT value_json FROM app_settings WHERE key = ?", [SENTINEL_KEY]))
      .resolves.toEqual([{ value_json: JSON.stringify({ preserve: true }) }]);
    const after = await logicalDigest(kernel);
    expect(after).toEqual(before);
  });

  it("runs migrated schema-42/v8 library.starter-detail through its real inactive-copy command and cleanup", async () => {
    const caseId = "library.starter-detail";
    const label = "starter-editable-copy";
    const kernel = await migratedKernel();
    const [schema] = await kernel.queryAll<{ user_version: number }>("PRAGMA user_version");
    expect(schema?.user_version).toBe(42);
    await kernel.write((transaction) => transaction.execute(
      "INSERT INTO app_settings (key, value_version, value_json, revision, updated_at_ms) VALUES (?, 1, ?, 1, ?)",
      [SENTINEL_KEY, JSON.stringify({ preserve: true }), NOW_MS],
    ));
    const before = await logicalDigest(kernel);
    const sha256 = async (value: string) => createHash("sha256").update(value).digest("hex");
    const template = (await starterPack()).templates.find(({ id }) => id === "full-body-foundation");
    if (template === undefined) throw new Error("phase17_matrix_starter_template_missing");
    const envelope = createPhase17ActionEnvelopeSource({
      contracts: PHASE17_MATRIX_CONTRACTS,
      identity: () => ({ packageName: "com.fchoo.gymtracker.devtest", buildProfile: "development-test", nativeContractsEnabled: true, suite: "phase17" }),
      store: {
        read: async () => {
          const [setting] = await kernel.queryAll<{ value_json: string }>("SELECT value_json FROM app_settings WHERE key = ?", [ENVELOPE_KEY]);
          return setting === undefined ? null : JSON.parse(setting.value_json) as Phase17ActionEnvelopeContext;
        },
        write: async (value) => { await kernel.write((transaction) => transaction.execute(
          `INSERT INTO app_settings (key, value_version, value_json, revision, updated_at_ms) VALUES (?, 1, ?, 1, ?)
           ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, revision = app_settings.revision + 1, updated_at_ms = excluded.updated_at_ms`,
          [ENVELOPE_KEY, JSON.stringify(value), NOW_MS],
        )); },
        clear: async (value) => { await kernel.write((transaction) => transaction.execute("DELETE FROM app_settings WHERE key = ? AND value_json = ?", [ENVELOPE_KEY, JSON.stringify(value)])); },
      },
    });
    const protocol = createPhase17FixtureProtocol({
      contracts: PHASE17_CASE_ACTION_CONTRACTS,
      createToken: () => "phase17:startercopy00000001",
      adapter: {
        baselineDigest: async () => (await logicalDigest(kernel)).digest,
        canonicalHash: async (value) => sha256(JSON.stringify(value)),
        selectorSchema: () => ({ selectors: ["ownedPlanId", "customExerciseId"], actionInputs: ["phase17ActionReceiptId"] }),
        seed: async ({ fixtureToken }) => {
          const actionReceiptId = `phase17:${caseId}:${fixtureToken.slice("phase17:".length)}:action`;
          return {
            selectors: { ownedPlanId: `starter:${template.id}:r${template.revision}`, customExerciseId: `phase17:unused:${fixtureToken.slice("phase17:".length)}` },
            actionInputs: { phase17ActionReceiptId: actionReceiptId },
            expectedPreState: { caseId, fixtureToken, actionReceiptId: null, copiedPlan: false, scheduleLifecycle: null },
            expectedPostState: { caseId, fixtureToken, actionReceiptId, copiedPlan: true, scheduleLifecycle: "inactive" },
            actionReceiptId,
          };
        },
        probe: async ({ fixtureToken }) => {
          const requestId = `phase17:${caseId}:${fixtureToken.slice("phase17:".length)}:action`;
          const [receipt] = await kernel.queryAll<{ operation: string; result_plan_id: string; result_revision: number; result_json: string }>(
            "SELECT operation, result_plan_id, result_revision, result_json FROM owned_plan_mutation_requests WHERE request_id = ?", [requestId],
          );
          if (receipt === undefined || receipt.operation !== "create") throw new Error("phase17_matrix_starter_copy_receipt_missing");
          const result = JSON.parse(receipt.result_json) as { outcome?: string; schedule?: { id?: string; lifecycle?: string } };
          const [copy] = await kernel.queryAll<{ id: string; is_active: number; revision: number }>(
            "SELECT id, is_active, revision FROM plans WHERE id = ? AND origin = 'copied'", [receipt.result_plan_id],
          );
          if (result.outcome !== "committed" || result.schedule?.lifecycle !== "inactive" || typeof result.schedule.id !== "string" || copy === undefined || copy.is_active !== 0 || copy.revision !== receipt.result_revision) throw new Error("phase17_matrix_starter_copy_result_missing");
          const facts = { caseId, fixtureToken, actionReceiptId: requestId, copiedPlan: true, scheduleLifecycle: "inactive" as const };
          return { rowCount: 1, identityHash: await sha256(JSON.stringify(facts)), facts };
        },
        cleanup: async ({ caseId: cleanupCaseId, fixtureToken, selectors }) => cleanupPhase17FamilyAManifest(kernel, createPhase17FamilyACleanupManifest(cleanupCaseId, fixtureToken, {
          ownedPlanId: selectors.ownedPlanId!, customExerciseId: selectors.customExerciseId!,
        })),
        finalizeCleanup: async ({ caseId: cleanupCaseId, fixtureToken }) => envelope.clear({ caseId: cleanupCaseId, fixtureToken }),
      },
    });
    const fixture = await protocol.setup(caseId);
    expect(fixture.baselineDigest).toBe(before.digest);
    await envelope.activate({ caseId, fixtureToken: fixture.fixtureToken, envelopes: phase17ActionEnvelopePlan(caseId, fixture.fixtureToken), cleanupManifest: createPhase17FamilyACleanupManifest(caseId, fixture.fixtureToken, {
      ownedPlanId: fixture.selectors.ownedPlanId!, customExerciseId: fixture.selectors.customExerciseId!,
    }) });
    const requestId = await envelope.claim({ caseId, fixtureToken: fixture.fixtureToken, label });
    if (requestId === null) throw new Error("phase17_matrix_starter_copy_request_missing");
    let stage = "copy";
    await createStarterPlanCopy({
      starterPackBytes,
      acceptanceBytes: starterAcceptanceBytes,
      sha256,
      repository: createStarterPlanRepository(kernel),
      requestId,
      createdAtMs: NOW_MS,
      sourceOwnedPlanId: fixture.selectors.ownedPlanId!,
      expectedSourcePlanRevision: template.revision,
      expectedActiveScheduleRevision: null,
      templateId: template.id,
      templateRevision: template.revision,
      ...starterSchedule(template),
    });
    stage = "probe";
    await expect(protocol.probe({ caseId, fixtureToken: fixture.fixtureToken, sourceTable: fixture.sourceTable })).resolves.toMatchObject({ verdict: "matched" });
    await envelope.assertConsumed({ caseId, fixtureToken: fixture.fixtureToken });
    await envelope.updateCleanupManifest({ caseId, fixtureToken: fixture.fixtureToken, cleanupManifest: await materializePhase17FamilyACleanupManifest(kernel, createPhase17FamilyACleanupManifest(caseId, fixture.fixtureToken, {
      ownedPlanId: fixture.selectors.ownedPlanId!, customExerciseId: fixture.selectors.customExerciseId!,
    })) });
    stage = "cleanup";
    try {
      await expect(protocol.cleanup({ caseId, fixtureToken: fixture.fixtureToken })).resolves.toMatchObject({ verdict: "restored", baselineDigest: before.digest });
    } catch (error) {
      throw new Error(`phase17_matrix_starter_copy_${stage}`, { cause: error });
    }
    await expect(kernel.queryAll("SELECT key FROM app_settings WHERE key = ?", [ENVELOPE_KEY])).resolves.toEqual([]);
    await expect(kernel.queryAll<{ value_json: string }>("SELECT value_json FROM app_settings WHERE key = ?", [SENTINEL_KEY])).resolves.toEqual([{ value_json: JSON.stringify({ preserve: true }) }]);
    expect(await logicalDigest(kernel)).toEqual(before);
  });

  it("runs migrated schema-42/v8 library.template-update from a source-backed older owned copy through preview, copy, receipt, and cleanup", async () => {
    const caseId = "library.template-update";
    const label = "starter-template-update-copy";
    const kernel = await migratedKernel();
    const [schema] = await kernel.queryAll<{ user_version: number }>("PRAGMA user_version");
    expect(schema?.user_version).toBe(42);
    await kernel.write((transaction) => transaction.execute(
      "INSERT INTO app_settings (key, value_version, value_json, revision, updated_at_ms) VALUES (?, 1, ?, 1, ?)",
      [SENTINEL_KEY, JSON.stringify({ preserve: true }), NOW_MS],
    ));
    const before = await logicalDigest(kernel);
    const template = (await starterPack()).templates.find(({ id }) => id === "full-body-foundation");
    if (template === undefined) throw new Error("phase17_matrix_starter_template_missing");
    const sha256 = async (value: string) => createHash("sha256").update(value).digest("hex");
    const envelope = createPhase17ActionEnvelopeSource({
      contracts: PHASE17_MATRIX_CONTRACTS,
      identity: () => ({ packageName: "com.fchoo.gymtracker.devtest", buildProfile: "development-test", nativeContractsEnabled: true, suite: "phase17" }),
      store: {
        read: async () => {
          const [setting] = await kernel.queryAll<{ value_json: string }>("SELECT value_json FROM app_settings WHERE key = ?", [ENVELOPE_KEY]);
          return setting === undefined ? null : JSON.parse(setting.value_json) as Phase17ActionEnvelopeContext;
        },
        write: async (value) => { await kernel.write((transaction) => transaction.execute(
          `INSERT INTO app_settings (key, value_version, value_json, revision, updated_at_ms)
           VALUES (?, 1, ?, 1, ?)
           ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json,
             revision = app_settings.revision + 1, updated_at_ms = excluded.updated_at_ms`,
          [ENVELOPE_KEY, JSON.stringify(value), NOW_MS],
        )); },
        clear: async (value) => { await kernel.write((transaction) => transaction.execute("DELETE FROM app_settings WHERE key = ? AND value_json = ?", [ENVELOPE_KEY, JSON.stringify(value)])); },
      },
    });
    const protocol = createPhase17FixtureProtocol({
      contracts: PHASE17_CASE_ACTION_CONTRACTS,
      createToken: () => "phase17:templateupdate0001",
      adapter: {
        baselineDigest: async () => (await logicalDigest(kernel)).digest,
        canonicalHash: async (value) => sha256(JSON.stringify(value)),
        selectorSchema: () => ({ selectors: ["ownedPlanId", "customExerciseId"], actionInputs: ["phase17ActionReceiptId"] }),
        seed: async ({ fixtureToken }) => {
          const legacyPlanId = `phase17:legacy-copy:${fixtureToken.slice("phase17:".length)}`;
          await kernel.write((transaction) => transaction.execute(
            `INSERT INTO plans
              (id, content_pack_id, origin, source_namespace, upstream_id, name,
               days_per_week, audience, goal, estimate_minutes, attribution,
               is_active, revision)
             VALUES (?, NULL, 'copied', 'gym-tracker.original', ?, ?, 2, ?, ?, ?, ?, 0, 1)`,
            [legacyPlanId, template.id, template.displayName, template.audience, template.goal, template.estimatedDurationMinutes, "source-backed historical copy"],
          ));
          const actionReceiptId = `phase17:${caseId}:${fixtureToken.slice("phase17:".length)}:action`;
          return {
            selectors: { ownedPlanId: legacyPlanId, customExerciseId: `phase17:unused:${fixtureToken.slice("phase17:".length)}` },
            actionInputs: { phase17ActionReceiptId: actionReceiptId },
            expectedPreState: { caseId, fixtureToken, actionReceiptId: null, copiedPlan: false, sourceRevision: 1 },
            expectedPostState: { caseId, fixtureToken, actionReceiptId, copiedPlan: true, sourceRevision: template.revision },
            actionReceiptId,
          };
        },
        probe: async ({ fixtureToken, selectors }) => {
          const requestId = `phase17:${caseId}:${fixtureToken.slice("phase17:".length)}:action`;
          const [receipt] = await kernel.queryAll<{ operation: string; source_plan_id: string | null; result_plan_id: string; expected_revision: number | null; result_revision: number; result_json: string }>(
            "SELECT operation, source_plan_id, result_plan_id, expected_revision, result_revision, result_json FROM owned_plan_mutation_requests WHERE request_id = ?", [requestId],
          );
          if (receipt === undefined) throw new Error("phase17_matrix_template_update_receipt_missing");
          expect(receipt).toMatchObject({ operation: "duplicate", source_plan_id: selectors.ownedPlanId, expected_revision: 1, result_revision: 1 });
          const [source] = await kernel.queryAll<{ source_revision: number }>(
            "SELECT source_revision FROM owned_plan_starter_sources WHERE plan_id = ?", [receipt.result_plan_id],
          );
          expect(source?.source_revision).toBe(template.revision);
          expect(JSON.parse(receipt.result_json)).toMatchObject({ outcome: "committed", sourceOwnedPlanId: selectors.ownedPlanId, plan: { id: receipt.result_plan_id, sourceRevision: template.revision, isActive: false } });
          const facts = { caseId, fixtureToken, actionReceiptId: requestId, copiedPlan: true, sourceRevision: template.revision };
          return { rowCount: 1, identityHash: await sha256(JSON.stringify(facts)), facts };
        },
        cleanup: async ({ caseId: cleanupCaseId, fixtureToken, selectors }) => cleanupPhase17FamilyAManifest(kernel, createPhase17FamilyACleanupManifest(cleanupCaseId, fixtureToken, {
          ownedPlanId: selectors.ownedPlanId!, customExerciseId: selectors.customExerciseId!,
        })),
        finalizeCleanup: async ({ caseId: cleanupCaseId, fixtureToken }) => envelope.clear({ caseId: cleanupCaseId, fixtureToken }),
      },
    });
    const fixture = await protocol.setup(caseId);
    expect(fixture.baselineDigest).toBe(before.digest);
    const [acceptedSource] = await kernel.queryAll<{ source_revision: number; template_json: string }>(
      "SELECT source_revision, template_json FROM starter_plan_sources WHERE source_namespace = ? AND template_id = ? AND source_revision = ?",
      [(await starterPack()).namespace, template.id, template.revision],
    );
    expect(acceptedSource).toMatchObject({ source_revision: template.revision, template_json: template.sourceJson });
    const preview = createStarterTemplateUpdatePreview({
      ownedPlanId: fixture.selectors.ownedPlanId!,
      ownedPlanName: template.displayName,
      ownedPlanRevision: 1,
      activeScheduleRevision: null,
      previousSourceJson: legacyFullBodySourceJson(fullBodyFoundationAsset, template),
      template,
    });
    expect(preview.sections.flatMap(({ changes }) => changes).some(({ kind }) => kind !== "Unchanged")).toBe(true);
    await envelope.activate({ caseId, fixtureToken: fixture.fixtureToken, envelopes: phase17ActionEnvelopePlan(caseId, fixture.fixtureToken), cleanupManifest: createPhase17FamilyACleanupManifest(caseId, fixture.fixtureToken, {
      ownedPlanId: fixture.selectors.ownedPlanId!, customExerciseId: fixture.selectors.customExerciseId!,
    }) });
    const requestId = await envelope.claim({ caseId, fixtureToken: fixture.fixtureToken, label });
    if (requestId === null) throw new Error("phase17_matrix_template_update_request_missing");
    const result = await createStarterPlanCopy({
      starterPackBytes,
      acceptanceBytes: starterAcceptanceBytes,
      sha256,
      repository: createStarterPlanRepository(kernel),
      requestId,
      createdAtMs: NOW_MS,
      sourceOwnedPlanId: preview.ownedPlanId,
      expectedSourcePlanRevision: preview.ownedPlanRevision,
      expectedActiveScheduleRevision: preview.activeScheduleRevision,
      templateId: preview.template.id,
      templateRevision: preview.template.revision,
      ...starterSchedule(preview.template),
    });
    expect(result).toMatchObject({ outcome: "committed", sourceOwnedPlanId: preview.ownedPlanId, plan: { sourceRevision: template.revision, isActive: false } });
    await expect(protocol.probe({ caseId, fixtureToken: fixture.fixtureToken, sourceTable: fixture.sourceTable })).resolves.toMatchObject({ verdict: "matched" });
    await envelope.assertConsumed({ caseId, fixtureToken: fixture.fixtureToken });
    await envelope.updateCleanupManifest({ caseId, fixtureToken: fixture.fixtureToken, cleanupManifest: await materializePhase17FamilyACleanupManifest(kernel, createPhase17FamilyACleanupManifest(caseId, fixture.fixtureToken, {
      ownedPlanId: fixture.selectors.ownedPlanId!, customExerciseId: fixture.selectors.customExerciseId!,
    })) });
    await expect(protocol.cleanup({ caseId, fixtureToken: fixture.fixtureToken })).resolves.toMatchObject({ verdict: "restored", baselineDigest: before.digest });
    await expect(kernel.queryAll("SELECT key FROM app_settings WHERE key = ?", [ENVELOPE_KEY])).resolves.toEqual([]);
    await expect(kernel.queryAll<{ value_json: string }>("SELECT value_json FROM app_settings WHERE key = ?", [SENTINEL_KEY])).resolves.toEqual([{ value_json: JSON.stringify({ preserve: true }) }]);
    expect(await logicalDigest(kernel)).toEqual(before);
  });

  it.each([
    { caseId: "library.starter-activation", label: "starter-plan-activation" },
    { caseId: "library.schedule-editor", label: "schedule-save" },
    { caseId: "library.replacement-impact", label: "plan-impact-replace" },
    { caseId: "library.day-removal-impact", label: "plan-impact-remove" },
  ] as const)("runs migrated schema-42/v8 $caseId through its reviewed production preview, confirmation, receipt, and cleanup", async ({ caseId, label }) => {
    const kernel = await migratedKernel();
    const [schema] = await kernel.queryAll<{ user_version: number }>("PRAGMA user_version");
    expect(schema?.user_version).toBe(42);
    await kernel.write((transaction) => transaction.execute(
      "INSERT INTO app_settings (key, value_version, value_json, revision, updated_at_ms) VALUES (?, 1, ?, 1, ?)",
      [SENTINEL_KEY, JSON.stringify({ preserve: true }), NOW_MS],
    ));
    const before = await logicalDigest(kernel);
    const template = (await starterPack()).templates.find(({ id }) => id === "full-body-foundation");
    if (template === undefined) throw new Error("phase17_matrix_starter_template_missing");
    let sequence = 0;
    const sha256 = async (value: string) => createHash("sha256").update(value).digest("hex");
    const ownedPlans = createOwnedPlanRuntimePort(kernel, {
      nowMs: () => NOW_MS,
      randomUUID: () => `phase17-journey-${++sequence}`,
      sha256,
    });
    const envelope = createPhase17ActionEnvelopeSource({
      contracts: PHASE17_CASE_ACTION_CONTRACTS,
      identity: () => ({ packageName: "com.fchoo.gymtracker.devtest", buildProfile: "development-test", nativeContractsEnabled: true, suite: "phase17" }),
      store: {
        read: async () => {
          const [setting] = await kernel.queryAll<{ value_json: string }>("SELECT value_json FROM app_settings WHERE key = ?", [ENVELOPE_KEY]);
          return setting === undefined ? null : JSON.parse(setting.value_json) as Phase17ActionEnvelopeContext;
        },
        write: async (value) => { await kernel.write((transaction) => transaction.execute(
          `INSERT INTO app_settings (key, value_version, value_json, revision, updated_at_ms)
           VALUES (?, 1, ?, 1, ?)
           ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json,
             revision = app_settings.revision + 1, updated_at_ms = excluded.updated_at_ms`,
          [ENVELOPE_KEY, JSON.stringify(value), NOW_MS],
        )); },
        clear: async (value) => { await kernel.write((transaction) => transaction.execute("DELETE FROM app_settings WHERE key = ? AND value_json = ?", [ENVELOPE_KEY, JSON.stringify(value)])); },
      },
    });
    const protocol = createPhase17FixtureProtocol({
      contracts: PHASE17_CASE_ACTION_CONTRACTS,
      createToken: () => `phase17:journey-${String(++sequence).padStart(16, "0")}`,
      adapter: {
        baselineDigest: async () => (await logicalDigest(kernel)).digest,
        canonicalHash: async (value) => sha256(JSON.stringify(value)),
        selectorSchema: () => ({ selectors: ["ownedPlanId", "customExerciseId"], actionInputs: ["phase17ActionReceiptId"] }),
        seed: async ({ fixtureToken }) => {
          const actionReceiptId = `phase17:${caseId}:${fixtureToken.slice("phase17:".length)}:action`;
          if (caseId === "library.starter-activation") {
            return {
              selectors: { ownedPlanId: `starter:${template.id}:r${template.revision}`, customExerciseId: `phase17:unused:${fixtureToken.slice("phase17:".length)}` },
              actionInputs: { phase17ActionReceiptId: actionReceiptId },
              expectedPreState: { caseId, fixtureToken, actionReceiptId: null, activated: false },
              expectedPostState: { caseId, fixtureToken, actionReceiptId, activated: true },
              actionReceiptId,
            };
          }
          const setup = await activateStarterFixture({
            kernel,
            template,
            requestId: `phase17:fixture:starter-activation:${fixtureToken.slice("phase17:".length)}:setup`,
            expectedActiveScheduleRevision: null,
          });
          return {
            selectors: { ownedPlanId: setup.plan.id, customExerciseId: `phase17:unused:${fixtureToken.slice("phase17:".length)}` },
            actionInputs: { phase17ActionReceiptId: actionReceiptId },
            expectedPreState: { caseId, fixtureToken, actionReceiptId: null, planRevision: setup.plan.revision, scheduleRevision: setup.schedule.revision },
            expectedPostState: { caseId, fixtureToken, actionReceiptId, committed: true },
            actionReceiptId,
          };
        },
        probe: async ({ fixtureToken, selectors }) => {
          const requestId = `phase17:${caseId}:${fixtureToken.slice("phase17:".length)}:action`;
          if (caseId === "library.starter-activation") {
            const [receipt] = await kernel.queryAll<{ result_plan_id: string; result_schedule_id: string; source_revision: number; result_json: string }>(
              "SELECT result_plan_id, result_schedule_id, source_revision, result_json FROM starter_plan_activation_requests WHERE request_id = ?", [requestId],
            );
            if (receipt === undefined) throw new Error("phase17_matrix_activation_receipt_missing");
            const result = JSON.parse(receipt.result_json) as { outcome?: string; plan?: { revision?: number; isActive?: boolean }; schedule?: { revision?: number; lifecycle?: string } };
            expect(receipt.source_revision).toBe(template.revision);
            expect(result).toMatchObject({ outcome: "committed", plan: { id: receipt.result_plan_id, revision: 1, isActive: true }, schedule: { id: receipt.result_schedule_id, revision: 1, lifecycle: "active" } });
            const facts = { caseId, fixtureToken, actionReceiptId: requestId, activated: true };
            return { rowCount: 1, identityHash: await sha256(JSON.stringify(facts)), facts };
          }
          const eventId = caseId === "library.schedule-editor" ? `schedule-command:${requestId}` : `plan-impact-command:${requestId}`;
          const [event] = await kernel.queryAll<{ schedule_id: string; event_type: string; schedule_revision: number; payload_json: string }>(
            "SELECT schedule_id, event_type, schedule_revision, payload_json FROM owned_plan_schedule_events WHERE id = ?", [eventId],
          );
          if (event === undefined) throw new Error("phase17_matrix_impact_receipt_missing");
          const payload = JSON.parse(event.payload_json) as { result?: { outcome?: string; planId?: string; planRevision?: number; scheduleRevision?: number } };
          expect(payload.result).toMatchObject({ outcome: "committed", planId: selectors.ownedPlanId });
          const facts = { caseId, fixtureToken, actionReceiptId: requestId, committed: true };
          return { rowCount: 1, identityHash: await sha256(JSON.stringify(facts)), facts };
        },
        cleanup: async ({ caseId: cleanupCaseId, fixtureToken, selectors }) => cleanupPhase17FamilyAManifest(kernel, createPhase17FamilyACleanupManifest(cleanupCaseId, fixtureToken, {
          ownedPlanId: selectors.ownedPlanId!, customExerciseId: selectors.customExerciseId!,
        })),
        finalizeCleanup: async ({ caseId: cleanupCaseId, fixtureToken }) => envelope.clear({ caseId: cleanupCaseId, fixtureToken }),
      },
    });
    const fixture = await protocol.setup(caseId);
    expect(fixture.baselineDigest).toBe(before.digest);
    await envelope.activate({ caseId, fixtureToken: fixture.fixtureToken, envelopes: phase17ActionEnvelopePlan(caseId, fixture.fixtureToken), cleanupManifest: createPhase17FamilyACleanupManifest(caseId, fixture.fixtureToken, {
      ownedPlanId: fixture.selectors.ownedPlanId!, customExerciseId: fixture.selectors.customExerciseId!,
    }) });
    const requestId = await envelope.claim({ caseId, fixtureToken: fixture.fixtureToken, label });
    if (requestId === null) throw new Error("phase17_matrix_journey_request_missing");

    if (caseId === "library.starter-activation") {
      const result = await activateStarterFixture({ kernel, template, requestId, expectedActiveScheduleRevision: null });
      expect(result).toMatchObject({ outcome: "committed", plan: { isActive: true, revision: 1 }, schedule: { lifecycle: "active", revision: 1 } });
    } else {
      const plan = await ownedPlans.loadPlan(fixture.selectors.ownedPlanId!);
      if (plan === null || plan.scheduleDefaults === null) throw new Error("phase17_matrix_setup_plan_missing");
      if (caseId === "library.schedule-editor") {
        const schedules = createScheduleRuntimePort(kernel, ownedPlans, {
          now: () => new Date(NOW_MS), nowMs: () => NOW_MS, randomUUID: () => `phase17-schedule-${++sequence}`, sha256,
        });
        const beforeSchedule = await schedules.loadSchedule(plan.id);
        if (beforeSchedule === null || beforeSchedule.current === null) throw new Error("phase17_matrix_schedule_preview_missing");
        const saved = await schedules.saveSchedule({
          requestId,
          planId: plan.id,
          scheduleId: beforeSchedule.scheduleId,
          expectedPlanRevision: beforeSchedule.planRevision,
          expectedScheduleRevision: beforeSchedule.scheduleRevision,
          expectedActivePair: beforeSchedule.activeSchedule,
          before: beforeSchedule.current,
          todayLocalDate: beforeSchedule.todayLocalDate,
          next: { effectiveLocalDate: beforeSchedule.todayLocalDate, mode: "rotation", timeZone: "Asia/Singapore", bindings: beforeSchedule.days.map(({ id, ordinal }) => ({ planDayId: id, ordinal })) },
        });
        expect(saved).toMatchObject({ planRevision: 2, scheduleRevision: 2, current: { mode: "rotation", versionNumber: 2 } });
      } else if (caseId === "library.replacement-impact") {
        const [occurrence] = await kernel.queryAll<{ id: string }>(
          `SELECT occurrence.id
           FROM owned_plan_day_exercises occurrence
           JOIN plan_days day ON day.id = occurrence.plan_day_id
           WHERE day.plan_id = ?
           ORDER BY day.ordinal, occurrence.ordinal
           LIMIT 1`,
          [plan.id],
        );
        const occurrenceId = occurrence?.id;
        if (occurrenceId === undefined) throw new Error("phase17_matrix_replacement_occurrence_missing");
        const preview = await ownedPlans.previewExerciseReplacement({ planId: plan.id, occurrenceId });
        const replacement = preview.candidates.find(({ compatible }) => compatible);
        if (replacement === undefined) throw new Error("phase17_matrix_replacement_candidate_missing");
        const result = await ownedPlans.replaceExercise({ requestId, planId: plan.id, sourceOccurrenceId: occurrenceId, expectedPlanRevision: preview.planRevision, previewToken: preview.previewToken, scope: "all_occurrences", replacementExerciseId: replacement.exerciseId, review: { targets: true, warmups: true, rest: true, progression: true, historyImmutable: true }, occurrences: preview.occurrences });
        expect(result).toMatchObject({ outcome: "committed", planId: plan.id, planRevision: 2, replacementExerciseId: replacement.exerciseId });
      } else {
        const dayId = plan.days[0]?.id;
        if (dayId === undefined) throw new Error("phase17_matrix_day_removal_target_missing");
        const preview = await ownedPlans.previewDayRemoval({ planId: plan.id, dayId });
        if (preview.schedule === null) throw new Error("phase17_matrix_day_removal_schedule_preview_missing");
        const result = await ownedPlans.removeDayWithImpact({ requestId, planId: plan.id, dayId, expectedPlanRevision: preview.planRevision, expectedScheduleRevision: preview.schedule.revision, previewToken: preview.previewToken, choice: { kind: "remove_binding" } });
        expect(result).toMatchObject({ outcome: "committed", planId: plan.id, planRevision: 2, scheduleRevision: 2 });
      }
    }

    await expect(protocol.probe({ caseId, fixtureToken: fixture.fixtureToken, sourceTable: fixture.sourceTable })).resolves.toMatchObject({ verdict: "matched" });
    await envelope.assertConsumed({ caseId, fixtureToken: fixture.fixtureToken });
    await envelope.updateCleanupManifest({ caseId, fixtureToken: fixture.fixtureToken, cleanupManifest: await materializePhase17FamilyACleanupManifest(kernel, createPhase17FamilyACleanupManifest(caseId, fixture.fixtureToken, {
      ownedPlanId: fixture.selectors.ownedPlanId!, customExerciseId: fixture.selectors.customExerciseId!,
    })) });
    await expect(protocol.cleanup({ caseId, fixtureToken: fixture.fixtureToken })).resolves.toMatchObject({ verdict: "restored", baselineDigest: before.digest });
    await expect(kernel.queryAll("SELECT key FROM app_settings WHERE key = ?", [ENVELOPE_KEY])).resolves.toEqual([]);
    await expect(kernel.queryAll<{ value_json: string }>("SELECT value_json FROM app_settings WHERE key = ?", [SENTINEL_KEY])).resolves.toEqual([{ value_json: JSON.stringify({ preserve: true }) }]);
    expect(await logicalDigest(kernel)).toEqual(before);
  });

  it.each([
    ["library.exercise-favorites", "exercise-favorite", "favorite"],
    ["library.create-exercise", "custom-exercise-create", "create"],
    ["library.custom-exercise", "custom-exercise-archive", "archive"],
    ["library.custom-exercise-edit", "custom-exercise-edit", "edit"],
    ["library.custom-exercise-hide", "custom-exercise-hide", "hide"],
    ["library.custom-exercise-unhide", "custom-exercise-hide", "unhide"],
    ["library.custom-exercise-copy-bundled", "custom-exercise-copy", "copy"],
    ["library.custom-exercise-archive", "custom-exercise-archive", "archive"],
    ["library.custom-exercise-reactivate", "custom-exercise-reactivate", "reactivate"],
  ] as [string, string, string][])("runs schema-42/v8 %s through its labelled custom command, exact receipt, fixture probe, and cleanup", async (caseId, label, operation) => {
    const kernel = await migratedKernel();
    const [schema] = await kernel.queryAll<{ user_version: number }>("PRAGMA user_version");
    expect(schema?.user_version).toBe(42);
    await kernel.write((transaction) => transaction.execute(
      "INSERT INTO app_settings (key, value_version, value_json, revision, updated_at_ms) VALUES (?, 1, ?, 1, ?)",
      [SENTINEL_KEY, JSON.stringify({ preserve: true }), NOW_MS],
    ));
    const before = await logicalDigest(kernel);
    const customExercises = createCustomExerciseRepository(kernel);
    const suffix = `${operation}-0000000000000001`;
    const fixtureToken = `phase17:${suffix}`;
    const seedId = `phase17:custom:${suffix}`;
    const actionId = `phase17:action:${suffix}`;
    const envelope = createPhase17ActionEnvelopeSource({
      contracts: PHASE17_MATRIX_CONTRACTS,
      identity: () => ({ packageName: "com.fchoo.gymtracker.devtest", buildProfile: "development-test", nativeContractsEnabled: true, suite: "phase17" }),
      store: {
        read: async () => {
          const [setting] = await kernel.queryAll<{ value_json: string }>("SELECT value_json FROM app_settings WHERE key = ?", [ENVELOPE_KEY]);
          return setting === undefined ? null : JSON.parse(setting.value_json) as Phase17ActionEnvelopeContext;
        },
        write: async (value) => { await kernel.write((transaction) => transaction.execute(
          `INSERT INTO app_settings (key, value_version, value_json, revision, updated_at_ms)
           VALUES (?, 1, ?, 1, ?)
           ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json,
             revision = app_settings.revision + 1, updated_at_ms = excluded.updated_at_ms`,
          [ENVELOPE_KEY, JSON.stringify(value), NOW_MS],
        )); },
        clear: async (value) => { await kernel.write((transaction) => transaction.execute(
          "DELETE FROM app_settings WHERE key = ? AND value_json = ?", [ENVELOPE_KEY, JSON.stringify(value)],
        )); },
      },
    });
    const seed = async (exerciseId: string, requestId: string, name: string) => createCustomExercise({
      repository: customExercises,
      invalidate: async () => undefined,
      input: {
        requestId, exerciseId, name, aliases: ["Matrix"], exerciseType: "strength", movementClass: "compound",
        primaryMuscles: ["quadriceps"], secondaryMuscles: [], equipment: ["barbell"],
        metricIdentity: { profile: "load_reps", contractVersion: 1, exerciseMetricGeneration: 1 },
        defaultRestSeconds: 60, createdAtMs: NOW_MS,
      },
    });
    await seed(seedId, `phase17:fixture:custom-exercise-create:${suffix}:setup`, `Matrix ${caseId}`);
    if (operation === "reactivate") {
      await kernel.write((transaction) => transaction.execute(
        "UPDATE exercise_owner_preferences SET archived = 1, revision = 2, updated_at_ms = ? WHERE exercise_id = ?",
        [NOW_MS, seedId],
      ));
    }
    const manifest = createPhase17FamilyACleanupManifest(caseId, fixtureToken, { ownedPlanId: `phase17:unused-plan:${suffix}`, customExerciseId: seedId });
    await envelope.activate({ caseId, fixtureToken, envelopes: phase17ActionEnvelopePlan(caseId, fixtureToken), cleanupManifest: manifest });
    const requestId = await envelope.claim({ caseId, fixtureToken, label });
    if (requestId === null) throw new Error("phase17_matrix_custom_request_missing");
    let authoritativeId = seedId;
    if (operation === "create") {
      authoritativeId = actionId;
      await seed(actionId, requestId, `Created ${caseId}`);
    } else if (operation === "edit") {
      await editCustomExercise({ repository: customExercises, invalidate: async () => undefined, input: {
        requestId, exerciseId: seedId, expectedExerciseRevision: 1, name: `Edited ${caseId}`, aliases: ["Edited"],
        exerciseType: "strength", movementClass: "compound", primaryMuscles: ["quadriceps"], secondaryMuscles: [], equipment: ["barbell"],
        metricIdentity: { profile: "load_reps", contractVersion: 1, exerciseMetricGeneration: 1 }, defaultRestSeconds: 90, editedAtMs: NOW_MS,
      } });
    } else if (operation === "favorite") {
      await setExerciseFavorite({ repository: customExercises, invalidate: async () => undefined, input: { requestId, exerciseId: seedId, expectedPreferenceRevision: 1, favorite: true, updatedAtMs: NOW_MS } });
    } else if (operation === "hide" || operation === "unhide") {
      await setExerciseHidden({ repository: customExercises, invalidate: async () => undefined, input: { requestId, exerciseId: seedId, expectedPreferenceRevision: 1, hidden: operation === "hide", updatedAtMs: NOW_MS } });
    } else if (operation === "copy") {
      const [bundled] = await kernel.queryAll<{ id: string; revision: number }>("SELECT id, revision FROM exercises WHERE origin = 'bundled' ORDER BY id LIMIT 1");
      if (bundled === undefined) throw new Error("phase17_matrix_bundled_copy_source_missing");
      authoritativeId = actionId;
      await createCustomCopy({ repository: customExercises, invalidate: async () => undefined, input: { requestId, sourceExerciseId: bundled.id, expectedSourceRevision: bundled.revision, exerciseId: actionId, name: `Copied ${caseId}`, createdAtMs: NOW_MS } });
    } else {
      const preview = await previewCustomExerciseArchive({ repository: customExercises, input: { exerciseId: seedId, expectedExerciseRevision: 1 } });
      const command = operation === "reactivate" ? restoreCustomExercise : archiveCustomExercise;
      await command({ repository: customExercises, invalidate: async () => undefined, input: { requestId, exerciseId: seedId, expectedExerciseRevision: 1, expectedPreferenceRevision: operation === "reactivate" ? 2 : 1, previewRevision: preview.previewRevision, updatedAtMs: NOW_MS } });
    }
    const [receipt] = await kernel.queryAll<{ mutation_kind: string; result_json: string }>(
      "SELECT mutation_kind, result_json FROM custom_exercise_mutation_receipts WHERE request_id = ?", [requestId],
    );
    expect(receipt?.mutation_kind).toBe(operation === "favorite" ? "favorite" : operation === "hide" || operation === "unhide" ? "hidden" : operation === "copy" ? "copy" : operation === "create" ? "create" : operation === "edit" ? "edit" : "archive");
    expect(JSON.parse(receipt?.result_json ?? "{}" as string)).toMatchObject({ outcome: "committed" });
    const [exercise] = await kernel.queryAll<{ id: string; revision: number }>("SELECT id, revision FROM exercises WHERE id = ?", [authoritativeId]);
    const [preference] = await kernel.queryAll<{ favorite: number; hidden: number; archived: number }>("SELECT favorite, hidden, archived FROM exercise_owner_preferences WHERE exercise_id = ?", [authoritativeId]);
    expect(exercise).toBeDefined();
    expect(preference).toBeDefined();
    if (operation === "favorite") expect(preference?.favorite).toBe(1);
    if (operation === "hide") expect(preference?.hidden).toBe(1);
    if (operation === "unhide") expect(preference?.hidden).toBe(0);
    if (operation === "archive") expect(preference?.archived).toBe(1);
    if (operation === "reactivate") expect(preference?.archived).toBe(0);
    await envelope.assertConsumed({ caseId, fixtureToken });
    await envelope.updateCleanupManifest({ caseId, fixtureToken, cleanupManifest: await materializePhase17FamilyACleanupManifest(kernel, manifest) });
    await cleanupPhase17FamilyAManifest(kernel, manifest);
    await envelope.clear({ caseId, fixtureToken });
    await expect(kernel.queryAll("SELECT key FROM app_settings WHERE key = ?", [ENVELOPE_KEY])).resolves.toEqual([]);
    await expect(kernel.queryAll<{ value_json: string }>("SELECT value_json FROM app_settings WHERE key = ?", [SENTINEL_KEY])).resolves.toEqual([{ value_json: JSON.stringify({ preserve: true }) }]);
    expect(await logicalDigest(kernel)).toEqual(before);
  });

  it.each([
    ["library.copy-metric-migration", "custom-exercise-metric-migration"],
    ["library.metric-profile-migration", "custom-exercise-metric-migration"],
  ] as [string, string][])("runs schema-42/v8 %s through metric preview, confirmation, event probe, and cleanup", async (caseId, label) => {
    const kernel = await migratedKernel();
    await kernel.write((transaction) => transaction.execute(
      "INSERT INTO app_settings (key, value_version, value_json, revision, updated_at_ms) VALUES (?, 1, ?, 1, ?)",
      [SENTINEL_KEY, JSON.stringify({ preserve: true }), NOW_MS],
    ));
    const before = await logicalDigest(kernel);
    const suffix = `metric-${caseId.slice("library.".length)}-0000000000000001`;
    const fixtureToken = `phase17:${suffix}`;
    const exerciseId = `phase17:custom:${suffix}`;
    const planId = `phase17:owned-plan:${suffix}`;
    const occurrenceId = `phase17:owned-plan-occurrence:${suffix}`;
    const targetId = `phase17:owned-plan-target:${suffix}`;
    const customExercises = createCustomExerciseRepository(kernel);
    await createCustomExercise({ repository: customExercises, invalidate: async () => undefined, input: {
      requestId: `phase17:fixture:custom-exercise-create:${suffix}:setup`, exerciseId, name: `Metric ${caseId}`,
      aliases: ["Metric"], exerciseType: "strength", movementClass: "isolation", primaryMuscles: ["core"], secondaryMuscles: [], equipment: ["bodyweight"],
      metricIdentity: { profile: "timed_hold", contractVersion: 1, exerciseMetricGeneration: 1 }, defaultRestSeconds: 60, createdAtMs: NOW_MS,
    } });
    const ownedPlans = createOwnedPlanRuntimePort(kernel, {
      nowMs: () => NOW_MS,
      randomUUID: () => `phase17-metric-${suffix}`,
      sha256: async (value) => createHash("sha256").update(value).digest("hex"),
    });
    committed(await ownedPlans.createFixtureDraft({
      requestId: `phase17:fixture:owned-plan-create:${suffix}:setup`,
      planId,
      dayId: `phase17:owned-plan-day:${suffix}`,
      name: "Metric matrix",
      dayName: "Day",
    }));
    committed(await ownedPlans.savePlan({
      requestId: `phase17:fixture:owned-plan-save:${suffix}:setup`,
      expectedRevision: 1,
      plan: completePlan(planId, `phase17:owned-plan-day:${suffix}`, exerciseId, suffix, "Metric matrix"),
    }));
    await kernel.write(async (transaction) => {
      await transaction.execute(`UPDATE owned_plan_day_exercises
        SET metric_profile = 'timed_hold', metric_contract_version = 1, exercise_metric_generation = 1
        WHERE id = ?`, [occurrenceId]);
      await transaction.execute(`UPDATE owned_plan_working_set_targets
        SET target_json = '{"version":1,"profile":"timed_hold","durationSeconds":45,"perSide":false}',
            unit_json = '{"version":1,"duration":"seconds"}', metric_profile = 'timed_hold', metric_contract_version = 1, exercise_metric_generation = 1
        WHERE id = ?`, [targetId]);
    });
    const envelope = createPhase17ActionEnvelopeSource({
      contracts: PHASE17_MATRIX_CONTRACTS,
      identity: () => ({ packageName: "com.fchoo.gymtracker.devtest", buildProfile: "development-test", nativeContractsEnabled: true, suite: "phase17" }),
      store: {
        read: async () => { const [row] = await kernel.queryAll<{ value_json: string }>("SELECT value_json FROM app_settings WHERE key = ?", [ENVELOPE_KEY]); return row === undefined ? null : JSON.parse(row.value_json) as Phase17ActionEnvelopeContext; },
        write: async (value) => { await kernel.write((transaction) => transaction.execute("INSERT INTO app_settings (key, value_version, value_json, revision, updated_at_ms) VALUES (?, 1, ?, 1, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, revision = app_settings.revision + 1, updated_at_ms = excluded.updated_at_ms", [ENVELOPE_KEY, JSON.stringify(value), NOW_MS])); },
        clear: async (value) => { await kernel.write((transaction) => transaction.execute("DELETE FROM app_settings WHERE key = ? AND value_json = ?", [ENVELOPE_KEY, JSON.stringify(value)])); },
      },
    });
    const manifest = createPhase17FamilyACleanupManifest(caseId, fixtureToken, { ownedPlanId: planId, customExerciseId: exerciseId });
    await envelope.activate({ caseId, fixtureToken, envelopes: phase17ActionEnvelopePlan(caseId, fixtureToken), cleanupManifest: manifest });
    const preview = await readCustomExerciseMigration({ kernel, customExerciseRepository: customExercises }, exerciseId);
    expect(preview).toMatchObject({ exerciseId, exerciseRevision: 1, occurrences: [expect.objectContaining({ occurrenceId, targets: [expect.objectContaining({ targetId })] })] });
    const requestId = await envelope.claim({ caseId, fixtureToken, label });
    if (requestId === null) throw new Error("phase17_matrix_metric_request_missing");
    try { await migrateCustomExerciseMetricProfile({ repository: createMetricRepository(kernel), input: {
      exerciseId, expectedExerciseRevision: preview!.exerciseRevision, fromIdentity: preview!.fromIdentity,
      toIdentity: { profile: "timed_hold", contractVersion: 2, exerciseMetricGeneration: 2 },
      replacements: [{ targetId, expectedTargetRevision: 1, target: { version: 2, profile: "timed_hold", durationMs: 45_000, perSide: false }, unit: { version: 2, duration: "milliseconds" } }],
      policyDecisions: [{ planDayExerciseId: occurrenceId, expectedPolicyRevision: 1, policy: { kind: "manual_hold", version: 1 } }],
      acknowledgedHistoryImmutable: true, idempotencyKey: requestId, migratedAtMs: NOW_MS,
    } }); } catch (error) { throw new Error("phase17_matrix_metric_confirmation_failed", { cause: error }); }
    const [event] = await kernel.queryAll<{ exercise_id: string; exercise_revision: number; to_exercise_metric_generation: number; result_json: string }>(
      "SELECT exercise_id, exercise_revision, to_exercise_metric_generation, result_json FROM metric_profile_migration_events WHERE idempotency_key = ?", [requestId],
    );
    expect(event).toMatchObject({ exercise_id: exerciseId, exercise_revision: 2, to_exercise_metric_generation: 2 });
    expect(JSON.parse(event?.result_json ?? "{}")).toMatchObject({ outcome: "committed" });
    await expect(kernel.queryAll("SELECT id FROM exercises WHERE id = ? AND revision = 2 AND exercise_metric_generation = 2", [exerciseId])).resolves.toHaveLength(1);
    await envelope.assertConsumed({ caseId, fixtureToken });
    await envelope.updateCleanupManifest({ caseId, fixtureToken, cleanupManifest: await materializePhase17FamilyACleanupManifest(kernel, manifest) });
    try { await cleanupPhase17FamilyAManifest(kernel, manifest); } catch (error) { throw new Error("phase17_matrix_metric_cleanup_failed", { cause: error }); }
    await envelope.clear({ caseId, fixtureToken });
    await expect(kernel.queryAll("SELECT key FROM app_settings WHERE key = ?", [ENVELOPE_KEY])).resolves.toEqual([]);
    await expect(kernel.queryAll<{ value_json: string }>("SELECT value_json FROM app_settings WHERE key = ?", [SENTINEL_KEY])).resolves.toEqual([{ value_json: JSON.stringify({ preserve: true }) }]);
    expect(await logicalDigest(kernel)).toEqual(before);
  });
});
