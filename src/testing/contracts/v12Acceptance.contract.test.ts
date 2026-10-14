import { describe, expect, it, jest } from "@jest/globals";

import * as migrationsContracts from "./migrationsEffects.contract";
import * as multiPlanContracts from "./multiPlanRunning.contract";
import * as portableMergeContracts from "./portableMerge.contract";

import {
  V12_ACCEPTANCE_SQLITE_CASES,
  createExpoV12AcceptanceSqliteContractAdapter,
  runV12AcceptanceSqliteContracts,
} from "./v12Acceptance.contract";

describe("v1.2 aggregate SQLite acceptance contract", () => {
  it("derives one ordered schema-27 mixed migration case without skips", async () => {
    expect(V12_ACCEPTANCE_SQLITE_CASES).toHaveLength(1);
    expect(V12_ACCEPTANCE_SQLITE_CASES[0]).toMatchObject({
      id: "v12-schema27-mixed-upgrade",
      finalSchemaVersion: 27,
      sourceCaseIds: [
        "migration-fresh-v27-schema23-registry",
        "portable-merge-mixed-full-plan-success",
        "multi-plan-running-interleaved-completion",
      ],
    });

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
      total: 1,
      passed: 1,
      failed: 0,
      skipped: 0,
      cases: [{
        id: "v12-schema27-mixed-upgrade",
        status: "passed",
        code: "v12_acceptance_case_passed",
        counts: { sourceCases: 3 },
      }],
    });
  });

  it("fails closed for invalid adapter shapes, thrown probes, and unsafe error text", async () => {
    const shape = await runV12AcceptanceSqliteContracts({
      runMixedUpgrade: async () => ({ id: "wrong" as "v12-schema27-mixed-upgrade", status: "passed", code: "v12_acceptance_case_passed", counts: { sourceCases: 3 } }),
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

  it("adapts the three source contracts and fails closed when any source is not complete", async () => {
    const migrationAdapter = jest.spyOn(migrationsContracts, "createExpoMigrationsEffectsContractAdapter").mockResolvedValue({} as never);
    const migrationRun = jest.spyOn(migrationsContracts, "runMigrationsEffectsContract").mockResolvedValue({ status: "passed", skipped: 0 } as never);
    const mergeAdapter = jest.spyOn(portableMergeContracts, "createExpoPortableMergeContractAdapter").mockResolvedValue({} as never);
    const mergeRun = jest.spyOn(portableMergeContracts, "runPortableMergeContract").mockResolvedValue({ status: "passed", skipped: 0 } as never);
    const running = jest.spyOn(multiPlanContracts, "runMultiPlanRunningContract").mockResolvedValue({ status: "passed", skipped: 0 } as never);
    try {
      const adapter = await createExpoV12AcceptanceSqliteContractAdapter("phase20");
      await expect(adapter.runMixedUpgrade(V12_ACCEPTANCE_SQLITE_CASES[0])).resolves.toMatchObject({ status: "passed", counts: { sourceCases: 3 } });
      expect(migrationAdapter).toHaveBeenCalledWith("phase20-schema27");
      expect(mergeAdapter).toHaveBeenCalledWith("phase20-merge");
      expect(running).toHaveBeenCalledWith("phase20-running");
      mergeRun.mockResolvedValueOnce({ status: "failed", skipped: 0 } as never);
      await expect(adapter.runMixedUpgrade(V12_ACCEPTANCE_SQLITE_CASES[0])).resolves.toMatchObject({ status: "failed", errorCode: "v12_acceptance_source_contract_failed" });
    } finally {
      jest.restoreAllMocks();
    }
  });
});
