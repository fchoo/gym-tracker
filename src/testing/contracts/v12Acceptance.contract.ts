import {
  createExpoSqliteContractAdapter,
  runSqliteKernelContract,
  SQLITE_KERNEL_CONTRACT_CASES,
} from "./sqliteKernel.contract";
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
import {
  PROGRESS_PARITY_CONTRACT_CASES,
  runProgressParityContract,
} from "./progressParity.contract";
import {
  createExpoGoogleDriveBackupContractAdapter,
  GOOGLE_DRIVE_BACKUP_REQUIRED_CASE_IDS,
  runGoogleDriveBackupContract,
} from "./googleDriveBackup.contract";
import {
  GARMIN_SQLITE_ACCEPTANCE_CASE_IDS,
  runGarminSqliteAcceptanceContract,
} from "./garminImport.contract";
import { CURRENT_SCHEMA_VERSION } from "../../platform/sqlite/migrations";

export const V12_ACCEPTANCE_SQLITE_CASE_IDS = [
  "fresh-migration", "schema27-upgrade", "supported-legacy-upgrade", "failure-reopen",
  "backup", "restore", "merge", "noop-replay", "rebuild", "immutable-history",
] as const;

export const V12_ACCEPTANCE_SOURCE_REGISTRIES = Object.freeze([
  "sqlite-kernel",
  "migrations",
  "portable-merge",
  "multi-plan-running",
  "google-drive-backup",
  "garmin-acceptance",
  "progress-parity",
] as const);

const SOURCE_REGISTRY_CASE_IDS = Object.freeze({
  "sqlite-kernel": SQLITE_KERNEL_CONTRACT_CASES,
  migrations: MIGRATIONS_EFFECTS_CONTRACT_CASES,
  "portable-merge": PORTABLE_MERGE_CONTRACT_CASES,
  "multi-plan-running": MULTI_PLAN_RUNNING_CONTRACT_CASES,
  "google-drive-backup": GOOGLE_DRIVE_BACKUP_REQUIRED_CASE_IDS,
  "garmin-acceptance": GARMIN_SQLITE_ACCEPTANCE_CASE_IDS,
  "progress-parity": PROGRESS_PARITY_CONTRACT_CASES,
});

type SourceRegistry = keyof typeof SOURCE_REGISTRY_CASE_IDS;
export type V12AcceptanceSourceCaseDefinition = Readonly<{
  sourceRegistry: SourceRegistry;
  sourceCaseIds: readonly string[];
}>;

type V12AcceptanceCaseDefinition = Readonly<{
  id: typeof V12_ACCEPTANCE_SQLITE_CASE_IDS[number];
  sources: readonly V12AcceptanceSourceCaseDefinition[];
}>;

const source = (
  sourceRegistry: SourceRegistry,
  sourceCaseIds: readonly string[] = SOURCE_REGISTRY_CASE_IDS[sourceRegistry],
): V12AcceptanceSourceCaseDefinition => Object.freeze({ sourceRegistry, sourceCaseIds });

const SOURCE_CASES: readonly V12AcceptanceCaseDefinition[] = Object.freeze([
  Object.freeze({ id: "fresh-migration", sources: Object.freeze([
    source("sqlite-kernel", ["connection-configuration", "foreign-key-enforcement"]),
    source("migrations", ["migration-empty-v0", "migration-fresh-v27-schema23-registry"]),
  ]) }),
  Object.freeze({ id: "schema27-upgrade", sources: Object.freeze([
    source("migrations", ["migration-fresh-v27-schema23-registry"]),
    source("multi-plan-running", ["phase13-migration-failure-cuts", "phase13-map01-activation"]),
  ]) }),
  Object.freeze({ id: "supported-legacy-upgrade", sources: Object.freeze([
    source("migrations"),
  ]) }),
  Object.freeze({ id: "failure-reopen", sources: Object.freeze([
    source("sqlite-kernel"),
    source("migrations", ["migration-statement-rollback", "migration-verify-rollback", "migration-commit-rollback", "migration-integrity-block", "migration-recovery-backup"]),
  ]) }),
  Object.freeze({ id: "backup", sources: Object.freeze([
    source("google-drive-backup"),
    source("multi-plan-running", ["phase13-backup-clean-restore"]),
  ]) }),
  Object.freeze({ id: "restore", sources: Object.freeze([
    source("portable-merge", ["portable-merge-mixed-full-plan-success", "portable-merge-garmin-clean-restore"]),
    source("multi-plan-running", ["phase13-backup-clean-restore"]),
  ]) }),
  Object.freeze({ id: "merge", sources: Object.freeze([
    source("portable-merge"),
    source("multi-plan-running", ["phase13-merge-rebuild"]),
  ]) }),
  Object.freeze({ id: "noop-replay", sources: Object.freeze([
    source("sqlite-kernel", ["duplicate-idempotency"]),
    source("portable-merge", ["portable-merge-duplicate-only-ready", "portable-merge-garmin-exact-repeat-noop"]),
    source("multi-plan-running", ["phase13-stale-replay-no-resurrection"]),
  ]) }),
  Object.freeze({ id: "rebuild", sources: Object.freeze([
    source("progress-parity"),
    source("portable-merge", ["portable-merge-deterministic-derivative-parity"]),
    source("multi-plan-running", ["phase13-merge-rebuild", "phase13-source-generation-neutrality"]),
  ]) }),
  Object.freeze({ id: "immutable-history", sources: Object.freeze([
    source("multi-plan-running"),
    source("garmin-acceptance"),
    source("progress-parity", ["progress-pro07-source-states", "progress-pro09-history-sheet", "progress-pro10-exercise-history", "progress-pro17-bodyweight-history"]),
  ]) }),
]);

export const V12_ACCEPTANCE_SQLITE_CASES = Object.freeze(SOURCE_CASES.map((definition) =>
  Object.freeze({
    ...definition,
    finalSchemaVersion: 27,
    currentSchemaVersion: CURRENT_SCHEMA_VERSION,
    sourceCaseIds: Object.freeze(definition.sources.flatMap(({ sourceCaseIds }) => sourceCaseIds)),
  }),
));

export type V12AcceptanceSqliteCase = (typeof V12_ACCEPTANCE_SQLITE_CASES)[number];
type SourceCaseStatus = "passed" | "failed";
export type V12AcceptanceSourceFacts = readonly Readonly<{
  registry: SourceRegistry;
  cases: readonly Readonly<{ id: string; status: SourceCaseStatus }>[];
}>[];
type V12AcceptanceCaseResult = Readonly<{
  id: V12AcceptanceSqliteCase["id"];
  status: SourceCaseStatus;
  code: "v12_acceptance_case_passed" | "v12_acceptance_case_failed";
  counts: Readonly<{ sourceCases: number }>;
  sourceFacts: V12AcceptanceSourceFacts;
  errorCode?: string;
}>;
export type V12AcceptanceSqliteContractResult = Readonly<{
  schemaVersion: 1;
  contractVersion: 1;
  status: SourceCaseStatus;
  total: number;
  passed: number;
  failed: number;
  skipped: 0;
  cases: readonly V12AcceptanceCaseResult[];
}>;
export type V12AcceptanceSqliteContractAdapter = Readonly<{
  runMixedUpgrade(definition: V12AcceptanceSqliteCase): Promise<V12AcceptanceCaseResult>;
}>;
export type V12AcceptanceProgressReporter = (stage: typeof V12_ACCEPTANCE_SOURCE_REGISTRIES[number]) => void;

type SourceCaseResult = Readonly<{ id: string; status: SourceCaseStatus; errorCode?: string }>;
type SourceRegistryResult = Readonly<{
  status: SourceCaseStatus;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  cases: readonly SourceCaseResult[];
}>;
type SourceRegistryResults = Readonly<Record<SourceRegistry, SourceRegistryResult>>;

function sourceCaseCount(definition: V12AcceptanceSqliteCase): number {
  return definition.sources.reduce((total, binding) => total + binding.sourceCaseIds.length, 0);
}

function declaredSourceFacts(definition: V12AcceptanceSqliteCase, status: SourceCaseStatus): V12AcceptanceSourceFacts {
  return Object.freeze(definition.sources.map(({ sourceRegistry, sourceCaseIds }) => Object.freeze({
    registry: sourceRegistry,
    cases: Object.freeze(sourceCaseIds.map((id) => Object.freeze({ id, status }))),
  })));
}

function failedResult(
  definition: V12AcceptanceSqliteCase,
  error: unknown,
  sourceFacts: V12AcceptanceSourceFacts = declaredSourceFacts(definition, "failed"),
): V12AcceptanceCaseResult {
  return {
    id: definition.id,
    status: "failed",
    code: "v12_acceptance_case_failed",
    counts: { sourceCases: sourceCaseCount(definition) },
    sourceFacts,
    errorCode: error instanceof Error && /^[a-z0-9_:-]{3,80}$/iu.test(error.message)
      ? error.message : "v12_acceptance_contract_failed",
  };
}

function registryFailureCode(registry: SourceRegistry, result: SourceRegistryResult): string | undefined {
  const registeredCaseIds = SOURCE_REGISTRY_CASE_IDS[registry];
  const actualIds = result.cases.map(({ id }) => id);
  if (result.total !== registeredCaseIds.length || result.cases.length !== registeredCaseIds.length
    || actualIds.some((id, index) => id !== registeredCaseIds[index])
    || new Set(actualIds).size !== actualIds.length) return "v12_acceptance_source_registry_stale";
  if (result.skipped !== 0) return "v12_acceptance_source_case_skipped";
  if (result.status !== "passed" || result.passed !== result.total || result.failed !== 0) {
    return result.cases.some(({ status }) => status !== "passed")
      ? "v12_acceptance_source_case_failed" : "v12_acceptance_source_contract_failed";
  }
  return undefined;
}

function concreteSourceFacts(
  definition: V12AcceptanceSqliteCase,
  results: SourceRegistryResults,
): Readonly<{ facts: V12AcceptanceSourceFacts; failureCode?: string }> {
  const facts = Object.freeze(definition.sources.map(({ sourceRegistry, sourceCaseIds }) => {
    const result = results[sourceRegistry];
    if (!sourceCaseIds.every((id) => SOURCE_REGISTRY_CASE_IDS[sourceRegistry].includes(id as never))) {
      throw new Error("v12_acceptance_source_case_wrong_registry");
    }
    const cases = sourceCaseIds.map((id) => {
      const matches = result.cases.filter((entry) => entry.id === id);
      if (matches.length !== 1) throw new Error(matches.length === 0
        ? "v12_acceptance_source_case_missing" : "v12_acceptance_source_case_duplicate");
      return Object.freeze({ id, status: matches[0]!.status });
    });
    const registryError = registryFailureCode(sourceRegistry, result);
    if (registryError !== undefined) return Object.freeze({
      registry: sourceRegistry,
      cases: Object.freeze(cases),
      failureCode: registryError,
    });
    return Object.freeze({ registry: sourceRegistry, cases: Object.freeze(cases) });
  }));
  let failureCode: string | undefined;
  for (const entry of facts) {
    if ("failureCode" in entry && typeof entry.failureCode === "string") {
      failureCode = entry.failureCode;
      break;
    }
  }
  return Object.freeze({
    facts: Object.freeze(facts.map(({ registry, cases }) => Object.freeze({ registry, cases }))),
    ...(failureCode === undefined ? {} : { failureCode }),
  });
}

export function assertV12AcceptanceSourceDefinitions(
  sourceCases: readonly Pick<V12AcceptanceSqliteCase, "id" | "sources">[] = V12_ACCEPTANCE_SQLITE_CASES,
): void {
  if (sourceCases.length !== V12_ACCEPTANCE_SQLITE_CASE_IDS.length
    || sourceCases.some((definition, index) => definition.id !== V12_ACCEPTANCE_SQLITE_CASE_IDS[index])) {
    throw new Error("v12_acceptance_source_definition_count_invalid");
  }
  const covered = Object.fromEntries(V12_ACCEPTANCE_SOURCE_REGISTRIES.map((registry) => [registry, new Set<string>()])) as Record<SourceRegistry, Set<string>>;
  for (const definition of sourceCases) {
    if (definition.sources.length === 0) throw new Error("v12_acceptance_source_definition_invalid");
    for (const { sourceRegistry, sourceCaseIds } of definition.sources) {
      const ids = SOURCE_REGISTRY_CASE_IDS[sourceRegistry];
      if (sourceCaseIds.length === 0 || !sourceCaseIds.every((id) => ids.includes(id as never))) {
        throw new Error("v12_acceptance_source_definition_invalid");
      }
      sourceCaseIds.forEach((id) => covered[sourceRegistry].add(id));
    }
  }
  for (const registry of V12_ACCEPTANCE_SOURCE_REGISTRIES) {
    const expected = SOURCE_REGISTRY_CASE_IDS[registry];
    if (covered[registry].size !== expected.length || expected.some((id) => !covered[registry].has(id))) {
      throw new Error("v12_acceptance_source_registry_uncovered");
    }
  }
}

assertV12AcceptanceSourceDefinitions();

export async function createExpoV12AcceptanceSqliteContractAdapter(
  runId: string,
  onProgress?: V12AcceptanceProgressReporter,
): Promise<V12AcceptanceSqliteContractAdapter> {
  const sourceResults: Promise<SourceRegistryResults> = (async () => {
    onProgress?.("sqlite-kernel");
    const kernel = await runSqliteKernelContract(await createExpoSqliteContractAdapter(`${runId}-v12-kernel`));
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
    onProgress?.("google-drive-backup");
    const drive = await runGoogleDriveBackupContract(
      await createExpoGoogleDriveBackupContractAdapter(`${runId}-v12-google-drive-backup`),
    );
    onProgress?.("garmin-acceptance");
    const garmin = runGarminSqliteAcceptanceContract({ multiPlanRunning: running, portableMerge: merge });
    onProgress?.("progress-parity");
    const progress = await runProgressParityContract(`${runId}-v12-progress-parity`);
    return Object.freeze({
      "sqlite-kernel": kernel,
      migrations,
      "portable-merge": merge,
      "multi-plan-running": running,
      "google-drive-backup": drive,
      "garmin-acceptance": garmin,
      "progress-parity": progress,
    });
  })();
  return Object.freeze({
    async runMixedUpgrade(definition) {
      try {
        const { facts, failureCode } = concreteSourceFacts(definition, await sourceResults);
        if (failureCode !== undefined) return failedResult(definition, new Error(failureCode), facts);
        if (facts.some(({ cases }) => cases.some(({ status }) => status !== "passed"))) {
          return failedResult(definition, new Error("v12_acceptance_source_case_failed"), facts);
        }
        return {
          id: definition.id,
          status: "passed",
          code: "v12_acceptance_case_passed",
          counts: { sourceCases: sourceCaseCount(definition) },
          sourceFacts: facts,
        };
      } catch (error) {
        return failedResult(definition, error);
      }
    },
  });
}

function sourceFactsMatch(definition: V12AcceptanceSqliteCase, facts: V12AcceptanceSourceFacts): boolean {
  return facts.length === definition.sources.length && facts.every((entry, index) => {
    const expected = definition.sources[index]!;
    return entry.registry === expected.sourceRegistry
      && entry.cases.length === expected.sourceCaseIds.length
      && entry.cases.every((sourceCase, caseIndex) => sourceCase.id === expected.sourceCaseIds[caseIndex]
        && (sourceCase.status === "passed" || sourceCase.status === "failed"));
  });
}

export async function runV12AcceptanceSqliteContracts(
  adapter: V12AcceptanceSqliteContractAdapter,
): Promise<V12AcceptanceSqliteContractResult> {
  const cases: V12AcceptanceCaseResult[] = [];
  for (const definition of V12_ACCEPTANCE_SQLITE_CASES) {
    try {
      const result = await adapter.runMixedUpgrade(definition);
      const sourcesPassed = result.sourceFacts?.every(({ cases: sourceFactCases }) =>
        sourceFactCases.every(({ status }) => status === "passed"));
      const outcomeConsistent = result.status === "passed"
        ? result.code === "v12_acceptance_case_passed" && sourcesPassed === true && result.errorCode === undefined
        : result.code === "v12_acceptance_case_failed";
      if (result.id !== definition.id || result.counts.sourceCases !== sourceCaseCount(definition)
        || !sourceFactsMatch(definition, result.sourceFacts) || !outcomeConsistent) {
        cases.push(failedResult(definition, new Error("v12_acceptance_adapter_shape_invalid")));
      } else {
        cases.push(result);
      }
    } catch (error) {
      cases.push(failedResult(definition, error));
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
