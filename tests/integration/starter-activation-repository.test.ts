import {
  afterEach,
  describe,
  expect,
  it,
} from "@jest/globals";
import { createHash } from "node:crypto";
import {
  DatabaseSync,
  type SQLInputValue,
} from "node:sqlite";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createOwnedPlanRuntimePort,
} from "../../src/bootstrap/ownedPlanRuntime";
import {
  createScheduleRuntimePort,
} from "../../src/bootstrap/scheduleRuntime";
import {
  activateStarterPlan,
  createStarterPlanCopy,
  createStarterPlanActivationConfirmationToken,
  parseAcceptedStarterPlanPack,
  type AcceptedStarterPack,
  type AcceptedStarterTemplate,
  type StarterPlanCopyChoice,
} from "../../src/domains/plans/activateStarterPlan";
import {
  saveOwnedPlan,
} from "../../src/domains/plans/ownedPlanCommands";
import {
  parseExerciseCatalog,
} from "../../src/domains/content/catalog";
import {
  type InitialScheduleActivationInput,
} from "../../src/domains/scheduling/activation";
import {
  acceptRecommendation,
  keepCurrentTarget,
  recordExerciseEffort,
} from "../../src/domains/progression";
import {
  finishCompleted,
  skipExercise,
} from "../../src/domains/workout/finishWorkout";
import {
  startWorkout,
} from "../../src/domains/workout/startWorkout";
import {
  completeSet,
} from "../../src/domains/workout/setCommands";
import {
  type SqliteConnection,
  type SqlitePreparedResult,
  type SqlitePreparedStatement,
  configureSqliteConnection,
} from "../../src/platform/sqlite/connection";
import {
  createMigrationRunner,
} from "../../src/platform/sqlite/migrationRunner";
import {
  migrations,
} from "../../src/platform/sqlite/migrations";
import {
  createContentRepository,
} from "../../src/platform/sqlite/repositories/contentRepository";
import {
  createOwnedPlanRepository,
} from "../../src/platform/sqlite/repositories/ownedPlanRepository";
import {
  createStarterPlanRepository,
  StarterPlanRepositoryError,
  type StarterPlanRepositoryTestObserver,
} from "../../src/platform/sqlite/repositories/starterPlanRepository";
import {
  createPlansWorkoutRepository,
} from "../../src/platform/sqlite/repositories/plansWorkoutRepository";
import {
  createWorkoutRepository,
} from "../../src/platform/sqlite/repositories/workoutRepository";
import {
  createWorkoutOutcomeRepository,
} from "../../src/platform/sqlite/repositories/workoutOutcomeRepository";
import {
  createSqliteKernel,
  type SqliteKernel,
} from "../../src/platform/sqlite/sqliteKernel";

class NodePreparedResult<Row extends Record<string, unknown>>
implements SqlitePreparedResult<Row> {
  constructor(
    readonly changes: number,
    readonly lastInsertRowId: number,
    private readonly rows: readonly Row[],
  ) {}

  async getAllAsync(): Promise<readonly Row[]> {
    return this.rows;
  }
}

class NodePreparedStatement implements SqlitePreparedStatement {
  constructor(
    private readonly statement: ReturnType<DatabaseSync["prepare"]>,
  ) {}

  async executeAsync<Row extends Record<string, unknown>>(
    parameters: readonly SQLInputValue[] = [],
  ): Promise<SqlitePreparedResult<Row>> {
    if (this.statement.columns().length > 0) {
      return new NodePreparedResult(
        0,
        0,
        this.statement.all(...parameters) as Row[],
      );
    }
    const result = this.statement.run(...parameters);
    return new NodePreparedResult(
      Number(result.changes),
      Number(result.lastInsertRowid),
      [],
    );
  }

  async finalizeAsync(): Promise<void> {}
}

class NodeSqliteConnection implements SqliteConnection {
  constructor(private readonly database: DatabaseSync) {}

  async execAsync(sql: string): Promise<void> {
    this.database.exec(sql);
  }

  async prepareAsync(sql: string): Promise<SqlitePreparedStatement> {
    return new NodePreparedStatement(this.database.prepare(sql));
  }

  async isInTransactionAsync(): Promise<boolean> {
    return this.database.isTransaction;
  }

  async closeAsync(): Promise<void> {
    this.database.close();
  }
}

const repositoryRoot = join(__dirname, "../..");
const starterPackBytes = readFileSync(
  join(repositoryRoot, "assets/content/starter-plans.v2.json"),
  "utf8",
);
const starterAcceptanceBytes = readFileSync(
  join(
    repositoryRoot,
    "artifacts/review/phase2/starter-plans-acceptance.json",
  ),
  "utf8",
);
const catalogBytes = readFileSync(
  join(repositoryRoot, "assets/content/exercise-library.v1.json"),
  "utf8",
);
const catalogManifestBytes = readFileSync(
  join(repositoryRoot, "assets/content/exercise-library.v1.manifest.json"),
  "utf8",
);
const catalogAcceptanceBytes = readFileSync(
  join(
    repositoryRoot,
    "artifacts/review/phase2/exercise-library-acceptance.json",
  ),
  "utf8",
);
const sha256 = async (value: string): Promise<string> =>
  createHash("sha256").update(value).digest("hex");

const temporaryDirectories = new Set<string>();
const runtimes: SqliteKernel[] = [];
let acceptedPackPromise: Promise<AcceptedStarterPack> | undefined;

afterEach(async () => {
  await Promise.all(runtimes.splice(0).map((runtime) => runtime.close()));
  for (const directory of temporaryDirectories) {
    rmSync(directory, { force: true, recursive: true });
  }
  temporaryDirectories.clear();
});

async function acceptedPack(): Promise<AcceptedStarterPack> {
  acceptedPackPromise ??= parseAcceptedStarterPlanPack({
    starterPackBytes,
    acceptanceBytes: starterAcceptanceBytes,
    sha256,
  });
  return acceptedPackPromise;
}

async function acceptedCatalogWithEmptyEquipment() {
  const catalog = JSON.parse(catalogBytes) as Record<string, unknown>;
  const manifest = JSON.parse(catalogManifestBytes) as Record<string, unknown>;
  const acceptance = JSON.parse(
    catalogAcceptanceBytes,
  ) as Record<string, unknown>;
  (catalog.metadata as Record<string, unknown>).revision = 2;
  const [exercise] = catalog.exercises as Array<Record<string, unknown>>;
  exercise!.equipment = [];
  const nextCatalogBytes = `${JSON.stringify(catalog, null, 2)}\n`;
  const packSha256 = await sha256(nextCatalogBytes);
  manifest.packSha256 = packSha256;
  const nextManifestBytes = `${JSON.stringify(manifest, null, 2)}\n`;
  acceptance.packSha256 = packSha256;
  acceptance.manifestSha256 = await sha256(nextManifestBytes);
  return parseExerciseCatalog({
    catalogBytes: nextCatalogBytes,
    manifestBytes: nextManifestBytes,
    acceptanceBytes: `${JSON.stringify(acceptance, null, 2)}\n`,
    sha256,
  });
}

async function createRuntime(
  options: Readonly<{ includeOwnedPlans?: boolean }> = {},
): Promise<SqliteKernel> {
  const directory = mkdtempSync(join(tmpdir(), "gym-starter-activation-"));
  temporaryDirectories.add(directory);
  const databasePath = join(directory, "gym-tracker.db");
  const fixtureDatabase = new DatabaseSync(databasePath);
  fixtureDatabase.exec(readFileSync(
    join(
      repositoryRoot,
      "tests/migrations/fixtures/v6-metric-profiles.sql",
    ),
    "utf8",
  ));
  fixtureDatabase.close();

  const writer = new NodeSqliteConnection(new DatabaseSync(databasePath));
  const reader = new NodeSqliteConnection(new DatabaseSync(databasePath));
  await configureSqliteConnection(writer, { enableWal: true });
  await configureSqliteConnection(reader, { enableWal: false });
  const kernel = createSqliteKernel({ reader, writer });
  runtimes.push(kernel);
  await createMigrationRunner({
    databaseName: "gym-tracker.db",
    kernel,
    migrations: options.includeOwnedPlans === false
      ? migrations.filter(({ version }) => version <= 8)
      : migrations,
  }).run();
  const catalog = await parseExerciseCatalog({
    catalogBytes,
    manifestBytes: catalogManifestBytes,
    acceptanceBytes: catalogAcceptanceBytes,
    sha256,
  });
  await createContentRepository(kernel).importAcceptedCatalog({
    catalog,
    expectedInstalled: null,
  });
  await kernel.write((transaction) =>
    transaction.execute(
      `UPDATE workout_sessions
       SET status = 'completed',
           completed_at_ms = COALESCE(completed_at_ms, started_at_ms),
           active_session_exercise_id = NULL,
           active_set_id = NULL
       WHERE status = 'in_progress'`,
    )
  );
  return kernel;
}

function scheduleForTemplate(
  template: AcceptedStarterTemplate,
): InitialScheduleActivationInput {
  if (template.scheduleSuggestion.mode === "rotation") {
    return {
      startLocalDate: "2026-08-24",
      timeZone: "Asia/Singapore",
      mode: "rotation",
      bindings: template.scheduleSuggestion.rotation.map(
        (planDaySourceId, ordinal) => ({
          planDaySourceId,
          ordinal,
        }),
      ),
    };
  }
  const suggestion = template.scheduleSuggestion;
  return {
    startLocalDate: "2026-08-24",
    timeZone: "Asia/Singapore",
    mode: "weekday",
    bindings: suggestion.cycleWeeks.flatMap(
      (week, weekIndex) => week.map((binding, ordinal) => ({
        planDaySourceId: binding.dayId,
        ordinal: suggestion.cycleWeeks
          .slice(0, weekIndex)
          .reduce((count: number, value) => count + value.length, 0) + ordinal,
        weekIndex,
        weekday: binding.weekday,
      })),
    ),
  };
}

async function activate(
  kernel: SqliteKernel,
  input: Readonly<{
    templateId: string;
    requestId: string;
    activatedAtMs: number;
    expectedActiveScheduleRevision: number | null;
    copyChoice?: StarterPlanCopyChoice | null;
    observer?: StarterPlanRepositoryTestObserver;
    schedule?: InitialScheduleActivationInput;
  }>,
) {
  const pack = await acceptedPack();
  const template = pack.templates.find(({ id }) => id === input.templateId)!;
  const schedule = input.schedule ?? scheduleForTemplate(template);
  const copyChoice = input.copyChoice ?? null;
  const confirmationToken = createStarterPlanActivationConfirmationToken({
    assetSha256: pack.assetSha256,
    templateId: template.id,
    templateRevision: template.revision,
    ...schedule,
    copyChoice,
  });
  return activateStarterPlan({
    kind: "accepted",
    starterPackBytes,
    acceptanceBytes: starterAcceptanceBytes,
    sha256,
    repository: createStarterPlanRepository(kernel, input.observer),
    requestId: input.requestId,
    activatedAtMs: input.activatedAtMs,
    expectedActiveScheduleRevision: input.expectedActiveScheduleRevision,
    confirmationToken,
    templateId: template.id,
    templateRevision: template.revision,
    ...schedule,
    copyChoice,
  });
}

async function prepareLegacyUpdateSource(kernel: SqliteKernel): Promise<{
  revision: number;
}> {
  await kernel.write((transaction) =>
    transaction.execute(
      `UPDATE plans
       SET source_namespace = 'gym-tracker.original'
       WHERE id = 'plan-copy'`,
    )
  );
  const [legacy] = await kernel.queryAll<{ revision: number }>(
    `SELECT revision
     FROM plans
     WHERE id = 'plan-copy'`,
  );
  return legacy!;
}

async function createInactiveCopy(
  kernel: SqliteKernel,
  input: Readonly<{
    activeScheduleRevision: number | null;
    requestId: string;
    createdAtMs: number;
    sourceOwnedPlanId?: string;
    expectedSourcePlanRevision?: number;
    templateId?: string;
    schedule?: InitialScheduleActivationInput;
  }>,
) {
  const pack = await acceptedPack();
  const template = pack.templates.find(
    ({ id }) => id === (input.templateId ?? "full-body-foundation"),
  )!;
  const legacy = input.expectedSourcePlanRevision === undefined
    ? await prepareLegacyUpdateSource(kernel)
    : null;
  return createStarterPlanCopy({
    starterPackBytes,
    acceptanceBytes: starterAcceptanceBytes,
    sha256,
    repository: createStarterPlanRepository(kernel),
    requestId: input.requestId,
    createdAtMs: input.createdAtMs,
    sourceOwnedPlanId: input.sourceOwnedPlanId ?? "plan-copy",
    expectedSourcePlanRevision:
      input.expectedSourcePlanRevision ?? legacy!.revision,
    expectedActiveScheduleRevision: input.activeScheduleRevision,
    templateId: template.id,
    templateRevision: template.revision,
    ...(input.schedule ?? scheduleForTemplate(template)),
  });
}

function repositoryError(
  action: () => Promise<unknown>,
): Promise<StarterPlanRepositoryError> {
  return action().then(
    () => {
      throw new Error("expected_starter_plan_repository_error");
    },
    (error: unknown) => {
      expect(error).toBeInstanceOf(StarterPlanRepositoryError);
      return error as StarterPlanRepositoryError;
    },
  );
}

describe("accepted starter activation repository", () => {
  it("repairs the workout projection without replacing meaningful rest", async () => {
    const kernel = await createRuntime();
    const catalog = await parseExerciseCatalog({
      catalogBytes,
      manifestBytes: catalogManifestBytes,
      acceptanceBytes: catalogAcceptanceBytes,
      sha256,
    });
    const projected = catalog.exercises[0]!;
    await kernel.write((transaction) =>
      transaction.execute(
        `UPDATE exercises
         SET source_namespace = 'stale-source',
             upstream_id = 'stale-upstream',
             name = 'Stale name',
             equipment = 'Stale equipment',
             default_rest_seconds = 0,
             revision = 0
         WHERE id = ?`,
        [projected.id],
      )
    );

    await expect(createContentRepository(kernel).importAcceptedCatalog({
      catalog,
    })).resolves.toEqual(expect.objectContaining({
      added: 0,
      updated: 0,
      newlyUnavailable: 0,
      invalidationScopes: [],
    }));
    expect(await kernel.queryAll(
      `SELECT source_namespace, upstream_id, name, equipment,
              default_rest_seconds, revision
       FROM exercises
       WHERE id = ?`,
      [projected.id],
    )).toEqual([{
      source_namespace: projected.source.namespace,
      upstream_id: projected.source.upstreamId ?? projected.id,
      name: projected.canonicalName,
      equipment: projected.equipment.join(", ") || "Unspecified",
      default_rest_seconds: 90,
      revision: catalog.metadata.revision,
    }]);

    await kernel.write((transaction) =>
      transaction.execute(
        `UPDATE exercises
         SET default_rest_seconds = 120
         WHERE id = ?`,
        [projected.id],
      )
    );
    await createContentRepository(kernel).importAcceptedCatalog({ catalog });
    expect(await kernel.queryAll(
      `SELECT default_rest_seconds
       FROM exercises
       WHERE id = ?`,
      [projected.id],
    )).toEqual([{ default_rest_seconds: 120 }]);

    const emptyEquipmentCatalog = await acceptedCatalogWithEmptyEquipment();
    await createContentRepository(kernel).importAcceptedCatalog({
      catalog: emptyEquipmentCatalog,
      expectedInstalled: {
        revision: catalog.metadata.revision,
        packSha256: catalog.acceptance.packSha256,
      },
    });
    expect(await kernel.queryAll(
      `SELECT equipment, default_rest_seconds, revision
       FROM exercises
       WHERE id = ?`,
      [projected.id],
    )).toEqual([{
      equipment: "Unspecified",
      default_rest_seconds: 120,
      revision: emptyEquipmentCatalog.metadata.revision,
    }]);
  });

  it("fails closed when the workout projection metric identity drifts", async () => {
    const kernel = await createRuntime();
    const catalog = await parseExerciseCatalog({
      catalogBytes,
      manifestBytes: catalogManifestBytes,
      acceptanceBytes: catalogAcceptanceBytes,
      sha256,
    });
    await expect(createContentRepository(kernel).importAcceptedCatalog({
      catalog,
    })).resolves.toEqual(expect.objectContaining({
      added: 0,
      updated: 0,
      newlyUnavailable: 0,
      invalidationScopes: [],
    }));
    const projected = catalog.exercises[0]!;
    await kernel.write((transaction) =>
      transaction.execute(
        `UPDATE exercises
         SET metric_profile = 'unscored'
         WHERE id = ?`,
        [projected.id],
      )
    );
    const before = await kernel.queryAll(
      `SELECT id, origin, metric_profile, metric_contract_version,
              exercise_metric_generation
       FROM exercises
       WHERE id = ?`,
      [projected.id],
    );

    await expect(createContentRepository(kernel).importAcceptedCatalog({
      catalog,
    })).rejects.toMatchObject({ code: "sqlite_transaction_failed" });
    expect(await kernel.queryAll(
      `SELECT id, origin, metric_profile, metric_contract_version,
              exercise_metric_generation
       FROM exercises
       WHERE id = ?`,
      [projected.id],
    )).toEqual(before);
  });

  it("starts Full Body A from the accepted owned graph", async () => {
    const kernel = await createRuntime();
    const activation = await activate(kernel, {
      templateId: "full-body-foundation",
      requestId: "request-full-body-workout",
      activatedAtMs: 1_787_027_200_000,
      expectedActiveScheduleRevision: null,
    });

    const session = await startWorkout({
      repository: createPlansWorkoutRepository(kernel),
      request: {
        mode: "alternate",
        planId: activation.plan.id,
        planDayId: activation.days[0]!.id,
        localDate: "2026-08-19",
        timezone: "Asia/Singapore",
        startedAtMs: 1_787_027_201_000,
      },
    });
    const workout = await createWorkoutRepository(kernel)
      .getActiveWorkout(session.id);

    expect(workout.currentExercise.name).toBe("Back Squat");
    expect(workout.currentExercise.metricIdentity).toEqual({
      profile: "load_reps",
      contractVersion: 1,
      exerciseMetricGeneration: 1,
    });
    expect(workout.currentExercise.workingSets).toHaveLength(3);
    expect(workout.currentExercise.workingSets[0]?.target).toEqual(
      expect.objectContaining({
        profile: "load_reps",
        loadGrams: 60_000,
        minReps: 6,
        maxReps: 8,
      }),
    );
  });

  it("preserves accepted between-exercise rest in owned workout snapshots", async () => {
    const kernel = await createRuntime();
    const activation = await activate(kernel, {
      templateId: "full-body-foundation",
      requestId: "request-full-body-rest",
      activatedAtMs: 1_787_027_200_000,
      expectedActiveScheduleRevision: null,
    });
    const session = await startWorkout({
      repository: createPlansWorkoutRepository(kernel),
      request: {
        mode: "alternate",
        planId: activation.plan.id,
        planDayId: activation.days[0]!.id,
        localDate: "2026-08-19",
        timezone: "Asia/Singapore",
        startedAtMs: 1_787_027_201_000,
      },
    });
    const repository = createWorkoutRepository(kernel);
    let workout = await repository.getActiveWorkout(session.id);

    for (let ordinal = 0; ordinal < 3; ordinal += 1) {
      const set = workout.currentExercise.workingSets[ordinal]!;
      const completedAtMs = 1_787_027_202_000 + ordinal * 1_000;
      const result = await completeSet({
        repository,
        haptics: { committed: async () => undefined },
        invalidate: async () => undefined,
        drainEffects: async () => undefined,
        input: {
          sessionId: session.id,
          setId: set.id,
          expectedSessionRevision: workout.revision,
          expectedSetRevision: set.revision,
          completionIdempotencyKey: `complete-owned-squat-${ordinal}`,
          metricIdentity: set.metricIdentity,
          observation: {
            version: 1,
            profile: "load_reps",
            loadGrams: 60_000,
            reps: 8,
            source: "plan_default",
          },
          completedAtMs,
        },
      });
      workout = result.view;
    }

    expect(workout.currentExercise.name).toBe("Bench Press");
    expect(workout.rest).toEqual({
      version: 1,
      state: "running",
      revision: 3,
      startedAtMs: 1_787_027_204_000,
      endsAtMs: 1_787_027_384_000,
      nextSetId: workout.currentExercise.workingSets[0]!.id,
    });
  });

  it("generates and accepts recommendations against owned targets", async () => {
    const kernel = await createRuntime();
    const activation = await activate(kernel, {
      templateId: "full-body-foundation",
      requestId: "request-full-body-recommendation",
      activatedAtMs: 1_787_027_200_000,
      expectedActiveScheduleRevision: null,
    });
    const legacyTargetsBefore = await kernel.queryAll(
      `SELECT *
       FROM plan_working_set_targets
       ORDER BY id`,
    );
    const session = await startWorkout({
      repository: createPlansWorkoutRepository(kernel),
      request: {
        mode: "alternate",
        planId: activation.plan.id,
        planDayId: activation.days[0]!.id,
        localDate: "2026-08-19",
        timezone: "Asia/Singapore",
        startedAtMs: 1_787_027_201_000,
      },
    });
    const workoutRepository = createWorkoutRepository(kernel);
    const outcomeRepository = createWorkoutOutcomeRepository(kernel);
    let workout = await workoutRepository.getActiveWorkout(session.id);

    for (const [ordinal, reps] of [8, 8, 7].entries()) {
      const set = workout.currentExercise.workingSets[ordinal]!;
      const result = await completeSet({
        repository: workoutRepository,
        haptics: { committed: async () => undefined },
        invalidate: async () => undefined,
        drainEffects: async () => undefined,
        input: {
          sessionId: session.id,
          setId: set.id,
          expectedSessionRevision: workout.revision,
          expectedSetRevision: set.revision,
          completionIdempotencyKey: `complete-recommend-squat-${ordinal}`,
          metricIdentity: set.metricIdentity,
          observation: {
            version: 1,
            profile: "load_reps",
            loadGrams: 60_000,
            reps,
            source: "manual",
          },
          completedAtMs: 1_787_027_202_000 + ordinal * 1_000,
        },
      });
      workout = result.view;
    }
    for (let index = 0; index < 4; index += 1) {
      const exercise = workout.currentExercise;
      await skipExercise({
        repository: outcomeRepository,
        input: {
          sessionId: session.id,
          sessionExerciseId: exercise.id,
          expectedSessionRevision: workout.revision,
          expectedExerciseRevision: exercise.revision,
          confirmation: "skip_exercise",
          nowMs: 1_787_027_210_000 + index,
        },
      });
      workout = await workoutRepository.getActiveWorkout(session.id);
    }
    const finished = await finishCompleted({
      repository: outcomeRepository,
      input: {
        sessionId: session.id,
        expectedSessionRevision: workout.revision,
        endedAtMs: 1_787_027_220_000,
      },
    });
    const squat = finished.detail.exercises.find(
      ({ name }) => name === "Back Squat",
    )!;
    await recordExerciseEffort({
      repository: outcomeRepository,
      input: {
        sessionId: session.id,
        sessionExerciseId: squat.id,
        expectedExerciseRevision: squat.revision,
        effort: "on_target",
        recordedAtMs: 1_787_027_221_000,
      },
    });
    const revision = await outcomeRepository.currentSessionRevision(session.id);
    expect(revision).not.toBeNull();
    await expect(outcomeRepository.generateRecommendationsForSession(
      session.id,
      revision!,
      1_787_027_222_000,
    )).resolves.toBe(1);
    await expect(outcomeRepository.generateRecommendationsForSession(
      session.id,
      revision!,
      1_787_027_222_500,
    )).resolves.toBe(1);
    await expect(kernel.queryAll(
      `SELECT COUNT(*) AS count
       FROM owned_progression_recommendations
       WHERE json_extract(evidence_json, '$.source.sessionId') = ?`,
      [session.id],
    )).resolves.toEqual([{ count: 1 }]);

    const detail = await outcomeRepository.getSessionDetail(session.id);
    expect(detail.recommendations).toContainEqual(expect.objectContaining({
      exerciseName: "Back Squat",
      decision: "hold",
      currentLoadGrams: 60_000,
      proposedLoadGrams: 60_000,
      comparableReps: [8, 8, 7],
      proposedTargetReps: [8, 8, 8],
      status: "pending",
    }));
    const recommendation = detail.recommendations[0]!;
    const nextSession = await startWorkout({
      repository: createPlansWorkoutRepository(kernel),
      request: {
        mode: "alternate",
        planId: activation.plan.id,
        planDayId: activation.days[0]!.id,
        localDate: "2026-08-20",
        timezone: "Asia/Singapore",
        startedAtMs: 1_787_113_600_000,
      },
    });
    const nextWorkout = await workoutRepository.getActiveWorkout(
      nextSession.id,
    );
    expect(nextWorkout.currentExercise.workingSets[0]!.valueSources[0])
      .toEqual({
        source: "recommended",
        observation: {
          version: 1,
          profile: "load_reps",
          loadGrams: 60_000,
          reps: 8,
          source: "recommended",
        },
      });
    await expect(acceptRecommendation({
      repository: outcomeRepository,
      input: {
        recommendationId: recommendation.id,
        decidedAtMs: 1_787_027_223_000,
      },
    })).resolves.toEqual({
      recommendationId: recommendation.id,
      status: "accepted",
    });
    await expect(kernel.queryAll<{
      target_json: string;
      revision: number;
    }>(
      `SELECT target.target_json, target.revision
       FROM owned_plan_working_set_targets target
       JOIN owned_plan_day_exercises occurrence
         ON occurrence.id = target.plan_day_exercise_id
       WHERE occurrence.plan_day_id = ?
         AND occurrence.ordinal = 0
       ORDER BY target.ordinal`,
      [activation.days[0]!.id],
    )).resolves.toEqual(Array.from({ length: 3 }, () => ({
      target_json: expect.stringContaining('"targetReps":[8,8,8]'),
      revision: 2,
    })));
    const todayMs = Date.UTC(2026, 7, 24, 4);
    let runtimeId = 0;
    const ownedPlans = createOwnedPlanRuntimePort(kernel, {
      nowMs: () => todayMs,
      randomUUID: () => `owned-runtime-${++runtimeId}`,
      sha256,
    });
    const schedule = createScheduleRuntimePort(kernel, ownedPlans, {
      now: () => new Date(todayMs),
      nowMs: () => todayMs,
      randomUUID: () => `schedule-runtime-${++runtimeId}`,
      sha256,
    });
    const today = await schedule.loadToday(todayMs);
    expect(today?.view.state).toBe("scheduled");
    if (today?.view.state !== "scheduled") {
      throw new Error("scheduled_today_expected");
    }
    expect(today.view.exercises).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: "Back Squat",
        nextTarget: "60 kg × 8",
      }),
    ]));
    await expect(kernel.queryAll(
      `SELECT *
       FROM plan_working_set_targets
       ORDER BY id`,
    )).resolves.toEqual(legacyTargetsBefore);
  });

  it("invalidates owned suggestions when the owner saves future targets", async () => {
    const kernel = await createRuntime();
    const activation = await activate(kernel, {
      templateId: "full-body-foundation",
      requestId: "request-full-body-owner-save",
      activatedAtMs: 1_787_027_200_000,
      expectedActiveScheduleRevision: null,
    });
    const repository = createOwnedPlanRepository(kernel);
    const plan = await repository.read(activation.plan.id);
    expect(plan).not.toBeNull();
    const occurrence = plan!.days[0]!.occurrences[0]!;
    const target = occurrence.targets[0]!;
    await kernel.write((transaction) =>
      transaction.execute(
        `INSERT INTO owned_progression_recommendations
          (id, exercise_id, owned_plan_working_set_target_id, rule_type,
           rule_version, evidence_version, evidence_json,
           current_target_json, proposed_target_json, metric_profile,
           metric_contract_version, exercise_metric_generation, status,
           source_revision, target_revision, created_at_ms, decided_at_ms)
         VALUES (
           'owned-owner-save-recommendation', ?, ?, 'load_reps', 1, 1, '{}',
           ?, ?, 'load_reps', 1, 1, 'pending', 1, 1, 1000, NULL
         )`,
        [
          occurrence.exerciseId,
          target.id,
          JSON.stringify(target.target),
          JSON.stringify(target.target),
        ],
      )
    );

    const saved = await saveOwnedPlan({
      repository,
      sha256,
      invalidate: async () => undefined,
      input: {
        requestId: "save-owned-future-target",
        expectedRevision: plan!.revision,
        savedAtMs: 1_787_027_224_000,
        plan: {
          id: plan!.id,
          name: plan!.name,
          days: plan!.days.map((day) => ({
            ...day,
            occurrences: day.occurrences.map((entry) => ({
              ...entry,
              targets: entry.targets.map((entryTarget) => ({
                ...entryTarget,
                target: entryTarget.id === target.id
                  ? { ...entryTarget.target, loadGrams: 61_000 }
                  : entryTarget.target,
              })),
            })),
          })),
        },
      },
    });
    expect(saved).toMatchObject({ outcome: "committed" });
    await expect(kernel.queryAll(
      `SELECT status, decided_at_ms
       FROM owned_progression_recommendations
       WHERE id = 'owned-owner-save-recommendation'`,
    )).resolves.toEqual([{
      decided_at_ms: 1_787_027_224_000,
      status: "invalidated",
    }]);
  });

  it("keeps or supersedes owned suggestions without mutating stale targets", async () => {
    const kernel = await createRuntime();
    const activation = await activate(kernel, {
      templateId: "full-body-foundation",
      requestId: "request-full-body-owned-decisions",
      activatedAtMs: 1_787_027_200_000,
      expectedActiveScheduleRevision: null,
    });
    const [first, second] = await kernel.queryAll<{
      exercise_id: string;
      occurrence_id: string;
      target_id: string;
      target_json: string;
      revision: number;
    }>(
      `SELECT occurrence.exercise_id,
              occurrence.id AS occurrence_id,
              target.id AS target_id,
              target.target_json,
              target.revision
       FROM owned_plan_day_exercises occurrence
       JOIN owned_plan_working_set_targets target
         ON target.plan_day_exercise_id = occurrence.id
       WHERE occurrence.plan_day_id = ?
         AND target.ordinal = 0
       ORDER BY occurrence.ordinal`,
      [activation.days[0]!.id],
    );
    const repository = createWorkoutOutcomeRepository(kernel);
    const insertRecommendation = async (
      id: string,
      exerciseId: string,
    ) => {
      await kernel.write((transaction) =>
        transaction.execute(
          `INSERT INTO owned_progression_recommendations
            (id, exercise_id, owned_plan_working_set_target_id, rule_type,
             rule_version, evidence_version, evidence_json,
             current_target_json, proposed_target_json, metric_profile,
             metric_contract_version, exercise_metric_generation, status,
             source_revision, target_revision, created_at_ms, decided_at_ms)
           VALUES (
             ?, ?, ?, 'load_reps', 1, 1, '{}', ?,
             json_set(?, '$.targetReps', json_array(8, 8, 8)),
             'load_reps', 1, 1, 'pending', ?, ?, 1000, NULL
           )`,
          [
            id,
            exerciseId,
            first!.target_id,
            first!.target_json,
            first!.target_json,
            first!.revision,
            first!.revision,
          ],
        )
      );
    };
    const targetBefore = await kernel.queryAll(
      `SELECT * FROM owned_plan_working_set_targets WHERE id = ?`,
      [first!.target_id],
    );

    await insertRecommendation("owned-keep-current", first!.exercise_id);
    await expect(keepCurrentTarget({
      repository,
      input: {
        recommendationId: "owned-keep-current",
        decidedAtMs: 2_000,
      },
    })).resolves.toEqual({
      recommendationId: "owned-keep-current",
      status: "rejected",
    });
    await expect(kernel.queryAll(
      `SELECT * FROM owned_plan_working_set_targets WHERE id = ?`,
      [first!.target_id],
    )).resolves.toEqual(targetBefore);

    await insertRecommendation("owned-stale-identity", first!.exercise_id);
    await kernel.write((transaction) =>
      transaction.execute(
        `UPDATE owned_plan_day_exercises
         SET exercise_id = ?, revision = revision + 1
         WHERE id = ?`,
        [second!.exercise_id, first!.occurrence_id],
      )
    );
    await expect(acceptRecommendation({
      repository,
      input: {
        recommendationId: "owned-stale-identity",
        decidedAtMs: 3_000,
      },
    })).resolves.toEqual({
      recommendationId: "owned-stale-identity",
      status: "superseded",
    });
    await expect(kernel.queryAll(
      `SELECT * FROM owned_plan_working_set_targets WHERE id = ?`,
      [first!.target_id],
    )).resolves.toEqual(targetBefore);
  });

  it.each([
    "full-body-foundation",
    "upper-lower",
    "push-pull-legs",
    "minimal-equipment-full-body",
    "strength-conditioning",
    "gym-body-part-split",
  ])("clones the complete accepted %s graph into fresh owned IDs", async (
    templateId,
  ) => {
    const kernel = await createRuntime();
    const pack = await acceptedPack();
    const template = pack.templates.find(({ id }) => id === templateId)!;
    const result = await activate(kernel, {
      templateId,
      requestId: `request-${templateId}`,
      activatedAtMs: 1_787_027_200_000,
      expectedActiveScheduleRevision: null,
    });

    expect(result.days).toHaveLength(template.days.length);
    expect(result.days.map(({ occurrenceCount }) => occurrenceCount)).toEqual(
      template.days.map(({ exercises }) => exercises.length),
    );
    expect(result.days.map(({ sourceDayId }) => sourceDayId)).toEqual(
      template.days.map(({ id }) => id),
    );
    expect(result.days.map(({ id }) => id)).not.toEqual(
      template.days.map(({ id }) => id),
    );
    const [counts] = await kernel.queryAll<{
      days: number;
      occurrences: number;
      targets: number;
      policies: number;
    }>(
      `SELECT
         (SELECT COUNT(*) FROM plan_days WHERE plan_id = ?) AS days,
         (SELECT COUNT(*)
          FROM owned_plan_day_exercises occurrence
          JOIN plan_days day ON day.id = occurrence.plan_day_id
          WHERE day.plan_id = ?) AS occurrences,
         (SELECT COUNT(*)
          FROM owned_plan_working_set_targets target
          JOIN owned_plan_day_exercises occurrence
            ON occurrence.id = target.plan_day_exercise_id
          JOIN plan_days day ON day.id = occurrence.plan_day_id
          WHERE day.plan_id = ?) AS targets,
         (SELECT COUNT(*)
          FROM owned_plan_progression_policies policy
          JOIN owned_plan_day_exercises occurrence
            ON occurrence.id = policy.plan_day_exercise_id
          JOIN plan_days day ON day.id = occurrence.plan_day_id
          WHERE day.plan_id = ?) AS policies`,
      [result.plan.id, result.plan.id, result.plan.id, result.plan.id],
    );
    expect(counts).toEqual({
      days: template.days.length,
      occurrences: template.days.reduce(
        (count, day) => count + day.exercises.length,
        0,
      ),
      targets: template.days.reduce(
        (count, day) => count + day.exercises.reduce(
          (dayCount, exercise) => dayCount + exercise.target.plannedSets,
          0,
        ),
        0,
      ),
      policies: template.days.reduce(
        (count, day) => count + day.exercises.length,
        0,
      ),
    });
    await expect(kernel.queryAll(
      `SELECT COUNT(*) AS count
       FROM owned_plan_schedules
       WHERE lifecycle = 'active'`,
    )).resolves.toEqual([{ count: 1 }]);
    expect(result.invalidationScopes).toEqual([
      { scope: "library-plans" },
      { scope: "plan-detail", planId: result.plan.id },
      { scope: "today" },
    ]);
  });

  it("proves D-55 clones five ordered weekday days and 20 weighted occurrences", async () => {
    const kernel = await createRuntime();
    const result = await activate(kernel, {
      templateId: "gym-body-part-split",
      requestId: "request-d55",
      activatedAtMs: 1_787_027_200_000,
      expectedActiveScheduleRevision: null,
    });

    expect(result.days.map(({ name }) => name)).toEqual([
      "Chest",
      "Back",
      "Shoulders",
      "Legs",
      "Arms",
    ]);
    expect(result.schedule.version.mode).toBe("weekday");
    expect(result.schedule.version.bindings.map((binding) => [
      "weekday" in binding ? binding.weekday : null,
      binding.sourcePlanDayId,
    ])).toEqual([
      ["Monday", "body-part-chest"],
      ["Tuesday", "body-part-back"],
      ["Wednesday", "body-part-shoulders"],
      ["Thursday", "body-part-legs"],
      ["Friday", "body-part-arms"],
    ]);
    const occurrences = await kernel.queryAll<{
      occurrence_id: string;
      source_occurrence_id: string;
      day_name: string;
      day_ordinal: number;
      occurrence_ordinal: number;
      metric_profile: string;
      target_json: string;
    }>(
      `SELECT occurrence.id AS occurrence_id,
              json_extract(source.template_json,
                '$.days[' || day.ordinal || '].exercises['
                || occurrence.ordinal || '].id') AS source_occurrence_id,
              day.name AS day_name, day.ordinal AS day_ordinal,
              occurrence.ordinal AS occurrence_ordinal,
              occurrence.metric_profile, target.target_json
       FROM plan_days day
       JOIN owned_plan_day_exercises occurrence
         ON occurrence.plan_day_id = day.id
       JOIN owned_plan_working_set_targets target
         ON target.plan_day_exercise_id = occurrence.id
        AND target.ordinal = 0
       JOIN owned_plan_starter_sources owned_source
         ON owned_source.plan_id = day.plan_id
       JOIN starter_plan_sources source
         ON source.source_namespace = owned_source.source_namespace
        AND source.template_id = owned_source.template_id
        AND source.source_revision = owned_source.source_revision
       WHERE day.plan_id = ?
       ORDER BY day.ordinal, occurrence.ordinal`,
      [result.plan.id],
    );
    expect(occurrences).toHaveLength(20);
    expect(new Set(occurrences.map(({ occurrence_id }) => occurrence_id)).size)
      .toBe(20);
    expect(occurrences.every(({ occurrence_id, source_occurrence_id }) =>
      occurrence_id !== source_occurrence_id
    )).toBe(true);
    expect(occurrences.every(({ metric_profile, target_json }) =>
      metric_profile === "load_reps"
      && JSON.parse(target_json).profile === "load_reps"
    )).toBe(true);
    expect(occurrences.map(({ day_name }) => day_name)).toEqual([
      ...Array.from({ length: 4 }, () => "Chest"),
      ...Array.from({ length: 4 }, () => "Back"),
      ...Array.from({ length: 4 }, () => "Shoulders"),
      ...Array.from({ length: 4 }, () => "Legs"),
      ...Array.from({ length: 4 }, () => "Arms"),
    ]);
  });

  it("keeps copied non-load policies factual and never creates pending target writes", async () => {
    const kernel = await createRuntime();
    const activation = await activate(kernel, {
      templateId: "strength-conditioning",
      requestId: "request-non-load-progression",
      activatedAtMs: 1_787_027_200_000,
      expectedActiveScheduleRevision: null,
    });
    const plans = createPlansWorkoutRepository(kernel);
    const session = await startWorkout({
      repository: plans,
      request: {
        mode: "scheduled",
        planId: activation.plan.id,
        planDayId: activation.days.find(
          ({ sourceDayId }) => sourceDayId === "conditioning",
        )!.id,
        localDate: "2026-08-24",
        timezone: "Asia/Singapore",
        startedAtMs: 1_787_027_300_000,
      },
    });

    const exerciseRows = await kernel.queryAll<Readonly<{
      id: string;
      metric_profile: string;
      set_id: string;
      metric_contract_version: number;
      exercise_metric_generation: number;
    }>>(
      `SELECT exercise.id, exercise.metric_profile, set_row.id AS set_id,
              exercise.metric_contract_version,
              exercise.exercise_metric_generation
       FROM session_exercises exercise
       JOIN session_sets set_row ON set_row.session_exercise_id = exercise.id
       WHERE exercise.session_id = ?
         AND set_row.set_kind = 'working'
         AND exercise.metric_profile IN (
           'fixed_distance',
           'fixed_time',
           'intervals'
         )
       ORDER BY exercise.ordinal`,
      [session.id],
    );
    const workout = createWorkoutRepository(kernel);
    let view = await workout.getActiveWorkout(session.id);
    for (const row of exerciseRows) {
      const exercise = view.exercises.find(({ id }) => id === row.id)!;
      const set = exercise.workingSets[0]!;
      const observation = (() => {
        switch (set.metricIdentity.profile) {
          case "fixed_distance":
            return {
              version: 1 as const,
              profile: "fixed_distance" as const,
              distanceMeters: 200,
              durationMs: 72_000,
              source: "manual" as const,
            };
          case "fixed_time":
            return {
              version: 1 as const,
              profile: "fixed_time" as const,
              durationMs: 720_000,
              distanceMeters: 2_400,
              source: "manual" as const,
            };
          case "intervals":
            return {
              version: 1 as const,
              profile: "intervals" as const,
              protocolId: "battling-ropes-30s-30s-8r-v1",
              completedRounds: 8,
              completedWorkMs: 240_000,
              source: "manual" as const,
            };
          default:
            throw new Error("non_load_fixture_profile_unexpected");
        }
      })();
      view = await completeSet({
        repository: workout,
        haptics: { committed: async () => undefined },
        invalidate: async () => undefined,
        drainEffects: async () => undefined,
        input: {
          sessionId: session.id,
          setId: set.id,
          expectedSessionRevision: view.revision,
          expectedSetRevision: set.revision,
          completionIdempotencyKey: `non-load-${row.metric_profile}`,
          metricIdentity: set.metricIdentity,
          observation,
          completedAtMs: 1_787_027_301_000 + view.revision,
        },
      }).then(({ view: next }) => next);
    }

    await kernel.write(async (transaction) => {
      await transaction.execute(
        `UPDATE session_exercises
         SET status = CASE
           WHEN metric_profile IN ('fixed_distance', 'fixed_time', 'intervals')
             THEN 'completed'
           ELSE 'skipped'
         END,
         revision = revision + 1
         WHERE session_id = ?`,
        [session.id],
      );
      await transaction.execute(
        `UPDATE session_sets
         SET status = 'skipped', revision = revision + 1
         WHERE session_exercise_id IN (
           SELECT id
           FROM session_exercises
           WHERE session_id = ?
             AND metric_profile NOT IN (
               'fixed_distance',
               'fixed_time',
               'intervals'
             )
         )
           AND status IN ('planned', 'draft')`,
        [session.id],
      );
    });
    const beforeFinish = await workout.getActiveWorkout(session.id);
    const outcome = createWorkoutOutcomeRepository(kernel);
    const finished = await finishCompleted({
      repository: outcome,
      input: {
        sessionId: session.id,
        expectedSessionRevision: beforeFinish.revision,
        endedAtMs: 1_787_027_400_000,
      },
    });

    const firstDetail = await outcome.getSessionDetail(session.id);
    const secondDetail = await outcome.getSessionDetail(session.id);
    expect(secondDetail.nonLoadOutcomes).toEqual(firstDetail.nonLoadOutcomes);
    expect(firstDetail.nonLoadOutcomes).toEqual([
      expect.objectContaining({
        profile: "fixed_distance",
        decision: "hold",
        reasonCode: "plan_authored_fixed_target_reviewed",
        rule: {
          kind: "plan_authored",
          id: "fixed_distance.plan_authored.v1",
          version: 1,
        },
        source: expect.objectContaining({
          sessionId: session.id,
          effectiveRevision: firstDetail.revision,
        }),
      }),
      expect.objectContaining({
        profile: "fixed_time",
        decision: "hold",
        reasonCode: "plan_authored_fixed_target_reviewed",
        rule: {
          kind: "plan_authored",
          id: "fixed_time.plan_authored.v1",
          version: 1,
        },
      }),
      expect.objectContaining({
        profile: "intervals",
        decision: "hold",
        reasonCode: "plan_authored_fixed_target_reviewed",
        rule: {
          kind: "plan_authored",
          id: "intervals.plan_authored.v1",
          version: 1,
        },
      }),
    ]);
    expect(firstDetail.nonLoadOutcomes.every((outcomeRow) =>
      outcomeRow.review.actionable === false
      && outcomeRow.proposedTarget === null
      && outcomeRow.source.setIds.length === 1
    )).toBe(true);

    await expect(outcome.generateRecommendationsForSession(
      session.id,
      finished.detail.revision,
      1_787_027_500_000,
    )).resolves.toBe(0);
    await expect(kernel.queryAll<{ count: number }>(
      `SELECT COUNT(*) AS count
       FROM owned_progression_recommendations
       WHERE json_extract(evidence_json, '$.sessionId') = ?`,
      [session.id],
    )).resolves.toEqual([{ count: 0 }]);
    await expect(kernel.queryAll<{ target_json: string }>(
      `SELECT target.target_json
       FROM owned_plan_working_set_targets target
       JOIN session_sets set_row
         ON set_row.source_owned_plan_working_set_target_id = target.id
       JOIN session_exercises exercise
         ON exercise.id = set_row.session_exercise_id
       WHERE set_row.session_exercise_id IN (
         SELECT id FROM session_exercises WHERE session_id = ?
       )
         AND exercise.metric_profile IN (
           'fixed_distance',
           'fixed_time',
           'intervals'
         )
       ORDER BY exercise.metric_profile`,
      [session.id],
    )).resolves.toEqual([
      expect.objectContaining({
        target_json: expect.stringContaining('"plannedDistanceMeters":200'),
      }),
      expect.objectContaining({
        target_json: expect.stringContaining('"plannedDurationMs":720000'),
      }),
      expect.objectContaining({
        target_json: expect.stringContaining("battling-ropes-30s-30s-8r-v1"),
      }),
    ]);
  });

  it("does not apply load/reps progression for a manual or malformed copied policy", async () => {
    const kernel = await createRuntime();
    const activation = await activate(kernel, {
      templateId: "minimal-equipment-full-body",
      requestId: "request-manual-load-hold",
      activatedAtMs: 1_787_027_600_000,
      expectedActiveScheduleRevision: null,
    });
    const plans = createPlansWorkoutRepository(kernel);
    const session = await startWorkout({
      repository: plans,
      request: {
        mode: "scheduled",
        planId: activation.plan.id,
        planDayId: activation.days.find(
          ({ sourceDayId }) => sourceDayId === "minimal-a",
        )!.id,
        localDate: "2026-08-24",
        timezone: "Asia/Singapore",
        startedAtMs: 1_787_027_601_000,
      },
    });

    await kernel.write(async (transaction) => {
      await transaction.execute(
        `UPDATE session_sets
         SET status = CASE
           WHEN session_exercise_id IN (
             SELECT exercise.id
             FROM session_exercises exercise
             WHERE exercise.session_id = ?
               AND exercise.exercise_name = 'Band Pull Apart'
           ) THEN 'completed'
           ELSE 'skipped'
         END,
         observed_load_grams = CASE
           WHEN session_exercise_id IN (
             SELECT exercise.id
             FROM session_exercises exercise
             WHERE exercise.session_id = ?
               AND exercise.exercise_name = 'Band Pull Apart'
           ) THEN 2000
           ELSE NULL
         END,
         observed_reps = CASE
           WHEN session_exercise_id IN (
             SELECT exercise.id
             FROM session_exercises exercise
             WHERE exercise.session_id = ?
               AND exercise.exercise_name = 'Band Pull Apart'
           ) THEN 20
           ELSE NULL
         END,
         observed_json = CASE
           WHEN session_exercise_id IN (
             SELECT exercise.id
             FROM session_exercises exercise
             WHERE exercise.session_id = ?
               AND exercise.exercise_name = 'Band Pull Apart'
           ) THEN ?
           ELSE NULL
         END,
         completed_at_ms = CASE
           WHEN session_exercise_id IN (
             SELECT exercise.id
             FROM session_exercises exercise
             WHERE exercise.session_id = ?
               AND exercise.exercise_name = 'Band Pull Apart'
           ) THEN 1_787_027_602_000
           ELSE NULL
         END,
         revision = revision + 1
         WHERE session_exercise_id IN (
           SELECT id FROM session_exercises WHERE session_id = ?
         )`,
        [
          session.id,
          session.id,
          session.id,
          session.id,
          JSON.stringify({
            version: 1,
            profile: "load_reps",
            loadGrams: 2_000,
            reps: 20,
            source: "manual",
          }),
          session.id,
          session.id,
        ],
      );
      await transaction.execute(
        `UPDATE session_exercises
         SET status = CASE
           WHEN exercise_name = 'Band Pull Apart' THEN 'completed'
           ELSE 'skipped'
         END,
         revision = revision + 1
         WHERE session_id = ?`,
        [session.id],
      );
    });

    const workout = createWorkoutRepository(kernel);
    const beforeFinish = await workout.getActiveWorkout(session.id);
    const outcome = createWorkoutOutcomeRepository(kernel);
    const finished = await finishCompleted({
      repository: outcome,
      input: {
        sessionId: session.id,
        expectedSessionRevision: beforeFinish.revision,
        endedAtMs: 1_787_027_603_000,
      },
    });

    await expect(outcome.generateRecommendationsForSession(
      session.id,
      finished.detail.revision,
      1_787_027_604_000,
    )).resolves.toBe(0);
    await kernel.write(async (transaction) => {
      await transaction.execute(
        `UPDATE owned_plan_progression_policies
         SET policy_kind = 'automatic',
             policy_id = 'load_reps.double_progression.v1',
             policy_version = 1,
             rule_json = ?
         WHERE plan_day_exercise_id = (
           SELECT target.plan_day_exercise_id
           FROM owned_plan_working_set_targets target
           JOIN session_sets set_row
             ON set_row.source_owned_plan_working_set_target_id = target.id
           JOIN session_exercises exercise
             ON exercise.id = set_row.session_exercise_id
           WHERE exercise.session_id = ?
             AND exercise.exercise_name = 'Band Pull Apart'
           LIMIT 1
         )`,
        [
          JSON.stringify({
            kind: "automatic",
            id: "load_reps.manual_hold.v1",
            version: 1,
          }),
          session.id,
        ],
      );
    });
    await expect(outcome.generateRecommendationsForSession(
      session.id,
      finished.detail.revision,
      1_787_027_605_000,
    )).resolves.toBe(0);
    await expect(kernel.queryAll<{ count: number }>(
      `SELECT COUNT(*) AS count
       FROM owned_progression_recommendations
       WHERE json_extract(evidence_json, '$.sessionId') = ?`,
      [session.id],
    )).resolves.toEqual([{ count: 0 }]);
  });

  it("requires an explicit copy choice and creates a fresh second graph", async () => {
    const kernel = await createRuntime();
    const first = await activate(kernel, {
      templateId: "full-body-foundation",
      requestId: "request-copy-first",
      activatedAtMs: 1_787_027_200_000,
      expectedActiveScheduleRevision: null,
    });
    const missingChoice = await repositoryError(() =>
      activate(kernel, {
        templateId: "full-body-foundation",
        requestId: "request-copy-missing",
        activatedAtMs: 1_787_027_201_000,
        expectedActiveScheduleRevision: first.schedule.revision,
      })
    );
    expect(missingChoice.code).toBe("starter_copy_choice_required");

    const second = await activate(kernel, {
      templateId: "full-body-foundation",
      requestId: "request-copy-second",
      activatedAtMs: 1_787_027_202_000,
      expectedActiveScheduleRevision: first.schedule.revision,
      copyChoice: { type: "create_another" },
    });
    expect(second.plan.id).not.toBe(first.plan.id);
    expect(second.days.map(({ id }) => id)).not.toEqual(
      first.days.map(({ id }) => id),
    );
    await expect(kernel.queryAll(
      `SELECT id, is_active FROM plans
       WHERE id IN (?, ?)
       ORDER BY id`,
      [first.plan.id, second.plan.id],
    )).resolves.toEqual([
      { id: first.plan.id, is_active: 0 },
      { id: second.plan.id, is_active: 1 },
    ].sort((left, right) => left.id.localeCompare(right.id)));
  });

  it("creates a newer inactive comparison copy without mutating active plan, schedule, or workout", async () => {
    const kernel = await createRuntime();
    await prepareLegacyUpdateSource(kernel);
    const active = await activate(kernel, {
      templateId: "upper-lower",
      requestId: "request-update-active",
      activatedAtMs: 1_787_027_200_000,
      expectedActiveScheduleRevision: null,
    });
    const [legacy] = await kernel.queryAll<{ revision: number }>(
      `SELECT revision
       FROM plans
       WHERE id = 'plan-copy'`,
    );
    await kernel.write((transaction) =>
      transaction.execute(
        `INSERT INTO workout_sessions
          (id, plan_id, plan_day_id, source, status, local_date, timezone,
           started_at_ms, completed_at_ms, active_session_exercise_id,
           active_set_id, revision)
         VALUES (
           'update-active-workout', ?, ?, 'scheduled_day', 'in_progress',
           '2026-08-24', 'Asia/Singapore', ?, NULL, NULL, NULL, 7
         )`,
        [
          active.plan.id,
          active.days[0]!.id,
          1_787_027_200_500,
        ],
      )
    );
    const createdAtMs = 1_787_027_201_000;
    const result = await createInactiveCopy(kernel, {
      activeScheduleRevision: active.schedule.revision,
      requestId: "request-update-copy",
      createdAtMs,
      expectedSourcePlanRevision: legacy!.revision,
    });

    expect(result.plan.isActive).toBe(false);
    expect(result.schedule.lifecycle).toBe("inactive");
    expect(result.sourceOwnedPlanId).toBe("plan-copy");
    expect(result.plan.id).not.toBe(active.plan.id);
    await expect(kernel.queryAll(
      `SELECT id, is_active, revision
       FROM plans
       WHERE id IN (?, 'plan-copy', ?)
       ORDER BY id`,
      [active.plan.id, result.plan.id],
    )).resolves.toEqual([
      { id: active.plan.id, is_active: 1, revision: active.plan.revision },
      { id: "plan-copy", is_active: 0, revision: legacy!.revision },
      { id: result.plan.id, is_active: 0, revision: 1 },
    ].sort((left, right) => left.id.localeCompare(right.id)));
    await expect(kernel.queryAll(
      `SELECT plan_id, lifecycle, revision
       FROM owned_plan_schedules
       WHERE plan_id IN (?, ?)
       ORDER BY plan_id`,
      [active.plan.id, result.plan.id],
    )).resolves.toEqual([
      {
        plan_id: active.plan.id,
        lifecycle: "active",
        revision: active.schedule.revision,
      },
      {
        plan_id: result.plan.id,
        lifecycle: "inactive",
        revision: 1,
      },
    ].sort((left, right) => left.plan_id.localeCompare(right.plan_id)));
    await expect(kernel.queryAll(
      `SELECT id, status, revision
       FROM workout_sessions
       WHERE id = 'update-active-workout'`,
    )).resolves.toEqual([{
      id: "update-active-workout",
      status: "in_progress",
      revision: 7,
    }]);
    await expect(kernel.queryAll(
      `SELECT operation, source_plan_id, result_plan_id
       FROM owned_plan_mutation_requests
       WHERE request_id = 'request-update-copy'`,
    )).resolves.toEqual([{
      operation: "duplicate",
      source_plan_id: "plan-copy",
      result_plan_id: result.plan.id,
    }]);
  });

  it("replays inactive copies exactly and rejects changed request identity", async () => {
    const kernel = await createRuntime();
    const legacy = await prepareLegacyUpdateSource(kernel);
    const input = {
      activeScheduleRevision: null,
      requestId: "request-update-replay",
      createdAtMs: 1_787_027_201_000,
      expectedSourcePlanRevision: legacy.revision,
    };
    const first = await createInactiveCopy(kernel, input);
    const replay = await createInactiveCopy(kernel, input);
    expect(replay).toEqual(first);

    const changed = await repositoryError(() =>
      createInactiveCopy(kernel, {
        ...input,
        createdAtMs: input.createdAtMs + 1,
      })
    );
    expect(changed.code).toBe("starter_request_identity_conflict");
  });

  it("accepts an older accepted-namespace source and rejects an already-current source", async () => {
    const olderKernel = await createRuntime();
    await olderKernel.write(async (transaction) => {
      await transaction.execute(
        `INSERT INTO starter_plan_sources
          (source_namespace, template_id, source_revision, asset_sha256,
           display_name, template_json, accepted_at_ms)
         VALUES (
           'gym-tracker.starter-plans', 'full-body-foundation', 1, ?,
           'Full Body Foundation', '{}', 0
         )`,
        ["1".repeat(64)],
      );
      await transaction.execute(
        `INSERT INTO owned_plan_starter_sources
          (plan_id, source_namespace, template_id, source_revision,
           asset_sha256, cloned_day_count, cloned_occurrence_count,
           cloned_at_ms)
         VALUES (
           'plan-copy', 'gym-tracker.starter-plans',
           'full-body-foundation', 1, ?, 1, 1, 0
         )`,
        ["1".repeat(64)],
      );
      await transaction.execute(
        `UPDATE plans
         SET source_namespace = 'gym-tracker.starter-plans'
         WHERE id = 'plan-copy'`,
      );
    });
    const [older] = await olderKernel.queryAll<{ revision: number }>(
      "SELECT revision FROM plans WHERE id = 'plan-copy'",
    );
    const created = await createInactiveCopy(olderKernel, {
      activeScheduleRevision: null,
      requestId: "request-update-older-accepted-source",
      createdAtMs: 1_787_027_201_000,
      expectedSourcePlanRevision: older!.revision,
    });
    expect(created.plan.sourceRevision).toBe(2);

    const currentKernel = await createRuntime();
    const current = await activate(currentKernel, {
      templateId: "full-body-foundation",
      requestId: "request-update-current-source",
      activatedAtMs: 1_787_027_200_000,
      expectedActiveScheduleRevision: null,
    });
    const rejected = await repositoryError(() =>
      createInactiveCopy(currentKernel, {
        activeScheduleRevision: current.schedule.revision,
        requestId: "request-update-current-rejected",
        createdAtMs: 1_787_027_201_000,
        sourceOwnedPlanId: current.plan.id,
        expectedSourcePlanRevision: current.plan.revision,
      })
    );
    expect(rejected.code).toBe("starter_update_source_invalid");
  });

  it("rejects stale schedule, invalid source, unavailable reference, and conflicting source for inactive copies", async () => {
    const staleKernel = await createRuntime();
    const active = await activate(staleKernel, {
      templateId: "upper-lower",
      requestId: "request-update-stale-active",
      activatedAtMs: 1_787_027_200_000,
      expectedActiveScheduleRevision: null,
    });
    const staleLegacy = await prepareLegacyUpdateSource(staleKernel);
    const stale = await repositoryError(() =>
      createInactiveCopy(staleKernel, {
        activeScheduleRevision: active.schedule.revision + 1,
        requestId: "request-update-stale",
        createdAtMs: 1_787_027_201_000,
        expectedSourcePlanRevision: staleLegacy.revision,
      })
    );
    expect(stale.code).toBe("starter_schedule_revision_conflict");

    const invalidSourceKernel = await createRuntime();
    const invalidSource = await repositoryError(() =>
      createInactiveCopy(invalidSourceKernel, {
        activeScheduleRevision: null,
        requestId: "request-update-invalid-source",
        createdAtMs: 1_787_027_201_000,
        sourceOwnedPlanId: "missing-plan",
        expectedSourcePlanRevision: 1,
      })
    );
    expect(invalidSource.code).toBe("starter_update_source_invalid");

    const unavailableKernel = await createRuntime();
    const unavailableLegacy = await prepareLegacyUpdateSource(unavailableKernel);
    await unavailableKernel.write((transaction) =>
      transaction.execute(
        `UPDATE exercise_library_entries
         SET availability = 'unavailable'
         WHERE exercise_id = '5f140001-7e35-4a6d-9100-000000000001'`,
      )
    );
    const unavailable = await repositoryError(() =>
      createInactiveCopy(unavailableKernel, {
        activeScheduleRevision: null,
        requestId: "request-update-unavailable",
        createdAtMs: 1_787_027_201_000,
        expectedSourcePlanRevision: unavailableLegacy.revision,
      })
    );
    expect(unavailable.code).toBe("starter_reference_invalid");

    const sourceKernel = await createRuntime();
    const sourceLegacy = await prepareLegacyUpdateSource(sourceKernel);
    const pack = await acceptedPack();
    const template = pack.templates.find(
      ({ id }) => id === "full-body-foundation",
    )!;
    await sourceKernel.write((transaction) =>
      transaction.execute(
        `INSERT INTO starter_plan_sources
          (source_namespace, template_id, source_revision, asset_sha256,
           display_name, template_json, accepted_at_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          pack.namespace,
          template.id,
          template.revision,
          "0".repeat(64),
          template.displayName,
          template.sourceJson,
          pack.acceptedAtMs,
        ],
      )
    );
    const sourceConflict = await repositoryError(() =>
      createInactiveCopy(sourceKernel, {
        activeScheduleRevision: null,
        requestId: "request-update-source-conflict",
        createdAtMs: 1_787_027_201_000,
        expectedSourcePlanRevision: sourceLegacy.revision,
      })
    );
    expect(sourceConflict.code).toBe("starter_source_conflict");
  });

  it("fails closed on malformed inactive-copy receipts and supports retained v8 without aggregate state", async () => {
    const malformedKernel = await createRuntime();
    const malformedLegacy = await prepareLegacyUpdateSource(malformedKernel);
    const pack = await acceptedPack();
    const template = pack.templates.find(
      ({ id }) => id === "full-body-foundation",
    )!;
    const schedule = scheduleForTemplate(template);
    const repository = createStarterPlanRepository(malformedKernel);
    await malformedKernel.write((transaction) =>
      transaction.execute(
        `INSERT INTO owned_plan_mutation_requests
          (request_id, request_sha256, operation, source_plan_id,
           result_plan_id, expected_revision, result_revision, result_json,
           committed_at_ms)
         VALUES (
           'request-update-malformed', ?, 'duplicate', 'plan-copy',
           'plan-copy', ?, ?, '{"outcome":"invalid"}', ?
         )`,
        [
          "b".repeat(64),
          malformedLegacy.revision,
          malformedLegacy.revision,
          1_787_027_201_000,
        ],
      )
    );
    const malformed = await repository.createAcceptedStarterPlanCopy({
      pack,
      template,
      assetSha256: pack.assetSha256,
      requestId: "request-update-malformed",
      requestSha256: "b".repeat(64),
      createdAtMs: 1_787_027_201_000,
      sourceOwnedPlanId: "plan-copy",
      expectedSourcePlanRevision: malformedLegacy.revision,
      expectedActiveScheduleRevision: null,
      schedule: schedule as never,
    }).catch((error: unknown) => error);
    expect(malformed).toMatchObject({ code: "sqlite_transaction_failed" });

    const retainedKernel = await createRuntime({ includeOwnedPlans: false });
    const retained = await activate(retainedKernel, {
      templateId: "upper-lower",
      requestId: "request-retained-v8-activation",
      activatedAtMs: 1_787_027_201_000,
      expectedActiveScheduleRevision: null,
    });
    expect(retained.plan.isActive).toBe(true);
    await expect(retainedKernel.queryAll(
      `SELECT COUNT(*) AS count
       FROM sqlite_master
       WHERE type = 'table'
         AND name = 'owned_plan_aggregate_states'`,
    )).resolves.toEqual([{ count: 0 }]);
  });

  it("reactivates the selected copy and preserves the previous plan and schedule", async () => {
    const kernel = await createRuntime();
    const first = await activate(kernel, {
      templateId: "full-body-foundation",
      requestId: "request-reactivate-first",
      activatedAtMs: 1_787_027_200_000,
      expectedActiveScheduleRevision: null,
    });
    const second = await activate(kernel, {
      templateId: "upper-lower",
      requestId: "request-reactivate-second",
      activatedAtMs: 1_787_027_201_000,
      expectedActiveScheduleRevision: first.schedule.revision,
    });
    const pack = await acceptedPack();
    const firstTemplate = pack.templates.find(
      ({ id }) => id === "full-body-foundation",
    )!;
    const reactivationSchedule = scheduleForTemplate(firstTemplate);
    const reactivated = await activate(kernel, {
      templateId: "full-body-foundation",
      requestId: "request-reactivate-third",
      activatedAtMs: 1_787_027_202_000,
      expectedActiveScheduleRevision: second.schedule.revision,
      schedule: {
        ...reactivationSchedule,
        startLocalDate: "2026-08-25",
      },
      copyChoice: {
        type: "reactivate_existing",
        planId: first.plan.id,
        expectedPlanRevision: first.plan.revision + 1,
        expectedScheduleRevision: first.schedule.revision + 1,
      },
    });

    expect(reactivated.plan.id).toBe(first.plan.id);
    expect(reactivated.schedule.version.versionNumber).toBe(2);
    await expect(kernel.queryAll(
      `SELECT plan_id, lifecycle, revision, deactivated_at_ms
       FROM owned_plan_schedules
       ORDER BY plan_id`,
    )).resolves.toEqual([
      {
        plan_id: first.plan.id,
        lifecycle: "active",
        revision: 3,
        deactivated_at_ms: null,
      },
      {
        plan_id: second.plan.id,
        lifecycle: "inactive",
        revision: 2,
        deactivated_at_ms: 1_787_027_202_000,
      },
    ].sort((left, right) => left.plan_id.localeCompare(right.plan_id)));
  });

  it("blocks switching while an active workout exists", async () => {
    const kernel = await createRuntime();
    const first = await activate(kernel, {
      templateId: "full-body-foundation",
      requestId: "request-active-workout-first",
      activatedAtMs: 1_787_027_200_000,
      expectedActiveScheduleRevision: null,
    });
    await kernel.write((transaction) =>
      transaction.execute(
        `INSERT INTO workout_sessions
          (id, plan_id, plan_day_id, source, status, local_date, timezone,
           started_at_ms, completed_at_ms, active_session_exercise_id,
           active_set_id, revision)
         VALUES (
           'active-workout', ?, ?, 'scheduled_day', 'in_progress',
           '2026-08-24', 'Asia/Singapore', ?, NULL, NULL, NULL, 1
         )`,
        [
          first.plan.id,
          first.days[0]!.id,
          1_787_027_200_500,
        ],
      )
    );

    const error = await repositoryError(() =>
      activate(kernel, {
        templateId: "upper-lower",
        requestId: "request-active-workout-second",
        activatedAtMs: 1_787_027_201_000,
        expectedActiveScheduleRevision: first.schedule.revision,
      })
    );
    expect(error.code).toBe("starter_active_workout_blocked");
    await expect(kernel.queryAll(
      "SELECT COUNT(*) AS count FROM owned_plan_starter_sources",
    )).resolves.toEqual([{ count: 1 }]);
  });

  it("replays exact request identity and rejects changed or stale commands", async () => {
    const kernel = await createRuntime();
    const first = await activate(kernel, {
      templateId: "full-body-foundation",
      requestId: "request-idempotent",
      activatedAtMs: 1_787_027_200_000,
      expectedActiveScheduleRevision: null,
    });
    const replay = await activate(kernel, {
      templateId: "full-body-foundation",
      requestId: "request-idempotent",
      activatedAtMs: 1_787_027_200_000,
      expectedActiveScheduleRevision: null,
    });
    expect(replay).toEqual(first);
    await expect(kernel.queryAll(
      "SELECT COUNT(*) AS count FROM owned_plan_starter_sources",
    )).resolves.toEqual([{ count: 1 }]);

    const changed = await repositoryError(() =>
      activate(kernel, {
        templateId: "upper-lower",
        requestId: "request-idempotent",
        activatedAtMs: 1_787_027_201_000,
        expectedActiveScheduleRevision: first.schedule.revision,
      })
    );
    expect(changed.code).toBe("starter_request_identity_conflict");

    const stale = await repositoryError(() =>
      activate(kernel, {
        templateId: "upper-lower",
        requestId: "request-stale",
        activatedAtMs: 1_787_027_202_000,
        expectedActiveScheduleRevision: first.schedule.revision + 1,
      })
    );
    expect(stale.code).toBe("starter_schedule_revision_conflict");
  });

  it("rolls back the complete graph and source receipt on an injected failure", async () => {
    const kernel = await createRuntime();
    const error = await activate(kernel, {
      templateId: "gym-body-part-split",
      requestId: "request-rollback",
      activatedAtMs: 1_787_027_200_000,
      expectedActiveScheduleRevision: null,
      observer: {
        afterPlanDay(sourceDayId) {
          if (sourceDayId === "body-part-back") {
            throw new Error("injected_clone_failure");
          }
        },
      },
    }).catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code: "sqlite_transaction_failed" });
    await expect(kernel.queryAll(
      `SELECT COUNT(*) AS count
       FROM owned_plan_starter_sources
       WHERE template_id = 'gym-body-part-split'`,
    )).resolves.toEqual([{ count: 0 }]);
    await expect(kernel.queryAll(
      `SELECT COUNT(*) AS count
       FROM owned_plan_schedules schedule
       JOIN owned_plan_starter_sources source
         ON source.plan_id = schedule.plan_id
       WHERE source.template_id = 'gym-body-part-split'`,
    )).resolves.toEqual([{ count: 0 }]);
    await expect(kernel.queryAll(
      "SELECT COUNT(*) AS count FROM starter_plan_activation_requests",
    )).resolves.toEqual([{ count: 0 }]);
    await expect(kernel.queryAll(
      `SELECT COUNT(*) AS count
       FROM starter_plan_sources
       WHERE template_id = 'gym-body-part-split'`,
    )).resolves.toEqual([{ count: 0 }]);
  });

  it("does not mutate the accepted template source after independent edits", async () => {
    const kernel = await createRuntime();
    const result = await activate(kernel, {
      templateId: "full-body-foundation",
      requestId: "request-independent-copy",
      activatedAtMs: 1_787_027_200_000,
      expectedActiveScheduleRevision: null,
    });
    const [sourceBefore] = await kernel.queryAll<{ template_json: string }>(
      `SELECT template_json
       FROM starter_plan_sources
       WHERE template_id = 'full-body-foundation'`,
    );
    await kernel.write((transaction) =>
      transaction.execute(
        "UPDATE plan_days SET name = 'Owner Day' WHERE id = ?",
        [result.days[0]!.id],
      )
    );
    await expect(kernel.queryAll<{ template_json: string }>(
      `SELECT template_json
       FROM starter_plan_sources
       WHERE template_id = 'full-body-foundation'`,
    )).resolves.toEqual([sourceBefore]);
    expect(await sha256(starterPackBytes)).toBe(
      "8c1fbd0f6a114e5c5f9fa7ae2c4edf8f32d46890397b7488e65c768bea4126f4",
    );
  });

  it("rejects a copy choice on first activation and an unknown existing copy", async () => {
    const kernel = await createRuntime();
    const invalidFirstChoice = await repositoryError(() =>
      activate(kernel, {
        templateId: "full-body-foundation",
        requestId: "request-invalid-first-choice",
        activatedAtMs: 1_787_027_200_000,
        expectedActiveScheduleRevision: null,
        copyChoice: { type: "create_another" },
      })
    );
    expect(invalidFirstChoice.code).toBe("starter_copy_choice_invalid");

    const missingActiveRevision = await repositoryError(() =>
      activate(kernel, {
        templateId: "full-body-foundation",
        requestId: "request-missing-active-revision",
        activatedAtMs: 1_787_027_200_500,
        expectedActiveScheduleRevision: 1,
      })
    );
    expect(missingActiveRevision.code).toBe(
      "starter_schedule_revision_conflict",
    );

    const first = await activate(kernel, {
      templateId: "full-body-foundation",
      requestId: "request-known-copy",
      activatedAtMs: 1_787_027_201_000,
      expectedActiveScheduleRevision: null,
    });
    const unknownCopy = await repositoryError(() =>
      activate(kernel, {
        templateId: "full-body-foundation",
        requestId: "request-unknown-copy",
        activatedAtMs: 1_787_027_202_000,
        expectedActiveScheduleRevision: first.schedule.revision,
        copyChoice: {
          type: "reactivate_existing",
          planId: "missing-owned-copy",
          expectedPlanRevision: 1,
          expectedScheduleRevision: 1,
        },
      })
    );
    expect(unknownCopy.code).toBe("starter_copy_choice_invalid");

    const staleCopy = await repositoryError(() =>
      activate(kernel, {
        templateId: "full-body-foundation",
        requestId: "request-stale-copy",
        activatedAtMs: 1_787_027_203_000,
        expectedActiveScheduleRevision: first.schedule.revision,
        copyChoice: {
          type: "reactivate_existing",
          planId: first.plan.id,
          expectedPlanRevision: first.plan.revision + 1,
          expectedScheduleRevision: first.schedule.revision + 1,
        },
      })
    );
    expect(staleCopy.code).toBe("starter_owned_copy_revision_conflict");
  });

  it("rejects a supplied schedule revision when no active plan exists", async () => {
    const kernel = await createRuntime();
    await kernel.write((transaction) =>
      transaction.execute(
        `UPDATE plans
         SET is_active = 0, revision = revision + 1
         WHERE is_active = 1`,
      )
    );
    const error = await repositoryError(() =>
      activate(kernel, {
        templateId: "full-body-foundation",
        requestId: "request-no-active-state",
        activatedAtMs: 1_787_027_200_000,
        expectedActiveScheduleRevision: 1,
      })
    );
    expect(error.code).toBe("starter_schedule_revision_conflict");
  });

  it("rejects an unavailable accepted exercise and conflicting starter source", async () => {
    const unavailableKernel = await createRuntime();
    await unavailableKernel.write((transaction) =>
      transaction.execute(
        `UPDATE exercise_library_entries
         SET availability = 'unavailable'
         WHERE exercise_id = '5f140001-7e35-4a6d-9100-000000000001'`,
      )
    );
    const unavailable = await repositoryError(() =>
      activate(unavailableKernel, {
        templateId: "full-body-foundation",
        requestId: "request-unavailable-reference",
        activatedAtMs: 1_787_027_200_000,
        expectedActiveScheduleRevision: null,
      })
    );
    expect(unavailable.code).toBe("starter_reference_invalid");

    const sourceKernel = await createRuntime();
    const pack = await acceptedPack();
    const template = pack.templates.find(
      ({ id }) => id === "full-body-foundation",
    )!;
    await sourceKernel.write((transaction) =>
      transaction.execute(
        `INSERT INTO starter_plan_sources
          (source_namespace, template_id, source_revision, asset_sha256,
           display_name, template_json, accepted_at_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          pack.namespace,
          template.id,
          template.revision,
          "0".repeat(64),
          template.displayName,
          template.sourceJson,
          pack.acceptedAtMs,
        ],
      )
    );
    const sourceConflict = await repositoryError(() =>
      activate(sourceKernel, {
        templateId: "full-body-foundation",
        requestId: "request-source-conflict",
        activatedAtMs: 1_787_027_200_000,
        expectedActiveScheduleRevision: null,
      })
    );
    expect(sourceConflict.code).toBe("starter_source_conflict");
  });

  it("fails closed on malformed activation receipts", async () => {
    const kernel = await createRuntime();
    const pack = await acceptedPack();
    const template = pack.templates.find(
      ({ id }) => id === "full-body-foundation",
    )!;
    const schedule = scheduleForTemplate(template);
    const requestId = "request-malformed-receipt";
    const activatedAtMs = 1_787_027_200_000;
    const requestSha256 = await sha256(JSON.stringify({
      requestId,
      activatedAtMs,
      expectedActiveScheduleRevision: null,
      preview: {
        assetSha256: pack.assetSha256,
        templateId: template.id,
        templateRevision: template.revision,
        startLocalDate: schedule.startLocalDate,
        timeZone: schedule.timeZone,
        mode: schedule.mode,
        bindings: schedule.bindings.map((binding) => ({ ...binding })),
        copyChoice: null,
      },
    }));
    await kernel.write(async (transaction) => {
      await transaction.execute(
        `INSERT INTO starter_plan_sources
          (source_namespace, template_id, source_revision, asset_sha256,
           display_name, template_json, accepted_at_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          pack.namespace,
          template.id,
          template.revision,
          pack.assetSha256,
          template.displayName,
          template.sourceJson,
          pack.acceptedAtMs,
        ],
      );
      await transaction.execute(
        `INSERT INTO plans
          (id, content_pack_id, origin, source_namespace, upstream_id, name,
           days_per_week, audience, goal, estimate_minutes, attribution,
           is_active, revision)
         VALUES (
           'malformed-receipt-plan', NULL, 'copied', ?, 'malformed-receipt',
           'Malformed Receipt', 1, 'Owner', 'Test', 10, 'Test', 0, 1
         )`,
        [pack.namespace],
      );
      await transaction.execute(
        `INSERT INTO owned_plan_schedules
          (id, plan_id, lifecycle, revision, activated_at_ms,
           deactivated_at_ms)
         VALUES (
           'malformed-receipt-schedule', 'malformed-receipt-plan',
           'inactive', 1, 0, 0
         )`,
      );
      await transaction.execute(
        `INSERT INTO starter_plan_activation_requests
          (request_id, request_sha256, source_namespace, template_id,
           source_revision, expected_active_schedule_revision, choice,
           selected_plan_id, result_plan_id, result_schedule_id, result_json,
           committed_at_ms)
         VALUES (
           ?, ?, ?, ?, ?, NULL, 'initial', NULL,
           'malformed-receipt-plan', 'malformed-receipt-schedule',
           '{"outcome":"invalid"}', ?
         )`,
        [
          requestId,
          requestSha256,
          pack.namespace,
          template.id,
          template.revision,
          activatedAtMs,
        ],
      );
    });
    const error = await activate(kernel, {
      templateId: "full-body-foundation",
      requestId,
      activatedAtMs,
      expectedActiveScheduleRevision: null,
    }).catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code: "sqlite_transaction_failed" });
  });

  it("fails closed on inconsistent active plan and schedule topology", async () => {
    const kernel = await createRuntime();
    await kernel.write(async (transaction) => {
      await transaction.execute("DROP INDEX one_active_owned_plan");
      await transaction.execute(
        `INSERT INTO plans
          (id, content_pack_id, origin, source_namespace, upstream_id, name,
           days_per_week, audience, goal, estimate_minutes, attribution,
           is_active, revision)
         VALUES (
           'second-active-plan', NULL, 'copied', 'legacy', 'second',
           'Second Active', 1, 'Owner', 'Test', 10, 'Test', 1, 1
         )`,
      );
    });
    const error = await activate(kernel, {
      templateId: "full-body-foundation",
      requestId: "request-invalid-topology",
      activatedAtMs: 1_787_027_200_000,
      expectedActiveScheduleRevision: null,
    }).catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code: "sqlite_transaction_failed" });
  });

  it.each([
    {
      name: "an active schedule with no active plan",
      retainLegacyActivePlan: false,
    },
    {
      name: "an active schedule attached to a different plan",
      retainLegacyActivePlan: true,
    },
  ])("fails closed on $name", async ({ retainLegacyActivePlan }) => {
    const kernel = await createRuntime();
    await kernel.write(async (transaction) => {
      await transaction.execute(
        `UPDATE plans
         SET is_active = ?
         WHERE id = 'plan-copy'`,
        [retainLegacyActivePlan ? 1 : 0],
      );
      await transaction.execute(
        `INSERT INTO plans
          (id, content_pack_id, origin, source_namespace, upstream_id, name,
           days_per_week, audience, goal, estimate_minutes, attribution,
           is_active, revision)
         VALUES (
           'orphan-schedule-plan', NULL, 'copied', 'legacy', 'orphan',
           'Orphan Schedule', 1, 'Owner', 'Test', 10, 'Test', 0, 1
         )`,
      );
      await transaction.execute(
        `INSERT INTO owned_plan_schedules
          (id, plan_id, lifecycle, revision, activated_at_ms,
           deactivated_at_ms)
         VALUES (
           'orphan-active-schedule', 'orphan-schedule-plan',
           'active', 1, 0, NULL
         )`,
      );
    });
    const error = await activate(kernel, {
      templateId: "full-body-foundation",
      requestId: `request-orphan-schedule-${String(retainLegacyActivePlan)}`,
      activatedAtMs: 1_787_027_200_000,
      expectedActiveScheduleRevision: null,
    }).catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code: "sqlite_transaction_failed" });
  });

  it("reactivates an already active selected copy without deactivating it first", async () => {
    const kernel = await createRuntime();
    const first = await activate(kernel, {
      templateId: "full-body-foundation",
      requestId: "request-active-selected-first",
      activatedAtMs: 1_787_027_200_000,
      expectedActiveScheduleRevision: null,
    });
    const pack = await acceptedPack();
    const template = pack.templates.find(
      ({ id }) => id === "full-body-foundation",
    )!;
    const schedule = scheduleForTemplate(template);
    const reactivated = await activate(kernel, {
      templateId: "full-body-foundation",
      requestId: "request-active-selected-second",
      activatedAtMs: 1_787_027_201_000,
      expectedActiveScheduleRevision: first.schedule.revision,
      schedule: { ...schedule, startLocalDate: "2026-08-25" },
      copyChoice: {
        type: "reactivate_existing",
        planId: first.plan.id,
        expectedPlanRevision: first.plan.revision,
        expectedScheduleRevision: first.schedule.revision,
      },
    });
    expect(reactivated.plan.id).toBe(first.plan.id);
    expect(reactivated.schedule.revision).toBe(2);
  });
});
