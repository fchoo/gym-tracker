import { describe, expect, it, jest } from "@jest/globals";

import * as migrationsContracts from "./migrationsEffects.contract";
import * as multiPlanContracts from "./multiPlanRunning.contract";
import * as portableMergeContracts from "./portableMerge.contract";
import * as kernelContracts from "./sqliteKernel.contract";
import * as driveContracts from "./googleDriveBackup.contract";
import * as progressContracts from "./progressParity.contract";
import {
  V12_ACCEPTANCE_SOURCE_REGISTRIES,
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

function passedV12Case(definition: typeof V12_ACCEPTANCE_SQLITE_CASES[number]) {
  return {
    id: definition.id,
    status: "passed" as const,
    code: "v12_acceptance_case_passed" as const,
    counts: { sourceCases: definition.sourceCaseIds.length },
    sourceFacts: definition.sources.map(({ sourceRegistry, sourceCaseIds }) => ({
      registry: sourceRegistry,
      cases: sourceCaseIds.map((id) => ({ id, status: "passed" as const })),
    })),
  };
}

function mockAdditionalSourceRegistries() {
  const kernelAdapter = jest.spyOn(kernelContracts, "createExpoSqliteContractAdapter").mockResolvedValue({} as never);
  const kernelRun = jest.spyOn(kernelContracts, "runSqliteKernelContract").mockResolvedValue(
    passedRegistryResult(kernelContracts.SQLITE_KERNEL_CONTRACT_CASES) as never,
  );
  const driveAdapter = jest.spyOn(driveContracts, "createExpoGoogleDriveBackupContractAdapter").mockResolvedValue({} as never);
  const driveRun = jest.spyOn(driveContracts, "runGoogleDriveBackupContract").mockResolvedValue(
    passedRegistryResult(driveContracts.GOOGLE_DRIVE_BACKUP_REQUIRED_CASE_IDS) as never,
  );
  const progressRun = jest.spyOn(progressContracts, "runProgressParityContract").mockResolvedValue(
    passedRegistryResult(progressContracts.PROGRESS_PARITY_CONTRACT_CASES) as never,
  );
  return { kernelAdapter, kernelRun, driveAdapter, driveRun, progressRun };
}

describe("v1.2 aggregate SQLite acceptance contract", () => {
  it("declares all seven real Expo SQLite source registries exactly once", () => {
    expect(V12_ACCEPTANCE_SOURCE_REGISTRIES).toEqual([
      "sqlite-kernel",
      "migrations",
      "portable-merge",
      "multi-plan-running",
      "google-drive-backup",
      "garmin-acceptance",
      "progress-parity",
    ]);
    expect(new Set(V12_ACCEPTANCE_SOURCE_REGISTRIES).size)
      .toBe(V12_ACCEPTANCE_SOURCE_REGISTRIES.length);
  });

  it("derives all ten ordered source-owned SQLite cases without skips", async () => {
    expect(V12_ACCEPTANCE_SQLITE_CASES).toHaveLength(10);
    expect(V12_ACCEPTANCE_SQLITE_CASES.map(({ id }) => id)).toEqual([
      "fresh-migration", "schema27-upgrade", "supported-legacy-upgrade", "failure-reopen",
      "backup", "restore", "merge", "noop-replay", "rebuild", "immutable-history",
    ]);

    const result = await runV12AcceptanceSqliteContracts({
      runMixedUpgrade: async (definition) => passedV12Case(definition),
    });

    expect(result).toEqual({
      schemaVersion: 1,
      contractVersion: 1,
      status: "passed",
      total: 10,
      passed: 10,
      failed: 0,
      skipped: 0,
      cases: V12_ACCEPTANCE_SQLITE_CASES.map(passedV12Case),
    });
  });

  it("fails closed for invalid adapter shapes, thrown probes, and unsafe error text", async () => {
    const shape = await runV12AcceptanceSqliteContracts({
      runMixedUpgrade: async () => ({ id: "wrong", status: "passed", code: "v12_acceptance_case_passed", counts: { sourceCases: 3 } }) as never,
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
    const additional = mockAdditionalSourceRegistries();
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
      const progress: string[] = [];
      const adapter = await createExpoV12AcceptanceSqliteContractAdapter("phase20", (stage) => progress.push(stage));
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
      expect(additional.kernelAdapter).toHaveBeenCalledWith("phase20-v12-kernel");
      expect(additional.kernelRun).toHaveBeenCalledTimes(1);
      expect(additional.driveAdapter).toHaveBeenCalledWith("phase20-v12-google-drive-backup");
      expect(additional.driveRun).toHaveBeenCalledTimes(1);
      expect(additional.progressRun).toHaveBeenCalledWith("phase20-v12-progress-parity");
      expect(progress).toEqual(V12_ACCEPTANCE_SOURCE_REGISTRIES);
      expect(result.cases.every(({ sourceFacts }) => sourceFacts.length > 0
        && sourceFacts.every(({ cases }) => cases.length > 0 && cases.every(({ status }) => status === "passed")))).toBe(true);
    } finally {
      jest.restoreAllMocks();
    }
  });

  it("fails a V12 definition when its declared source case is missing or duplicate", async () => {
    mockAdditionalSourceRegistries();
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
    mockAdditionalSourceRegistries();
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
    mockAdditionalSourceRegistries();
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
        sources: [{ sourceRegistry: "migrations", sourceCaseIds: ["portable-merge-mixed-full-plan-success"] }],
      })).resolves.toMatchObject({ status: "failed", errorCode: "v12_acceptance_source_case_wrong_registry" });

      expect(() => assertV12AcceptanceSourceDefinitions([])).toThrow("v12_acceptance_source_definition_count_invalid");
      expect(() => assertV12AcceptanceSourceDefinitions([
        { ...V12_ACCEPTANCE_SQLITE_CASES[0]!, sources: [] },
        ...V12_ACCEPTANCE_SQLITE_CASES.slice(1),
      ])).toThrow("v12_acceptance_source_definition_invalid");
      expect(() => assertV12AcceptanceSourceDefinitions([
        ...V12_ACCEPTANCE_SQLITE_CASES.slice(0, 9),
        { ...V12_ACCEPTANCE_SQLITE_CASES[9]!, sources: [{ sourceRegistry: "migrations", sourceCaseIds: [] }] },
      ])).toThrow("v12_acceptance_source_definition_invalid");
      expect(migrationAdapter).toHaveBeenCalledTimes(3);
      expect(mergeAdapter).toHaveBeenCalledTimes(3);
      expect(mergeRun).toHaveBeenCalledTimes(3);
      expect(running).toHaveBeenCalledTimes(3);
    } finally {
      jest.restoreAllMocks();
    }
  });

  it("rejects source definitions that leave a registered source case uncovered", () => {
    const definitions = V12_ACCEPTANCE_SQLITE_CASES.map((definition) => ({
      ...definition,
      sources: definition.sources.map((source) => source.sourceRegistry === "migrations"
        ? { ...source, sourceCaseIds: source.sourceCaseIds.filter((id) => id !== "migration-empty-v0") }
        : source),
    }));

    expect(() => assertV12AcceptanceSourceDefinitions(definitions))
      .toThrow("v12_acceptance_source_registry_uncovered");
  });

  it("fails the definition when a structurally complete source aggregate retains a failed case", async () => {
    const additional = mockAdditionalSourceRegistries();
    const migrationAdapter = jest.spyOn(migrationsContracts, "createExpoMigrationsEffectsContractAdapter").mockResolvedValue({} as never);
    const migration = passedRegistryResult(migrationsContracts.MIGRATIONS_EFFECTS_CONTRACT_CASES);
    const migrationRun = jest.spyOn(migrationsContracts, "runMigrationsEffectsContract").mockResolvedValue({
      ...migration,
      cases: migration.cases.map((item) => item.id === "migration-fresh-v27-schema23-registry"
        ? { ...item, status: "failed" as const }
        : item),
    } as never);
    const mergeAdapter = jest.spyOn(portableMergeContracts, "createExpoPortableMergeContractAdapter").mockResolvedValue({} as never);
    const mergeRun = jest.spyOn(portableMergeContracts, "runPortableMergeContract").mockResolvedValue(
      passedRegistryResult(portableMergeContracts.PORTABLE_MERGE_CONTRACT_CASES) as never,
    );
    const running = jest.spyOn(multiPlanContracts, "runMultiPlanRunningContract").mockResolvedValue(
      passedRegistryResult(multiPlanContracts.MULTI_PLAN_RUNNING_CONTRACT_CASES) as never,
    );
    try {
      const adapter = await createExpoV12AcceptanceSqliteContractAdapter("phase20-direct-failed-case");
      await expect(adapter.runMixedUpgrade(V12_ACCEPTANCE_SQLITE_CASES[0]!)).resolves.toMatchObject({
        status: "failed",
        errorCode: "v12_acceptance_source_case_failed",
        sourceFacts: expect.arrayContaining([
          expect.objectContaining({ cases: expect.arrayContaining([expect.objectContaining({ status: "failed" })]) }),
        ]),
      });
      expect(migrationAdapter).toHaveBeenCalledTimes(1);
      expect(migrationRun).toHaveBeenCalledTimes(1);
      expect(mergeAdapter).toHaveBeenCalledTimes(1);
      expect(mergeRun).toHaveBeenCalledTimes(1);
      expect(running).toHaveBeenCalledTimes(1);
      expect(additional.kernelRun).toHaveBeenCalledTimes(1);
    } finally {
      jest.restoreAllMocks();
    }
  });
});
