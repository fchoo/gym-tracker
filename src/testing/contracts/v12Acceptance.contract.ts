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
  "v12-schema27-mixed-upgrade",
] as const;

const MIXED_UPGRADE_SOURCE_CASE_IDS = [
  "migration-fresh-v27-schema23-registry",
  "portable-merge-mixed-full-plan-success",
  "multi-plan-running-interleaved-completion",
] as const;

export const V12_ACCEPTANCE_SQLITE_CASES = Object.freeze([
  Object.freeze({
    id: V12_ACCEPTANCE_SQLITE_CASE_IDS[0],
    // Schema 27 is the retained mixed-upgrade fixture. The active terminal schema
    // is deliberately derived from the landed migration registry at execution.
    finalSchemaVersion: 27,
    currentSchemaVersion: CURRENT_SCHEMA_VERSION,
    sourceCaseIds: MIXED_UPGRADE_SOURCE_CASE_IDS,
    sourceRegistries: Object.freeze([
      MIGRATIONS_EFFECTS_CONTRACT_CASES,
      PORTABLE_MERGE_CONTRACT_CASES,
      MULTI_PLAN_RUNNING_CONTRACT_CASES,
      GOOGLE_DRIVE_BACKUP_REQUIRED_CASE_IDS,
      PHASE18_GARMIN_ACCEPTANCE_CASE_IDS,
      PROGRESS_PARITY_CONTRACT_CASES,
    ]),
  }),
] as const);

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

export async function createExpoV12AcceptanceSqliteContractAdapter(
  runId: string,
): Promise<V12AcceptanceSqliteContractAdapter> {
  return Object.freeze({
    async runMixedUpgrade(definition) {
      const migrations = await runMigrationsEffectsContract(
        await createExpoMigrationsEffectsContractAdapter(`${runId}-schema27`),
      );
      const merge = await runPortableMergeContract(
        await createExpoPortableMergeContractAdapter(`${runId}-merge`),
      );
      const running = await runMultiPlanRunningContract(`${runId}-running`);
      if (migrations.status !== "passed" || merge.status !== "passed" || running.status !== "passed"
        || migrations.skipped !== 0 || merge.skipped !== 0 || running.skipped !== 0) {
        return failedResult(definition.id, definition.sourceCaseIds.length, new Error("v12_acceptance_source_contract_failed"));
      }
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
