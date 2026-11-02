import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import { phase18DeviceIdentitySha256 } from "./phase18-device-identity.mjs";

const FACTS = Object.freeze({
  serial: "test-device-01",
  abi: "arm64-v8a",
  model: "Test Device",
  apiLevel: "36",
});

function expectedSha256(facts = FACTS) {
  return createHash("sha256").update(JSON.stringify({
    serial: facts.serial,
    abi: facts.abi,
    apiLevel: facts.apiLevel,
    model: facts.model,
  })).digest("hex");
}

test("canonical Phase 18 device identity binds one exact field set, order, and JSON encoding", () => {
  assert.equal(phase18DeviceIdentitySha256(FACTS), expectedSha256());
  assert.equal(
    phase18DeviceIdentitySha256({
      model: FACTS.model,
      serial: FACTS.serial,
      apiLevel: FACTS.apiLevel,
      abi: FACTS.abi,
    }),
    expectedSha256(),
  );

  for (const invalid of [
    { ...FACTS, serial: "" },
    { ...FACTS, model: `${FACTS.model}\nleak` },
    { ...FACTS, apiLevel: "api-36" },
    { ...FACTS, unexpected: "field" },
  ]) {
    assert.throws(
      () => phase18DeviceIdentitySha256(invalid),
      /phase18_device_identity_invalid/u,
    );
  }
});

test("canonical helper CLI accepts ordered stdin facts and emits only the hash", () => {
  const input = [
    FACTS.serial,
    FACTS.abi,
    FACTS.apiLevel,
    FACTS.model,
  ].join("\n") + "\n";
  const result = spawnSync(process.execPath, ["scripts/phase18-device-identity.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
    input,
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, `${expectedSha256()}\n`);
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, /test-device-01/u);

  const withoutTrailingNewline = spawnSync(
    process.execPath,
    ["scripts/phase18-device-identity.mjs"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      input: input.slice(0, -1),
    },
  );
  assert.equal(withoutTrailingNewline.status, 0, withoutTrailingNewline.stderr);
  assert.equal(withoutTrailingNewline.stdout, `${expectedSha256()}\n`);

  const malformed = spawnSync(process.execPath, ["scripts/phase18-device-identity.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
    input: "only-one-field\n",
  });
  assert.notEqual(malformed.status, 0);
  assert.equal(malformed.stdout, "");
  assert.match(malformed.stderr, /^phase18_device_identity_invalid\n$/u);
});

test("the shell builder and every Phase 18 identity resolver use the canonical helper", () => {
  const builder = readFileSync("scripts/build-current-native-test-apk.sh", "utf8");
  assert.match(builder, /node scripts\/phase18-device-identity\.mjs/u);
  assert.doesNotMatch(builder, /device_identity_sha256=\$\([\s\S]*shasum -a 256/u);

  for (const file of [
    "scripts/proof-runner-evidence.mjs",
    "scripts/proof-verifier-evidence.mjs",
    "scripts/acceptance-verifier-evidence.mjs",
    "scripts/benchmark-evidence-runner.mjs",
    "scripts/adversarial-verifier-evidence.mjs",
  ]) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /phase18DeviceIdentitySha256/u, file);
    assert.doesNotMatch(
      source,
      /JSON\.stringify\(\{\s*serial,\s*abi,\s*apiLevel,\s*model\s*\}\)/u,
      file,
    );
  }
});
