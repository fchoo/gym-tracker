import {
  addLocalDays,
  compareLocalDates,
  parseLocalDate,
} from "../../domains/scheduling/localDate";
import {
  FOLLOW_DEVICE_TIMEZONE_LABEL,
  KEEP_CURRENT_TIMEZONE_LABEL,
  transitionDateOverride,
  transitionRotation,
  transitionTimeZoneChoice,
  type RotationScheduleStateV1,
} from "../../domains/scheduling/scheduleState";
import {
  localDateAtInstant,
  parseStoredTimeZone,
} from "../../domains/scheduling/timeZone";
import {
  createMigrationRunner,
} from "../../platform/sqlite/migrationRunner";
import {
  migrations,
} from "../../platform/sqlite/migrations";
import type {
  RecoveryBackupPort,
} from "../../platform/sqlite/recoveryBackup";
import {
  openExerciseSearchFtsContractRuntime,
} from "../../platform/sqlite/repositories/exerciseSearchIndexRepository";
import {
  createScheduleRepository,
  type ScheduleVersionSnapshot,
} from "../../platform/sqlite/repositories/scheduleRepository";
import type {
  SqliteKernel,
} from "../../platform/sqlite/sqliteKernel";
import type {
  Phase2ContractCaseMetadata,
} from "./phase2Content.contract";

export const PHASE2_SCHEDULE_CONTRACT_VERSION = 1 as const;

export const PHASE2_SCHEDULE_CASE_IDS = [
  "schedule-weekday-rotation-versions",
  "schedule-repeat-skip-advance-override",
  "schedule-midnight-dst-timezone",
  "schedule-revision-rollback",
] as const;

export type Phase2ScheduleContractCaseId =
  (typeof PHASE2_SCHEDULE_CASE_IDS)[number];

export const PHASE2_SCHEDULE_CASE_METADATA = [
  {
    id: "schedule-weekday-rotation-versions",
    requirement: "LIB-09",
    category: "schedule-versions",
    edgeIds: ["E-53", "E-56"],
    sourceTest: "tests/integration/schedule-commands.test.ts#schedule version persistence",
  },
  {
    id: "schedule-repeat-skip-advance-override",
    requirement: "LIB-09",
    category: "schedule-actions",
    edgeIds: ["E-54", "E-57"],
    sourceTest: "tests/integration/schedule-commands.test.ts#D-42 D-43 rotation command persistence and D-44 override lifecycle persistence",
  },
  {
    id: "schedule-midnight-dst-timezone",
    requirement: "LIB-09",
    category: "calendar-timezone",
    edgeIds: ["E-53", "E-55", "E-56"],
    sourceTest: "src/domains/scheduling/localDate.test.ts#stored-timezone calendar resolution",
  },
  {
    id: "schedule-revision-rollback",
    requirement: "LIB-09",
    category: "schedule-concurrency",
    edgeIds: ["E-57", "E-58"],
    sourceTest: "tests/integration/schedule-commands.test.ts#replays one request rejects changed identity and serializes stale concurrent saves",
  },
] as const satisfies readonly Phase2ContractCaseMetadata<
  Phase2ScheduleContractCaseId
>[];

export type Phase2ScheduleContractRuntime = Readonly<{
  kernel: SqliteKernel;
  close(): Promise<void>;
}>;

export interface Phase2ScheduleContractAdapter {
  createRuntime(
    caseId: Phase2ScheduleContractCaseId,
  ): Promise<Phase2ScheduleContractRuntime>;
  sha256(value: string): Promise<string>;
}

export type Phase2ScheduleContractCaseResult = Readonly<{
  id: Phase2ScheduleContractCaseId;
  status: "passed" | "failed";
  durationMs: number;
  errorCode?: string;
}>;

export type Phase2ScheduleContractResult = Readonly<{
  schemaVersion: 1;
  contractVersion: typeof PHASE2_SCHEDULE_CONTRACT_VERSION;
  status: "passed" | "failed";
  total: number;
  passed: number;
  failed: number;
  skipped: 0;
  cases: readonly Phase2ScheduleContractCaseResult[];
  startedAt: string;
  finishedAt: string;
}>;

type ContractCase = (
  runtime: Phase2ScheduleContractRuntime,
  adapter: Phase2ScheduleContractAdapter,
) => Promise<void>;

type SeededSchedule = Readonly<{
  planId: string;
  dayIds: readonly [string, string];
  scheduleId: string;
  version: ScheduleVersionSnapshot;
  planRevision: number;
  scheduleRevision: number;
}>;

function invariant(value: unknown, code: string): asserts value {
  if (!value) {
    throw new Error(code);
  }
}

function safeErrorCode(error: unknown): string {
  if (
    typeof error === "object"
    && error !== null
    && "code" in error
    && typeof error.code === "string"
  ) {
    return error.code.slice(0, 80);
  }
  if (error instanceof Error && /^[a-z0-9_:-]{3,80}$/iu.test(error.message)) {
    return error.message;
  }
  return "phase2_schedule_contract_failed";
}

const recoveryBackup: RecoveryBackupPort = {
  async createAndValidate(request) {
    return {
      backupId: `phase2-schedule-${request.fromVersion}-${request.toVersion}`,
      databaseName: request.databaseName,
      fromVersion: request.fromVersion,
      toVersion: request.toVersion,
      validated: true,
    };
  },
};

async function migrate(kernel: SqliteKernel): Promise<void> {
  await createMigrationRunner({
    databaseName: "phase2-schedule.db",
    kernel,
    migrations,
    recoveryBackup,
  }).run();
}

async function seedSchedule(
  kernel: SqliteKernel,
  mode: "weekday" | "rotation",
): Promise<SeededSchedule> {
  await migrate(kernel);
  const planId = `phase2-${mode}-plan`;
  const scheduleId = `phase2-${mode}-schedule`;
  const dayIds = [
    `phase2-${mode}-day-a`,
    `phase2-${mode}-day-b`,
  ] as const;
  const versionId = `${scheduleId}-v1`;
  await kernel.write(async (transaction) => {
    await transaction.execute(
      `INSERT INTO plans
        (id, content_pack_id, origin, source_namespace, upstream_id, name,
         days_per_week, audience, goal, estimate_minutes, attribution,
         is_active, revision)
       VALUES (?, NULL, 'custom', NULL, NULL, ?, 2, 'Owner', 'Strength',
               30, 'Owner-created', 1, 8)`,
      [planId, `${mode} plan`],
    );
    await transaction.execute(
      `INSERT INTO owned_plan_aggregate_states
        (plan_id, lifecycle, graph_status, missing_requirement_code,
         missing_requirement, created_at_ms, updated_at_ms, archived_at_ms)
       VALUES (?, 'ready', 'valid', NULL, NULL, 1, 1, NULL)`,
      [planId],
    );
    for (const [ordinal, dayId] of dayIds.entries()) {
      await transaction.execute(
        `INSERT INTO plan_days(id, plan_id, ordinal, name, revision)
         VALUES (?, ?, ?, ?, 1)`,
        [dayId, planId, ordinal, ordinal === 0 ? "Alpha" : "Beta"],
      );
    }
    await transaction.execute(
      `INSERT INTO owned_plan_schedules
        (id, plan_id, lifecycle, revision, activated_at_ms, deactivated_at_ms)
       VALUES (?, ?, 'active', 7, 1, NULL)`,
      [scheduleId, planId],
    );
    await transaction.execute(
      `INSERT INTO owned_plan_schedule_versions
        (id, schedule_id, version_number, effective_local_date, mode,
         timezone, rotation_pointer, created_at_ms)
       VALUES (?, ?, 1, '2026-08-01', ?, 'Asia/Singapore', ?, 1)`,
      [versionId, scheduleId, mode, mode === "rotation" ? 0 : null],
    );
    for (const [ordinal, dayId] of dayIds.entries()) {
      await transaction.execute(
        `INSERT INTO owned_plan_schedule_bindings
          (id, schedule_version_id, mode, ordinal, week_index, weekday,
           plan_day_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          `${versionId}-binding-${ordinal}`,
          versionId,
          mode,
          ordinal,
          mode === "weekday" ? 0 : null,
          mode === "weekday"
            ? ordinal === 0 ? "Monday" : "Wednesday"
            : null,
          dayId,
        ],
      );
    }
  });
  const version: ScheduleVersionSnapshot = {
    id: versionId,
    versionNumber: 1,
    effectiveLocalDate: "2026-08-01",
    mode,
    timeZone: "Asia/Singapore",
    rotationPointer: mode === "rotation" ? 0 : null,
    bindings: dayIds.map((planDayId, ordinal) => mode === "weekday"
      ? {
          id: `${versionId}-binding-${ordinal}`,
          ordinal,
          weekIndex: 0,
          weekday: ordinal === 0 ? "Monday" : "Wednesday",
          planDayId,
        }
      : {
          id: `${versionId}-binding-${ordinal}`,
          ordinal,
          planDayId,
        }),
  };
  return {
    planId,
    dayIds,
    scheduleId,
    version,
    planRevision: 8,
    scheduleRevision: 7,
  };
}

function actionState(
  schedule: SeededSchedule,
  input: Readonly<{
    revision: number;
    pointer: number;
    localDate: string;
  }>,
): RotationScheduleStateV1 {
  const planDayId = schedule.dayIds[input.pointer]!;
  return {
    version: 1,
    mode: "rotation",
    revision: input.revision,
    bindings: schedule.dayIds,
    pointer: input.pointer,
    currentOpportunity: {
      version: 1,
      state: "pending",
      id: `${schedule.scheduleId}-opportunity-${input.localDate}`,
      source: "rotation",
      localDate: parseLocalDate(input.localDate),
      planDayId,
      revision: 1,
    },
  };
}

const contractCases: Record<Phase2ScheduleContractCaseId, ContractCase> = {
  async "schedule-weekday-rotation-versions"({ kernel }) {
    const schedule = await seedSchedule(kernel, "weekday");
    const repository = createScheduleRepository(kernel);
    const result = await repository.saveVersion({
      operation: "save_schedule_version",
      requestId: "phase2-weekday-version",
      requestSha256: "a".repeat(64),
      scheduleId: schedule.scheduleId,
      planId: schedule.planId,
      expectedScheduleRevision: schedule.scheduleRevision,
      expectedPlanRevision: schedule.planRevision,
      todayLocalDate: parseLocalDate("2026-08-18"),
      savedAtMs: 1_787_000_000_000,
      before: schedule.version,
      next: {
        effectiveLocalDate: parseLocalDate("2026-08-18"),
        mode: "weekday",
        timeZone: parseStoredTimeZone("Asia/Shanghai"),
        bindings: [
          {
            ordinal: 0,
            weekIndex: 0,
            weekday: "Tuesday",
            planDayId: schedule.dayIds[0],
          },
          {
            ordinal: 1,
            weekIndex: 0,
            weekday: "Thursday",
            planDayId: schedule.dayIds[1],
          },
        ],
      },
      confirmationToken: "phase2-fixed-preview-token",
      versionId: `${schedule.scheduleId}-v2`,
      bindingIds: [
        `${schedule.scheduleId}-v2-binding-0`,
        `${schedule.scheduleId}-v2-binding-1`,
      ],
    });
    const rows = await kernel.queryAll<{
      version_number: number;
      effective_local_date: string;
      mode: string;
      timezone: string;
    }>(
      `SELECT version_number, effective_local_date, mode, timezone
       FROM owned_plan_schedule_versions
       WHERE schedule_id = ? ORDER BY version_number`,
      [schedule.scheduleId],
    );
    const bindings = await kernel.queryAll<{
      ordinal: number;
      weekday: string | null;
      plan_day_id: string;
    }>(
      `SELECT ordinal, weekday, plan_day_id
       FROM owned_plan_schedule_bindings
       WHERE schedule_version_id = ?
       ORDER BY ordinal`,
      [result.version.id],
    );
    invariant(
      result.scheduleRevision === 8
      && result.planRevision === 9
      && rows.map(({ version_number }) => version_number).join(",") === "1,2"
      && rows[0]?.timezone === "Asia/Singapore"
      && rows[1]?.timezone === "Asia/Shanghai"
      && bindings.map(({ weekday }) => weekday).join(",")
        === "Tuesday,Thursday"
      && bindings.map(({ plan_day_id }) => plan_day_id).join(",")
        === schedule.dayIds.join(","),
      "phase2_schedule_versions_invalid",
    );
  },

  async "schedule-repeat-skip-advance-override"({ kernel }) {
    const schedule = await seedSchedule(kernel, "rotation");
    const repository = createScheduleRepository(kernel);
    const repeat = transitionRotation({
      current: actionState(schedule, {
        revision: 7,
        pointer: 0,
        localDate: "2026-08-18",
      }),
      expectedRevision: 7,
      action: { type: "repeat" },
    });
    const repeated = await repository.applyOpportunityAction({
      operation: "repeat_rotation",
      requestId: "phase2-rotation-repeat",
      requestSha256: "b".repeat(64),
      scheduleId: schedule.scheduleId,
      planId: schedule.planId,
      expectedScheduleRevision: 7,
      expectedPlanRevision: 8,
      localDate: parseLocalDate("2026-08-18"),
      occurredAtMs: 1_787_000_001_000,
      versionId: schedule.version.id,
      transition: repeat,
    });
    const skip = transitionRotation({
      current: actionState(schedule, {
        revision: repeated.scheduleRevision,
        pointer: 0,
        localDate: "2026-08-18",
      }),
      expectedRevision: repeated.scheduleRevision,
      action: { type: "skip" },
    });
    const skipped = await repository.applyOpportunityAction({
      operation: "skip_opportunity",
      requestId: "phase2-rotation-skip",
      requestSha256: "c".repeat(64),
      scheduleId: schedule.scheduleId,
      planId: schedule.planId,
      expectedScheduleRevision: repeated.scheduleRevision,
      expectedPlanRevision: repeated.planRevision,
      localDate: parseLocalDate("2026-08-18"),
      occurredAtMs: 1_787_000_002_000,
      versionId: schedule.version.id,
      transition: skip,
    });
    const advance = transitionRotation({
      current: actionState(schedule, {
        revision: skipped.scheduleRevision,
        pointer: 1,
        localDate: "2026-08-19",
      }),
      expectedRevision: skipped.scheduleRevision,
      action: { type: "advance" },
    });
    const advanced = await repository.applyOpportunityAction({
      operation: "advance_rotation",
      requestId: "phase2-rotation-advance",
      requestSha256: "d".repeat(64),
      scheduleId: schedule.scheduleId,
      planId: schedule.planId,
      expectedScheduleRevision: skipped.scheduleRevision,
      expectedPlanRevision: skipped.planRevision,
      localDate: parseLocalDate("2026-08-19"),
      occurredAtMs: 1_787_000_003_000,
      versionId: schedule.version.id,
      transition: advance,
    });
    const overrideTransition = transitionDateOverride({
      current: null,
      expectedRevision: 0,
      overrideId: "phase2-rotation-override",
      localDate: parseLocalDate("2026-08-20"),
      replacement: { kind: "rest_day" },
    });
    const overridden = await repository.setDateOverride({
      operation: "set_date_override",
      requestId: "phase2-override-create",
      requestSha256: "e".repeat(64),
      scheduleId: schedule.scheduleId,
      planId: schedule.planId,
      expectedScheduleRevision: advanced.scheduleRevision,
      expectedPlanRevision: advanced.planRevision,
      localDate: parseLocalDate("2026-08-20"),
      occurredAtMs: 1_787_000_004_000,
      transition: overrideTransition,
    });
    const events = await kernel.queryAll<{ event_type: string }>(
      `SELECT event_type FROM owned_plan_schedule_events
       WHERE schedule_id = ? ORDER BY schedule_revision`,
      [schedule.scheduleId],
    );
    const opportunities = await kernel.queryAll<{
      local_date: string;
      outcome: string;
    }>(
      `SELECT local_date, outcome
       FROM owned_plan_schedule_opportunities
       WHERE schedule_id = ? ORDER BY local_date`,
      [schedule.scheduleId],
    );
    invariant(
      overridden.scheduleRevision === 11
      && events.map(({ event_type }) => event_type).join(",")
        === [
          "rotation_repeated",
          "rotation_skipped",
          "rotation_advanced",
          "override_created",
        ].join(",")
      && opportunities.map(({ local_date, outcome }) =>
        `${local_date}:${outcome}`
      ).join(",") === "2026-08-18:skipped,2026-08-19:advanced",
      "phase2_schedule_actions_invalid",
    );
  },

  async "schedule-midnight-dst-timezone"({ kernel }) {
    const schedule = await seedSchedule(kernel, "weekday");
    const singapore = parseStoredTimeZone("Asia/Singapore");
    const newYork = parseStoredTimeZone("America/New_York");
    const beforeMidnight = localDateAtInstant(
      Date.UTC(2026, 7, 18, 15, 59, 59),
      singapore,
    );
    const afterMidnight = localDateAtInstant(
      Date.UTC(2026, 7, 18, 16, 0, 1),
      singapore,
    );
    const springBefore = localDateAtInstant(
      Date.UTC(2026, 2, 8, 6, 59, 59),
      newYork,
    );
    const springAfter = localDateAtInstant(
      Date.UTC(2026, 2, 8, 7, 0, 1),
      newYork,
    );
    const transition = transitionTimeZoneChoice({
      current: {
        version: 1,
        revision: 7,
        timeZone: singapore,
        lastDeviceTimeZoneDecision: null,
      },
      expectedRevision: 7,
      detectedDeviceTimeZone: newYork,
      effectiveLocalDate: parseLocalDate("2026-08-19"),
      choice: FOLLOW_DEVICE_TIMEZONE_LABEL,
    });
    const repository = createScheduleRepository(kernel);
    const changed = await repository.changeTimeZone({
      operation: "change_timezone",
      requestId: "phase2-timezone-follow",
      requestSha256: "f".repeat(64),
      scheduleId: schedule.scheduleId,
      planId: schedule.planId,
      expectedScheduleRevision: schedule.scheduleRevision,
      expectedPlanRevision: schedule.planRevision,
      localDate: parseLocalDate("2026-08-19"),
      occurredAtMs: 1_787_000_005_000,
      transition,
      nextVersion: {
        effectiveLocalDate: parseLocalDate("2026-08-19"),
        mode: "weekday",
        timeZone: newYork,
        bindings: schedule.version.bindings.map((binding) => {
          const weekday = binding as Extract<
            ScheduleVersionSnapshot["bindings"][number],
            Readonly<{ weekday: unknown }>
          >;
          return {
            ordinal: weekday.ordinal,
            weekIndex: weekday.weekIndex,
            weekday: weekday.weekday,
            planDayId: weekday.planDayId,
          };
        }),
      },
      versionId: `${schedule.scheduleId}-timezone-v2`,
      bindingIds: [
        `${schedule.scheduleId}-timezone-binding-0`,
        `${schedule.scheduleId}-timezone-binding-1`,
      ],
    });
    const keep = transitionTimeZoneChoice({
      current: {
        version: 1,
        revision: changed.scheduleRevision,
        timeZone: newYork,
        lastDeviceTimeZoneDecision: null,
      },
      expectedRevision: changed.scheduleRevision,
      detectedDeviceTimeZone: parseStoredTimeZone("Europe/London"),
      effectiveLocalDate: parseLocalDate("2026-08-20"),
      choice: KEEP_CURRENT_TIMEZONE_LABEL,
    });
    invariant(
      beforeMidnight === "2026-08-18"
      && afterMidnight === "2026-08-19"
      && springBefore === "2026-03-08"
      && springAfter === "2026-03-08"
      && compareLocalDates(beforeMidnight, afterMidnight) === -1
      && addLocalDays(beforeMidnight, 1) === afterMidnight
      && changed.version?.timeZone === "America/New_York"
      && changed.version?.versionNumber === 2
      && keep.next.timeZone === newYork
      && keep.events[0]?.type === "timezone_kept",
      "phase2_schedule_timezone_invalid",
    );
  },

  async "schedule-revision-rollback"({ kernel }) {
    const schedule = await seedSchedule(kernel, "weekday");
    const repository = createScheduleRepository(kernel);
    const before = {
      plan: await kernel.queryAll(
        "SELECT revision FROM plans WHERE id = ?",
        [schedule.planId],
      ),
      schedule: await kernel.queryAll(
        "SELECT revision FROM owned_plan_schedules WHERE id = ?",
        [schedule.scheduleId],
      ),
      versions: await kernel.queryAll(
        `SELECT * FROM owned_plan_schedule_versions
         WHERE schedule_id = ? ORDER BY version_number`,
        [schedule.scheduleId],
      ),
      events: await kernel.queryAll(
        `SELECT * FROM owned_plan_schedule_events
         WHERE schedule_id = ? ORDER BY schedule_revision`,
        [schedule.scheduleId],
      ),
    };
    let staleRejected = false;
    try {
      await repository.saveVersion({
        operation: "save_schedule_version",
        requestId: "phase2-stale-version",
        requestSha256: "9".repeat(64),
        scheduleId: schedule.scheduleId,
        planId: schedule.planId,
        expectedScheduleRevision: 6,
        expectedPlanRevision: 8,
        todayLocalDate: parseLocalDate("2026-08-18"),
        savedAtMs: 1_787_000_006_000,
        before: schedule.version,
        next: {
          effectiveLocalDate: parseLocalDate("2026-08-18"),
          mode: "weekday",
          timeZone: parseStoredTimeZone("Asia/Singapore"),
          bindings: [{
            ordinal: 0,
            weekIndex: 0,
            weekday: "Tuesday",
            planDayId: schedule.dayIds[0],
          }],
        },
        confirmationToken: "phase2-stale-preview",
        versionId: `${schedule.scheduleId}-stale-v2`,
        bindingIds: [`${schedule.scheduleId}-stale-binding-0`],
      });
    } catch {
      staleRejected = true;
    }
    const after = {
      plan: await kernel.queryAll(
        "SELECT revision FROM plans WHERE id = ?",
        [schedule.planId],
      ),
      schedule: await kernel.queryAll(
        "SELECT revision FROM owned_plan_schedules WHERE id = ?",
        [schedule.scheduleId],
      ),
      versions: await kernel.queryAll(
        `SELECT * FROM owned_plan_schedule_versions
         WHERE schedule_id = ? ORDER BY version_number`,
        [schedule.scheduleId],
      ),
      events: await kernel.queryAll(
        `SELECT * FROM owned_plan_schedule_events
         WHERE schedule_id = ? ORDER BY schedule_revision`,
        [schedule.scheduleId],
      ),
    };
    invariant(
      staleRejected
      && JSON.stringify(after) === JSON.stringify(before),
      "phase2_schedule_rollback_invalid",
    );
  },
};

export async function createExpoPhase2ScheduleContractAdapter(
  runId: string,
): Promise<Phase2ScheduleContractAdapter> {
  const {
    CryptoDigestAlgorithm,
    digestStringAsync,
  } = require("expo-crypto") as typeof import("expo-crypto");
  return {
    async createRuntime(caseId) {
      return openExerciseSearchFtsContractRuntime(
        `phase2-schedule-${runId}-${caseId}.db`,
      );
    },
    sha256: (value) =>
      digestStringAsync(CryptoDigestAlgorithm.SHA256, value),
  };
}

export async function runPhase2ScheduleContract(
  adapter: Phase2ScheduleContractAdapter,
): Promise<Phase2ScheduleContractResult> {
  const startedAt = new Date().toISOString();
  const results: Phase2ScheduleContractCaseResult[] = [];
  for (const caseId of PHASE2_SCHEDULE_CASE_IDS) {
    const caseStartedAt = Date.now();
    let runtime: Phase2ScheduleContractRuntime | undefined;
    try {
      runtime = await adapter.createRuntime(caseId);
      await contractCases[caseId](runtime, adapter);
      results.push({
        id: caseId,
        status: "passed",
        durationMs: Date.now() - caseStartedAt,
      });
    } catch (error) {
      results.push({
        id: caseId,
        status: "failed",
        durationMs: Date.now() - caseStartedAt,
        errorCode: safeErrorCode(error),
      });
    } finally {
      await runtime?.close().catch(() => undefined);
    }
  }
  const passed = results.filter(({ status }) => status === "passed").length;
  const failed = results.length - passed;
  return {
    schemaVersion: 1,
    contractVersion: PHASE2_SCHEDULE_CONTRACT_VERSION,
    status: failed === 0 ? "passed" : "failed",
    total: results.length,
    passed,
    failed,
    skipped: 0,
    cases: results,
    startedAt,
    finishedAt: new Date().toISOString(),
  };
}

export function assertPhase2ScheduleContractResult(
  input: unknown,
): asserts input is Phase2ScheduleContractResult {
  const result = input as Partial<Phase2ScheduleContractResult> | null;
  const cases = Array.isArray(result?.cases) ? result.cases : [];
  if (
    result?.schemaVersion !== 1
    || result.contractVersion !== PHASE2_SCHEDULE_CONTRACT_VERSION
    || result.status !== "passed"
    || result.total !== PHASE2_SCHEDULE_CASE_IDS.length
    || result.passed !== PHASE2_SCHEDULE_CASE_IDS.length
    || result.failed !== 0
    || result.skipped !== 0
    || cases.length !== PHASE2_SCHEDULE_CASE_IDS.length
    || cases.some((contractCase, index) =>
      contractCase.id !== PHASE2_SCHEDULE_CASE_IDS[index]
      || contractCase.status !== "passed"
      || contractCase.errorCode !== undefined
      || !Number.isFinite(contractCase.durationMs)
      || contractCase.durationMs < 0
    )
  ) {
    throw new Error("phase2_schedule_contract_result_invalid");
  }
}
