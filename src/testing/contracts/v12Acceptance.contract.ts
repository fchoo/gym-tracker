import {
  createExpoMigrationsEffectsContractAdapter,
  MIGRATIONS_EFFECTS_CONTRACT_CASES,
  runMigrationsEffectsContract,
} from "./migrationsEffects.contract";
import {
  createExpoPortableMergeContractAdapter,
  PORTABLE_MERGE_CONTRACT_CASES,
  runPortableMergeContract,
} from "./portableMerge.contract";
import {
  MULTI_PLAN_RUNNING_CONTRACT_CASES,
  runMultiPlanRunningContract,
} from "./multiPlanRunning.contract";
import { PROGRESS_PARITY_CONTRACT_CASES } from "./progressParity.contract";
import { GOOGLE_DRIVE_BACKUP_REQUIRED_CASE_IDS } from "./googleDriveBackup.contract";
import { PHASE18_GARMIN_ACCEPTANCE_CASE_IDS } from "./garminImport.contract";
import { CURRENT_SCHEMA_VERSION } from "../../platform/sqlite/migrations";

export const V12_ACCEPTANCE_SQLITE_CASE_IDS = [
  "fresh-migration", "schema27-upgrade", "supported-legacy-upgrade", "failure-reopen",
  "backup", "restore", "merge", "noop-replay", "rebuild", "immutable-history",
] as const;

const SOURCE_REGISTRY_CASE_IDS = Object.freeze({
  migrations: MIGRATIONS_EFFECTS_CONTRACT_CASES,
  "portable-merge": PORTABLE_MERGE_CONTRACT_CASES,
  "multi-plan-running": MULTI_PLAN_RUNNING_CONTRACT_CASES,
});

type SourceRegistry = keyof typeof SOURCE_REGISTRY_CASE_IDS;
export type V12AcceptanceSourceCaseDefinition = Readonly<{
  sourceRegistry: SourceRegistry;
  sourceCaseIds: readonly string[];
}>;

const SOURCE_CASES: readonly V12AcceptanceSourceCaseDefinition[] = Object.freeze([
  { sourceRegistry: "migrations", sourceCaseIds: ["migration-fresh-v27-schema23-registry"] },
  { sourceRegistry: "migrations", sourceCaseIds: ["migration-fresh-v27-schema23-registry"] },
  { sourceRegistry: "migrations", sourceCaseIds: ["migration-retained-v1"] },
  { sourceRegistry: "migrations", sourceCaseIds: ["migration-statement-rollback"] },
  { sourceRegistry: "portable-merge", sourceCaseIds: ["portable-merge-mixed-full-plan-success"] },
  { sourceRegistry: "portable-merge", sourceCaseIds: ["portable-merge-same-identity-dedup-remap"] },
  { sourceRegistry: "portable-merge", sourceCaseIds: ["portable-merge-mixed-full-plan-success"] },
  { sourceRegistry: "portable-merge", sourceCaseIds: ["portable-merge-duplicate-only-ready"] },
  { sourceRegistry: "migrations", sourceCaseIds: ["migration-recovery-backup"] },
  { sourceRegistry: "multi-plan-running", sourceCaseIds: ["phase13-source-generation-neutrality"] },
] as const);

export const V12_ACCEPTANCE_SQLITE_CASES = Object.freeze(V12_ACCEPTANCE_SQLITE_CASE_IDS.map((id, index) =>
  Object.freeze({
    id,
    // Schema 27 is the retained mixed-upgrade fixture. The active terminal schema
    // is deliberately derived from the landed migration registry at execution.
    finalSchemaVersion: 27,
    currentSchemaVersion: CURRENT_SCHEMA_VERSION,
    sourceCaseIds: SOURCE_CASES[index]!.sourceCaseIds,
    sourceRegistry: SOURCE_CASES[index]!.sourceRegistry,
    sourceRegistries: Object.freeze([
      SOURCE_REGISTRY_CASE_IDS[SOURCE_CASES[index]!.sourceRegistry],
      GOOGLE_DRIVE_BACKUP_REQUIRED_CASE_IDS,
      PHASE18_GARMIN_ACCEPTANCE_CASE_IDS,
      PROGRESS_PARITY_CONTRACT_CASES,
    ]),
  }),
));

export type V12AcceptanceSqliteCase = (typeof V12_ACCEPTANCE_SQLITE_CASES)[number];
export type V12AcceptanceSqliteContractResult = Readonly<{
  schemaVersion: 1;
  contractVersion: 1;
  status: "passed" | "failed";
  total: number;
  passed: number;
  failed: number;
  skipped: 0;
  cases: readonly Readonly<{
    id: V12AcceptanceSqliteCase["id"];
    status: "passed" | "failed";
    code: "v12_acceptance_case_passed" | "v12_acceptance_case_failed";
    counts: Readonly<{ sourceCases: number }>;
    errorCode?: string;
  }>[];
}>;

export type V12AcceptanceSqliteContractAdapter = Readonly<{
  runMixedUpgrade(definition: V12AcceptanceSqliteCase): Promise<Readonly<{
    id: V12AcceptanceSqliteCase["id"];
    status: "passed" | "failed";
    code: "v12_acceptance_case_passed" | "v12_acceptance_case_failed";
    counts: Readonly<{ sourceCases: number }>;
    errorCode?: string;
  }>>;
}>;

export type V12AcceptanceProgressReporter = (stage: "migrations" | "portable-merge" | "multi-plan-running") => void;

function failedResult(id: V12AcceptanceSqliteCase["id"], sourceCases: number, error: unknown) {
  return {
    id,
    status: "failed" as const,
    code: "v12_acceptance_case_failed" as const,
    counts: { sourceCases },
    errorCode: error instanceof Error && /^[a-z0-9_:-]{3,80}$/iu.test(error.message)
      ? error.message : "v12_acceptance_contract_failed",
  };
}

type SourceCaseResult = Readonly<{ id: string; status: "passed" | "failed"; errorCode?: string }>;
type SourceRegistryResult = Readonly<{
  status: "passed" | "failed";
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  cases: readonly SourceCaseResult[];
}>;

type SourceRegistryResults = Readonly<Record<SourceRegistry, SourceRegistryResult>>;

function sourceCaseFailureCode(
  definition: V12AcceptanceSqliteCase,
  result: SourceRegistryResult,
): string | undefined {
  const registeredCaseIds = SOURCE_REGISTRY_CASE_IDS[definition.sourceRegistry];
  if (!definition.sourceCaseIds.every((id) => registeredCaseIds.includes(id as never))) {
    return "v12_acceptance_source_case_wrong_registry";
  }
  if (
    result.total !== registeredCaseIds.length
    || result.cases.length !== registeredCaseIds.length
    || result.skipped !== 0
  ) {
    return result.skipped !== 0
      ? "v12_acceptance_source_case_skipped"
      : "v12_acceptance_source_registry_stale";
  }
  for (const sourceCaseId of definition.sourceCaseIds) {
    const matchingCases = result.cases.filter(({ id }) => id === sourceCaseId);
    if (matchingCases.length === 0) return "v12_acceptance_source_case_missing";
    if (matchingCases.length !== 1) return "v12_acceptance_source_case_duplicate";
    if (matchingCases[0]!.status !== "passed") return "v12_acceptance_source_case_failed";
  }
  if (result.status !== "passed" || result.passed !== result.total || result.failed !== 0) {
    return "v12_acceptance_source_contract_failed";
  }
  return undefined;
}

export function assertV12AcceptanceSourceDefinitions(
  sourceCases: readonly V12AcceptanceSourceCaseDefinition[] = SOURCE_CASES,
): void {
  if (sourceCases.length !== V12_ACCEPTANCE_SQLITE_CASE_IDS.length) {
    throw new Error("v12_acceptance_source_definition_count_invalid");
  }
  for (const definition of sourceCases) {
    const ids = SOURCE_REGISTRY_CASE_IDS[definition.sourceRegistry];
    if (definition.sourceCaseIds.length === 0 || !definition.sourceCaseIds.every((id) => ids.includes(id as never))) {
      throw new Error("v12_acceptance_source_definition_invalid");
    }
  }
}

assertV12AcceptanceSourceDefinitions();

export async function createExpoV12AcceptanceSqliteContractAdapter(
  runId: string,
  onProgress?: V12AcceptanceProgressReporter,
): Promise<V12AcceptanceSqliteContractAdapter> {
  const sourceResults: Promise<SourceRegistryResults> = (async () => {
    onProgress?.("migrations");
    const migrations = await runMigrationsEffectsContract(
      await createExpoMigrationsEffectsContractAdapter(`${runId}-v12-migrations`),
    );
    onProgress?.("portable-merge");
    const merge = await runPortableMergeContract(
      await createExpoPortableMergeContractAdapter(`${runId}-v12-portable-merge`),
    );
    onProgress?.("multi-plan-running");
    const running = await runMultiPlanRunningContract(`${runId}-v12-multi-plan-running`);
    return Object.freeze({ migrations, "portable-merge": merge, "multi-plan-running": running });
  })();
  return Object.freeze({
    async runMixedUpgrade(definition) {
      const result = (await sourceResults)[definition.sourceRegistry];
      const failureCode = sourceCaseFailureCode(definition, result);
      if (failureCode !== undefined) return failedResult(definition.id, definition.sourceCaseIds.length, new Error(failureCode));
      return {
        id: definition.id,
        status: "passed",
        code: "v12_acceptance_case_passed",
        counts: { sourceCases: definition.sourceCaseIds.length },
      };
    },
  });
}

export async function runV12AcceptanceSqliteContracts(
  adapter: V12AcceptanceSqliteContractAdapter,
): Promise<V12AcceptanceSqliteContractResult> {
  const cases = [] as V12AcceptanceSqliteContractResult["cases"][number][];
  for (const definition of V12_ACCEPTANCE_SQLITE_CASES) {
    try {
      const result = await adapter.runMixedUpgrade(definition);
      if (result.id !== definition.id || result.counts.sourceCases !== definition.sourceCaseIds.length) {
        cases.push(failedResult(definition.id, definition.sourceCaseIds.length, new Error("v12_acceptance_adapter_shape_invalid")));
      } else {
        cases.push(result);
      }
    } catch (error) {
      cases.push(failedResult(definition.id, definition.sourceCaseIds.length, error));
    }
  }
  const passed = cases.filter((contractCase) => contractCase.status === "passed").length;
  return Object.freeze({
    schemaVersion: 1,
    contractVersion: 1,
    status: passed === cases.length ? "passed" : "failed",
    total: cases.length,
    passed,
    failed: cases.length - passed,
    skipped: 0,
    cases: Object.freeze(cases),
  });
}
