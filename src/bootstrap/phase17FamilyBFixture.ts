import type { Phase17CaseActionContract } from "../testing/contracts/phase17LibraryRunning.contract";
import type { RunningPlanRuntimePort } from "./runningPlanRuntime";
import type { SqliteKernel } from "../platform/sqlite";
import type { RunningPlanAggregate, RunningSessionKind } from "../domains/running/contracts";
import type { Phase17Facts, Phase17FixtureAdapter, Phase17FixtureSeed, Phase17FixtureSelectorSchema, Phase17FixtureSelectors } from "./phase17NativeFixture";
import type { Phase17FamilyAFixtureDriver } from "./phase17FamilyAFixture";
import type { Phase17FamilyCFixtureDriver } from "./phase17FamilyCFixture";

// Kept local so the lightweight evidence contract can load this router without
// eagerly evaluating the SQLite-only Family C implementation.
const FAMILY_C_CASE_IDS = Object.freeze(["library.running-conflict"] as const);
const isPhase17FamilyCCaseId = (value: string): value is "library.running-conflict" =>
  (FAMILY_C_CASE_IDS as readonly string[]).includes(value);
const FAMILY_A_CASE_IDS = new Set<string>([
  "library.remembered-state", "library.plan-groups", "library.exercise-search", "library.exercise-favorites", "library.actions-sheet", "library.neutral-plan-chooser", "library.true-no-plans", "library.owned-summary", "library.owned-lifecycle", "library.starter-detail", "library.starter-activation", "library.template-update", "library.create-strength", "library.plan-editor", "library.editor-draft-guards", "library.schedule-editor", "library.replacement-impact", "library.day-removal-impact", "library.builtin-exercise", "library.custom-exercise", "library.create-exercise", "library.copy-metric-migration", "library.load-error-recovery", "library.accessibility-recovery",
]);
const isPhase17FamilyACaseId = (value: string): value is import("./phase17FamilyAFixture").Phase17FamilyACaseId => FAMILY_A_CASE_IDS.has(value);

/**
 * Running is deliberately a separate fixture family.  These IDs use the
 * revisioned Running command port and are never allowed to fall back to the
 * Library/Strength fixture graph.  Collision is Family C and remains closed.
 */
export const PHASE17_FAMILY_B_CASE_IDS = Object.freeze([
  "library.running-detail", "library.running-create-zero-sessions", "library.running-goal-edit",
  "library.running-session-common", "library.running-recovery", "library.running-long",
  "library.running-progression", "library.running-tempo", "library.running-intervals",
  "library.running-hills", "library.running-fartlek", "library.running-session-lifecycle",
  "library.running-create-typed-sessions", "library.running-two-same-day-slots",
] as const);

export type Phase17FamilyBCaseId = (typeof PHASE17_FAMILY_B_CASE_IDS)[number];

export type Phase17FamilyBFixtureDriver = Readonly<{
  selectorSchema(caseId: Phase17FamilyBCaseId): Phase17FixtureSelectorSchema;
  seed(caseId: Phase17FamilyBCaseId, fixtureToken: string, sourceTable: string): Promise<Phase17FixtureSeed>;
  probe(caseId: Phase17FamilyBCaseId, fixtureToken: string, sourceTable: string, selectors: Phase17FixtureSelectors): Promise<Readonly<{ rowCount: number; identityHash: string; facts: Phase17Facts }>>;
  cleanup(caseId: Phase17FamilyBCaseId, fixtureToken: string, selectors: Phase17FixtureSelectors): Promise<void>;
}>;

export function phase17FamilyBSelectorSchema(caseId: Phase17FamilyBCaseId): Phase17FixtureSelectorSchema {
  if (caseId === "library.running-create-zero-sessions") {
    return Object.freeze({ selectors: Object.freeze([]), actionInputs: Object.freeze(["runningPlanId"]) });
  }
  const sessionSelectors = caseId === "library.running-session-lifecycle" || caseId === "library.running-two-same-day-slots"
    ? ["runningSessionRootId", "runningSessionRevisionId", "runningSlotRootId", "runningSlotRevisionId"]
    : [];
  return Object.freeze({
    selectors: Object.freeze(["runningPlanId", "runningPlanRevision", ...sessionSelectors, "runningRequestId"]),
    actionInputs: Object.freeze([]),
  });
}

export function isPhase17FamilyBCaseId(value: string): value is Phase17FamilyBCaseId {
  return (PHASE17_FAMILY_B_CASE_IDS as readonly string[]).includes(value);
}

export function assertPhase17FamilyBRegistry(contracts: readonly Phase17CaseActionContract[]): true {
  const ids = new Set(contracts.map(({ id }) => id));
  for (const id of PHASE17_FAMILY_B_CASE_IDS) if (!ids.has(id)) throw new Error(`phase17_family_b_contract_missing:${id}`);
  return true;
}

/** Routes only explicit Family A/B/C implementations. Unknown ledger IDs fail
 * closed instead of borrowing a superficially similar source row. */
export function createPhase17FamilyFixtureAdapter(input: Readonly<{
  baselineDigest: Phase17FixtureAdapter["baselineDigest"];
  canonicalHash: Phase17FixtureAdapter["canonicalHash"];
  finalizeCleanup?: Phase17FixtureAdapter["finalizeCleanup"];
  familyA: Phase17FamilyAFixtureDriver;
  familyB: Phase17FamilyBFixtureDriver;
  familyC?: Phase17FamilyCFixtureDriver;
}>): Phase17FixtureAdapter {
  // Family A's public type guard lives in its own module.  Avoid a generic
  // fallback by comparing against the supplied driver's explicit registry via
  // a typed probe below, which rejects unknown IDs before driver invocation.
  return Object.freeze({
    baselineDigest: input.baselineDigest,
    canonicalHash: input.canonicalHash,
    ...(input.finalizeCleanup === undefined ? {} : { finalizeCleanup: input.finalizeCleanup }),
    selectorSchema: ({ caseId, proofMode }) => {
      if (isPhase17FamilyBCaseId(caseId)) return input.familyB.selectorSchema(caseId);
      if (isPhase17FamilyCCaseId(caseId)) {
        if (input.familyC === undefined) throw new Error("phase17_fixture_family_unimplemented");
        return input.familyC.selectorSchema(caseId);
      }
      if (isPhase17FamilyACaseId(caseId)) return input.familyA.selectorSchema(caseId, proofMode);
      throw new Error("phase17_fixture_family_unimplemented");
    },
    seed: async ({ caseId, fixtureToken, sourceTable }) => {
      if (isPhase17FamilyBCaseId(caseId)) return input.familyB.seed(caseId, fixtureToken, sourceTable);
      if (isPhase17FamilyCCaseId(caseId)) {
        if (input.familyC === undefined) throw new Error("phase17_fixture_family_unimplemented");
        return input.familyC.seed(caseId, fixtureToken, sourceTable);
      }
      if (isPhase17FamilyACaseId(caseId)) return input.familyA.seed(caseId, fixtureToken, sourceTable);
      throw new Error("phase17_fixture_family_unimplemented");
    },
    probe: async ({ caseId, fixtureToken, sourceTable, selectors }) => {
      if (isPhase17FamilyBCaseId(caseId)) return input.familyB.probe(caseId, fixtureToken, sourceTable, selectors);
      if (isPhase17FamilyCCaseId(caseId)) {
        if (input.familyC === undefined) throw new Error("phase17_fixture_family_unimplemented");
        return input.familyC.probe(caseId, fixtureToken, sourceTable, selectors);
      }
      if (isPhase17FamilyACaseId(caseId)) return input.familyA.probe(caseId, fixtureToken, sourceTable, selectors);
      throw new Error("phase17_fixture_family_unimplemented");
    },
    cleanup: async ({ caseId, fixtureToken, selectors }) => {
      if (isPhase17FamilyBCaseId(caseId)) return input.familyB.cleanup(caseId, fixtureToken, selectors);
      if (isPhase17FamilyCCaseId(caseId)) {
        if (input.familyC === undefined) throw new Error("phase17_fixture_family_unimplemented");
        return input.familyC.cleanup(caseId, fixtureToken, selectors);
      }
      if (isPhase17FamilyACaseId(caseId)) return input.familyA.cleanup(caseId, fixtureToken, selectors);
      throw new Error("phase17_fixture_family_unimplemented");
    },
  });
}

const KINDS: readonly RunningSessionKind[] = ["recovery", "long_run", "progression", "tempo", "intervals", "hills", "fartlek"];
const kindFor = (caseId: Phase17FamilyBCaseId): RunningSessionKind | null => (Object.freeze({
  "library.running-recovery": "recovery", "library.running-long": "long_run",
  "library.running-progression": "progression", "library.running-tempo": "tempo",
  "library.running-intervals": "intervals", "library.running-hills": "hills",
  "library.running-fartlek": "fartlek",
}) as Readonly<Partial<Record<Phase17FamilyBCaseId, RunningSessionKind>>>)[caseId] ?? null;

function fixtureId(token: string, name: string): string {
  return `phase17:${name}:${token.slice("phase17:".length)}`;
}

function fixtureActionReceiptId(caseId: string, token: string): string {
  return `phase17:${caseId}:${token.slice("phase17:".length)}:action`;
}

function plannedActionReceiptIds(caseId: string, token: string): readonly string[] {
  const base = fixtureActionReceiptId(caseId, token);
  const count = caseId === "library.running-create-typed-sessions" ? 7
    : caseId === "library.running-session-lifecycle" ? 4
      : 1;
  return Object.freeze(Array.from({ length: count }, (_, index) => index === 0 ? base : `${base}:${index + 1}`));
}

function sessionSpec(kind: RunningSessionKind, weekday: "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday" | "Sunday") {
  const duration = { ordinal: 0, kind: "duration" as const, durationMs: 1_800_000 };
  const phase = [{ ordinal: 0, kind: "work" as const, steps: [duration] }];
  const advisoryTarget = { rpe: 4 };
  if (kind === "recovery") return { sessionKind: kind, weekday, phases: phase, advisoryTarget, contextual: {} };
  if (kind === "long_run") return { sessionKind: kind, weekday, phases: phase, advisoryTarget, contextual: { finish: "easy_throughout" as const } };
  if (kind === "progression") return { sessionKind: kind, weekday, phases: phase, contextual: { stages: 3, startTarget: { rpe: 3 }, finishTarget: { rpe: 6 } } };
  if (kind === "tempo") return { sessionKind: kind, weekday, phases: phase, advisoryTarget, contextual: { format: "continuous" as const, work: { durationMs: 1_800_000 } } };
  if (kind === "intervals") return { sessionKind: kind, weekday, phases: phase, advisoryTarget, contextual: { repetitions: 4, work: { durationMs: 180_000 }, recovery: { durationMs: 90_000 } } };
  if (kind === "hills") return { sessionKind: kind, weekday, phases: phase, advisoryTarget, contextual: { repetitions: 4, work: { durationMs: 120_000 }, returnRecovery: { durationMs: 120_000 } } };
  return { sessionKind: kind, weekday, phases: phase, advisoryTarget, contextual: { format: "structured" as const, repetitions: 4, work: { durationMs: 120_000 }, recovery: { durationMs: 120_000 } } };
}

function aggregateFacts(plan: RunningPlanAggregate, requestIds: readonly string[]): Phase17Facts {
  return Object.freeze({
    planId: plan.id, planRevision: plan.revision, lifecycle: plan.lifecycle, active: plan.active,
    goalRevision: plan.goal.revision,
    sessions: plan.sessions.map(({ session, slot }) => Object.freeze({
      sessionRootId: session.rootId, sessionRevisionId: session.id, sessionRevision: session.revision,
      sessionKind: session.sessionKind, slotRootId: slot.rootId, slotRevisionId: slot.id,
      slotRevision: slot.revision, weekday: slot.weekday, ordinal: slot.ordinal,
    })),
    requestIds: [...requestIds],
  });
}

function selectorsFor(plan: RunningPlanAggregate, requestIds: readonly string[]) {
  const first = plan.sessions[0];
  return Object.freeze({
    runningPlanId: plan.id,
    runningPlanRevision: String(plan.revision),
    ...(first === undefined ? {} : { runningSessionRootId: first.session.rootId, runningSessionRevisionId: first.session.id, runningSlotRootId: first.slot.rootId, runningSlotRevisionId: first.slot.id }),
    ...(requestIds[0] === undefined ? {} : { runningRequestId: requestIds[0] }),
  });
}

async function receiptIds(kernel: SqliteKernel, planId: string): Promise<readonly string[]> {
  const rows = await kernel.queryAll<Readonly<{ request_id: string }>>("SELECT request_id FROM running_plan_receipts WHERE plan_id = ? ORDER BY committed_at_ms, request_id", [planId]);
  return Object.freeze(rows.map(({ request_id }) => request_id));
}

/**
 * The driver only uses the production Running port for setup mutations.  SQL
 * is restricted to fixture-owned readback and ordered cleanup, which lets a
 * native action create its normal revision/receipt graph while retaining a
 * token-scoped rollback path.
 */
export function createPhase17FamilyBFixtureDriver(input: Readonly<{
  kernel: SqliteKernel;
  running: RunningPlanRuntimePort;
  sha256(value: string): Promise<string>;
}>): Phase17FamilyBFixtureDriver {
  const create = async (caseId: Phase17FamilyBCaseId, token: string): Promise<RunningPlanAggregate | null> => {
    const planId = fixtureId(token, "running-plan");
    // The zero-session journey must prove the create command itself.  It is
    // intentionally the one Family B setup that begins with no plan row.
    if (caseId === "library.running-create-zero-sessions") return null;
    const now = Date.now();
    const initialKinds = caseId === "library.running-session-lifecycle" || caseId === "library.running-two-same-day-slots"
      ? ["recovery", "long_run"] as const
      : [] as readonly RunningSessionKind[];
    const sessions = initialKinds.map((kind, index) => {
      const rootId = fixtureId(token, `session-${index}`);
      const revisionId = fixtureId(token, `session-revision-${index}`);
      const slotRootId = fixtureId(token, `slot-${index}`);
      const slotId = fixtureId(token, `slot-revision-${index}`);
      const { weekday, ...definition } = sessionSpec(kind, "Monday");
      return Object.freeze({
        session: Object.freeze({ version: 1 as const, id: revisionId, rootId, planId, revision: 1, createdAtMs: now, ...definition }),
        slot: Object.freeze({ id: slotId, rootId: slotRootId, weekday, revision: 1, ordinal: index }),
      });
    });
    return input.running.createInactivePlan({ plan: {
      version: 1, id: planId, name: "Phase 17 Running fixture", revision: 1, createdAtMs: now,
      goal: { version: 1, id: fixtureId(token, "goal"), planId, revision: 1, goalDistanceMeters: 3_000, targetDurationMs: 1_800_000, trainingDays: ["Monday"], runsPerWeek: 1, longRunDay: "Monday", currentWeeklyDistanceMeters: 10_000, createdAtMs: now },
      sessions,
    } });
  };

  const seed = async (caseId: Phase17FamilyBCaseId, token: string, sourceTable: string): Promise<Phase17FixtureSeed> => {
    const created = await create(caseId, token);
    if (caseId === "library.running-create-zero-sessions") {
      const planId = fixtureId(token, "running-plan");
      const receipts = plannedActionReceiptIds(caseId, token);
      const actionReceiptId = receipts[0]!;
      return Object.freeze({
        selectors: Object.freeze({}),
        actionInputs: Object.freeze({ runningPlanId: planId }),
        expectedPreState: Object.freeze({ planId, planExists: false }),
        expectedPostState: Object.freeze({ planId, planExists: true, actionReceiptId, actionReceiptIds: receipts, action: caseId, sessionCount: 0 }),
        actionReceiptId,
      });
    }
    if (created === null) throw new Error("phase17_running_fixture_create_missing");
    let plan = await input.running.loadPlan(created.id);
    if (plan === null) throw new Error("phase17_running_fixture_readback_missing");
    // Setup creates only the condition the screen needs to begin.  In
    // particular, it never writes the goal/session/lifecycle result that the
    // Maestro case is supposed to prove.
    const requestIds = await receiptIds(input.kernel, plan.id);
    const facts = aggregateFacts(plan, requestIds);
    if (caseId === "library.running-detail") {
      return Object.freeze({ selectors: selectorsFor(plan, requestIds), expectedPreState: facts, expectedPostState: facts, actionReceiptId: null });
    }
    const actionReceiptIds = plannedActionReceiptIds(caseId, token);
    const actionReceiptId = actionReceiptIds[0] ?? fixtureActionReceiptId(caseId, token);
    const selectedKind = kindFor(caseId);
    const expectedPostState = Object.freeze({
      planId: plan.id,
      actionReceiptId,
      actionReceiptIds,
      action: caseId,
      ...(selectedKind === null ? {} : { savedSessionKind: selectedKind }),
      ...(caseId === "library.running-goal-edit" ? { goalDistanceMeters: 5_000 } : {}),
      ...(caseId === "library.running-session-lifecycle" ? { lifecycle: "inactive", sessionsRemoved: true } : {}),
      ...(caseId === "library.running-create-typed-sessions" ? { savedSessionKinds: KINDS } : {}),
      ...(caseId === "library.running-two-same-day-slots" ? { sessionCount: 1 } : {}),
    });
    return Object.freeze({ selectors: selectorsFor(plan, requestIds), expectedPreState: facts, expectedPostState, actionReceiptId });
  };

  const probe = async (caseId: Phase17FamilyBCaseId, token: string, sourceTable: string, selectors: Readonly<Record<string, string>>) => {
    const planId = fixtureId(token, "running-plan");
    if (caseId === "library.running-create-zero-sessions") {
      if (Object.keys(selectors).length !== 0) throw new Error("phase17_running_fixture_selector_invalid");
    } else if (selectors.runningPlanId !== planId || selectors.runningPlanRevision === undefined) {
      throw new Error("phase17_running_fixture_selector_invalid");
    }
    const plan = await input.running.loadPlan(planId);
    const actionReceiptId = caseId === "library.running-detail" ? undefined : plannedActionReceiptIds(caseId, token)[0];
    const expectedActionReceiptIds = plannedActionReceiptIds(caseId, token);
    if (caseId === "library.running-create-zero-sessions") {
      if (plan === null) throw new Error("phase17_running_fixture_probe_missing");
      if (actionReceiptId === undefined) throw new Error("phase17_running_fixture_action_receipt_missing");
      const requestIds = await receiptIds(input.kernel, planId);
      if (!expectedActionReceiptIds.every((id) => requestIds.includes(id)) || plan.sessions.length !== 0) throw new Error("phase17_running_fixture_zero_sessions_invalid");
      const facts = Object.freeze({ planId, planExists: true, actionReceiptId, actionReceiptIds: expectedActionReceiptIds, action: caseId, sessionCount: 0 });
      return Object.freeze({ rowCount: 1, identityHash: await input.sha256(JSON.stringify({ caseId, sourceTable, planId, requestIds })), facts });
    }
    if (plan === null) throw new Error("phase17_running_fixture_probe_missing");
    const requestIds = await receiptIds(input.kernel, planId);
    const facts = actionReceiptId === undefined
      ? aggregateFacts(plan, requestIds)
      : (() => {
        if (!expectedActionReceiptIds.every((id) => requestIds.includes(id))) throw new Error("phase17_running_fixture_action_receipt_missing");
        const selectedKind = kindFor(caseId);
        const sessionCount = plan.sessions.length;
        if (selectedKind !== null && !plan.sessions.some(({ session }) => session.sessionKind === selectedKind)) throw new Error("phase17_running_fixture_saved_session_missing");
        if (caseId === "library.running-goal-edit" && plan.goal.goalDistanceMeters !== 5_000) throw new Error("phase17_running_fixture_goal_edit_missing");
        if (caseId === "library.running-session-lifecycle" && (plan.lifecycle !== "inactive" || sessionCount !== 0)) throw new Error("phase17_running_fixture_lifecycle_postcondition_missing");
        if (caseId === "library.running-create-typed-sessions" && !KINDS.every((kind) => plan.sessions.some(({ session }) => session.sessionKind === kind))) throw new Error("phase17_running_fixture_typed_sessions_missing");
        if (caseId === "library.running-two-same-day-slots" && sessionCount !== 1) throw new Error("phase17_running_fixture_same_day_postcondition_missing");
        return Object.freeze({
          planId,
          actionReceiptId,
          actionReceiptIds: expectedActionReceiptIds,
          action: caseId,
          ...(selectedKind === null ? {} : { savedSessionKind: selectedKind }),
          ...(caseId === "library.running-goal-edit" ? { goalDistanceMeters: plan.goal.goalDistanceMeters } : {}),
          ...(caseId === "library.running-session-lifecycle" ? { lifecycle: "inactive", sessionsRemoved: true } : {}),
          ...(caseId === "library.running-create-typed-sessions" ? { savedSessionKinds: KINDS } : {}),
          ...(caseId === "library.running-two-same-day-slots" ? { sessionCount } : {}),
        });
      })();
    const identityHash = await input.sha256(JSON.stringify({ caseId, sourceTable, planId, requestIds, sessions: plan.sessions }));
    return Object.freeze({ rowCount: 1, identityHash, facts });
  };

  const cleanup = async (caseId: Phase17FamilyBCaseId, token: string, selectors: Phase17FixtureSelectors) => {
    const planId = fixtureId(token, "running-plan");
    if (caseId === "library.running-create-zero-sessions") {
      if (Object.keys(selectors).length !== 0) throw new Error("phase17_running_fixture_selector_invalid");
    } else if (selectors.runningPlanId !== planId || selectors.runningPlanRevision === undefined) {
      throw new Error("phase17_running_fixture_selector_invalid");
    }
    await input.kernel.write(async (transaction) => {
      // Child facts first. Every predicate is anchored on the returned plan ID,
      // so a fixture can never remove an unrelated user's Running graph.
      await transaction.execute("DELETE FROM running_opportunities WHERE plan_id = ?", [planId]);
      await transaction.execute("DELETE FROM running_plan_events WHERE plan_id = ?", [planId]);
      await transaction.execute("DELETE FROM running_plan_receipts WHERE plan_id = ?", [planId]);
      await transaction.execute("DELETE FROM running_goals WHERE plan_id = ?", [planId]);
      await transaction.execute("DELETE FROM running_session_slot_revisions WHERE slot_root_id IN (SELECT id FROM running_session_slot_roots WHERE plan_id = ?)", [planId]);
      await transaction.execute("DELETE FROM running_session_slots WHERE plan_id = ?", [planId]);
      await transaction.execute("DELETE FROM running_session_slot_roots WHERE plan_id = ?", [planId]);
      await transaction.execute("DELETE FROM running_session_revisions WHERE plan_id = ?", [planId]);
      await transaction.execute("DELETE FROM running_session_roots WHERE plan_id = ?", [planId]);
      await transaction.execute("DELETE FROM owned_plan_schedule_bindings WHERE schedule_version_id IN (SELECT id FROM owned_plan_schedule_versions WHERE schedule_id IN (SELECT id FROM owned_plan_schedules WHERE plan_id = ?))", [planId]);
      await transaction.execute("DELETE FROM owned_plan_schedule_versions WHERE schedule_id IN (SELECT id FROM owned_plan_schedules WHERE plan_id = ?)", [planId]);
      await transaction.execute("DELETE FROM owned_plan_schedules WHERE plan_id = ?", [planId]);
      await transaction.execute("DELETE FROM plan_days WHERE plan_id = ?", [planId]);
      await transaction.execute("DELETE FROM running_plans WHERE plan_id = ?", [planId]);
      await transaction.execute("DELETE FROM plans WHERE id = ? AND plan_kind = 'running'", [planId]);
    });
  };
  return Object.freeze({ selectorSchema: phase17FamilyBSelectorSchema, seed, probe, cleanup });
}
