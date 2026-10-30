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

export const PHASE18_HOST_TOOLS_COVERAGE_SPEC = Object.freeze({
  language: "python", suite: "phase18-garmin-host-tool-bindings", reportPath: "coverage/phase18/host-tool-bindings-coverage.json",
  runtimeProof: "NON_NATIVE_CONTROLLED_TOOL_PATH_FIXTURES; no compiler/APK/provider proof",
  producerPath: `${hostRoot}/run-host-tool-bindings-coverage.py`,
  sourcePaths: Object.freeze([`${hostRoot}/host_tool_bindings.py`]),
  testPaths: Object.freeze([`${hostRoot}/test_host_tool_bindings.py`]),
  supportPaths: Object.freeze([`${hostRoot}/run-kotlin.py`, `${hostRoot}/seal-kotlin.py`,
    `${hostRoot}/run-host-tool-bindings-coverage.py`, `${hostRoot}/test_host_coverage_producer.py`]),
  metrics: Object.freeze(["statements", "branches", "functions", "lines"]),
  requiredCases: Object.freeze([
    ...["test_android_platform_metadata_and_archive_are_required", "test_default_gradle_home_uses_the_callers_home",
      "test_dependency_missing_ambiguous_or_corrupt_never_falls_back", "test_environment_defaults_sdk_aliases_and_home_expansion",
      "test_exact_java_vendor_version_and_build_are_required", "test_exact_javac_version_is_required",
      "test_gradle_home_and_cache_are_required_without_fallback", "test_java_and_javac_must_be_executable_files",
      "test_missing_relative_and_non_directory_homes_fail_closed", "test_resolves_exact_artifacts_and_preserves_frozen_binding",
      "test_sdk_home_presence_and_consistency", "test_version_probe_errors_are_sanitized"]
      .map(name => `test_host_tool_bindings.BindingValidation.${name}`),
    ...["test_agent_member_is_checked_before_the_compiler_runs", "test_every_missing_pinned_dependency_rejects_before_compilation",
      "test_invalid_toolchain_rejects_both_scripts_before_compilation", "test_runner_and_sealer_use_configured_linux_and_alternate_mac_tools"]
      .map(name => `test_host_tool_bindings.ConfiguredToolchainRegression.${name}`),
  ].sort()),
});

function authoredHostToolCases(source) {
  const cases = [];
  let owner;
  for (const line of source.split(/\r?\n/u)) {
    const declaration = /^class (\w+)\(unittest\.TestCase\):/u.exec(line);
    if (declaration) owner = declaration[1];
    const method = /^    def (test_\w+)\(/u.exec(line);
    if (owner && method) cases.push(`test_host_tool_bindings.${owner}.${method[1]}`);
  }
  return cases.sort();
}

export function validatePhase18HostToolsCoverageReport(report, readBytes = readFileSync) {
  const tools = PHASE18_HOST_TOOLS_COVERAGE_SPEC;
  try {
    validatePhase18LanguageCoverageReport(report, tools, readBytes);
    const source = readBytes(tools.sourcePaths[0]).toString();
    const tests = readBytes(tools.testPaths[0]).toString();
    const functions = [...source.matchAll(/^(?:    )?def \w+\(/gmu)].length;
    if (report.coverage_engine !== "7.16.2" || report.runtime.venv !== true || !/^3\.\d+\.\d+$/u.test(report.runtime.version)
      || report.tests_run !== 16
      || !isDeepStrictEqual([...report.executed_cases].sort(), [...tools.requiredCases])
      || !isDeepStrictEqual(authoredHostToolCases(tests), [...tools.requiredCases])
      || report.source_unchanged !== true || !isDeepStrictEqual(report.missing_functions, []) || !isDeepStrictEqual(report.exclusions, [])
      || /pragma:\s*no\s*(?:cover|branch)|@(?:unittest\.)?skip|\bskipTest\s*\(/iu.test(source + tests)
      || report.producer_sha256 !== hash(readBytes(tools.producerPath))
      || !isDeepStrictEqual(Object.keys(report.coverage).sort(), [...tools.metrics].sort())
      || tools.metrics.some(metric => !isDeepStrictEqual(Object.keys(report.coverage[metric]).sort(), ["covered", "missed", "percent", "total"]))
      || report.coverage.functions.total !== functions) throw new Error("rejected");
  } catch {
    throw new Error("phase18_host_tools_coverage_invalid");
  }
  return true;
}

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
  const output = dependencies.outputDirectory ?? path.join(projectRoot, "coverage/phase18/readiness-host");
  const readBytes = dependencies.readBytes ?? ((file) => readFileSync(path.join(projectRoot, file)));
  const readText = dependencies.readText ?? ((file) => readFileSync(file, "utf8"));
  const exec = dependencies.execFileSync ?? execFileSync;
  const env = { ...(dependencies.env ?? process.env), GARMIN_READINESS_OUTPUT: output, PYTHONDONTWRITEBYTECODE: "1" };
  const python = env.GARMIN_READINESS_PYTHON ?? path.join(projectRoot, ".venv/bin/python");
  if (typeof python !== "string" || !path.isAbsolute(python)) throw new Error("phase18_host_tools_python_invalid");
  const writeReport = dependencies.writeReport ?? ((file, value) => {
    mkdirSync(path.dirname(path.join(projectRoot, file)), { recursive: true });
    writeFileSync(path.join(projectRoot, file), `${JSON.stringify(value, null, 2)}\n`);
  });
  const runHostTools = dependencies.runHostTools ?? (() => {
    mkdirSync(output, { recursive: true });
    const log = exec(python, [PHASE18_HOST_TOOLS_COVERAGE_SPEC.producerPath], { cwd: projectRoot, env, encoding: "utf8", timeout: 120_000 });
    writeFileSync(path.join(output, "host-tool-bindings.log"), log);
  });
  runHostTools();
  const hostToolsReport = JSON.parse(readText(path.join(output, "host-tool-bindings-coverage.json")));
  validatePhase18HostToolsCoverageReport(hostToolsReport, readBytes);
  writeReport(PHASE18_HOST_TOOLS_COVERAGE_SPEC.reportPath, hostToolsReport);
  const runHost = dependencies.runHost ?? (() => {
    mkdirSync(output, { recursive: true });
    // No Gradle runtime classpath change, installation, APK, ADB, or provider call.
    const log = exec(python, [`${hostRoot}/run-kotlin.py`], { cwd: projectRoot, env, encoding: "utf8", timeout: 120_000 });
    writeFileSync(path.join(output, "kotlin-final.log"), log);
    exec(python, [`${hostRoot}/seal-kotlin.py`], { cwd: projectRoot, env, stdio: "inherit", timeout: 120_000 });
  });
  runHost();
  const report = createPhase18KotlinReadinessCoverageReport({
    raw: JSON.parse(readText(path.join(output, "kotlin-four-metrics.json"))),
    jacocoXml: readText(path.join(output, "kotlin-all.xml")),
    log: readText(path.join(output, "kotlin-final.log")), readBytes,
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
