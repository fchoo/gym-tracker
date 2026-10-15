import { describe, expect, it, jest } from "@jest/globals";

import {
  collectV12ProductionRecoveryPhase,
  v12ProductionRecoveryEnabled,
  type V12ProductionRecoveryExecutor,
} from "./v12ProductionRecovery";

const identity = Object.freeze({
  packageName: "com.fchoo.gymtracker.devtest",
  buildProfile: "development-test",
  nativeContractsEnabled: true,
  suite: "v1.2-acceptance",
  nonce: "a".repeat(32),
  caseId: "between-set-rest-pointer",
  cutId: "post-commit-before-ack",
});

function snapshot(receiptCount: number, digest: string) {
  return Object.freeze({
    source_count: 1,
    receipt_count: receiptCount,
    effect_count: receiptCount,
    pointer_count: 1,
    rest_count: receiptCount,
    history_count: 0,
    timing_count: 0,
    source_sha256: digest.repeat(64),
    receipt_sha256: digest.repeat(64),
    effect_sha256: digest.repeat(64),
    pointer_sha256: digest.repeat(64),
    rest_sha256: digest.repeat(64),
    history_sha256: digest.repeat(64),
    timing_sha256: digest.repeat(64),
  });
}

describe("v1.2 native Recovery producer boundary", () => {
  it("is unreachable outside the exact development-test v1.2 identity", () => {
    expect(v12ProductionRecoveryEnabled(identity)).toBe(true);
    for (const candidate of [
      { ...identity, packageName: "com.fchoo.gymtracker" },
      { ...identity, buildProfile: "production" },
      { ...identity, nativeContractsEnabled: false },
      { ...identity, suite: "phase20" },
      { ...identity, nonce: "not-a-nonce" },
      { ...identity, caseId: "modeled-list" },
      { ...identity, cutId: "static-hash" },
    ]) {
      expect(v12ProductionRecoveryEnabled(candidate)).toBe(false);
    }
  });

  it("arms a real cut without publishing a verdict or observation", async () => {
    const executor: V12ProductionRecoveryExecutor = {
      arm: jest.fn(async () => undefined),
      recover: jest.fn(async () => { throw new Error("must_not_recover"); }),
      cleanup: jest.fn(async () => undefined),
    };
    const lines: string[] = [];

    await expect(collectV12ProductionRecoveryPhase({
      identity,
      phase: "arm",
      emit: (line) => lines.push(line),
      signal: { aborted: false },
      executor,
    })).resolves.toBe("armed");

    expect(executor.arm).toHaveBeenCalledWith(expect.objectContaining({
      caseId: identity.caseId,
      cutId: identity.cutId,
      nonce: identity.nonce,
    }));
    expect(lines).toEqual([]);
  });

  it("emits only durable readback facts after reopen and retry", async () => {
    const executor: V12ProductionRecoveryExecutor = {
      arm: jest.fn(async () => undefined),
      recover: jest.fn(async () => ({
        operation_id: "workout-complete-set",
        after_reopen: snapshot(1, "b"),
        retry_code: "already-completed",
        after_retry: snapshot(1, "b"),
      })),
      cleanup: jest.fn(async () => undefined),
    };
    const lines: string[] = [];

    await expect(collectV12ProductionRecoveryPhase({
      identity,
      phase: "recover",
      emit: (line) => lines.push(line),
      signal: { aborted: false },
      executor,
    })).resolves.toBe("observed");

    expect(lines).toHaveLength(1);
    const value = JSON.parse(lines[0]!.slice(
      "GYM_TRACKER_V12_DOMAIN_RESULT:".length,
    ));
    expect(value).toEqual({
      schema_version: 1,
      nonce: identity.nonce,
      kind: "recovery",
      case_id: identity.caseId,
      cut_id: identity.cutId,
      operation_id: "workout-complete-set",
      after_reopen: snapshot(1, "b"),
      retry_code: "already-completed",
      after_retry: snapshot(1, "b"),
    });
    expect(value).not.toHaveProperty("status");
    expect(value).not.toHaveProperty("verdict");
    expect(executor.cleanup).toHaveBeenCalledTimes(1);
  });

  it("does not publish or clean up an aborted observation", async () => {
    const executor: V12ProductionRecoveryExecutor = {
      arm: jest.fn(async () => undefined),
      recover: jest.fn(async () => ({
        operation_id: "workout-complete-set",
        after_reopen: snapshot(1, "c"),
        retry_code: "already-completed",
        after_retry: snapshot(1, "c"),
      })),
      cleanup: jest.fn(async () => undefined),
    };
    const lines: string[] = [];

    await expect(collectV12ProductionRecoveryPhase({
      identity,
      phase: "recover",
      emit: (line) => lines.push(line),
      signal: { aborted: true },
      executor,
    })).rejects.toThrow("v12_recovery_cancelled");
    expect(lines).toEqual([]);
    expect(executor.recover).not.toHaveBeenCalled();
    expect(executor.cleanup).not.toHaveBeenCalled();
  });
});
