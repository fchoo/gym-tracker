#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";

const ADB_FALLBACK = "/opt/homebrew/share/android-commandlinetools/platform-tools/adb";
const PHASE9_SCHEDULED_WORKOUT_CLOCK = "091812002026";

function command(executable, args) {
  return execFileSync(executable, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function resolveAdb() {
  const androidHome = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
  const candidate = androidHome === undefined
    ? ADB_FALLBACK
    : `${androidHome}/platform-tools/adb`;
  if (!existsSync(candidate)) {
    throw new Error(`Phase 9 Maestro: adb is unavailable: ${candidate}`);
  }
  return candidate;
}

const manifestIndex = process.argv.indexOf("--manifest");
const manifest = manifestIndex < 0
  ? "artifacts/native/phase9/build.json"
  : process.argv[manifestIndex + 1];
if (manifest === undefined || !existsSync(manifest)) {
  throw new Error("Phase 9 Maestro: a native build manifest is required.");
}
const build = JSON.parse(readFileSync(manifest, "utf8"));
if (typeof build.apk?.path !== "string" || !existsSync(build.apk.path)) {
  throw new Error("Phase 9 Maestro: manifest APK is missing.");
}
if (typeof build.device?.serial !== "string" || build.device.serial.length === 0) {
  throw new Error("Phase 9 Maestro: manifest device serial is missing.");
}
const phase9Flows = [
  "maestro/phase9/in-workout-exercise-editing.yaml",
  "maestro/phase9/completed-workout-plan-writeback-keep.yaml",
  "maestro/phase9/completed-workout-plan-writeback-retry.yaml",
];
const adb = resolveAdb();
const priorAutoTime = command(adb, [
  "-s",
  build.device.serial,
  "shell",
  "settings",
  "get",
  "global",
  "auto_time",
]);
const priorDate = command(adb, [
  "-s",
  build.device.serial,
  "shell",
  "date",
  "+%m%d%H%M%Y",
]);

try {
  command(adb, [
    "-s",
    build.device.serial,
    "shell",
    "settings",
    "put",
    "global",
    "auto_time",
    "0",
  ]);
  command(adb, [
    "-s",
    build.device.serial,
    "shell",
    "date",
    PHASE9_SCHEDULED_WORKOUT_CLOCK,
  ]);
  const scheduledDate = command(adb, [
    "-s",
    build.device.serial,
    "shell",
    "date",
    "+%Y-%m-%d",
  ]);
  if (scheduledDate !== "2026-09-18") {
    throw new Error("Phase 9 Maestro: scheduled workout date was not applied.");
  }

  for (const flow of phase9Flows) {
    const result = spawnSync("maestro", [
      "test",
      "--udid",
      build.device.serial,
      flow,
    ], { stdio: "inherit" });
    if (result.status !== 0) process.exitCode = result.status ?? 1;
    if (process.exitCode !== undefined) break;
  }
} finally {
  command(adb, [
    "-s",
    build.device.serial,
    "shell",
    "settings",
    "put",
    "global",
    "auto_time",
    priorAutoTime,
  ]);
  if (priorAutoTime === "0") {
    command(adb, [
      "-s",
      build.device.serial,
      "shell",
      "date",
      priorDate,
    ]);
  }
}
