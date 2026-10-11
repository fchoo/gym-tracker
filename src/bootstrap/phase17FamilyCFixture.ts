import type { ScheduleCollisionChoice, ScheduleCollisionPreview } from "../domains/scheduling/collisionCommands";
import type { SqliteKernel } from "../platform/sqlite";
import { createScheduleCollisionRepository } from "../platform/sqlite/repositories/scheduleCollisionRepository";
import { createTrainingCalendarRepository } from "../platform/sqlite/repositories/trainingCalendarRepository";
import type { Phase17CaseActionContract } from "../testing/contracts/phase17LibraryRunning.contract";
import type { Phase17Facts, Phase17FixtureSeed } from "./phase17NativeFixture";

/** Collision has one ledger route, but three owner choices.  Keep it separate
 * from Running authoring so it can never be certified by a plan-only row. */
export const PHASE17_FAMILY_C_CASE_IDS = Object.freeze(["library.running-conflict"] as const);
export type Phase17FamilyCCaseId = (typeof PHASE17_FAMILY_C_CASE_IDS)[number];

export function isPhase17FamilyCCaseId(value: string): value is Phase17FamilyCCaseId {
  return (PHASE17_FAMILY_C_CASE_IDS as readonly string[]).includes(value);
}

export function assertPhase17FamilyCRegistry(contracts: readonly Phase17CaseActionContract[]): true {
  const ids = new Set(contracts.map(({ id }) => id));
  for (const id of PHASE17_FAMILY_C_CASE_IDS) if (!ids.has(id)) throw new Error(`phase17_family_c_contract_missing:${id}`);
  return true;
}

export type Phase17FamilyCGraph = Readonly<{
  runningPlanId: string;
  strengthPlanId: string;
  runningOpportunityId: string;
  strengthOpportunityId: string;
  runningScheduleId: string;
  strengthScheduleId: string;
  localDate: string;
}>;

export type Phase17FamilyCGraphDriver = Readonly<{
  /** Must use command ports to create the real Strength + Running source graph. */
  setupGraph(fixtureToken: string): Promise<Phase17FamilyCGraph>;
  cleanupGraph(graph: Phase17FamilyCGraph): Promise<void>;
  sha256(value: string): Promise<string>;
  nowMs(): number;
}>;

function facts(preview: ScheduleCollisionPreview, choice: ScheduleCollisionChoice | null, outcomeId: string | null): Phase17Facts {
  const selectedKind = choice === null ? null : choice === "keep_both" ? "none" : choice === "move_running" ? "running" : "strength";
  const selectedOpportunityId = choice === null || choice === "keep_both" ? null : choice === "move_running" ? preview.running.occurrenceId : preview.strength.occurrenceId;
  return Object.freeze({
    runningPlanId: preview.running.planId, strengthPlanId: preview.strength.planId,
    runningOpportunityId: preview.running.occurrenceId, strengthOpportunityId: preview.strength.occurrenceId,
    runningScheduleRevision: preview.running.scheduleRevision, strengthScheduleRevision: preview.strength.scheduleRevision,
    confirmationToken: preview.confirmationToken, localDate: preview.running.localDate,
    choice, outcomeId, selectedKind, selectedOpportunityId,
    movedLocalDate: choice === null || choice === "keep_both" ? null : choice === "move_running" ? preview.running.movedLocalDate : preview.strength.movedLocalDate,
  });
}

/** Real-SQLite Family C driver.  The graph producer is deliberately injected:
 * production supplies authoritative command ports, while host tests provide a
 * migrated fixture graph.  Probe is always identity-scoped and never counts a
 * whole table. */
export type Phase17FamilyCFixtureDriver = Readonly<{
  seed(caseId: Phase17FamilyCCaseId, fixtureToken: string, sourceTable: string): Promise<Phase17FixtureSeed>;
  probe(caseId: Phase17FamilyCCaseId, fixtureToken: string, sourceTable: string, selectors: Readonly<Record<string, string>>): Promise<Readonly<{ rowCount: number; identityHash: string; facts: Phase17Facts }>>;
  cleanup(caseId: Phase17FamilyCCaseId, fixtureToken: string, selectors: Readonly<Record<string, string>>): Promise<void>;
  confirm(fixtureToken: string, choice: ScheduleCollisionChoice, requestId: string): Promise<unknown>;
}>;

export function createPhase17FamilyCFixtureDriver(input: Readonly<{ kernel: SqliteKernel; graph: Phase17FamilyCGraphDriver }>): Phase17FamilyCFixtureDriver {
  const collisions = createScheduleCollisionRepository(input.kernel, input.graph.sha256);
  const calendar = createTrainingCalendarRepository(input.kernel);
  const previews = new Map<string, ScheduleCollisionPreview>();

  const seed = async (_caseId: Phase17FamilyCCaseId, token: string, sourceTable: string): Promise<Phase17FixtureSeed> => {
    if (sourceTable !== "schedule_collision_projections") throw new Error("phase17_collision_fixture_table_invalid");
    const graph = await input.graph.setupGraph(token);
    const preview = await collisions.previewForRunningPlan(graph.runningPlanId);
    if (preview === null || preview.running.occurrenceId !== graph.runningOpportunityId || preview.strength.occurrenceId !== graph.strengthOpportunityId || preview.running.localDate !== graph.localDate || preview.strength.localDate !== graph.localDate) throw new Error("phase17_collision_fixture_preview_missing");
    previews.set(token, preview);
    const selectors = Object.freeze({ runningPlanId: graph.runningPlanId, strengthPlanId: graph.strengthPlanId, runningOpportunityId: graph.runningOpportunityId, strengthOpportunityId: graph.strengthOpportunityId, collisionToken: preview.confirmationToken });
    return Object.freeze({ selectors, expectedPreState: facts(preview, null, null), expectedPostState: facts(preview, "move_running", null) });
  };

  const probe = async (_caseId: Phase17FamilyCCaseId, token: string, sourceTable: string, selectors: Readonly<Record<string, string>>) => {
    const preview = previews.get(token);
    if (preview === undefined || sourceTable !== "schedule_collision_projections" || selectors.runningOpportunityId !== preview.running.occurrenceId || selectors.strengthOpportunityId !== preview.strength.occurrenceId) throw new Error("phase17_collision_fixture_selector_invalid");
    const [outcome] = await input.kernel.queryAll<Readonly<{ id: string; choice: ScheduleCollisionChoice }>>(
      "SELECT id, choice FROM schedule_collision_outcomes WHERE running_opportunity_id = ? AND strength_opportunity_id = ? ORDER BY committed_at_ms DESC, id DESC LIMIT 1",
      [preview.running.occurrenceId, preview.strength.occurrenceId],
    );
    if (outcome === undefined) throw new Error("phase17_collision_fixture_probe_missing");
    const [projection] = await input.kernel.queryAll<Readonly<{ outcome_id: string }>>("SELECT outcome_id FROM schedule_collision_projections WHERE outcome_id = ?", [outcome.id]);
    if (projection === undefined) throw new Error("phase17_collision_fixture_projection_missing");
    const range = await calendar.loadRange({ startLocalDate: preview.running.localDate, endLocalDateExclusive: preview.running.movedLocalDate });
    const ids = range.events.map(({ id }) => id);
    if (ids.filter((id) => id === preview.running.occurrenceId).length > 1 || ids.filter((id) => id === preview.strength.occurrenceId).length > 1) throw new Error("phase17_collision_fixture_duplicate_event");
    const value = facts(preview, outcome.choice, outcome.id);
    return Object.freeze({ rowCount: 1, identityHash: await input.graph.sha256(JSON.stringify({ token, sourceTable, value })), facts: value });
  };

  const cleanup = async (_caseId: Phase17FamilyCCaseId, token: string, selectors: Readonly<Record<string, string>>) => {
    const preview = previews.get(token);
    if (preview === undefined || selectors.runningPlanId !== preview.running.planId) throw new Error("phase17_collision_fixture_selector_invalid");
    // M41 permits only fixture-owned collision rows.  Delete dependants first,
    // then rebuild the replaceable projection before removing graph sources.
    await input.kernel.write(async (transaction) => {
      await transaction.execute("DELETE FROM schedule_collision_projections WHERE outcome_id IN (SELECT id FROM schedule_collision_outcomes WHERE running_opportunity_id = ?)", [preview.running.occurrenceId]);
      await transaction.execute("DELETE FROM schedule_collision_receipts WHERE outcome_id IN (SELECT id FROM schedule_collision_outcomes WHERE running_opportunity_id = ?)", [preview.running.occurrenceId]);
      await transaction.execute("DELETE FROM schedule_collision_outcomes WHERE running_opportunity_id = ?", [preview.running.occurrenceId]);
    });
    await collisions.rebuildProjection();
    await input.graph.cleanupGraph(Object.freeze({ runningPlanId: preview.running.planId, strengthPlanId: preview.strength.planId, runningOpportunityId: preview.running.occurrenceId, strengthOpportunityId: preview.strength.occurrenceId, runningScheduleId: preview.running.scheduleId, strengthScheduleId: preview.strength.scheduleId, localDate: preview.running.localDate }));
    previews.delete(token);
  };

  async function confirm(token: string, choice: ScheduleCollisionChoice, requestId: string) {
    const preview = previews.get(token);
    if (preview === undefined) throw new Error("phase17_collision_fixture_missing");
    return collisions.confirm({ requestId, choice, preview, committedAtMs: input.graph.nowMs() });
  }

  return Object.freeze({ seed, probe, cleanup, confirm });
}
