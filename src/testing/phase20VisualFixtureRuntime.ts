import fullBodyFoundationAsset from "../../assets/content/full-body-foundation.v1.json";
import { createProductionWorkoutAppRuntimeDependencies, type WorkoutAppRuntimeDependencies } from "../bootstrap/workoutAppRuntime";
import { parseFullBodyFoundation } from "../domains/content";
import { activateStarterPlan } from "../domains/plans";
import type { RestAlertPreferences, RestNotificationPort, RestNotificationScheduleInput } from "../domains/rest";
import { startWorkout } from "../domains/workout";
import { createPlansWorkoutRepository } from "../platform/sqlite/repositories/plansWorkoutRepository";
import type { SqliteKernel } from "../platform/sqlite";
import { phase20VisualState } from "./phase20VisualStateRegistry";
import type { Phase20VisualRequest } from "./phase20VisualRequest";

export const PHASE20_VISUAL_NOW = new Date("2026-10-01T01:41:00.000Z");
export const PHASE20_VISUAL_NOW_MS = PHASE20_VISUAL_NOW.getTime();
const PHASE20_VISUAL_ACTIVATED_AT_MS = PHASE20_VISUAL_NOW_MS - 3_600_000;
export const PHASE20_VISUAL_STRENGTH_PLAN_ID = `plan_copy_${PHASE20_VISUAL_ACTIVATED_AT_MS}`;
export const PHASE20_VISUAL_STRENGTH_DAY_ID = `plan_day_${PHASE20_VISUAL_STRENGTH_PLAN_ID}_0`;
export const PHASE20_VISUAL_ACTIVE_SESSION_ID = `session_${PHASE20_VISUAL_NOW_MS}_alternate_day_${PHASE20_VISUAL_STRENGTH_DAY_ID}`;

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

export async function bootstrapPhase20VisualFixture(
  kernel: SqliteKernel,
  request: Phase20VisualRequest,
): Promise<void> {
  const state = phase20VisualState(request.state);
  if (state === null || state.fixture_id !== "v12-synthetic-fixtures-r18") {
    throw new Error("phase20_visual_fixture_state_invalid");
  }
  const repository = createPlansWorkoutRepository(kernel);
  const activation = await activateStarterPlan({
    fixture: parseFullBodyFoundation(fullBodyFoundationAsset),
    repository,
    activatedAtMs: PHASE20_VISUAL_ACTIVATED_AT_MS,
    startLocalDate: "2026-09-28",
    timezone: "Asia/Singapore",
  });
  if (state.fixture_seed === "phase20-active-workout") {
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
