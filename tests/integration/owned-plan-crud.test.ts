import {
  afterEach,
  describe,
  expect,
  it,
} from "@jest/globals";
import {
  DatabaseSync,
  type SQLInputValue,
} from "node:sqlite";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  archiveOwnedPlan,
  createOwnedPlanDraft,
  duplicateOwnedPlan,
  restoreOwnedPlan,
  saveOwnedPlan,
  type OwnedPlanDraftInput,
} from "../../src/domains/plans/ownedPlanCommands";
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
  ownedPlansMigration,
} from "../../src/platform/sqlite/migrations/0009_owned_plans";
import {
  createOwnedPlanRepository,
  type OwnedPlanCommittedResult,
  OwnedPlanConflictError,
  type OwnedPlanRepositoryResult,
} from "../../src/platform/sqlite/repositories/ownedPlanRepository";
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
const temporaryDirectories = new Set<string>();
const kernels = new Set<SqliteKernel>();
const sha256 = async (value: string): Promise<string> =>
  createHash("sha256").update(value).digest("hex");

function expectCommitted(
  result: OwnedPlanRepositoryResult,
): OwnedPlanCommittedResult {
  if (result.outcome === "requires_schedule_impact") {
    throw new Error("expected_owned_plan_commit");
  }
  return result;
}

afterEach(async () => {
  await Promise.all([...kernels].map((kernel) => kernel.close()));
  kernels.clear();
  for (const directory of temporaryDirectories) {
    rmSync(directory, { force: true, recursive: true });
  }
  temporaryDirectories.clear();
});

async function setupRuntime(
  options: Readonly<{ failCommit?: boolean }> = {},
): Promise<Readonly<{
  databasePath: string;
  kernel: SqliteKernel;
  repository: ReturnType<typeof createOwnedPlanRepository>;
}>> {
  const directory = mkdtempSync(join(tmpdir(), "gym-owned-plan-crud-"));
  temporaryDirectories.add(directory);
  const databasePath = join(directory, "gym-tracker.db");
  const fixtureDatabase = new DatabaseSync(databasePath);
  fixtureDatabase.exec(readFileSync(
    join(
      repositoryRoot,
      "tests/migrations/fixtures/v8-schedule-activation.sql",
    ),
    "utf8",
  ));
  fixtureDatabase.close();

  const writer = new NodeSqliteConnection(new DatabaseSync(databasePath));
  const reader = new NodeSqliteConnection(new DatabaseSync(databasePath));
  await configureSqliteConnection(writer, { enableWal: true });
  await configureSqliteConnection(reader, { enableWal: false });
  let rejectCommit = false;
  const kernel = createSqliteKernel(
    { reader, writer },
    {
      beforeCommit: async () => {
        if (rejectCommit) {
          throw new Error("injected_commit_failure");
        }
      },
    },
  );
  kernels.add(kernel);
  await createMigrationRunner({
    databaseName: "gym-tracker.db",
    kernel,
    migrations: [ownedPlansMigration],
  }).run();
  rejectCommit = options.failCommit ?? false;
  return {
    databasePath,
    kernel,
    repository: createOwnedPlanRepository(kernel),
  };
}

async function reopenRuntime(databasePath: string) {
  const writer = new NodeSqliteConnection(new DatabaseSync(databasePath));
  const reader = new NodeSqliteConnection(new DatabaseSync(databasePath));
  await configureSqliteConnection(writer, { enableWal: true });
  await configureSqliteConnection(reader, { enableWal: false });
  const kernel = createSqliteKernel({ reader, writer });
  kernels.add(kernel);
  return {
    kernel,
    repository: createOwnedPlanRepository(kernel),
  };
}

function completePlan(
  changes: Partial<OwnedPlanDraftInput> = {},
): OwnedPlanDraftInput {
  return {
    id: "plan-owner",
    name: "Owner Strength",
    days: [
      {
        id: "day-owner",
        name: "Strength Day",
        ordinal: 0,
        occurrences: [
          {
            id: "occurrence-owner-squat",
            exerciseId: "exercise-squat",
            ordinal: 0,
            restSeconds: 90,
            metricIdentity: {
              profile: "load_reps",
              contractVersion: 1,
              exerciseMetricGeneration: 1,
            },
            warmups: [
              {
                id: "warmup-owner-squat",
                ordinal: 0,
                loadGrams: 10_000,
                reps: 5,
              },
            ],
            targets: [
              {
                id: "target-owner-squat-a",
                ordinal: 0,
                target: {
                  profile: "load_reps",
                  version: 1,
                  loadGrams: 20_000,
                  minReps: 8,
                  maxReps: 12,
                  incrementGrams: 2_500,
                  perSide: false,
                },
                units: {
                  version: 1,
                  load: "grams",
                  count: "repetitions",
                },
              },
              {
                id: "target-owner-squat-b",
                ordinal: 1,
                target: {
                  profile: "load_reps",
                  version: 1,
                  loadGrams: 20_000,
                  minReps: 8,
                  maxReps: 12,
                  incrementGrams: 2_500,
                  perSide: false,
                },
                units: {
                  version: 1,
                  load: "grams",
                  count: "repetitions",
                },
              },
            ],
            policy: {
              id: "policy-owner-squat",
              kind: "manual_hold",
              policyId: "manual-hold-v1",
              version: 1,
              rule: {
                kind: "manual_hold",
                id: "manual-hold-v1",
                version: 1,
              },
            },
          },
        ],
      },
    ],
    ...changes,
  };
}

async function createAndSave(
  runtime: Awaited<ReturnType<typeof setupRuntime>>,
) {
  const invalidate = async () => undefined;
  const created = expectCommitted(await createOwnedPlanDraft({
    repository: runtime.repository,
    invalidate,
    sha256,
    input: {
      requestId: "create-owner-plan",
      planId: "plan-owner",
      name: "Owner Strength",
      dayId: "day-owner",
      dayName: "Strength Day",
      createdAtMs: 1_000,
    },
  }));
  return expectCommitted(await saveOwnedPlan({
    repository: runtime.repository,
    invalidate,
    sha256,
    input: {
      requestId: "save-owner-plan",
      expectedRevision: created.plan.revision,
      savedAtMs: 2_000,
      plan: completePlan(),
    },
  }));
}

async function graphRows(kernel: SqliteKernel, planId: string) {
  return kernel.queryAll<{
    day_id: string;
    day_ordinal: number;
    occurrence_id: string;
    occurrence_ordinal: number;
    target_id: string;
    target_ordinal: number;
    warmup_id: string | null;
    policy_id: string;
  }>(
    `SELECT day.id AS day_id,
            day.ordinal AS day_ordinal,
            occurrence.id AS occurrence_id,
            occurrence.ordinal AS occurrence_ordinal,
            target.id AS target_id,
            target.ordinal AS target_ordinal,
            warmup.id AS warmup_id,
            policy.id AS policy_id
     FROM plan_days day
     JOIN owned_plan_day_exercises occurrence
       ON occurrence.plan_day_id = day.id
     JOIN owned_plan_working_set_targets target
       ON target.plan_day_exercise_id = occurrence.id
     LEFT JOIN owned_plan_warmup_sets warmup
       ON warmup.plan_day_exercise_id = occurrence.id
     JOIN owned_plan_progression_policies policy
       ON policy.plan_day_exercise_id = occurrence.id
     WHERE day.plan_id = ?
     ORDER BY day.ordinal, occurrence.ordinal, target.ordinal`,
    [planId],
  );
}

describe("owned-plan CRUD repository", () => {
  it("D-21/D-22 creates an explicit draft then atomically saves a valid graph", async () => {
    const runtime = await setupRuntime();
    await expect(runtime.repository.read("missing-plan")).resolves.toBeNull();
    const saved = await createAndSave(runtime);

    expect(saved).toMatchObject({
      outcome: "committed",
      operation: "save",
      plan: {
        id: "plan-owner",
        lifecycle: "ready",
        graphStatus: "valid",
        missingRequirement: null,
        isActive: false,
        revision: 2,
      },
    });
    await expect(runtime.repository.read("plan-owner")).resolves.toEqual(
      saved.plan,
    );
    await expect(graphRows(runtime.kernel, "plan-owner")).resolves.toEqual([
      {
        day_id: "day-owner",
        day_ordinal: 0,
        occurrence_id: "occurrence-owner-squat",
        occurrence_ordinal: 0,
        target_id: "target-owner-squat-a",
        target_ordinal: 0,
        warmup_id: "warmup-owner-squat",
        policy_id: "policy-owner-squat",
      },
      {
        day_id: "day-owner",
        day_ordinal: 0,
        occurrence_id: "occurrence-owner-squat",
        occurrence_ordinal: 0,
        target_id: "target-owner-squat-b",
        target_ordinal: 1,
        warmup_id: "warmup-owner-squat",
        policy_id: "policy-owner-squat",
      },
    ]);
  });

  it("D-23/D-25 persists name and reorder only when aggregate Save commits", async () => {
    const runtime = await setupRuntime();
    const saved = await createAndSave(runtime);
    const dirty = completePlan({
      name: "Dirty Local Name",
      days: [
        {
          id: "day-owner",
          name: "Strength Day",
          ordinal: 0,
          occurrences: [
            {
              ...completePlan().days[0]!.occurrences[0]!,
              targets: [
                {
                  ...completePlan().days[0]!.occurrences[0]!.targets[1]!,
                  ordinal: 0,
                },
                {
                  ...completePlan().days[0]!.occurrences[0]!.targets[0]!,
                  ordinal: 1,
                },
              ],
            },
          ],
        },
      ],
    });

    await expect(runtime.kernel.queryAll(
      "SELECT name FROM plans WHERE id = 'plan-owner'",
    )).resolves.toEqual([{ name: "Owner Strength" }]);
    await saveOwnedPlan({
      repository: runtime.repository,
      invalidate: async () => undefined,
      sha256,
      input: {
        requestId: "save-owner-reorder",
        expectedRevision: saved.plan.revision,
        savedAtMs: 3_000,
        plan: dirty,
      },
    });

    await expect(runtime.kernel.queryAll(
      "SELECT name FROM plans WHERE id = 'plan-owner'",
    )).resolves.toEqual([{ name: "Dirty Local Name" }]);
    await expect(runtime.kernel.queryAll(
      `SELECT id, ordinal
       FROM owned_plan_working_set_targets
       WHERE plan_day_exercise_id = 'occurrence-owner-squat'
       ORDER BY ordinal`,
    )).resolves.toEqual([
      { id: "target-owner-squat-b", ordinal: 0 },
      { id: "target-owner-squat-a", ordinal: 1 },
    ]);
  });

  it("D-26 duplicates the full graph into fresh IDs and an inactive schedule", async () => {
    const runtime = await setupRuntime();
    const sourceRows = await graphRows(runtime.kernel, "retained-plan");

    const duplicate = await duplicateOwnedPlan({
      repository: runtime.repository,
      invalidate: async () => undefined,
      sha256,
      input: {
        requestId: "duplicate-retained",
        sourcePlanId: "retained-plan",
        expectedRevision: 4,
        newPlanId: "retained-plan-copy",
        name: "Retained Plan Copy",
        duplicatedAtMs: 4_000,
      },
    });
    const duplicateRows = await graphRows(
      runtime.kernel,
      "retained-plan-copy",
    );

    expect(duplicate).toMatchObject({
      outcome: "committed",
      operation: "duplicate",
      plan: {
        id: "retained-plan-copy",
        isActive: false,
        lifecycle: "ready",
      },
    });
    expect(duplicateRows).toHaveLength(sourceRows.length);
    expect(new Set(duplicateRows.flatMap((row) => [
      row.day_id,
      row.occurrence_id,
      row.target_id,
      row.warmup_id,
      row.policy_id,
    ]))).not.toEqual(new Set(sourceRows.flatMap((row) => [
      row.day_id,
      row.occurrence_id,
      row.target_id,
      row.warmup_id,
      row.policy_id,
    ])));
    await expect(runtime.kernel.queryAll(
      `SELECT schedule.lifecycle, version.mode, binding.weekday,
              binding.plan_day_id
       FROM owned_plan_schedules schedule
       JOIN owned_plan_schedule_versions version
         ON version.schedule_id = schedule.id
       JOIN owned_plan_schedule_bindings binding
         ON binding.schedule_version_id = version.id
       WHERE schedule.plan_id = 'retained-plan-copy'`,
    )).resolves.toEqual([{
      lifecycle: "inactive",
      mode: "weekday",
      plan_day_id: duplicateRows[0]!.day_id,
      weekday: "Monday",
    }]);
  });

  it("D-28 archives and restores without deleting the aggregate", async () => {
    const runtime = await setupRuntime();
    const saved = await createAndSave(runtime);

    const archived = expectCommitted(await archiveOwnedPlan({
      repository: runtime.repository,
      invalidate: async () => undefined,
      sha256,
      input: {
        requestId: "archive-owner",
        planId: "plan-owner",
        expectedRevision: saved.plan.revision,
        updatedAtMs: 4_000,
      },
    }));
    const restored = expectCommitted(await restoreOwnedPlan({
      repository: runtime.repository,
      invalidate: async () => undefined,
      sha256,
      input: {
        requestId: "restore-owner",
        planId: "plan-owner",
        expectedRevision: archived.plan.revision,
        updatedAtMs: 5_000,
      },
    }));

    expect(archived.plan.lifecycle).toBe("archived");
    expect(restored.plan.lifecycle).toBe("ready");
    await expect(runtime.kernel.queryAll(
      "SELECT COUNT(*) AS count FROM plans WHERE id = 'plan-owner'",
    )).resolves.toEqual([{ count: 1 }]);
  });

  it("D-30 returns impact-required for structural active-plan edits and preserves schedule", async () => {
    const runtime = await setupRuntime();
    const scheduleBefore = await runtime.kernel.queryAll(
      `SELECT * FROM owned_plan_schedules
       WHERE plan_id = 'retained-plan'`,
    );

    const result = await saveOwnedPlan({
      repository: runtime.repository,
      invalidate: async () => undefined,
      sha256,
      input: {
        requestId: "save-retained-structure",
        expectedRevision: 4,
        savedAtMs: 6_000,
        plan: {
          id: "retained-plan",
          name: "Retained Active Plan",
          days: [
            {
              id: "replacement-day",
              name: "Replacement",
              ordinal: 0,
              occurrences: [],
            },
          ],
        },
      },
    });

    expect(result).toEqual({
      outcome: "requires_schedule_impact",
      code: "requires_schedule_impact",
      planId: "retained-plan",
      expectedRevision: 4,
      activeScheduleId: "retained-schedule",
      invalidations: [],
    });
    await expect(runtime.kernel.queryAll(
      `SELECT * FROM owned_plan_schedules
       WHERE plan_id = 'retained-plan'`,
    )).resolves.toEqual(scheduleBefore);
    await expect(runtime.kernel.queryAll(
      `SELECT id FROM plan_days
       WHERE plan_id = 'retained-plan'`,
    )).resolves.toEqual([{ id: "retained-day" }]);
  });

  it("returns impact-required instead of permanently deleting unscheduled graph rows", async () => {
    const runtime = await setupRuntime();
    const saved = await createAndSave(runtime);
    const before = await graphRows(runtime.kernel, "plan-owner");
    const requested = completePlan({
      days: [{
        ...completePlan().days[0]!,
        occurrences: [{
          ...completePlan().days[0]!.occurrences[0]!,
          targets: [
            completePlan().days[0]!.occurrences[0]!.targets[0]!,
          ],
        }],
      }],
    });

    const result = await saveOwnedPlan({
      repository: runtime.repository,
      invalidate: async () => undefined,
      sha256,
      input: {
        requestId: "save-owner-remove-target",
        expectedRevision: saved.plan.revision,
        savedAtMs: 6_500,
        plan: requested,
      },
    });

    expect(result).toEqual({
      outcome: "requires_schedule_impact",
      code: "requires_schedule_impact",
      planId: "plan-owner",
      expectedRevision: saved.plan.revision,
      activeScheduleId: null,
      invalidations: [],
    });
    await expect(graphRows(runtime.kernel, "plan-owner")).resolves
      .toEqual(before);
  });

  it("D-31 saves future exercise edits while immutable in-progress snapshots stay unchanged", async () => {
    const runtime = await setupRuntime();
    await runtime.kernel.write(async (transaction) => {
      await transaction.execute(
        `INSERT INTO workout_sessions
          (id, plan_id, plan_day_id, source, status, local_date, timezone,
           started_at_ms, completed_at_ms, active_session_exercise_id,
           active_set_id, revision)
         VALUES (
           'session-current', 'retained-plan', 'retained-day',
           'scheduled_day', 'in_progress', '2026-08-18',
           'Asia/Singapore', 10, NULL, NULL, NULL, 1
         )`,
      );
      await transaction.execute(
        `INSERT INTO session_exercises
          (id, session_id, source_plan_day_exercise_id, exercise_id, ordinal,
           exercise_name, metric_profile, metric_contract_version,
           exercise_metric_generation, default_rest_seconds,
           target_revision, status, revision)
         VALUES (
           'session-exercise-current', 'session-current',
           'retained-occurrence', 'exercise-squat', 0, 'Back Squat',
           'load_reps', 1, 1, 90, 2, 'active', 1
         )`,
      );
    });
    const snapshotBefore = await runtime.kernel.queryAll(
      `SELECT * FROM session_exercises
       WHERE id = 'session-exercise-current'`,
    );

    const result = await saveOwnedPlan({
      repository: runtime.repository,
      invalidate: async () => undefined,
      sha256,
      input: {
        requestId: "save-retained-target",
        expectedRevision: 4,
        savedAtMs: 7_000,
        plan: {
          id: "retained-plan",
          name: "Retained Active Plan Updated",
          days: [
            {
              id: "retained-day",
              name: "Full Body Updated",
              ordinal: 0,
              occurrences: [
                {
                  id: "retained-occurrence",
                  exerciseId: "exercise-squat",
                  ordinal: 0,
                  restSeconds: 120,
                  metricIdentity: {
                    profile: "load_reps",
                    contractVersion: 1,
                    exerciseMetricGeneration: 1,
                  },
                  warmups: [],
                  targets: [
                    {
                      id: "retained-target",
                      ordinal: 0,
                      target: {
                        profile: "load_reps",
                        version: 1,
                        loadGrams: 22_500,
                        minReps: 8,
                        maxReps: 12,
                        incrementGrams: 2_500,
                        perSide: false,
                      },
                      units: {
                        version: 1,
                        load: "grams",
                        count: "repetitions",
                      },
                    },
                  ],
                  policy: {
                    id: "retained-policy",
                    kind: "manual_hold",
                    policyId: "manual-hold-v1",
                    version: 1,
                    rule: {
                      kind: "manual_hold",
                      id: "manual-hold-v1",
                      version: 1,
                    },
                  },
                },
              ],
            },
          ],
        },
      },
    });

    expect(result).toMatchObject({
      outcome: "committed",
      currentWorkoutUnaffected: true,
    });
    await expect(runtime.kernel.queryAll(
      `SELECT * FROM session_exercises
       WHERE id = 'session-exercise-current'`,
    )).resolves.toEqual(snapshotBefore);
    await expect(runtime.kernel.queryAll(
      `SELECT lifecycle, revision
       FROM owned_plan_schedules
       WHERE id = 'retained-schedule'`,
    )).resolves.toEqual([{ lifecycle: "active", revision: 3 }]);
  });

  it("serializes stale and parallel revisions with durable idempotent replay", async () => {
    const runtime = await setupRuntime();
    const saved = await createAndSave(runtime);
    const request = {
      repository: runtime.repository,
      invalidate: async () => undefined,
      sha256,
      input: {
        requestId: "save-owner-once",
        expectedRevision: saved.plan.revision,
        savedAtMs: 8_000,
        plan: completePlan({ name: "Saved Once" }),
      },
    } as const;

    const first = expectCommitted(await saveOwnedPlan(request));
    const replay = expectCommitted(await saveOwnedPlan(request));
    expect(replay).toMatchObject({
      outcome: "already_committed",
      plan: { revision: first.plan.revision },
    });

    const reopened = await reopenRuntime(runtime.databasePath);
    const durableReplay = expectCommitted(await saveOwnedPlan({
      ...request,
      repository: reopened.repository,
    }));
    expect(durableReplay).toMatchObject({
      outcome: "already_committed",
      plan: { revision: first.plan.revision },
    });
    await expect(saveOwnedPlan({
      ...request,
      repository: reopened.repository,
      input: {
        ...request.input,
        plan: completePlan({ name: "Different request bytes" }),
      },
    })).rejects.toMatchObject({
      code: "owned_plan_idempotency_conflict",
    });

    const parallel = await Promise.allSettled([
      saveOwnedPlan({
        repository: reopened.repository,
        invalidate: async () => undefined,
        sha256,
        input: {
          requestId: "parallel-a",
          expectedRevision: first.plan.revision,
          savedAtMs: 9_000,
          plan: completePlan({ name: "Parallel A" }),
        },
      }),
      saveOwnedPlan({
        repository: reopened.repository,
        invalidate: async () => undefined,
        sha256,
        input: {
          requestId: "parallel-b",
          expectedRevision: first.plan.revision,
          savedAtMs: 9_001,
          plan: completePlan({ name: "Parallel B" }),
        },
      }),
    ]);
    expect(parallel.map(({ status }) => status).sort()).toEqual([
      "fulfilled",
      "rejected",
    ]);
    expect(
      parallel.find(({ status }) => status === "rejected"),
    ).toMatchObject({
      reason: expect.objectContaining({
        code: "owned_plan_revision_conflict",
      }),
    });
  });

  it("rolls back aggregate rows and receipt when commit fails", async () => {
    const runtime = await setupRuntime({ failCommit: true });

    await expect(createOwnedPlanDraft({
      repository: runtime.repository,
      invalidate: async () => undefined,
      sha256,
      input: {
        requestId: "create-failed",
        planId: "plan-failed",
        name: "Failed Plan",
        dayId: "day-failed",
        dayName: "Failed Day",
        createdAtMs: 10_000,
      },
    })).rejects.toMatchObject({ code: "sqlite_commit_failed" });
    const inspection = new DatabaseSync(runtime.databasePath);
    expect(inspection.prepare(
      "SELECT COUNT(*) AS count FROM plans WHERE id = 'plan-failed'",
    ).get()).toEqual({ count: 0 });
    expect(inspection.prepare(
      `SELECT COUNT(*) AS count
       FROM owned_plan_mutation_requests
       WHERE request_id = 'create-failed'`,
    ).get()).toEqual({ count: 0 });
    inspection.close();
  });

  it("exposes typed repository conflicts without target payload diagnostics", async () => {
    const runtime = await setupRuntime();
    await createAndSave(runtime);

    await expect(archiveOwnedPlan({
      repository: runtime.repository,
      invalidate: async () => undefined,
      sha256,
      input: {
        requestId: "archive-stale",
        planId: "plan-owner",
        expectedRevision: 1,
        updatedAtMs: 11_000,
      },
    })).rejects.toBeInstanceOf(OwnedPlanConflictError);
    await expect(archiveOwnedPlan({
      repository: runtime.repository,
      invalidate: async () => undefined,
      sha256,
      input: {
        requestId: "archive-stale",
        planId: "plan-owner",
        expectedRevision: 1,
        updatedAtMs: 11_000,
      },
    })).rejects.toMatchObject({
      code: "owned_plan_revision_conflict",
      correlationCode: "GT-PLAN03",
    });
  });

  it("rejects existing creates plus missing and stale save/duplicate/lifecycle requests", async () => {
    const runtime = await setupRuntime();
    const saved = await createAndSave(runtime);

    await expect(createOwnedPlanDraft({
      repository: runtime.repository,
      invalidate: async () => undefined,
      sha256,
      input: {
        requestId: "create-existing",
        planId: "plan-owner",
        name: "Existing",
        dayId: "day-existing",
        dayName: "Day",
        createdAtMs: 12_000,
      },
    })).rejects.toMatchObject({ code: "owned_plan_already_exists" });
    await expect(saveOwnedPlan({
      repository: runtime.repository,
      invalidate: async () => undefined,
      sha256,
      input: {
        requestId: "save-missing",
        expectedRevision: 1,
        savedAtMs: 12_001,
        plan: completePlan({ id: "missing-plan" }),
      },
    })).rejects.toMatchObject({ code: "owned_plan_not_found" });
    await expect(duplicateOwnedPlan({
      repository: runtime.repository,
      invalidate: async () => undefined,
      sha256,
      input: {
        requestId: "duplicate-missing",
        sourcePlanId: "missing-plan",
        expectedRevision: 1,
        newPlanId: "missing-copy",
        name: "Missing Copy",
        duplicatedAtMs: 12_002,
      },
    })).rejects.toMatchObject({ code: "owned_plan_not_found" });
    await expect(duplicateOwnedPlan({
      repository: runtime.repository,
      invalidate: async () => undefined,
      sha256,
      input: {
        requestId: "duplicate-stale",
        sourcePlanId: "plan-owner",
        expectedRevision: 1,
        newPlanId: "stale-copy",
        name: "Stale Copy",
        duplicatedAtMs: 12_003,
      },
    })).rejects.toMatchObject({ code: "owned_plan_revision_conflict" });
    await expect(duplicateOwnedPlan({
      repository: runtime.repository,
      invalidate: async () => undefined,
      sha256,
      input: {
        requestId: "duplicate-existing",
        sourcePlanId: "plan-owner",
        expectedRevision: saved.plan.revision,
        newPlanId: "retained-plan",
        name: "Existing Copy",
        duplicatedAtMs: 12_004,
      },
    })).rejects.toMatchObject({ code: "owned_plan_already_exists" });
    await expect(archiveOwnedPlan({
      repository: runtime.repository,
      invalidate: async () => undefined,
      sha256,
      input: {
        requestId: "archive-missing",
        planId: "missing-plan",
        expectedRevision: 1,
        updatedAtMs: 12_005,
      },
    })).rejects.toMatchObject({ code: "owned_plan_not_found" });
  });

  it("keeps empty drafts valid for Save and duplicates them without schedules", async () => {
    const runtime = await setupRuntime();
    const created = expectCommitted(await createOwnedPlanDraft({
      repository: runtime.repository,
      invalidate: async () => undefined,
      sha256,
      input: {
        requestId: "create-empty",
        planId: "plan-empty",
        name: "Empty Plan",
        dayId: "day-empty",
        dayName: "Empty Day",
        createdAtMs: 13_000,
      },
    }));
    const saved = expectCommitted(await saveOwnedPlan({
      repository: runtime.repository,
      invalidate: async () => undefined,
      sha256,
      input: {
        requestId: "save-empty",
        expectedRevision: created.plan.revision,
        savedAtMs: 13_001,
        plan: {
          id: "plan-empty",
          name: "Empty Plan",
          days: [{
            id: "day-empty",
            name: "Empty Day",
            ordinal: 0,
            occurrences: [],
          }],
        },
      },
    }));
    const duplicate = expectCommitted(await duplicateOwnedPlan({
      repository: runtime.repository,
      invalidate: async () => undefined,
      sha256,
      input: {
        requestId: "duplicate-empty",
        sourcePlanId: "plan-empty",
        expectedRevision: saved.plan.revision,
        newPlanId: "plan-empty-copy",
        name: "Empty Plan Copy",
        duplicatedAtMs: 13_002,
      },
    }));

    expect(saved.plan).toMatchObject({
      lifecycle: "draft",
      graphStatus: "missing_valid_target",
    });
    expect(duplicate.plan).toMatchObject({
      lifecycle: "draft",
      graphStatus: "missing_valid_target",
      scheduleDefaults: null,
    });
  });

  it("duplicates warmups without a source schedule and requires impact before active archive", async () => {
    const runtime = await setupRuntime();
    const saved = await createAndSave(runtime);
    const duplicate = expectCommitted(await duplicateOwnedPlan({
      repository: runtime.repository,
      invalidate: async () => undefined,
      sha256,
      input: {
        requestId: "duplicate-owner-no-schedule",
        sourcePlanId: "plan-owner",
        expectedRevision: saved.plan.revision,
        newPlanId: "plan-owner-copy",
        name: "Owner Copy",
        duplicatedAtMs: 14_000,
      },
    }));

    expect(duplicate.plan.days[0]!.occurrences[0]!.warmups).toEqual([
      expect.objectContaining({
        id: "plan-owner-copy:warmup:0:0:0",
        loadGrams: 10_000,
        reps: 5,
      }),
    ]);
    const impact = await archiveOwnedPlan({
      repository: runtime.repository,
      invalidate: async () => undefined,
      sha256,
      input: {
        requestId: "archive-active",
        planId: "retained-plan",
        expectedRevision: 4,
        updatedAtMs: 14_001,
      },
    });
    expect(impact).toMatchObject({
      outcome: "requires_schedule_impact",
      activeScheduleId: "retained-schedule",
    });
  });

  it("handles a schedule without a version and rejects cross-plan binding topology", async () => {
    const runtime = await setupRuntime();
    const saved = await createAndSave(runtime);
    await runtime.kernel.write(async (transaction) => {
      await transaction.execute(
        `INSERT INTO owned_plan_schedules
          (id, plan_id, lifecycle, revision, activated_at_ms,
           deactivated_at_ms)
         VALUES (
           'owner-schedule-empty', 'plan-owner', 'inactive', 1, 1, 1
         )`,
      );
    });
    const noVersionCopy = expectCommitted(await duplicateOwnedPlan({
      repository: runtime.repository,
      invalidate: async () => undefined,
      sha256,
      input: {
        requestId: "duplicate-no-version",
        sourcePlanId: "plan-owner",
        expectedRevision: saved.plan.revision,
        newPlanId: "plan-no-version-copy",
        name: "No Version Copy",
        duplicatedAtMs: 15_000,
      },
    }));
    expect(noVersionCopy.plan.scheduleDefaults).toMatchObject({
      lifecycle: "inactive",
      version: null,
    });

    const second = await setupRuntime();
    const secondSaved = await createAndSave(second);
    await second.kernel.write(async (transaction) => {
      await transaction.execute(
        `INSERT INTO owned_plan_schedules
          (id, plan_id, lifecycle, revision, activated_at_ms,
           deactivated_at_ms)
         VALUES ('owner-schedule', 'plan-owner', 'inactive', 1, 1, 1)`,
      );
      await transaction.execute(
        `INSERT INTO owned_plan_schedule_versions
          (id, schedule_id, version_number, effective_local_date, mode,
           timezone, rotation_pointer, created_at_ms)
         VALUES (
           'owner-schedule-version', 'owner-schedule', 1, '2026-08-18',
           'weekday', 'Asia/Singapore', NULL, 1
         )`,
      );
      await transaction.execute(
        `INSERT INTO owned_plan_schedule_bindings
          (id, schedule_version_id, mode, ordinal, week_index, weekday,
           plan_day_id)
         VALUES (
           'owner-cross-binding', 'owner-schedule-version', 'weekday', 0, 0,
           'Monday', 'retained-day'
         )`,
      );
    });
    await expect(duplicateOwnedPlan({
      repository: second.repository,
      invalidate: async () => undefined,
      sha256,
      input: {
        requestId: "duplicate-cross-binding",
        sourcePlanId: "plan-owner",
        expectedRevision: secondSaved.plan.revision,
        newPlanId: "plan-cross-copy",
        name: "Cross Copy",
        duplicatedAtMs: 15_001,
      },
    })).rejects.toMatchObject({ code: "sqlite_transaction_failed" });
  });

  it("rejects malformed aggregate JSON, missing policies, and corrupt durable receipts", async () => {
    const runtime = await setupRuntime();
    const saved = await createAndSave(runtime);
    await runtime.kernel.write((transaction) =>
      transaction.execute(
        `UPDATE owned_plan_working_set_targets
         SET target_json = '[]'
         WHERE id = 'target-owner-squat-a'`,
      )
    );
    await expect(saveOwnedPlan({
      repository: runtime.repository,
      invalidate: async () => undefined,
      sha256,
      input: {
        requestId: "save-corrupt-json",
        expectedRevision: saved.plan.revision,
        savedAtMs: 16_000,
        plan: completePlan(),
      },
    })).rejects.toMatchObject({ code: "sqlite_transaction_failed" });

    const missingPolicy = await setupRuntime();
    await missingPolicy.kernel.write(async (transaction) => {
      await transaction.execute(
        `INSERT INTO plans
          (id, content_pack_id, origin, source_namespace, upstream_id, name,
           days_per_week, audience, goal, estimate_minutes, attribution,
           is_active, revision)
         VALUES (
           'plan-no-policy', NULL, 'custom', NULL, NULL, 'No Policy',
           1, 'Owner', 'Custom', 1, 'Owner-created', 0, 1
         )`,
      );
      await transaction.execute(
        `INSERT INTO plan_days (id, plan_id, ordinal, name, revision)
         VALUES ('day-no-policy', 'plan-no-policy', 0, 'Day', 1)`,
      );
      await transaction.execute(
        `INSERT INTO owned_plan_aggregate_states
          (plan_id, lifecycle, graph_status, missing_requirement_code,
           missing_requirement, created_at_ms, updated_at_ms, archived_at_ms)
         VALUES (
           'plan-no-policy', 'ready', 'valid', NULL, NULL, 1, 1, NULL
         )`,
      );
      await transaction.execute(
        `INSERT INTO owned_plan_day_exercises
          (id, plan_day_id, exercise_id, ordinal,
           between_exercise_rest_seconds, metric_profile,
           metric_contract_version, exercise_metric_generation, revision)
         VALUES (
           'occurrence-no-policy', 'day-no-policy', 'exercise-squat', 0, 60,
           'load_reps', 1, 1, 1
         )`,
      );
      await transaction.execute(
        `INSERT INTO owned_plan_working_set_targets
          (id, plan_day_exercise_id, ordinal, target_json, unit_json,
           metric_profile, metric_contract_version,
           exercise_metric_generation, revision)
         VALUES (
           'target-no-policy', 'occurrence-no-policy', 0,
           '{"profile":"load_reps","version":1,"loadGrams":20000,"minReps":8,"maxReps":12,"incrementGrams":2500,"perSide":false}',
           '{"version":1,"load":"grams","count":"repetitions"}',
           'load_reps', 1, 1, 1
         )`,
      );
    });
    await expect(duplicateOwnedPlan({
      repository: missingPolicy.repository,
      invalidate: async () => undefined,
      sha256,
      input: {
        requestId: "duplicate-no-policy",
        sourcePlanId: "plan-no-policy",
        expectedRevision: 1,
        newPlanId: "plan-no-policy-copy",
        name: "No Policy Copy",
        duplicatedAtMs: 16_001,
      },
    })).rejects.toMatchObject({ code: "sqlite_transaction_failed" });

    const corruptReceipt = await setupRuntime();
    await corruptReceipt.kernel.write((transaction) =>
      transaction.execute(
        `INSERT INTO owned_plan_mutation_requests
          (request_id, request_sha256, operation, source_plan_id,
           result_plan_id, expected_revision, result_revision, result_json,
           committed_at_ms)
         VALUES (
           'corrupt-receipt', ?, 'archive', 'retained-plan',
           'retained-plan', 4, 4, '{}', 1
         )`,
        ["a".repeat(64)],
      )
    );
    await expect(corruptReceipt.repository.archive({
      requestId: "corrupt-receipt",
      requestSha256: "a".repeat(64),
      planId: "retained-plan",
      expectedRevision: 4,
      archived: true,
      updatedAtMs: 1,
    })).rejects.toMatchObject({ code: "sqlite_transaction_failed" });
  });
});
