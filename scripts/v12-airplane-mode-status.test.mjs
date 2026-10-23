import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { normalizeV12AirplaneModeStatus } from "./v12-airplane-mode-status.mjs";
import { createDomainRunner } from "./testing/v12-production-domain/controlled-domain-runner.mjs";
import { createControlledRunner } from "./testing/v12-production-launcher/controlled-runner.mjs";

for (const state of ["enabled", "disabled"]) {
  for (const output of [state, `Airplane mode is ${state}`]) {
    test(`normalize exact Android airplane-mode status: ${output}`, () => {
      assert.equal(normalizeV12AirplaneModeStatus(output), `Airplane mode is ${state}`);
    });
  }
}

test("unknown, ambiguous and non-string airplane status stays fail-closed", () => {
  for (const output of [undefined, null, false, 0, {}, ["enabled"], "", "enable", "disable", "ENABLED", " enabled", "disabled ", "enabled\n", "Airplane mode is enabled\ndisabled", "Airplane mode is unknown", "private response", "prefix enabled suffix"]) {
    assert.equal(normalizeV12AirplaneModeStatus(output), undefined);
  }
});

// These are complete, bounded status/lease regressions. They intentionally stop
// after the first recovery cut; unchanged 112-cut source-fact tests are separate.
for (const enabled of [false, true]) test(`Recovery accepts bare Android status and restores prior radio state: ${enabled} (HOST ONLY)`, (t) => {
  const runner = createDomainRunner(); t.after(runner.cleanup);
  const prior = runner.readState();
  runner.updateState({ bareAirplaneStatus: true, airplane: enabled, missingCut: true,
    settings: { ...prior.settings, airplane_mode_on: enabled ? "1" : "0" } });
  const result = runner.invoke("recovery");
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "v12_production_native_launcher_recovery_receipt_invalid");
  assert.ok(runner.readState().domainCalls.length > 0);
  assert.equal(runner.readState().airplane, enabled);
  assert.equal(runner.readState().settings.airplane_mode_on, enabled ? "1" : "0");
  assert.equal(existsSync(path.join(runner.scratch, "lock")), false);
});

test("Recovery rejects unknown airplane output before scenario/device mutation (HOST ONLY)", (t) => {
  const runner = createDomainRunner(); t.after(runner.cleanup);
  runner.updateState({ airplaneOutput: "enabled disabled" });
  const result = runner.invoke("recovery");
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "v12_production_native_launcher_settings_invalid");
  assert.equal(runner.readState().domainCalls.length, 0);
  assert.equal(existsSync(path.join(runner.scratch, "lock")), false);
});

for (const airplane of ["enabled", "disabled"]) test(`Calendar lease snapshots/restores actual Android bare status: ${airplane} (HOST ONLY)`, (t) => {
  const runner = createControlledRunner(); t.after(runner.cleanup);
  const prior = runner.readState();
  runner.updateState({ bareAirplaneStatus: true, display: { ...prior.display, airplane },
    settings: { ...prior.settings, airplane_mode_on: airplane === "enabled" ? "1" : "0" } });
  const result = runner.calendarSettingsScenario();
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.calendar.airplane, `Airplane mode is ${airplane}`);
  assert.equal(output.restore_error, null);
  assert.equal(output.release_error, null);
  assert.equal(runner.readState().display.airplane, airplane);
  assert.equal(existsSync(path.join(runner.scratch, "lock")), false);
});
