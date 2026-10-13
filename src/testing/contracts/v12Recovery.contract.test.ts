import { describe, expect, it } from "@jest/globals";

import { V12_RECOVERY_CASES, runV12RecoveryContract } from "./v12Recovery.contract";

describe("v1.2 recovery contract", () => {
  it("keeps all eight TIM-01 groups ordered and requires every lifecycle cut", async () => {
    expect(V12_RECOVERY_CASES).toHaveLength(8);
    expect(V12_RECOVERY_CASES.map(({ id }) => id)).toEqual([
      "legacy-playback", "foreground-reconciliation", "queued-callback", "relaunch",
      "restore", "merge", "zero-cue", "between-set-rest-pointer",
    ]);
    const result = await runV12RecoveryContract({
      observe: async (definition) => ({ id: definition.id, status: "passed" as const, digest: "a".repeat(64) }),
    });
    expect(result.status).toBe("passed");
    expect(result.skipped).toBe(0);
    expect(result.cases.every(({ cuts }) => cuts.length === 8)).toBe(true);
  });
});
