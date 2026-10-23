#!/usr/bin/env node

export * from "./kotlin-coverage-evidence.mjs";

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { executePhase18KotlinCoverage as executeGradleCoverage } from "./kotlin-coverage-evidence.mjs";
import { PHASE18_LANGUAGE_COVERAGE_SPECS, validatePhase18LanguageCoverageReport } from "./phase18-language-coverage.mjs";
import { runCliIfMain } from "./node-evidence-utils.mjs";

const spec = PHASE18_LANGUAGE_COVERAGE_SPECS.kotlinReadiness;
const hostRoot = "modules/garmin-connect/android/src/test/host/readiness";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const binding = (paths, readBytes) => paths.map((file) => ({ path: file, sha256: hash(readBytes(file)) }));

export function createPhase18KotlinReadinessCoverageReport({ raw, jacocoXml, log, readBytes }) {
  const invalid = () => { throw new Error("phase18_kotlin_readiness_coverage_invalid"); };
  const inputs = binding([...spec.sourcePaths, ...spec.testPaths, ...spec.supportPaths], readBytes);
  const sortedInputs = (entries) => [...entries].sort((a, b) => a.path.localeCompare(b.path));
  if (raw.status !== "passed" || raw.runtime_proof !== spec.runtimeProof
    || raw.coverage_engine !== "JaCoCo 0.8.13" || raw.skipped !== 0 || raw.failures !== 0 || raw.errors !== 0
    || !Array.isArray(raw.inputs) || !isDeepStrictEqual(sortedInputs(raw.inputs), sortedInputs(inputs))) invalid();
  // The committed runner invokes these three complete classes, without filters.
  // JUnit's successful total must match every source @Test; @Ignore/assumptions
  // cannot convert partial execution into a passed supplemental host receipt.
  const testSources = spec.testPaths.map((file) => readBytes(file).toString());
  const cases = testSources.flatMap((source) => [...source.matchAll(/@Test\s+fun `([^`]+)`/gu)].map((match) => match[1]));
  const counts = [...log.matchAll(/OK \((\d+) tests\)/gu)];
  if (testSources.some((source) => /@Ignore|\bAssume\b|\bassume\w*\s*\(/u.test(source))
    || cases.length !== 22 || new Set(cases).size !== 22 || counts.length !== 1
    || Number(counts[0][1]) !== 22 || raw.tests_run !== 22
    || spec.requiredCases.some((name) => !cases.includes(name))) invalid();
  const classes = new Map([...jacocoXml.matchAll(/<class name="([^"]+)" sourcefilename="([^"]+)">([\s\S]*?)<\/class>/gu)]
    .map((match) => [match[1], { source: match[2], xml: match[3] }]));
  if (!isDeepStrictEqual(Object.keys(raw.classes).sort(), [...spec.requiredClasses].sort())) invalid();
  const coverage = Object.fromEntries(spec.metrics.map((metric) => [metric, { covered: 0, missed: 0, total: 0, percent: 100 }]));
  for (const name of spec.requiredClasses) {
    const entry = classes.get(name);
    const sourceName = name.includes("GarminTransportReadiness") ? "GarminTransportReadiness.kt"
      : name.includes("GarminConnectModule") ? "GarminConnectModule.kt" : "GarminConnectPlatformBindings.kt";
    if (entry?.source !== sourceName) invalid();
    for (const [metric, type] of [["statements", "INSTRUCTION"], ["branches", "BRANCH"], ["functions", "METHOD"], ["lines", "LINE"]]) {
      const matches = [...entry.xml.matchAll(new RegExp(`<counter type="${type}" missed="(\\d+)" covered="(\\d+)"\\s*/>`, "gu"))];
      const match = matches.at(-1);
      const covered = Number(match?.[2] ?? 0);
      const missed = Number(match?.[1] ?? 0);
      if (missed !== 0 || (covered === 0 && !(metric === "branches" && spec.branchlessClasses.includes(name)))) invalid();
      const expected = { covered, missed, total: covered + missed, percent: 100 };
      if (!isDeepStrictEqual(raw.classes[name]?.[metric], expected)) invalid();
      coverage[metric].covered += covered;
      coverage[metric].total += covered;
    }
  }
  // Bind the actual compiled typed callback to its source line, not an old
  // synthetic callback whose index shifted when readiness was inserted.
  const callback = classes.get("expo/modules/garminconnect/GarminConnectModule$definition$1$3");
  const moduleSource = readBytes(spec.sourcePaths[0]).toString().split(/\r?\n/u);
  const line = moduleSource.findIndex((source) => source.includes('AsyncFunction("diagnoseTransportReadiness")')) + 1;
  if (line < 1 || !callback.xml.includes(`name="invokeSuspend" desc="(Ljava/lang/Object;)Ljava/lang/Object;" line="${line}"`)
    || !isDeepStrictEqual(raw.coverage, coverage)) invalid();
  const report = {
    schema_version: 1, suite: spec.suite, status: "passed",
    runtime: { name: "kotlin", version: "jacoco-0.8.13" }, runtime_proof: spec.runtimeProof,
    sources: binding(spec.sourcePaths, readBytes), tests: binding(spec.testPaths, readBytes),
    support: binding(spec.supportPaths, readBytes), tests_run: raw.tests_run,
    skipped: 0, failures: 0, errors: 0, required_cases: [...spec.requiredCases],
    executed_cases: cases.sort(), covered_classes: [...spec.requiredClasses], coverage,
  };
  validatePhase18LanguageCoverageReport(report, spec, readBytes);
  return Object.freeze(report);
}

export function executePhase18KotlinReadinessCoverage(dependencies = {}) {
  const projectRoot = dependencies.projectRoot ?? process.cwd();
  const output = path.join(projectRoot, "coverage/phase18/readiness-host");
  const readBytes = dependencies.readBytes ?? ((file) => readFileSync(path.join(projectRoot, file)));
  const readText = dependencies.readText ?? ((file) => readFileSync(file, "utf8"));
  const exec = dependencies.execFileSync ?? execFileSync;
  const runHost = dependencies.runHost ?? (() => {
    mkdirSync(output, { recursive: true });
    const env = { ...(dependencies.env ?? process.env), GARMIN_READINESS_OUTPUT: output };
    // No Gradle runtime classpath change, installation, APK, ADB, or provider call.
    const log = exec("python3", [`${hostRoot}/run-kotlin.py`], { cwd: projectRoot, env, encoding: "utf8", timeout: 120_000 });
    writeFileSync(path.join(output, "kotlin-final.log"), log);
    exec("python3", [`${hostRoot}/seal-kotlin.py`], { cwd: projectRoot, env, stdio: "inherit", timeout: 120_000 });
  });
  runHost();
  const report = createPhase18KotlinReadinessCoverageReport({
    raw: JSON.parse(readText(path.join(output, "kotlin-four-metrics.json"))),
    jacocoXml: readText(path.join(output, "kotlin-all.xml")),
    log: readText(path.join(output, "kotlin-final.log")), readBytes,
  });
  const writeReport = dependencies.writeReport ?? ((file, value) => {
    mkdirSync(path.dirname(path.join(projectRoot, file)), { recursive: true });
    writeFileSync(path.join(projectRoot, file), `${JSON.stringify(value, null, 2)}\n`);
  });
  writeReport(spec.reportPath, report);
  return report;
}

export function executePhase18KotlinCoverage(dependencies = {}) {
  const report = executeGradleCoverage(dependencies);
  const runReadiness = dependencies.runReadiness ?? executePhase18KotlinReadinessCoverage;
  runReadiness(dependencies);
  return report;
}

export function executePhase18KotlinCoverageCli(dependencies = {}) {
  try {
    const report = executePhase18KotlinCoverage(dependencies);
    process.stdout.write(`${JSON.stringify({ status: report.status, coverage: report.coverage })}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "phase18_kotlin_coverage_failed"}\n`);
    process.exitCode = 1;
  }
}

runCliIfMain(import.meta.url, process.argv[1], executePhase18KotlinCoverageCli);
