import type { Phase17CaseActionContract } from "../testing/contracts/phase17LibraryRunning.contract";
import type { Phase17Facts, Phase17FixtureAdapter, Phase17FixtureSeed } from "./phase17NativeFixture";

/**
 * Family A is intentionally explicit.  A missing ID is not allowed to fall
 * through to an owned-Strength fixture, because that would certify a route
 * with a row that its YAML never reads.
 */
export const PHASE17_FAMILY_A_CASE_IDS = Object.freeze([
  "library.remembered-state", "library.plan-groups", "library.exercise-search",
  "library.exercise-favorites", "library.actions-sheet", "library.neutral-plan-chooser",
  "library.true-no-plans", "library.owned-summary", "library.owned-lifecycle",
  "library.starter-detail", "library.starter-activation", "library.template-update",
  "library.create-strength", "library.plan-editor", "library.editor-draft-guards",
  "library.schedule-editor", "library.replacement-impact", "library.day-removal-impact",
  "library.builtin-exercise", "library.custom-exercise", "library.create-exercise",
  "library.copy-metric-migration", "library.load-error-recovery",
] as const);

export type Phase17FamilyACaseId = (typeof PHASE17_FAMILY_A_CASE_IDS)[number];

export type Phase17FamilyAFixtureDriver = Readonly<{
  seed(caseId: Phase17FamilyACaseId, fixtureToken: string, sourceTable: string): Promise<Phase17FixtureSeed>;
  probe(caseId: Phase17FamilyACaseId, fixtureToken: string, sourceTable: string, selectors: Readonly<Record<string, string>>): Promise<Readonly<{ rowCount: number; identityHash: string; facts: Phase17Facts }>>;
  cleanup(caseId: Phase17FamilyACaseId, fixtureToken: string, selectors: Readonly<Record<string, string>>): Promise<void>;
}>;

export function isPhase17FamilyACaseId(value: string): value is Phase17FamilyACaseId {
  return (PHASE17_FAMILY_A_CASE_IDS as readonly string[]).includes(value);
}

export function assertPhase17FamilyARegistry(contracts: readonly Phase17CaseActionContract[]): true {
  const byId = new Map(contracts.map((contract) => [contract.id, contract]));
  for (const id of PHASE17_FAMILY_A_CASE_IDS) {
    if (byId.get(id) === undefined) throw new Error(`phase17_family_a_contract_missing:${id}`);
  }
  return true;
}

export function createPhase17FamilyAFixtureAdapter(input: Readonly<{
  baselineDigest: Phase17FixtureAdapter["baselineDigest"];
  canonicalHash: Phase17FixtureAdapter["canonicalHash"];
  driver: Phase17FamilyAFixtureDriver;
}>): Phase17FixtureAdapter {
  return Object.freeze({
    baselineDigest: input.baselineDigest,
    canonicalHash: input.canonicalHash,
    seed: async ({ caseId, fixtureToken, sourceTable }) => {
      if (!isPhase17FamilyACaseId(caseId)) throw new Error("phase17_fixture_family_unimplemented");
      return input.driver.seed(caseId, fixtureToken, sourceTable);
    },
    probe: async ({ caseId, fixtureToken, sourceTable, selectors }) => {
      if (!isPhase17FamilyACaseId(caseId)) throw new Error("phase17_fixture_family_unimplemented");
      return input.driver.probe(caseId, fixtureToken, sourceTable, selectors);
    },
    cleanup: async ({ caseId, fixtureToken, selectors }) => {
      if (!isPhase17FamilyACaseId(caseId)) throw new Error("phase17_fixture_family_unimplemented");
      await input.driver.cleanup(caseId, fixtureToken, selectors);
    },
  });
}
