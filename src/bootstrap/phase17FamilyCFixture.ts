import type { ScheduleCollisionChoice, ScheduleCollisionPreview } from "../domains/scheduling/collisionCommands";
import type { SqliteKernel } from "../platform/sqlite";
import { createScheduleCollisionRepository } from "../platform/sqlite/repositories/scheduleCollisionRepository";
import { createTrainingCalendarRepository } from "../platform/sqlite/repositories/trainingCalendarRepository";
import type { Phase17CaseActionContract } from "../testing/contracts/phase17LibraryRunning.contract";
import type { Phase17Facts, Phase17FixtureSeed, Phase17FixtureSelectorSchema, Phase17FixtureSelectors } from "./phase17NativeFixture";

export const PHASE17_FAMILY_C_CASE_IDS = Object.freeze(["library.running-conflict"] as const);
export type Phase17FamilyCCaseId = (typeof PHASE17_FAMILY_C_CASE_IDS)[number];
const choices = Object.freeze(["move_running", "move_strength", "keep_both"] as const);
const receiptId = (caseId: string, token: string, index: number) => `${`phase17:${caseId}:${token.slice("phase17:".length)}:action`}${index === 0 ? "" : `:${index + 1}`}`;
const suffix = (choice: ScheduleCollisionChoice) => choice.replace(/_([a-z])/gu, (_, letter: string) => letter.toUpperCase()).replace(/^./u, (letter) => letter.toUpperCase());

export function isPhase17FamilyCCaseId(value: string): value is Phase17FamilyCCaseId { return (PHASE17_FAMILY_C_CASE_IDS as readonly string[]).includes(value); }
export function assertPhase17FamilyCRegistry(contracts: readonly Phase17CaseActionContract[]): true {
  const ids = new Set(contracts.map(({ id }) => id));
  for (const id of PHASE17_FAMILY_C_CASE_IDS) if (!ids.has(id)) throw new Error(`phase17_family_c_contract_missing:${id}`);
  return true;
}

export type Phase17FamilyCGraph = Readonly<{ choice: ScheduleCollisionChoice; runningPlanId: string; strengthPlanId: string; runningOpportunityId: string; strengthOpportunityId: string; runningScheduleId: string; strengthScheduleId: string; localDate: string }>;
export type Phase17FamilyCGraphDriver = Readonly<{
  /** Each choice owns an independent source graph, so no first choice can erase the next preview. */
  setupGraph(fixtureToken: string, choice: ScheduleCollisionChoice): Promise<Phase17FamilyCGraph>;
  cleanupGraph(graph: Phase17FamilyCGraph): Promise<void>;
  sha256(value: string): Promise<string>;
  nowMs(): number;
}>;

function facts(preview: ScheduleCollisionPreview, choice: ScheduleCollisionChoice | null, outcomeId: string | null): Phase17Facts {
  const selectedKind = choice === null ? null : choice === "keep_both" ? "none" : choice === "move_running" ? "running" : "strength";
  const selectedOpportunityId = choice === null || choice === "keep_both" ? null : choice === "move_running" ? preview.running.occurrenceId : preview.strength.occurrenceId;
  return Object.freeze({ runningPlanId: preview.running.planId, strengthPlanId: preview.strength.planId, runningOpportunityId: preview.running.occurrenceId, strengthOpportunityId: preview.strength.occurrenceId, runningScheduleRevision: preview.running.scheduleRevision, strengthScheduleRevision: preview.strength.scheduleRevision, confirmationToken: preview.confirmationToken, localDate: preview.running.localDate, choice, outcomeId, selectedKind, selectedOpportunityId, movedLocalDate: choice === null || choice === "keep_both" ? null : choice === "move_running" ? preview.running.movedLocalDate : preview.strength.movedLocalDate });
}

export type Phase17FamilyCFixtureDriver = Readonly<{
  selectorSchema(caseId: Phase17FamilyCCaseId): Phase17FixtureSelectorSchema;
  seed(caseId: Phase17FamilyCCaseId, fixtureToken: string, sourceTable: string): Promise<Phase17FixtureSeed>;
  probe(caseId: Phase17FamilyCCaseId, fixtureToken: string, sourceTable: string, selectors: Phase17FixtureSelectors): Promise<Readonly<{ rowCount: number; identityHash: string; facts: Phase17Facts }>>;
  cleanup(caseId: Phase17FamilyCCaseId, fixtureToken: string, selectors: Phase17FixtureSelectors): Promise<void>;
  confirm(fixtureToken: string, choice: ScheduleCollisionChoice, requestId: string): Promise<unknown>;
}>;

export function phase17FamilyCSelectorSchema(_caseId: Phase17FamilyCCaseId): Phase17FixtureSelectorSchema {
  return Object.freeze({
    selectors: Object.freeze(choices.flatMap((choice) => {
      const named = suffix(choice);
      return [`runningPlanId${named}`, `strengthPlanId${named}`, `runningOpportunityId${named}`, `strengthOpportunityId${named}`, `collisionToken${named}`];
    })),
    actionInputs: Object.freeze(choices.map((choice) => `phase17ActionReceiptId${suffix(choice)}`)),
  });
}

export function createPhase17FamilyCFixtureDriver(input: Readonly<{ kernel: SqliteKernel; graph: Phase17FamilyCGraphDriver }>): Phase17FamilyCFixtureDriver {
  const collisions = createScheduleCollisionRepository(input.kernel, input.graph.sha256);
  const calendar = createTrainingCalendarRepository(input.kernel);
  const fixtures = new Map<string, ReadonlyMap<ScheduleCollisionChoice, Readonly<{ graph: Phase17FamilyCGraph; preview: ScheduleCollisionPreview }>>>();
  const seed = async (caseId: Phase17FamilyCCaseId, token: string, sourceTable: string): Promise<Phase17FixtureSeed> => {
    if (sourceTable !== "schedule_collision_projections") throw new Error("phase17_collision_fixture_table_invalid");
    const entries = await Promise.all(choices.map(async (choice) => {
      const graph = await input.graph.setupGraph(token, choice);
      const preview = await collisions.previewForRunningPlan(graph.runningPlanId);
      if (preview === null || preview.running.occurrenceId !== graph.runningOpportunityId || preview.strength.occurrenceId !== graph.strengthOpportunityId || preview.running.localDate !== graph.localDate || preview.strength.localDate !== graph.localDate) throw new Error("phase17_collision_fixture_preview_missing");
      return [choice, Object.freeze({ graph, preview })] as const;
    }));
    const byChoice = new Map(entries); fixtures.set(token, byChoice);
    const selectors = Object.fromEntries(choices.flatMap((choice) => {
      const entry = byChoice.get(choice)!; const named = suffix(choice);
      return [[`runningPlanId${named}`, entry.graph.runningPlanId], [`strengthPlanId${named}`, entry.graph.strengthPlanId], [`runningOpportunityId${named}`, entry.graph.runningOpportunityId], [`strengthOpportunityId${named}`, entry.graph.strengthOpportunityId], [`collisionToken${named}`, entry.preview.confirmationToken]];
    }));
    const actionInputs = Object.fromEntries(choices.map((choice, index) => [`phase17ActionReceiptId${suffix(choice)}`, receiptId(caseId, token, index)]));
    return Object.freeze({ selectors: Object.freeze(selectors), actionInputs: Object.freeze(actionInputs), expectedPreState: Object.freeze({ collisionOutcomes: choices.map((choice) => facts(byChoice.get(choice)!.preview, null, null)) }), expectedPostState: Object.freeze({ collisionOutcomes: choices.map((choice, index) => Object.freeze({ ...facts(byChoice.get(choice)!.preview, choice, receiptId(caseId, token, index)), actionReceiptId: receiptId(caseId, token, index) })) }), actionReceiptId: receiptId(caseId, token, 0) });
  };
  const probe = async (caseId: Phase17FamilyCCaseId, token: string, sourceTable: string, selectors: Readonly<Record<string, string>>) => {
    const fixture = fixtures.get(token);
    if (fixture === undefined || sourceTable !== "schedule_collision_projections") throw new Error("phase17_collision_fixture_selector_invalid");
    const outcomes = await Promise.all(choices.map(async (choice, index) => {
      const entry = fixture.get(choice)!; const named = suffix(choice); const actionReceiptId = receiptId(caseId, token, index);
      if (selectors[`runningOpportunityId${named}`] !== entry.preview.running.occurrenceId || selectors[`strengthOpportunityId${named}`] !== entry.preview.strength.occurrenceId) throw new Error("phase17_collision_fixture_selector_invalid");
      const [outcome] = await input.kernel.queryAll<Readonly<{ id: string; choice: ScheduleCollisionChoice }>>("SELECT id, choice FROM schedule_collision_outcomes WHERE request_id = ? AND running_opportunity_id = ? AND strength_opportunity_id = ?", [actionReceiptId, entry.preview.running.occurrenceId, entry.preview.strength.occurrenceId]);
      if (outcome === undefined || outcome.choice !== choice) throw new Error("phase17_collision_fixture_probe_missing");
      const [projection] = await input.kernel.queryAll<Readonly<{ selected_kind: string; selected_opportunity_id: string | null; effective_local_date: string; moved_local_date: string | null; acknowledged: number }>>("SELECT selected_kind, selected_opportunity_id, effective_local_date, moved_local_date, acknowledged FROM schedule_collision_projections WHERE outcome_id = ?", [outcome.id]);
      const expectedKind = choice === "keep_both" ? "none" : choice === "move_running" ? "running" : "strength";
      const expectedMoved = choice === "keep_both" ? null : choice === "move_running" ? entry.preview.running.movedLocalDate : entry.preview.strength.movedLocalDate;
      if (projection === undefined || projection.selected_kind !== expectedKind || projection.effective_local_date !== entry.preview.running.localDate || projection.moved_local_date !== expectedMoved || projection.acknowledged !== (choice === "keep_both" ? 1 : 0)) throw new Error("phase17_collision_fixture_projection_missing");
      const ids = (await calendar.loadRange({ startLocalDate: entry.preview.running.localDate, endLocalDateExclusive: entry.preview.running.movedLocalDate })).events.map(({ id }) => id);
      if (ids.filter((id) => id === entry.preview.running.occurrenceId).length > 1 || ids.filter((id) => id === entry.preview.strength.occurrenceId).length > 1) throw new Error("phase17_collision_fixture_duplicate_event");
      return Object.freeze({ ...facts(entry.preview, choice, actionReceiptId), actionReceiptId });
    }));
    const factsValue = Object.freeze({ collisionOutcomes: outcomes });
    return Object.freeze({ rowCount: outcomes.length, identityHash: await input.graph.sha256(JSON.stringify({ token, sourceTable, factsValue })), facts: factsValue });
  };
  const cleanup = async (_caseId: Phase17FamilyCCaseId, token: string, selectors: Readonly<Record<string, string>>) => {
    const fixture = fixtures.get(token);
    if (fixture === undefined || selectors.runningPlanIdMoveRunning !== fixture.get("move_running")?.preview.running.planId) throw new Error("phase17_collision_fixture_selector_invalid");
    await input.kernel.write(async (transaction) => { for (const { preview } of fixture.values()) { await transaction.execute("DELETE FROM schedule_collision_projections WHERE outcome_id IN (SELECT id FROM schedule_collision_outcomes WHERE running_opportunity_id = ?)", [preview.running.occurrenceId]); await transaction.execute("DELETE FROM schedule_collision_receipts WHERE outcome_id IN (SELECT id FROM schedule_collision_outcomes WHERE running_opportunity_id = ?)", [preview.running.occurrenceId]); await transaction.execute("DELETE FROM schedule_collision_outcomes WHERE running_opportunity_id = ?", [preview.running.occurrenceId]); } });
    await collisions.rebuildProjection(); for (const { graph } of fixture.values()) await input.graph.cleanupGraph(graph); fixtures.delete(token);
  };
  async function confirm(token: string, choice: ScheduleCollisionChoice, requestId: string) { const preview = fixtures.get(token)?.get(choice)?.preview; if (preview === undefined) throw new Error("phase17_collision_fixture_missing"); return collisions.confirm({ requestId, choice, preview, committedAtMs: input.graph.nowMs() }); }
  return Object.freeze({ selectorSchema: phase17FamilyCSelectorSchema, seed, probe, cleanup, confirm });
}
