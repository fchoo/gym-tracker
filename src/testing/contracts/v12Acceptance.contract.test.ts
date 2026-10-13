import { describe, expect, it } from "@jest/globals";

import {
  V12_ACCEPTANCE_SQLITE_CASES,
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
});
