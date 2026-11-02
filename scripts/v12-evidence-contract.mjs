import { createHash } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import path from "node:path";

const SHA256 = /^[a-f0-9]{64}$/u;
const DATE = /^\d{4}-\d{2}-\d{2}$/u;
const REQUIREMENT_PHASES = Object.freeze({
  DOM: 13,
  SHL: 14,
  WRK: 15,
  CAL: 16,
  LIB: 17,
  GAR: 18,
  PRO: 19,
  VER: 20,
});
const EXPECTED_PHASE_COUNTS = Object.freeze({
  "13": 17,
  "14": 13,
  "15": 36,
  "16": 23,
  "17": 36,
  "18": 16,
  "19": 18,
  "20": 13,
});

export const V12_VERDICTS = Object.freeze([
  "NOT_RUN", "PASS", "FAIL", "REVIEW_REQUIRED", "ACCEPTED_EXCEPTION", "N_A_REVIEWED",
]);
export const V12_REQUIRED_ARTIFACTS = Object.freeze([
  "run-manifest.json",
  "ui-state-matrix.json",
  "source-inputs.json",
  "device-settings.json",
]);
export const V12_NATIVE_STATE_PACKS = Object.freeze([
  "NS-SHELL", "NS-WORKOUT-ROOT", "NS-ACTIVE", "NS-READONLY-STRENGTH", "NS-CALENDAR",
  "NS-LIBRARY", "NS-RUNNING", "NS-GARMIN", "NS-PROGRESS", "NS-SETTINGS-RECOVERY",
]);

const APPEARANCES = ["L", "D", "SL", "SD"];
const SIZES = ["C360", "C390", "M600", "X840"];
const ORIENTATIONS = ["P", "L"];
const FONTS = ["F100", "F200"];
export const V12_CONFIG_IDS = Object.freeze(APPEARANCES.flatMap((appearance) =>
  SIZES.flatMap((size) => ORIENTATIONS.flatMap((orientation) =>
    FONTS.map((font) => `AP-${appearance}-${size}-${orientation}-${font}`),
  )),
));

function fail(code) {
  throw new Error(`v12_contract_${code}`);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function safeRelativePath(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 240
    && !path.isAbsolute(value) && !value.includes("\\")
    && value.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}

function readStructuredJson(root, relativePath) {
  if (!safeRelativePath(relativePath)) fail("unsafe_relative_path");
  const rootRealPath = path.resolve(root);
  const resolved = path.resolve(rootRealPath, relativePath);
  if (!resolved.startsWith(`${rootRealPath}${path.sep}`)) fail("unsafe_relative_path");
  const details = lstatSync(resolved, { throwIfNoEntry: false });
  if (details === undefined || !details.isFile() || details.isSymbolicLink()) fail("source_file_unsafe");
  const bytes = readFileSync(resolved);
  try {
    return Object.freeze({ value: JSON.parse(bytes.toString("utf8")), sha256: sha256(bytes), path: relativePath });
  } catch {
    fail("source_json_invalid");
  }
}

function readRequirements(root, relativePath) {
  if (!safeRelativePath(relativePath)) fail("unsafe_relative_path");
  const rootRealPath = path.resolve(root);
  const resolved = path.resolve(rootRealPath, relativePath);
  if (!resolved.startsWith(`${rootRealPath}${path.sep}`)) fail("unsafe_relative_path");
  const details = lstatSync(resolved, { throwIfNoEntry: false });
  if (details === undefined || !details.isFile() || details.isSymbolicLink()) fail("source_file_unsafe");
  const bytes = readFileSync(resolved);
  const requirementsByPhase = Object.fromEntries(Object.values(REQUIREMENT_PHASES).map((phase) => [phase, []]));
  for (const match of bytes.toString("utf8").matchAll(/^\s*- \[[ x]\] \*\*([A-Z]{3})-(\d{2})\*\*:/gmu)) {
    const phase = REQUIREMENT_PHASES[match[1]];
    if (phase !== undefined) requirementsByPhase[phase].push(`${match[1]}-${match[2]}`);
  }
  return Object.freeze({
    requirementsByPhase: Object.freeze(Object.fromEntries(Object.entries(requirementsByPhase).map(([phase, ids]) => [phase, Object.freeze(ids)]))),
    sha256: sha256(bytes),
    path: relativePath,
  });
}

function freezeCopy(value) {
  return Object.freeze(structuredClone(value));
}

function validateMatrix(matrix) {
  if (!isPlainObject(matrix) || !Array.isArray(matrix.rows)
    || !isPlainObject(matrix.counts) || !isPlainObject(matrix.counts.phase_requirements)) fail("matrix_invalid");
  if (JSON.stringify(matrix.counts.phase_requirements) !== JSON.stringify(EXPECTED_PHASE_COUNTS)) fail("matrix_counts_invalid");
}

function deriveBrowserStates(browserWalk) {
  if (!Array.isArray(browserWalk) || browserWalk.length !== 214) fail("browser_walk_invalid");
  const states = [];
  for (let index = 0; index < 107; index += 1) {
    const light = browserWalk[index];
    const dark = browserWalk[index + 107];
    if (!isPlainObject(light) || !isPlainObject(dark) || typeof light.name !== "string"
      || light.name.length === 0 || dark.name !== light.name || light.theme !== "light" || dark.theme !== "dark") {
      fail("browser_walk_invalid");
    }
    states.push(Object.freeze({ id: `BW-${String(states.length + 1).padStart(3, "0")}`, name: light.name }));
  }
  return Object.freeze(states);
}

function requirementsSet(requirementsByPhase) {
  const result = new Set();
  for (const [phase, ids] of Object.entries(requirementsByPhase)) {
    if (!Array.isArray(ids) || ids.length !== EXPECTED_PHASE_COUNTS[phase]) fail("requirement_set_drift");
    for (const id of ids) {
      if (!/^(DOM|SHL|WRK|CAL|LIB|GAR|PRO|VER)-\d{2}$/u.test(id) || result.has(id)) fail("requirement_set_drift");
      result.add(id);
    }
  }
  if (result.size !== 172) fail("requirement_set_drift");
  return result;
}

function validateException(entry) {
  if (!isPlainObject(entry) || typeof entry.deviation_id !== "string" || entry.deviation_id.length < 3
    || typeof entry.owner_decision !== "string" || entry.owner_decision.length < 3 || !DATE.test(entry.decided_at ?? "")
    || !Array.isArray(entry.configurations) || entry.configurations.length < 1
    || entry.configurations.some((id) => !V12_CONFIG_IDS.includes(id))
    || typeof entry.rationale !== "string" || entry.rationale.length < 3
    || !Array.isArray(entry.evidence_hashes) || entry.evidence_hashes.length < 1
    || entry.evidence_hashes.some((hash) => !SHA256.test(hash))) fail("exception_metadata_invalid");
}

function validateNa(entry) {
  if (!isPlainObject(entry) || typeof entry.reason !== "string" || entry.reason.length < 12
    || /(?:not captured|missing evidence|not run)/iu.test(entry.reason)
    || typeof entry.reviewer !== "string" || entry.reviewer.length < 2 || !DATE.test(entry.reviewed_at ?? "")) {
    fail("na_reason_invalid");
  }
}

function indexVerdicts(verdicts, rowIds) {
  if (!Array.isArray(verdicts)) fail("verdicts_invalid");
  const indexed = new Map();
  for (const verdict of verdicts) {
    if (!isPlainObject(verdict) || typeof verdict.row_id !== "string" || !rowIds.has(verdict.row_id)
      || !V12_VERDICTS.includes(verdict.verdict) || indexed.has(verdict.row_id)) fail("verdicts_invalid");
    if (verdict.verdict === "ACCEPTED_EXCEPTION") validateException(verdict);
    if (verdict.verdict === "N_A_REVIEWED") validateNa(verdict);
    indexed.set(verdict.row_id, verdict);
  }
  return indexed;
}

function indexObservations(observations, rowIds) {
  if (!Array.isArray(observations)) fail("observations_invalid");
  const indexed = new Map();
  for (const observation of observations) {
    if (!isPlainObject(observation) || typeof observation.row_id !== "string" || !rowIds.has(observation.row_id)
      || typeof observation.source !== "string" || observation.source.length < 1 || typeof observation.status !== "string") fail("observations_invalid");
    if (observation.source === "v1.1") continue;
    const list = indexed.get(observation.row_id) ?? [];
    list.push(Object.freeze({ source: observation.source, status: observation.status }));
    indexed.set(observation.row_id, list);
  }
  return indexed;
}

export function loadV12ContractInputs({
  root = process.cwd(),
  matrixPath = ".planning/design/v1.2-prototype-parity-matrix.json",
  browserWalkPath = ".planning/design/v1.2-browser-evidence/serial-walk.json",
  sourceManifestPath = ".planning/design/v1.2-browser-evidence/source-manifest.json",
  requirementsPath = ".planning/REQUIREMENTS.md",
} = {}) {
  const matrix = readStructuredJson(root, matrixPath);
  const browserWalk = readStructuredJson(root, browserWalkPath);
  const sourceManifest = readStructuredJson(root, sourceManifestPath);
  const requirements = readRequirements(root, requirementsPath);
  validateMatrix(matrix.value);
  if (!isPlainObject(sourceManifest.value) || !Array.isArray(sourceManifest.value.sources) || sourceManifest.value.sources.length < 1) fail("source_manifest_invalid");
  return {
    matrix: freezeCopy(matrix.value),
    browserWalk: freezeCopy(browserWalk.value),
    sourceManifest: freezeCopy(sourceManifest.value),
    requirementsByPhase: freezeCopy(requirements.requirementsByPhase),
    source_hashes: Object.freeze({ matrix: matrix.sha256, browser_walk: browserWalk.sha256, source_manifest: sourceManifest.sha256, requirements: requirements.sha256 }),
  };
}

export const V12_BROWSER_WALK_STATE_IDS = Object.freeze(Array.from({ length: 107 }, (_, index) => `BW-${String(index + 1).padStart(3, "0")}`));

export function deriveV12Ledger(inputs, { observations = [], verdicts = [] } = {}) {
  if (!isPlainObject(inputs)) fail("inputs_invalid");
  validateMatrix(inputs.matrix);
  const requiredIds = requirementsSet(inputs.requirementsByPhase);
  const browserStates = deriveBrowserStates(inputs.browserWalk);
  const seenInventory = new Set();
  const seenRequirement = new Set();
  const rows = inputs.matrix.rows.map((sourceRow) => {
    if (!isPlainObject(sourceRow) || typeof sourceRow.inventory_id !== "string" || typeof sourceRow.requirement_id !== "string"
      || !Number.isSafeInteger(sourceRow.owning_phase) || seenInventory.has(sourceRow.inventory_id)
      || seenRequirement.has(sourceRow.requirement_id)) fail("duplicate_requirement_or_inventory");
    if (!requiredIds.has(sourceRow.requirement_id)) fail("requirement_set_drift");
    const expectedPhase = REQUIREMENT_PHASES[sourceRow.requirement_id.slice(0, 3)];
    if (sourceRow.owning_phase !== expectedPhase) fail("requirement_set_drift");
    seenInventory.add(sourceRow.inventory_id);
    seenRequirement.add(sourceRow.requirement_id);
    return sourceRow;
  });
  if (rows.length !== 172 || seenInventory.size !== 172 || seenRequirement.size !== 172 || seenRequirement.size !== requiredIds.size) fail("requirement_set_drift");
  const rowIds = new Set(rows.map((row) => row.requirement_id));
  const verdictIndex = indexVerdicts(verdicts, rowIds);
  const observationIndex = indexObservations(observations, rowIds);
  const ledgerRows = rows.map((sourceRow) => {
    const verdict = verdictIndex.get(sourceRow.requirement_id);
    return Object.freeze({
      inventory_id: sourceRow.inventory_id,
      requirement_id: sourceRow.requirement_id,
      owning_phase: sourceRow.owning_phase,
      coverage_class: sourceRow.coverage_class,
      verdict: verdict?.verdict ?? "NOT_RUN",
      observations: Object.freeze(observationIndex.get(sourceRow.requirement_id) ?? []),
    });
  });
  const verdictCounts = Object.fromEntries(V12_VERDICTS.map((verdict) => [verdict, ledgerRows.filter((row) => row.verdict === verdict).length]));
  const phaseCounts = Object.fromEntries(Object.keys(EXPECTED_PHASE_COUNTS).map((phase) => [phase, ledgerRows.filter((row) => String(row.owning_phase) === phase).length]));
  if (JSON.stringify(phaseCounts) !== JSON.stringify(EXPECTED_PHASE_COUNTS)) fail("requirement_set_drift");
  return Object.freeze({
    schema_version: 1,
    source_hashes: inputs.source_hashes,
    rows: Object.freeze(ledgerRows),
    phase_counts: Object.freeze(phaseCounts),
    browser_states: browserStates,
    static_configurations: V12_CONFIG_IDS,
    verdict_counts: Object.freeze(verdictCounts),
    settled_baselines: Object.freeze(["MAP-01", "TIM-01", "DEV-01", "DEV-02", "GARMIN_TRANSPORT"]),
  });
}
