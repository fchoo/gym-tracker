import fullBodyFoundationAsset from "../../assets/content/full-body-foundation.v1.json";
import { createProductionWorkoutAppRuntimeDependencies, type WorkoutAppRuntimeDependencies } from "../bootstrap/workoutAppRuntime";
import { createOwnedPlanRuntimePort } from "../bootstrap/ownedPlanRuntime";
import { createRunningPlanRuntimePort } from "../bootstrap/runningPlanRuntime";
import { parseFullBodyFoundation } from "../domains/content";
import { createCustomExercise as createCustomExerciseCommand } from "../domains/library/customExerciseCommands";
import { confirmGarminImportDate, prepareGarminImport } from "../domains/activities/importCommands";
import { canonicalJson } from "../domains/activities/importContracts";
import type { GarminSourceEnvelope } from "../domains/activities/garminActivitySourcePort";
import { activateStarterPlan } from "../domains/plans";
import type { RunningPlanAggregate, RunningSessionKind, RunningSessionRevision } from "../domains/running/contracts";
import type { RestAlertPreferences, RestNotificationPort, RestNotificationScheduleInput } from "../domains/rest";
import { startWorkout } from "../domains/workout";
import { createCustomExerciseRepository } from "../platform/sqlite/repositories/customExerciseRepository";
import { createImportedActivityRepository } from "../platform/sqlite/repositories/importedActivityRepository";
import { createPlansWorkoutRepository } from "../platform/sqlite/repositories/plansWorkoutRepository";
import { captureStrengthOccurrenceSnapshot } from "../platform/sqlite/repositories/strengthOccurrenceSnapshot";
import type { SqliteKernel } from "../platform/sqlite";
import { phase20VisualState } from "./phase20VisualStateRegistry";
import type { Phase20VisualRequest } from "./phase20VisualRequest";

export const PHASE20_VISUAL_NOW = new Date("2026-10-01T01:41:00.000Z");
export const PHASE20_VISUAL_NOW_MS = PHASE20_VISUAL_NOW.getTime();
const PHASE20_VISUAL_ACTIVATED_AT_MS = PHASE20_VISUAL_NOW_MS - 3_600_000;
export const PHASE20_VISUAL_STRENGTH_PLAN_ID = `plan_copy_${PHASE20_VISUAL_ACTIVATED_AT_MS}`;
export const PHASE20_VISUAL_STRENGTH_DAY_ID = `plan_day_${PHASE20_VISUAL_STRENGTH_PLAN_ID}_0`;
export const PHASE20_VISUAL_ACTIVE_SESSION_ID = `session_${PHASE20_VISUAL_NOW_MS}_alternate_day_${PHASE20_VISUAL_STRENGTH_DAY_ID}`;
export const PHASE20_VISUAL_OWNED_PLAN_ID = "phase20-strength-foundation";
export const PHASE20_VISUAL_RUNNING_PLAN_ID = "phase20-running-2k";
export const PHASE20_VISUAL_CUSTOM_EXERCISE_ID = "phase20-tempo-goblet-squat";

async function fixtureSha256(value: string): Promise<string> {
  const { CryptoDigestAlgorithm, digestStringAsync } = require("expo-crypto") as typeof import("expo-crypto");
  return digestStringAsync(CryptoDigestAlgorithm.SHA256, value);
}

export function phase20VisualDatabaseName(nonce: string): string {
  if (!/^[a-f0-9]{32}$/u.test(nonce)) {
    throw new Error("phase20_visual_nonce_invalid");
  }
  return `gym-tracker-phase20-visual-${nonce}.db`;
}

function createFixtureNotificationPort(): RestNotificationPort {
  const scheduled = new Map<string, Readonly<{
    identifier: string;
    sessionId: string;
    restRevision: number;
    endsAtMs: number;
  }>>();
  return Object.freeze({
    ensureChannel: async () => undefined,
    permission: async () => "granted" as const,
    requestPermission: async () => "granted" as const,
    listScheduled: async () => Object.freeze([...scheduled.values()]),
    cancel: async (identifier: string) => { scheduled.delete(identifier); },
    schedule: async (input: RestNotificationScheduleInput) => {
      scheduled.set(input.identifier, Object.freeze(input));
      return input.identifier;
    },
    openSettings: async () => undefined,
  });
}

async function seedLegacyStrengthWorkout(
  kernel: SqliteKernel,
  includeActiveSession: boolean,
): Promise<void> {
  const repository = createPlansWorkoutRepository(kernel);
  const activation = await activateStarterPlan({
    fixture: parseFullBodyFoundation(fullBodyFoundationAsset),
    repository,
    activatedAtMs: PHASE20_VISUAL_ACTIVATED_AT_MS,
    startLocalDate: "2026-09-28",
    timezone: "Asia/Singapore",
  });
  if (!includeActiveSession) return;
  const day = activation.days[0];
  if (day === undefined) throw new Error("phase20_visual_fixture_day_missing");
  const started = await startWorkout({
    repository,
    request: {
      mode: "alternate",
      planId: activation.plan.id,
      planDayId: day.id,
      localDate: "2026-10-01",
      timezone: "Asia/Singapore",
      startedAtMs: PHASE20_VISUAL_NOW_MS,
    },
  });
  if (started.id !== PHASE20_VISUAL_ACTIVE_SESSION_ID) {
    throw new Error("phase20_visual_fixture_session_identity_invalid");
  }
}

async function configureActiveScenario(
  kernel: SqliteKernel,
  scenario: string,
): Promise<void> {
  const rows = await kernel.queryAll<Readonly<{
    id: string;
    session_exercise_id: string;
    set_kind: "warmup" | "working";
    metric_profile: string;
    target_load_grams: number;
    target_min_reps: number;
  }>>(
    `SELECT set_row.id, set_row.session_exercise_id, set_row.set_kind,
            set_row.metric_profile, set_row.target_load_grams,
            set_row.target_min_reps
     FROM session_sets set_row
     JOIN session_exercises exercise ON exercise.id = set_row.session_exercise_id
     WHERE exercise.session_id = ?
     ORDER BY exercise.ordinal, set_row.set_kind DESC, set_row.ordinal`,
    [PHASE20_VISUAL_ACTIVE_SESSION_ID],
  );
  const warmups = rows.filter(({ set_kind: kind }) => kind === "warmup");
  const working = rows.filter(({ set_kind: kind }) => kind === "working");
  const beforeWorking = scenario === "warmup-before-working";
  const warmupOnly = scenario === "warmup-committed-no-rest";
  const completeFirstWorking = !beforeWorking && !warmupOnly;
  const completed = [...(beforeWorking ? [] : warmups), ...(completeFirstWorking && working[0] !== undefined ? [working[0]] : [])];
  const next = beforeWorking ? warmups[0] ?? working[0] : warmupOnly ? working[0] : working[1] ?? working[0];
  if (next === undefined) throw new Error("phase20_visual_fixture_active_set_missing");
  await kernel.write(async (transaction) => {
    for (const set of completed) {
      const observed = set.metric_profile === "timed_hold"
        ? { version: 1, profile: "timed_hold", durationSeconds: 45, source: "manual" }
        : { version: 1, profile: "load_reps", loadGrams: set.target_load_grams, reps: Math.max(1, set.target_min_reps), source: "manual" };
      await transaction.execute(
        `UPDATE session_sets
         SET status = 'completed', observed_load_grams = ?, observed_reps = ?,
             observed_json = ?, completed_at_ms = ?, revision = revision + 1
         WHERE id = ?`,
        [set.metric_profile === "load_reps" ? set.target_load_grams : null, set.metric_profile === "load_reps" ? Math.max(1, set.target_min_reps) : null, JSON.stringify(observed), PHASE20_VISUAL_NOW_MS, set.id],
      );
    }
    await transaction.execute(
      `UPDATE session_exercises
       SET status = 'active', revision = revision + 1
       WHERE id = ?`,
      [next.session_exercise_id],
    );
    await transaction.execute(
      `UPDATE workout_sessions
       SET active_session_exercise_id = ?, active_set_id = ?, revision = revision + 1
       WHERE id = ?`,
      [next.session_exercise_id, next.id, PHASE20_VISUAL_ACTIVE_SESSION_ID],
    );
    const restState = scenario === "rest-paused" ? { status: "paused", started: null, ends: null, remaining: 45_000, expired: null }
      : scenario === "rest-adjusted" ? { status: "running", started: PHASE20_VISUAL_NOW_MS - 30_000, ends: PHASE20_VISUAL_NOW_MS + 120_000, remaining: null, expired: null }
        : scenario === "rest-resumed" || scenario === "working-committed-rest" ? { status: "running", started: PHASE20_VISUAL_NOW_MS - 45_000, ends: PHASE20_VISUAL_NOW_MS + 45_000, remaining: null, expired: null }
          : null;
    if (restState !== null) {
      await transaction.execute(
        `INSERT INTO session_rest_states
          (session_id, state_version, status, started_at_ms, ends_at_ms,
           remaining_ms, expired_at_ms, next_set_id, revision)
         VALUES (?, 1, ?, ?, ?, ?, ?, ?, 1)
         ON CONFLICT(session_id) DO UPDATE SET
           status = excluded.status, started_at_ms = excluded.started_at_ms,
           ends_at_ms = excluded.ends_at_ms, remaining_ms = excluded.remaining_ms,
           expired_at_ms = excluded.expired_at_ms, next_set_id = excluded.next_set_id,
           revision = session_rest_states.revision + 1`,
        [PHASE20_VISUAL_ACTIVE_SESSION_ID, restState.status, restState.started, restState.ends, restState.remaining, restState.expired, next.id],
      );
    }
  });
}

function runningSession(
  kind: RunningSessionKind,
  ordinal: number,
): RunningPlanAggregate["sessions"][number] {
  const rootId = `phase20-${kind.replaceAll("_", "-")}`;
  const weekday = (["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const)[ordinal]!;
  const phase = [{ ordinal: 0, kind: "work" as const, steps: [{ ordinal: 0, kind: "duration" as const, durationMs: 1_800_000 }] }];
  const common = { version: 1 as const, id: `${rootId}-revision-1`, rootId, planId: PHASE20_VISUAL_RUNNING_PLAN_ID, revision: 1, createdAtMs: PHASE20_VISUAL_NOW_MS, phases: phase };
  let session: RunningSessionRevision;
  switch (kind) {
    case "recovery": session = { ...common, sessionKind: kind, advisoryTarget: { rpe: 3 }, contextual: {} }; break;
    case "long_run": session = { ...common, sessionKind: kind, advisoryTarget: { rpe: 4 }, contextual: { finish: "easy_throughout" } }; break;
    case "progression": session = { ...common, sessionKind: kind, contextual: { stages: 3, startTarget: { rpe: 3 }, finishTarget: { rpe: 7 } } }; break;
    case "tempo": session = { ...common, sessionKind: kind, advisoryTarget: { rpe: 7 }, contextual: { format: "continuous", work: { durationMs: 1_200_000 } } }; break;
    case "intervals": session = { ...common, sessionKind: kind, advisoryTarget: { paceMsPerKm: 275_000 }, contextual: { repetitions: 6, work: { distanceMeters: 400 }, recovery: { durationMs: 90_000 } } }; break;
    case "hills": session = { ...common, sessionKind: kind, advisoryTarget: { rpe: 8 }, contextual: { repetitions: 8, work: { durationMs: 45_000 }, returnRecovery: { durationMs: 60_000 } } }; break;
    case "fartlek": session = { ...common, sessionKind: kind, advisoryTarget: { rpe: 7 }, contextual: { format: "structured", repetitions: 10, work: { durationMs: 60_000 }, recovery: { durationMs: 60_000 } } }; break;
  }
  return Object.freeze({
    session: Object.freeze(session),
    slot: Object.freeze({ id: `${rootId}-slot-revision-1`, rootId: `${rootId}-slot`, weekday, revision: 1, ordinal, sessionRootId: rootId, sessionRevisionId: session.id }),
  });
}

async function seedLibraryAndRunning(kernel: SqliteKernel): Promise<void> {
  let generated = 0;
  const ids = () => `phase20-generated-${String(++generated)}`;
  const owned = createOwnedPlanRuntimePort(kernel, {
    nowMs: () => PHASE20_VISUAL_NOW_MS,
    randomUUID: ids,
    sha256: fixtureSha256,
  });
  const exercises = await owned.listExercises();
  const backSquat = exercises.find(({ name }) => name === "Back Squat") ?? exercises[0];
  if (backSquat === undefined) throw new Error("phase20_visual_fixture_exercise_missing");
  for (const [planId, name] of [[PHASE20_VISUAL_OWNED_PLAN_ID, "Full Body Foundation"], ["phase20-strength-reset", "Strength Reset"]] as const) {
    const dayId = `${planId}-day-a`;
    const created = await owned.createFixtureDraft({ requestId: `${planId}-create`, planId, dayId, name, dayName: name === "Strength Reset" ? "Reset A" : "Full Body A" });
    if (created.outcome === "requires_schedule_impact") throw new Error("phase20_visual_fixture_owned_plan_create_failed");
    const saved = await owned.savePlan({
      requestId: `${planId}-save`,
      expectedRevision: created.plan.revision,
      plan: {
        id: planId,
        name,
        days: [{
          id: dayId,
          name: name === "Strength Reset" ? "Reset A" : "Full Body A",
          ordinal: 0,
          occurrences: [{
            id: `${planId}-back-squat`, exerciseId: backSquat.id, ordinal: 0,
            restSeconds: 90, metricIdentity: backSquat.metricIdentity,
            warmups: [{ id: `${planId}-warmup-1`, ordinal: 0, loadGrams: 20_000, reps: 5 }],
            targets: [{ id: `${planId}-target-1`, ordinal: 0, target: { version: 1, profile: "load_reps", loadGrams: 80_000, minReps: 5, maxReps: 5, incrementGrams: 2_500, perSide: false }, units: { version: 1, load: "grams", count: "repetitions" } }],
            policy: { id: `${planId}-policy`, kind: "manual_hold", policyId: "manual-hold-v1", version: 1, rule: { kind: "manual_hold", id: "manual-hold-v1", version: 1 } },
          }],
        }],
      },
    });
    if (saved.outcome === "requires_schedule_impact") throw new Error("phase20_visual_fixture_owned_plan_save_failed");
  }
  await createCustomExerciseCommand({
    repository: createCustomExerciseRepository(kernel),
    invalidate: async () => undefined,
    input: {
      requestId: "phase20-tempo-goblet-create",
      exerciseId: PHASE20_VISUAL_CUSTOM_EXERCISE_ID,
      name: "Tempo Goblet Squat",
      aliases: ["Goblet squat"],
      exerciseType: "strength",
      movementClass: "compound",
      primaryMuscles: ["quadriceps"],
      secondaryMuscles: ["glutes"],
      equipment: ["dumbbell"],
      metricIdentity: { profile: "load_reps", contractVersion: 1, exerciseMetricGeneration: 1 },
      defaultRestSeconds: 90,
      progression: { kind: "manual_hold", version: 1 },
      createdAtMs: PHASE20_VISUAL_NOW_MS,
    },
  });
  const kinds = ["recovery", "long_run", "progression", "tempo", "intervals", "hills", "fartlek"] as const;
  const running = createRunningPlanRuntimePort(kernel, { nowMs: () => PHASE20_VISUAL_NOW_MS, randomUUID: ids, sha256: fixtureSha256 });
  await running.createInactivePlan({
    requestId: "phase20-running-create",
    plan: {
      version: 1,
      id: PHASE20_VISUAL_RUNNING_PLAN_ID,
      name: "2.4 km speed plan",
      revision: 1,
      createdAtMs: PHASE20_VISUAL_NOW_MS,
      goal: {
        version: 1, id: "phase20-running-goal", planId: PHASE20_VISUAL_RUNNING_PLAN_ID,
        revision: 1, goalDistanceMeters: 2_400, targetDurationMs: 660_000,
        benchmark: { source: "manual", distanceMeters: 2_400, durationMs: 684_000, localDate: "2026-09-24" },
        trainingDays: ["Tuesday", "Friday", "Sunday"], runsPerWeek: 3,
        longRunDay: "Sunday", currentWeeklyDistanceMeters: 12_000, createdAtMs: PHASE20_VISUAL_NOW_MS,
      },
      sessions: kinds.map(runningSession),
    },
  });
  await kernel.write(async (transaction) => {
    await transaction.execute(
      "UPDATE plans SET is_active = 1, revision = revision + 1 WHERE id = ?",
      [PHASE20_VISUAL_OWNED_PLAN_ID],
    );
    await transaction.execute(
      `INSERT INTO owned_plan_schedules
        (id, plan_id, lifecycle, revision, activated_at_ms, deactivated_at_ms, plan_kind)
       VALUES ('phase20-strength-schedule', ?, 'active', 1, ?, NULL, 'strength')`,
      [PHASE20_VISUAL_OWNED_PLAN_ID, PHASE20_VISUAL_NOW_MS],
    );
    await transaction.execute(
      `INSERT INTO owned_plan_schedule_versions
        (id, schedule_id, version_number, effective_local_date, mode, timezone, rotation_pointer, created_at_ms)
       VALUES ('phase20-strength-schedule-v1', 'phase20-strength-schedule', 1,
               '2026-09-28', 'weekday', 'Asia/Singapore', NULL, ?)`,
      [PHASE20_VISUAL_NOW_MS],
    );
    await transaction.execute(
      `INSERT INTO owned_plan_schedule_bindings
        (id, schedule_version_id, mode, ordinal, week_index, weekday, plan_day_id)
       VALUES ('phase20-strength-binding', 'phase20-strength-schedule-v1',
               'weekday', 0, 0, 'Thursday', 'phase20-strength-foundation-day-a')`,
    );
    await transaction.execute(
      "UPDATE plans SET is_active = 1, revision = revision + 1 WHERE id = ?",
      [PHASE20_VISUAL_RUNNING_PLAN_ID],
    );
    await transaction.execute(
      `INSERT INTO owned_plan_schedules
        (id, plan_id, lifecycle, revision, activated_at_ms, deactivated_at_ms, plan_kind)
       VALUES ('phase20-running-schedule', ?, 'active', 1, ?, NULL, 'running')`,
      [PHASE20_VISUAL_RUNNING_PLAN_ID, PHASE20_VISUAL_NOW_MS],
    );
    await transaction.execute(
      `INSERT INTO owned_plan_schedule_versions
        (id, schedule_id, version_number, effective_local_date, mode, timezone, rotation_pointer, created_at_ms)
       VALUES ('phase20-running-schedule-v1', 'phase20-running-schedule', 1, '2026-09-28', 'weekday', 'Asia/Singapore', NULL, ?)`,
      [PHASE20_VISUAL_NOW_MS],
    );
    for (const [ordinal, entry] of kinds.slice(0, 2).map(runningSession).entries()) {
      await transaction.execute(
        `INSERT INTO running_opportunities
          (id, plan_id, schedule_id, schedule_version_id, slot_id, local_date,
           timezone, session_revision_id, state, created_at_ms)
         VALUES (?, ?, 'phase20-running-schedule', 'phase20-running-schedule-v1', ?, ?,
                 'Asia/Singapore', ?, 'planned', ?)`,
        [
          `phase20-running-opportunity-${ordinal + 1}`,
          PHASE20_VISUAL_RUNNING_PLAN_ID,
          entry.slot.id,
          ordinal === 0 ? "2026-10-04" : "2026-10-10",
          entry.session.id,
          PHASE20_VISUAL_NOW_MS,
        ],
      );
    }
  });
}

async function seedImportedActivity(
  kernel: SqliteKernel,
  input: Readonly<{
    activityId: string;
    externalActivityId: string;
    localDate: string;
    startedAtMs: number;
    subtype: "outdoor" | "treadmill";
    distanceMeters: number;
    elapsedMs: number;
  }>,
): Promise<void> {
  const normalized = Object.freeze({
    version: 1 as const,
    started_at_ms: input.startedAtMs,
    source_local_date_time: `${input.localDate}T07:12:00`,
    source_time_zone: "Asia/Singapore",
    source_utc_offset_minutes: 480,
    sport: "running" as const,
    subtype: input.subtype,
    distance_meters: input.distanceMeters,
    elapsed_ms: input.elapsedMs,
    timer_ms: input.elapsedMs - 8_000,
    moving_ms: input.elapsedMs - 12_000,
    average_heart_rate_bpm: input.subtype === "outdoor" ? 148 : 154,
    laps: [
      { ordinal: 0, distance_meters: Math.min(1_000, input.distanceMeters), elapsed_ms: Math.round(input.elapsedMs / Math.max(1, input.distanceMeters / 1_000)), average_heart_rate_bpm: 146 },
    ],
    ...(input.subtype === "outdoor" ? {
      route: [
        { latitude_e6: 1_290_000, longitude_e6: 103_850_000, elapsed_ms: 0 },
        { latitude_e6: 1_291_000, longitude_e6: 103_851_000, elapsed_ms: input.elapsedMs },
      ],
    } : {}),
  });
  const envelope: GarminSourceEnvelope = Object.freeze({
    version: 1,
    source_kind: "garmin_connect_account",
    account_namespace: "phase20-visual-account",
    external_activity_id: input.externalActivityId,
    normalization_version: 1,
    normalized_json_sha256: await fixtureSha256(canonicalJson({ normalization_version: 1, normalized })),
    raw_component_sha256: Object.freeze({ activity: await fixtureSha256(`${input.activityId}:activity`), splits: await fixtureSha256(`${input.activityId}:splits`), details: await fixtureSha256(`${input.activityId}:details`) }),
    sample_fidelity: "source_laps",
    fidelity_by_channel: Object.freeze({ summary: "source_summary", laps: "source_laps", ...(input.subtype === "outdoor" ? { route: "sampled" as const } : {}), exact_effort_basis: "source_laps" }),
    normalized,
  });
  const staged = await prepareGarminImport(envelope, fixtureSha256);
  await confirmGarminImportDate(createImportedActivityRepository(kernel), {
    requestId: `${input.activityId}-import`,
    requestSha256: await fixtureSha256(`${input.activityId}:request`),
    activityId: input.activityId,
    expectedAggregateRevision: 0,
    confirmedLocalDate: input.localDate,
    staged,
  });
}

async function seedProgressAndGarmin(kernel: SqliteKernel, scenario: string): Promise<void> {
  const empty = scenario === "progress-running-empty" || scenario === "progress-running-loading";
  const sparse = scenario === "progress-running-sparse";
  if (!empty && !sparse) await seedImportedActivity(kernel, {
    activityId: "phase20-garmin-outdoor",
    externalActivityId: "phase20-outdoor-001",
    localDate: "2026-10-04",
    startedAtMs: Date.parse("2026-10-03T23:12:00.000Z"),
    subtype: "outdoor",
    distanceMeters: 3_200,
    elapsedMs: 1_122_000,
  });
  if (!empty) await seedImportedActivity(kernel, {
    activityId: "phase20-garmin-treadmill",
    externalActivityId: "phase20-treadmill-001",
    localDate: "2026-10-10",
    startedAtMs: Date.parse("2026-10-10T10:34:00.000Z"),
    subtype: "treadmill",
    distanceMeters: 2_400,
    elapsedMs: 691_000,
  });
}

async function seedCalendar(kernel: SqliteKernel): Promise<void> {
  await seedLibraryAndRunning(kernel);
  await kernel.write(async (transaction) => {
    await transaction.execute(
      `INSERT INTO owned_plan_schedule_opportunities
        (id, schedule_id, schedule_version_id, local_date, source, plan_day_id,
         state, outcome, session_id, revision, consumed_at_ms)
       VALUES ('phase20-strength-occurrence', 'phase20-strength-schedule',
               'phase20-strength-schedule-v1', '2026-10-01', 'weekday',
               'phase20-strength-foundation-day-a', 'pending', NULL, NULL, 1, NULL)`,
    );
    if (!await captureStrengthOccurrenceSnapshot(
      transaction,
      "phase20-strength-occurrence",
      PHASE20_VISUAL_NOW_MS,
    )) {
      throw new Error("phase20_visual_fixture_occurrence_snapshot_failed");
    }
  });
}

async function seedCompletedStrengthHistory(kernel: SqliteKernel): Promise<void> {
  await seedLegacyStrengthWorkout(kernel, true);
  await kernel.write(async (transaction) => {
    await transaction.execute(
      `UPDATE session_sets
       SET status = 'completed',
           observed_load_grams = CASE WHEN metric_profile = 'load_reps' THEN target_load_grams ELSE NULL END,
           observed_reps = CASE WHEN metric_profile = 'load_reps' THEN target_min_reps ELSE NULL END,
           observed_json = CASE
             WHEN metric_profile = 'timed_hold' THEN json_object('version', 1, 'profile', 'timed_hold', 'durationSeconds', 45, 'source', 'manual')
             ELSE json_object('version', 1, 'profile', 'load_reps', 'loadGrams', target_load_grams, 'reps', target_min_reps, 'source', 'manual')
           END,
           completed_at_ms = ?,
           revision = revision + 1
       WHERE session_exercise_id IN (
         SELECT id FROM session_exercises WHERE session_id = ?
       )`,
      [PHASE20_VISUAL_NOW_MS + 1_000, PHASE20_VISUAL_ACTIVE_SESSION_ID],
    );
    await transaction.execute(
      `UPDATE session_exercises
       SET status = 'completed', revision = revision + 1
       WHERE session_id = ?`,
      [PHASE20_VISUAL_ACTIVE_SESSION_ID],
    );
    await transaction.execute(
      `UPDATE workout_sessions
       SET status = 'completed', completed_at_ms = ?,
           active_session_exercise_id = NULL, active_set_id = NULL,
           revision = revision + 1
       WHERE id = ?`,
      [PHASE20_VISUAL_NOW_MS + 2_000, PHASE20_VISUAL_ACTIVE_SESSION_ID],
    );
  });
}

export async function bootstrapPhase20VisualFixture(
  kernel: SqliteKernel,
  request: Phase20VisualRequest,
): Promise<void> {
  const state = phase20VisualState(request.state);
  if (state === null || state.fixture_id !== "v12-synthetic-fixtures-r18") {
    throw new Error("phase20_visual_fixture_state_invalid");
  }
  if (state.fixture_seed === "phase20-shell-workout" || state.fixture_seed === "phase20-active-workout") {
    await seedLegacyStrengthWorkout(kernel, state.fixture_seed === "phase20-active-workout");
  }
  if (state.fixture_seed === "phase20-active-workout") {
    await configureActiveScenario(kernel, state.scenario);
  }
  if (state.fixture_seed === "phase20-calendar") {
    await seedCalendar(kernel);
  }
  if (state.fixture_seed === "phase20-library-running" || state.fixture_seed === "phase20-progress" || state.fixture_seed === "phase20-garmin-visual") {
    await seedLibraryAndRunning(kernel);
  }
  if (state.fixture_seed === "phase20-progress") {
    await seedCompletedStrengthHistory(kernel);
  }
  if (state.fixture_seed === "phase20-progress" || state.fixture_seed === "phase20-garmin-visual") {
    await seedProgressAndGarmin(kernel, state.scenario);
  }
  await kernel.write(async (transaction) => {
    await transaction.execute(
      `INSERT INTO app_settings
        (key, value_version, value_json, revision, updated_at_ms)
       VALUES ('development-test.phase20.visual-fixture.v1', 1, ?, 1, ?)`,
      [JSON.stringify({
        fixtureId: state.fixture_id,
        fixtureSeed: state.fixture_seed,
        scenario: state.scenario,
        stateId: state.id,
        configurationId: request.configuration,
      }), PHASE20_VISUAL_NOW_MS],
    );
  });
}

export function createPhase20VisualRuntimeDependencies(
  request: Phase20VisualRequest,
): WorkoutAppRuntimeDependencies {
  const databaseName = phase20VisualDatabaseName(request.nonce);
  const production = createProductionWorkoutAppRuntimeDependencies(databaseName);
  const {
    createAutomaticBackupRuntime: _automaticBackupRuntime,
    createAutomaticBackupScheduler: _automaticBackupScheduler,
    createBackupCommands: _backupCommands,
    createCsvExportRepository: _csvRepository,
    createCsvFiles: _csvFiles,
    createMergeCommands: _mergeCommands,
    createRestoreCommands: _restoreCommands,
    reconcileRestore: _reconcileRestore,
    ...isolated
  } = production;
  let preferences: RestAlertPreferences = Object.freeze({ soundEnabled: true, vibrationEnabled: true });
  return Object.freeze({
    ...isolated,
    createNotifications: createFixtureNotificationPort,
    restAlertPreferenceStore: Object.freeze({
      read: () => preferences,
      write: (next: RestAlertPreferences) => { preferences = Object.freeze({ ...next }); },
    }),
    now: () => new Date(PHASE20_VISUAL_NOW),
    nowMs: () => PHASE20_VISUAL_NOW_MS,
    prepareRuntime: ({ kernel }) => bootstrapPhase20VisualFixture(kernel, request),
    async disposeRuntime() {
      const { deleteDatabaseAsync } = require("expo-sqlite") as typeof import("expo-sqlite");
      await deleteDatabaseAsync(databaseName).catch(() => undefined);
    },
  });
}
