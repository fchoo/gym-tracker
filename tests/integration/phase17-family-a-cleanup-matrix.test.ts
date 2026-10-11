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
import { createCustomExercise } from "../../src/domains/library/customExerciseCommands";
import type { OwnedPlanDraftInput } from "../../src/domains/plans/ownedPlanCommands";
import { createStarterPlanCopy, parseAcceptedStarterPlanPack, type AcceptedStarterPack, type AcceptedStarterTemplate } from "../../src/domains/plans/activateStarterPlan";
import { parseExerciseCatalog } from "../../src/domains/content/catalog";
import { createContentRepository } from "../../src/platform/sqlite/repositories/contentRepository";
import { createStarterPlanRepository } from "../../src/platform/sqlite/repositories/starterPlanRepository";
import { PHASE17_CASE_ACTION_CONTRACTS, PHASE17_FAMILY_A_MUTATION_RECEIPTS } from "../../src/testing/contracts/phase17LibraryRunning.contract";

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

describe("Phase 17 Family A cleanup matrix", () => {
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
      contracts: PHASE17_CASE_ACTION_CONTRACTS,
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
      contracts: PHASE17_CASE_ACTION_CONTRACTS,
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

  it.each([
    { caseId: "library.starter-detail", label: "starter-editable-copy" },
    { caseId: "library.template-update", label: "starter-template-update-copy" },
  ] as const)("runs migrated schema-42/v8 $caseId through its real inactive-copy command and cleanup", async ({ caseId, label }) => {
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
      contracts: PHASE17_CASE_ACTION_CONTRACTS,
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
});
