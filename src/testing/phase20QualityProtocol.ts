export const PHASE20_QUALITY_WORKLOAD_MARKER =
  "GYM_TRACKER_PHASE20_WORKLOAD:" as const;
export const PHASE20_QUALITY_DATABASE_PREFIX =
  "gym-tracker-phase20-quality-" as const;
export const PHASE20_QUALITY_WORKLOAD_SOURCE =
  "phase20-quality-workload/v1" as const;

export const PHASE20_QUALITY_ROOTS = Object.freeze([
  "workout",
  "calendar",
  "library",
  "progress",
] as const);

export type Phase20QualityRoot = typeof PHASE20_QUALITY_ROOTS[number];
export const PHASE20_QUALITY_SCENARIOS = Object.freeze({
  workout: Object.freeze({ fixture_id: "phase20-workout-active-r1", state_id: "workout-active-session" }),
  calendar: Object.freeze({ fixture_id: "phase20-calendar-month-r1", state_id: "calendar-month-agenda" }),
  library: Object.freeze({ fixture_id: "phase20-library-exercises-r1", state_id: "library-exercise-catalog" }),
  progress: Object.freeze({ fixture_id: "phase20-progress-overview-r1", state_id: "progress-overall-current" }),
} as const);
export type Phase20QualityAction = "accessibility" | "performance";
export type Phase20QualityMotionMode = "normal" | "reduced";

export const PHASE20_ACCESSIBILITY_OPERATIONS = Object.freeze(
  PHASE20_QUALITY_ROOTS.flatMap((root) => [
    `accessibility-${root}-normal`,
    `accessibility-${root}-reduced`,
  ] as const),
);

export const PHASE20_PERFORMANCE_OPERATIONS = Object.freeze([
  "launch-cold",
  "launch-warm",
  "root-switch-workout",
  "root-switch-calendar",
  "root-switch-library",
  "root-switch-progress",
  "committed-set-visible-dock",
  "ordinary-js-task",
  "numeric-edit",
  "rest-control",
  "search-after-debounce",
  "calendar-month-selection",
  "progress-useful-content",
  "progress-review-open",
  "progress-targeted-rebuild",
  "phase12-backup",
  "garmin-json-normalization",
] as const);

export type Phase20AccessibilityOperation =
  typeof PHASE20_ACCESSIBILITY_OPERATIONS[number];
export type Phase20PerformanceOperation =
  typeof PHASE20_PERFORMANCE_OPERATIONS[number];
export type Phase20QualityOperation =
  | Phase20AccessibilityOperation
  | Phase20PerformanceOperation;

export type Phase20QualityRequest = Readonly<{
  nonce: string;
  action: Phase20QualityAction;
  operation: Phase20QualityOperation;
  sequence: number;
}>;

export type Phase20QualityMarkerKind =
  | "start"
  | "commit"
  | "ready"
  | "result"
  | "chunk"
  | "callback"
  | "error";

export type Phase20QualityMarker = Readonly<{
  schema_version: 1;
  nonce: string;
  action: Phase20QualityAction;
  operation: Phase20QualityOperation;
  sequence: number;
  kind: Phase20QualityMarkerKind;
  source: typeof PHASE20_QUALITY_WORKLOAD_SOURCE;
  monotonic_ms: number;
  receipt_sha256: string;
  database_name: string;
  root: Phase20QualityRoot;
  fixture_id: string;
  state_id: string;
  configuration_id: string;
  sqlite_receipt_sha256?: string;
  readiness_sha256?: string;
  payload?: Readonly<Record<string, unknown>>;
}>;

const NONCE = /^[a-f0-9]{48}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const DATABASE_NAME = /^gym-tracker-phase20-quality-[a-f0-9]{48}-(workout|calendar|library|progress)\.db$/u;
const MAX_SEQUENCE = 10_000;

const accessibilityOperations = new Set<string>(
  PHASE20_ACCESSIBILITY_OPERATIONS,
);
const performanceOperations = new Set<string>(
  PHASE20_PERFORMANCE_OPERATIONS,
);

function scalar(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function resolvePhase20QualityRequest(
  params: Readonly<Record<string, unknown>>,
): Phase20QualityRequest | null {
  const nonce = scalar(params.nonce);
  const action = scalar(params.action);
  const operation = scalar(params.operation);
  const sequence = Number(scalar(params.sequence));
  if (
    nonce === undefined
    || !NONCE.test(nonce)
    || (action !== "accessibility" && action !== "performance")
    || operation === undefined
    || !Number.isSafeInteger(sequence)
    || sequence < 1
    || sequence > MAX_SEQUENCE
  ) {
    return null;
  }
  const allowed = action === "accessibility"
    ? accessibilityOperations
    : performanceOperations;
  if (!allowed.has(operation)) return null;
  return Object.freeze({
    nonce,
    action,
    operation: operation as Phase20QualityOperation,
    sequence,
  });
}

export function phase20QualityRootForOperation(operation: Phase20QualityOperation): Phase20QualityRoot {
  const match = /^(?:accessibility-|root-switch-)(workout|calendar|library|progress)(?:-|$)/u.exec(operation);
  if (match?.[1] !== undefined) return match[1] as Phase20QualityRoot;
  if (operation === "search-after-debounce") return "library";
  if (operation === "calendar-month-selection") return "calendar";
  if (operation.startsWith("progress-")) return "progress";
  return "workout";
}

export function phase20QualityScenarioForOperation(operation: Phase20QualityOperation) {
  const root = phase20QualityRootForOperation(operation);
  const scenario = PHASE20_QUALITY_SCENARIOS[root];
  const motion = operation.startsWith("accessibility-")
    ? operation.endsWith("-reduced") ? "reduced" : "normal"
    : "performance";
  return Object.freeze({ root, ...scenario, configuration_id: `quality-${root}-${motion}-f200` });
}

export function phase20QualityDatabaseName(nonce: string, root: Phase20QualityRoot): string {
  if (!NONCE.test(nonce) || !PHASE20_QUALITY_ROOTS.includes(root)) throw new Error("phase20_quality_nonce_invalid");
  return `${PHASE20_QUALITY_DATABASE_PREFIX}${nonce}-${root}.db`;
}

export function phase20OperationNeedsSqlite(
  _operation: Phase20QualityOperation,
): boolean {
  return true;
}

function exactKeys(
  value: Readonly<Record<string, unknown>>,
  allowed: readonly string[],
): boolean {
  const keys = Object.keys(value);
  return keys.length === allowed.length
    && keys.every((key) => allowed.includes(key));
}

function assertMarker(
  marker: Phase20QualityMarker,
  request: Phase20QualityRequest,
): void {
  const optional = [
    Object.hasOwn(marker, "sqlite_receipt_sha256") ? "sqlite_receipt_sha256" : null,
    Object.hasOwn(marker, "readiness_sha256") ? "readiness_sha256" : null,
    Object.hasOwn(marker, "payload") ? "payload" : null,
  ].filter((key): key is string => key !== null);
  if (!exactKeys(marker as unknown as Readonly<Record<string, unknown>>, [
    "schema_version",
    "nonce",
    "action",
    "operation",
    "sequence",
    "kind",
    "source",
    "monotonic_ms",
    "receipt_sha256",
    "database_name",
    "root",
    "fixture_id",
    "state_id",
    "configuration_id",
    ...optional,
  ])) throw new Error("phase20_quality_marker_schema_invalid");
  const scenario = phase20QualityScenarioForOperation(request.operation);
  if (
    marker.schema_version !== 1
    || marker.nonce !== request.nonce
    || marker.action !== request.action
    || marker.operation !== request.operation
    || marker.sequence !== request.sequence
    || marker.source !== PHASE20_QUALITY_WORKLOAD_SOURCE
    || marker.root !== scenario.root
    || marker.fixture_id !== scenario.fixture_id
    || marker.state_id !== scenario.state_id
    || marker.configuration_id !== scenario.configuration_id
    || marker.database_name !== phase20QualityDatabaseName(request.nonce, scenario.root)
  ) throw new Error("phase20_quality_marker_identity_mismatch");
  if (
    !Number.isFinite(marker.monotonic_ms)
    || marker.monotonic_ms < 0
    || !SHA256.test(marker.receipt_sha256)
    || !DATABASE_NAME.test(marker.database_name)
  ) throw new Error("phase20_quality_marker_value_invalid");
  if (
    phase20OperationNeedsSqlite(request.operation)
    && !SHA256.test(marker.sqlite_receipt_sha256 ?? "")
  ) throw new Error("phase20_quality_sqlite_receipt_missing");
  if (marker.kind === "ready" && !SHA256.test(marker.readiness_sha256 ?? "")) {
    throw new Error("phase20_quality_readiness_missing");
  }
  if (marker.payload?.executed_operation !== undefined
    && marker.payload.executed_operation !== marker.operation) {
    throw new Error("phase20_quality_marker_identity_mismatch");
  }
}

export function collectPhase20QualityMarkers(
  markers: readonly Phase20QualityMarker[],
  request: Phase20QualityRequest,
): Readonly<{
  request: Phase20QualityRequest;
  duration_ms: number;
  readiness_sha256: string;
}> {
  const seen = new Set<string>();
  let previous = -1;
  let start: Phase20QualityMarker | undefined;
  let commit: Phase20QualityMarker | undefined;
  let ready: Phase20QualityMarker | undefined;
  for (const marker of markers) {
    assertMarker(marker, request);
    const markerKey = marker.kind === "chunk"
      ? `${marker.kind}:${String(marker.payload?.chunk_sequence ?? "missing")}`
      : marker.kind === "callback"
        ? `${marker.kind}:${String(marker.payload?.callback_id ?? "missing")}:${String(marker.payload?.callback_count ?? "missing")}`
      : marker.kind;
    if (seen.has(markerKey)) throw new Error("phase20_quality_marker_duplicate");
    seen.add(markerKey);
    if (marker.monotonic_ms <= previous) {
      throw new Error("phase20_quality_marker_clock_invalid");
    }
    previous = marker.monotonic_ms;
    if (marker.kind === "start") start = marker;
    if (marker.kind === "commit") commit = marker;
    if (marker.kind === "ready") ready = marker;
  }
  if (start === undefined) throw new Error("phase20_quality_start_marker_missing");
  if (request.operation === "committed-set-visible-dock" && commit === undefined) {
    throw new Error("phase20_quality_commit_marker_missing");
  }
  if (ready === undefined) throw new Error("phase20_quality_ready_marker_missing");
  const endpointStart = request.operation === "committed-set-visible-dock"
    ? commit!.monotonic_ms
    : start.monotonic_ms;
  return Object.freeze({
    request,
    duration_ms: ready.monotonic_ms - endpointStart,
    readiness_sha256: ready.readiness_sha256!,
  });
}

export function validateDistinctRootReadiness(
  readiness: Readonly<Record<Phase20QualityRoot, string>>,
): true {
  const values = PHASE20_QUALITY_ROOTS.map((root) => readiness[root]);
  if (values.some((value) => !SHA256.test(value))
    || new Set(values).size !== PHASE20_QUALITY_ROOTS.length) {
    throw new Error("phase20_quality_root_readiness_not_distinct");
  }
  return true;
}
