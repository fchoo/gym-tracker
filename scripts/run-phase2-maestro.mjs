#!/usr/bin/env node

import {
  spawn,
} from "node:child_process";
import { createHash } from "node:crypto";
import {
  createReadStream,
  existsSync,
} from "node:fs";
import {
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import {
  sourceTreeSha256,
} from "./source-tree-digest.mjs";

const projectRoot = process.cwd();
const publicFlowDirectories = [
  "maestro/lifecycle",
  "maestro/phase2",
  "maestro/smoke",
];
const remediationLedgerPath =
  ".planning/phases/02-owned-library-and-planning/02-VALIDATION.md";
const remediationFlowPaths = [
  "maestro/phase2/remediation-inputs-cards-navigation.yaml",
  "maestro/phase2/remediation-rest-alerts.yaml",
  "maestro/phase2/remediation-workout.yaml",
];
const productionSourceDirectories = ["app", "src"];
const productionSourceExclusions = new Set([
  "app/__phase2-attended-preview.tsx",
]);

export const PHASE2_PUBLIC_FLOW_PATHS = Object.freeze([
  "maestro/lifecycle/rest-recovery.yaml",
  "maestro/phase2/custom-exercise-lifecycle.yaml",
  "maestro/phase2/custom-exercise-lifecycle2-copy.yaml",
  "maestro/phase2/custom-exercise-lifecycle2-edit-archive.yaml",
  "maestro/phase2/custom-exercise-lifecycle3-active-workout.yaml",
  "maestro/phase2/custom-exercise-lifecycle4-00-schedule-workout.yaml",
  "maestro/phase2/custom-exercise-lifecycle4-active-workout-block.yaml",
  "maestro/phase2/custom-exercise-lifecycle4-profile-migration.yaml",
  "maestro/phase2/library-exercises.yaml",
  "maestro/phase2/owned-plan-editor.yaml",
  "maestro/phase2/plan-impact-replacement.yaml",
  "maestro/phase2/remediation-inputs-cards-navigation.yaml",
  "maestro/phase2/remediation-rest-alerts.yaml",
  "maestro/phase2/remediation-workout.yaml",
  "maestro/phase2/schedule-cross-profile.yaml",
  "maestro/phase2/starter-activation.yaml",
  "maestro/smoke/phase1-airplane-repeat.yaml",
  "maestro/smoke/phase1-denied-late-notifications.yaml",
  "maestro/smoke/phase1-full-loop.yaml",
]);

export const PHASE2_REMEDIATION_FLOW_OBSERVATIONS = Object.freeze({
  "maestro/phase2/remediation-inputs-cards-navigation.yaml": Object.freeze([
    Object.freeze({
      case_id: "RC-02-CARDS",
      observation: "Library card-backed sections and favorite state are reachable; visual geometry remains attended.",
    }),
    Object.freeze({
      case_id: "RC-02-DATE-CALENDAR",
      observation: "Starter activation uses the Calendar dialog and explicit date confirmation.",
    }),
    Object.freeze({
      case_id: "RC-02-DURATION-NUMERIC",
      observation: "Duration minutes and seconds are edited through the semantic duration dialog.",
    }),
    Object.freeze({
      case_id: "RC-02-NAV-LEFT-RAIL",
      observation: "The same flow observes bottom navigation at 839dp and rail navigation at 840dp.",
    }),
    Object.freeze({
      case_id: "RC-02-TIME-OF-DAY-SCOPE",
      observation: "The installed input journey complements the source audit that reports no editable time-of-day field.",
    }),
  ]),
  "maestro/phase2/remediation-rest-alerts.yaml": Object.freeze([
    Object.freeze({
      case_id: "RC-02-ALERT-BG-DELIVERY-NONAUTH",
      observation: "A permission-granted request is scheduled once and cleaned up; physical delivery and SQLite non-authority remain separately owned.",
    }),
    Object.freeze({
      case_id: "RC-02-ALERT-FG-ATTEMPT-ONCE",
      observation: "A real running rest records at most one durable foreground feedback attempt.",
    }),
    Object.freeze({
      case_id: "RC-02-ALERT-PREFERENCES-CHANNEL-NONAUTH",
      observation: "Default, independently changed, and restart-persisted switch states are observed before a channel-bound scheduling probe.",
    }),
    Object.freeze({
      case_id: "RC-02-REST-DOCK",
      observation: "Collapsed and expanded states plus all four controls are visible and operable; exact spatial order remains host and attended evidence.",
    }),
  ]),
  "maestro/phase2/remediation-workout.yaml": Object.freeze([
    Object.freeze({
      case_id: "RC-02-ACTIVE-CORRECTION",
      observation: "An in-progress completed-set correction survives process restart with the corrected value.",
    }),
    Object.freeze({
      case_id: "RC-02-GLYPH-ACTION-GEOMETRY",
      observation: "Named glyph actions and status semantics are reachable; dimensions and alignment remain attended.",
    }),
    Object.freeze({
      case_id: "RC-02-LATEST-SCHEMA-ADD-COPY",
      observation: "Add warm-up, Copy warm-up, and Add working set each retain exactly one new ordinal after restart.",
    }),
    Object.freeze({
      case_id: "RC-02-RETRY-FOCUS",
      observation: "Each injected failure exposes its exact Retry path and reveals the committed row; keyboard focus remains attended.",
    }),
    Object.freeze({
      case_id: "RC-02-SET-STATUS",
      observation: "Completed set status is exposed through the installed row summary; mixed geometry remains attended.",
    }),
    Object.freeze({
      case_id: "RC-02-STICKY-IDENTITY",
      observation: "Current identity remains visible after set-content scrolling and after a non-mutating review round trip; layout extremes remain attended.",
    }),
    Object.freeze({
      case_id: "RC-02-TODAYS-PLAN",
      observation: "The populated overview keeps workout order and returns to the unchanged current exercise; other truth states remain host and attended evidence.",
    }),
    Object.freeze({
      case_id: "RC-02-WARMUP-EXCLUSION-COPY",
      observation: "Warm-up copy persists while the retired exclusion copy remains absent.",
    }),
  ]),
});

export const PHASE2_PROCEDURAL_REMEDIATION_CASE_IDS = Object.freeze([
  "RC-02-EXACT-HEAD-EVIDENCE",
  "RC-02-FINAL-COMMAND-ORDER",
  "RC-02-ROLE-SPLIT",
]);

const responsiveFlowViewports = Object.freeze({
  "maestro/phase2/remediation-inputs-cards-navigation.yaml": Object.freeze([
    Object.freeze({
      density_dpi: 160,
      expected_layout: "medium layout",
      expected_navigation: "Root navigation bottom",
      height_dp: 900,
      width_dp: 839,
    }),
    Object.freeze({
      density_dpi: 160,
      expected_layout: "expanded layout",
      expected_navigation: "Root navigation rail",
      height_dp: 900,
      width_dp: 840,
    }),
  ]),
});

function flowId(relativePath) {
  return relativePath
    .replace(/^maestro\//u, "")
    .replace(/\.yaml$/u, "")
    .replaceAll("/", "-");
}

function sortedUnique(label, values) {
  const sorted = [...values].sort();
  if (new Set(values).size !== values.length) {
    throw new Error(`${label} contains duplicate entries.`);
  }
  if (values.some((value, index) => value !== sorted[index])) {
    throw new Error(`${label} must be sorted.`);
  }
  return sorted;
}

export function validatePhase2PublicFlowPaths(actual, expected) {
  sortedUnique("Phase 2 public flow manifest", actual);
  sortedUnique("Phase 2 expected flow manifest", expected);
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  const missing = expected.filter((flow) => !actualSet.has(flow));
  const stale = actual.filter((flow) => !expectedSet.has(flow));
  if (missing.length > 0) {
    throw new Error(`Phase 2 public flow manifest is missing: ${missing.join(", ")}`);
  }
  if (stale.length > 0) {
    throw new Error(`Phase 2 public flow manifest is stale: ${stale.join(", ")}`);
  }
}

export async function collectPhase2RemediationCaseIds(root = projectRoot) {
  const source = await readFile(path.join(root, remediationLedgerPath), "utf8");
  const ledger = source.match(
    /<!-- phase2-ledger:v1 name=remediation-cases -->([\s\S]*?)### Decision and Gap Foreign-Key Map/u,
  )?.[1] ?? "";
  const ids = [...ledger.matchAll(/^\| (RC-02-[A-Z0-9-]+) \|/gmu)]
    .map((match) => match[1]);
  if (ids.length < 1) {
    throw new Error("Phase 2 remediation case ledger is missing.");
  }
  return sortedUnique("Phase 2 remediation case ledger", ids);
}

export function validatePhase2RemediationFlowObservations(
  remediationCaseIds,
  flowObservations = PHASE2_REMEDIATION_FLOW_OBSERVATIONS,
  proceduralExclusions = PHASE2_PROCEDURAL_REMEDIATION_CASE_IDS,
) {
  const flowPaths = Object.keys(flowObservations);
  if (
    flowPaths.length !== remediationFlowPaths.length
    || flowPaths.some((flow, index) => flow !== remediationFlowPaths[index])
  ) {
    throw new Error("Phase 2 remediation flow mapping is missing or stale.");
  }
  const mapped = [];
  for (const flow of flowPaths) {
    const observations = flowObservations[flow];
    if (!Array.isArray(observations) || observations.length < 1) {
      throw new Error(`Phase 2 remediation flow mapping is empty: ${flow}`);
    }
    const caseIds = observations.map((observation) => {
      if (
        observation === null
        || typeof observation !== "object"
        || Object.keys(observation).sort().join(",") !== "case_id,observation"
        || !/^RC-02-[A-Z0-9-]+$/u.test(observation.case_id)
        || typeof observation.observation !== "string"
        || observation.observation.trim().length < 20
      ) {
        throw new Error(`Phase 2 remediation flow observation is malformed: ${flow}`);
      }
      return observation.case_id;
    });
    sortedUnique(`Phase 2 remediation mapping for ${flow}`, caseIds);
    mapped.push(...caseIds);
  }
  if (new Set(mapped).size !== mapped.length) {
    throw new Error("Phase 2 remediation mapping contains duplicate case IDs.");
  }
  sortedUnique(
    "Phase 2 procedural remediation exclusions",
    proceduralExclusions,
  );
  if (
    proceduralExclusions.length
      !== PHASE2_PROCEDURAL_REMEDIATION_CASE_IDS.length
    || proceduralExclusions.some((id, index) =>
      id !== PHASE2_PROCEDURAL_REMEDIATION_CASE_IDS[index]
    )
  ) {
    throw new Error("Phase 2 procedural remediation exclusions are stale.");
  }
  const mappedSet = new Set(mapped);
  if (proceduralExclusions.some((id) => mappedSet.has(id))) {
    throw new Error("Phase 2 remediation mappings and exclusions intersect.");
  }
  const covered = [...mapped, ...proceduralExclusions].sort();
  const expected = sortedUnique(
    "Phase 2 remediation case source",
    remediationCaseIds,
  );
  const unknown = covered.filter((id) => !expected.includes(id));
  if (unknown.length > 0) {
    throw new Error(`Phase 2 remediation mapping has unknown or stale IDs: ${unknown.join(", ")}`);
  }
  if (
    covered.length !== expected.length
    || covered.some((id, index) => id !== expected[index])
  ) {
    throw new Error("Phase 2 remediation mapping is incomplete or omitted IDs.");
  }
}

async function productionTsxFiles(root) {
  const files = [];
  const visit = async (relativeDirectory) => {
    const entries = await readdir(path.join(root, relativeDirectory), {
      withFileTypes: true,
    });
    for (const entry of entries) {
      const relativePath = path.posix.join(relativeDirectory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "__tests__") {
          await visit(relativePath);
        }
      } else if (
        entry.isFile()
        && entry.name.endsWith(".tsx")
        && !entry.name.endsWith(".test.tsx")
        && !productionSourceExclusions.has(relativePath)
      ) {
        files.push(relativePath);
      }
    }
  };
  for (const relativeDirectory of productionSourceDirectories) {
    await visit(relativeDirectory);
  }
  return files.sort();
}

export async function collectPhase2InputSourceAudit(root = projectRoot) {
  const callsites = {
    CalendarField: [],
    SemanticNumberField: [],
    TimeDurationField: [],
  };
  const editableTimeOfDayFields = [];
  for (const relativePath of await productionTsxFiles(root)) {
    const lines = (await readFile(path.join(root, relativePath), "utf8"))
      .split(/\r?\n/u);
    for (const [index, line] of lines.entries()) {
      for (const component of Object.keys(callsites)) {
        if (new RegExp(`<${component}\\b`, "u").test(line)) {
          callsites[component].push(`${relativePath}:${index + 1}`);
        }
      }
      if (/<(?:TimeOfDayField|TimePicker|DateTimePicker)\b/u.test(line)) {
        editableTimeOfDayFields.push(`${relativePath}:${index + 1}`);
      }
    }
  }
  const result = {
    calendar_field_callsites: callsites.CalendarField.sort(),
    duration_field_callsites: callsites.TimeDurationField.sort(),
    numeric_field_callsites: callsites.SemanticNumberField.sort(),
    editable_time_of_day_fields: editableTimeOfDayFields.sort(),
  };
  for (const [key, values] of Object.entries(result)) {
    if (new Set(values).size !== values.length) {
      throw new Error(`Phase 2 input source audit contains duplicate ${key}.`);
    }
  }
  if (result.editable_time_of_day_fields.length > 0) {
    throw new Error(
      "Phase 2 editable time-of-day fields require an installed picker flow.",
    );
  }
  for (const key of [
    "calendar_field_callsites",
    "duration_field_callsites",
    "numeric_field_callsites",
  ]) {
    if (result[key].length < 1) {
      throw new Error(`Phase 2 input source audit is missing ${key}.`);
    }
  }
  return result;
}

export function derivePhase2MaestroExecutions(relativePaths) {
  const executions = relativePaths.flatMap((flow) => {
    const viewports = responsiveFlowViewports[flow];
    if (viewports === undefined) {
      return [{
        id: flowId(flow),
        flow,
        report: `maestro-${flowId(flow)}.xml`,
        airplane: flow === "maestro/smoke/phase1-airplane-repeat.yaml",
        remediation_case_observations:
          PHASE2_REMEDIATION_FLOW_OBSERVATIONS[flow] ?? [],
        viewport: null,
      }];
    }
    return viewports.map((viewport) => {
      const id = `${flowId(flow)}-${viewport.width_dp}dp`;
      return {
        id,
        flow,
        report: `maestro-${id}.xml`,
        airplane: false,
        remediation_case_observations:
          PHASE2_REMEDIATION_FLOW_OBSERVATIONS[flow],
        viewport,
      };
    });
  }).sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
  const ids = executions.map(({ id }) => id);
  if (new Set(ids).size !== ids.length) {
    throw new Error("Phase 2 Maestro derived ID collision.");
  }
  return executions;
}

export async function enumeratePhase2MaestroFlows(root = projectRoot) {
  const relativePaths = [];
  for (const relativeDirectory of publicFlowDirectories) {
    const directory = path.join(root, relativeDirectory);
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith(".yaml")) {
        relativePaths.push(path.posix.join(relativeDirectory, entry.name));
      }
    }
  }
  relativePaths.sort();
  if (
    relativePaths.length < 1
    || new Set(relativePaths).size !== relativePaths.length
  ) {
    throw new Error("Phase 2 Maestro flow manifest is empty or duplicated.");
  }
  validatePhase2PublicFlowPaths(relativePaths, PHASE2_PUBLIC_FLOW_PATHS);
  const remediationCaseIds = await collectPhase2RemediationCaseIds(root);
  validatePhase2RemediationFlowObservations(remediationCaseIds);
  for (const remediationFlow of remediationFlowPaths) {
    if (!relativePaths.includes(remediationFlow)) {
      throw new Error(`Phase 2 public flow manifest is missing: ${remediationFlow}`);
    }
  }
  return derivePhase2MaestroExecutions(relativePaths);
}

function command(name, commandArguments, options = {}) {
  const child = spawn(name, commandArguments, {
    cwd: projectRoot,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeout = options.timeoutMs === undefined
      ? undefined
      : setTimeout(() => {
          if (settled) {
            return;
          }
          settled = true;
          child.kill("SIGKILL");
          reject(new Error(
            `${name} timed out after ${options.timeoutMs} ms`,
          ));
        }, options.timeoutMs);
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
      options.onOutput?.(chunk.toString("utf8"));
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
      options.onOutput?.(chunk.toString("utf8"));
    });
    child.on("error", (error) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(error);
      }
    });
    child.on("close", (code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`${name} exited ${code}: ${stderr || stdout}`));
      }
    });
  });
}

async function sha256(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

function assertWellFormedXml(xml) {
  if (typeof xml !== "string" || xml.trim().length === 0) {
    throw new Error("Maestro JUnit report is missing or malformed.");
  }
  const stack = [];
  const elements = [];
  let cursor = 0;
  let rootCount = 0;
  const tokenPattern = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<!DOCTYPE(?:[^>]|\[[\s\S]*?\])*>|<\/?[A-Za-z_:][^<>]*>/gu;
  for (const match of xml.matchAll(tokenPattern)) {
    const token = match[0];
    const index = match.index ?? 0;
    const skipped = xml.slice(cursor, index);
    if (
      /[<>]/u.test(skipped)
      || skipped.trim().length > 0
    ) {
      throw new Error("Maestro JUnit report is missing or malformed.");
    }
    cursor = index + token.length;
    if (token.startsWith("<!DOCTYPE")) {
      throw new Error("Maestro JUnit DOCTYPE declarations are forbidden.");
    }
    if (/^<\?xml\b/iu.test(token) && (index !== 0 || rootCount !== 0)) {
      throw new Error("Maestro JUnit XML declaration is malformed.");
    }
    if (token.startsWith("<![CDATA[") && stack.length === 0) {
      throw new Error("Maestro JUnit CDATA must be inside the root element.");
    }
    if (token.startsWith("<?") || token.startsWith("<!")) {
      continue;
    }
    const closing = token.match(/^<\/([A-Za-z_:][\w:.-]*)\s*>$/u);
    if (closing !== null) {
      if (stack.pop()?.name !== closing[1]) {
        throw new Error("Maestro JUnit report is missing or malformed.");
      }
      continue;
    }
    const opening = token.match(/^<([A-Za-z_:][\w:.-]*)\b/u);
    if (opening === null) {
      throw new Error("Maestro JUnit report is missing or malformed.");
    }
    const element = {
      name: opening[1],
      parent: stack.at(-1)?.name ?? null,
      tag: token,
    };
    elements.push(element);
    if (stack.length === 0) {
      rootCount += 1;
    }
    if (!/\/\s*>$/u.test(token)) {
      stack.push(element);
    }
  }
  if (
    xml.slice(cursor).trim().length > 0
    || stack.length !== 0
    || rootCount !== 1
  ) {
    throw new Error("Maestro JUnit report is missing or malformed.");
  }
  return elements;
}

function parseXmlTagAttributes(tag, elementName) {
  const prefix = new RegExp(`^<${elementName}\\b`, "u");
  const source = tag
    .replace(prefix, "")
    .replace(/\/?\s*>$/u, "");
  const attributes = new Map();
  const token = /\s+([A-Za-z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/uy;
  let cursor = 0;

  while (cursor < source.length) {
    if (/^\s*$/u.test(source.slice(cursor))) {
      break;
    }
    token.lastIndex = cursor;
    const match = token.exec(source);
    if (match === null) {
      throw new Error(`Maestro JUnit ${elementName} attributes are malformed.`);
    }
    const name = match[1];
    if (attributes.has(name)) {
      throw new Error(`Maestro JUnit ${elementName} has duplicate ${name}.`);
    }
    attributes.set(name, match[2] ?? match[3] ?? "");
    cursor = token.lastIndex;
  }

  return attributes;
}

export function validatePhase2MaestroJunit(xml, expectedFlow) {
  const elements = assertWellFormedXml(xml);
  const root = elements.find(({ parent }) => parent === null);
  const allowedParents = new Map([
    ["testsuites", null],
    ["testsuite", "testsuites"],
    ["testcase", "testsuite"],
    ["failure", "testcase"],
    ["error", "testcase"],
    ["skipped", "testcase"],
    ["properties", "testcase"],
    ["property", "properties"],
  ]);
  if (root?.name !== "testsuites"
    || elements.some(({ name }) => !allowedParents.has(name))) {
    throw new Error("Maestro JUnit root must be testsuites.");
  }
  const suiteElements = elements.filter(({ name }) => name === "testsuite");
  const testcaseElements = elements.filter(({ name }) => name === "testcase");
  if (elements.some(({ name, parent }) => allowedParents.get(name) !== parent)) {
    throw new Error("Maestro JUnit element hierarchy is malformed.");
  }
  const suiteTags = suiteElements.map(({ tag }) => tag);
  const testcaseTags = testcaseElements.map(({ tag }) => tag);
  if (suiteTags.length < 1 || testcaseTags.length < 1) {
    throw new Error("Maestro JUnit report is missing or malformed.");
  }
  const summary = { errors: 0, failures: 0, skipped: 0, tests: 0 };
  for (const suiteTag of suiteTags) {
    const attributes = parseXmlTagAttributes(suiteTag, "testsuite");
    for (const key of Object.keys(summary)) {
      const rawValue = attributes.get(key);
      if (rawValue === undefined && (key === "tests" || key === "failures")) {
        throw new Error(`Maestro JUnit report is missing ${key}.`);
      }
      if (rawValue !== undefined && !/^\d+$/u.test(rawValue)) {
        throw new Error(`Maestro JUnit report has malformed ${key}.`);
      }
      summary[key] += Number(rawValue ?? 0);
    }
  }
  if (
    summary.tests < 1
    || summary.failures !== 0
    || summary.errors !== 0
    || summary.skipped !== 0
    || elements.some(({ name }) => ["failure", "error", "skipped"].includes(name))
  ) {
    throw new Error(`Maestro report did not pass: ${expectedFlow}`);
  }
  if (testcaseTags.length !== summary.tests) {
    throw new Error("Maestro JUnit testcase count is malformed.");
  }
  for (const testcaseTag of testcaseTags) {
    const attributes = parseXmlTagAttributes(testcaseTag, "testcase");
    const flow = attributes.get("file");
    const status = attributes.get("status");
    if (flow !== expectedFlow || status !== "SUCCESS") {
      throw new Error("Maestro JUnit flow identity drifted.");
    }
  }
  return summary;
}

export async function invalidatePhase2MaestroResult(resultPath) {
  await rm(resultPath, { force: true });
}

export async function loadPhase2MaestroRunInputs(manifestPath) {
  const artifactDirectory = path.dirname(manifestPath);
  const resultPath = path.join(artifactDirectory, "maestro.json");
  await invalidatePhase2MaestroResult(resultPath);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const apkPath = path.resolve(projectRoot, manifest.apk?.path ?? "");
  if (!existsSync(apkPath)) {
    throw new Error(`retained APK is missing: ${apkPath}`);
  }
  return { apkPath, artifactDirectory, manifest, resultPath };
}

function overrideValue(output, label, valuePattern) {
  const physical = output.match(
    new RegExp(`Physical ${label}: (${valuePattern})`, "u"),
  )?.[1];
  if (physical === undefined) {
    throw new Error(`Android window ${label} output is malformed.`);
  }
  return output.match(
    new RegExp(`Override ${label}: (${valuePattern})`, "u"),
  )?.[1] ?? null;
}

export function parsePhase2WindowMetrics(sizeOutput, densityOutput) {
  const density = overrideValue(densityOutput, "density", "[0-9]+");
  return {
    density: density === null ? null : Number(density),
    size: overrideValue(sizeOutput, "size", "[0-9]+x[0-9]+"),
  };
}

export async function readPhase2WindowMetrics(adb) {
  const [sizeOutput, densityOutput] = await Promise.all([
    adb("shell", "wm", "size"),
    adb("shell", "wm", "density"),
  ]);
  return parsePhase2WindowMetrics(sizeOutput, densityOutput);
}

export async function applyPhase2Viewport(adb, viewport) {
  await adb(
    "shell",
    "wm",
    "density",
    String(viewport.density_dpi),
  );
  await adb(
    "shell",
    "wm",
    "size",
    `${viewport.width_dp}x${viewport.height_dp}`,
  );
  const actual = await readPhase2WindowMetrics(adb);
  if (
    actual.density !== viewport.density_dpi
    || actual.size !== `${viewport.width_dp}x${viewport.height_dp}`
  ) {
    throw new Error("Android viewport override did not become exact.");
  }
}

export async function restorePhase2WindowMetrics(adb, original) {
  const errors = [];
  for (const [metric, value] of [
    ["size", original.size],
    ["density", original.density],
  ]) {
    try {
      await adb(
        "shell",
        "wm",
        metric,
        value === null ? "reset" : String(value),
      );
    } catch (error) {
      errors.push(`${metric}: ${error.message}`);
    }
  }
  try {
    const restored = await readPhase2WindowMetrics(adb);
    if (restored.size !== original.size || restored.density !== original.density) {
      errors.push("verification: restored metrics do not match the original overrides");
    }
  } catch (error) {
    errors.push(`verification: ${error.message}`);
  }
  if (errors.length > 0) {
    throw new Error(`Android window metrics restoration failed (${errors.join("; ")}).`);
  }
}

export function validatePhase2MaestroBuildIdentity({
  manifest,
  currentHead,
  currentSourceSha256,
  retainedApkSha256,
  retainedApkSize,
  installedApk,
}) {
  if (
    manifest?.schema_version !== 1
    || manifest.profile !== "development-test"
    || manifest.suite !== "phase2"
    || manifest.build_variant !== "release"
    || manifest.js_bundle?.embedded !== true
    || manifest.package !== "com.fchoo.gymtracker.devtest"
    || !manifest.device?.serial
    || manifest.apk?.page_alignment_kib !== 16
    || manifest.apk?.page_alignment_verified !== true
    || manifest.apk?.sha256 !== retainedApkSha256
    || manifest.apk?.size_bytes !== retainedApkSize
    || manifest.installed_apk?.sha256 !== manifest.apk.sha256
    || manifest.installed_apk?.matches_retained_apk !== true
    || currentHead !== manifest.base_head
    || currentSourceSha256 !== manifest.source_tree_sha256
    || installedApk?.sha256 !== manifest.apk.sha256
  ) {
    throw new Error(
      "Phase 2 Maestro APK/install identity drifted from the build manifest.",
    );
  }
}

function errorFromUnknown(error) {
  return error instanceof Error ? error : new Error(String(error));
}

function cleanupError(label, error) {
  const cause = errorFromUnknown(error);
  return new Error(`${label}: ${cause.message}`, { cause });
}

function throwPhase2MaestroFailures(primaryError, cleanupErrors) {
  if (primaryError === undefined && cleanupErrors.length === 0) {
    return;
  }
  if (primaryError !== undefined && cleanupErrors.length === 0) {
    throw primaryError;
  }
  const errors = primaryError === undefined
    ? cleanupErrors
    : [primaryError, ...cleanupErrors];
  throw new AggregateError(
    errors,
    `Phase 2 Maestro orchestration failed (${errors
      .map((error) => error.message)
      .join("; ")}).`,
    { cause: primaryError ?? cleanupErrors[0] },
  );
}

export async function runPhase2MaestroOrchestration({
  applyViewport,
  captureWindowMetrics,
  executeFlow,
  finalize,
  flows,
  prepareDevice,
  prepareRun,
  restoreWindowMetrics,
  setAirplaneMode,
}) {
  const cleanupErrors = [];
  const flowResults = [];
  let originalWindowMetrics;
  let viewportOverrideActive = false;
  let primaryError;
  let result;

  try {
    await prepareRun();
    originalWindowMetrics = await captureWindowMetrics();
    for (const flow of flows) {
      if (flow.viewport !== null) {
        await applyViewport(flow.viewport);
        viewportOverrideActive = true;
      } else if (viewportOverrideActive) {
        await restoreWindowMetrics(originalWindowMetrics);
        viewportOverrideActive = false;
      }
      await prepareDevice();
      if (flow.airplane) {
        await setAirplaneMode(true);
      }

      let flowError;
      let flowResult;
      try {
        flowResult = await executeFlow(flow);
      } catch (error) {
        flowError = errorFromUnknown(error);
      }
      if (flow.airplane) {
        try {
          await setAirplaneMode(false);
        } catch (error) {
          cleanupErrors.push(cleanupError(
            "flow airplane mode restoration",
            error,
          ));
        }
      }
      if (flowError !== undefined) {
        primaryError = flowError;
        break;
      }
      if (cleanupErrors.length > 0) {
        break;
      }
      flowResults.push(flowResult);
    }
    if (primaryError === undefined && cleanupErrors.length === 0) {
      result = await finalize(flowResults);
    }
  } catch (error) {
    primaryError = errorFromUnknown(error);
  }

  try {
    await setAirplaneMode(false);
  } catch (error) {
    cleanupErrors.push(cleanupError(
      "final airplane mode restoration",
      error,
    ));
  }
  if (originalWindowMetrics !== undefined) {
    try {
      await restoreWindowMetrics(originalWindowMetrics);
    } catch (error) {
      cleanupErrors.push(cleanupError(
        "window metrics restoration",
        error,
      ));
    }
  }

  throwPhase2MaestroFailures(primaryError, cleanupErrors);
  return result;
}

async function installedApkIdentity(adbExecutable, manifest) {
  const installedPath = (await command(
    adbExecutable,
    ["-s", manifest.device.serial, "shell", "pm", "path", manifest.package],
  )).split(/\r?\n/u)
    .find((line) => line.startsWith("package:"))
    ?.slice("package:".length);
  if (!installedPath) {
    throw new Error("installed package path is unavailable.");
  }
  const installedBytes = await new Promise((resolve, reject) => {
    const child = spawn(
      adbExecutable,
      [
        "-s",
        manifest.device.serial,
        "exec-out",
        "cat",
        installedPath,
      ],
      { cwd: projectRoot, stdio: ["ignore", "pipe", "pipe"] },
    );
    const chunks = [];
    let stderr = "";
    child.stdout.on("data", (chunk) => chunks.push(chunk));
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(chunks));
      } else {
        reject(new Error(`adb installed-byte read failed: ${stderr}`));
      }
    });
  });
  return {
    device_path: installedPath,
    sha256: createHash("sha256").update(installedBytes).digest("hex"),
  };
}

async function executeMain() {
  const args = process.argv.slice(2);
  let manifestArgument = "artifacts/native/phase2/build.json";
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--manifest") {
      manifestArgument = args[index + 1] ?? "";
      index += 1;
    } else if (argument.startsWith("--manifest=")) {
      manifestArgument = argument.slice("--manifest=".length);
    } else {
      throw new Error(`unknown argument: ${argument}`);
    }
  }
  if (!manifestArgument) {
    throw new Error("--manifest is required.");
  }

  const manifestPath = path.resolve(projectRoot, manifestArgument);
  const { apkPath, artifactDirectory, manifest, resultPath } =
    await loadPhase2MaestroRunInputs(manifestPath);
  const reports = await enumeratePhase2MaestroFlows(projectRoot);
  const androidHome = process.env.ANDROID_HOME
    ?? process.env.ANDROID_SDK_ROOT
    ?? "/opt/homebrew/share/android-commandlinetools";
  const adbExecutable = path.join(androidHome, "platform-tools", "adb");
  const adb = (...adbArguments) =>
    command(
      adbExecutable,
      ["-s", manifest.device.serial, ...adbArguments],
    );
  const setAirplaneMode = async (enabled) => {
    await adb(
      "shell",
      "cmd",
      "connectivity",
      "airplane-mode",
      enabled ? "enable" : "disable",
    );
    const state = await adb(
      "shell",
      "cmd",
      "connectivity",
      "airplane-mode",
    );
    if (state !== (enabled ? "enabled" : "disabled")) {
      throw new Error(
        `airplane mode did not become ${enabled ? "enabled" : "disabled"}.`,
      );
    }
  };
  const prepareDevice = async () => {
    await adb("shell", "input", "keyevent", "KEYCODE_WAKEUP");
    await adb("shell", "wm", "dismiss-keyguard");
    await adb("shell", "cmd", "statusbar", "collapse");
    const policy = await adb("shell", "dumpsys", "window", "policy");
    if (/showing=true/u.test(policy)) {
      throw new Error("device remained keyguard-locked.");
    }
  };

  await runPhase2MaestroOrchestration({
    flows: reports,
    prepareRun: async () => {
      const installedBefore = await installedApkIdentity(
        adbExecutable,
        manifest,
      );
      validatePhase2MaestroBuildIdentity({
        manifest,
        currentHead: await command("git", ["rev-parse", "HEAD"]),
        currentSourceSha256: sourceTreeSha256(projectRoot),
        retainedApkSha256: await sha256(apkPath),
        retainedApkSize: (await stat(apkPath)).size,
        installedApk: installedBefore,
      });
    },
    captureWindowMetrics: () => readPhase2WindowMetrics(adb),
    applyViewport: (viewport) => applyPhase2Viewport(adb, viewport),
    prepareDevice,
    setAirplaneMode,
    executeFlow: async (flow) => {
      const reportPath = path.join(artifactDirectory, flow.report);
      const environmentArguments = flow.viewport === null
        ? []
        : [
            "-e", `EXPECTED_LAYOUT=${flow.viewport.expected_layout}`,
            "-e", `EXPECTED_NAVIGATION=${flow.viewport.expected_navigation}`,
          ];
      await command(
        "maestro",
        [
          "test",
          "--no-ansi",
          "--format", "junit",
          "--output", reportPath,
          "--udid", manifest.device.serial,
          ...environmentArguments,
          flow.flow,
        ],
        {
          timeoutMs: 25 * 60_000,
          onOutput: (output) => process.stdout.write(output),
        },
      );
      const summary = validatePhase2MaestroJunit(
        await readFile(reportPath, "utf8"),
        flow.flow,
      );
      return {
        id: flow.id,
        flow: flow.flow,
        report: path.relative(projectRoot, reportPath),
        sha256: await sha256(reportPath),
        ...summary,
        airplane_mode: flow.airplane,
        remediation_case_observations: flow.remediation_case_observations,
        viewport: flow.viewport,
      };
    },
    finalize: async (flowResults) => {
      const installed = await installedApkIdentity(adbExecutable, manifest);
      validatePhase2MaestroBuildIdentity({
        manifest,
        currentHead: await command("git", ["rev-parse", "HEAD"]),
        currentSourceSha256: sourceTreeSha256(projectRoot),
        retainedApkSha256: await sha256(apkPath),
        retainedApkSize: (await stat(apkPath)).size,
        installedApk: installed,
      });
      const inputSourceAudit = await collectPhase2InputSourceAudit(projectRoot);
      const result = {
        schema_version: 1,
        suite: "phase2",
        status: installed.sha256 === manifest.apk.sha256 ? "passed" : "failed",
        build_manifest: path.relative(projectRoot, manifestPath),
        base_head: manifest.base_head,
        source_tree_sha256: manifest.source_tree_sha256,
        package: manifest.package,
        apk: manifest.apk,
        installed_apk: {
          ...installed,
          matches_retained_apk: installed.sha256 === manifest.apk.sha256,
        },
        device: manifest.device,
        flows: flowResults,
        input_source_audit: inputSourceAudit,
        procedural_remediation_case_exclusions:
          PHASE2_PROCEDURAL_REMEDIATION_CASE_IDS,
        recorded_at: new Date().toISOString(),
      };
      const temporaryResult = `${resultPath}.tmp`;
      await writeFile(temporaryResult, `${JSON.stringify(result, null, 2)}\n`);
      await rename(temporaryResult, resultPath);
      if (result.status !== "passed") {
        throw new Error(
          "installed APK bytes differ from retained Phase 2 APK.",
        );
      }
      console.log(JSON.stringify({
        ok: true,
        result: path.relative(projectRoot, resultPath),
        flows: flowResults.length,
        tests: flowResults.reduce((total, flow) => total + flow.tests, 0),
        apk_sha256: manifest.apk.sha256,
      }));
    },
    restoreWindowMetrics: (original) =>
      restorePhase2WindowMetrics(adb, original),
  });
}

const isMain = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  executeMain().catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      error: "phase2_maestro_failed",
      message: error.message,
    }));
    process.exitCode = 1;
  });
}
