export const PHASE16_CALENDAR_STAGES = Object.freeze([
  "drag-forward-10",
  "drag-forward-24_9",
  "drag-forward-25",
  "drag-forward-25_1",
  "drag-forward-release-below",
  "drag-forward-release-exact",
  "drag-forward-release-above",
  "drag-backward-10",
  "drag-backward-24_9",
  "drag-backward-25",
  "drag-backward-25_1",
  "drag-backward-release-below",
  "drag-backward-release-exact",
  "drag-backward-release-above",
  "drag-fast-subthreshold",
  "drag-retreat",
  "drag-cancel",
  "drag-vertical",
  "drag-diagonal",
  "week-expand-first-row",
  "week-expand-middle-row",
  "week-expand-last-row",
  "adjacent-week",
  "rapid-reverse-input",
  "second-input-interrupt",
  "rotation-during-transition",
  "background-during-transition",
  "reduced-motion",
  "accessibility-keyboard",
] as const);

export type Phase16CalendarStage = (typeof PHASE16_CALENDAR_STAGES)[number];

type NativeContractIdentity = Readonly<{
  packageName: string | undefined;
  buildProfile: string | undefined;
  nativeContractsEnabled: boolean | undefined;
  suite: string | undefined;
}>;

export type Phase16CalendarDiagnosticSample = Readonly<{
  kind: "drag" | "release" | "cancel" | "focus";
  elapsedMs: number;
  synthetic: true;
  dx?: number;
  viewportWidth?: number;
  transformX?: number;
  commandedRatio?: number;
  semanticOffset?: -1 | 0 | 1;
  titleOffset?: -1 | 0 | 1;
  selected?: Readonly<{ y: number; height: number }>;
  following?: Readonly<{ y: number; height: number }>;
  destination?: Readonly<{ selectedY: number; followingY: number }>;
  focusRingWidthDp?: 3;
  focusClearanceDp?: 4;
}>;

export type Phase16CalendarTrace = Readonly<{
  schemaVersion: 1;
  stage: Phase16CalendarStage;
  traceNonce: string;
  sourceIdentity: Readonly<{
    packageName: "com.fchoo.gymtracker.devtest";
    buildProfile: "development-test";
    suite: "phase16-calendar";
  }>;
  synthetic: true;
  samples: readonly Phase16CalendarDiagnosticSample[];
}>;

const PACKAGE = "com.fchoo.gymtracker.devtest";
const SUITE = "phase16-calendar";
const allowedStages = new Set<string>(PHASE16_CALENDAR_STAGES);
const MAX_SAMPLES = 64;
const MIN_DIAGNOSTIC_SAMPLES = 100;
const MAX_DIAGNOSTIC_SAMPLES = 500;

export const PHASE16_CALENDAR_TRACE_SAMPLE_MARKER = "GYM_TRACKER_V12_CALENDAR_TRACE_SAMPLE:";
export const PHASE16_CALENDAR_DIAGNOSTICS_CHUNK_MARKER = "GYM_TRACKER_V12_CALENDAR_DIAGNOSTICS_CHUNK:";
const DIAGNOSTICS_CHUNK_SIZE = 1800;
let traceNonceSequence = 0;
let diagnosticsStreamSequence = 0;

function safeNumber(value: number): number {
  if (!Number.isFinite(value) || Math.abs(value) > 100_000) throw new Error("phase16_calendar_diagnostic_number_invalid");
  return value;
}

function safeTimestamp(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1_700_000_000_000 || value > 2_000_000_000_000) {
    throw new Error("phase16_calendar_diagnostic_clock_invalid");
  }
  return value;
}

function safeTraceNonce(value: string): string {
  if (!/^p16trace-[a-z0-9-]{3,63}$/u.test(value)) throw new Error("phase16_calendar_trace_nonce_invalid");
  return value;
}

function safeOffset(value: number): -1 | 0 | 1 {
  if (value !== -1 && value !== 0 && value !== 1) throw new Error("phase16_calendar_diagnostic_offset_invalid");
  return value;
}

function safeRatio(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error("phase16_calendar_diagnostic_ratio_invalid");
  return value;
}

function commandedReleaseRatio(stage: Phase16CalendarStage, measuredRatio: number): number {
  if (stage.endsWith("-10")) return 0.1;
  if (stage.endsWith("-24_9") || stage.endsWith("release-below")) return 0.249;
  if (stage.endsWith("-25") || stage.endsWith("release-exact")) return 0.25;
  if (stage.endsWith("-25_1") || stage.endsWith("release-above")) return 0.251;
  if (stage === "drag-fast-subthreshold" || stage === "drag-retreat") return 0.1;
  return safeRatio(measuredRatio);
}

export type Phase16CalendarGestureDriverStep = Readonly<
  | { kind: "drag"; dxRatio: number; commandedRatio: number }
  | { kind: "release"; dxRatio: number }
  | { kind: "cancel" }
>;

export function phase16CalendarGestureDriver(
  stage: Phase16CalendarStage | undefined,
): readonly Phase16CalendarGestureDriverStep[] | null {
  if (stage === "drag-retreat") {
    return Object.freeze([
      Object.freeze({ kind: "drag" as const, dxRatio: -0.251, commandedRatio: 0.251 }),
      Object.freeze({ kind: "drag" as const, dxRatio: -0.1, commandedRatio: 0.1 }),
      Object.freeze({ kind: "release" as const, dxRatio: -0.1 }),
    ]);
  }
  if (stage === "drag-cancel") {
    return Object.freeze([
      Object.freeze({ kind: "drag" as const, dxRatio: -0.18, commandedRatio: 0.18 }),
      Object.freeze({ kind: "cancel" as const }),
    ]);
  }
  return null;
}

function monthIndex(value: string): number {
  const match = /^(\d{4})-(\d{2})$/u.exec(value);
  const month = Number(match?.[2]);
  if (match === null || month < 1 || month > 12) throw new Error("phase16_calendar_diagnostic_month_invalid");
  return Number(match[1]) * 12 + month - 1;
}

export function phase16CalendarStageFromNativeContract(input: NativeContractIdentity & Readonly<{
  stage: string | undefined;
}>): Phase16CalendarStage | null {
  if (
    input.packageName !== PACKAGE
    || input.buildProfile !== "development-test"
    || input.nativeContractsEnabled !== true
    || input.suite !== SUITE
    || input.stage === undefined
    || !allowedStages.has(input.stage)
  ) return null;
  return input.stage as Phase16CalendarStage;
}

export type Phase16CalendarTestControls = Readonly<{
  recordDrag(input: Phase16CalendarMonthSampleInput & Readonly<{ commandedRatio: number; dx: number; viewportWidth: number; transformX: number }>): void;
  recordRelease(input: Phase16CalendarMonthSampleInput & Readonly<{ dx: number; viewportWidth: number }>): void;
  recordCancel(): void;
  recordFocus(input: Readonly<{ selected: Readonly<{ y: number; height: number }>; following: Readonly<{ y: number; height: number }>; destination: Readonly<{ selectedY: number; followingY: number }> }>): void;
  trace(): Phase16CalendarTrace;
}>;

type Phase16CalendarMonthSampleInput = Readonly<{
  semanticOffset: number;
  titleOffset: number;
}> | Readonly<{
  semanticMonth: string;
  titleMonth: string;
}>;

export function createPhase16CalendarTestControls(input: NativeContractIdentity & Readonly<{
  stage: string | undefined;
  nowMs?: () => number;
  traceNonce?: string;
  emitLine?: (line: string) => void;
}>): Phase16CalendarTestControls | null {
  const stage = phase16CalendarStageFromNativeContract(input);
  if (stage === null) return null;
  const nowMs = input.nowMs ?? Date.now;
  const startedAtMs = safeTimestamp(nowMs());
  const traceNonce = safeTraceNonce(input.traceNonce
    ?? `p16trace-${startedAtMs.toString(36)}-${(++traceNonceSequence).toString(36)}`);
  let lastElapsedMs = -1;
  let baseMonthIndex: number | undefined;
  const samples: Phase16CalendarDiagnosticSample[] = [];
  const offsets = (sample: Phase16CalendarMonthSampleInput) => {
    if ("semanticOffset" in sample) {
      return { semanticOffset: safeOffset(sample.semanticOffset), titleOffset: safeOffset(sample.titleOffset) };
    }
    const semanticMonthIndex = monthIndex(sample.semanticMonth);
    baseMonthIndex ??= semanticMonthIndex;
    return {
      semanticOffset: safeOffset(semanticMonthIndex - baseMonthIndex),
      titleOffset: safeOffset(monthIndex(sample.titleMonth) - baseMonthIndex),
    };
  };
  const append = (sample: Omit<Phase16CalendarDiagnosticSample, "elapsedMs" | "synthetic">) => {
    if (samples.length >= MAX_SAMPLES) throw new Error("phase16_calendar_diagnostic_overflow");
    const observedElapsedMs = safeTimestamp(nowMs()) - startedAtMs;
    if (observedElapsedMs < 0) throw new Error("phase16_calendar_diagnostic_clock_invalid");
    const elapsedMs = Math.max(observedElapsedMs, lastElapsedMs + 1);
    lastElapsedMs = elapsedMs;
    const retained = Object.freeze({ ...sample, elapsedMs, synthetic: true });
    samples.push(retained);
    input.emitLine?.(`${PHASE16_CALENDAR_TRACE_SAMPLE_MARKER}${JSON.stringify({
      schema_version: 1,
      trace_nonce: traceNonce,
      source_identity: {
        package_name: PACKAGE,
        build_profile: "development-test",
        suite: SUITE,
      },
      stage,
      sequence: samples.length,
      sample: retained,
    })}`);
  };
  return Object.freeze({
    recordDrag: (sample) => append({
      kind: "drag",
      dx: safeNumber(sample.dx),
      viewportWidth: safeNumber(sample.viewportWidth),
      transformX: safeNumber(sample.transformX),
      commandedRatio: safeRatio(sample.commandedRatio),
      ...offsets(sample),
    }),
    recordRelease: (sample) => append({
      kind: "release",
      dx: safeNumber(sample.dx),
      viewportWidth: safeNumber(sample.viewportWidth),
      commandedRatio: commandedReleaseRatio(stage, Math.abs(sample.dx) / sample.viewportWidth),
      ...offsets(sample),
    }),
    recordCancel: () => append({ kind: "cancel" }),
    recordFocus: ({ selected, following, destination }) => append({
      kind: "focus",
      selected: { y: safeNumber(selected.y), height: safeNumber(selected.height) },
      following: { y: safeNumber(following.y), height: safeNumber(following.height) },
      destination: { selectedY: safeNumber(destination.selectedY), followingY: safeNumber(destination.followingY) },
      focusRingWidthDp: 3,
      focusClearanceDp: 4,
    }),
    trace: () => Object.freeze({
      schemaVersion: 1,
      stage,
      traceNonce,
      sourceIdentity: Object.freeze({
        packageName: PACKAGE,
        buildProfile: "development-test",
        suite: SUITE,
      }),
      synthetic: true,
      samples: Object.freeze([...samples]),
    }),
  });
}

export type Phase16CalendarDiagnosticsRequest = Readonly<{
  querySamples: number;
  interactionSamples: number;
}>;

function diagnosticSampleCount(value: string | undefined): number | null {
  if (value === undefined || !/^\d{3}$/u.test(value)) return null;
  const parsed = Number(value);
  return parsed >= MIN_DIAGNOSTIC_SAMPLES && parsed <= MAX_DIAGNOSTIC_SAMPLES ? parsed : null;
}

function nativeIdentityEnabled(input: NativeContractIdentity): boolean {
  return input.packageName === PACKAGE
    && input.buildProfile === "development-test"
    && input.nativeContractsEnabled === true
    && input.suite === SUITE;
}

export function phase16CalendarDiagnosticsRequestFromNativeContract(input: NativeContractIdentity & Readonly<{
  enabled: string | readonly string[] | undefined;
  querySamples: string | readonly string[] | undefined;
  interactionSamples: string | readonly string[] | undefined;
}>): Phase16CalendarDiagnosticsRequest | null {
  if (!nativeIdentityEnabled(input)
    || input.enabled !== "true"
    || typeof input.querySamples !== "string"
    || typeof input.interactionSamples !== "string") return null;
  const querySamples = diagnosticSampleCount(input.querySamples);
  const interactionSamples = diagnosticSampleCount(input.interactionSamples);
  return querySamples === null || interactionSamples === null
    ? null
    : Object.freeze({ querySamples, interactionSamples });
}

type QueryDiagnostic = Readonly<{
  durationMs: number;
  eventCount: number;
  planCount: number;
  importedCount: number;
}>;

type InteractionDiagnostic = Readonly<{
  frameWorkMs: readonly number[];
  missedFrames: number;
  refreshRateHz: number;
  profilerOverheadMs: number;
}>;

type RawCalendarDiagnostics = Readonly<{
  producer: "v12-calendar-native-diagnostics/v1";
  native_execution: "EXECUTED";
  query_samples: readonly Readonly<Record<string, number | boolean>>[];
  interaction_samples: readonly Readonly<Record<string, number | boolean | string | readonly number[]>>[];
}>;

export type Phase16CalendarDiagnosticsProducer = Readonly<{
  recordQuery(input: QueryDiagnostic): void;
  recordInteraction(input: InteractionDiagnostic): void;
  exportResult(): RawCalendarDiagnostics;
}>;

function safeCount(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > 10_000) throw new Error("phase16_calendar_diagnostics_count_invalid");
  return value;
}

function safeDuration(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > 60_000) throw new Error("phase16_calendar_diagnostics_duration_invalid");
  return value;
}

export function createPhase16CalendarDiagnosticsProducer(input: NativeContractIdentity & Readonly<{
  request: Phase16CalendarDiagnosticsRequest | null;
  emitLine: (line: string) => void;
  streamId?: string;
}>): Phase16CalendarDiagnosticsProducer | null {
  if (!nativeIdentityEnabled(input) || input.request === null) return null;
  const request = input.request;
  const querySamples: Readonly<Record<string, number | boolean>>[] = [];
  const interactionSamples: Readonly<Record<string, number | boolean | string | readonly number[]>>[] = [];
  let exported = false;
  return Object.freeze({
    recordQuery: (sample) => {
      if (querySamples.length >= request.querySamples) throw new Error("phase16_calendar_diagnostics_query_overflow");
      querySamples.push(Object.freeze({
        sequence: querySamples.length + 1,
        duration_ms: safeDuration(sample.durationMs),
        source_backed: true,
        event_count: safeCount(sample.eventCount),
        plan_count: safeCount(sample.planCount),
        imported_count: safeCount(sample.importedCount),
      }));
    },
    recordInteraction: (sample) => {
      if (interactionSamples.length >= request.interactionSamples) throw new Error("phase16_calendar_diagnostics_interaction_overflow");
      if (sample.frameWorkMs.length === 0 || sample.frameWorkMs.length > 10_000) throw new Error("phase16_calendar_diagnostics_frame_count_invalid");
      interactionSamples.push(Object.freeze({
        sequence: interactionSamples.length + 1,
        kind: "drag-expand-collapse",
        complete: true,
        frame_work_ms: Object.freeze(sample.frameWorkMs.map(safeDuration)),
        missed_frames: safeCount(sample.missedFrames),
        refresh_rate_hz: safeDuration(sample.refreshRateHz),
        profiler_overhead_ms: safeDuration(sample.profilerOverheadMs),
      }));
    },
    exportResult: () => {
      if (exported) throw new Error("phase16_calendar_diagnostics_exported");
      if (querySamples.length !== request.querySamples || interactionSamples.length !== request.interactionSamples) {
        throw new Error("phase16_calendar_diagnostics_incomplete");
      }
      const result = Object.freeze({
        producer: "v12-calendar-native-diagnostics/v1" as const,
        native_execution: "EXECUTED" as const,
        query_samples: Object.freeze([...querySamples]),
        interaction_samples: Object.freeze([...interactionSamples]),
      });
      const payload = JSON.stringify(result);
      const streamId = input.streamId
        ?? `p16diag-${(++diagnosticsStreamSequence).toString(36)}-${payload.length.toString(36)}`;
      if (!/^p16diag-[a-z0-9-]{3,63}$/u.test(streamId)) throw new Error("phase16_calendar_diagnostics_stream_invalid");
      const chunks = Array.from({ length: Math.ceil(payload.length / DIAGNOSTICS_CHUNK_SIZE) }, (_, index) => (
        payload.slice(index * DIAGNOSTICS_CHUNK_SIZE, (index + 1) * DIAGNOSTICS_CHUNK_SIZE)
      ));
      chunks.forEach((chunk, index) => input.emitLine(`${PHASE16_CALENDAR_DIAGNOSTICS_CHUNK_MARKER}${JSON.stringify({
        schema_version: 1,
        stream_id: streamId,
        sequence: index + 1,
        total: chunks.length,
        payload: chunk,
      })}`));
      exported = true;
      return result;
    },
  });
}

let activeControls: Phase16CalendarTestControls | null = null;

/** Route composition calls this once; production and unknown identities always clear the recorder. */
export function configurePhase16CalendarTestControls(input: NativeContractIdentity & Readonly<{
  stage: string | undefined;
  nowMs?: () => number;
  traceNonce?: string;
  emitLine?: (line: string) => void;
}>): void {
  activeControls = createPhase16CalendarTestControls({
    ...input,
    emitLine: input.emitLine ?? ((line) => console.info(line)),
  });
}

export function clearPhase16CalendarTestControls(): void {
  activeControls = null;
}

export function readPhase16CalendarActiveTrace(): Phase16CalendarTrace | null {
  return activeControls?.trace() ?? null;
}

export function recordPhase16CalendarDrag(input: Phase16CalendarMonthSampleInput & Readonly<{ commandedRatio: number; dx: number; viewportWidth: number; transformX: number }>): void {
  activeControls?.recordDrag(input);
}

export function recordPhase16CalendarRelease(input: Phase16CalendarMonthSampleInput & Readonly<{ dx: number; viewportWidth: number }>): void {
  activeControls?.recordRelease(input);
}

export function recordPhase16CalendarCancel(): void {
  activeControls?.recordCancel();
}

export function recordPhase16CalendarFocus(input: Readonly<{ selected: Readonly<{ y: number; height: number }>; following: Readonly<{ y: number; height: number }>; destination: Readonly<{ selectedY: number; followingY: number }> }>): void {
  activeControls?.recordFocus(input);
}
