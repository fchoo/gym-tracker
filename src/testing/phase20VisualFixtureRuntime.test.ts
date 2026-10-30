import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { configureSqliteConnection, type SqliteConnection, type SqlitePreparedStatement, type SqlitePreparedResult } from "../platform/sqlite/connection";
import { createSqliteKernel, type SqliteKernel } from "../platform/sqlite/sqliteKernel";
import { createMigrationRunner } from "../platform/sqlite/migrationRunner";
import { migrations } from "../platform/sqlite/migrations";
import { TodayScreen } from "../ui/screens/TodayScreen";
import { AppearanceProvider } from "../ui/theme";
import { phase20VisualState } from "./phase20VisualStateRegistry";

const mockActivateStarterPlan = jest.fn<(input: unknown) => Promise<unknown>>();
const mockStartWorkout = jest.fn<(input: unknown) => Promise<unknown>>();
const mockCreateStarterPlanCopy = jest.fn<(...args: any[]) => Promise<any>>();
const mockScheduleFactory = jest.fn<(...args: any[]) => any>();
const mockCreatePlansWorkoutRepository = jest.fn<(kernel: unknown) => Readonly<{ source: "real-port" }>>(() => ({ source: "real-port" }));
const mockDeleteDatabaseAsync = jest.fn<(name: string) => Promise<void>>();

jest.mock("../domains/plans", () => ({
  ...jest.requireActual<typeof import("../domains/plans")>("../domains/plans"),
  activateStarterPlan: (input: unknown) => mockActivateStarterPlan(input),
  createStarterPlanCopy: (...args: any[]) => mockCreateStarterPlanCopy(...args),
}));
jest.mock("../bootstrap/scheduleRuntime", () => ({
  ...jest.requireActual<typeof import("../bootstrap/scheduleRuntime")>("../bootstrap/scheduleRuntime"),
  createScheduleRuntimePort: (...args: any[]) => mockScheduleFactory(...args),
}));
jest.mock("expo-crypto", () => ({ CryptoDigestAlgorithm: { SHA256: "SHA256" },
  digestStringAsync: async (_algorithm: unknown, value: string) => require("node:crypto").createHash("sha256").update(value).digest("hex"),
}));
jest.mock("../domains/workout", () => ({
  ...jest.requireActual<typeof import("../domains/workout")>("../domains/workout"),
  startWorkout: (input: unknown) => mockStartWorkout(input),
}));
jest.mock("../platform/sqlite/repositories/plansWorkoutRepository", () => ({
  createPlansWorkoutRepository: (kernel: unknown) => mockCreatePlansWorkoutRepository(kernel),
}));
jest.mock("expo-sqlite", () => ({
  deleteDatabaseAsync: (name: string) => mockDeleteDatabaseAsync(name),
}));

import {
  bootstrapPhase20VisualFixture,
  createPhase20VisualRuntimeDependencies,
  phase20VisualCleanupStatus,
  PHASE20_VISUAL_ACTIVE_SESSION_ID,
  PHASE20_VISUAL_NOW_MS,
  PHASE20_VISUAL_STRENGTH_DAY_ID,
  PHASE20_VISUAL_STRENGTH_PLAN_ID,
  phase20VisualDatabaseName,
  phase20VisualFixtureNow,
  seedPhase20VisualTodayContext,
  clearPhase20VisualCleanupStatus,
} from "./phase20VisualFixtureRuntime";
import type { Phase20VisualRequest } from "./phase20VisualRequest";

function request(state: Phase20VisualRequest["state"]): Phase20VisualRequest {
  return {
    nonce: "a".repeat(32),
    state,
    configuration: "AP-L-C390-P-F100",
    appearance: "Light",
    mode: "capture",
  };
}

class HostResult<Row extends Record<string, unknown>> implements SqlitePreparedResult<Row> {
  constructor(readonly changes: number, readonly lastInsertRowId: number, private readonly rows: readonly Row[]) {}
  async getAllAsync() { return this.rows; }
}
class HostStatement implements SqlitePreparedStatement {
  constructor(private readonly statement: ReturnType<DatabaseSync["prepare"]>) {}
  async executeAsync<Row extends Record<string, unknown>>(parameters: readonly (null | number | string | Uint8Array)[] = []): Promise<SqlitePreparedResult<Row>> {
    if (this.statement.columns().length) return new HostResult(0, 0, this.statement.all(...parameters) as Row[]);
    const result = this.statement.run(...parameters);
    return new HostResult(Number(result.changes), Number(result.lastInsertRowid), []);
  }
  async finalizeAsync() {}
}
class HostConnection implements SqliteConnection {
  private closed = false;
  constructor(private readonly database: DatabaseSync) {}
  async execAsync(sql: string) { this.database.exec(sql); }
  async prepareAsync(sql: string) { return new HostStatement(this.database.prepare(sql)); }
  async isInTransactionAsync() { return this.database.isTransaction; }
  async closeAsync() { if (!this.closed) { this.database.close(); this.closed = true; } }
}
async function sourceKernel(): Promise<SqliteKernel> {
  const connection = new HostConnection(new DatabaseSync(":memory:"));
  await configureSqliteConnection(connection, { enableWal: false });
  const kernel = createSqliteKernel({ reader: connection, writer: connection });
  await createMigrationRunner({ databaseName: "phase20-today-context-test", kernel, migrations,
    recoveryBackup: { createAndValidate: async (input) => ({ backupId: "fixture", databaseName: input.databaseName,
      fromVersion: input.fromVersion, toVersion: input.toVersion, validated: true }) } }).run();
  const deps = createPhase20VisualRuntimeDependencies(request("BW-003"));
  await deps.installLibrary?.(kernel);
  await deps.loadStarterPlans?.(kernel);
  return kernel;
}

describe("Phase 20 visual fixture runtime", () => {
  const execute = jest.fn(async () => ({ changes: 1, lastInsertRowId: 1 }));
  const kernel = {
    queryAll: jest.fn(async () => [
      { id: "warmup-1", session_exercise_id: "exercise-1", set_kind: "warmup", metric_profile: "load_reps", target_load_grams: 20_000, target_min_reps: 5 },
      { id: "working-1", session_exercise_id: "exercise-1", set_kind: "working", metric_profile: "load_reps", target_load_grams: 80_000, target_min_reps: 5 },
      { id: "working-2", session_exercise_id: "exercise-1", set_kind: "working", metric_profile: "load_reps", target_load_grams: 80_000, target_min_reps: 5 },
    ]),
    write: jest.fn(async (operation: (transaction: { execute: typeof execute }) => Promise<unknown>) => operation({ execute })),
  } as never;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDeleteDatabaseAsync.mockResolvedValue(undefined);
    mockActivateStarterPlan.mockResolvedValue({
      plan: { id: PHASE20_VISUAL_STRENGTH_PLAN_ID },
      days: [{ id: PHASE20_VISUAL_STRENGTH_DAY_ID }],
    });
    mockStartWorkout.mockResolvedValue({ id: PHASE20_VISUAL_ACTIVE_SESSION_ID });
    mockCreateStarterPlanCopy.mockReset().mockResolvedValue({ plan: { id: "owned-copy", revision: 1 } });
    mockScheduleFactory.mockReset().mockImplementation(() => ({
      loadSchedule: async () => ({ planId: "owned-copy", planRevision: 1, scheduleId: "schedule-copy", scheduleRevision: 1,
        activeSchedule: { kind: "none" }, current: { mode: "weekday", bindings: [] } }),
      saveSchedule: async () => undefined,
      loadToday: async (instant: number) => { const localDate = new Date(instant).toISOString().slice(0, 10); return {
        localDate, view: { state: "scheduled", dayId: "day-copy" }, selectedStrengthOccurrence: { localDate, planDayId: "day-copy", planId: "owned-copy" },
      }; },
    }));
  });

  it("derives a nonce-scoped database and rejects any non-attested nonce", () => {
    expect(phase20VisualDatabaseName("a".repeat(32)))
      .toBe(`gym-tracker-phase20-visual-${"a".repeat(32)}.db`);
    expect(() => phase20VisualDatabaseName("../../gym-tracker.db"))
      .toThrow("phase20_visual_nonce_invalid");
  });

  it("seeds active Workout through the real activation and start command ports", async () => {
    await bootstrapPhase20VisualFixture(kernel, request("BW-008"));

    expect(mockCreatePlansWorkoutRepository).toHaveBeenCalledWith(kernel);
    expect(mockActivateStarterPlan).toHaveBeenCalledWith(expect.objectContaining({
      repository: { source: "real-port" },
      activatedAtMs: PHASE20_VISUAL_NOW_MS - 3_600_000,
    }));
    expect(mockStartWorkout).toHaveBeenCalledWith({
      repository: { source: "real-port" },
      request: expect.objectContaining({
        mode: "alternate",
        planId: PHASE20_VISUAL_STRENGTH_PLAN_ID,
        planDayId: PHASE20_VISUAL_STRENGTH_DAY_ID,
        startedAtMs: PHASE20_VISUAL_NOW_MS,
      }),
    });
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining("development-test.phase20.visual-fixture.v1"),
      [expect.stringContaining('"scenario":"active-overview"'), PHASE20_VISUAL_NOW_MS],
    );
  });

  it("does not manufacture an active workout for non-Active families", async () => {
    await bootstrapPhase20VisualFixture(kernel, request("BW-002"));
    expect(mockCreateStarterPlanCopy).toHaveBeenCalledTimes(1);
    expect(mockActivateStarterPlan).not.toHaveBeenCalled();
    expect(mockStartWorkout).not.toHaveBeenCalled();
  });

  it("awaits strict disposable database deletion and propagates cleanup failure", async () => {
    mockDeleteDatabaseAsync.mockRejectedValueOnce(new Error("delete failed"));
    const dependencies = createPhase20VisualRuntimeDependencies(request("BW-008"));
    expect(dependencies.strictDisposal).toBe(true);
    await expect(dependencies.disposeRuntime?.()).rejects.toThrow("delete failed");
    expect(mockDeleteDatabaseAsync).toHaveBeenCalledWith(phase20VisualDatabaseName("a".repeat(32)));
    expect(phase20VisualCleanupStatus("a".repeat(32))).toBe("failed");
  });

  it.each(["BW-003", "BW-004", "BW-005", "BW-006", "BW-007"] as const)("binds %s to real owned schedule facts and the unchanged planned Today UI", async (id) => {
    mockCreateStarterPlanCopy.mockImplementation(jest.requireActual<typeof import("../domains/plans")>("../domains/plans").createStarterPlanCopy);
    mockScheduleFactory.mockImplementation(jest.requireActual<typeof import("../bootstrap/scheduleRuntime")>("../bootstrap/scheduleRuntime").createScheduleRuntimePort);
    const kernel = await sourceKernel();
    try {
      const input = request(id); const today = await seedPhase20VisualTodayContext(kernel, input);
      const date = phase20VisualFixtureNow(input).toISOString().slice(0, 10);
      expect(today.localDate).toBe(date);
      expect(today.selectedStrengthOccurrence?.localDate).toBe(date);
      expect(today.selectedStrengthOccurrence?.opportunityId).toMatch(/^schedule-opportunity:/u);
      expect(today.selectedStrengthOccurrence?.planDayId).toBe(today.view.state === "scheduled" ? today.view.dayId : null);
      if (today.view.state !== "scheduled") throw new Error("planned_today_context_missing");
      const start = jest.fn();
      await render(React.createElement(AppearanceProvider, null, React.createElement(TodayScreen, {
        launchState: "trusted", view: today.view, planDays: today.planDays,
        ...(today.selectedStrengthOccurrence === undefined ? {} : { selectedStrengthOccurrence: today.selectedStrengthOccurrence }), scheduleToday: today.scheduleToday,
        onStartPlanDay: start,
      })));
      expect(screen.getByText(today.view.planName)).toBeOnTheScreen();
      const state = phase20VisualState(id)!;
      const startAction = state.readiness.actions.find((action) => action.id === "today-start-workout");
      expect(startAction?.label).toBe(`Start ${today.view.dayName}`);
      await fireEvent.press(screen.getByRole("button", { name: startAction!.label! }));
      expect(start).toHaveBeenCalledWith(today.view.dayId, "scheduled");
      expect(state.scenario_steps).toEqual([]);
      expect(screen.queryByLabelText("Workout day previews")).toBeNull();
    } finally { await kernel.close(); }
  });

  it.each([{ id: "BW-084", expectedActivities: 6 }, { id: "BW-086", expectedActivities: 0 }, { id: "BW-088", expectedActivities: 1 }, { id: "BW-090", expectedActivities: 0 }] as const)("seeds actual $id Settings background facts without preview controls", async ({ id, expectedActivities }) => {
    mockActivateStarterPlan.mockImplementation(jest.requireActual<typeof import("../domains/plans")>("../domains/plans").activateStarterPlan as never);
    mockStartWorkout.mockImplementation(jest.requireActual<typeof import("../domains/workout")>("../domains/workout").startWorkout as never);
    mockCreatePlansWorkoutRepository.mockImplementation(jest.requireActual<typeof import("../platform/sqlite/repositories/plansWorkoutRepository")>("../platform/sqlite/repositories/plansWorkoutRepository").createPlansWorkoutRepository as never);
    const kernel = await sourceKernel();
    try {
      await bootstrapPhase20VisualFixture(kernel, request(id));
      const rows = await kernel.queryAll<{ count: number }>("SELECT COUNT(*) AS count FROM imported_activities");
      expect(rows[0]?.count).toBe(expectedActivities);
      expect(phase20VisualState(id)?.readiness.actions.map(({ label }) => label)).toContain("Bodyweight history");
      expect(phase20VisualState(id)?.readiness.actions.some(({ label }) => ["Ready", "Empty", "Sparse", "Loading"].includes(label))).toBe(false);
    } finally { await kernel.close(); }
  });

  it("seeds an accepted planned Calendar occurrence through the real snapshot repository", async () => {
    const kernel = await sourceKernel();
    try {
      await bootstrapPhase20VisualFixture(kernel, request("BW-022"));
      const rows = await kernel.queryAll<{ id: string; state: string }>("SELECT id, state FROM owned_plan_schedule_opportunities WHERE id = 'phase20-strength-occurrence'");
      expect(rows).toEqual([{ id: "phase20-strength-occurrence", state: "pending" }]);
    } finally { await kernel.close(); }
  });

  it("fails dated fixture preparation closed when the owned schedule is missing", async () => {
    mockScheduleFactory.mockReturnValueOnce({ loadSchedule: async () => null });
    await expect(seedPhase20VisualTodayContext(kernel, request("BW-003"))).rejects.toThrow("phase20_visual_fixture_today_schedule_missing");
  });

  it.each([{ id: "BW-015", expectedRest: null }, { id: "BW-016", expectedRest: null }, { id: "BW-017", expectedRest: "running" }, { id: "BW-018", expectedRest: "paused" }, { id: "BW-019", expectedRest: "paused" }, { id: "BW-020", expectedRest: "running" }, { id: "BW-021", expectedRest: null }] as const)("seeds $id with authoritative working/warm-up and rest source state", async ({ id, expectedRest }) => {
    mockActivateStarterPlan.mockImplementation(jest.requireActual<typeof import("../domains/plans")>("../domains/plans").activateStarterPlan as never);
    mockStartWorkout.mockImplementation(jest.requireActual<typeof import("../domains/workout")>("../domains/workout").startWorkout as never);
    mockCreatePlansWorkoutRepository.mockImplementation(jest.requireActual<typeof import("../platform/sqlite/repositories/plansWorkoutRepository")>("../platform/sqlite/repositories/plansWorkoutRepository").createPlansWorkoutRepository as never);
    const kernel = await sourceKernel();
    try {
      await bootstrapPhase20VisualFixture(kernel, request(id));
      const rows = await kernel.queryAll<{ status: string; set_kind: string }>("SELECT session.status, set_row.set_kind FROM workout_sessions session JOIN session_sets set_row ON set_row.id = session.active_set_id WHERE session.id = ?", [PHASE20_VISUAL_ACTIVE_SESSION_ID]);
      expect(rows[0]?.status).toBe("in_progress");
      expect(rows[0]?.set_kind).toBe(id === "BW-015" ? "warmup" : "working");
      const rest = await kernel.queryAll<{ status: string }>("SELECT status FROM session_rest_states WHERE session_id = ?", [PHASE20_VISUAL_ACTIVE_SESSION_ID]);
      expect(rest[0]?.status ?? null).toBe(expectedRest);
    } finally { await kernel.close(); }
  });

  it("rejects missing legacy day and mismatched started session identities", async () => {
    mockActivateStarterPlan.mockResolvedValueOnce({ plan: { id: PHASE20_VISUAL_STRENGTH_PLAN_ID }, days: [] });
    await expect(bootstrapPhase20VisualFixture(kernel, request("BW-008"))).rejects.toThrow("phase20_visual_fixture_day_missing");
    mockStartWorkout.mockResolvedValueOnce({ id: "wrong-session" });
    await expect(bootstrapPhase20VisualFixture(kernel, request("BW-008"))).rejects.toThrow("phase20_visual_fixture_session_identity_invalid");
    await expect(bootstrapPhase20VisualFixture(kernel, request("BW-000" as never))).rejects.toThrow("phase20_visual_fixture_state_invalid");
  });

  it("uses its isolated date clock and records completion only after disposable runtime deletion", async () => {
    const runtimeModule = jest.requireActual<typeof import("../bootstrap/workoutAppRuntime")>("../bootstrap/workoutAppRuntime");
    const base = runtimeModule.createProductionWorkoutAppRuntimeDependencies("fixture-clock");
    const factory = jest.spyOn(runtimeModule, "createProductionWorkoutAppRuntimeDependencies").mockReturnValueOnce({ ...base, openKernel: async () => kernel });
    try {
      const input = request("BW-003"); const deps = createPhase20VisualRuntimeDependencies(input);
      expect(deps.now().toISOString()).toBe("2026-09-28T01:41:00.000Z");
      expect(deps.nowMs()).toBe(Date.parse("2026-09-28T01:41:00.000Z"));
      await deps.openKernel();
      await deps.prepareRuntime?.({ kernel, starterPlans: {} } as never);
      await deps.disposeRuntime?.();
      expect(phase20VisualCleanupStatus(input.nonce)).toBe("complete");
      clearPhase20VisualCleanupStatus(input.nonce);
      expect(phase20VisualCleanupStatus(input.nonce)).toBe("missing");
    } finally { factory.mockRestore(); }
  });
});
