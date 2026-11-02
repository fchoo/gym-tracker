#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import process from "node:process";
import { pathToFileURL } from "node:url";

export const V12_NATIVE_LEASE_PATH = "/data/local/tmp/gym-tracker-v12-native-lease";
export const V12_VISUAL_LEASE_PATH = "/data/local/tmp/gym-tracker-v12-visual";
export const V12_DEVICE_LEASE_PATHS = Object.freeze([V12_NATIVE_LEASE_PATH, V12_VISUAL_LEASE_PATH]);

export const V12_NATIVE_RUNTIME_SETTINGS = Object.freeze({
  font_scale: "system",
  accelerometer_rotation: "system",
  user_rotation: "system",
  window_animation_scale: "global",
  transition_animation_scale: "global",
  animator_duration_scale: "global",
  airplane_mode_on: "global",
});

export const V12_QUALITY_RUNTIME_SETTINGS = Object.freeze({
  font_scale: "system",
  window_animation_scale: "global",
  transition_animation_scale: "global",
  animator_duration_scale: "global",
  show_ime_with_hard_keyboard: "secure",
});

export const V12_VISUAL_SYSTEM_SETTINGS = Object.freeze([
  "font_scale",
  "accelerometer_rotation",
  "user_rotation",
]);

// This ordered list is the canonical byte contract used by the build manifest.
// Keep serialization compatible with the original three newline-terminated ADB
// values; display size/density are restored and lease-guarded by the visual
// producer, but are not fields owned by the immutable build manifest digest.
export const V12_CANONICAL_RESTORATION_SETTINGS = Object.freeze([
  Object.freeze({ key: "font_scale", adb_args: Object.freeze(["shell", "settings", "get", "system", "font_scale"]) }),
  Object.freeze({ key: "ui_night_mode", adb_args: Object.freeze(["shell", "settings", "get", "secure", "ui_night_mode"]) }),
  Object.freeze({ key: "animator_duration_scale", adb_args: Object.freeze(["shell", "settings", "get", "global", "animator_duration_scale"]) }),
]);

function fail(code) {
  throw new Error(`v12_device_settings_${code}`);
}

function normalizeValue(value) {
  if (typeof value !== "string" && !Buffer.isBuffer(value)) fail("value_invalid");
  const normalized = String(value).replaceAll("\r", "");
  if (!/^[^\n]{1,128}\n?$/u.test(normalized)) fail("value_invalid");
  const unwrapped = normalized.endsWith("\n") ? normalized.slice(0, -1) : normalized;
  if (!/^(?:null|-?\d+(?:\.\d+)?)$/u.test(unwrapped)) fail("value_invalid");
  return unwrapped;
}

function exactSnapshot(value) {
  const keys = V12_CANONICAL_RESTORATION_SETTINGS.map(({ key }) => key);
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

export function readV12CanonicalRestorationSnapshot(runAdb) {
  if (typeof runAdb !== "function") fail("reader_invalid");
  return Object.freeze(Object.fromEntries(V12_CANONICAL_RESTORATION_SETTINGS.map(({ key, adb_args: adbArgs }) => (
    [key, normalizeValue(runAdb([...adbArgs]))]
  ))));
}

export function serializeV12CanonicalRestorationSnapshot(snapshot) {
  if (!exactSnapshot(snapshot)) fail("snapshot_invalid");
  return V12_CANONICAL_RESTORATION_SETTINGS.map(({ key }) => normalizeValue(snapshot[key])).join("\n") + "\n";
}

export function digestV12CanonicalRestorationSnapshot(snapshot) {
  return createHash("sha256").update(serializeV12CanonicalRestorationSnapshot(snapshot)).digest("hex");
}

function readDigestFromDevice() {
  const serial = process.env.V12_DEVICE_SERIAL;
  if (typeof serial !== "string" || !/^[A-Za-z0-9._:-]{1,200}$/u.test(serial)) fail("device_invalid");
  const snapshot = readV12CanonicalRestorationSnapshot((args) => execFileSync("adb", ["-s", serial, ...args], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    timeout: 20_000,
  }));
  return digestV12CanonicalRestorationSnapshot(snapshot);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 3 || process.argv[2] !== "--read-digest") fail("cli_invalid");
    process.stdout.write(`${readDigestFromDevice()}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error && /^v12_device_settings_[a-z_]+$/u.test(error.message) ? error.message : "v12_device_settings_failed"}\n`);
    process.exitCode = 1;
  }
}
