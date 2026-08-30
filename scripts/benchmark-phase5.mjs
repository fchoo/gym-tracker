#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import {
  loadPhase5Candidate,
  parsePhase5CandidateArguments,
  phase5CandidateIdentity,
  SHA256_PATTERN,
  validatePhase5DeviceIdentity,
  validatePhase5EvidenceIdentity,
} from "./phase5-candidate-evidence.mjs";

export const PHASE5_BENCHMARK_MEASUREMENTS = Object.freeze([
  "production-cold-launch",
  "production-resume-launch",
  "production-data-recovery-navigation",
]);
export const PHASE5_BENCHMARK_THRESHOLDS = Object.freeze({
  minimum_samples: 20,
  maximum_p95_ms: 3000,
});

function percentile95(values) {
  return [...values].sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1];
}

export function validatePhase5BenchmarkEvidence(
  evidence, manifest, manifestSha256, rawReports,
) {
  validatePhase5EvidenceIdentity(
    evidence, manifest, manifestSha256, "phase5-benchmark/v1",
  );
  validatePhase5DeviceIdentity(evidence.device, manifest);
  if (JSON.stringify(evidence.thresholds) !== JSON.stringify(PHASE5_BENCHMARK_THRESHOLDS)
    || !Array.isArray(evidence.measurements)
    || evidence.measurements.length !== PHASE5_BENCHMARK_MEASUREMENTS.length) {
    throw new Error("Phase 5 benchmark threshold or measurement ledger is invalid.");
  }
  for (const [index, id] of PHASE5_BENCHMARK_MEASUREMENTS.entries()) {
    const value = evidence.measurements[index];
    if (value?.id !== id
      || value.samples_requested < PHASE5_BENCHMARK_THRESHOLDS.minimum_samples
      || value.samples_completed !== value.samples_requested
      || value.durations_ms?.length !== value.samples_completed
      || value.p95_ms !== percentile95(value.durations_ms)
      || value.p95_ms > PHASE5_BENCHMARK_THRESHOLDS.maximum_p95_ms
      || !SHA256_PATTERN.test(value.raw_report_sha256 ?? "")
      || typeof value.raw_report_file !== "string") {
      throw new Error(`Phase 5 benchmark raw report or threshold failed: ${id}`);
    }
    const raw = rawReports?.[value.id];
    if (!Buffer.isBuffer(raw)
      || createHash("sha256").update(raw).digest("hex") !== value.raw_report_sha256) {
      throw new Error(`Phase 5 benchmark raw report hash does not match bytes: ${id}`);
    }
  }
}

export function parsePhase5TotalTime(output) {
  const total = Number(output.match(/^TotalTime:\s*(\d+)$/mu)?.[1]);
  if (!Number.isSafeInteger(total) || total < 0) {
    throw new Error("Android launch timing output is malformed.");
  }
  return total;
}

export function parsePhase5LauncherComponent(output, packageName) {
  const lines = output.trim().split(/\r?\n/u).filter(Boolean);
  const component = lines.at(-1) ?? "";
  if (!component.startsWith(`${packageName}/`)
    || !/^[-A-Za-z0-9_.$]+\/[-A-Za-z0-9_.$]+$/u.test(component)) {
    throw new Error("Android launcher component could not be resolved.");
  }
  return component;
}

export function phase5LaunchArguments(launcherComponent, deepLink = null) {
  const args = ["shell", "am", "start", "-W", "-n", launcherComponent];
  if (deepLink !== null) {
    args.push("-a", "android.intent.action.VIEW", "-d", deepLink);
  }
  return args;
}

function runAdb(serial, ...args) {
  return execFileSync("adb", ["-s", serial, ...args], { encoding: "utf8" });
}

export function executePhase5Benchmark(args = process.argv.slice(2)) {
  const options = parsePhase5CandidateArguments(args, new Map([
    ["--serial", "serial"],
    ["--device-json", "deviceJson"],
    ["--output", "output"],
  ]));
  if (!options.serial || !options.deviceJson || !options.output) {
    throw new Error("Phase 5 benchmark requires serial, verified device JSON, and output.");
  }
  const candidate = loadPhase5Candidate(options);
  const device = JSON.parse(
    process.env.PHASE5_DEVICE_JSON ?? readFileSync(options.deviceJson, "utf8"),
  ).device;
  validatePhase5DeviceIdentity(device, candidate.manifest);
  const samples = PHASE5_BENCHMARK_THRESHOLDS.minimum_samples;
  const launcherComponent = parsePhase5LauncherComponent(
    runAdb(
      options.serial, "shell", "cmd", "package", "resolve-activity",
      "--brief", candidate.manifest.source.package,
    ),
    candidate.manifest.source.package,
  );
  const definitions = [
    [PHASE5_BENCHMARK_MEASUREMENTS[0], () => {
      runAdb(options.serial, "shell", "am", "force-stop", candidate.manifest.source.package);
      return runAdb(options.serial, ...phase5LaunchArguments(launcherComponent));
    }],
    [PHASE5_BENCHMARK_MEASUREMENTS[1], () =>
      runAdb(options.serial, ...phase5LaunchArguments(launcherComponent))],
    [PHASE5_BENCHMARK_MEASUREMENTS[2], () =>
      runAdb(options.serial, ...phase5LaunchArguments(
        launcherComponent,
        "gymtracker://more/data-and-recovery",
      ))],
  ];
  const measurements = definitions.map(([id, run]) => {
    const raw = [];
    const durations = [];
    for (let index = 0; index < samples; index += 1) {
      const output = run();
      raw.push(output);
      durations.push(parsePhase5TotalTime(output));
    }
    const rawBytes = Buffer.from(raw.join("\n---\n"));
    const rawFile = `${id}.txt`;
    writeFileSync(path.join(path.dirname(options.output), rawFile), rawBytes);
    return {
      id, samples_requested: samples, samples_completed: samples,
      durations_ms: durations, p95_ms: percentile95(durations),
      raw_report_file: rawFile,
      raw_report_sha256: createHash("sha256").update(rawBytes).digest("hex"),
    };
  });
  const report = {
    schema_version: 1, suite: "phase5", status: "passed",
    mode: "automated-only", approval_status: "evidence_pending",
    attended_scope: "excluded", producer: "phase5-benchmark/v1",
    candidate: phase5CandidateIdentity(candidate.manifest, candidate.manifest_sha256),
    device, thresholds: PHASE5_BENCHMARK_THRESHOLDS, measurements,
  };
  validatePhase5BenchmarkEvidence(
    report, candidate.manifest, candidate.manifest_sha256,
    Object.fromEntries(measurements.map((measurement) => [
      measurement.id,
      readFileSync(path.join(path.dirname(options.output), measurement.raw_report_file)),
    ])),
  );
  writeFileSync(options.output, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

const isMain = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    const report = executePhase5Benchmark();
    process.stdout.write(`${JSON.stringify({ ok: true, measurements: report.measurements.length })}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ ok: false, error: error.message })}\n`);
    process.exitCode = 1;
  }
}
