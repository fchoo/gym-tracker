#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import {
  loadPhase6Candidate,
  resolveAdb,
} from "./run-phase6-maestro.mjs";
import {
  phase5CandidateIdentity,
  SHA256_PATTERN,
  sha256File,
} from "./phase5-candidate-evidence.mjs";

const SAMSUNG_MODEL = "SM-S916B";
const PACKAGE = "com.fchoo.gymtracker";
const SERIAL = /^[A-Za-z0-9._:-]+$/u;
const REQUIRED_OPTIONS = new Map([
  ["--bundle-dir", "bundleDirectory"],
  ["--manifest-sha256", "expectedManifestSha256"],
  ["--serial", "serial"],
  ["--output", "output"],
]);
const FORBIDDEN_KEYS = new Set([
  "approval",
  "owner_approval",
  "promotion",
  "publication",
  "raw_path",
  "release_authorization",
  "serial",
  "terminal_seal",
]);

function fail(message) {
  throw new Error(`Phase 6 attended checklist: ${message}`);
}

function adb(adbPath, serial, ...args) {
  return execFileSync(adbPath, ["-s", serial, ...args], {
    encoding: "utf8",
  }).trim();
}

function exactJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function hasForbiddenKey(value) {
  if (Array.isArray(value)) return value.some(hasForbiddenKey);
  if (value === null || typeof value !== "object") return false;
  return Object.entries(value).some(([key, nested]) =>
    FORBIDDEN_KEYS.has(key) || hasForbiddenKey(nested));
}

function canonical(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function serializePhase6AttendedChecklist(checklist) {
  return Buffer.from(canonical(checklist));
}

export function parsePhase6AttendedChecklistArguments(args = process.argv.slice(2)) {
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
  if (!SERIAL.test(options.serial)) fail("serial identity is malformed.");
  return options;
}

export function readPhase6SamsungDevice({
  adbPath,
  serial,
  candidate,
}) {
  const model = adb(adbPath, serial, "shell", "getprop", "ro.product.model");
  if (model !== SAMSUNG_MODEL) fail("connected device model is not SM-S916B.");
  const packagePath = adb(adbPath, serial, "shell", "pm", "path", PACKAGE)
    .split(/\r?\n/u)
    .find((line) => /^package:\/[^\r\n]+\.apk$/u.test(line))?.slice(8);
  if (packagePath === undefined) fail("installed production package is missing.");

  const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "phase6-samsung-"));
  const temporaryApk = path.join(temporaryDirectory, "installed.apk");
  try {
    execFileSync(adbPath, ["-s", serial, "pull", packagePath, temporaryApk], {
      stdio: "ignore",
    });
    const installedApkSha256 = sha256File(temporaryApk);
    const apk = candidate.manifest.artifacts.find(({ kind }) => kind === "apk");
    if (installedApkSha256 !== apk?.sha256) {
      fail("installed Samsung APK bytes do not match the replacement candidate.");
    }
    return Object.freeze({
      role: "samsung-physical",
      model: SAMSUNG_MODEL,
      serial_sha256: createHash("sha256").update(serial).digest("hex"),
      installed_package: PACKAGE,
      installed_apk_sha256: installedApkSha256,
    });
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

const N4_ROWS = Object.freeze([
  Object.freeze({
    id: "N4-01",
    scope: "Touch and motion",
    instructions: "Repeat Calendar/date swipe and continuous long-press reorder. Confirm touch ergonomics, visible displacement, stable scrolling, 48dp fallback controls, and reduced-motion acknowledgement.",
  }),
  Object.freeze({
    id: "N4-02",
    scope: "OLED and non-colour state",
    instructions: "In System, Light, and Dark/OLED, confirm filter selection and Favorite filled/outlined state remain distinguishable without colour alone.",
  }),
  Object.freeze({
    id: "N4-03",
    scope: "200 percent text and rotation",
    instructions: "At Android 200% text and rotation, confirm root labels, Search, chips, rows, dialogs, History and data, and data routes remain complete and reachable.",
  }),
  Object.freeze({
    id: "N4-04",
    scope: "TalkBack and keyboard/D-pad",
    instructions: "With TalkBack plus keyboard/D-pad, confirm names, roles, states, modal containment, order, alternatives, and restored focus across changed surfaces.",
  }),
]);

export function buildPhase6AttendedChecklist({
  candidate,
  device,
  generatedAt,
}) {
  return Object.freeze({
    schema_version: 1,
    suite: "phase6-attended",
    status: "pending_human",
    mode: "observation-only",
    approval_status: "evidence_pending",
    candidate: phase5CandidateIdentity(candidate.manifest, candidate.manifestSha256),
    device,
    generated_at: generatedAt,
    rows: N4_ROWS.map((row) => Object.freeze({
      ...row,
      status: "pending_human",
      attachment_sha256: null,
    })),
    evidence_limits: Object.freeze([
      "Record pass or fail plus attachment SHA-256 only.",
      "Do not record a device serial, database rows, identifiers, JSON, paths, backup contents, or release authorization.",
      "Do not approve, promote, publish, tag, or run Terminal Seal from this checklist.",
    ]),
  });
}

export function validatePhase6AttendedChecklist(checklist, {
  candidate,
  device,
} = {}) {
  if (checklist?.schema_version !== 1
    || checklist?.suite !== "phase6-attended"
    || checklist?.status !== "pending_human"
    || checklist?.mode !== "observation-only"
    || checklist?.approval_status !== "evidence_pending"
    || !Number.isFinite(Date.parse(checklist?.generated_at ?? ""))
    || !exactJson(checklist?.candidate, phase5CandidateIdentity(
      candidate.manifest, candidate.manifestSha256,
    ))
    || !exactJson(checklist?.device, device)
    || !Array.isArray(checklist?.rows)
    || checklist.rows.length !== N4_ROWS.length
    || hasForbiddenKey(checklist)) {
    fail("checklist identity, release boundary, or privacy boundary is invalid.");
  }
  for (const [index, expected] of N4_ROWS.entries()) {
    const actual = checklist.rows[index];
    if (actual?.id !== expected.id
      || actual?.scope !== expected.scope
      || actual?.instructions !== expected.instructions
      || actual?.status !== "pending_human"
      || actual?.attachment_sha256 !== null) {
      fail(`checklist row is invalid: ${expected.id}`);
    }
  }
  if (device?.role !== "samsung-physical"
    || device?.model !== SAMSUNG_MODEL
    || device?.installed_package !== PACKAGE
    || !SHA256_PATTERN.test(device?.serial_sha256 ?? "")
    || !SHA256_PATTERN.test(device?.installed_apk_sha256 ?? "")) {
    fail("Samsung identity is invalid.");
  }
  return checklist;
}

export function executePhase6AttendedChecklist(args = process.argv.slice(2)) {
  const options = parsePhase6AttendedChecklistArguments(args);
  const candidate = loadPhase6Candidate({
    bundleDirectory: options.bundleDirectory,
    expectedManifestSha256: options.expectedManifestSha256,
    packageName: PACKAGE,
  });
  const adbPath = resolveAdb();
  const device = readPhase6SamsungDevice({
    adbPath,
    serial: options.serial,
    candidate,
  });
  const checklist = buildPhase6AttendedChecklist({
    candidate,
    device,
    generatedAt: new Date().toISOString(),
  });
  validatePhase6AttendedChecklist(checklist, { candidate, device });
  const output = path.resolve(options.output);
  const bundle = path.resolve(options.bundleDirectory);
  if (!output.startsWith(`${bundle}${path.sep}`) || !existsSync(bundle)) {
    fail("checklist output must stay inside the retained candidate bundle.");
  }
  writeFileSync(output, serializePhase6AttendedChecklist(checklist));
  return Object.freeze({
    checklist,
    checklist_sha256: createHash("sha256").update(readFileSync(output)).digest("hex"),
  });
}

const isMain = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    const result = executePhase6AttendedChecklist();
    process.stdout.write(`${JSON.stringify({
      ok: true,
      checklist_sha256: result.checklist_sha256,
      rows: result.checklist.rows.length,
    })}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ ok: false, error: error.message })}\n`);
    process.exitCode = 1;
  }
}
