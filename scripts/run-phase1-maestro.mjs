#!/usr/bin/env node

import {
  execFileSync,
  spawn,
} from "node:child_process";
import { createHash } from "node:crypto";
import {
  createReadStream,
  existsSync,
  lstatSync,
  readFileSync,
  readlinkSync,
} from "node:fs";
import {
  readFile,
  rename,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const projectRoot = process.cwd();
const args = process.argv.slice(2);
let manifestArgument = "artifacts/native/phase1/build.json";

function fail(message) {
  console.error(JSON.stringify({
    ok: false,
    error: "phase1_maestro_failed",
    message,
  }));
  process.exit(1);
}

for (let index = 0; index < args.length; index += 1) {
  const argument = args[index];
  if (argument === "--manifest") {
    manifestArgument = args[index + 1] ?? "";
    index += 1;
  } else if (argument.startsWith("--manifest=")) {
    manifestArgument = argument.slice("--manifest=".length);
  } else {
    fail(`unknown argument: ${argument}`);
  }
}

if (!manifestArgument) {
  fail("--manifest is required.");
}

const manifestPath = path.resolve(projectRoot, manifestArgument);
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const artifactDirectory = path.dirname(manifestPath);
const resultPath = path.join(artifactDirectory, "maestro.json");
const reports = [
  {
    id: "full_loop",
    flow: "maestro/smoke/phase1-full-loop.yaml",
    report: "maestro-full-loop.xml",
    airplane: false,
  },
  {
    id: "notifications",
    flow: "maestro/smoke/phase1-denied-late-notifications.yaml",
    report: "maestro-notifications.xml",
    airplane: false,
  },
  {
    id: "airplane_repeat",
    flow: "maestro/smoke/phase1-airplane-repeat.yaml",
    report: "maestro-airplane.xml",
    airplane: true,
  },
];
const androidHome = process.env.ANDROID_HOME
  ?? process.env.ANDROID_SDK_ROOT
  ?? "/opt/homebrew/share/android-commandlinetools";
const adbExecutable = path.join(androidHome, "platform-tools", "adb");

function command(name, commandArgs, options = {}) {
  const child = spawn(name, commandArgs, {
    cwd: projectRoot,
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
            `${name} timed out after ${options.timeoutMs} ms`,
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
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(error);
      }
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

function adb(...adbArgs) {
  return command(adbExecutable, ["-s", manifest.device.serial, ...adbArgs]);
}

async function sha256(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

function sourceTreeSha256() {
  const output = execFileSync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    { cwd: projectRoot, maxBuffer: 16 * 1024 * 1024 },
  );
  const excluded = /^(?:android|ios|node_modules|artifacts|\.expo|\.gradle|\.kotlin|\.cache|coverage|dist|web-build)(?:\/|$)|^modules\/[^/]+\/android\/build(?:\/|$)|(?:^|\/)\.metro-health-check|\.tsbuildinfo$/;
  const files = output.toString("utf8").split("\0")
    .filter(Boolean)
    .filter((filePath) => !excluded.test(filePath))
    .sort((left, right) =>
      Buffer.compare(Buffer.from(left), Buffer.from(right))
    );
  const hash = createHash("sha256");
  for (const filePath of files) {
    const details = lstatSync(filePath);
    const type = details.isSymbolicLink()
      ? "symlink"
      : details.isFile()
        ? "file"
        : "other";
    const contents = details.isSymbolicLink()
      ? Buffer.from(readlinkSync(filePath))
      : details.isFile()
        ? readFileSync(filePath)
        : Buffer.alloc(0);
    const pathBytes = Buffer.from(filePath);
    hash.update(Buffer.from(
      `${pathBytes.length}\0${type}\0${(details.mode & 0o777).toString(8)}\0${contents.length}\0`,
    ));
    hash.update(pathBytes);
    hash.update(Buffer.from("\0"));
    hash.update(contents);
    hash.update(Buffer.from("\0"));
  }
  return hash.digest("hex");
}

function junitSummary(xml) {
  const tests = Number(xml.match(/\btests="(\d+)"/u)?.[1] ?? 0);
  const failures = Number(xml.match(/\bfailures="(\d+)"/u)?.[1] ?? 0);
  const errors = Number(xml.match(/\berrors="(\d+)"/u)?.[1] ?? 0);
  const skipped = Number(xml.match(/\bskipped="(\d+)"/u)?.[1] ?? 0);
  return { tests, failures, errors, skipped };
}

async function setAirplaneMode(enabled) {
  await adb(
    "shell",
    "cmd",
    "connectivity",
    "airplane-mode",
    enabled ? "enable" : "disable",
  );
  const state = await adb(
    "shell",
    "cmd",
    "connectivity",
    "airplane-mode",
  );
  if (state !== (enabled ? "enabled" : "disabled")) {
    throw new Error(`airplane mode did not become ${enabled ? "enabled" : "disabled"}.`);
  }
}

async function prepareInteractiveDevice() {
  await adb("shell", "input", "keyevent", "KEYCODE_WAKEUP");
  await adb("shell", "wm", "dismiss-keyguard");
  await adb("shell", "cmd", "statusbar", "collapse");
  const policy = await adb("shell", "dumpsys", "window", "policy");
  if (/showing=true/u.test(policy)) {
    throw new Error(
      "interactive device remained keyguard-locked after normal dismissal.",
    );
  }
}

try {
  if (
    manifest.schema_version !== 1
    || manifest.profile !== "development-test"
    || manifest.suite !== "phase1"
    || manifest.build_variant !== "release"
    || manifest.js_bundle?.embedded !== true
    || !manifest.device?.serial
    || !manifest.package
  ) {
    throw new Error(
      "manifest must be Phase 1 embedded release development-test evidence.",
    );
  }
  const apkPath = path.resolve(projectRoot, manifest.apk?.path ?? "");
  if (!existsSync(apkPath)) {
    throw new Error(`retained APK is missing: ${apkPath}`);
  }
  const head = await command("git", ["rev-parse", "HEAD"]);
  if (head !== manifest.base_head) {
    throw new Error("manifest HEAD does not match current HEAD.");
  }
  if (manifest.source_tree_sha256 !== sourceTreeSha256()) {
    throw new Error("manifest source digest does not match current source.");
  }
  if (manifest.apk.sha256 !== await sha256(apkPath)) {
    throw new Error("retained APK digest does not match manifest.");
  }
  const flowResults = [];
  for (const flow of reports) {
    await prepareInteractiveDevice();
    const reportPath = path.join(artifactDirectory, flow.report);
    if (flow.airplane) {
      await setAirplaneMode(true);
    }
    try {
      await command(
        "maestro",
        [
          "test",
          "--no-ansi",
          "--format", "junit",
          "--output", reportPath,
          "--udid", manifest.device.serial,
          flow.flow,
        ],
        {
          timeoutMs: 20 * 60_000,
          onOutput: (output) => process.stdout.write(output),
        },
      );
    } finally {
      if (flow.airplane) {
        await setAirplaneMode(false);
      }
    }
    const xml = await readFile(reportPath, "utf8");
    const summary = junitSummary(xml);
    if (
      summary.tests < 1
      || summary.failures !== 0
      || summary.errors !== 0
      || summary.skipped !== 0
    ) {
      throw new Error(`Maestro report did not pass: ${flow.id}`);
    }
    flowResults.push({
      id: flow.id,
      flow: flow.flow,
      report: path.relative(projectRoot, reportPath),
      sha256: await sha256(reportPath),
      ...summary,
      airplane_mode: flow.airplane,
    });
  }

  const installedPath = (await adb(
    "shell",
    "pm",
    "path",
    manifest.package,
  )).split(/\r?\n/u)
    .find((line) => line.startsWith("package:"))
    ?.slice("package:".length);
  if (!installedPath) {
    throw new Error("installed package path is unavailable.");
  }
  const installedBytes = await new Promise((resolve, reject) => {
    const child = spawn(
      adbExecutable,
      ["-s", manifest.device.serial, "exec-out", "cat", installedPath],
      { cwd: projectRoot, stdio: ["ignore", "pipe", "pipe"] },
    );
    const chunks = [];
    let stderr = "";
    child.stdout.on("data", (chunk) => chunks.push(chunk));
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(chunks));
      } else {
        reject(new Error(`adb installed-byte read failed: ${stderr}`));
      }
    });
  });
  const installedSha256 = createHash("sha256")
    .update(installedBytes)
    .digest("hex");
  const result = {
    schema_version: 1,
    suite: "phase1",
    status: installedSha256 === manifest.apk.sha256 ? "passed" : "failed",
    build_manifest: path.relative(projectRoot, manifestPath),
    base_head: manifest.base_head,
    source_tree_sha256: manifest.source_tree_sha256,
    package: manifest.package,
    apk: manifest.apk,
    installed_apk: {
      device_path: installedPath,
      sha256: installedSha256,
      matches_retained_apk: installedSha256 === manifest.apk.sha256,
    },
    device: manifest.device,
    flows: flowResults,
    assertions: [
      "fresh activation reaches the workout",
      "working set rest survives Android process death",
      "8 / 8 / 7 produces a hold recommendation",
      "effort remains optional and acceptance is explicit",
      "permission denial, grant, missing request, late payload, and stale payload remain non-authoritative",
      "three complete workout lifecycles pass while airplane mode is enabled",
    ],
    recorded_at: new Date().toISOString(),
  };
  const temporaryResult = `${resultPath}.tmp`;
  await writeFile(temporaryResult, `${JSON.stringify(result, null, 2)}\n`);
  await rename(temporaryResult, resultPath);
  if (result.status !== "passed") {
    throw new Error("installed APK bytes differ from retained Phase 1 APK.");
  }
  console.log(JSON.stringify({
    ok: true,
    result: path.relative(projectRoot, resultPath),
    flows: flowResults.length,
    tests: flowResults.reduce((total, flow) => total + flow.tests, 0),
    apk_sha256: manifest.apk.sha256,
  }));
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    error: "phase1_maestro_failed",
    message: error.message,
  }));
  process.exitCode = 1;
} finally {
  await setAirplaneMode(false).catch(() => undefined);
}
