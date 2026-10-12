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
  timestampMs: number;
  synthetic: true;
  dx?: number;
  viewportWidth?: number;
  transformX?: number;
  semanticMonth?: string;
  titleMonth?: string;
  selected?: Readonly<{ y: number; height: number }>;
  following?: Readonly<{ y: number; height: number }>;
  destination?: Readonly<{ selectedY: number; followingY: number }>;
  focusRingWidthDp?: 3;
  focusClearanceDp?: 4;
}>;

export type Phase16CalendarTrace = Readonly<{
  schemaVersion: 1;
  stage: Phase16CalendarStage;
  synthetic: true;
  samples: readonly Phase16CalendarDiagnosticSample[];
}>;

const PACKAGE = "com.fchoo.gymtracker.devtest";
const SUITE = "phase16-calendar";
const allowedStages = new Set<string>(PHASE16_CALENDAR_STAGES);
const MAX_SAMPLES = 64;

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

function safeMonth(value: string): string {
  if (!/^\d{4}-\d{2}$/u.test(value)) throw new Error("phase16_calendar_diagnostic_month_invalid");
  return value;
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
  recordDrag(input: Readonly<{ dx: number; viewportWidth: number; transformX: number; semanticMonth: string; titleMonth: string }>): void;
  recordRelease(input: Readonly<{ dx: number; viewportWidth: number; semanticMonth: string; titleMonth: string }>): void;
  recordCancel(): void;
  recordFocus(input: Readonly<{ selected: Readonly<{ y: number; height: number }>; following: Readonly<{ y: number; height: number }>; destination: Readonly<{ selectedY: number; followingY: number }> }>): void;
  trace(): Phase16CalendarTrace;
}>;

export function createPhase16CalendarTestControls(input: NativeContractIdentity & Readonly<{
  stage: string | undefined;
  nowMs?: () => number;
}>): Phase16CalendarTestControls | null {
  const stage = phase16CalendarStageFromNativeContract(input);
  if (stage === null) return null;
  const nowMs = input.nowMs ?? Date.now;
  let lastTimestamp = 0;
  const samples: Phase16CalendarDiagnosticSample[] = [];
  const append = (sample: Omit<Phase16CalendarDiagnosticSample, "timestampMs" | "synthetic">) => {
    if (samples.length >= MAX_SAMPLES) throw new Error("phase16_calendar_diagnostic_overflow");
    const timestampMs = safeTimestamp(nowMs());
    if (timestampMs <= lastTimestamp) throw new Error("phase16_calendar_diagnostic_clock_invalid");
    lastTimestamp = timestampMs;
    samples.push(Object.freeze({ ...sample, timestampMs, synthetic: true }));
  };
  return Object.freeze({
    recordDrag: ({ dx, viewportWidth, transformX, semanticMonth, titleMonth }) => append({
      kind: "drag",
      dx: safeNumber(dx),
      viewportWidth: safeNumber(viewportWidth),
      transformX: safeNumber(transformX),
      semanticMonth: safeMonth(semanticMonth),
      titleMonth: safeMonth(titleMonth),
    }),
    recordRelease: ({ dx, viewportWidth, semanticMonth, titleMonth }) => append({
      kind: "release",
      dx: safeNumber(dx),
      viewportWidth: safeNumber(viewportWidth),
      semanticMonth: safeMonth(semanticMonth),
      titleMonth: safeMonth(titleMonth),
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
    trace: () => Object.freeze({ schemaVersion: 1, stage, synthetic: true, samples: Object.freeze([...samples]) }),
  });
}

let activeControls: Phase16CalendarTestControls | null = null;

/** Route composition calls this once; production and unknown identities always clear the recorder. */
export function configurePhase16CalendarTestControls(input: NativeContractIdentity & Readonly<{ stage: string | undefined }>): void {
  activeControls = createPhase16CalendarTestControls(input);
}

export function clearPhase16CalendarTestControls(): void {
  activeControls = null;
}

export function recordPhase16CalendarDrag(input: Readonly<{ dx: number; viewportWidth: number; transformX: number; semanticMonth: string; titleMonth: string }>): void {
  activeControls?.recordDrag(input);
}

export function recordPhase16CalendarRelease(input: Readonly<{ dx: number; viewportWidth: number; semanticMonth: string; titleMonth: string }>): void {
  activeControls?.recordRelease(input);
}

export function recordPhase16CalendarCancel(): void {
  activeControls?.recordCancel();
}

export function recordPhase16CalendarFocus(input: Readonly<{ selected: Readonly<{ y: number; height: number }>; following: Readonly<{ y: number; height: number }>; destination: Readonly<{ selectedY: number; followingY: number }> }>): void {
  activeControls?.recordFocus(input);
}
