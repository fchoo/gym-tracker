import type { Phase17CaseActionContract } from "../testing/contracts/phase17LibraryRunning.contract";
import type { RunningPlanRuntimePort } from "./runningPlanRuntime";
import type { SqliteKernel } from "../platform/sqlite";
import type { RunningPlanAggregate, RunningSessionKind } from "../domains/running/contracts";
import type { Phase17Facts, Phase17FixtureAdapter, Phase17FixtureSeed } from "./phase17NativeFixture";
import type { Phase17FamilyAFixtureDriver } from "./phase17FamilyAFixture";

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
  seed(caseId: Phase17FamilyBCaseId, fixtureToken: string, sourceTable: string): Promise<Phase17FixtureSeed>;
  probe(caseId: Phase17FamilyBCaseId, fixtureToken: string, sourceTable: string, selectors: Readonly<Record<string, string>>): Promise<Readonly<{ rowCount: number; identityHash: string; facts: Phase17Facts }>>;
  cleanup(caseId: Phase17FamilyBCaseId, fixtureToken: string, selectors: Readonly<Record<string, string>>): Promise<void>;
}>;

export function isPhase17FamilyBCaseId(value: string): value is Phase17FamilyBCaseId {
  return (PHASE17_FAMILY_B_CASE_IDS as readonly string[]).includes(value);
}

export function assertPhase17FamilyBRegistry(contracts: readonly Phase17CaseActionContract[]): true {
  const ids = new Set(contracts.map(({ id }) => id));
  for (const id of PHASE17_FAMILY_B_CASE_IDS) if (!ids.has(id)) throw new Error(`phase17_family_b_contract_missing:${id}`);
  return true;
}

/** Routes only explicit Family A/B implementations.  Everything else (notably
 * collision) fails closed instead of borrowing a superficially similar row. */
export function createPhase17FamilyFixtureAdapter(input: Readonly<{
  baselineDigest: Phase17FixtureAdapter["baselineDigest"];
  canonicalHash: Phase17FixtureAdapter["canonicalHash"];
  familyA: Phase17FamilyAFixtureDriver;
  familyB: Phase17FamilyBFixtureDriver;
}>): Phase17FixtureAdapter {
  // Family A's public type guard lives in its own module.  Avoid a generic
  // fallback by comparing against the supplied driver's explicit registry via
  // a typed probe below, which rejects unknown IDs before driver invocation.
  return Object.freeze({
    baselineDigest: input.baselineDigest,
    canonicalHash: input.canonicalHash,
    seed: async ({ caseId, fixtureToken, sourceTable }) => {
      if (isPhase17FamilyBCaseId(caseId)) return input.familyB.seed(caseId, fixtureToken, sourceTable);
      try { return await (input.familyA as Phase17FamilyAFixtureDriver).seed(caseId as never, fixtureToken, sourceTable); }
      catch (error) { if ((error as Error).message === "phase17_fixture_family_unimplemented") throw error; throw error; }
    },
    probe: async ({ caseId, fixtureToken, sourceTable, selectors }) => {
      if (isPhase17FamilyBCaseId(caseId)) return input.familyB.probe(caseId, fixtureToken, sourceTable, selectors);
      return input.familyA.probe(caseId as never, fixtureToken, sourceTable, selectors);
    },
    cleanup: async ({ caseId, fixtureToken, selectors }) => {
      if (isPhase17FamilyBCaseId(caseId)) return input.familyB.cleanup(caseId, fixtureToken, selectors);
      await input.familyA.cleanup(caseId as never, fixtureToken, selectors);
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
  const create = async (caseId: Phase17FamilyBCaseId, token: string): Promise<RunningPlanAggregate> => {
    const planId = fixtureId(token, "running-plan");
    const now = Date.now();
    const initialKinds = caseId === "library.running-session-lifecycle" || caseId === "library.running-two-same-day-slots"
      ? ["recovery", "long_run"] as const
      : caseId === "library.running-create-typed-sessions" ? KINDS
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
      goal: { version: 1, id: fixtureId(token, "goal"), planId, revision: 1, goalDistanceMeters: 5_000, targetDurationMs: 1_800_000, trainingDays: ["Monday"], runsPerWeek: 1, longRunDay: "Monday", currentWeeklyDistanceMeters: 10_000, createdAtMs: now },
      sessions,
    } });
  };

  const seed = async (caseId: Phase17FamilyBCaseId, token: string, sourceTable: string) => {
    const created = await create(caseId, token);
    let plan = await input.running.loadPlan(created.id);
    if (plan === null) throw new Error("phase17_running_fixture_readback_missing");
    // Goal/lifecycle fixtures prove the real prospective revision and receipt
    // path during setup, then expose its returned IDs/revisions to Maestro.
    if (caseId === "library.running-goal-edit") {
      plan = await input.running.savePlan({ ...plan, name: plan.name, goal: { ...plan.goal, goalDistanceMeters: 10_000 } });
    }
    if (caseId === "library.running-detail") {
      const result = await input.running.saveSession({ planId: plan.id, expectedPlanRevision: plan.revision, requestId: fixtureId(token, "detail-session-request"), session: sessionSpec("recovery", "Monday") });
      plan = result.plan;
    }
    if (caseId === "library.running-session-common") {
      const result = await input.running.saveSession({ planId: plan.id, expectedPlanRevision: plan.revision, requestId: fixtureId(token, "common-session-request"), session: sessionSpec("recovery", "Monday") });
      plan = result.plan;
    }
    const selectedKind = kindFor(caseId);
    if (selectedKind !== null) {
      const result = await input.running.saveSession({ planId: plan.id, expectedPlanRevision: plan.revision, requestId: fixtureId(token, `${selectedKind}-session-request`), session: sessionSpec(selectedKind, "Monday") });
      plan = result.plan;
    }
    if (caseId === "library.running-session-lifecycle") {
      // Preserve a real same-day graph for the edit/reorder/delete UI.  The
      // current projection is read back below; no raw table count is used.
      plan = await input.running.savePlan({ ...plan, name: plan.name, sessions: [...plan.sessions].reverse() });
    }
    const requestIds = await receiptIds(input.kernel, plan.id);
    const facts = aggregateFacts(plan, requestIds);
    return Object.freeze({ selectors: selectorsFor(plan, requestIds), expectedPreState: facts, expectedPostState: facts });
  };

  const probe = async (caseId: Phase17FamilyBCaseId, token: string, sourceTable: string, selectors: Readonly<Record<string, string>>) => {
    const planId = selectors.runningPlanId;
    if (planId === undefined || planId !== fixtureId(token, "running-plan")) throw new Error("phase17_running_fixture_selector_invalid");
    const plan = await input.running.loadPlan(planId);
    if (plan === null) throw new Error("phase17_running_fixture_probe_missing");
    const requestIds = await receiptIds(input.kernel, planId);
    const facts = aggregateFacts(plan, requestIds);
    const identityHash = await input.sha256(JSON.stringify({ caseId, sourceTable, planId, requestIds, sessions: facts.sessions }));
    return Object.freeze({ rowCount: 1, identityHash, facts });
  };

  const cleanup = async (_caseId: Phase17FamilyBCaseId, token: string, selectors: Readonly<Record<string, string>>) => {
    const planId = selectors.runningPlanId;
    if (planId === undefined || planId !== fixtureId(token, "running-plan")) throw new Error("phase17_running_fixture_selector_invalid");
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
  return Object.freeze({ seed, probe, cleanup });
}
