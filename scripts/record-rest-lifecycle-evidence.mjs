#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";

const projectRoot = process.cwd();
const artifactDirectory = path.resolve(
  projectRoot,
  process.argv[2] ?? "artifacts/native/rest-lifecycle",
);
const buildPath = path.join(artifactDirectory, "build.json");
const junitPath = path.join(artifactDirectory, "maestro.xml");
const resultPath = path.join(artifactDirectory, "lifecycle-result.json");

function sha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function adb(serial, ...args) {
  const androidHome = process.env.ANDROID_HOME
    ?? process.env.ANDROID_SDK_ROOT
    ?? "/opt/homebrew/share/android-commandlinetools";
  return execFileSync(
    path.join(androidHome, "platform-tools", "adb"),
    ["-s", serial, ...args],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  ).trim();
}

const build = JSON.parse(readFileSync(buildPath, "utf8"));
const junit = readFileSync(junitPath, "utf8");
const tests = Number(junit.match(/\btests="(\d+)"/u)?.[1] ?? 0);
const failures = Number(junit.match(/\bfailures="(\d+)"/u)?.[1] ?? 0);
const errors = Number(junit.match(/\berrors="(\d+)"/u)?.[1] ?? 0);
const skipped = Number(junit.match(/\bskipped="(\d+)"/u)?.[1] ?? 0);
if (tests < 1 || failures !== 0 || errors !== 0 || skipped !== 0) {
  throw new Error(
    `Maestro JUnit did not pass: tests=${tests} failures=${failures} errors=${errors} skipped=${skipped}`,
  );
}

const packagePath = adb(build.device.serial, "shell", "pm", "path", build.package)
  .split(/\r?\n/u)
  .find((line) => line.startsWith("package:"))
  ?.slice("package:".length);
if (!packagePath) {
  throw new Error(`Installed package is unavailable: ${build.package}`);
}
const installedBytes = execFileSync(
  path.join(
    process.env.ANDROID_HOME
      ?? process.env.ANDROID_SDK_ROOT
      ?? "/opt/homebrew/share/android-commandlinetools",
    "platform-tools",
    "adb",
  ),
  ["-s", build.device.serial, "exec-out", "cat", packagePath],
  { maxBuffer: 256 * 1024 * 1024 },
);
const installedSha256 = createHash("sha256")
  .update(installedBytes)
  .digest("hex");
if (installedSha256 !== build.apk.sha256) {
  throw new Error("Installed APK bytes do not match retained lifecycle APK");
}

const result = {
  schema_version: 1,
  suite: "rest-lifecycle",
  status: "passed",
  base_head: build.base_head,
  source_tree_sha256: build.source_tree_sha256,
  build_manifest: path.relative(projectRoot, buildPath),
  package: build.package,
  apk: build.apk,
  installed_apk: {
    device_path: packagePath,
    sha256: installedSha256,
    matches_retained_apk: true,
  },
  device: build.device,
  maestro: {
    report: path.relative(projectRoot, junitPath),
    sha256: sha256(junitPath),
    tests,
    failures,
    errors,
    skipped,
    flow: "maestro/lifecycle/rest-recovery.yaml",
    assertions: [
      "notification permission denied remains non-blocking",
      "manual values persist through rotation",
      "running rest restores after process death",
      "paused rest restores after process death",
      "skip returns to the next working set",
    ],
  },
  recorded_at: new Date().toISOString(),
};
writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({
  ok: true,
  result: path.relative(projectRoot, resultPath),
  apk_sha256: build.apk.sha256,
  maestro_tests: tests,
}));
