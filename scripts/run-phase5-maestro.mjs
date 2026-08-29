#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import {
  loadPhase5Candidate,
  parsePhase5CandidateArguments,
  phase5CandidateIdentity,
  SHA256_PATTERN,
  sha256File,
  validatePhase5DeviceIdentity,
  validatePhase5EvidenceIdentity,
} from "./phase5-candidate-evidence.mjs";

export const PHASE5_MAESTRO_FLOW_CONTRACTS = Object.freeze([
  Object.freeze({
    id: "phase5-core-workout-lifecycle",
    flow: "maestro/phase5/core-workout-lifecycle.yaml",
    coverage: Object.freeze([
      "native-sqlite-production-ui-persistence",
      "installed-core-workout-and-lifecycle",
    ]),
  }),
  Object.freeze({
    id: "phase5-history-progress",
    flow: "maestro/phase5/history-progress.yaml",
    coverage: Object.freeze(["installed-history-progress-and-data-recovery"]),
  }),
  Object.freeze({
    id: "phase5-data-recovery",
    flow: "maestro/phase5/data-recovery.yaml",
    coverage: Object.freeze([
      "backup-create-ui",
      "restore-picker-cancel",
      "pre-restore-empty-state",
    ]),
  }),
  Object.freeze({
    id: "phase5-adaptive-accessibility",
    flow: "maestro/phase5/adaptive-accessibility.yaml",
    coverage: Object.freeze(["automated-adaptive-and-accessibility-contracts"]),
  }),
]);

function exactJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function validatePhase5MaestroEvidence(
  evidence,
  manifest,
  manifestSha256,
  rawReports,
) {
  validatePhase5EvidenceIdentity(
    evidence, manifest, manifestSha256, "phase5-maestro/v1",
  );
  validatePhase5DeviceIdentity(evidence.device, manifest);
  if (!Array.isArray(evidence.flows)
    || evidence.flows.length !== PHASE5_MAESTRO_FLOW_CONTRACTS.length) {
    throw new Error("Phase 5 Maestro flow ledger is incomplete.");
  }
  for (const [index, expected] of PHASE5_MAESTRO_FLOW_CONTRACTS.entries()) {
    const actual = evidence.flows[index];
    if (actual?.id !== expected.id
      || actual?.flow !== expected.flow
      || !exactJson(actual?.coverage, expected.coverage)
      || actual.tests < 1
      || actual.failures !== 0
      || actual.errors !== 0
      || actual.skipped !== 0
      || !SHA256_PATTERN.test(actual.raw_report_sha256 ?? "")
      || typeof actual.raw_report_file !== "string") {
      throw new Error("Phase 5 Maestro flow order, coverage, or raw report is invalid.");
    }
    const raw = rawReports?.[actual.id];
    if (!Buffer.isBuffer(raw)
      || createHash("sha256").update(raw).digest("hex") !== actual.raw_report_sha256) {
      throw new Error(`Phase 5 Maestro raw report hash does not match bytes: ${actual.id}`);
    }
  }
  if (evidence.restore_precondition?.auto_backup_disabled !== true
    || evidence.restore_precondition?.d2d_disabled !== true
    || evidence.restore_precondition?.package_absent_before_install !== true
    || evidence.restore_precondition?.pre_restore_state !== "empty") {
    throw new Error("Phase 5 clean restore precondition lacks Auto Backup/D2D control.");
  }
}

function parseJunit(xml, flow) {
  if (!/<testsuites\b/u.test(xml) || !/<testcase\b/u.test(xml)
    || /<(?:failure|error|skipped)\b/u.test(xml)) {
    throw new Error(`Maestro report did not pass: ${flow}`);
  }
  const tests = [...xml.matchAll(/<testcase\b/gu)].length;
  return { tests, failures: 0, errors: 0, skipped: 0 };
}

function adb(serial, ...args) {
  return execFileSync("adb", ["-s", serial, ...args], { encoding: "utf8" }).trim();
}

function adbWith(execute, serial, ...args) {
  return execute("adb", ["-s", serial, ...args], { encoding: "utf8" })
    .toString()
    .trim();
}

function installedDevice(serial, manifest) {
  const packageName = manifest.source.package;
  const apkPath = adb(serial, "shell", "pm", "path", packageName)
    .split(/\r?\n/u).find((line) => line.startsWith("package:"))?.slice(8);
  if (!apkPath) throw new Error("installed production package is missing.");
  const temporary = path.join(process.cwd(), `.phase5-installed-${process.pid}.apk`);
  try {
    execFileSync("adb", ["-s", serial, "pull", apkPath, temporary], { stdio: "ignore" });
    const dumpsys = adb(serial, "shell", "dumpsys", "package", packageName);
    const versionCode = Number(dumpsys.match(/versionCode=(\d+)/u)?.[1]);
    return {
      role: "automated-emulator",
      model: adb(serial, "shell", "getprop", "ro.product.model"),
      api: Number(adb(serial, "shell", "getprop", "ro.build.version.sdk")),
      abi: adb(serial, "shell", "getprop", "ro.product.cpu.abi"),
      serial_sha256: createHash("sha256").update(serial).digest("hex"),
      installed_package: packageName,
      installed_version_code: versionCode,
      installed_apk_sha256: sha256File(temporary),
    };
  } finally {
    try { execFileSync("rm", ["-f", temporary]); } catch { /* best effort */ }
  }
}

export function cleanProductionState(
  serial,
  packageName,
  execute = execFileSync,
) {
  adbWith(execute, serial, "shell", "bmgr", "enable", "false");
  adbWith(
    execute, serial, "shell", "settings", "put", "secure",
    "backup_enabled", "0",
  );
  try { adbWith(execute, serial, "uninstall", packageName); } catch { /* first install */ }
  const packageOutput = adbWith(
    execute, serial, "shell", "pm", "list", "packages", "--user",
    "0", packageName,
  );
  const packageLines = packageOutput.length === 0
    ? []
    : packageOutput.split(/\r?\n/u);
  if (packageLines.some((line) => !/^package:[A-Za-z0-9_.]+$/u.test(line))) {
    throw new Error("production package probe returned malformed output.");
  }
  const installedPackages = packageLines.map((line) => line.slice(8));
  if (installedPackages.includes(packageName)) {
    throw new Error("production package remains before clean restore install.");
  }
  return {
    auto_backup_disabled: true,
    d2d_disabled: true,
    package_absent_before_install: true,
    pre_restore_state: "empty",
  };
}

export function executePhase5Maestro(args = process.argv.slice(2)) {
  const options = parsePhase5CandidateArguments(args, new Map([
    ["--serial", "serial"],
    ["--output", "output"],
  ]));
  if (!options.serial || !options.output) {
    throw new Error("Phase 5 Maestro requires explicit serial and output.");
  }
  const candidate = loadPhase5Candidate(options);
  const manifest = candidate.manifest;
  const apk = manifest.artifacts.find(({ kind }) => kind === "apk");
  const apkPath = path.join(options.bundleDirectory, apk.file);
  const restorePrecondition = cleanProductionState(options.serial, manifest.source.package);
  execFileSync("adb", ["-s", options.serial, "install", apkPath], { stdio: "inherit" });
  const device = installedDevice(options.serial, manifest);
  validatePhase5DeviceIdentity(device, manifest);
  const flows = [];
  for (const contract of PHASE5_MAESTRO_FLOW_CONTRACTS) {
    if (!existsSync(contract.flow)) throw new Error(`missing Maestro flow: ${contract.flow}`);
    const reportPath = path.join(path.dirname(options.output), `${contract.id}.xml`);
    if (contract.id === "phase5-adaptive-accessibility") {
      adb(options.serial, "shell", "settings", "put", "system", "font_scale", "2.0");
    }
    try {
      execFileSync("maestro", ["test", "--format", "junit", "--output", reportPath, contract.flow], {
        env: { ...process.env, ANDROID_SERIAL: options.serial },
        stdio: "inherit",
      });
    } finally {
      if (contract.id === "phase5-adaptive-accessibility") {
        adb(options.serial, "shell", "settings", "put", "system", "font_scale", "1.0");
      }
    }
    flows.push({
      id: contract.id, flow: contract.flow, coverage: contract.coverage,
      ...parseJunit(readFileSync(reportPath, "utf8"), contract.flow),
      raw_report_file: path.basename(reportPath),
      raw_report_sha256: sha256File(reportPath),
    });
  }
  const report = {
    schema_version: 1, suite: "phase5", status: "passed",
    mode: "automated-only", approval_status: "evidence_pending",
    attended_scope: "excluded", producer: "phase5-maestro/v1",
    candidate: phase5CandidateIdentity(manifest, candidate.manifest_sha256),
    device, flows, restore_precondition: restorePrecondition,
  };
  validatePhase5MaestroEvidence(
    report, manifest, candidate.manifest_sha256,
    Object.fromEntries(flows.map((flow) => [
      flow.id, readFileSync(path.join(path.dirname(options.output), flow.raw_report_file)),
    ])),
  );
  writeFileSync(options.output, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

const isMain = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    const result = executePhase5Maestro();
    process.stdout.write(`${JSON.stringify({ ok: true, flows: result.flows.length })}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ ok: false, error: error.message })}\n`);
    process.exitCode = 1;
  }
}
