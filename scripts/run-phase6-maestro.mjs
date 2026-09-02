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
  loadPhase5Candidate,
  phase5CandidateIdentity,
  SHA256_PATTERN,
  sha256File,
  validatePhase5DeviceIdentity,
} from "./phase5-candidate-evidence.mjs";

const ADB_FALLBACK = "/opt/homebrew/share/android-commandlinetools/platform-tools/adb";
const PACKAGE = "com.fchoo.gymtracker";
const SERIAL = /^[A-Za-z0-9._:-]+$/u;
const LOCAL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/u;
const SAFE_RELATIVE_FILE = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,239}$/u;
const NATIVE_DRAG_SCREENSHOT = "phase6-reorder-live-displacement.png";
const NATIVE_DRAG_FLOW = "maestro/phase6/calendar-date-reorder-verify.yaml";
const MONTH_NAMES = Object.freeze([
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]);
const FORBIDDEN_EVIDENCE_KEYS = new Set([
  "approval",
  "owner_approval",
  "publication",
  "promotion",
  "raw_path",
  "private_path",
  "private_rows",
  "raw_rows",
  "release_authorization",
  "serial",
  "tag",
  "terminal_seal",
]);
const REQUIRED_OPTIONS = new Map([
  ["--bundle-dir", "bundleDirectory"],
  ["--manifest-sha256", "expectedManifestSha256"],
  ["--package", "packageName"],
  ["--serial", "serial"],
  ["--output", "output"],
  ["--report-dir", "reportDirectory"],
]);

export const PHASE6_MAESTRO_FLOW_CONTRACTS = Object.freeze([
  Object.freeze({
    id: "phase6-progress-library",
    flow: "maestro/phase6/progress-library.yaml",
    considerations: Object.freeze(["C1", "C2", "C3", "C4", "C7", "C11"]),
    native_backstops: Object.freeze(["N1"]),
    screenshots: Object.freeze([
      "phase6-progress-summary.png",
      "phase6-progress-search.png",
      "phase6-library-search.png",
      "phase6-library-favorite-selected.png",
    ]),
  }),
  Object.freeze({
    id: "phase6-calendar-date-reorder",
    flow: "maestro/phase6/calendar-date-reorder.yaml",
    considerations: Object.freeze(["C1", "C2", "C3", "C4", "C5", "C6", "C9", "C10"]),
    native_backstops: Object.freeze(["N2", "N3"]),
    screenshots: Object.freeze([
      "phase6-calendar-dialog-200pct.png",
      "phase6-calendar-swipe.png",
      "phase6-reorder-before-drag.png",
      NATIVE_DRAG_SCREENSHOT,
    ]),
  }),
  Object.freeze({
    id: "phase6-navigation-accessibility",
    flow: "maestro/phase6/navigation-accessibility.yaml",
    considerations: Object.freeze(["C6", "C8"]),
    native_backstops: Object.freeze(["N1", "N2"]),
    screenshots: Object.freeze([
      "phase6-history-data-route-200pct.png",
      "phase6-navigation-calendar-200pct.png",
      "phase6-navigation-library-200pct.png",
      "phase6-navigation-progress-200pct.png",
      "phase6-navigation-today-200pct.png",
    ]),
  }),
]);

export const PHASE6_CONSIDERATION_CONTRACTS = Object.freeze([
  Object.freeze({
    id: "C1",
    owner: "06-04 Calendar, 06-06 Library, 06-07 Progress",
    automated_checks: Object.freeze([
      "src/ui/__tests__/CalendarScreen.test.tsx",
      "src/ui/__tests__/LibraryScreen.test.tsx",
      "src/ui/__tests__/ProgressScreen.test.tsx",
    ]),
    flows: Object.freeze(["phase6-progress-library", "phase6-calendar-date-reorder"]),
    native_backstops: Object.freeze(["N1"]),
  }),
  Object.freeze({
    id: "C2",
    owner: "06-04 Calendar, 06-06 Library, 06-07 Progress",
    automated_checks: Object.freeze([
      "src/ui/__tests__/CalendarScreen.test.tsx",
      "src/ui/__tests__/LibraryScreen.test.tsx",
      "src/ui/__tests__/ProgressScreen.test.tsx",
    ]),
    flows: Object.freeze(["phase6-progress-library"]),
    native_backstops: Object.freeze(["N1"]),
  }),
  Object.freeze({
    id: "C3",
    owner: "06-04 Calendar, 06-06 Library, 06-07 Progress",
    automated_checks: Object.freeze([
      "src/ui/__tests__/CalendarScreen.test.tsx",
      "src/ui/__tests__/LibraryScreen.test.tsx",
      "src/ui/__tests__/ProgressScreen.test.tsx",
    ]),
    flows: Object.freeze(["phase6-progress-library", "phase6-calendar-date-reorder"]),
    native_backstops: Object.freeze(["N1"]),
  }),
  Object.freeze({
    id: "C4",
    owner: "06-04 Calendar, 06-06 Library, 06-07 Progress",
    automated_checks: Object.freeze([
      "src/ui/__tests__/CalendarScreen.test.tsx",
      "src/ui/__tests__/LibraryScreen.test.tsx",
      "src/ui/__tests__/ProgressScreen.test.tsx",
    ]),
    flows: Object.freeze(["phase6-progress-library", "phase6-calendar-date-reorder"]),
    native_backstops: Object.freeze(["N1", "N4"]),
  }),
  Object.freeze({
    id: "C5",
    owner: "06-04 Calendar and CalendarField",
    automated_checks: Object.freeze([
      "src/ui/__tests__/CalendarScreen.test.tsx",
      "src/ui/components/CalendarField.test.tsx",
    ]),
    flows: Object.freeze(["phase6-calendar-date-reorder"]),
    native_backstops: Object.freeze(["N2"]),
  }),
  Object.freeze({
    id: "C6",
    owner: "06-04 CalendarField, 06-05 reorder, 06-06 Library, 06-08 navigation",
    automated_checks: Object.freeze([
      "src/ui/components/CalendarField.test.tsx",
      "src/ui/__tests__/OwnedPlanEditor.test.tsx",
      "src/ui/__tests__/LibraryScreen.test.tsx",
      "src/ui/__tests__/foundation.test.tsx",
      "app/(tabs)/__tests__/_layout.test.tsx",
    ]),
    flows: Object.freeze(["phase6-calendar-date-reorder", "phase6-navigation-accessibility"]),
    native_backstops: Object.freeze(["N2", "N4"]),
  }),
  Object.freeze({
    id: "C7",
    owner: "06-05 picker, 06-06 Library, 06-07 Progress",
    automated_checks: Object.freeze([
      "src/ui/__tests__/OwnedPlanEditor.test.tsx",
      "src/ui/__tests__/LibraryScreen.test.tsx",
      "src/ui/__tests__/ProgressScreen.test.tsx",
    ]),
    flows: Object.freeze(["phase6-progress-library"]),
    native_backstops: Object.freeze(["N1"]),
  }),
  Object.freeze({
    id: "C8",
    owner: "06-04 CalendarField, 06-05 reorder, 06-08 navigation/Today",
    automated_checks: Object.freeze([
      "src/ui/components/CalendarField.test.tsx",
      "src/ui/__tests__/OwnedPlanEditor.test.tsx",
      "src/ui/__tests__/foundation.test.tsx",
      "app/(tabs)/__tests__/_layout.test.tsx",
      "src/ui/__tests__/TodayScreen.test.tsx",
    ]),
    flows: Object.freeze(["phase6-navigation-accessibility"]),
    native_backstops: Object.freeze(["N2", "N4"]),
  }),
  Object.freeze({
    id: "C9",
    owner: "06-05 reorder",
    automated_checks: Object.freeze(["src/ui/__tests__/OwnedPlanEditor.test.tsx"]),
    flows: Object.freeze(["phase6-calendar-date-reorder"]),
    native_backstops: Object.freeze(["N3", "N4"]),
  }),
  Object.freeze({
    id: "C10",
    owner: "06-04 CalendarField",
    automated_checks: Object.freeze(["src/ui/components/CalendarField.test.tsx"]),
    flows: Object.freeze(["phase6-calendar-date-reorder"]),
    native_backstops: Object.freeze(["N2", "N4"]),
  }),
  Object.freeze({
    id: "C11",
    owner: "06-06 Library",
    automated_checks: Object.freeze(["src/ui/__tests__/LibraryScreen.test.tsx"]),
    flows: Object.freeze(["phase6-progress-library"]),
    native_backstops: Object.freeze(["N1", "N4"]),
  }),
]);

export const PHASE6_NATIVE_BACKSTOPS = Object.freeze([
  Object.freeze({
    id: "N1",
    status: "automated_required",
    description: "Emulator keyboard/D-pad Search traversal in Library, Progress, and picker.",
    flow_ids: Object.freeze(["phase6-progress-library", "phase6-navigation-accessibility"]),
  }),
  Object.freeze({
    id: "N2",
    status: "automated_required",
    description: "Emulator Calendar/CalendarField swipe-button-arrow-focus parity at 200% text.",
    flow_ids: Object.freeze(["phase6-calendar-date-reorder", "phase6-navigation-accessibility"]),
  }),
  Object.freeze({
    id: "N3",
    status: "automated_required",
    description: "Emulator continuous reorder displacement and reduced-motion fallback.",
    flow_ids: Object.freeze(["phase6-calendar-date-reorder"]),
  }),
  Object.freeze({
    id: "N4",
    status: "pending_human",
    description: "Samsung exact-byte touch, OLED, 200%-text, TalkBack, filters, Favorite, navigation, and root-route observation.",
    flow_ids: Object.freeze([]),
  }),
]);

function fail(message) {
  throw new Error(`Phase 6 Maestro: ${message}`);
}

function daysInMonth(year, month) {
  if (month === 2) {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
      ? 29
      : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function shiftedMonth(year, month, direction) {
  const zeroBased = year * 12 + month - 1 + direction;
  const shifted = {
    year: Math.floor(zeroBased / 12),
    month: (zeroBased % 12) + 1,
  };
  if (shifted.year < 1 || shifted.year > 9_999) {
    fail("device civil date cannot provide adjacent month evidence.");
  }
  return shifted;
}

function formattedMonth({ year, month }) {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

export function phase6CalendarMonthEnvironment(localDate) {
  const match = LOCAL_DATE.exec(localDate ?? "");
  const year = Number(match?.[1]);
  const month = Number(match?.[2]);
  const day = Number(match?.[3]);
  if (match === null
    || year < 1
    || year > 9_999
    || month < 1
    || month > 12
    || day < 1
    || day > daysInMonth(year, month)) {
    fail("device civil date is malformed.");
  }
  return Object.freeze({
    current: formattedMonth({ year, month }),
    next: formattedMonth(shiftedMonth(year, month, 1)),
    previous: formattedMonth(shiftedMonth(year, month, -1)),
  });
}

function nodeAttribute(node, name) {
  return new RegExp(`${name}=\"([^\"]*)\"`, "u").exec(node)?.[1] ?? null;
}

export function phase6ReorderDragCoordinates(hierarchy, {
  sourceLabel,
  targetLabel,
}) {
  const nodes = [...String(hierarchy).matchAll(/<node\b[^>]*>/gu)]
    .map(([node]) => node);
  const boundsFor = (label) => {
    const prefix = `Drag ${label}. Position `;
    const node = nodes.find((candidate) =>
      nodeAttribute(candidate, "resource-id") === `drag-exercise-${label}`
      && nodeAttribute(candidate, "content-desc")?.startsWith(prefix));
    const bounds = node === undefined
      ? null
      : /^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/u.exec(
          nodeAttribute(node, "bounds") ?? "",
        );
    if (bounds === null) {
      fail(`drag hierarchy is missing ${label}.`);
    }
    const left = Number(bounds[1]);
    const top = Number(bounds[2]);
    const right = Number(bounds[3]);
    const bottom = Number(bounds[4]);
    if (right <= left || bottom <= top) {
      fail(`drag hierarchy bounds are invalid for ${label}.`);
    }
    return { x: Math.round((left + right) / 2), y: Math.round((top + bottom) / 2) };
  };
  const source = boundsFor(sourceLabel);
  const target = boundsFor(targetLabel);
  return Object.freeze({
    startX: source.x,
    startY: source.y,
    endX: target.x,
    endY: target.y,
  });
}

export function phase6NativeDragCommands({
  startX,
  startY,
  endX,
  endY,
}) {
  const coordinates = [startX, startY, endX, endY];
  if (!coordinates.every((value) => Number.isSafeInteger(value) && value >= 0)) {
    fail("native drag coordinates are invalid.");
  }
  return Object.freeze({
    down: Object.freeze([
      "shell", "input", "touchscreen", "motionevent", "DOWN",
      String(startX), String(startY),
    ]),
    move: Object.freeze([
      "shell", "input", "touchscreen", "motionevent", "MOVE",
      String(endX), String(endY),
    ]),
    up: Object.freeze([
      "shell", "input", "touchscreen", "motionevent", "UP",
      String(endX), String(endY),
    ]),
  });
}

export function phase6HeldDragIsDisplaced(
  hierarchy,
  { label, targetPosition, count },
) {
  const expected = `Drag ${label}. Moving to position ${targetPosition} of ${count}`;
  return [...String(hierarchy).matchAll(/<node\b[^>]*>/gu)]
    .map(([node]) => node)
    .some((node) =>
      nodeAttribute(node, "resource-id") === `drag-exercise-${label}`
      && nodeAttribute(node, "content-desc") === expected);
}

function waitSynchronously(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function captureScreenshot(adbPath, serial, outputPath) {
  const bytes = execFileSync(
    adbPath,
    ["-s", serial, "exec-out", "screencap", "-p"],
  );
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) {
    fail("native drag displacement screenshot is missing.");
  }
  writeFileSync(outputPath, bytes);
}

export function throwPhase6Failures(primaryError, cleanupErrors, context) {
  const failures = [
    ...(primaryError === undefined ? [] : [primaryError]),
    ...cleanupErrors,
  ];
  if (failures.length === 0) {
    return;
  }
  if (failures.length === 1) {
    throw failures[0];
  }
  throw new AggregateError(
    failures,
    `Phase 6 Maestro ${context} failed and cleanup was incomplete.`,
  );
}

function exactJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (
    !relative.startsWith(`..${path.sep}`)
    && relative !== ".."
    && !path.isAbsolute(relative)
  );
}

function canonicalizeExistingDirectory(directory, label) {
  const details = lstatSync(directory, { throwIfNoEntry: false });
  if (details === undefined || !details.isDirectory() || details.isSymbolicLink()) {
    fail(`${label} is unsafe.`);
  }
  const canonical = realpathSync(directory);
  if (canonical !== directory) {
    fail(`${label} must use the canonical path.`);
  }
  return canonical;
}

function canonicalizeFreshPath(target, label) {
  const requestedTarget = path.resolve(target);
  const root = path.parse(requestedTarget).root;
  const segments = path.relative(root, requestedTarget).split(path.sep).filter(Boolean);
  let current = root;
  for (const [index, segment] of segments.entries()) {
    const next = path.join(current, segment);
    const details = lstatSync(next, { throwIfNoEntry: false });
    if (details === undefined) {
      const canonicalAncestor = canonicalizeExistingDirectory(current, `${label} parent`);
      return Object.freeze({
        canonicalParent: canonicalAncestor,
        target: path.join(canonicalAncestor, ...segments.slice(index)),
      });
    }
    if (details.isSymbolicLink()) {
      fail(`${label} must not escape through a symlink.`);
    }
    if (!details.isDirectory()) {
      fail(`${label} parent is unsafe.`);
    }
    const canonicalNext = realpathSync(next);
    if (canonicalNext !== next) {
      fail(`${label} must use the canonical path.`);
    }
    current = canonicalNext;
  }
  return Object.freeze({
    canonicalParent: canonicalizeExistingDirectory(path.dirname(requestedTarget), `${label} parent`),
    target: requestedTarget,
  });
}

function safePath(value, label) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")) {
    fail(`${label} is required.`);
  }
  return path.resolve(value);
}

function safeRelativeFile(value, label) {
  if (typeof value !== "string"
    || !SAFE_RELATIVE_FILE.test(value)
    || value.startsWith("/")
    || value.includes("\\")
    || value.split("/").some((part) => part === "." || part === ".." || part.length === 0)) {
    fail(`${label} is malformed.`);
  }
  return value;
}

function exactScreenshotEvidence(reportRoot, expectedFiles, flowId) {
  const screenshots = screenshotFiles(reportRoot)
    .map((file) => ({
      file: safeRelativeFile(path.relative(reportRoot, file), "screenshot file"),
      sha256: sha256File(file),
    }))
    .sort((left, right) => left.file.localeCompare(right.file));
  const expected = [...expectedFiles].sort((left, right) => left.localeCompare(right));
  const actual = screenshots.map(({ file }) => file);
  if (!exactJson(actual, expected)) {
    fail(`required screenshots are missing or renamed for ${flowId}.`);
  }
  return Object.freeze(screenshots);
}

function parsePassedJunit(bytes, flowId) {
  if (!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array)) {
    fail(`Maestro report is missing: ${flowId}`);
  }
  const text = Buffer.from(bytes).toString("utf8");
  if (!/<testsuites?\b/u.test(text)
    || !/<testcase\b/u.test(text)
    || /<(?:failure|error|skipped)\b/u.test(text)) {
    fail(`Maestro did not produce a passing JUnit report: ${flowId}`);
  }
  return Object.freeze({
    tests: [...text.matchAll(/<testcase\b/gu)].length,
    failures: 0,
    errors: 0,
    skipped: 0,
  });
}

function containsForbiddenEvidenceKey(value) {
  if (Array.isArray(value)) return value.some(containsForbiddenEvidenceKey);
  if (value === null || typeof value !== "object") return false;
  return Object.entries(value).some(([key, nested]) =>
    FORBIDDEN_EVIDENCE_KEYS.has(key) || containsForbiddenEvidenceKey(nested));
}

function candidateApk(manifest) {
  const apk = manifest?.artifacts?.find(({ kind }) => kind === "apk");
  if (apk?.kind !== "apk" || !SHA256_PATTERN.test(apk.sha256 ?? "")) {
    fail("production APK identity is invalid.");
  }
  return apk;
}

function requireEvidencePathInsideBundle(bundleDirectory, candidate, label) {
  if (!isInside(bundleDirectory, candidate)) {
    fail(`${label} must stay inside the retained candidate bundle.`);
  }
  return candidate;
}

export function parsePhase6MaestroArguments(args = process.argv.slice(2)) {
  const options = {};
  if (args.length !== REQUIRED_OPTIONS.size * 2) fail("arguments are malformed.");
  for (let index = 0; index < args.length; index += 2) {
    const field = REQUIRED_OPTIONS.get(args[index]);
    const value = args[index + 1];
    if (field === undefined
      || options[field] !== undefined
      || typeof value !== "string"
      || value.length === 0
      || value.startsWith("--")) {
      fail("arguments are malformed.");
    }
    options[field] = value;
  }
  if (!SHA256_PATTERN.test(options.expectedManifestSha256)) {
    fail("manifest SHA-256 is malformed.");
  }
  if (options.packageName !== PACKAGE) {
    fail("only the production package identity is allowed.");
  }
  if (!SERIAL.test(options.serial)) fail("serial identity is malformed.");
  return options;
}

export function loadPhase6Candidate({
  bundleDirectory,
  expectedManifestSha256,
  packageName,
}) {
  if (packageName !== PACKAGE) fail("candidate package identity is not production.");
  const candidate = loadPhase5Candidate({
    bundleDirectory,
    expectedManifestSha256,
  });
  if (candidate.manifest.source.package !== PACKAGE
    || candidate.manifest.build.profile !== "production"
    || candidate.manifest_sha256 !== expectedManifestSha256) {
    fail("candidate identity is not the exact production replacement.");
  }
  const apk = candidateApk(candidate.manifest);
  const apkPath = requireEvidencePathInsideBundle(
    path.resolve(bundleDirectory),
    path.resolve(bundleDirectory, apk.file),
    "candidate APK",
  );
  if (!existsSync(apkPath) || sha256File(apkPath) !== apk.sha256) {
    fail("candidate APK bytes do not match the immutable manifest.");
  }
  return Object.freeze({ ...candidate, apk, apkPath });
}

export function resolveAdb(environment = process.env) {
  for (const directory of String(environment.PATH ?? "").split(path.delimiter)) {
    const candidate = path.join(directory, "adb");
    if (directory.length > 0 && existsSync(candidate)) return candidate;
  }
  if (existsSync(ADB_FALLBACK)) return ADB_FALLBACK;
  fail("ADB is unavailable from PATH and the pinned fallback.");
}

function adb(adbPath, serial, ...argumentsList) {
  return execFileSync(adbPath, ["-s", serial, ...argumentsList], {
    encoding: "utf8",
  }).trim();
}

function installedDevice(adbPath, serial, candidate) {
  const packageOutput = adb(adbPath, serial, "shell", "pm", "path", PACKAGE);
  const packagePath = packageOutput.split(/\r?\n/u)
    .find((line) => /^package:\/[^\r\n]+\.apk$/u.test(line))?.slice(8);
  if (!packagePath) fail("installed production package is missing or malformed.");

  const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "phase6-installed-"));
  const temporaryApk = path.join(temporaryDirectory, "installed.apk");
  try {
    execFileSync(adbPath, ["-s", serial, "pull", packagePath, temporaryApk], {
      stdio: "ignore",
    });
    const device = {
      role: "automated-emulator",
      model: adb(adbPath, serial, "shell", "getprop", "ro.product.model"),
      api: Number(adb(adbPath, serial, "shell", "getprop", "ro.build.version.sdk")),
      abi: adb(adbPath, serial, "shell", "getprop", "ro.product.cpu.abi"),
      serial_sha256: createHash("sha256").update(serial).digest("hex"),
      installed_package: PACKAGE,
      installed_version_code: Number(
        adb(adbPath, serial, "shell", "dumpsys", "package", PACKAGE)
          .match(/versionCode=(\d+)/u)?.[1],
      ),
      installed_apk_sha256: sha256File(temporaryApk),
    };
    validatePhase5DeviceIdentity(device, candidate.manifest);
    return Object.freeze(device);
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

function screenshotFiles(root) {
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...screenshotFiles(absolute));
    } else if (entry.isFile() && /\.png$/iu.test(entry.name) && statSync(absolute).size > 0) {
      files.push(absolute);
    }
  }
  return files;
}

function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function snapshotExecutableFlow(directory, sourceRoot, source, name) {
  const sourcePath = path.resolve(sourceRoot, source);
  if (!existsSync(sourcePath)) fail(`required Maestro flow is missing: ${name}`);
  const bytes = readFileSync(sourcePath);
  const flowPath = path.join(directory, `${name}.yaml`);
  writeFileSync(flowPath, bytes, { flag: "wx", mode: 0o400 });
  const flowSha256 = sha256Bytes(bytes);
  if (sha256File(flowPath) !== flowSha256) {
    fail(`Maestro flow snapshot failed: ${name}`);
  }
  return Object.freeze({
    source,
    flowPath,
    flowSha256,
  });
}

export function snapshotPhase6ExecutableFlows(
  parentDirectory = os.tmpdir(),
  sourceRoot = process.cwd(),
) {
  const directory = mkdtempSync(path.join(
    path.resolve(parentDirectory),
    "phase6-executable-flows-",
  ));
  try {
    const flows = Object.fromEntries(PHASE6_MAESTRO_FLOW_CONTRACTS.map((contract) => {
      const primary = snapshotExecutableFlow(
        directory,
        sourceRoot,
        contract.flow,
        contract.id,
      );
      if (!contract.native_backstops.includes("N3")) {
        return [contract.id, primary];
      }
      const nativeDrag = snapshotExecutableFlow(
        directory,
        sourceRoot,
        NATIVE_DRAG_FLOW,
        `${contract.id}-native-drag`,
      );
      return [contract.id, Object.freeze({
        ...primary,
        nativeDragFlow: nativeDrag.source,
        nativeDragFlowPath: nativeDrag.flowPath,
        nativeDragFlowSha256: nativeDrag.flowSha256,
      })];
    }));
    Object.freeze(flows);
    return Object.freeze({
      directory,
      flows,
      cleanup: () => rmSync(directory, { recursive: true, force: true }),
    });
  } catch (error) {
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}

function assertExecutableFlowSnapshot(
  flowExecution,
  contract,
  sourceRoot = process.cwd(),
) {
  const requiresNativeDrag = contract.native_backstops.includes("N3");
  if (flowExecution?.source !== contract.flow
    || typeof flowExecution?.flowPath !== "string"
    || !SHA256_PATTERN.test(flowExecution?.flowSha256 ?? "")
    || sha256File(flowExecution.flowPath) !== flowExecution.flowSha256
    || sha256File(path.resolve(sourceRoot, contract.flow)) !== flowExecution.flowSha256) {
    fail(`executed Maestro flow bytes changed: ${contract.id}`);
  }
  if (requiresNativeDrag) {
    if (flowExecution.nativeDragFlow !== NATIVE_DRAG_FLOW
      || typeof flowExecution.nativeDragFlowPath !== "string"
      || !SHA256_PATTERN.test(flowExecution.nativeDragFlowSha256 ?? "")
      || sha256File(flowExecution.nativeDragFlowPath)
        !== flowExecution.nativeDragFlowSha256
      || sha256File(path.resolve(sourceRoot, NATIVE_DRAG_FLOW))
        !== flowExecution.nativeDragFlowSha256) {
      fail(`executed native drag flow bytes changed: ${contract.id}`);
    }
  } else if (flowExecution.nativeDragFlow !== undefined
    || flowExecution.nativeDragFlowPath !== undefined
    || flowExecution.nativeDragFlowSha256 !== undefined) {
    fail(`unexpected native drag flow snapshot: ${contract.id}`);
  }
  return flowExecution;
}

export function validatePhase6ExecutableFlowSnapshots(
  flowExecutions,
  sourceRoot = process.cwd(),
) {
  for (const contract of PHASE6_MAESTRO_FLOW_CONTRACTS) {
    assertExecutableFlowSnapshot(flowExecutions?.[contract.id], contract, sourceRoot);
  }
}

export function preparePhase6EvidenceOutputs(output, reportDirectory) {
  if (lstatSync(output, { throwIfNoEntry: false }) !== undefined) {
    fail("Phase 6 evidence output must be fresh.");
  }
  if (lstatSync(reportDirectory, { throwIfNoEntry: false }) !== undefined) {
    fail("Phase 6 Maestro report directory must be fresh.");
  }
  const outputFresh = canonicalizeFreshPath(output, "Phase 6 evidence output");
  const reportFresh = canonicalizeFreshPath(reportDirectory, "Phase 6 Maestro report directory");
  mkdirSync(path.dirname(outputFresh.target), { recursive: true });
  mkdirSync(reportFresh.target, { recursive: true });
}

export function createPhase6Evidence({
  candidate,
  device,
  flowExecutions,
  rawReports,
  nativeDragReports = {},
  screenshots,
  fontScaleRestored,
}) {
  const flows = PHASE6_MAESTRO_FLOW_CONTRACTS.map((contract) => {
    const flowExecution = assertExecutableFlowSnapshot(
      flowExecutions?.[contract.id],
      contract,
    );
    const rawReport = rawReports?.[contract.id];
    const flowScreenshots = screenshots?.[contract.id];
    const parsed = parsePassedJunit(rawReport, contract.id);
    const nativeDragReport = nativeDragReports?.[contract.id];
    const requiresNativeDrag = contract.native_backstops.includes("N3");
    const nativeDrag = requiresNativeDrag
      ? parsePassedJunit(nativeDragReport, `${contract.id}-native-drag`)
      : null;
    const nativeDragScreenshot = requiresNativeDrag
      ? flowScreenshots?.find(({ file }) => file === NATIVE_DRAG_SCREENSHOT)
      : null;
    if (!Array.isArray(flowScreenshots)
      || !exactJson(
        flowScreenshots.map(({ file }) => file).slice().sort((left, right) => left.localeCompare(right)),
        [...contract.screenshots].sort((left, right) => left.localeCompare(right)),
      )) {
      fail(`required screenshots are missing or renamed for ${contract.id}.`);
    }
    if (requiresNativeDrag
      && !SHA256_PATTERN.test(nativeDragScreenshot?.sha256 ?? "")) {
      fail(`native drag displacement screenshot is missing for ${contract.id}.`);
    }
    return Object.freeze({
      id: contract.id,
      flow: contract.flow,
      flow_sha256: flowExecution.flowSha256,
      considerations: contract.considerations,
      native_backstops: contract.native_backstops,
      raw_report_file: `${contract.id}/report.xml`,
      raw_report_sha256: createHash("sha256").update(rawReport).digest("hex"),
      ...(nativeDrag === null ? {} : {
        native_drag_flow: flowExecution.nativeDragFlow,
        native_drag_flow_sha256: flowExecution.nativeDragFlowSha256,
        native_drag_report_file: `${contract.id}/native-drag/report.xml`,
        native_drag_report_sha256: createHash("sha256")
          .update(nativeDragReport)
          .digest("hex"),
        native_drag_tests: nativeDrag.tests,
        native_drag_live_screenshot: Object.freeze({
          file: nativeDragScreenshot.file,
          sha256: nativeDragScreenshot.sha256,
        }),
      }),
      screenshots: flowScreenshots.map((screenshot) => Object.freeze({
        file: safeRelativeFile(screenshot.file, "screenshot file"),
        sha256: screenshot.sha256,
      })),
      ...parsed,
    });
  });
  const backstops = PHASE6_NATIVE_BACKSTOPS.map((backstop) => Object.freeze({
    id: backstop.id,
    status: backstop.status === "pending_human" ? "pending_human" : "passed",
    flow_ids: backstop.flow_ids,
  }));
  return Object.freeze({
    schema_version: 1,
    suite: "phase6",
    status: "passed",
    mode: "automated-only",
    approval_status: "evidence_pending",
    attended_scope: "N4_pending_human",
    producer: "phase6-maestro/v1",
    candidate: phase5CandidateIdentity(candidate.manifest, candidate.manifest_sha256),
    device,
    considerations: PHASE6_CONSIDERATION_CONTRACTS,
    flows,
    native_backstops: backstops,
    font_scale_restored: fontScaleRestored,
  });
}

export function validatePhase6Evidence(
  evidence,
  candidate,
  rawReports,
  nativeDragReports = {},
  flowExecutions,
) {
  const expectedCandidate = phase5CandidateIdentity(candidate.manifest, candidate.manifest_sha256);
  if (evidence?.schema_version !== 1
    || evidence?.suite !== "phase6"
    || evidence?.status !== "passed"
    || evidence?.mode !== "automated-only"
    || evidence?.approval_status !== "evidence_pending"
    || evidence?.attended_scope !== "N4_pending_human"
    || evidence?.producer !== "phase6-maestro/v1"
    || !exactJson(evidence?.candidate, expectedCandidate)
    || !exactJson(evidence?.considerations, PHASE6_CONSIDERATION_CONTRACTS)
    || evidence?.font_scale_restored !== true
    || containsForbiddenEvidenceKey(evidence)) {
    fail("automated evidence identity, release boundary, or privacy boundary is invalid.");
  }
  validatePhase5DeviceIdentity(evidence.device, candidate.manifest);
  if (!Array.isArray(evidence.flows)
    || evidence.flows.length !== PHASE6_MAESTRO_FLOW_CONTRACTS.length) {
    fail("automated evidence flow ledger is incomplete.");
  }
  for (const [index, contract] of PHASE6_MAESTRO_FLOW_CONTRACTS.entries()) {
    const flow = evidence.flows[index];
    const flowExecution = flowExecutions === undefined
      ? null
      : assertExecutableFlowSnapshot(flowExecutions[contract.id], contract);
    const expectedFlowSha256 = flowExecution?.flowSha256
      ?? sha256File(path.resolve(contract.flow));
    const rawReport = rawReports?.[contract.id];
    const nativeDragReport = nativeDragReports?.[contract.id];
    const requiresNativeDrag = contract.native_backstops.includes("N3");
    if (flow?.id !== contract.id
      || flow?.flow !== contract.flow
      || flow?.flow_sha256 !== expectedFlowSha256
      || !exactJson(flow?.considerations, contract.considerations)
      || !exactJson(flow?.native_backstops, contract.native_backstops)
      || flow?.tests < 1
      || flow?.failures !== 0
      || flow?.errors !== 0
      || flow?.skipped !== 0
      || flow?.raw_report_file !== `${contract.id}/report.xml`
      || flow?.raw_report_sha256 !== createHash("sha256").update(rawReport).digest("hex")
      || !Array.isArray(flow?.screenshots)
      || !exactJson(
        flow.screenshots.map((screenshot) => screenshot?.file).slice().sort((left, right) => left.localeCompare(right)),
        [...contract.screenshots].sort((left, right) => left.localeCompare(right)),
      )) {
      fail(`automated evidence flow is invalid: ${contract.id}`);
    }
    if (requiresNativeDrag) {
      const expectedNativeDragFlowSha256 = flowExecution?.nativeDragFlowSha256
        ?? sha256File(path.resolve(NATIVE_DRAG_FLOW));
      const parsedNativeDrag = parsePassedJunit(
        nativeDragReport,
        `${contract.id}-native-drag`,
      );
      if (flow.native_drag_report_file
          !== `${contract.id}/native-drag/report.xml`
        || flow.native_drag_flow !== NATIVE_DRAG_FLOW
        || flow.native_drag_flow_sha256 !== expectedNativeDragFlowSha256
        || flow.native_drag_report_sha256 !== createHash("sha256")
          .update(nativeDragReport)
          .digest("hex")
        || flow.native_drag_tests !== parsedNativeDrag.tests
        || flow.native_drag_live_screenshot?.file !== NATIVE_DRAG_SCREENSHOT
        || !SHA256_PATTERN.test(
          flow.native_drag_live_screenshot?.sha256 ?? "",
        )
        || !flow.screenshots.some((screenshot) =>
          exactJson(screenshot, flow.native_drag_live_screenshot))) {
        fail(`native drag evidence is invalid: ${contract.id}`);
      }
    } else if (flow.native_drag_flow !== undefined
      || flow.native_drag_flow_sha256 !== undefined
      || flow.native_drag_report_file !== undefined
      || flow.native_drag_report_sha256 !== undefined
      || flow.native_drag_tests !== undefined
      || flow.native_drag_live_screenshot !== undefined) {
      fail(`unexpected native drag evidence: ${contract.id}`);
    }
    for (const screenshot of flow.screenshots) {
      if (!SHA256_PATTERN.test(screenshot?.sha256 ?? "")) {
        fail(`screenshot hash is invalid: ${contract.id}`);
      }
      safeRelativeFile(screenshot.file, "screenshot file");
    }
  }
  const expectedBackstops = PHASE6_NATIVE_BACKSTOPS.map((backstop) => ({
    id: backstop.id,
    status: backstop.status === "pending_human" ? "pending_human" : "passed",
    flow_ids: backstop.flow_ids,
  }));
  if (!exactJson(evidence.native_backstops, expectedBackstops)) {
    fail("native backstop ledger is incomplete.");
  }
}

export function executePhase6Maestro(args = process.argv.slice(2)) {
  const options = parsePhase6MaestroArguments(args);
  const candidate = loadPhase6Candidate(options);
  const bundleDirectory = path.resolve(options.bundleDirectory);
  const output = requireEvidencePathInsideBundle(
    bundleDirectory,
    safePath(options.output, "output"),
    "output",
  );
  const reportDirectory = requireEvidencePathInsideBundle(
    bundleDirectory,
    safePath(options.reportDirectory, "report directory"),
    "report directory",
  );
  const adbPath = resolveAdb();
  preparePhase6EvidenceOutputs(output, reportDirectory);
  const priorFontScale = adb(adbPath, options.serial, "shell", "settings", "get", "system", "font_scale");
  let executableFlows;
  let evidence;
  let primaryError;
  try {
    executableFlows = snapshotPhase6ExecutableFlows();
    execFileSync(adbPath, ["-s", options.serial, "install", "-r", candidate.apkPath], {
      stdio: "inherit",
    });
    const device = installedDevice(adbPath, options.serial, candidate);
    adb(adbPath, options.serial, "shell", "settings", "put", "system", "font_scale", "2.0");
    const rawReports = {};
    const nativeDragReports = {};
    const screenshots = {};
    for (const contract of PHASE6_MAESTRO_FLOW_CONTRACTS) {
      const flowExecution = assertExecutableFlowSnapshot(
        executableFlows.flows[contract.id],
        contract,
      );
      const flowReportDirectory = path.join(reportDirectory, contract.id);
      const reportPath = path.join(flowReportDirectory, "report.xml");
      mkdirSync(flowReportDirectory);
      const monthEnvironment = phase6CalendarMonthEnvironment(adb(
        adbPath,
        options.serial,
        "shell",
        "date",
        "+%Y-%m-%d",
      ));
      execFileSync("maestro", [
        "test",
        "--device", options.serial,
        "-e", `CURRENT_MONTH=${monthEnvironment.current}`,
        "-e", `NEXT_MONTH=${monthEnvironment.next}`,
        "-e", `PREVIOUS_MONTH=${monthEnvironment.previous}`,
        "--format", "junit",
        "--output", reportPath,
        "--test-output-dir", flowReportDirectory,
        flowExecution.flowPath,
      ], { stdio: "inherit" });
      if (!existsSync(reportPath)) fail(`Maestro report is missing: ${contract.id}`);
      rawReports[contract.id] = readFileSync(reportPath);
      if (contract.native_backstops.includes("N3")) {
        const hierarchy = adb(
          adbPath,
          options.serial,
          "exec-out",
          "uiautomator",
          "dump",
          "/dev/tty",
        );
        const drag = phase6ReorderDragCoordinates(hierarchy, {
          sourceLabel: "Bench Press",
          targetLabel: "Back Squat",
        });
        const dragCommands = phase6NativeDragCommands(drag);
        let pointerDown = false;
        let dragFailure;
        try {
          adb(adbPath, options.serial, ...dragCommands.down);
          pointerDown = true;
          waitSynchronously(700);
          adb(adbPath, options.serial, ...dragCommands.move);
          waitSynchronously(200);
          const displacedHierarchy = adb(
            adbPath,
            options.serial,
            "exec-out",
            "uiautomator",
            "dump",
            "/dev/tty",
          );
          if (!phase6HeldDragIsDisplaced(displacedHierarchy, {
            label: "Bench Press",
            targetPosition: 1,
            count: 2,
          })) {
            fail("native held drag did not expose live neighbour displacement.");
          }
          captureScreenshot(
            adbPath,
            options.serial,
            path.join(flowReportDirectory, NATIVE_DRAG_SCREENSHOT),
          );
        } catch (error) {
          dragFailure = error;
        }
        const dragCleanupErrors = [];
        if (pointerDown) {
          try {
            adb(adbPath, options.serial, ...dragCommands.up);
          } catch (error) {
            dragCleanupErrors.push(error);
          }
        }
        throwPhase6Failures(dragFailure, dragCleanupErrors, "native drag");
        const nativeDragReportDirectory = path.join(
          flowReportDirectory,
          "native-drag",
        );
        const nativeDragReportPath = path.join(
          nativeDragReportDirectory,
          "report.xml",
        );
        mkdirSync(nativeDragReportDirectory, { recursive: true });
        execFileSync("maestro", [
          "test",
          "--device", options.serial,
          "--format", "junit",
          "--output", nativeDragReportPath,
          "--test-output-dir", nativeDragReportDirectory,
          flowExecution.nativeDragFlowPath,
        ], { stdio: "inherit" });
        if (!existsSync(nativeDragReportPath)) {
          fail("native drag verification report is missing.");
        }
        nativeDragReports[contract.id] = readFileSync(nativeDragReportPath);
      }
      screenshots[contract.id] = exactScreenshotEvidence(
        flowReportDirectory,
        contract.screenshots,
        contract.id,
      );
    }
    evidence = createPhase6Evidence({
      candidate,
      device,
      flowExecutions: executableFlows.flows,
      rawReports,
      nativeDragReports,
      screenshots,
      fontScaleRestored: false,
    });
  } catch (error) {
    primaryError = error;
  }
  const cleanupErrors = [];
  let restored = false;
  try {
    adb(
      adbPath,
      options.serial,
      "shell",
      "settings",
      "put",
      "system",
      "font_scale",
      priorFontScale,
    );
    restored = adb(
      adbPath,
      options.serial,
      "shell",
      "settings",
      "get",
      "system",
      "font_scale",
    ) === priorFontScale;
    if (!restored) {
      fail("font scale cleanup did not restore the original value.");
    }
  } catch (error) {
    cleanupErrors.push(error);
  }
  if (evidence !== undefined) {
    try {
      const finalized = {
        ...evidence,
        font_scale_restored: restored,
      };
      const rawReports = Object.fromEntries(PHASE6_MAESTRO_FLOW_CONTRACTS.map((contract) => [
        contract.id,
        readFileSync(path.join(reportDirectory, contract.id, "report.xml")),
      ]));
      const nativeDragReports = Object.fromEntries(
        PHASE6_MAESTRO_FLOW_CONTRACTS
          .filter((contract) => contract.native_backstops.includes("N3"))
          .map((contract) => [
          contract.id,
          readFileSync(path.join(
            reportDirectory,
            contract.id,
            "native-drag",
            "report.xml",
          )),
        ]),
      );
      validatePhase6Evidence(
        finalized,
        candidate,
        rawReports,
        nativeDragReports,
        executableFlows.flows,
      );
      writeFileSync(output, `${JSON.stringify(finalized, null, 2)}\n`);
      evidence = finalized;
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  if (executableFlows !== undefined) {
    try {
      executableFlows.cleanup();
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  throwPhase6Failures(primaryError, cleanupErrors, "outer cleanup");
  return evidence;
}

const isMain = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    const evidence = executePhase6Maestro();
    process.stdout.write(`${JSON.stringify({ ok: true, flows: evidence.flows.length })}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ ok: false, error: error.message })}\n`);
    process.exitCode = 1;
  }
}
