import type { V12AcceptanceSqliteContractResult } from "./contracts/v12Acceptance.contract";

export const V12_NATIVE_CONTRACT_LOG_FRAME_MAX_BYTES = 3_840;
export const V12_NATIVE_CONTRACT_EXECUTION_LIMIT = 8;
const CASE_MARKER = "GYM_TRACKER_SQLITE_CONTRACT_CASE:";
const RESULT_MARKER = "GYM_TRACKER_SQLITE_CONTRACT_RESULT:";

function utf8Bytes(value: string): number {
  let bytes = 0;
  for (const character of value) {
    const code = character.codePointAt(0)!;
    bytes += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
  }
  return bytes;
}

/** One real execution per nonce, shared across route remounts for this process. */
export function createV12NativeContractExecutionRegistry() {
  const executions = new Map<string, Promise<V12AcceptanceSqliteContractResult>>();
  return Object.freeze({
    onceForNonce(runId: string, execute: () => Promise<V12AcceptanceSqliteContractResult>) {
      if (!/^[A-Za-z0-9._-]{1,48}$/u.test(runId)) {
        throw new Error("native_contract_run_id_invalid");
      }
      const existing = executions.get(runId);
      if (existing !== undefined) return existing;
      if (executions.size >= V12_NATIVE_CONTRACT_EXECUTION_LIMIT) {
        throw new Error("native_contract_execution_capacity");
      }
      // Store before dispatch so a second mount cannot start competing SQLite work.
      // Rejections remain retained too: a failed nonce is not silently retried.
      const execution = Promise.resolve().then(execute);
      executions.set(runId, execution);
      return execution;
    },
  });
}

/** Prepare every bounded frame before any output; never emit an unbound result. */
export function createV12NativeContractLogFrames(
  runId: string,
  result: V12AcceptanceSqliteContractResult,
): readonly string[] {
  if (!/^[A-Za-z0-9._-]{1,48}$/u.test(runId)) {
    throw new Error("native_contract_run_id_invalid");
  }
  const { cases, ...summary } = result;
  const caseFrames = cases.map((contractCase) => {
    const frame = `${CASE_MARKER}${JSON.stringify({ runId, case: contractCase })}`;
    if (utf8Bytes(frame) > V12_NATIVE_CONTRACT_LOG_FRAME_MAX_BYTES) {
      throw new Error("native_contract_case_frame_too_large");
    }
    return frame;
  });
  const resultFrame = `${RESULT_MARKER}${JSON.stringify({ runId, summary })}`;
  if (utf8Bytes(resultFrame) > V12_NATIVE_CONTRACT_LOG_FRAME_MAX_BYTES) {
    throw new Error("native_contract_result_frame_too_large");
  }
  return Object.freeze([...caseFrames, resultFrame]);
}
