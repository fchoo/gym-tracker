import { describe, expect, it, jest } from "@jest/globals";
import { createHash } from "node:crypto";

jest.mock("expo-crypto", () => ({ CryptoDigestAlgorithm: { SHA256: "SHA-256" }, digestStringAsync: async (_algorithm: string, body: string) => require("node:crypto").createHash("sha256").update(body).digest("hex") }));

function emittedResult(lines: readonly string[]): Record<string, unknown> {
  const chunks = lines.filter((line) => line.startsWith("GYM_TRACKER_V12_DOMAIN_RESULT_CHUNK:")).map((line) => JSON.parse(line.slice("GYM_TRACKER_V12_DOMAIN_RESULT_CHUNK:".length)));
  const terminal = JSON.parse(lines.find((line) => line.startsWith("GYM_TRACKER_V12_DOMAIN_RESULT:"))!.slice("GYM_TRACKER_V12_DOMAIN_RESULT:".length));
  const body = chunks.map((chunk) => chunk.data).join("");
  expect(terminal.sha256).toBe(createHash("sha256").update(body).digest("hex"));
  expect(terminal.total).toBe(chunks.length);
  expect(lines.every((line) => Buffer.byteLength(line, "utf8") < 3_500)).toBe(true);
  return JSON.parse(body);
}

import {
  collectV12ProductionRecoveryPhase,
  v12ProductionRecoveryEnabled,
  type V12ProductionRecoveryExecutor,
  type V12RecoveryExecutionIdentity,
} from "./v12ProductionRecovery";

const identity = Object.freeze({
  packageName: "com.fchoo.gymtracker.devtest",
  buildProfile: "development-test",
  nativeContractsEnabled: true,
  suite: "v1.2-acceptance",
  nonce: "a".repeat(32),
  caseId: "between-set-rest-pointer",
  stepId: "between-set-commit",
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
    restore_count: 1,
    merge_receipt_count: 0,
    cue_count: 0,
    source_sha256: digest.repeat(64),
    receipt_sha256: digest.repeat(64),
    effect_sha256: digest.repeat(64),
    pointer_sha256: digest.repeat(64),
    rest_sha256: digest.repeat(64),
    history_sha256: digest.repeat(64),
    timing_sha256: digest.repeat(64),
    restore_sha256: digest.repeat(64),
    merge_receipt_sha256: digest.repeat(64),
    cue_sha256: digest.repeat(64),
    effect_facts: receiptCount === 0 ? [] : [{
      effect_sha256: digest.repeat(64), type: "reconcile_rest_notification" as const,
      subject_sha256: digest.repeat(64), expected_revision: 1, status: "pending" as const,
      attempt_count: 0, next_attempt_at_ms: 1, last_error_code: null,
    }],
    pointer_facts: [{
      session_sha256: digest.repeat(64), status: "in_progress", revision: 1,
      active_exercise_sha256: digest.repeat(64), active_set_exercise_sha256: digest.repeat(64),
      active_set_sha256: digest.repeat(64), active_set_ordinal: 1,
      committed_set_exercise_sha256: receiptCount === 0 ? null : digest.repeat(64),
      committed_set_sha256: receiptCount === 0 ? null : digest.repeat(64),
      committed_set_ordinal: receiptCount === 0 ? null : 0,
      transition_sha256: receiptCount === 0 ? null : digest.repeat(64),
    }],
    rest_facts: receiptCount === 0 ? [] : [{
      session_sha256: digest.repeat(64), status: "running" as const, revision: 1,
      started_at_ms: 1, ends_at_ms: 2, deadline_at_ms: 2,
      paused_remaining_ms: null, expired_at_ms: null,
      next_set_exercise_sha256: digest.repeat(64), next_set_sha256: digest.repeat(64),
      next_set_ordinal: 1, transition_sha256: digest.repeat(64),
    }],
    timing_facts: [],
    history_facts: [],
    restore_facts: [{ state: "ready" as const, updated_at_ms: 0 }],
    merge_receipt_facts: [],
    command_receipt_facts: receiptCount === 0 ? [] : [{
      step_id: "between-set-commit", boundary_id: "commit", kind: "set-completion",
      receipt_sha256: digest.repeat(64), request_sha256: digest.repeat(64),
      committed_at_ms: 1, result: "set-completed",
    }],
  });
}

describe("v1.2 native Recovery producer boundary", () => {
  it("emits only fixed setup transitions bound to the validated nonce", async () => {
    const lines: string[] = [];
    const executor: V12ProductionRecoveryExecutor = {
      arm: async (input) => {
        input.setupStage?.("delete:start");
        input.setupStage?.("not-a-private-payload");
        input.setupStage?.("delete:done");
      },
      recover: async () => { throw new Error("unused"); },
      cleanup: async () => undefined,
    };
    await expect(collectV12ProductionRecoveryPhase({ identity, phase: "arm", emit: (line) => { lines.push(line); }, signal: { aborted: false }, executor })).resolves.toBe("armed");
    expect(lines.map((line) => JSON.parse(line.split("GYM_TRACKER_V12_RECOVERY_SETUP:")[1]!))).toEqual([
      { schema_version: 1, nonce: identity.nonce, stage: "delete:start" },
      { schema_version: 1, nonce: identity.nonce, stage: "delete:done" },
    ]);
  });

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

  it.each(["setup", "command", "barrier"])(
    "cleans up after an arm %s failure before rejecting",
    async (stage) => {
      const events: string[] = [];
      const executor: V12ProductionRecoveryExecutor = {
        arm: jest.fn(async () => {
          events.push(`${stage}:failed`);
          throw new Error(`${stage}_failed`);
        }),
        recover: jest.fn(async () => { throw new Error("must_not_recover"); }),
        cleanup: jest.fn(async () => {
          events.push("cleanup:complete");
        }),
      };
      const lines: string[] = [];

      await expect(collectV12ProductionRecoveryPhase({
        identity,
        phase: "arm",
        emit: (line) => lines.push(line),
        signal: { aborted: false },
        executor,
      })).rejects.toThrow(`${stage}_failed`);

      expect(events).toEqual([`${stage}:failed`, "cleanup:complete"]);
      expect(lines).toEqual([]);
    },
  );

  it("cleans up after arm progress validation fails", async () => {
    const events: string[] = [];
    const executor: V12ProductionRecoveryExecutor = {
      arm: jest.fn(async (input: V12RecoveryExecutionIdentity) => {
        events.push("validation:started");
        await input.progress({
          barrier_id: "wrong-barrier",
          process_state: "writer-open",
          acknowledgement: "pending",
          connectivity: "online",
          first_attempt: "committed",
          provenance: "post-commit-command-pending",
          first_attempt_code: "commit-durable-command-pending",
          before: snapshot(0, "a"),
          after_cut: snapshot(1, "b"),
        });
      }),
      recover: jest.fn(async () => { throw new Error("must_not_recover"); }),
      cleanup: jest.fn(async () => {
        events.push("cleanup:complete");
      }),
    };
    const lines: string[] = [];

    await expect(collectV12ProductionRecoveryPhase({
      identity,
      phase: "arm",
      emit: (line) => lines.push(line),
      signal: { aborted: false },
      executor,
    })).rejects.toThrow("v12_recovery_progress_invalid");

    expect(events).toEqual(["validation:started", "cleanup:complete"]);
    expect(lines).toEqual([]);
  });

  it("surfaces only cleanup failure when arm and strict database deletion both fail", async () => {
    const events: string[] = [];
    const executor: V12ProductionRecoveryExecutor = {
      arm: jest.fn(async () => {
        events.push("command:failed");
        throw new Error("command_failed");
      }),
      recover: jest.fn(async () => { throw new Error("must_not_recover"); }),
      cleanup: jest.fn(async () => {
        events.push("delete:failed");
        throw new Error("delete_failed");
      }),
    };
    const lines: string[] = [];

    await expect(collectV12ProductionRecoveryPhase({
      identity,
      phase: "arm",
      emit: (line) => lines.push(line),
      signal: { aborted: false },
      executor,
    })).rejects.toThrow("delete_failed");

    expect(events).toEqual(["command:failed", "delete:failed"]);
    expect(lines).toEqual([]);
  });

  it("emits a nonce-bound rich ARMED progress marker from the exact causal barrier", async () => {
    const before = snapshot(0, "a");
    const afterCut = snapshot(1, "b");
    const executor: V12ProductionRecoveryExecutor = {
      arm: jest.fn(async (input: V12RecoveryExecutionIdentity) => {
        await input.progress({
          barrier_id: "commit-durable-ack-pending",
          process_state: "writer-open",
          acknowledgement: "pending",
          connectivity: "online",
          first_attempt: "committed",
          provenance: "post-commit-command-pending",
          first_attempt_code: "commit-durable-command-pending",
          before,
          after_cut: afterCut,
        });
      }),
      recover: jest.fn(async () => { throw new Error("must_not_recover"); }),
      cleanup: jest.fn(async () => undefined),
    };
    const lines: string[] = [];

    const onArmed = jest.fn(() => {
      expect(emittedResult(lines).kind).toBe("ARMED");
    });
    await collectV12ProductionRecoveryPhase({
      identity,
      phase: "arm",
      emit: (line) => lines.push(line),
      signal: { aborted: false },
      executor,
      onArmed,
    });

    expect(onArmed).toHaveBeenCalledTimes(1);
    expect(emittedResult(lines))
      .toEqual(expect.objectContaining({
        schema_version: 2,
        nonce: identity.nonce,
        sequence: 1,
        kind: "ARMED",
        case_id: identity.caseId,
        cut_id: identity.cutId,
        step_id: "between-set-commit",
        operation_id: "between-set-commit",
        boundary_id: "commit",
        receipt_kind: "set-completion",
        barrier_id: "commit-durable-ack-pending",
        before,
        after_cut: afterCut,
      }));
  });

  it("emits only durable readback facts after reopen and retry", async () => {
    const executor: V12ProductionRecoveryExecutor = {
      arm: jest.fn(async () => undefined),
      recover: jest.fn(async () => ({
        step_id: "between-set-commit",
        boundary_id: "commit",
        receipt_kind: "set-completion",
        operation_id: "between-set-commit",
        after_reopen: snapshot(1, "b"),
        recovery_code: "not-required",
        after_recovery: snapshot(1, "b"),
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

    expect(lines.length).toBeGreaterThan(1);
    const value = emittedResult(lines);
    expect(value).toEqual({
      schema_version: 2,
      nonce: identity.nonce,
      kind: "recovery",
      case_id: identity.caseId,
      cut_id: identity.cutId,
      step_id: "between-set-commit",
      boundary_id: "commit",
      receipt_kind: "set-completion",
      operation_id: "between-set-commit",
      after_reopen: snapshot(1, "b"),
      recovery_code: "not-required",
      after_recovery: snapshot(1, "b"),
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
        step_id: "between-set-commit",
        boundary_id: "commit",
        receipt_kind: "set-completion",
        operation_id: "between-set-commit",
        after_reopen: snapshot(1, "c"),
        recovery_code: "not-required",
        after_recovery: snapshot(1, "c"),
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

  it("finishes cleanup before emitting the sole terminal result", async () => {
    const executor: V12ProductionRecoveryExecutor = {
      arm: jest.fn(async () => undefined),
      recover: jest.fn(async () => ({
        step_id: "between-set-commit",
        boundary_id: "commit",
        receipt_kind: "set-completion",
        operation_id: "between-set-commit",
        after_reopen: snapshot(1, "d"),
        recovery_code: "not-required",
        after_recovery: snapshot(1, "d"),
        retry_code: "already-completed",
        after_retry: snapshot(1, "d"),
      })),
      cleanup: jest.fn(async () => { throw new Error("cleanup_failed"); }),
    };
    const lines: string[] = [];

    await expect(collectV12ProductionRecoveryPhase({
      identity,
      phase: "recover",
      emit: (line) => lines.push(line),
      signal: { aborted: false },
      executor,
    })).rejects.toThrow("cleanup_failed");

    expect(executor.cleanup).toHaveBeenCalledTimes(1);
    expect(lines).toEqual([]);
  });

  it("runs cleanup in finally when native recovery fails", async () => {
    const executor: V12ProductionRecoveryExecutor = {
      arm: jest.fn(async () => undefined),
      recover: jest.fn(async () => { throw new Error("recovery_failed"); }),
      cleanup: jest.fn(async () => undefined),
    };
    const lines: string[] = [];

    await expect(collectV12ProductionRecoveryPhase({
      identity,
      phase: "recover",
      emit: (line) => lines.push(line),
      signal: { aborted: false },
      executor,
    })).rejects.toThrow("recovery_failed");

    expect(executor.cleanup).toHaveBeenCalledTimes(1);
    expect(lines).toEqual([]);
  });

  it("runs cleanup in finally when durable observation validation fails", async () => {
    const executor: V12ProductionRecoveryExecutor = {
      arm: jest.fn(async () => undefined),
      recover: jest.fn(async () => ({
        step_id: "between-set-commit",
        boundary_id: "commit",
        receipt_kind: "set-completion",
        operation_id: "between-set-commit",
        after_reopen: snapshot(1, "b"),
        recovery_code: "not-required",
        after_recovery: snapshot(1, "b"),
        retry_code: "already-completed",
        after_retry: { ...snapshot(1, "b"), receipt_count: -1 },
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
    })).rejects.toThrow("v12_recovery_observation_invalid");

    expect(executor.cleanup).toHaveBeenCalledTimes(1);
    expect(lines).toEqual([]);
  });
});
