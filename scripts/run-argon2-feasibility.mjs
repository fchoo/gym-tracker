#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFile,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";

const RESULT_MARKER = "GYM_TRACKER_ARGON2_FEASIBILITY_RESULT:";
const repositoryRoot = process.cwd();
const argumentsList = process.argv.slice(2);
let manifestArgument = "";
let deviceKind = "emulator";
let requestedSamples = 3;

function fail(message) {
  console.error(JSON.stringify({
    ok: false,
    error: "argon2_feasibility_failed",
    message,
  }));
  process.exit(1);
}

for (let index = 0; index < argumentsList.length; index += 1) {
  const argument = argumentsList[index];
  if (argument === "--manifest") {
    manifestArgument = argumentsList[index + 1] ?? "";
    index += 1;
  } else if (argument.startsWith("--manifest=")) {
    manifestArgument = argument.slice("--manifest=".length);
  } else if (argument === "--device") {
    deviceKind = argumentsList[index + 1] ?? "";
    index += 1;
  } else if (argument.startsWith("--device=")) {
    deviceKind = argument.slice("--device=".length);
  } else if (argument === "--samples") {
    requestedSamples = Number(argumentsList[index + 1] ?? "");
    index += 1;
  } else if (argument.startsWith("--samples=")) {
    requestedSamples = Number(argument.slice("--samples=".length));
  } else if ([
    "--assert-kat",
    "--assert-responsive",
    "--assert-cng",
    "--assert-page-size",
  ].includes(argument)) {
    continue;
  } else {
    fail(`unknown argument: ${argument}`);
  }
}

if (!manifestArgument) {
  fail("--manifest is required.");
}
if (deviceKind !== "emulator" && deviceKind !== "physical") {
  fail("--device must be emulator or physical.");
}
if (
  !Number.isSafeInteger(requestedSamples)
  || requestedSamples < 3
  || requestedSamples > 10
) {
  fail("--samples must be an integer from 3 through 10.");
}
if (deviceKind === "physical" && requestedSamples !== 10) {
  fail("--device=physical requires --samples=10.");
}

const manifestPath = path.resolve(repositoryRoot, manifestArgument);
const artifactDirectory = path.dirname(manifestPath);
const sqliteResultPath = path.join(artifactDirectory, "sqlite-result.json");
const resultPath = path.join(artifactDirectory, "result.json");
const descriptorPath = path.join(artifactDirectory, "candidate-kdf.json");
const physicalResultPath = path.join(
  artifactDirectory,
  "argon2-physical.json",
);
const physicalDescriptorPath = path.join(
  artifactDirectory,
  "candidate-kdf-physical.json",
);
const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "gym-argon2-"));
const physicalAllowlistDurationMs = 300_000;
const physicalPollIntervalMs = 5_000;
const calibrationParameters = [
  { memoryKiB: 19_456, iterations: 2, parallelism: 1 },
  { memoryKiB: 32_768, iterations: 2, parallelism: 1 },
  { memoryKiB: 65_536, iterations: 2, parallelism: 1 },
  { memoryKiB: 65_536, iterations: 3, parallelism: 1 },
  { memoryKiB: 65_536, iterations: 4, parallelism: 1 },
];
let physicalAllowlistSerial = null;
let physicalAllowlistPackage = null;

function command(name, args, options = {}) {
  const child = spawn(name, args, {
    cwd: repositoryRoot,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeout = options.timeoutMs === undefined
      ? undefined
      : setTimeout(() => {
          if (settled) {
            return;
          }
          settled = true;
          child.kill("SIGKILL");
          reject(new Error(
            `${name} timed out after ${options.timeoutMs} ms: ${args.join(" ")}`,
          ));
        }, options.timeoutMs);
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
      options.onOutput?.(chunk.toString("utf8"));
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
      options.onOutput?.(chunk.toString("utf8"));
    });
    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`${name} exited ${code}: ${stderr || stdout}`));
      }
    });
  });
}

async function writeJson(filePath, value) {
  const temporaryPath = `${filePath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporaryPath, filePath);
}

function adb(serial, ...args) {
  return command("adb", ["-s", serial, ...args], { timeoutMs: 15_000 });
}

function shellQuote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function attachedDevices() {
  const output = await command("adb", ["devices", "-l"], {
    timeoutMs: 15_000,
  });
  return output
    .split(/\r?\n/u)
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({
      serial: line.split(/\s+/u)[0],
      ready: /\sdevice(?:\s|$)/u.test(line),
      emulator: line.startsWith("emulator-")
        || /\bproduct:sdk_/u.test(line)
        || /\bdevice:emu/u.test(line),
    }))
    .filter((device) => device.ready);
}

async function selectPhysicalDevice() {
  const physicalDevices = (await attachedDevices()).filter(
    (device) => !device.emulator,
  );
  if (physicalDevices.length !== 1) {
    throw new Error(
      `exactly one ready physical Android device is required; found ${physicalDevices.length}.`,
    );
  }
  return physicalDevices[0].serial;
}

async function installExactApk(serial, manifest) {
  const apkPath = path.resolve(repositoryRoot, manifest.apk.path);
  await command(
    "adb",
    ["-s", serial, "install", "-r", apkPath],
    { timeoutMs: 180_000 },
  );
  const packagePath = (await adb(
    serial,
    "shell",
    "pm",
    "path",
    manifest.package,
  ))
    .split(/\r?\n/u)
    .find((line) => line.startsWith("package:"))
    ?.slice("package:".length);
  if (!packagePath) {
    throw new Error("installed physical-device package path was not found.");
  }
  const installedApk = path.join(temporaryDirectory, "physical-installed.apk");
  await command(
    "adb",
    ["-s", serial, "pull", packagePath, installedApk],
    { timeoutMs: 180_000 },
  );
  const installedBytes = await readFile(installedApk);
  const installedSha256 = sha256(installedBytes);
  if (installedSha256 !== manifest.apk.sha256) {
    throw new Error("physical-device APK bytes do not match the retained APK.");
  }
  return {
    device_path: packagePath,
    sha256: installedSha256,
    matches_retained_apk: true,
  };
}

async function physicalDeviceMetadata(serial) {
  const [
    api,
    abi,
    model,
    androidRelease,
    memory,
  ] = await Promise.all([
    adb(serial, "shell", "getprop", "ro.build.version.sdk"),
    adb(serial, "shell", "getprop", "ro.product.cpu.abi"),
    adb(serial, "shell", "getprop", "ro.product.model"),
    adb(serial, "shell", "getprop", "ro.build.version.release"),
    adb(serial, "shell", "cat", "/proc/meminfo"),
  ]);
  const memoryKiB = Number(memory.match(/^MemAvailable:\s+(\d+)\s+kB$/mu)?.[1]);
  if (!Number.isSafeInteger(memoryKiB) || memoryKiB < 1) {
    throw new Error("physical-device free memory could not be read.");
  }
  return {
    serialHash: sha256(serial),
    api: Number(api.replace(/\r/gu, "")),
    abi: abi.replace(/\r/gu, ""),
    model: model.replace(/\r/gu, ""),
    androidRelease: androidRelease.replace(/\r/gu, ""),
    freeMemoryBytes: memoryKiB * 1_024,
  };
}

async function assertPhysicalDisplayOff(serial) {
  const display = await adb(serial, "shell", "dumpsys", "display");
  const state = display.match(/Display State=([A-Z]+)/u)?.[1];
  const brightness = display.match(/Display Brightness=([^\s]+)/u)?.[1];
  if (state !== "OFF" || brightness !== "-1.0") {
    throw new Error(
      `physical OLED must remain off; state=${state ?? "unknown"} brightness=${brightness ?? "unknown"}.`,
    );
  }
}

async function preparePhysicalHeadlessExecution(serial, packageName) {
  await adb(serial, "shell", "am", "force-stop", packageName);
  await adb(
    serial,
    "shell",
    "pm",
    "unstop",
    "--user",
    "0",
    packageName,
  );
  await adb(
    serial,
    "shell",
    "cmd",
    "deviceidle",
    "tempwhitelist",
    "-u",
    "0",
    "-d",
    String(physicalAllowlistDurationMs),
    packageName,
  );
  physicalAllowlistSerial = serial;
  physicalAllowlistPackage = packageName;
}

async function releasePhysicalHeadlessExecution(serial, packageName) {
  await adb(
    serial,
    "shell",
    "cmd",
    "deviceidle",
    "tempwhitelist",
    "-u",
    "0",
    "-r",
    packageName,
  );
  physicalAllowlistSerial = null;
  physicalAllowlistPackage = null;
}

async function readLoggedResult(serial) {
  const attempts = deviceKind === "physical" ? 18 : 180;
  const pollIntervalMs = deviceKind === "physical"
    ? physicalPollIntervalMs
    : 500;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (deviceKind === "physical") {
      await assertPhysicalDisplayOff(serial);
    }
    const output = await command(
      "adb",
      [
        "-s",
        serial,
        "logcat",
        "-d",
        "-v",
        "raw",
        "ReactNativeJS:I",
        "*:S",
      ],
      { timeoutMs: 3_000 },
    );
    const payload = output
      .split(/\r?\n/u)
      .findLast((line) => line.includes(RESULT_MARKER))
      ?.split(RESULT_MARKER, 2)[1];
    if (payload) {
      return JSON.parse(payload);
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  throw new Error("Argon2 feasibility result was not logged within 90 seconds.");
}

async function runFeasibility(
  serial,
  manifest,
  {
    iterations,
    memoryKiB,
    samples,
  },
) {
  await adb(serial, "logcat", "-c");
  if (deviceKind === "physical") {
    await preparePhysicalHeadlessExecution(serial, manifest.package);
    await assertPhysicalDisplayOff(serial);
    const output = await adb(
      serial,
      "shell",
      "am",
      "startservice",
      "--user",
      "0",
      "-n",
      `${manifest.package}/.GymTrackerPhysicalTestService`,
      "-e",
      "suite",
      "argon2",
      "--ei",
      "samples",
      String(samples),
      "--ei",
      "memoryKiB",
      String(memoryKiB),
      "--ei",
      "iterations",
      String(iterations),
    );
    if (!/Starting service:/u.test(output)) {
      throw new Error(`physical Headless JS service did not start: ${output}`);
    }
  } else {
    await adb(serial, "shell", "am", "force-stop", manifest.package);
    const runId = `argon2-${Date.now()}`;
    const deepLink = shellQuote(
      `gymtracker-devtest://__argon2-contracts?runId=${runId}&samples=${samples}&memoryKiB=${memoryKiB}&iterations=${iterations}`,
    );
    await adb(
      serial,
      "shell",
      "am",
      "start",
      "-W",
      "-a",
      "android.intent.action.VIEW",
      "-d",
      deepLink,
      manifest.package,
    );
  }
  const feasibility = await readLoggedResult(serial);
  if (deviceKind === "physical") {
    await assertPhysicalDisplayOff(serial);
  }
  if (
    feasibility.parameters?.memoryKiB !== memoryKiB
    || feasibility.parameters?.iterations !== iterations
    || feasibility.parameters?.parallelism !== 1
    || (
      feasibility.status === "passed"
      && feasibility.samplesMs?.length !== samples
    )
  ) {
    throw new Error("Argon2 feasibility result did not match the requested calibration.");
  }
  return feasibility;
}

async function assertNoSecretMaterialInLogcat(serial) {
  const logcat = await command(
    "adb",
    ["-s", serial, "logcat", "-d", "-v", "raw"],
    { timeoutMs: 15_000 },
  );
  const forbidden = [
    "01".repeat(32),
    "02".repeat(16),
    "551d2b516a3d92963b2cd1e8fdc1725129e15824dfb6c8d9bb8a599ffcabfc1c",
  ];
  if (forbidden.some((secret) => logcat.includes(secret))) {
    throw new Error("Argon2 test secret material appeared in logcat.");
  }
}

function summarizeTiming(samplesMs) {
  const sorted = [...samplesMs].sort((left, right) => left - right);
  return {
    sampleCount: samplesMs.length,
    samplesMs,
    minMs: sorted[0] ?? null,
    medianMs: sorted[Math.floor(sorted.length / 2)] ?? null,
    maxMs: sorted.at(-1) ?? null,
  };
}

function failureCodeFor({
  feasibility,
  autolinked,
  packagedLibrariesInspected,
  physicalTimingPassed = true,
}) {
  if (feasibility.status !== "passed") {
    return feasibility.errorCode
      ?? (feasibility.katPassed
        ? "argon2_responsiveness_failed"
        : "argon2_kat_failed");
  }
  if (!autolinked) {
    return "argon2_autolink_failed";
  }
  if (!packagedLibrariesInspected) {
    return "argon2_packaging_failed";
  }
  if (!physicalTimingPassed) {
    return "argon2_physical_timing_out_of_range";
  }
  return null;
}

function assertCandidateMatchesBuild(descriptor, manifest) {
  if (
    descriptor.baseHead !== manifest.base_head
    || descriptor.sourceTreeSha256 !== manifest.source_tree_sha256
    || descriptor.package !== manifest.package
    || descriptor.apk.path !== manifest.apk.path
    || descriptor.apk.sha256 !== manifest.apk.sha256
    || descriptor.apk.sizeBytes !== manifest.apk.size_bytes
    || descriptor.pageSize.alignmentKiB !== manifest.apk.page_alignment_kib
    || descriptor.pageSize.zipalignVerified
      !== manifest.apk.page_alignment_verified
    || descriptor.device.serial !== manifest.device.serial
    || descriptor.device.api !== manifest.device.api
    || descriptor.device.abi !== manifest.device.abi
    || descriptor.device.model !== manifest.device.model
    || descriptor.device.androidRelease !== manifest.device.android_release
  ) {
    throw new Error("candidate descriptor does not match the build manifest.");
  }
}

try {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (
    manifest.schema_version !== 1
    || !["argon2", "phase1"].includes(manifest.suite)
    || manifest.profile !== "development-test"
    || manifest.build_variant !== "release"
    || manifest.js_bundle?.embedded !== true
    || !manifest.device?.serial
    || !manifest.apk?.path
    || !manifest.apk?.sha256
  ) {
    throw new Error(
      "manifest must be an embedded release Argon2 or Phase 1 development-test build.",
    );
  }
  if (deviceKind === "physical" && manifest.suite !== "phase1") {
    throw new Error("--device=physical requires the final Phase 1 build manifest.");
  }
  if (deviceKind === "emulator" && manifest.suite !== "argon2") {
    throw new Error("--device=emulator requires the isolated Argon2 build manifest.");
  }

  const androidHome = process.env.ANDROID_HOME
    ?? process.env.ANDROID_SDK_ROOT
    ?? "/opt/homebrew/share/android-commandlinetools";
  process.env.PATH = [
    path.join(androidHome, "platform-tools"),
    path.join(androidHome, "cmdline-tools", "latest", "bin"),
    process.env.PATH,
  ].join(path.delimiter);

  if (deviceKind === "physical") {
    await command(
      "node",
      [
        "scripts/verify-pr-artifact-roundtrip.mjs",
        path.relative(repositoryRoot, artifactDirectory),
      ],
      { timeoutMs: 180_000 },
    );
  }
  const physicalSerial = deviceKind === "physical"
    ? await selectPhysicalDevice()
    : null;

  if (deviceKind === "emulator") {
    await command(
      "node",
      [
        "scripts/run-native-sqlite-contracts.mjs",
        "--manifest",
        path.relative(repositoryRoot, manifestPath),
        "--assert-all=10",
      ],
      { timeoutMs: 180_000 },
    );
    await copyFile(resultPath, sqliteResultPath);
  }

  const autolinking = JSON.parse(await command(
    "npx",
    ["expo-modules-autolinking", "resolve", "--platform", "android", "--json"],
    { timeoutMs: 30_000 },
  ));
  const argon2Module = autolinking.modules?.find(
    (module) => module.packageName === "argon2-kdf",
  );
  const autolinked = argon2Module?.projects?.some((project) =>
    project.modules?.some(
      (module) =>
        module.classifier === "expo.modules.argon2kdf.Argon2KdfModule",
    ),
  ) === true;

  const apkPath = path.resolve(repositoryRoot, manifest.apk.path);
  const apkanalyzer = path.join(
    androidHome,
    "cmdline-tools",
    "latest",
    "bin",
    "apkanalyzer",
  );
  const packages = await command(
    apkanalyzer,
    ["dex", "packages", "--defined-only", apkPath],
    { timeoutMs: 30_000 },
  );
  const packagedLibrariesInspected =
    packages.includes("expo.modules.argon2kdf.Argon2KdfModule")
    && packages.includes(
      "org.bouncycastle.crypto.generators.Argon2BytesGenerator",
    );

  const runSerial = physicalSerial ?? manifest.device.serial;
  let installedApk = manifest.installed_apk;
  if (physicalSerial !== null) {
    await assertPhysicalDisplayOff(physicalSerial);
    installedApk = await installExactApk(physicalSerial, manifest);
    await assertPhysicalDisplayOff(physicalSerial);
  }
  const physicalDevice = physicalSerial === null
    ? null
    : await physicalDeviceMetadata(physicalSerial);

  let parameters = calibrationParameters[0];
  let feasibility = await runFeasibility(runSerial, manifest, {
    ...parameters,
    samples: requestedSamples,
  });
  if (deviceKind === "physical") {
    for (const candidate of calibrationParameters.slice(1)) {
      const timing = summarizeTiming(feasibility.samplesMs);
      if (
        timing.medianMs !== null
        && timing.medianMs >= 250
        && timing.medianMs <= 750
      ) {
        break;
      }
      if (timing.medianMs !== null && timing.medianMs > 750) {
        break;
      }
      parameters = candidate;
      feasibility = await runFeasibility(runSerial, manifest, {
        ...parameters,
        samples: requestedSamples,
      });
    }
  }
  const feasibilityTiming = summarizeTiming(feasibility.samplesMs);
  await assertNoSecretMaterialInLogcat(runSerial);
  const physicalTimingPassed = deviceKind !== "physical"
    || (
      feasibilityTiming.medianMs !== null
      && feasibilityTiming.medianMs >= 250
      && feasibilityTiming.medianMs <= 750
    );
  const descriptorPassed =
    feasibility.status === "passed"
    && feasibility.katPassed === true
    && feasibility.responsive === true
    && autolinked
    && packagedLibrariesInspected
    && physicalTimingPassed;

  const descriptor = {
    schemaVersion: 2,
    status: descriptorPassed ? "passed" : "blocked",
    failureCode: failureCodeFor({
      feasibility,
      autolinked,
      packagedLibrariesInspected,
      physicalTimingPassed,
    }),
    baseHead: manifest.base_head,
    sourceTreeSha256: manifest.source_tree_sha256,
    apk: {
      path: manifest.apk.path,
      sha256: manifest.apk.sha256,
      sizeBytes: manifest.apk.size_bytes,
    },
    package: manifest.package,
    algorithm: "argon2id",
    provider: {
      name: feasibility.provider,
      version: feasibility.providerVersion,
      mavenCoordinate: "org.bouncycastle:bcprov-jdk18on:1.85.2",
    },
    parameterBounds: {
      memoryKiB: { min: 19_456, max: 19_456 },
      iterations: { min: 2, max: 2 },
      parallelism: { min: 1, max: 1 },
      saltBytes: { min: 16, max: 16 },
      outputBytes: { min: 32, max: 32 },
    },
    kat: {
      id: "owasp-floor-bc-1.85.2-v1",
      passed: feasibility.katPassed,
    },
    feasibilityTiming,
    device: {
      kind: "emulator",
      serial: manifest.device.serial,
      api: manifest.device.api,
      abi: manifest.device.abi,
      model: manifest.device.model,
      androidRelease: manifest.device.android_release,
    },
    cng: {
      cleanPrebuilds: 2,
      autolinked,
    },
    pageSize: {
      alignmentKiB: manifest.apk.page_alignment_kib,
      zipalignVerified: manifest.apk.page_alignment_verified,
      packagedLibrariesInspected,
    },
    physicalDeviceCalibration: {
      status: deviceKind === "physical"
        ? descriptorPassed
          ? "passed"
          : "blocked"
        : "deferred-to-01-10",
      requiredSamples: 10,
      targetMinMs: 250,
      targetMaxMs: 750,
      parameters: physicalDevice === null ? null : parameters,
      timing: physicalDevice === null ? null : feasibilityTiming,
      device: physicalDevice,
    },
    generatedAt: new Date().toISOString(),
  };

  assertCandidateMatchesBuild(descriptor, manifest);
  const outputDescriptorPath = deviceKind === "physical"
    ? physicalDescriptorPath
    : descriptorPath;
  const outputResultPath = deviceKind === "physical"
    ? physicalResultPath
    : resultPath;
  const sqliteResult = deviceKind === "physical"
    ? {}
    : JSON.parse(await readFile(sqliteResultPath, "utf8"));
  await writeJson(outputDescriptorPath, descriptor);
  await writeJson(outputResultPath, {
    ...sqliteResult,
    schema_version: 1,
    suite: deviceKind === "physical" ? "argon2-physical" : "argon2",
    status: descriptor.status,
    build_manifest: path.relative(repositoryRoot, manifestPath),
    base_head: manifest.base_head,
    source_tree_sha256: manifest.source_tree_sha256,
    package: manifest.package,
    apk: manifest.apk,
    installed_apk: installedApk,
    device: deviceKind === "physical"
      ? {
          kind: "physical",
          serial_hash: physicalDevice.serialHash,
          api: physicalDevice.api,
          abi: physicalDevice.abi,
          model: physicalDevice.model,
          android_release: physicalDevice.androidRelease,
          free_memory_bytes: physicalDevice.freeMemoryBytes,
        }
      : manifest.device,
    argon2: {
      descriptor: path.relative(repositoryRoot, outputDescriptorPath),
      status: descriptor.status,
      failureCode: descriptor.failureCode,
      katPassed: descriptor.kat.passed,
      responsive: feasibility.responsive,
      autolinked,
      packagedLibrariesInspected,
      secretLogScan: "passed",
      physicalDeviceCalibration: descriptor.physicalDeviceCalibration.status,
    },
  });

  if (descriptor.status !== "passed") {
    throw new Error(
      `Argon2 feasibility did not satisfy the ${deviceKind} pass gate.`,
    );
  }

  console.log(JSON.stringify({
    ok: true,
    descriptor: path.relative(repositoryRoot, outputDescriptorPath),
    result: path.relative(repositoryRoot, outputResultPath),
    apk_sha256: manifest.apk.sha256,
    device: deviceKind,
    requestedSamples,
    parameters,
    samples_ms: descriptor.feasibilityTiming.samplesMs,
  }));
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    error: "argon2_feasibility_failed",
    message: error.message,
  }));
  process.exitCode = 1;
} finally {
  if (
    physicalAllowlistSerial !== null
    && physicalAllowlistPackage !== null
  ) {
    try {
      const cleanupSerial = physicalAllowlistSerial;
      const cleanupPackage = physicalAllowlistPackage;
      await releasePhysicalHeadlessExecution(
        cleanupSerial,
        cleanupPackage,
      );
      await assertPhysicalDisplayOff(cleanupSerial);
    } catch (error) {
      console.error(JSON.stringify({
        ok: false,
        error: "argon2_feasibility_cleanup_failed",
        message: error.message,
      }));
      process.exitCode = 1;
    }
  }
  await rm(temporaryDirectory, { force: true, recursive: true });
}
