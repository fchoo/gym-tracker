#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  lstatSync,
  readFileSync,
  readlinkSync,
} from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const projectRoot = process.cwd();
const artifactArgument = process.argv[2] ?? "artifacts/native/phase1";
const artifactDirectory = path.resolve(projectRoot, artifactArgument);
const failures = [];

function fail(message) {
  failures.push(message);
}

function same(label, actual, expected) {
  if (actual !== expected) {
    fail(`${label}: ${String(actual)} != ${String(expected)}`);
  }
}

async function json(fileName) {
  const filePath = path.join(artifactDirectory, fileName);
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    fail(`${fileName} is not readable JSON: ${error.message}`);
    return {};
  }
}

function sha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function git(...args) {
  return execFileSync("git", args, {
    cwd: projectRoot,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  }).trim();
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

function resolveDownloadedApk(manifest) {
  const declared = manifest.apk?.path;
  const baseName = typeof declared === "string"
    ? path.basename(declared)
    : "gym-tracker-phase1-devtest.apk";
  return path.join(artifactDirectory, baseName);
}

function junit(fileName) {
  const filePath = path.join(artifactDirectory, fileName);
  try {
    const xml = readFileSync(filePath, "utf8");
    const tests = Number(xml.match(/\btests="(\d+)"/u)?.[1] ?? 0);
    const failuresCount = Number(
      xml.match(/\bfailures="(\d+)"/u)?.[1] ?? 0,
    );
    const errors = Number(xml.match(/\berrors="(\d+)"/u)?.[1] ?? 0);
    const skipped = Number(xml.match(/\bskipped="(\d+)"/u)?.[1] ?? 0);
    if (
      tests < 1
      || failuresCount !== 0
      || errors !== 0
      || skipped !== 0
    ) {
      fail(
        `${fileName} did not pass: tests=${tests} failures=${failuresCount} errors=${errors} skipped=${skipped}`,
      );
    }
    return { filePath, tests };
  } catch (error) {
    fail(`${fileName} is unavailable: ${error.message}`);
    return { filePath, tests: 0 };
  }
}

const build = await json("build.json");
const native = await json("result.json");
const maestro = await json("maestro.json");
const benchmark = await json("benchmark.json");
const apkPath = resolveDownloadedApk(build);

same("build schema", build.schema_version, 1);
same("build suite", build.suite, "phase1");
same("build profile", build.profile, "development-test");
same("build variant", build.build_variant, "release");
same("embedded JS bundle", build.js_bundle?.embedded, true);
same("native status", native.status, "passed");
same("Maestro status", maestro.status, "passed");
same("benchmark status", benchmark.status, "passed");
same("current HEAD", build.base_head, git("rev-parse", "HEAD"));
same("current source digest", build.source_tree_sha256, sourceTreeSha256());

for (const [label, evidence] of [
  ["native", native],
  ["Maestro", maestro],
  ["benchmark", benchmark],
]) {
  same(`${label} HEAD`, evidence.base_head, build.base_head);
  same(
    `${label} source digest`,
    evidence.source_tree_sha256,
    build.source_tree_sha256,
  );
  same(`${label} package`, evidence.package, build.package);
  same(`${label} APK digest`, evidence.apk?.sha256, build.apk?.sha256);
  same(`${label} APK size`, evidence.apk?.size_bytes, build.apk?.size_bytes);
  same(`${label} device API`, evidence.device?.api, build.device?.api);
  same(`${label} device ABI`, evidence.device?.abi, build.device?.abi);
}

try {
  const downloadedSha256 = sha256(apkPath);
  same("downloaded APK digest", downloadedSha256, build.apk?.sha256);
  same("native installed APK digest", native.installed_apk?.sha256, downloadedSha256);
  same(
    "Maestro installed APK digest",
    maestro.installed_apk?.sha256,
    downloadedSha256,
  );
  same(
    "benchmark installed APK digest",
    benchmark.installed_apk?.sha256,
    downloadedSha256,
  );
  same("native installed byte match", native.installed_apk?.matches_retained_apk, true);
  same("Maestro installed byte match", maestro.installed_apk?.matches_retained_apk, true);
  same(
    "benchmark installed byte match",
    benchmark.installed_apk?.matches_retained_apk,
    true,
  );
  const entries = execFileSync("unzip", ["-Z1", apkPath], {
    cwd: projectRoot,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  }).split(/\r?\n/u);
  if (!entries.includes("assets/index.android.bundle")) {
    fail("downloaded APK does not contain assets/index.android.bundle.");
  }
} catch (error) {
  fail(`downloaded APK is unavailable: ${error.message}`);
}

same("native contract total", native.contract?.total, 10);
same("native contract passed", native.contract?.passed, 10);
same("native contract failed", native.contract?.failed, 0);
same("native contract skipped", native.contract?.skipped, 0);

if (!Array.isArray(maestro.flows) || maestro.flows.length !== 3) {
  fail("Maestro evidence must contain exactly three flows.");
} else {
  const requiredIds = new Set([
    "full_loop",
    "notifications",
    "airplane_repeat",
  ]);
  for (const flow of maestro.flows) {
    requiredIds.delete(flow.id);
    const reportName = path.basename(flow.report ?? "");
    const report = junit(reportName);
    same(`${flow.id} report digest`, flow.sha256, sha256(report.filePath));
    same(`${flow.id} report tests`, flow.tests, report.tests);
  }
  if (requiredIds.size > 0) {
    fail(`Maestro flows are missing: ${[...requiredIds].join(", ")}`);
  }
}

if (
  benchmark.samples?.completed < 100
  || benchmark.samples?.requested < 100
  || benchmark.samples?.durations_ms?.length !== benchmark.samples?.completed
) {
  fail("benchmark must contain at least 100 complete samples.");
}
if (
  benchmark.samples?.p95_ms > benchmark.thresholds?.maximum_p95_ms
  || benchmark.samples?.maximum_js_task_ms
    > benchmark.thresholds?.maximum_js_task_ms
) {
  fail("benchmark exceeds its recorded thresholds.");
}
same("benchmark minimum samples", benchmark.thresholds?.minimum_samples, 100);

if (!build.apk?.page_alignment_verified || build.apk?.page_alignment_kib !== 16) {
  fail("16 KiB page-alignment proof is missing.");
}

if (failures.length > 0) {
  console.error(JSON.stringify({
    ok: false,
    error: "phase1_artifact_roundtrip_failed",
    failures: failures.slice(0, 50),
  }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  artifact_directory: path.relative(projectRoot, artifactDirectory),
  base_head: build.base_head,
  source_tree_sha256: build.source_tree_sha256,
  apk_sha256: build.apk.sha256,
  native_contracts: native.contract.passed,
  maestro_flows: maestro.flows.length,
  benchmark_samples: benchmark.samples.completed,
  benchmark_p95_ms: benchmark.samples.p95_ms,
}));
