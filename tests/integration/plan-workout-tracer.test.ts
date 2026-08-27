import {
  afterEach,
  describe,
  expect,
  it,
} from "@jest/globals";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {
  mkdtempSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  parseFullBodyFoundation,
} from "../../src/domains/content";
import {
  activateStarterPlan,
} from "../../src/domains/plans/activateStarterPlan";
import {
  startWorkout,
} from "../../src/domains/workout/startWorkout";
import {
  createPlansWorkoutRepository,
} from "../../src/platform/sqlite/repositories/plansWorkoutRepository";
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
import type {
  RecoveryBackupPort,
} from "../../src/platform/sqlite/recoveryBackup";
import {
  createSqliteKernel,
  type SqliteKernel,
} from "../../src/platform/sqlite/sqliteKernel";

const fixture = require("../../assets/content/full-body-foundation.v1.json") as unknown;

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
    parameters: readonly (null | number | string | Uint8Array)[] = [],
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

const runtimes: SqliteKernel[] = [];
const temporaryDirectories = new Set<string>();
const recoveryBackup: RecoveryBackupPort = {
  createAndValidate: async (request) => ({
    backupId: "plan-workout-" + request.fromVersion + "-" + request.toVersion,
    databaseName: request.databaseName,
    fromVersion: request.fromVersion,
    toVersion: request.toVersion,
    validated: true,
  }),
};

afterEach(async () => {
  await Promise.all(runtimes.splice(0).map((runtime) => runtime.close()));
  for (const directory of temporaryDirectories) {
    rmSync(directory, { force: true, recursive: true });
  }
  temporaryDirectories.clear();
});

async function createRuntime(
  beforeCommit?: () => Promise<void>,
): Promise<SqliteKernel> {
  const directory = mkdtempSync(join(tmpdir(), "gym-plan-workout-"));
  temporaryDirectories.add(directory);
  const databasePath = join(directory, "gym-tracker.db");
  const writer = new NodeSqliteConnection(new DatabaseSync(databasePath));
  const reader = new NodeSqliteConnection(new DatabaseSync(databasePath));
  await configureSqliteConnection(writer, { enableWal: true });
  await configureSqliteConnection(reader, { enableWal: false });
  const kernel = createSqliteKernel(
    { reader, writer },
    beforeCommit === undefined ? {} : { beforeCommit },
  );
  await createMigrationRunner({
    databaseName: "gym-tracker.db",
    kernel,
    migrations,
    recoveryBackup,
  }).run();
  runtimes.push(kernel);
  return kernel;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (typeof value === "object" && value !== null) {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson(
        (value as Record<string, unknown>)[key],
      )}`,
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}

describe("Plan 01-07 starter activation", () => {
  it("validates the exact frozen fixture and canonical digest", () => {
    const parsed = parseFullBodyFoundation(fixture);
    const digest = createHash("sha256")
      .update(canonicalJson(parsed))
      .digest("hex");

    expect(digest).toBe(
      "e4a8af5ffc21052116e10d97b3c9ed3dfbf66b50ae9a1b1e88ae1078278c81fd",
    );
    expect(parsed.metadata).toEqual(expect.objectContaining({
      namespace: "gym-tracker.original",
      templateId: "full-body-foundation",
      sourceRevision: 1,
      displayName: "Full Body Foundation",
      estimateMinutes: 48,
    }));
    expect(parsed.days.map((day) => day.name)).toEqual([
      "Full Body A",
      "Full Body B",
    ]);
    expect(parsed.days[0]?.exercises.map((exercise) => exercise.name)).toEqual([
      "Back Squat",
      "Bench Press",
      "Lat Pulldown",
      "Romanian Deadlift",
      "Plank",
    ]);
    expect(parsed.days[1]?.exercises.map((exercise) => exercise.name)).toEqual([
      "Deadlift",
      "Overhead Press",
      "Seated Cable Row",
      "Reverse Lunge",
      "Side Plank",
    ]);
  });

  it.each([
    ["version", { ...fixture as object, version: 2 }],
    [
      "rep range",
      {
        ...fixture as object,
        days: [{
          ...(fixture as { days: object[] }).days[0],
          exercises: [{
            ...(fixture as { days: { exercises: object[] }[] })
              .days[0]?.exercises[0],
            target: {
              kind: "load_reps",
              loadGrams: 60_000,
              minReps: 9,
              maxReps: 8,
              sets: 3,
              perSide: false,
            },
          }],
        }],
      },
    ],
    [
      "duplicate day",
      {
        ...fixture as object,
        days: [
          (fixture as { days: object[] }).days[0],
          (fixture as { days: object[] }).days[0],
        ],
      },
    ],
    [
      "duplicate exercise",
      {
        ...fixture as object,
        days: [
          (fixture as { days: object[] }).days[0],
          {
            ...(fixture as { days: object[] }).days[1],
            exercises: [
              ...(fixture as { days: { exercises: object[] }[] })
                .days[1]!.exercises.slice(0, 4),
              (fixture as { days: { exercises: object[] }[] })
                .days[0]!.exercises[0],
            ],
          },
        ],
      },
    ],
    [
      "duplicate schedule weekday",
      {
        ...fixture as object,
        metadata: {
          ...(fixture as { metadata: object }).metadata,
          schedule: {
            mode: "weekday",
            cycle: [
              [
                { weekday: "Monday", day: "Full Body A" },
                { weekday: "Monday", day: "Full Body B" },
                { weekday: "Friday", day: "Full Body A" },
              ],
              (fixture as {
                metadata: { schedule: { cycle: object[][] } };
              }).metadata.schedule.cycle[1],
            ],
          },
        },
      },
    ],
    [
      "exercise id",
      {
        ...fixture as object,
        days: [{
          ...(fixture as { days: object[] }).days[0],
          exercises: [{
            ...(fixture as { days: { exercises: object[] }[] })
              .days[0]?.exercises[0],
            exerciseId: "not-a-uuid",
          }],
        }],
      },
    ],
    [
      "dangling schedule day",
      {
        ...fixture as object,
        metadata: {
          ...(fixture as { metadata: object }).metadata,
          schedule: {
            mode: "weekday",
            cycle: [["Monday", "Missing Day"]],
          },
        },
      },
    ],
    [
      "fractional base unit",
      {
        ...fixture as object,
        days: [{
          ...(fixture as { days: object[] }).days[0],
          exercises: [{
            ...(fixture as { days: { exercises: object[] }[] })
              .days[0]?.exercises[0],
            target: {
              kind: "load_reps",
              loadGrams: 60_000.5,
              minReps: 6,
              maxReps: 8,
              sets: 3,
            },
          }],
        }],
      },
    ],
  ])("rejects malformed fixture %s", (_label, invalid) => {
    expect(() => parseFullBodyFoundation(invalid)).toThrow(
      "full_body_foundation_invalid",
    );
  });

  it.each([
    {
      activatedAtMs: -1,
      startLocalDate: "2026-08-17",
      timezone: "Asia/Singapore",
    },
    {
      activatedAtMs: 1,
      startLocalDate: "17-08-2026",
      timezone: "Asia/Singapore",
    },
    {
      activatedAtMs: 1,
      startLocalDate: "2026-08-17",
      timezone: " ",
    },
  ])("rejects invalid activation command input", async (invalid) => {
    const kernel = await createRuntime();
    expect(() => activateStarterPlan({
      fixture: parseFullBodyFoundation(fixture),
      repository: createPlansWorkoutRepository(kernel),
      ...invalid,
    })).toThrow("starter_activation_invalid");
  });

  it("imports bundled rows and atomically activates one copied plan", async () => {
    const kernel = await createRuntime();
    const repository = createPlansWorkoutRepository(kernel);
    const activated = await activateStarterPlan({
      fixture: parseFullBodyFoundation(fixture),
      repository,
      activatedAtMs: 1_786_853_600_000,
      startLocalDate: "2026-08-17",
      timezone: "Asia/Singapore",
    });

    expect(activated.plan).toEqual(expect.objectContaining({
      origin: "copied",
      sourceNamespace: "gym-tracker.original",
      upstreamId: "full-body-foundation",
      name: "Full Body Foundation",
      isActive: true,
      revision: 1,
    }));
    expect(activated.days).toHaveLength(2);
    expect(activated.schedule).toEqual(expect.objectContaining({
      mode: "weekday",
      startLocalDate: "2026-08-17",
      timezone: "Asia/Singapore",
      cycleLengthWeeks: 2,
    }));

    const bundled = await kernel.queryAll<Record<string, unknown>>(
      `SELECT origin, source_namespace, upstream_id, is_active
       FROM plans WHERE origin = 'bundled'`,
    );
    const copied = await kernel.queryAll<Record<string, unknown>>(
      `SELECT origin, source_namespace, upstream_id, is_active
       FROM plans WHERE origin = 'copied'`,
    );
    expect(bundled).toEqual([{
      origin: "bundled",
      source_namespace: "gym-tracker.original",
      upstream_id: "full-body-foundation",
      is_active: 0,
    }]);
    expect(copied).toEqual([{
      origin: "copied",
      source_namespace: "gym-tracker.original",
      upstream_id: "full-body-foundation",
      is_active: 1,
    }]);

    const targets = await kernel.queryAll<{
      metric_profile: string;
      target_json: string;
      policy_type: string;
    }>(
      `SELECT e.metric_profile, t.target_json, p.policy_type
       FROM plans copied
       JOIN plan_days d ON d.plan_id = copied.id
       JOIN plan_day_exercises de ON de.plan_day_id = d.id
       JOIN exercises e ON e.id = de.exercise_id
       JOIN plan_working_set_targets t
         ON t.plan_day_exercise_id = de.id
       JOIN progression_policies p
         ON p.plan_day_exercise_id = de.id
       WHERE copied.origin = 'copied'
       ORDER BY d.ordinal, de.ordinal`,
    );
    expect(targets).toHaveLength(30);
    expect(targets.at(-1)).toEqual(expect.objectContaining({
      metric_profile: "timed_hold",
      policy_type: "manual_hold",
    }));
  });

  it("returns the same owned copy on repeated activation without replacing it", async () => {
    const kernel = await createRuntime();
    const repository = createPlansWorkoutRepository(kernel);
    const input = {
      fixture: parseFullBodyFoundation(fixture),
      repository,
      activatedAtMs: 1_786_853_600_000,
      startLocalDate: "2026-08-17",
      timezone: "Asia/Singapore",
    };

    const first = await activateStarterPlan(input);
    await kernel.write(async (transaction) => {
      await transaction.execute(
        "UPDATE plans SET name = ?, revision = revision + 1 WHERE id = ?",
        ["My Foundation", first.plan.id],
      );
      await transaction.execute(
        `UPDATE plan_working_set_targets
         SET load_grams = 62500,
             target_json = json_set(target_json, '$.loadGrams', 62500),
             revision = revision + 1
         WHERE id = (
           SELECT t.id
           FROM plan_working_set_targets t
           JOIN plan_day_exercises de ON de.id = t.plan_day_exercise_id
           JOIN plan_days d ON d.id = de.plan_day_id
           WHERE d.plan_id = ?
           ORDER BY d.ordinal, de.ordinal, t.ordinal
           LIMIT 1
         )`,
        [first.plan.id],
      );
    });
    const second = await activateStarterPlan({
      ...input,
      activatedAtMs: 1_786_853_700_000,
    });

    expect(second.plan.id).toBe(first.plan.id);
    expect(second.plan.name).toBe("My Foundation");
    expect(await kernel.queryAll<{ count: number }>(
      "SELECT COUNT(*) AS count FROM plans WHERE origin = 'copied'",
    )).toEqual([{ count: 1 }]);
    expect(await kernel.queryAll<{
      load_grams: number;
      target_json: string;
      revision: number;
    }>(
      `SELECT t.load_grams, t.target_json, t.revision
       FROM plan_working_set_targets t
       JOIN plan_day_exercises de ON de.id = t.plan_day_exercise_id
       JOIN plan_days d ON d.id = de.plan_day_id
       WHERE d.plan_id = ?
       ORDER BY d.ordinal, de.ordinal, t.ordinal
       LIMIT 1`,
      [first.plan.id],
    )).toEqual([{
      load_grams: 62_500,
      target_json: expect.stringContaining("62500"),
      revision: 2,
    }]);
  });

  it("rolls back imported and copied rows when activation commit fails", async () => {
    let failCommit = false;
    const kernel = await createRuntime(async () => {
      if (failCommit) {
        failCommit = false;
        throw new Error("injected_commit_failure");
      }
    });
    const repository = createPlansWorkoutRepository(kernel);
    failCommit = true;

    await expect(activateStarterPlan({
      fixture: parseFullBodyFoundation(fixture),
      repository,
      activatedAtMs: 1_786_853_600_000,
      startLocalDate: "2026-08-17",
      timezone: "Asia/Singapore",
    })).rejects.toMatchObject({ code: "sqlite_commit_failed" });
    expect(await kernel.queryAll<{ count: number }>(
      "SELECT COUNT(*) AS count FROM plans",
    )).toEqual([{ count: 0 }]);
  });

  it("returns null before activation and exposes the copied plan days after", async () => {
    const kernel = await createRuntime();
    const repository = createPlansWorkoutRepository(kernel);
    expect(await repository.getActivation()).toBeNull();

    const activated = await activateStarterPlan({
      fixture: parseFullBodyFoundation(fixture),
      repository,
      activatedAtMs: 1_786_853_600_000,
      startLocalDate: "2026-08-17",
      timezone: "Asia/Singapore",
    });

    expect(await repository.getActivation()).toEqual(activated);
    expect(await repository.getPlanDays(activated.plan.id)).toEqual(
      activated.days,
    );
  });
});

describe("Plan 01-07 workout starts", () => {
  async function activatedRepository() {
    const kernel = await createRuntime();
    const repository = createPlansWorkoutRepository(kernel);
    const activation = await activateStarterPlan({
      fixture: parseFullBodyFoundation(fixture),
      repository,
      activatedAtMs: 1_786_853_600_000,
      startLocalDate: "2026-08-17",
      timezone: "Asia/Singapore",
    });
    return { kernel, repository, activation };
  }

  for (const [mode, source] of [
    ["scheduled", "scheduled_day"],
    ["alternate", "alternate_day"],
    ["rest_day", "rest_day"],
  ] as const) {
    it(`starts a ${mode} planned session with immutable snapshots`, async () => {
    const { kernel, repository, activation } = await activatedRepository();
    const day = mode === "alternate"
      ? activation.days[1]!
      : activation.days[0]!;
    const session = await startWorkout({
      repository,
      request: {
        mode,
        planId: activation.plan.id,
        planDayId: day.id,
        localDate: "2026-08-17",
        timezone: "Asia/Singapore",
        startedAtMs: 1_786_853_600_000,
      },
    });

    expect(session).toEqual(expect.objectContaining({
      source,
      status: "in_progress",
      planId: activation.plan.id,
      planDayId: day.id,
    }));
    const snapshots = await kernel.queryAll<{
      exercise_name: string;
      metric_profile: string;
      target_json: string;
      unit_json: string;
      rule_type: string;
      rule_version: number;
    }>(
      `SELECT se.exercise_name, se.metric_profile, ss.target_json,
              ss.unit_json, ss.rule_type, ss.rule_version
       FROM session_exercises se
       JOIN session_sets ss ON ss.session_exercise_id = se.id
       WHERE se.session_id = ? AND ss.set_kind = 'working'
       ORDER BY se.ordinal, ss.ordinal`,
      [session.id],
    );
    expect(snapshots).toHaveLength(15);
    expect(snapshots[0]).toEqual(expect.objectContaining({
      exercise_name: day.name === "Full Body A" ? "Back Squat" : "Deadlift",
      metric_profile: "load_reps",
      target_json: expect.stringContaining('"incrementGrams"'),
      rule_type: "load_reps",
      rule_version: 1,
    }));
    expect(snapshots.at(-1)).toEqual(expect.objectContaining({
      metric_profile: "timed_hold",
      rule_type: "manual_hold",
      rule_version: 1,
    }));
    });
  }

  it("starts an empty session without plan rows", async () => {
    const kernel = await createRuntime();
    const repository = createPlansWorkoutRepository(kernel);

    const session = await startWorkout({
      repository,
      request: {
        mode: "empty",
        localDate: "2026-08-17",
        timezone: "Asia/Singapore",
        startedAtMs: 1_786_853_600_000,
      },
    });

    expect(session).toEqual(expect.objectContaining({
      source: "empty",
      planId: null,
      planDayId: null,
    }));
    expect(await kernel.queryAll<{ count: number }>(
      "SELECT COUNT(*) AS count FROM session_exercises WHERE session_id = ?",
      [session.id],
    )).toEqual([{ count: 0 }]);
  });

  it("fails closed and rolls back when planned targets are missing", async () => {
    const kernel = await createRuntime();
    const repository = createPlansWorkoutRepository(kernel);
    const activation = await activateStarterPlan({
      fixture: parseFullBodyFoundation(fixture),
      repository,
      activatedAtMs: 1_786_853_600_000,
      startLocalDate: "2026-08-17",
      timezone: "Asia/Singapore",
    });
    await kernel.write((transaction) => transaction.execute(
      `DELETE FROM plan_working_set_targets
       WHERE plan_day_exercise_id = (
         SELECT id FROM plan_day_exercises
         WHERE plan_day_id = ? AND ordinal = 0
       )`,
      [activation.days[0]!.id],
    ));

    await expect(startWorkout({
      repository,
      request: {
        mode: "scheduled",
        planId: activation.plan.id,
        planDayId: activation.days[0]!.id,
        localDate: "2026-08-17",
        timezone: "Asia/Singapore",
        startedAtMs: 1_786_853_600_000,
      },
    })).rejects.toMatchObject({
      code: "sqlite_transaction_failed",
      cause: expect.objectContaining({
        message: "workout_start_target_missing",
      }),
    });
    expect(await kernel.queryAll<{ count: number }>(
      "SELECT COUNT(*) AS count FROM workout_sessions",
    )).toEqual([{ count: 0 }]);
  });

  it("fails closed and rolls back when a planned day has no exercises", async () => {
    const kernel = await createRuntime();
    const repository = createPlansWorkoutRepository(kernel);
    const activation = await activateStarterPlan({
      fixture: parseFullBodyFoundation(fixture),
      repository,
      activatedAtMs: 1_786_853_600_000,
      startLocalDate: "2026-08-17",
      timezone: "Asia/Singapore",
    });
    await kernel.write((transaction) => transaction.execute(
      "DELETE FROM plan_day_exercises WHERE plan_day_id = ?",
      [activation.days[0]!.id],
    ));

    await expect(startWorkout({
      repository,
      request: {
        mode: "scheduled",
        planId: activation.plan.id,
        planDayId: activation.days[0]!.id,
        localDate: "2026-08-17",
        timezone: "Asia/Singapore",
        startedAtMs: 1_786_853_600_000,
      },
    })).rejects.toMatchObject({
      code: "sqlite_transaction_failed",
      cause: expect.objectContaining({
        message: "workout_start_plan_day_empty",
      }),
    });
    expect(await kernel.queryAll<{ count: number }>(
      "SELECT COUNT(*) AS count FROM workout_sessions",
    )).toEqual([{ count: 0 }]);
  });

  it.each([
    {
      mode: "empty" as const,
      localDate: "invalid",
      timezone: "Asia/Singapore",
      startedAtMs: 1,
    },
    {
      mode: "empty" as const,
      localDate: "2026-08-17",
      timezone: "",
      startedAtMs: 1,
    },
    {
      mode: "empty" as const,
      localDate: "2026-08-17",
      timezone: "Asia/Singapore",
      startedAtMs: -1,
    },
    {
      mode: "scheduled" as const,
      planId: "",
      planDayId: "",
      localDate: "2026-08-17",
      timezone: "Asia/Singapore",
      startedAtMs: 1,
    },
  ])("rejects invalid workout start input", async (request) => {
    const kernel = await createRuntime();
    expect(() => startWorkout({
      repository: createPlansWorkoutRepository(kernel),
      request,
    })).toThrow("workout_start_invalid");
  });

  it("never advances schedule state when starting alternate, rest-day, or empty", async () => {
    const { kernel, repository, activation } = await activatedRepository();
    const before = await kernel.queryAll<Record<string, unknown>>(
      "SELECT * FROM plan_schedules WHERE plan_id = ?",
      [activation.plan.id],
    );

    for (const request of [
      {
        mode: "alternate" as const,
        planId: activation.plan.id,
        planDayId: activation.days[1]!.id,
      },
      {
        mode: "rest_day" as const,
        planId: activation.plan.id,
        planDayId: activation.days[0]!.id,
      },
    ]) {
      const session = await startWorkout({
        repository,
        request: {
          ...request,
          localDate: "2026-08-17",
          timezone: "Asia/Singapore",
          startedAtMs: 1_786_853_600_000,
        },
      });
      await kernel.write((transaction) => transaction.execute(
        "UPDATE workout_sessions SET status = 'discarded' WHERE id = ?",
        [session.id],
      ));
    }
    const empty = await startWorkout({
      repository,
      request: {
        mode: "empty",
        localDate: "2026-08-17",
        timezone: "Asia/Singapore",
        startedAtMs: 1_786_853_600_000,
      },
    });
    await kernel.write((transaction) => transaction.execute(
      "UPDATE workout_sessions SET status = 'discarded' WHERE id = ?",
      [empty.id],
    ));

    expect(await kernel.queryAll<Record<string, unknown>>(
      "SELECT * FROM plan_schedules WHERE plan_id = ?",
      [activation.plan.id],
    )).toEqual(before);
  });
});

describe("Plan 01-07 Today read model", () => {
  it("returns first use before a copied plan exists", async () => {
    const kernel = await createRuntime();
    const repository = createPlansWorkoutRepository(kernel);

    await expect(repository.getTodayView({
      localDate: "2026-08-17",
      weekday: 1,
    })).resolves.toEqual({ state: "no_active_plan" });
  });

  it("resolves alternating scheduled days and profile-aware targets", async () => {
    const kernel = await createRuntime();
    const repository = createPlansWorkoutRepository(kernel);
    await activateStarterPlan({
      fixture: parseFullBodyFoundation(fixture),
      repository,
      activatedAtMs: 1_786_853_600_000,
      startLocalDate: "2026-08-17",
      timezone: "Asia/Singapore",
    });

    const firstWeek = await repository.getTodayView({
      localDate: "2026-08-17",
      weekday: 1,
    });
    expect(firstWeek).toEqual(expect.objectContaining({
      state: "scheduled",
      planName: "Full Body Foundation",
      dayName: "Full Body A",
      estimateMinutes: 48,
    }));
    if (firstWeek.state !== "scheduled") {
      throw new Error("expected_scheduled_today");
    }
    expect(firstWeek.exercises).toHaveLength(5);
    expect(firstWeek.exercises[0]).toEqual(expect.objectContaining({
      name: "Back Squat",
      nextTarget: "60 kg × 8",
      history: null,
      recommendationStatus: "none",
    }));
    expect(firstWeek.exercises.at(-1)).toEqual(expect.objectContaining({
      name: "Plank",
      nextTarget: "45 sec",
    }));

    await expect(repository.getTodayView({
      localDate: "2026-08-24",
      weekday: 1,
    })).resolves.toEqual(expect.objectContaining({
      state: "scheduled",
      dayName: "Full Body B",
    }));
    const secondWeek = await repository.getTodayView({
      localDate: "2026-08-24",
      weekday: 1,
    });
    if (secondWeek.state !== "scheduled") {
      throw new Error("expected_scheduled_today");
    }
    expect(secondWeek.exercises[3]).toEqual(expect.objectContaining({
      name: "Reverse Lunge",
      nextTarget: "20 kg × 10 per side",
    }));
    expect(secondWeek.exercises[4]).toEqual(expect.objectContaining({
      name: "Side Plank",
      nextTarget: "30 sec per side",
    }));
  });

  it("returns the next scheduled date on a rest day", async () => {
    const kernel = await createRuntime();
    const repository = createPlansWorkoutRepository(kernel);
    await activateStarterPlan({
      fixture: parseFullBodyFoundation(fixture),
      repository,
      activatedAtMs: 1_786_853_600_000,
      startLocalDate: "2026-08-17",
      timezone: "Asia/Singapore",
    });

    await expect(repository.getTodayView({
      localDate: "2026-08-18",
      weekday: 2,
    })).resolves.toEqual(expect.objectContaining({
      state: "rest_day",
      nextDayName: "Full Body B",
      nextLocalDate: "2026-08-19",
    }));
  });

  it("finds the first scheduled day when Today precedes schedule start", async () => {
    const kernel = await createRuntime();
    const repository = createPlansWorkoutRepository(kernel);
    await activateStarterPlan({
      fixture: parseFullBodyFoundation(fixture),
      repository,
      activatedAtMs: 1_786_853_600_000,
      startLocalDate: "2026-08-17",
      timezone: "Asia/Singapore",
    });

    await expect(repository.getTodayView({
      localDate: "2026-08-16",
      weekday: 7,
    })).resolves.toEqual(expect.objectContaining({
      state: "rest_day",
      nextDayName: "Full Body A",
      nextLocalDate: "2026-08-17",
    }));
  });

  it("traverses Sunday while finding the next scheduled workout", async () => {
    const kernel = await createRuntime();
    const repository = createPlansWorkoutRepository(kernel);
    await activateStarterPlan({
      fixture: parseFullBodyFoundation(fixture),
      repository,
      activatedAtMs: 1_786_853_600_000,
      startLocalDate: "2026-08-17",
      timezone: "Asia/Singapore",
    });

    await expect(repository.getTodayView({
      localDate: "2026-08-22",
      weekday: 6,
    })).resolves.toEqual(expect.objectContaining({
      state: "rest_day",
      nextDayName: "Full Body B",
      nextLocalDate: "2026-08-24",
    }));
  });

  it("fails closed when an active schedule has no bindings", async () => {
    const kernel = await createRuntime();
    const repository = createPlansWorkoutRepository(kernel);
    const activation = await activateStarterPlan({
      fixture: parseFullBodyFoundation(fixture),
      repository,
      activatedAtMs: 1_786_853_600_000,
      startLocalDate: "2026-08-17",
      timezone: "Asia/Singapore",
    });
    await kernel.write(async (transaction) => {
      await transaction.execute(
        `DELETE FROM plan_schedule_bindings
         WHERE schedule_id = ? AND id <> (
           SELECT id FROM plan_schedule_bindings
           WHERE schedule_id = ?
           ORDER BY id
           LIMIT 1
         )`,
        [activation.schedule.id, activation.schedule.id],
      );
      await transaction.execute(
        `UPDATE plan_schedule_bindings
         SET week_index = 99
         WHERE schedule_id = ?`,
        [activation.schedule.id],
      );
    });

    await expect(repository.getTodayView({
      localDate: "2026-08-01",
      weekday: 6,
    })).rejects.toThrow("plan_schedule_empty");
  });

  it("returns active workout context with persisted pointer and rest state", async () => {
    const kernel = await createRuntime();
    const repository = createPlansWorkoutRepository(kernel);
    const activation = await activateStarterPlan({
      fixture: parseFullBodyFoundation(fixture),
      repository,
      activatedAtMs: 1_786_853_600_000,
      startLocalDate: "2026-08-17",
      timezone: "Asia/Singapore",
    });
    const session = await startWorkout({
      repository,
      request: {
        mode: "scheduled",
        planId: activation.plan.id,
        planDayId: activation.days[0]!.id,
        localDate: "2026-08-17",
        timezone: "Asia/Singapore",
        startedAtMs: 1_786_853_600_000,
      },
    });
    await kernel.write((transaction) => transaction.execute(
      `INSERT INTO session_rest_states
        (session_id, state_version, status, started_at_ms, ends_at_ms,
         remaining_ms, expired_at_ms, next_set_id, revision)
       VALUES (?, 1, 'paused', NULL, NULL, 60000, NULL, NULL, 1)`,
      [session.id],
    ));

    await expect(repository.getTodayView({
      localDate: "2026-08-17",
      weekday: 1,
    })).resolves.toEqual(expect.objectContaining({
      state: "active_workout",
      sessionId: session.id,
      exerciseName: "Back Squat",
      setLabel: "Working set 1",
      restStatus: "paused",
    }));
  });

  it("returns null active context for an empty workout and a working-set label", async () => {
    const emptyKernel = await createRuntime();
    const emptyRepository = createPlansWorkoutRepository(emptyKernel);
    const empty = await startWorkout({
      repository: emptyRepository,
      request: {
        mode: "empty",
        localDate: "2026-08-17",
        timezone: "Asia/Singapore",
        startedAtMs: 1_786_853_600_001,
      },
    });
    await expect(emptyRepository.getTodayView({
      localDate: "2026-08-17",
      weekday: 1,
    })).resolves.toEqual({
      state: "active_workout",
      sessionId: empty.id,
      exerciseName: null,
      setLabel: null,
      restStatus: "idle",
    });
    await emptyKernel.write((transaction) => transaction.execute(
      "UPDATE workout_sessions SET status = 'discarded' WHERE id = ?",
      [empty.id],
    ));

    const plannedKernel = await createRuntime();
    const plannedRepository = createPlansWorkoutRepository(plannedKernel);
    const activation = await activateStarterPlan({
      fixture: parseFullBodyFoundation(fixture),
      repository: plannedRepository,
      activatedAtMs: 1_786_853_600_010,
      startLocalDate: "2026-08-17",
      timezone: "Asia/Singapore",
    });
    const planned = await startWorkout({
      repository: plannedRepository,
      request: {
        mode: "scheduled",
        planId: activation.plan.id,
        planDayId: activation.days[0]!.id,
        localDate: "2026-08-17",
        timezone: "Asia/Singapore",
        startedAtMs: 1_786_853_600_010,
      },
    });
    await plannedKernel.write(async (transaction) => {
      const [working] = await transaction.queryAll<{ id: string }>(
        `SELECT ss.id
         FROM session_sets ss
         JOIN session_exercises se ON se.id = ss.session_exercise_id
         WHERE se.session_id = ? AND se.ordinal = 0
           AND ss.set_kind = 'working'
         ORDER BY ss.ordinal
         LIMIT 1`,
        [planned.id],
      );
      await transaction.execute(
        "UPDATE workout_sessions SET active_set_id = ? WHERE id = ?",
        [working!.id, planned.id],
      );
    });
    await expect(plannedRepository.getTodayView({
      localDate: "2026-08-17",
      weekday: 1,
    })).resolves.toEqual(expect.objectContaining({
      state: "active_workout",
      setLabel: "Working set 1",
      restStatus: "idle",
    }));
  });

  it("shows completed comparable history and a pending suggestion without replacing target", async () => {
    const kernel = await createRuntime();
    const repository = createPlansWorkoutRepository(kernel);
    const activation = await activateStarterPlan({
      fixture: parseFullBodyFoundation(fixture),
      repository,
      activatedAtMs: 1_786_853_600_000,
      startLocalDate: "2026-08-17",
      timezone: "Asia/Singapore",
    });
    const session = await startWorkout({
      repository,
      request: {
        mode: "scheduled",
        planId: activation.plan.id,
        planDayId: activation.days[0]!.id,
        localDate: "2026-08-15",
        timezone: "Asia/Singapore",
        startedAtMs: 1_786_680_800_000,
      },
    });
    await kernel.write(async (transaction) => {
      await transaction.execute(
        `UPDATE session_sets
         SET observed_load_grams = target_load_grams,
             observed_reps = CASE ordinal WHEN 2 THEN 7 ELSE 8 END,
             observed_json = json_object(
               'version', 1,
               'profile', 'load_reps',
               'loadGrams', target_load_grams,
               'reps', CASE ordinal WHEN 2 THEN 7 ELSE 8 END
             ),
             status = 'completed',
             completed_at_ms = 1786680900000,
             revision = revision + 1
         WHERE session_exercise_id = (
           SELECT id FROM session_exercises
           WHERE session_id = ? AND ordinal = 0
         ) AND set_kind = 'working'`,
        [session.id],
      );
      await transaction.execute(
        `UPDATE workout_sessions
         SET status = 'completed', completed_at_ms = 1786681000000,
             active_session_exercise_id = NULL, active_set_id = NULL,
             revision = revision + 1
         WHERE id = ?`,
        [session.id],
      );
      const [target] = await transaction.queryAll<{
        id: string;
        revision: number;
        metric_profile: string;
        metric_contract_version: number;
        exercise_metric_generation: number;
      }>(
        `SELECT t.id, t.revision, t.metric_profile,
                t.metric_contract_version, t.exercise_metric_generation
         FROM plan_working_set_targets t
         JOIN plan_day_exercises de ON de.id = t.plan_day_exercise_id
         JOIN plan_days d ON d.id = de.plan_day_id
         WHERE d.plan_id = ? AND d.ordinal = 0
         ORDER BY de.ordinal, t.ordinal
         LIMIT 1`,
        [activation.plan.id],
      );
      await transaction.execute(
        `INSERT INTO progression_recommendations
          (id, exercise_id, plan_working_set_target_id, rule_type,
           rule_version, evidence_version, evidence_json,
           current_target_json, proposed_target_json, status,
           metric_profile, metric_contract_version,
           exercise_metric_generation,
           source_revision, target_revision, created_at_ms, decided_at_ms)
         VALUES (?, ?, ?, 'load_reps', 1, 1, '{}', ?, ?, 'pending',
                 ?, ?, ?, 1, ?, ?, NULL)`,
        [
          "recommendation-today",
          "5f140001-7e35-4a6d-9100-000000000001",
          target!.id,
          JSON.stringify({ loadGrams: 60_000, reps: 8 }),
          JSON.stringify({ loadGrams: 62_500, reps: 6 }),
          target!.metric_profile,
          target!.metric_contract_version,
          target!.exercise_metric_generation,
          target!.revision,
          1_786_853_500_000,
        ],
      );
    });

    const today = await repository.getTodayView({
      localDate: "2026-08-17",
      weekday: 1,
    });
    if (today.state !== "scheduled") {
      throw new Error("expected_scheduled_today");
    }
    expect(today.exercises[0]).toEqual(expect.objectContaining({
      name: "Back Squat",
      nextTarget: "60 kg × 8",
      history: {
        summary: "Last 60 kg · 8 / 8 / 7",
        change: null,
      },
      recommendationStatus: "pending",
    }));
  });

  it("shows timed-hold comparable history and ignores incomplete load observations", async () => {
    const kernel = await createRuntime();
    const repository = createPlansWorkoutRepository(kernel);
    const activation = await activateStarterPlan({
      fixture: parseFullBodyFoundation(fixture),
      repository,
      activatedAtMs: 1_786_853_600_000,
      startLocalDate: "2026-08-17",
      timezone: "Asia/Singapore",
    });
    const session = await startWorkout({
      repository,
      request: {
        mode: "scheduled",
        planId: activation.plan.id,
        planDayId: activation.days[0]!.id,
        localDate: "2026-08-15",
        timezone: "Asia/Singapore",
        startedAtMs: 1_786_680_800_000,
      },
    });
    await kernel.write(async (transaction) => {
      await transaction.execute(
        `UPDATE session_sets
         SET observed_json = json_object(
               'version', 1,
               'profile', 'timed_hold',
               'durationSeconds', 45
             ),
             status = 'completed',
             completed_at_ms = 1786680900000,
             revision = revision + 1
         WHERE session_exercise_id = (
           SELECT id FROM session_exercises
           WHERE session_id = ? AND ordinal = 4
         ) AND set_kind = 'working'`,
        [session.id],
      );
      await transaction.execute(
        `UPDATE session_sets
         SET observed_reps = 8,
             status = 'completed',
             completed_at_ms = 1786680900000,
             revision = revision + 1
         WHERE session_exercise_id = (
           SELECT id FROM session_exercises
           WHERE session_id = ? AND ordinal = 0
         ) AND set_kind = 'working'`,
        [session.id],
      );
      await transaction.execute(
        `UPDATE workout_sessions
         SET status = 'completed', completed_at_ms = 1786681000000,
             active_session_exercise_id = NULL, active_set_id = NULL,
             revision = revision + 1
         WHERE id = ?`,
        [session.id],
      );
    });

    const today = await repository.getTodayView({
      localDate: "2026-08-17",
      weekday: 1,
    });
    if (today.state !== "scheduled") {
      throw new Error("expected_scheduled_today");
    }
    expect(today.exercises[0]?.history).toBeNull();
    expect(today.exercises.at(-1)?.history).toEqual({
      summary: "Last 45 / 45 / 45 sec",
      change: null,
    });
  });

  it("ignores completed timed-hold rows without a valid duration observation", async () => {
    const kernel = await createRuntime();
    const repository = createPlansWorkoutRepository(kernel);
    const activation = await activateStarterPlan({
      fixture: parseFullBodyFoundation(fixture),
      repository,
      activatedAtMs: 1_786_853_600_000,
      startLocalDate: "2026-08-17",
      timezone: "Asia/Singapore",
    });
    const session = await startWorkout({
      repository,
      request: {
        mode: "scheduled",
        planId: activation.plan.id,
        planDayId: activation.days[0]!.id,
        localDate: "2026-08-15",
        timezone: "Asia/Singapore",
        startedAtMs: 1_786_680_800_000,
      },
    });
    await kernel.write(async (transaction) => {
      await transaction.execute(
        `UPDATE session_sets
         SET observed_json = CASE ordinal
               WHEN 0 THEN NULL
               ELSE json_object('version', 1, 'profile', 'timed_hold')
             END,
             status = 'completed',
             completed_at_ms = 1786680900000
         WHERE session_exercise_id = (
           SELECT id FROM session_exercises
           WHERE session_id = ? AND ordinal = 4
         ) AND set_kind = 'working'`,
        [session.id],
      );
      await transaction.execute(
        `UPDATE workout_sessions
         SET status = 'completed', completed_at_ms = 1786681000000,
             active_session_exercise_id = NULL, active_set_id = NULL
         WHERE id = ?`,
        [session.id],
      );
    });

    const today = await repository.getTodayView({
      localDate: "2026-08-17",
      weekday: 1,
    });
    if (today.state !== "scheduled") {
      throw new Error("expected_scheduled_today");
    }
    expect(today.exercises.at(-1)?.history).toBeNull();
  });
});
