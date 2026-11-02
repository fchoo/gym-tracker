import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const repositoryRoot = process.cwd();
const moduleRoot = path.join(repositoryRoot, "modules", "garmin-connect");
const bridgePath = path.join(
  moduleRoot,
  "android",
  "src",
  "main",
  "python",
  "garmin_bridge.py",
);

function readRequired(relativePath) {
  const absolutePath = path.join(repositoryRoot, relativePath);
  assert.equal(existsSync(absolutePath), true, `missing ${relativePath}`);
  return readFileSync(absolutePath, "utf8");
}

test("the Garmin Expo module declares one bounded Android runtime module", () => {
  const config = readRequired("modules/garmin-connect/expo-module.config.json");
  const gradle = readRequired("modules/garmin-connect/android/build.gradle");
  const manifest = readRequired("modules/garmin-connect/android/src/main/AndroidManifest.xml");
  const kotlin = readRequired(
    "modules/garmin-connect/android/src/main/java/expo/modules/garminconnect/GarminConnectModule.kt",
  );

  assert.match(config, /expo\.modules\.garminconnect\.GarminConnectModule/u);
  assert.match(gradle, /GARMIN_CHAQUOPY_VERSION\s*=\s*["']17\.0\.0["']/u);
  assert.match(gradle, /GARMIN_PYTHON_VERSION\s*=\s*["']3\.13["']/u);
  assert.match(gradle, /arm64-v8a/u);
  assert.match(manifest, /^<manifest\b/u);
  assert.match(kotlin, /RUNTIME_INFO_OPERATION\s*=\s*"runtimeInfo"/u);
  assert.match(kotlin, /AsyncFunction\(RUNTIME_INFO_OPERATION\)/u);
  assert.match(kotlin, /runOnQueue\(appContext\.backgroundCoroutineScope\)/u);
  assert.doesNotMatch(kotlin, /PyObject|traceback|eval|http:\/\/|https:\/\//iu);
});

test("the bundled Python dispatcher accepts only the empty runtimeInfo DTO", () => {
  assert.equal(existsSync(bridgePath), true, "missing bundled Python bridge");

  const result = execFileSync(
    "python3",
    [
      "-c",
      [
        "import importlib.util, json, sys",
        `spec = importlib.util.spec_from_file_location('garmin_bridge', ${JSON.stringify(bridgePath)})`,
        "module = importlib.util.module_from_spec(spec)",
        "assert spec.loader is not None",
        "spec.loader.exec_module(module)",
        "info = module.dispatch('runtimeInfo', {})",
        "assert info['schemaVersion'] == 1",
        "assert info['pythonVersion'] == '3.13'",
        "assert info['clientVersion'] == '0.3.17'",
        "assert info['clientCommit'] == '218e72ca5459e014435fc2d94fd18bd601fa0c14'",
        "assert info['abi'] == 'arm64-v8a'",
        "assert info['capabilities'] == ['runtimeInfo']",
        "for operation, args in [('get_activity', {}), ('runtimeInfo', {'url': 'https://example.invalid'}), ('runtimeInfo', []), ('eval', {})]:",
        "    try:",
        "        module.dispatch(operation, args)",
        "    except ValueError:",
        "        pass",
        "    else:",
        "        raise AssertionError((operation, args))",
        "print(json.dumps(info, sort_keys=True))",
      ].join("\n"),
    ],
    { encoding: "utf8" },
  );

  const info = JSON.parse(result);
  assert.deepEqual(info.capabilities, ["runtimeInfo"]);
});
