import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("Phase 9 evidence runner requires a manifest and tracer relaunch assertions", () => {
  const runner = readFileSync("scripts/run-phase9-maestro.mjs", "utf8");
  const flow = readFileSync("maestro/phase9/in-workout-exercise-editing.yaml", "utf8");
  assert.match(runner, /native build manifest is required/);
  assert.match(runner, /build\.apk\?\.path/);
  assert.match(runner, /maestro\/phase9\/in-workout-exercise-editing\.yaml/);
  assert.match(flow, /appId: com\.fchoo\.gymtracker\.devtest/);
  assert.match(flow, /Add exercise/);
  assert.match(flow, /Added/);
  assert.match(flow, /stopApp/);
  assert.match(flow, /clearState: false/);
});
