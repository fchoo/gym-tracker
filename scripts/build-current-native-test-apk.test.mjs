import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("the native test APK build retries launcher resolution after install", () => {
  const source = readFileSync(
    new URL("./build-current-native-test-apk.sh", import.meta.url),
    "utf8",
  );

  assert.match(
    source,
    /while \[ "\$attempts" -lt 15 \][\s\S]*cmd package resolve-activity --brief[\s\S]*sleep 1/u,
  );
  assert.match(
    source,
    /phase14 \| phase14-\* \| v1\.2-acceptance/u,
  );
  assert.match(source, /phase18-garmin-proof\|phase18-garmin-acceptance\|phase18-garmin-adversarial/u);
  assert.match(source, /use v1\.2-acceptance/u);
  assert.doesNotMatch(
    source,
    /v1\.2-acceptance[\s\S]*device=%\$?device_serial/u,
  );
});

test("the v1.2 acceptance build accepts the explicit one-build guard without changing legacy suites", () => {
  const source = readFileSync(new URL("./build-current-native-test-apk.sh", import.meta.url), "utf8");
  assert.match(source, /--single-build\)/u);
  assert.match(source, /single_build=0/u);
  assert.match(source, /\[ "\$single_build" -eq 0 \] \|\| \[ "\$suite" = 'v1\.2-acceptance' \] \|\|/u);
});

test("the v1.2 acceptance build uses the canonical restoration digest contract", () => {
  const source = readFileSync(new URL("./build-current-native-test-apk.sh", import.meta.url), "utf8");
  assert.match(source, /v12-device-settings-contract\.mjs --read-digest/u);
  assert.doesNotMatch(source, /shell settings get system font_scale[\s\S]*shasum -a 256/u);
});

test("the v1.2 acceptance build validates predecessors and uses privacy-safe doctor mode before freezing source", () => {
  const source = readFileSync(new URL("./build-current-native-test-apk.sh", import.meta.url), "utf8");
  const predecessor = source.indexOf("node scripts/validate-v12-prebuild-predecessors.mjs");
  const doctor = source.indexOf("sh scripts/doctor-android.sh --phase20");
  const freeze = source.indexOf("base_head=$(git rev-parse HEAD)");
  const generation = source.indexOf("npx expo prebuild --clean");

  assert.ok(predecessor >= 0);
  assert.ok(doctor > predecessor);
  assert.ok(freeze > doctor);
  assert.ok(generation > freeze);
});
