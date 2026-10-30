import { describe, expect, it, jest } from "@jest/globals";
import { V12_ACCEPTANCE_SQLITE_CASES, type V12AcceptanceSqliteContractResult } from "./contracts/v12Acceptance.contract";
import { createV12NativeContractExecutionRegistry, createV12NativeContractLogFrames, V12_NATIVE_CONTRACT_EXECUTION_LIMIT, V12_NATIVE_CONTRACT_LOG_FRAME_MAX_BYTES } from "./v12NativeContractLogTransport";

const runId = `v12-${"a".repeat(32)}`;
function fullResult(): V12AcceptanceSqliteContractResult {
  return {
    schemaVersion: 1, contractVersion: 1, status: "passed", total: 10, passed: 10, failed: 0, skipped: 0,
    cases: V12_ACCEPTANCE_SQLITE_CASES.map(definition => ({
      id: definition.id, status: "passed", code: "v12_acceptance_case_passed",
      counts: { sourceCases: definition.sources.reduce((count, source) => count + source.sourceCaseIds.length, 0) },
      sourceFacts: definition.sources.map(source => ({ registry: source.sourceRegistry,
        cases: source.sourceCaseIds.map(id => ({ id, status: "passed" })) })),
    })),
  };
}

describe("v1.2 native contract log framing", () => {
  it("shares one pending execution across duplicate mounts and never acknowledges it early", async () => {
    const registry = createV12NativeContractExecutionRegistry();
    let resolve!: (result: V12AcceptanceSqliteContractResult) => void;
    const pending = new Promise<V12AcceptanceSqliteContractResult>(done => { resolve = done; });
    const execute = jest.fn(() => pending);
    const first = registry.onceForNonce(runId, execute);
    const second = registry.onceForNonce(runId, execute);
    expect(first).toBe(second);
    await Promise.resolve();
    expect(execute).toHaveBeenCalledTimes(1);
    const result = fullResult();
    resolve(result);
    await expect(first).resolves.toBe(result);
    await expect(registry.onceForNonce(runId, execute)).resolves.toBe(result);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("retains a failed nonce instead of starting another SQLite execution", async () => {
    const registry = createV12NativeContractExecutionRegistry();
    const failure = new Error("native_contract_case_failed");
    const execute = jest.fn(async () => { throw failure; });
    const first = registry.onceForNonce(runId, execute);
    await expect(first).rejects.toBe(failure);
    const retry = registry.onceForNonce(runId, execute);
    expect(retry).toBe(first);
    await expect(retry).rejects.toBe(failure);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("bounds retained execution state and validates every nonce before dispatch", async () => {
    const registry = createV12NativeContractExecutionRegistry();
    const execute = jest.fn(async () => fullResult());
    expect(() => registry.onceForNonce("invalid identity", execute)).toThrow("native_contract_run_id_invalid");
    for (let index = 0; index < V12_NATIVE_CONTRACT_EXECUTION_LIMIT; index += 1) {
      await registry.onceForNonce(`v12-fixture-${index}`, execute);
    }
    expect(() => registry.onceForNonce("v12-another", execute)).toThrow("native_contract_execution_capacity");
    await expect(registry.onceForNonce("v12-fixture-0", execute)).resolves.toEqual(fullResult());
    expect(execute).toHaveBeenCalledTimes(V12_NATIVE_CONTRACT_EXECUTION_LIMIT);
  });

  it("frames every actual category, including Garmin facts, with one nonce-bound small summary", () => {
    const result = fullResult();
    const frames = createV12NativeContractLogFrames(runId, result);
    expect(frames).toHaveLength(11);
    expect(Object.isFrozen(frames)).toBe(true);
    for (const frame of frames) expect(Buffer.byteLength(frame, "utf8")).toBeLessThanOrEqual(V12_NATIVE_CONTRACT_LOG_FRAME_MAX_BYTES);
    const cases = frames.slice(0, -1).map(frame => JSON.parse(frame.slice("GYM_TRACKER_SQLITE_CONTRACT_CASE:".length)));
    expect(cases.map(record => record.runId)).toEqual(Array(10).fill(runId));
    expect(cases.map(record => record.case)).toEqual(result.cases);
    expect(cases.some(record => record.case.sourceFacts.some((source: {registry: string}) => source.registry === "garmin-acceptance"))).toBe(true);
    const summary = JSON.parse(frames.at(-1)!.slice("GYM_TRACKER_SQLITE_CONTRACT_RESULT:".length));
    expect(summary).toEqual({ runId, summary: { schemaVersion: 1, contractVersion: 1, status: "passed", total: 10, passed: 10, failed: 0, skipped: 0 } });
    expect(result.cases).toHaveLength(10);
  });

  it("rejects invalid route identities instead of emitting an unbound result", () => {
    for (const invalid of ["", "a".repeat(49), "private@example.invalid", "two words", "路径"]) {
      expect(() => createV12NativeContractLogFrames(invalid, fullResult())).toThrow("native_contract_run_id_invalid");
    }
    expect(createV12NativeContractLogFrames("v1.2-acceptance-123", fullResult())).toHaveLength(11);
  });

  it("fails before output if a case could overflow logcat, including multibyte text", () => {
    for (const text of ["a".repeat(4_000), "é".repeat(2_000), "界".repeat(1_400), "😀".repeat(1_000)]) {
      const result = fullResult();
      const oversized = { ...result, cases: [{ ...result.cases[0]!, errorCode: text }, ...result.cases.slice(1)] };
      expect(() => createV12NativeContractLogFrames(runId, oversized)).toThrow("native_contract_case_frame_too_large");
    }
  });

  it("fails closed for an oversized summary and does not change failed verdicts", () => {
    const result = fullResult();
    const oversized = { ...result, extra: "x".repeat(4_000) };
    expect(() => createV12NativeContractLogFrames(runId, oversized)).toThrow("native_contract_result_frame_too_large");
    const failed = { ...result, status: "failed" as const, passed: 0, failed: 10,
      cases: result.cases.map(contractCase => ({ ...contractCase, status: "failed" as const, code: "v12_acceptance_case_failed" as const })) };
    const frames = createV12NativeContractLogFrames(runId, failed);
    const summary = JSON.parse(frames.at(-1)!.slice("GYM_TRACKER_SQLITE_CONTRACT_RESULT:".length));
    expect(summary.summary.status).toBe("failed");
    expect(summary.summary.failed).toBe(10);
  });
});
