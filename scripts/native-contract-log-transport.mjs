export const NATIVE_CONTRACT_RESULT_MARKER =
  "GYM_TRACKER_SQLITE_CONTRACT_RESULT:";
export const NATIVE_CONTRACT_CASE_MARKER =
  "GYM_TRACKER_SQLITE_CONTRACT_CASE:";
export const NATIVE_CONTRACT_ERROR_MARKER =
  "GYM_TRACKER_SQLITE_CONTRACT_ERROR:";
export const NATIVE_CONTRACT_PROGRESS_MARKER =
  "GYM_TRACKER_SQLITE_CONTRACT_PROGRESS:";

function markerPayload(line, marker) {
  const markerIndex = line.indexOf(marker);
  return markerIndex === -1
    ? undefined
    : line.slice(markerIndex + marker.length);
}

function parseJson(value) {
  if (value === undefined) {
    return undefined;
  }
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

export function parseNativeContractLogOutput(output, runId) {
  const lines = output.split(/\r?\n/u);
  const resultPayloads = lines
    .map((line) => parseJson(markerPayload(
      line,
      NATIVE_CONTRACT_RESULT_MARKER,
    )))
    .filter((payload) => payload !== undefined);
  const latest = resultPayloads.at(-1);
  if (latest === undefined) {
    return undefined;
  }
  if (
    typeof latest !== "object"
    || latest === null
    || latest.runId === undefined
    || latest.summary === undefined
  ) {
    return latest;
  }
  if (latest.runId !== runId) {
    return undefined;
  }
  const caseRecords = lines
    .map((line) => parseJson(markerPayload(
      line,
      NATIVE_CONTRACT_CASE_MARKER,
    )))
    .filter((payload) => payload?.runId === runId);
  const cases = caseRecords.map((payload) => payload.case);
  if (
    cases.length !== latest.summary.total
    || cases.some((contractCase) => contractCase === undefined)
    || new Set(cases.map((contractCase) => contractCase.id)).size
      !== cases.length
  ) {
    return undefined;
  }
  return {
    ...latest.summary,
    cases,
  };
}

export function parseNativeContractLogFailure(output, runId) {
  const failures = output
    .split(/\r?\n/u)
    .map((line) => parseJson(markerPayload(
      line,
      NATIVE_CONTRACT_ERROR_MARKER,
    )))
    .filter((payload) => (
      payload !== null
      && typeof payload === "object"
      && payload.runId === runId
      && typeof payload.errorCode === "string"
      && /^[a-z0-9_:-]{3,80}$/iu.test(payload.errorCode)
    ));
  return failures.at(-1)?.errorCode;
}

export function parseNativeContractLogProgress(output, runId) {
  const progress = output
    .split(/\r?\n/u)
    .map((line) => parseJson(markerPayload(
      line,
      NATIVE_CONTRACT_PROGRESS_MARKER,
    )))
    .filter((payload) => (
      payload !== null
      && typeof payload === "object"
      && payload.runId === runId
      && typeof payload.stage === "string"
      && /^[a-z0-9_:-]{3,80}$/iu.test(payload.stage)
    ));
  return progress.at(-1)?.stage;
}
