#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import {
  SHA256_PATTERN,
  phase5CandidateIdentity,
  sha256File,
  validatePhase5DeviceIdentity,
} from "./phase5-candidate-evidence.mjs";
import {
  loadPhase6Candidate,
  resolveAdb,
} from "./run-phase6-maestro.mjs";

const PACKAGE = "com.fchoo.gymtracker";
const SERIAL = /^[A-Za-z0-9._:-]+$/u;
const SAFE_RELATIVE_FILE = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,239}$/u;
const REQUIRED_OPTIONS = new Map([
  ["--bundle-dir", "bundleDirectory"],
  ["--manifest-sha256", "expectedManifestSha256"],
  ["--package", "packageName"],
  ["--serial", "serial"],
  ["--output", "output"],
  ["--report-dir", "reportDirectory"],
]);
const FORBIDDEN_EVIDENCE_KEYS = new Set([
  "approval", "owner_approval", "promotion", "publication",
  "public_release", "release_authorization", "terminal_seal",
  "tag", "serial", "raw_path", "private_path", "raw_rows",
  "private_rows",
]);

export const PHASE7_MAESTRO_FLOW_CONTRACTS = Object.freeze([
  Object.freeze({
    id: "phase7-today-settings",
    flow: "maestro/phase7/today-settings.yaml",
    considerations: Object.freeze([
      "UX-11", "UX-12", "UX-13", "UX-14",
      "UI-E01", "UI-E02", "UI-E04", "UI-E05", "UI-E06", "UI-E08",
    ]),
    native_backstops: Object.freeze(["UI-B01", "UI-B03", "UI-B05"]),
    screenshots: Object.freeze([
      "phase7-today-selected-navigation.png",
      "phase7-settings-root.png",
      "phase7-settings-history-data.png",
    ]),
  }),
  Object.freeze({
    id: "phase7-workout-removal-audio",
    flow: "maestro/phase7/workout-removal-audio.yaml",
    considerations: Object.freeze([
      "UX-15", "UX-16", "UX-17", "UX-18", "UX-19", "UX-21",
      "UI-E01", "UI-E02", "UI-E03", "UI-E04", "UI-E05", "UI-E06",
      "UI-E07", "UI-E08",
    ]),
    native_backstops: Object.freeze(["UI-B01", "UI-B02", "UI-B03"]),
    screenshots: Object.freeze([
      "phase7-workout-set-row.png",
      "phase7-workout-remove-confirmation.png",
      "phase7-workout-audio-settings.png",
    ]),
  }),
  Object.freeze({
    id: "phase7-plan-schedule-reorder",
    flow: "maestro/phase7/plan-schedule-reorder.yaml",
    considerations: Object.freeze([
      "UX-20", "UI-E02", "UI-E04", "UI-E05", "UI-E06", "UI-E07", "UI-E08",
    ]),
    native_backstops: Object.freeze(["UI-B01", "UI-B03", "UI-B05"]),
    screenshots: Object.freeze([
      "phase7-plan-selected-day.png",
      "phase7-plan-day-reorder.png",
      "phase7-plan-exercise-reorder.png",
      "phase7-weekday-schedule-reorder.png",
      "phase7-rotation-schedule-reorder.png",
    ]),
  }),
  Object.freeze({
    id: "phase7-icon-navigation-accessibility",
    flow: "maestro/phase7/icon-navigation-accessibility.yaml",
    considerations: Object.freeze([
      "UX-11", "UX-13", "UX-14", "UX-22",
      "UI-E02", "UI-E04", "UI-E06", "UI-E08",
    ]),
    native_backstops: Object.freeze(["UI-B03", "UI-B04", "UI-B05"]),
    screenshots: Object.freeze([
      "phase7-navigation-200pct.png",
      "phase7-settings-200pct.png",
    ]),
  }),
]);

export const PHASE7_CONSIDERATION_CONTRACTS = Object.freeze([
  Object.freeze({ id: "UX-11", owner: "07-01 navigation semantics", automated_checks: Object.freeze(["app/(tabs)/__tests__/_layout.test.tsx" ]), flows: Object.freeze(["phase7-today-settings", "phase7-icon-navigation-accessibility"]), native_backstops: Object.freeze(["UI-B03", "UI-B05"]) }),
  Object.freeze({ id: "UX-12", owner: "07-01 Today actions", automated_checks: Object.freeze(["src/ui/__tests__/TodayScreen.test.tsx" ]), flows: Object.freeze(["phase7-today-settings"]), native_backstops: Object.freeze([]) }),
  Object.freeze({ id: "UX-13", owner: "07-01 Settings route", automated_checks: Object.freeze(["src/ui/__tests__/TodayScreen.test.tsx", "app/(tabs)/__tests__/_layout.test.tsx"]), flows: Object.freeze(["phase7-today-settings", "phase7-icon-navigation-accessibility"]), native_backstops: Object.freeze(["UI-B05"]) }),
  Object.freeze({ id: "UX-14", owner: "07-01 Settings ordering", automated_checks: Object.freeze(["src/ui/__tests__/SettingsScreen.test.tsx" ]), flows: Object.freeze(["phase7-today-settings", "phase7-icon-navigation-accessibility"]), native_backstops: Object.freeze(["UI-B03"]) }),
  Object.freeze({ id: "UX-15", owner: "07-02 workout surface", automated_checks: Object.freeze(["src/ui/__tests__/ActiveWorkoutScreen.test.tsx" ]), flows: Object.freeze(["phase7-workout-removal-audio"]), native_backstops: Object.freeze([]) }),
  Object.freeze({ id: "UX-16", owner: "07-02 compact SetRow", automated_checks: Object.freeze(["src/ui/__tests__/SetRow.test.tsx" ]), flows: Object.freeze(["phase7-workout-removal-audio"]), native_backstops: Object.freeze(["UI-B03"]) }),
  Object.freeze({ id: "UX-17", owner: "07-02 add values", automated_checks: Object.freeze(["src/ui/__tests__/ActiveWorkoutScreen.test.tsx" ]), flows: Object.freeze(["phase7-workout-removal-audio"]), native_backstops: Object.freeze([]) }),
  Object.freeze({ id: "UX-18", owner: "07-02 authoritative removal", automated_checks: Object.freeze(["src/domains/workout/setCommands.test.ts", "src/bootstrap/workoutAppRuntime.test.tsx"]), flows: Object.freeze(["phase7-workout-removal-audio"]), native_backstops: Object.freeze(["UI-B01"]) }),
  Object.freeze({ id: "UX-19", owner: "07-02 retained More actions", automated_checks: Object.freeze(["src/ui/__tests__/ActiveWorkoutScreen.test.tsx" ]), flows: Object.freeze(["phase7-workout-removal-audio"]), native_backstops: Object.freeze([]) }),
  Object.freeze({ id: "UX-20", owner: "07-03 reorder parity", automated_checks: Object.freeze(["src/ui/__tests__/OwnedPlanEditor.test.tsx", "src/ui/__tests__/ScheduleEditor.test.tsx" ]), flows: Object.freeze(["phase7-plan-schedule-reorder"]), native_backstops: Object.freeze(["UI-B01", "UI-B05"]) }),
  Object.freeze({ id: "UX-21", owner: "07-04 countdown cue port", automated_checks: Object.freeze(["src/ui/__tests__/RestDock.test.tsx", "src/platform/audio/expoRestCountdownCueAdapter.test.ts"]), flows: Object.freeze(["phase7-workout-removal-audio"]), native_backstops: Object.freeze(["UI-B02"]) }),
  Object.freeze({ id: "UX-22", owner: "07-05 app icon assets", automated_checks: Object.freeze(["scripts/concept-g-image-contract.test.mjs", "scripts/check-cng-reproducible.sh" ]), flows: Object.freeze(["phase7-icon-navigation-accessibility"]), native_backstops: Object.freeze(["UI-B04"]) }),
  Object.freeze({ id: "UI-E01", owner: "07-02 set collections", automated_checks: Object.freeze(["src/ui/__tests__/SetRow.test.tsx" ]), flows: Object.freeze(["phase7-today-settings", "phase7-workout-removal-audio"]), native_backstops: Object.freeze([]) }),
  Object.freeze({ id: "UI-E02", owner: "07-01 through 07-05 command surfaces", automated_checks: Object.freeze(["src/ui/__tests__/SettingsScreen.test.tsx", "src/ui/__tests__/ActiveWorkoutScreen.test.tsx" ]), flows: Object.freeze(["phase7-today-settings", "phase7-workout-removal-audio", "phase7-plan-schedule-reorder", "phase7-icon-navigation-accessibility"]), native_backstops: Object.freeze(["UI-B01"]) }),
  Object.freeze({ id: "UI-E03", owner: "07-04 audio failure", automated_checks: Object.freeze(["src/ui/__tests__/RestDock.test.tsx", "src/platform/audio/expoRestCountdownCueAdapter.test.ts"]), flows: Object.freeze(["phase7-workout-removal-audio"]), native_backstops: Object.freeze(["UI-B02"]) }),
  Object.freeze({ id: "UI-E04", owner: "07-01 to 07-05 populated surfaces", automated_checks: Object.freeze(["src/ui/__tests__/SettingsScreen.test.tsx", "src/ui/__tests__/OwnedPlanEditor.test.tsx" ]), flows: Object.freeze(["phase7-today-settings", "phase7-workout-removal-audio", "phase7-plan-schedule-reorder", "phase7-icon-navigation-accessibility"]), native_backstops: Object.freeze(["UI-B04"]) }),
  Object.freeze({ id: "UI-E05", owner: "07-02 and 07-03 partial rows", automated_checks: Object.freeze(["src/ui/__tests__/SetRow.test.tsx", "src/ui/__tests__/OwnedPlanEditor.test.tsx" ]), flows: Object.freeze(["phase7-today-settings", "phase7-workout-removal-audio", "phase7-plan-schedule-reorder"]), native_backstops: Object.freeze([]) }),
  Object.freeze({ id: "UI-E06", owner: "07-01 through 07-05 responsive surfaces", automated_checks: Object.freeze(["src/ui/__tests__/foundation.test.tsx" ]), flows: Object.freeze(["phase7-today-settings", "phase7-workout-removal-audio", "phase7-plan-schedule-reorder", "phase7-icon-navigation-accessibility"]), native_backstops: Object.freeze(["UI-B03"]) }),
  Object.freeze({ id: "UI-E07", owner: "07-02 and 07-03 cardinality", automated_checks: Object.freeze(["src/ui/__tests__/SetRow.test.tsx", "src/ui/__tests__/ScheduleEditor.test.tsx" ]), flows: Object.freeze(["phase7-workout-removal-audio", "phase7-plan-schedule-reorder"]), native_backstops: Object.freeze([]) }),
  Object.freeze({ id: "UI-E08", owner: "07-01 through 07-05 long text", automated_checks: Object.freeze(["src/ui/__tests__/SettingsScreen.test.tsx", "src/ui/__tests__/SetRow.test.tsx" ]), flows: Object.freeze(["phase7-today-settings", "phase7-workout-removal-audio", "phase7-plan-schedule-reorder", "phase7-icon-navigation-accessibility"]), native_backstops: Object.freeze(["UI-B03"]) }),
  Object.freeze({ id: "UI-B01", owner: "07-09 exact-candidate evidence", automated_checks: Object.freeze(["scripts/phase7-evidence-scripts.test.mjs" ]), flows: Object.freeze(["phase7-today-settings", "phase7-workout-removal-audio", "phase7-plan-schedule-reorder"]), native_backstops: Object.freeze(["N4"]) }),
  Object.freeze({ id: "UI-B02", owner: "07-10 physical audio evidence", automated_checks: Object.freeze(["src/ui/__tests__/RestDock.test.tsx", "src/platform/audio/expoRestCountdownCueAdapter.test.ts"]), flows: Object.freeze(["phase7-workout-removal-audio"]), native_backstops: Object.freeze(["N4"]) }),
  Object.freeze({ id: "UI-B03", owner: "07-10 native 200 percent evidence", automated_checks: Object.freeze(["scripts/phase7-evidence-scripts.test.mjs" ]), flows: Object.freeze(["phase7-today-settings", "phase7-workout-removal-audio", "phase7-plan-schedule-reorder", "phase7-icon-navigation-accessibility"]), native_backstops: Object.freeze(["N4"]) }),
  Object.freeze({ id: "UI-B04", owner: "07-10 attended-only launcher evidence", automated_checks: Object.freeze(["scripts/concept-g-image-contract.test.mjs", "scripts/check-cng-reproducible.sh" ]), flows: Object.freeze([]), native_backstops: Object.freeze(["N4"]) }),
  Object.freeze({ id: "UI-B05", owner: "07-10 assistive reorder evidence", automated_checks: Object.freeze(["src/ui/__tests__/OwnedPlanEditor.test.tsx" ]), flows: Object.freeze(["phase7-today-settings", "phase7-plan-schedule-reorder", "phase7-icon-navigation-accessibility"]), native_backstops: Object.freeze(["N4"]) }),
]);

export const PHASE7_NATIVE_BACKSTOPS = Object.freeze([
  Object.freeze({ id: "N4", status: "pending_human", description: "Samsung exact-byte aggregated observation-only Phase 7 review.", flow_ids: Object.freeze([]) }),
]);

function fail(message) {
  throw new Error(`Phase 7 Maestro: ${message}`);
}

function exactJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function canonicalDirectory(directory, label) {
  const details = lstatSync(directory, { throwIfNoEntry: false });
  if (!details?.isDirectory() || details.isSymbolicLink() || realpathSync(directory) !== path.resolve(directory)) {
    fail(`${label} is missing or unsafe.`);
  }
  return path.resolve(directory);
}

function requireFreshPathInsideBundle(bundleDirectory, filePath, label) {
  const target = path.resolve(filePath);
  const parent = path.dirname(target);
  if (!isInside(bundleDirectory, target) || lstatSync(target, { throwIfNoEntry: false }) !== undefined) {
    fail(`${label} must be a fresh path inside the retained candidate bundle.`);
  }
  const parentDetails = lstatSync(parent, { throwIfNoEntry: false });
  if (!parentDetails?.isDirectory() || parentDetails.isSymbolicLink() || realpathSync(parent) !== parent) {
    fail(`${label} parent is unsafe.`);
  }
  return target;
}

function safeRelativeFile(value, label) {
  if (typeof value !== "string" || !SAFE_RELATIVE_FILE.test(value) || value.startsWith("/")
    || value.includes("\\") || value.split("/").some((part) => part === "." || part === ".." || part.length === 0)) {
    fail(`${label} is malformed.`);
  }
  return value;
}

function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function containsForbiddenEvidenceKey(value) {
  if (Array.isArray(value)) return value.some(containsForbiddenEvidenceKey);
  if (value === null || typeof value !== "object") return false;
  return Object.entries(value).some(([key, nested]) =>
    FORBIDDEN_EVIDENCE_KEYS.has(key) || containsForbiddenEvidenceKey(nested));
}

function parsePassingJunit(bytes, flowId) {
  const text = Buffer.from(bytes ?? []).toString("utf8");
  if (!/<testsuites?\b/u.test(text) || !/<testcase\b/u.test(text) || /<(?:failure|error|skipped)\b/u.test(text)) {
    fail(`Maestro did not produce a passing JUnit report: ${flowId}`);
  }
  return Object.freeze({ tests: [...text.matchAll(/<testcase\b/gu)].length, failures: 0, errors: 0, skipped: 0 });
}

function screenshotFiles(root) {
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const candidate = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...screenshotFiles(candidate));
    else if (entry.isFile() && /\.png$/iu.test(entry.name) && statSync(candidate).size > 0) files.push(candidate);
  }
  return files;
}

export function exactPhase7ScreenshotEvidence(reportRoot, expectedFiles, flowId, excludedDirectories = []) {
  const excluded = new Set(excludedDirectories.map((directory) => path.resolve(reportRoot, directory)));
  const actual = screenshotFiles(reportRoot).filter((file) =>
    ![...excluded].some((directory) => isInside(directory, file))
  ).map((file) => Object.freeze({
    file: safeRelativeFile(path.basename(file), "screenshot file"),
    sha256: sha256File(file),
  })).sort((left, right) => left.file.localeCompare(right.file));
  const expected = [...expectedFiles].sort((left, right) => left.localeCompare(right));
  if (!exactJson(actual.map(({ file }) => file), expected)) {
    fail(`required screenshots are missing or renamed for ${flowId}.`);
  }
  return Object.freeze(actual);
}

export function parsePhase7MaestroArguments(args = process.argv.slice(2)) {
  const options = {};
  if (args.length !== REQUIRED_OPTIONS.size * 2) fail("arguments are malformed.");
  for (let index = 0; index < args.length; index += 2) {
    const field = REQUIRED_OPTIONS.get(args[index]);
    const value = args[index + 1];
    if (field === undefined || options[field] !== undefined || typeof value !== "string" || value.length === 0 || value.startsWith("--")) fail("arguments are malformed.");
    options[field] = value;
  }
  if (!SHA256_PATTERN.test(options.expectedManifestSha256) || options.packageName !== PACKAGE || !SERIAL.test(options.serial)) {
    fail("candidate package, manifest, or serial identity is malformed.");
  }
  return Object.freeze(options);
}

export function loadPhase7Candidate(options) {
  const candidate = loadPhase6Candidate(options);
  if (candidate.manifest.source.package !== PACKAGE || candidate.manifest.build.profile !== "production" || candidate.manifest_sha256 !== options.expectedManifestSha256) {
    fail("candidate identity is not the exact production replacement.");
  }
  if (!existsSync(candidate.apkPath) || sha256File(candidate.apkPath) !== candidate.apk.sha256) {
    fail("candidate APK bytes do not match the immutable manifest.");
  }
  return candidate;
}

function adb(adbPath, serial, ...argumentsList) {
  return execFileSync(adbPath, ["-s", serial, ...argumentsList], { encoding: "utf8" }).trim();
}

function hierarchyAttribute(node, name) {
  return new RegExp(`${name}=\"([^\"]*)\"`, "u").exec(node)?.[1] ?? null;
}

function matchesId(value, pattern) {
  return value !== null && new RegExp(
    pattern.source,
    pattern.flags.replace(/[gy]/gu, ""),
  ).test(value);
}

function reorderDescriptionMatches(description, label) {
  return description === `Reorder ${label}`
    || description === `Drag ${label}`
    || description?.startsWith(`Drag ${label}. Position `) === true;
}

function phase7ReorderCoordinate(hierarchy, { idPattern, label }) {
  const nodes = [...String(hierarchy).matchAll(/<node\b[^>]*>/gu)].map(([node]) => node);
  if (!(idPattern instanceof RegExp) || typeof label !== "string" || label.length === 0) {
    fail("drag hierarchy selector is invalid.");
  }
  const matching = nodes.filter((candidate) =>
    matchesId(hierarchyAttribute(candidate, "resource-id"), idPattern)
    && reorderDescriptionMatches(
      hierarchyAttribute(candidate, "content-desc"),
      label,
    ));
  if (matching.length !== 1) fail(`drag hierarchy must contain exactly one ${label} handle.`);
  const bounds = /^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/u.exec(
    hierarchyAttribute(matching[0], "bounds") ?? "",
  );
  if (bounds === null) fail(`drag hierarchy bounds are invalid for ${label}.`);
  const [left, top, right, bottom] = bounds.slice(1).map(Number);
  if (right <= left || bottom <= top) fail(`drag hierarchy bounds are invalid for ${label}.`);
  return Object.freeze({ x: Math.round((left + right) / 2), y: Math.round((top + bottom) / 2) });
}

export function phase7ReorderCoordinates(hierarchy, { source, target }) {
  const sourceCoordinate = phase7ReorderCoordinate(hierarchy, source);
  const targetCoordinate = phase7ReorderCoordinate(hierarchy, target);
  return Object.freeze({
    startX: sourceCoordinate.x,
    startY: sourceCoordinate.y,
    endX: targetCoordinate.x,
    endY: targetCoordinate.y,
  });
}

export function phase7ReorderOrderIs(hierarchy, { first, second }) {
  const firstCoordinate = phase7ReorderCoordinate(hierarchy, first);
  const secondCoordinate = phase7ReorderCoordinate(hierarchy, second);
  return firstCoordinate.y < secondCoordinate.y;
}

export function phase7PlanReorderCoordinates(hierarchy, { sourceLabel = "Bench Press", targetLabel = "Back Squat" } = {}) {
  return phase7ReorderCoordinates(hierarchy, {
    source: { idPattern: new RegExp(`^drag-exercise-${sourceLabel}$`, "u"), label: sourceLabel },
    target: { idPattern: new RegExp(`^drag-exercise-${targetLabel}$`, "u"), label: targetLabel },
  });
}

export function phase7NativeHeldDragCommands({ startX, startY, endX, endY }) {
  const coordinates = [startX, startY, endX, endY];
  if (!coordinates.every((value) => Number.isSafeInteger(value) && value >= 0)) fail("native drag coordinates are invalid.");
  return Object.freeze({
    down: Object.freeze(["shell", "input", "touchscreen", "motionevent", "DOWN", String(startX), String(startY)]),
    up: Object.freeze(["shell", "input", "touchscreen", "motionevent", "UP", String(endX), String(endY)]),
  });
}

export function phase7NativeDragMoveSequence({ startX, startY, endX, endY }, steps = 12) {
  if (!Number.isSafeInteger(steps) || steps < 1) fail("native drag step count is invalid.");
  phase7NativeHeldDragCommands({ startX, startY, endX, endY });
  return Object.freeze(Array.from({ length: steps }, (_unused, index) => {
    const progress = (index + 1) / steps;
    return Object.freeze(["shell", "input", "touchscreen", "motionevent", "MOVE", String(Math.round(startX + (endX - startX) * progress)), String(Math.round(startY + (endY - startY) * progress))]);
  }));
}

function waitSynchronously(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

export function phase7PlanOrderIs(hierarchy, firstLabel, secondLabel) {
  return phase7ReorderOrderIs(hierarchy, {
    first: { idPattern: new RegExp(`^drag-exercise-${firstLabel}$`, "u"), label: firstLabel },
    second: { idPattern: new RegExp(`^drag-exercise-${secondLabel}$`, "u"), label: secondLabel },
  });
}

function captureScreenshot(adbPath, serial, outputPath) {
  const bytes = execFileSync(adbPath, ["-s", serial, "exec-out", "screencap", "-p"]);
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) fail("native plan reorder screenshot is missing.");
  writeFileSync(outputPath, bytes, { flag: "wx" });
}

const PLAN_REORDER = Object.freeze({
  source: Object.freeze({ idPattern: /^drag-exercise-Bench Press$/u, label: "Bench Press" }),
  target: Object.freeze({ idPattern: /^drag-exercise-Back Squat$/u, label: "Back Squat" }),
});
const PLAN_DAY_REORDER = Object.freeze({
  source: Object.freeze({ idPattern: /^drag-day-Full Body B$/u, label: "Full Body B" }),
  target: Object.freeze({ idPattern: /^drag-day-Full Body A$/u, label: "Full Body A" }),
});
const WEEKDAY_REORDER = Object.freeze({
  source: Object.freeze({ idPattern: /^drag-weekday-0-Wednesday-.+$/u, label: "Full Body B" }),
  target: Object.freeze({ idPattern: /^drag-weekday-0-Monday-.+$/u, label: "Full Body A" }),
});
const ROTATION_REORDER = Object.freeze({
  source: Object.freeze({ idPattern: /^drag-rotation-.+-\d+$/u, label: "Full Body A" }),
  target: Object.freeze({ idPattern: /^drag-rotation-.+-\d+$/u, label: "Full Body B" }),
});
const WEEKDAY_PERSISTED_ORDER = Object.freeze({
  first: WEEKDAY_REORDER.source,
  second: WEEKDAY_REORDER.target,
});
const ROTATION_PERSISTED_ORDER = Object.freeze({
  first: ROTATION_REORDER.source,
  second: ROTATION_REORDER.target,
});
const PLAN_DAY_PERSISTED_ORDER = Object.freeze({
  first: PLAN_DAY_REORDER.source,
  second: PLAN_DAY_REORDER.target,
});
const PLAN_EXERCISE_PERSISTED_ORDER = Object.freeze({
  first: PLAN_REORDER.source,
  second: PLAN_REORDER.target,
});

function deviceHierarchy(adbPath, serial) {
  return adb(adbPath, serial, "exec-out", "uiautomator", "dump", "/dev/tty");
}

function executePhase7HeldDrag(adbPath, serial, reorder) {
  const before = deviceHierarchy(adbPath, serial);
  const drag = phase7ReorderCoordinates(before, reorder);
  const sourceStartedFirst = drag.startY < drag.endY;
  const commands = phase7NativeHeldDragCommands(drag);
  let pointerDown = false;
  try {
    adb(adbPath, serial, ...commands.down);
    pointerDown = true;
    waitSynchronously(700);
    for (const move of phase7NativeDragMoveSequence(drag)) {
      adb(adbPath, serial, ...move);
      waitSynchronously(60);
    }
  } finally {
    if (pointerDown) adb(adbPath, serial, ...commands.up);
  }
  const afterDrag = deviceHierarchy(adbPath, serial);
  const sourceFinishedFirst = phase7ReorderOrderIs(afterDrag, {
    first: reorder.source,
    second: reorder.target,
  });
  if (sourceFinishedFirst === sourceStartedFirst) {
    fail(`native held drag did not commit the ${reorder.source.label} reorder.`);
  }
  return afterDrag;
}

function executePhase7PlanReorderEvidence(adbPath, serial, flowDirectory) {
  executePhase7HeldDrag(adbPath, serial, PLAN_REORDER);
  captureScreenshot(
    adbPath,
    serial,
    path.join(flowDirectory, "phase7-plan-exercise-reorder.png"),
  );
}

function executePhase7ScheduleReorderEvidence(adbPath, serial, reorder) {
  executePhase7HeldDrag(adbPath, serial, reorder);
}

function assertPhase7PersistedReorder(adbPath, serial, expected, mode) {
  const hierarchy = deviceHierarchy(adbPath, serial);
  if (!phase7ReorderOrderIs(hierarchy, expected)) {
    fail(`persisted ${mode} schedule reorder is missing after save and reopen.`);
  }
}

function aggregatePhase7StageReports(stages) {
  const testCases = stages.map((stage) =>
    `  <testcase classname="phase7-plan-schedule-reorder" name="${stage}"/>`
  ).join("\n");
  return Buffer.from([
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuite name="phase7-plan-schedule-reorder" tests="${stages.length}" failures="0" errors="0" skipped="0">`,
    testCases,
    "</testsuite>",
    "",
  ].join("\n"));
}

function executePhase7MaestroStage(serial, reportPath, flowDirectory, flowPath, stage) {
  execFileSync("maestro", [
    "test", "--device", serial, "-e", `REORDER_STAGE=${stage}`,
    "--format", "junit", "--output", reportPath,
    "--test-output-dir", flowDirectory, flowPath,
  ], { stdio: "inherit" });
}

function installedDevice(adbPath, serial, candidate) {
  const packagePath = adb(adbPath, serial, "shell", "pm", "path", PACKAGE).split(/\r?\n/u)
    .find((line) => /^package:\/[^\r\n]+\.apk$/u.test(line))?.slice(8);
  if (!packagePath) fail("installed production package is missing or malformed.");
  const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "phase7-installed-"));
  const temporaryApk = path.join(temporaryDirectory, "installed.apk");
  try {
    execFileSync(adbPath, ["-s", serial, "pull", packagePath, temporaryApk], { stdio: "ignore" });
    const device = Object.freeze({
      role: "automated-emulator",
      model: adb(adbPath, serial, "shell", "getprop", "ro.product.model"),
      api: Number(adb(adbPath, serial, "shell", "getprop", "ro.build.version.sdk")),
      abi: adb(adbPath, serial, "shell", "getprop", "ro.product.cpu.abi"),
      serial_sha256: sha256Bytes(serial),
      installed_package: PACKAGE,
      installed_version_code: Number(adb(adbPath, serial, "shell", "dumpsys", "package", PACKAGE).match(/versionCode=(\d+)/u)?.[1]),
      installed_apk_sha256: sha256File(temporaryApk),
    });
    validatePhase5DeviceIdentity(device, candidate.manifest);
    return device;
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

function snapshotFlow(directory, sourceRoot, contract) {
  const source = path.resolve(sourceRoot, contract.flow);
  if (!existsSync(source)) fail(`required Maestro flow is missing: ${contract.id}`);
  const bytes = readFileSync(source);
  const flowPath = path.join(directory, `${contract.id}.yaml`);
  writeFileSync(flowPath, bytes, { flag: "wx", mode: 0o400 });
  const flowSha256 = sha256Bytes(bytes);
  if (sha256File(flowPath) !== flowSha256) fail(`Maestro flow snapshot failed: ${contract.id}`);
  return Object.freeze({ source: contract.flow, flowPath, flowSha256 });
}

export function snapshotPhase7ExecutableFlows(parentDirectory = os.tmpdir(), sourceRoot = process.cwd()) {
  const directory = mkdtempSync(path.join(path.resolve(parentDirectory), "phase7-executable-flows-"));
  try {
    const flows = Object.freeze(Object.fromEntries(PHASE7_MAESTRO_FLOW_CONTRACTS.map((contract) => [contract.id, snapshotFlow(directory, sourceRoot, contract)])));
    return Object.freeze({ directory, flows, cleanup: () => rmSync(directory, { recursive: true, force: true }) });
  } catch (error) {
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}

function assertFlowSnapshot(execution, contract, sourceRoot = process.cwd()) {
  if (execution?.source !== contract.flow || !SHA256_PATTERN.test(execution?.flowSha256 ?? "")
    || typeof execution?.flowPath !== "string" || sha256File(execution.flowPath) !== execution.flowSha256
    || sha256File(path.resolve(sourceRoot, contract.flow)) !== execution.flowSha256) {
    fail(`executed Maestro flow bytes changed: ${contract.id}`);
  }
  return execution;
}

export function validatePhase7ExecutableFlowSnapshots(flowExecutions, sourceRoot = process.cwd()) {
  for (const contract of PHASE7_MAESTRO_FLOW_CONTRACTS) assertFlowSnapshot(flowExecutions?.[contract.id], contract, sourceRoot);
}

export function createPhase7Evidence({ candidate, device, flowExecutions, rawReports, screenshots, fontScaleRestored }) {
  const flows = PHASE7_MAESTRO_FLOW_CONTRACTS.map((contract) => {
    const execution = assertFlowSnapshot(flowExecutions?.[contract.id], contract);
    const report = rawReports?.[contract.id];
    const flowScreenshots = screenshots?.[contract.id];
    const parsed = parsePassingJunit(report, contract.id);
    if (!Array.isArray(flowScreenshots) || !exactJson(flowScreenshots.map(({ file }) => file).slice().sort(), [...contract.screenshots].sort())) {
      fail(`required screenshots are missing or renamed for ${contract.id}.`);
    }
    return Object.freeze({
      id: contract.id, flow: contract.flow, flow_sha256: execution.flowSha256,
      considerations: contract.considerations, native_backstops: contract.native_backstops,
      raw_report_file: `${contract.id}/report.xml`, raw_report_sha256: sha256Bytes(report),
      screenshots: Object.freeze(flowScreenshots.map((screenshot) => Object.freeze({ file: safeRelativeFile(screenshot.file, "screenshot file"), sha256: screenshot.sha256 }))),
      ...parsed,
    });
  });
  return Object.freeze({
    schema_version: 1, suite: "phase7", status: "passed", mode: "automated-only",
    approval_status: "evidence_pending", attended_scope: "N4_pending_human", producer: "phase7-maestro/v1",
    candidate: phase5CandidateIdentity(candidate.manifest, candidate.manifest_sha256), device,
    considerations: PHASE7_CONSIDERATION_CONTRACTS, flows,
    native_backstops: PHASE7_NATIVE_BACKSTOPS.map((backstop) => Object.freeze({ id: backstop.id, status: "pending_human", flow_ids: backstop.flow_ids })),
    font_scale_restored: fontScaleRestored,
  });
}

export function validatePhase7Evidence(evidence, candidate, rawReports, flowExecutions = undefined) {
  const expectedCandidate = phase5CandidateIdentity(candidate.manifest, candidate.manifest_sha256);
  if (evidence?.schema_version !== 1 || evidence?.suite !== "phase7" || evidence?.status !== "passed"
    || evidence?.mode !== "automated-only" || evidence?.approval_status !== "evidence_pending"
    || evidence?.attended_scope !== "N4_pending_human" || evidence?.producer !== "phase7-maestro/v1"
    || !exactJson(evidence?.candidate, expectedCandidate) || !exactJson(evidence?.considerations, PHASE7_CONSIDERATION_CONTRACTS)
    || evidence?.font_scale_restored !== true || containsForbiddenEvidenceKey(evidence)) {
    fail("automated evidence identity, release boundary, or privacy boundary is invalid.");
  }
  validatePhase5DeviceIdentity(evidence.device, candidate.manifest);
  if (!Array.isArray(evidence.flows) || evidence.flows.length !== PHASE7_MAESTRO_FLOW_CONTRACTS.length) fail("automated evidence flow ledger is incomplete.");
  for (const [index, contract] of PHASE7_MAESTRO_FLOW_CONTRACTS.entries()) {
    const flow = evidence.flows[index];
    const execution = flowExecutions === undefined ? null : assertFlowSnapshot(flowExecutions[contract.id], contract);
    const expectedHash = execution?.flowSha256 ?? sha256File(path.resolve(contract.flow));
    const report = rawReports?.[contract.id];
    if (flow?.id !== contract.id || flow?.flow !== contract.flow || flow?.flow_sha256 !== expectedHash
      || !exactJson(flow?.considerations, contract.considerations) || !exactJson(flow?.native_backstops, contract.native_backstops)
      || flow?.tests < 1 || flow?.failures !== 0 || flow?.errors !== 0 || flow?.skipped !== 0
      || flow?.raw_report_file !== `${contract.id}/report.xml` || flow?.raw_report_sha256 !== sha256Bytes(report)
      || !Array.isArray(flow?.screenshots) || !exactJson(flow.screenshots.map(({ file }) => file).slice().sort(), [...contract.screenshots].sort())) {
      fail(`automated evidence flow is invalid: ${contract.id}`);
    }
    for (const screenshot of flow.screenshots) {
      if (!SHA256_PATTERN.test(screenshot?.sha256 ?? "")) fail(`screenshot hash is invalid: ${contract.id}`);
      safeRelativeFile(screenshot.file, "screenshot file");
    }
  }
  const expectedBackstops = PHASE7_NATIVE_BACKSTOPS.map((backstop) => ({ id: backstop.id, status: "pending_human", flow_ids: backstop.flow_ids }));
  if (!exactJson(evidence.native_backstops, expectedBackstops)) fail("native backstop ledger is incomplete.");
  return evidence;
}

export function executePhase7Maestro(args = process.argv.slice(2)) {
  const options = parsePhase7MaestroArguments(args);
  const candidate = loadPhase7Candidate(options);
  const bundleDirectory = canonicalDirectory(options.bundleDirectory, "retained candidate bundle");
  const output = requireFreshPathInsideBundle(bundleDirectory, options.output, "Phase 7 evidence output");
  const reportDirectory = requireFreshPathInsideBundle(bundleDirectory, options.reportDirectory, "Phase 7 Maestro report directory");
  mkdirSync(reportDirectory, { recursive: true });
  const adbPath = resolveAdb();
  const previousFontScale = adb(adbPath, options.serial, "shell", "settings", "get", "system", "font_scale");
  let executableFlows; let evidence; let primaryError;
  try {
    executableFlows = snapshotPhase7ExecutableFlows();
    execFileSync(adbPath, ["-s", options.serial, "install", "-r", candidate.apkPath], { stdio: "inherit" });
    const device = installedDevice(adbPath, options.serial, candidate);
    adb(adbPath, options.serial, "shell", "settings", "put", "system", "font_scale", "2.0");
    const rawReports = {}; const screenshots = {};
    for (const contract of PHASE7_MAESTRO_FLOW_CONTRACTS) {
      const execution = assertFlowSnapshot(executableFlows.flows[contract.id], contract);
      const flowDirectory = path.join(reportDirectory, contract.id);
      const reportPath = path.join(flowDirectory, "report.xml");
      mkdirSync(flowDirectory);
      if (contract.id === "phase7-plan-schedule-reorder") {
        const completedStages = [];
        const runStage = (stage) => {
          const stageDirectory = path.join(flowDirectory, stage);
          const stageReport = path.join(stageDirectory, "report.xml");
          mkdirSync(stageDirectory);
          executePhase7MaestroStage(
            options.serial,
            stageReport,
            stageDirectory,
            execution.flowPath,
            stage,
          );
          if (!existsSync(stageReport)) fail(`Maestro stage report is missing: ${stage}`);
          const report = readFileSync(stageReport);
          parsePassingJunit(report, `${contract.id}/${stage}`);
          completedStages.push(stage);
        };
        runStage("plan-day-ready");
        captureScreenshot(
          adbPath,
          options.serial,
          path.join(flowDirectory, "phase7-plan-selected-day.png"),
        );
        executePhase7HeldDrag(adbPath, options.serial, PLAN_DAY_REORDER);
        runStage("plan-exercise-ready");
        executePhase7HeldDrag(adbPath, options.serial, PLAN_REORDER);
        runStage("plan-save");
        assertPhase7PersistedReorder(
          adbPath,
          options.serial,
          PLAN_DAY_PERSISTED_ORDER,
          "plan-day",
        );
        captureScreenshot(
          adbPath,
          options.serial,
          path.join(flowDirectory, "phase7-plan-day-reorder.png"),
        );
        runStage("plan-exercise-persisted-ready");
        assertPhase7PersistedReorder(
          adbPath,
          options.serial,
          PLAN_EXERCISE_PERSISTED_ORDER,
          "plan-exercise",
        );
        captureScreenshot(
          adbPath,
          options.serial,
          path.join(flowDirectory, "phase7-plan-exercise-reorder.png"),
        );
        runStage("weekday-ready");
        executePhase7ScheduleReorderEvidence(adbPath, options.serial, WEEKDAY_REORDER);
        runStage("weekday-save");
        assertPhase7PersistedReorder(
          adbPath,
          options.serial,
          WEEKDAY_PERSISTED_ORDER,
          "Weekday",
        );
        captureScreenshot(
          adbPath,
          options.serial,
          path.join(flowDirectory, "phase7-weekday-schedule-reorder.png"),
        );
        runStage("rotation-ready");
        executePhase7ScheduleReorderEvidence(adbPath, options.serial, ROTATION_REORDER);
        runStage("rotation-save");
        assertPhase7PersistedReorder(
          adbPath,
          options.serial,
          ROTATION_PERSISTED_ORDER,
          "Rotation",
        );
        captureScreenshot(
          adbPath,
          options.serial,
          path.join(flowDirectory, "phase7-rotation-schedule-reorder.png"),
        );
        writeFileSync(
          reportPath,
          aggregatePhase7StageReports(completedStages),
          { flag: "wx" },
        );
      } else {
        execFileSync("maestro", ["test", "--device", options.serial, "--format", "junit", "--output", reportPath, "--test-output-dir", flowDirectory, execution.flowPath], { stdio: "inherit" });
      }
      if (!existsSync(reportPath)) fail(`Maestro report is missing: ${contract.id}`);
      rawReports[contract.id] = readFileSync(reportPath);
      screenshots[contract.id] = exactPhase7ScreenshotEvidence(
        flowDirectory,
        contract.screenshots,
        contract.id,
        contract.id === "phase7-plan-schedule-reorder"
          ? [
              "plan-day-ready", "plan-exercise-ready", "plan-save",
              "plan-exercise-persisted-ready", "weekday-ready",
              "weekday-save", "rotation-ready", "rotation-save",
            ]
          : [],
      );
    }
    evidence = createPhase7Evidence({ candidate, device, flowExecutions: executableFlows.flows, rawReports, screenshots, fontScaleRestored: false });
  } catch (error) { primaryError = error; }
  const cleanupErrors = []; let restored = false;
  try {
    adb(adbPath, options.serial, "shell", "settings", "put", "system", "font_scale", previousFontScale);
    restored = adb(adbPath, options.serial, "shell", "settings", "get", "system", "font_scale") === previousFontScale;
    if (!restored) fail("font scale cleanup did not restore the original value.");
  } catch (error) { cleanupErrors.push(error); }
  if (evidence !== undefined) {
    try {
      const finalized = { ...evidence, font_scale_restored: restored };
      const reports = Object.fromEntries(PHASE7_MAESTRO_FLOW_CONTRACTS.map((contract) => [contract.id, readFileSync(path.join(reportDirectory, contract.id, "report.xml"))]));
      validatePhase7Evidence(finalized, candidate, reports, executableFlows.flows);
      writeFileSync(output, `${JSON.stringify(finalized, null, 2)}\n`, { flag: "wx" });
      evidence = finalized;
    } catch (error) { cleanupErrors.push(error); }
  }
  if (executableFlows !== undefined) { try { executableFlows.cleanup(); } catch (error) { cleanupErrors.push(error); } }
  if (primaryError !== undefined || cleanupErrors.length > 0) {
    if (primaryError !== undefined && cleanupErrors.length === 0) throw primaryError;
    throw new AggregateError([...(primaryError === undefined ? [] : [primaryError]), ...cleanupErrors], "Phase 7 Maestro failed and cleanup was incomplete.");
  }
  return evidence;
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    const evidence = executePhase7Maestro();
    process.stdout.write(`${JSON.stringify({ ok: true, flows: evidence.flows.length })}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ ok: false, error: error.message })}\n`);
    process.exitCode = 1;
  }
}
