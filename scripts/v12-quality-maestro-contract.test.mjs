import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import yaml from "js-yaml";

test("conditional acceptance flows parse their complete commands before device execution", () => {
  for (const name of ["recovery", "calendar", "calendar-requirements", "garmin-progress"]) {
    const documents = [];
    yaml.loadAll(readFileSync(`maestro/v1.2/${name}.yaml`, "utf8"), (document) => documents.push(document));
    assert.equal(documents.length, 2, name);
    assert.equal(documents[0].appId, "com.fchoo.gymtracker.devtest");
    const commands = documents[1];
    assert.ok(Array.isArray(commands) && commands.length > 0, name);
    const conditionalFlows = commands.filter((command) => command.runFlow?.when !== undefined);
    assert.ok(conditionalFlows.length > 0, name);
    for (const command of conditionalFlows) {
      assert.equal(typeof command.runFlow.when.true, "string", name);
      assert.match(command.runFlow.when.true, /^\$\{.+\}$/u);
      assert.ok(Array.isArray(command.runFlow.commands) && command.runFlow.commands.length > 0, name);
    }
  }
});

for (const [phase, heading] of [
  ["arm", "Recovery cut armed"],
  ["recover", "Recovery observation complete"],
]) {
  test(`Recovery ${phase} waits for the normal root before opening its isolated deep link`, () => {
    const commands = yaml.loadAll(readFileSync("maestro/v1.2/recovery.yaml", "utf8"))[1];
    const branches = commands.filter((command) => command.runFlow !== undefined);
    assert.equal(branches.length, 2);
    const branch = branches.find((command) => command.runFlow.when.true === `\${V12_RECOVERY_PHASE == '${phase}'}`);
    assert.ok(branch, `missing ${phase} phase`);
    const phaseCommands = branch.runFlow.commands;
    assert.deepEqual(phaseCommands.map((command) => Object.keys(command)), [
      ["launchApp"], ["extendedWaitUntil"], ["openLink"], ["extendedWaitUntil"],
    ]);
    assert.deepEqual(phaseCommands[0].launchApp, { clearState: false, stopApp: phase === "arm" });
    assert.deepEqual(phaseCommands[1].extendedWaitUntil, {
      visible: { id: "root-navigation-bottom" }, timeout: 20000,
    });
    assert.equal(phaseCommands[2].openLink,
      "gymtracker-devtest://__v12-production-recovery?nonce=${V12_DOMAIN_NONCE}&caseId=${V12_RECOVERY_CASE}&stepId=${V12_RECOVERY_STEP}&cutId=${V12_RECOVERY_STAGE}&phase=" + phase);
    assert.deepEqual(phaseCommands[3].extendedWaitUntil, { visible: heading, timeout: 120000 });
  });
}

test("packaged Maestro quality probe carries the complete request and waits for route readiness", () => {
  const flow = readFileSync("maestro/v1.2/phase20-quality-probe.yaml", "utf8");
  assert.match(flow, /PHASE20_QUALITY_OPERATION != null/u);
  assert.match(flow, /PHASE20_QUALITY_SEQUENCE != null/u);
  assert.match(flow, /operation=\$\{PHASE20_QUALITY_OPERATION\}/u);
  assert.match(flow, /sequence=\$\{PHASE20_QUALITY_SEQUENCE\}/u);
  assert.match(flow, /id: "phase20-quality-probe"/u);
  assert.doesNotMatch(flow, /What are you training for\?/u);
});
