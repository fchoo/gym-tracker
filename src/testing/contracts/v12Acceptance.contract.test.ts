import { describe, expect, it, jest } from "@jest/globals";

import * as migrationsContracts from "./migrationsEffects.contract";
import * as multiPlanContracts from "./multiPlanRunning.contract";
import * as portableMergeContracts from "./portableMerge.contract";

import {
  V12_ACCEPTANCE_SQLITE_CASES,
  assertV12AcceptanceSourceDefinitions,
  createExpoV12AcceptanceSqliteContractAdapter,
  runV12AcceptanceSqliteContracts,
} from "./v12Acceptance.contract";

function passedRegistryResult(caseIds: readonly string[]) {
  return {
    status: "passed" as const,
    total: caseIds.length,
    passed: caseIds.length,
    failed: 0,
    skipped: 0,
    cases: caseIds.map((id) => ({ id, status: "passed" as const, durationMs: 1 })),
  };
}

describe("v1.2 aggregate SQLite acceptance contract", () => {
  it("derives all ten ordered source-owned SQLite cases without skips", async () => {
    expect(V12_ACCEPTANCE_SQLITE_CASES).toHaveLength(10);
    expect(V12_ACCEPTANCE_SQLITE_CASES.map(({ id }) => id)).toEqual([
      "fresh-migration", "schema27-upgrade", "supported-legacy-upgrade", "failure-reopen",
      "backup", "restore", "merge", "noop-replay", "rebuild", "immutable-history",
    ]);

    const result = await runV12AcceptanceSqliteContracts({
      runMixedUpgrade: async (definition) => ({
        id: definition.id,
        status: "passed" as const,
        code: "v12_acceptance_case_passed",
        counts: { sourceCases: definition.sourceCaseIds.length },
      }),
    });

    expect(result).toEqual({
      schemaVersion: 1,
      contractVersion: 1,
      status: "passed",
      total: 10,
      passed: 10,
      failed: 0,
      skipped: 0,
      cases: V12_ACCEPTANCE_SQLITE_CASES.map((definition) => ({
        id: definition.id, status: "passed", code: "v12_acceptance_case_passed", counts: { sourceCases: definition.sourceCaseIds.length },
      })),
    });
  });

  it("fails closed for invalid adapter shapes, thrown probes, and unsafe error text", async () => {
    const shape = await runV12AcceptanceSqliteContracts({
      runMixedUpgrade: async () => ({ id: "wrong" as never, status: "passed", code: "v12_acceptance_case_passed", counts: { sourceCases: 3 } }),
    });
    const thrown = await runV12AcceptanceSqliteContracts({
      runMixedUpgrade: async () => { throw new Error("contains whitespace"); },
    });
    const safe = await runV12AcceptanceSqliteContracts({
      runMixedUpgrade: async () => { throw new Error("v12_adapter_failed"); },
    });

    expect(shape.cases[0]).toMatchObject({ status: "failed", code: "v12_acceptance_case_failed", errorCode: "v12_acceptance_adapter_shape_invalid" });
    expect(thrown.cases[0]).toMatchObject({ status: "failed", errorCode: "v12_acceptance_contract_failed" });
    expect(safe.cases[0]).toMatchObject({ status: "failed", errorCode: "v12_adapter_failed" });
  });

  it("executes each source registry once and maps every V12 category to its declared passed source case", async () => {
    const migrationAdapter = jest.spyOn(migrationsContracts, "createExpoMigrationsEffectsContractAdapter").mockResolvedValue({} as never);
    const migrationRun = jest.spyOn(migrationsContracts, "runMigrationsEffectsContract").mockResolvedValue(
      passedRegistryResult(migrationsContracts.MIGRATIONS_EFFECTS_CONTRACT_CASES) as never,
    );
    const mergeAdapter = jest.spyOn(portableMergeContracts, "createExpoPortableMergeContractAdapter").mockResolvedValue({} as never);
    const mergeRun = jest.spyOn(portableMergeContracts, "runPortableMergeContract").mockResolvedValue(
      passedRegistryResult(portableMergeContracts.PORTABLE_MERGE_CONTRACT_CASES) as never,
    );
    const running = jest.spyOn(multiPlanContracts, "runMultiPlanRunningContract").mockResolvedValue(
      passedRegistryResult(multiPlanContracts.MULTI_PLAN_RUNNING_CONTRACT_CASES) as never,
    );
    try {
      const adapter = await createExpoV12AcceptanceSqliteContractAdapter("phase20");
      const result = await runV12AcceptanceSqliteContracts(adapter);

      expect(result).toMatchObject({ status: "passed", total: 10, passed: 10, failed: 0, skipped: 0 });
      expect(migrationAdapter).toHaveBeenCalledTimes(1);
      expect(migrationAdapter).toHaveBeenCalledWith("phase20-v12-migrations");
      expect(mergeAdapter).toHaveBeenCalledTimes(1);
      expect(mergeAdapter).toHaveBeenCalledWith("phase20-v12-portable-merge");
      expect(migrationRun).toHaveBeenCalledTimes(1);
      expect(mergeRun).toHaveBeenCalledTimes(1);
      expect(running).toHaveBeenCalledTimes(1);
      expect(running).toHaveBeenCalledWith("phase20-v12-multi-plan-running");
      expect(V12_ACCEPTANCE_SQLITE_CASES.map(({ sourceRegistry }) => sourceRegistry)).toEqual([
        "migrations", "migrations", "migrations", "migrations", "portable-merge",
        "portable-merge", "portable-merge", "portable-merge", "migrations", "multi-plan-running",
      ]);
    } finally {
      jest.restoreAllMocks();
    }
  });

  it("fails a V12 definition when its declared source case is missing or duplicate", async () => {
    const migrationAdapter = jest.spyOn(migrationsContracts, "createExpoMigrationsEffectsContractAdapter").mockResolvedValue({} as never);
    const migrationRun = jest.spyOn(migrationsContracts, "runMigrationsEffectsContract").mockResolvedValue({
      ...passedRegistryResult(migrationsContracts.MIGRATIONS_EFFECTS_CONTRACT_CASES),
      cases: [
        ...passedRegistryResult(migrationsContracts.MIGRATIONS_EFFECTS_CONTRACT_CASES).cases.filter(({ id }) => id !== "migration-fresh-v27-schema23-registry"),
        { id: "migration-statement-rollback", status: "failed", durationMs: 1 },
      ],
    } as never);
    const mergeAdapter = jest.spyOn(portableMergeContracts, "createExpoPortableMergeContractAdapter").mockResolvedValue({} as never);
    const mergeRun = jest.spyOn(portableMergeContracts, "runPortableMergeContract").mockResolvedValue(
      passedRegistryResult(portableMergeContracts.PORTABLE_MERGE_CONTRACT_CASES) as never,
    );
    const running = jest.spyOn(multiPlanContracts, "runMultiPlanRunningContract").mockResolvedValue(
      passedRegistryResult(multiPlanContracts.MULTI_PLAN_RUNNING_CONTRACT_CASES) as never,
    );
    try {
      const adapter = await createExpoV12AcceptanceSqliteContractAdapter("phase20-invalid");
      const result = await runV12AcceptanceSqliteContracts(adapter);
      expect(result.cases).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "fresh-migration", status: "failed", errorCode: "v12_acceptance_source_case_missing" }),
        expect.objectContaining({ id: "schema27-upgrade", status: "failed", errorCode: "v12_acceptance_source_case_missing" }),
        expect.objectContaining({ id: "failure-reopen", status: "failed", errorCode: "v12_acceptance_source_case_duplicate" }),
      ]));
      expect(migrationAdapter).toHaveBeenCalledTimes(1);
      expect(migrationRun).toHaveBeenCalledTimes(1);
      expect(mergeAdapter).toHaveBeenCalledTimes(1);
      expect(mergeRun).toHaveBeenCalledTimes(1);
      expect(running).toHaveBeenCalledTimes(1);
    } finally {
      jest.restoreAllMocks();
    }
  });

  it("fails a V12 definition when its declared source case failed or the source registry skipped work", async () => {
    const migrationAdapter = jest.spyOn(migrationsContracts, "createExpoMigrationsEffectsContractAdapter").mockResolvedValue({} as never);
    const migrationRun = jest.spyOn(migrationsContracts, "runMigrationsEffectsContract");
    const mergeAdapter = jest.spyOn(portableMergeContracts, "createExpoPortableMergeContractAdapter").mockResolvedValue({} as never);
    const mergeRun = jest.spyOn(portableMergeContracts, "runPortableMergeContract").mockResolvedValue(
      passedRegistryResult(portableMergeContracts.PORTABLE_MERGE_CONTRACT_CASES) as never,
    );
    const running = jest.spyOn(multiPlanContracts, "runMultiPlanRunningContract").mockResolvedValue(
      passedRegistryResult(multiPlanContracts.MULTI_PLAN_RUNNING_CONTRACT_CASES) as never,
    );
    const passedMigration = passedRegistryResult(migrationsContracts.MIGRATIONS_EFFECTS_CONTRACT_CASES);
    try {
      migrationRun.mockResolvedValueOnce({
        ...passedMigration,
        status: "failed",
        passed: passedMigration.passed - 1,
        failed: 1,
        cases: passedMigration.cases.map((item) => item.id === "migration-statement-rollback"
          ? { ...item, status: "failed" as const }
          : item),
      } as never);
      const failedAdapter = await createExpoV12AcceptanceSqliteContractAdapter("phase20-failed");
      await expect(failedAdapter.runMixedUpgrade(V12_ACCEPTANCE_SQLITE_CASES[3]!)).resolves.toMatchObject({
        status: "failed", errorCode: "v12_acceptance_source_case_failed",
      });

      migrationRun.mockResolvedValueOnce({ ...passedMigration, skipped: 1 } as never);
      const skippedAdapter = await createExpoV12AcceptanceSqliteContractAdapter("phase20-skipped");
      await expect(skippedAdapter.runMixedUpgrade(V12_ACCEPTANCE_SQLITE_CASES[0]!)).resolves.toMatchObject({
        status: "failed", errorCode: "v12_acceptance_source_case_skipped",
      });
      expect(migrationAdapter).toHaveBeenCalledTimes(2);
      expect(mergeAdapter).toHaveBeenCalledTimes(2);
      expect(mergeRun).toHaveBeenCalledTimes(2);
      expect(running).toHaveBeenCalledTimes(2);
    } finally {
      jest.restoreAllMocks();
    }
  });

  it("rejects stale registry aggregates, wrong-registry definitions, and invalid source definitions", async () => {
    const migrationAdapter = jest.spyOn(migrationsContracts, "createExpoMigrationsEffectsContractAdapter").mockResolvedValue({} as never);
    const migrationRun = jest.spyOn(migrationsContracts, "runMigrationsEffectsContract");
    const mergeAdapter = jest.spyOn(portableMergeContracts, "createExpoPortableMergeContractAdapter").mockResolvedValue({} as never);
    const mergeRun = jest.spyOn(portableMergeContracts, "runPortableMergeContract").mockResolvedValue(
      passedRegistryResult(portableMergeContracts.PORTABLE_MERGE_CONTRACT_CASES) as never,
    );
    const running = jest.spyOn(multiPlanContracts, "runMultiPlanRunningContract").mockResolvedValue(
      passedRegistryResult(multiPlanContracts.MULTI_PLAN_RUNNING_CONTRACT_CASES) as never,
    );
    const passedMigration = passedRegistryResult(migrationsContracts.MIGRATIONS_EFFECTS_CONTRACT_CASES);
    try {
      migrationRun.mockResolvedValueOnce({ ...passedMigration, total: passedMigration.total - 1 } as never);
      const staleAdapter = await createExpoV12AcceptanceSqliteContractAdapter("phase20-stale");
      await expect(staleAdapter.runMixedUpgrade(V12_ACCEPTANCE_SQLITE_CASES[0]!)).resolves.toMatchObject({
        status: "failed", errorCode: "v12_acceptance_source_registry_stale",
      });

      migrationRun.mockResolvedValueOnce({ ...passedMigration, status: "failed", passed: passedMigration.passed - 1, failed: 1 } as never);
      const aggregateFailureAdapter = await createExpoV12AcceptanceSqliteContractAdapter("phase20-aggregate-failed");
      await expect(aggregateFailureAdapter.runMixedUpgrade(V12_ACCEPTANCE_SQLITE_CASES[0]!)).resolves.toMatchObject({
        status: "failed", errorCode: "v12_acceptance_source_contract_failed",
      });

      migrationRun.mockResolvedValueOnce(passedMigration as never);
      const wrongRegistryAdapter = await createExpoV12AcceptanceSqliteContractAdapter("phase20-wrong-registry");
      await expect(wrongRegistryAdapter.runMixedUpgrade({
        ...V12_ACCEPTANCE_SQLITE_CASES[0]!,
        sourceCaseIds: ["portable-merge-mixed-full-plan-success"],
      })).resolves.toMatchObject({ status: "failed", errorCode: "v12_acceptance_source_case_wrong_registry" });

      expect(() => assertV12AcceptanceSourceDefinitions([])).toThrow("v12_acceptance_source_definition_count_invalid");
      expect(() => assertV12AcceptanceSourceDefinitions([
        ...V12_ACCEPTANCE_SQLITE_CASES.map(({ sourceRegistry, sourceCaseIds }) => ({ sourceRegistry, sourceCaseIds })).slice(0, 9),
        { sourceRegistry: "migrations", sourceCaseIds: [] },
      ])).toThrow("v12_acceptance_source_definition_invalid");
      expect(migrationAdapter).toHaveBeenCalledTimes(3);
      expect(mergeAdapter).toHaveBeenCalledTimes(3);
      expect(mergeRun).toHaveBeenCalledTimes(3);
      expect(running).toHaveBeenCalledTimes(3);
    } finally {
      jest.restoreAllMocks();
    }
  });
});
