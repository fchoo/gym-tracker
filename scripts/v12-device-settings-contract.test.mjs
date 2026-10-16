import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  V12_CANONICAL_RESTORATION_SETTINGS,
  digestV12CanonicalRestorationSnapshot,
  readV12CanonicalRestorationSnapshot,
  serializeV12CanonicalRestorationSnapshot,
} from "./v12-device-settings-contract.mjs";

test("canonical restoration digest preserves the build manifest's exact ordered settings bytes", () => {
  const outputs = new Map([
    ["shell settings get system font_scale", "1.15\r\n"],
    ["shell settings get secure ui_night_mode", "1\r\n"],
    ["shell settings get global animator_duration_scale", "0.5\r\n"],
  ]);
  const calls = [];
  const snapshot = readV12CanonicalRestorationSnapshot((args) => {
    calls.push(args);
    return outputs.get(args.join(" "));
  });

  assert.deepEqual(calls, V12_CANONICAL_RESTORATION_SETTINGS.map(({ adb_args }) => adb_args));
  assert.deepEqual(snapshot, {
    font_scale: "1.15",
    ui_night_mode: "1",
    animator_duration_scale: "0.5",
  });
  assert.equal(serializeV12CanonicalRestorationSnapshot(snapshot), "1.15\n1\n0.5\n");
  assert.equal(
    digestV12CanonicalRestorationSnapshot(snapshot),
    createHash("sha256").update("1.15\n1\n0.5\n").digest("hex"),
  );
});

test("canonical restoration snapshot rejects missing, multiline, and extra values", () => {
  assert.throws(() => readV12CanonicalRestorationSnapshot(() => undefined), /v12_device_settings_value_invalid/u);
  assert.throws(() => readV12CanonicalRestorationSnapshot(() => "1\n2\n"), /v12_device_settings_value_invalid/u);
  assert.throws(() => digestV12CanonicalRestorationSnapshot({
    font_scale: "1",
    ui_night_mode: "0",
    animator_duration_scale: "1",
    extra: "1",
  }), /v12_device_settings_snapshot_invalid/u);
});
