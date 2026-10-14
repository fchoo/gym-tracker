#!/usr/bin/env node
// JSON-stdin fake device protocol. It intentionally contains no device serial,
// credentials, host path, or production data.
import { createHash } from "node:crypto";
import { PNG } from "pngjs";
const sha = (value) => createHash("sha256").update(String(value)).digest("hex");
const read = await new Promise((resolve) => { let body = ""; process.stdin.on("data", (chunk) => { body += chunk; }); process.stdin.on("end", () => resolve(JSON.parse(body))); });
const action = process.argv[3]; const fail = process.env.V12_FAKE_DEVICE_FAIL; const mutation = process.env.V12_FAKE_DEVICE_MUTATION;
if (fail && action.includes(fail)) process.exit(1);
const png = (key) => { const image = new PNG({ width: 1, height: 1 }); const hash = Buffer.from(sha(key), "hex"); image.data.set([hash[0], hash[1], hash[2], 255]); return PNG.sync.write(image).toString("base64"); };
const sample = (index, dx = 25) => ({ timestampMs: index + 1, widthDp: 100, dxDp: dx, dyDp: 0, intentOwner: "horizontal", translationDp: dx, title: "2026-10", selectedCivilDate: "2026-10-14", generation: index + 1, focusedWeek: "week", rowBounds: [0, 48], callbackCount: index + 1, focusIdentity: "calendar", motion: "normal" });
const response = (() => {
  if (action === "acquire-lease") return { id: "lease" }; if (action === "release-lease") return true;
  if (action === "snapshot-settings") return { id: "settings" }; if (action === "restore-settings") return true;
  if (action === "visual-capture") return { native_execution: "EXECUTED", fixture_id: "v12-synthetic-fixtures-r18", png_base64: png(`${read.payload.state_id}:${read.payload.configuration_id}`), settings: { restored: true, privacy: "synthetic-only" } };
  if (action === "calendar") return { stages: Array.from({ length: 35 }, (_, index) => ({ id: ["drag-forward-10", "drag-forward-24_9", "drag-forward-25", "drag-forward-25_1", "drag-forward-release-below", "drag-forward-release-exact", "drag-forward-release-above", "drag-backward-10", "drag-backward-24_9", "drag-backward-25", "drag-backward-25_1", "drag-backward-release-below", "drag-backward-release-exact", "drag-backward-release-above", "drag-fast-subthreshold", "drag-retreat", "drag-cancel", "drag-vertical", "drag-diagonal", "second-input-interrupt", "week-expand-first-row", "week-expand-middle-row", "week-expand-last-row", "adjacent-week", "month-year-boundary", "leap-february", "four-row-month", "five-row-month", "six-row-month", "rapid-reverse-input", "rotation-during-transition", "background-during-transition", "reduced-motion", "dev-01-padding", "dev-02-light-title"][index], order: index, status: "PASS", samples: [sample(index * 2, 25), sample(index * 2 + 1, 25)] })) };
  // Other actions intentionally return only a shape; the black-box test is the
  // contract that forces producers to reject anything insufficient.
  return { mutation, result: "synthetic" };
})();
process.stdout.write(`${JSON.stringify({ schema_version: 1, action, ok: true, result: response })}\n`);
