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

  it("retains failed observations and thrown probes as failed, safe records", async () => {
    const result = await runV12RecoveryContract({
      observe: async (definition) => {
        if (definition.id === "legacy-playback") throw new Error("probe failed");
        if (definition.id === "foreground-reconciliation") return { id: "wrong", status: "passed", digest: "a".repeat(64) };
        if (definition.id === "queued-callback") return { id: definition.id, status: "failed", digest: "not-a-digest" };
        return { id: definition.id, status: "passed", digest: "a".repeat(64) };
      },
    });

    expect(result).toMatchObject({ status: "failed", total: 8, passed: 5, failed: 3, skipped: 0 });
    expect(result.cases.slice(0, 3).map(({ status, digest }) => ({ status, digest }))).toEqual([
      { status: "failed", digest: "0".repeat(64) },
      { status: "failed", digest: "a".repeat(64) },
      { status: "failed", digest: "0".repeat(64) },
    ]);
  });
});
