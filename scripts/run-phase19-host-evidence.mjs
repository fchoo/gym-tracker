#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import {
  assertCleanCommittedTree,
  sourceTreeSha256,
} from "./source-tree-digest.mjs";
import {
  PHASE19_HOST_COMMAND_IDS,
  buildPhase19AutomatedOnlyReport,
} from "./verify-phase19-evidence.mjs";

const OUTPUT_PATH = "artifacts/native/phase19/host";
const MAX_COMMANDS = 7;
const MAX_OUTPUT_BYTES = 32 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 180_000;
const COVERAGE_TIMEOUT_MS = 900_000;

function fail(code) {
  throw new Error(code);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function resolveTool(environmentName, moduleId, fallback) {
  const configured = process.env[environmentName];
  if (configured !== undefined) {
    if (!existsSync(configured)) fail("phase19_host_tool_missing");
    return configured;
  }
  try {
    return createRequire(import.meta.url).resolve(moduleId);
  } catch {
    if (existsSync(fallback)) return fallback;
    fail("phase19_host_tool_missing");
  }
}

function artifactRecord(filePath, outputRoot) {
  const bytes = readFileSync(filePath);
  return Object.freeze({
    path: path.relative(outputRoot, filePath),
    sha256: sha256(bytes),
    size_bytes: bytes.length,
  });
}

function commandOutputPath(outputRoot, index, suffix) {
  return path.join(
    outputRoot,
    "commands",
    `${String(index + 1).padStart(2, "0")}-${PHASE19_HOST_COMMAND_IDS[index]}.${suffix}`,
  );
}

function runCommand(input) {
  const startedAt = new Date().toISOString();
  const result = spawnSync(input.executable, input.args, {
    cwd: input.root,
    encoding: null,
    env: { ...process.env, ...input.env },
    timeout: input.timeout_ms ?? DEFAULT_TIMEOUT_MS,
    maxBuffer: MAX_OUTPUT_BYTES,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const stdout = Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(result.stdout ?? "");
  const stderr = Buffer.isBuffer(result.stderr) ? result.stderr : Buffer.from(result.stderr ?? "");
  const stdoutPath = commandOutputPath(input.output_root, input.index, "stdout");
  const stderrPath = commandOutputPath(input.output_root, input.index, "stderr");
  writeFileSync(stdoutPath, stdout);
  writeFileSync(stderrPath, stderr);
  const finishedAt = new Date().toISOString();
  const exitCode = result.status ?? -1;
  const record = Object.freeze({
    id: PHASE19_HOST_COMMAND_IDS[input.index],
    status: result.error === undefined && result.signal === null && exitCode === 0
      ? "PASS" : "FAIL",
    exit_code: exitCode,
    started_at: startedAt,
    finished_at: finishedAt,
    stdout: artifactRecord(stdoutPath, input.output_root),
    stderr: artifactRecord(stderrPath, input.output_root),
  });
  if (record.status !== "PASS") {
    const reason = result.error instanceof Error ? result.error.message : `exit_${exitCode}`;
    throw Object.assign(new Error(`phase19_host_command_failed:${record.id}:${reason}`), {
      record,
    });
  }
  return record;
}

function lastJsonObject(bytes, code) {
  const lines = bytes.toString("utf8").split(/\r?\n/u).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      return JSON.parse(lines[index]);
    } catch {
      // Continue to the preceding retained output line.
    }
  }
  fail(code);
}

function writeTypecheckConfig(root, outputRoot) {
  const dependencyRoot = process.env.PHASE19_NODE_MODULES;
  if (dependencyRoot === undefined) return undefined;
  const dependencyProject = path.dirname(dependencyRoot);
  const configPath = path.join(outputRoot, "typecheck-config.json");
  writeFileSync(configPath, `${JSON.stringify({
    extends: path.join(dependencyProject, "tsconfig.json"),
    compilerOptions: {
      baseUrl: root,
      ignoreDeprecations: "6.0",
      paths: {
        react: [path.join(dependencyRoot, "@types/react/index.d.ts")],
        "react/jsx-runtime": [path.join(dependencyRoot, "@types/react/jsx-runtime.d.ts")],
        "*": [path.join(dependencyRoot, "*"), "*"],
      },
      typeRoots: [path.join(dependencyRoot, "@types")],
      noEmit: true,
    },
    include: [
      path.join(root, "app/**/*.ts"),
      path.join(root, "app/**/*.tsx"),
      path.join(root, "src/**/*.ts"),
      path.join(root, "src/**/*.tsx"),
      path.join(root, "tests/**/*.ts"),
      path.join(root, "modules/**/*.ts"),
      path.join(root, "modules/**/*.tsx"),
      path.join(root, "plugins/**/*.ts"),
    ],
    exclude: ["node_modules", "android", "ios", "coverage"],
  }, null, 2)}\n`);
  return configPath;
}

export function parsePhase19HostEvidenceArgs(args) {
  if (args.length !== 1 || args[0] !== "--automated-only") {
    fail("phase19_host_evidence_arguments_invalid");
  }
  return Object.freeze({ automated_only: true });
}

export function collectPhase19HostEvidence(
  args = process.argv.slice(2),
  root = process.cwd(),
) {
  parsePhase19HostEvidenceArgs(args);
  const sourceHead = execFile("git", ["rev-parse", "HEAD"], root).trim();
  assertCleanCommittedTree(sourceHead, root);
  const sourceTree = sourceTreeSha256(root);
  const outputRoot = path.join(root, OUTPUT_PATH);
  rmSync(outputRoot, { force: true, recursive: true });
  mkdirSync(path.join(outputRoot, "commands"), { recursive: true });
  const jestBin = resolveTool(
    "PHASE19_JEST_BIN",
    "jest/bin/jest.js",
    path.join(root, "node_modules/jest/bin/jest.js"),
  );
  const tscBin = resolveTool(
    "PHASE19_TSC_BIN",
    "typescript/bin/tsc",
    path.join(root, "node_modules/typescript/bin/tsc"),
  );
  const contractResultPath = path.join(outputRoot, "contract-result.json");
  const coverageDirectory = path.join(outputRoot, "coverage-jest");
  const typecheckConfig = writeTypecheckConfig(root, outputRoot);
  const sharedEnvironment = {
    ...(process.env.PHASE19_NODE_MODULES === undefined ? {} : {
      NODE_PATH: [process.env.PHASE19_NODE_MODULES, process.env.NODE_PATH]
        .filter(Boolean).join(path.delimiter),
    }),
  };
  const definitions = [
    {
      executable: process.execPath,
      args: ["--test",
        "scripts/benchmark-phase19-progress.test.mjs",
        "scripts/run-phase19-native-evidence.test.mjs",
        "scripts/verify-phase19-evidence.test.mjs"],
    },
    {
      executable: process.execPath,
      args: [jestBin, "--config", process.env.PHASE19_NODE_MODULES === undefined
        ? "jest.config.js" : "scripts/phase19-coverage.jest.cjs",
      "--selectProjects", "unit", "--runInBand", "--runTestsByPath",
      "src/testing/contracts/progressParity.contract.test.ts"],
      env: { PHASE19_CONTRACT_RESULT_PATH: contractResultPath, ...sharedEnvironment },
    },
    {
      executable: process.execPath,
      args: ["scripts/benchmark-phase19-progress.mjs", "--synthetic"],
      env: sharedEnvironment,
    },
    {
      executable: process.execPath,
      args: ["scripts/run-coverage-gate.mjs", "--focus-phase19", "--runInBand",
        "--coverageDirectory", coverageDirectory],
      env: sharedEnvironment,
      timeout_ms: COVERAGE_TIMEOUT_MS,
    },
    {
      executable: process.execPath,
      args: [tscBin, ...(typecheckConfig === undefined
        ? ["--noEmit"] : ["--project", typecheckConfig])],
      env: sharedEnvironment,
    },
    {
      executable: process.execPath,
      args: ["scripts/check-boundaries.mjs"],
    },
    {
      executable: "git",
      args: ["diff", "--check"],
    },
  ];
  if (definitions.length !== MAX_COMMANDS) fail("phase19_host_command_count_invalid");
  const commands = definitions.map((definition, index) => runCommand({
    ...definition,
    index,
    root,
    output_root: outputRoot,
  }));
  if (!existsSync(contractResultPath)) fail("phase19_host_contract_result_missing");

  const benchmark = lastJsonObject(
    readFileSync(path.join(outputRoot, commands[2].stdout.path)),
    "phase19_host_benchmark_result_missing",
  );
  const benchmarkPath = path.join(outputRoot, "benchmark-result.json");
  writeFileSync(benchmarkPath, `${JSON.stringify(benchmark)}\n`);
  const coverage = lastJsonObject(
    readFileSync(path.join(outputRoot, commands[3].stdout.path)),
    "phase19_host_coverage_result_missing",
  );
  const coveragePath = path.join(outputRoot, "coverage-result.json");
  writeFileSync(coveragePath, `${JSON.stringify(coverage)}\n`);

  assertCleanCommittedTree(sourceHead, root);
  if (sourceTreeSha256(root) !== sourceTree) fail("phase19_host_source_changed");
  const generatedAt = new Date().toISOString();
  const manifest = Object.freeze({
    schema_version: 1,
    suite: "phase19-progress-host",
    producer: "run-phase19-host-evidence/v1",
    producer_sha256: sha256(readFileSync(path.join(root, "scripts/run-phase19-host-evidence.mjs"))),
    run_id: randomBytes(32).toString("hex"),
    status: "PASS",
    source: Object.freeze({ head: sourceHead, tree_sha256: sourceTree }),
    commands: Object.freeze(commands),
    contract_result: artifactRecord(contractResultPath, outputRoot),
    benchmark_result: artifactRecord(benchmarkPath, outputRoot),
    coverage_result: artifactRecord(coveragePath, outputRoot),
    generated_at: generatedAt,
  });
  const manifestPath = path.join(outputRoot, "manifest.json");
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return buildPhase19AutomatedOnlyReport(manifest, {
    root,
    artifact_root: outputRoot,
  });
}

function execFile(name, args, cwd) {
  const result = spawnSync(name, args, {
    cwd,
    encoding: "utf8",
    timeout: 30_000,
    maxBuffer: MAX_OUTPUT_BYTES,
  });
  if (result.error !== undefined || result.status !== 0) fail("phase19_host_git_failed");
  return result.stdout;
}

const isMain = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    process.stdout.write(`${JSON.stringify(collectPhase19HostEvidence())}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      ok: false,
      error: "phase19_host_evidence_failed",
      message: error instanceof Error ? error.message : "phase19_host_evidence_failed",
    })}\n`);
    process.exitCode = 1;
  }
}
