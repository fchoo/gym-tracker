import childProcess, { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { syncBuiltinESMExports } from "node:module";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const v8ToIstanbul = require("v8-to-istanbul");
const { createCoverageMap } = require("istanbul-lib-coverage");

const PROJECT_TIMEOUT_MS = 30 * 60_000;
const TERMINATE_GRACE_MS = 2_000;
const COVERAGE_METRICS = Object.freeze(["statements", "branches", "functions", "lines"]);

function installChildOnlyCoverage() {
  const rawDirectory = process.env.PHASE20_CHILD_COVERAGE_DIRECTORY;
  const projectRoot = process.env.PHASE20_CHILD_COVERAGE_PROJECT_ROOT;
  if (rawDirectory === undefined || projectRoot === undefined) return;
  const scriptsRoot = realpathSync(path.resolve(projectRoot, "scripts"));
  const originalSpawnSync = childProcess.spawnSync;
  childProcess.spawnSync = (command, args, options = {}) => {
    const entrypoint = Array.isArray(args) && typeof args[0] === "string"
      && !args[0].startsWith("-") ? path.resolve(args[0]) : undefined;
    const relative = entrypoint === undefined ? ".." : path.relative(scriptsRoot, entrypoint);
    const isProductionCli = command === process.execPath
      && relative !== ".."
      && !relative.startsWith(`..${path.sep}`)
      && !path.isAbsolute(relative)
      && relative.endsWith(".mjs");
    if (!isProductionCli) return originalSpawnSync(command, args, options);
    return originalSpawnSync(command, args, {
      ...options,
      env: { ...process.env, ...(options.env ?? {}), NODE_V8_COVERAGE: rawDirectory },
    });
  };
  delete process.env.PHASE20_CHILD_COVERAGE_DIRECTORY;
  delete process.env.PHASE20_CHILD_COVERAGE_PROJECT_ROOT;
  syncBuiltinESMExports();
}

installChildOnlyCoverage();

function signalProcessGroup(child, signal) {
  if (child.pid === undefined) return;
  try {
    if (process.platform === "win32") child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
  }
}

function runTestProject(project, {
  projectRoot,
  rawDirectory,
  projectTimeoutMs,
  terminateGraceMs,
}) {
  return new Promise((resolve, reject) => {
    const { name, tests, concurrency = 1 } = project;
    const environment = { ...process.env, ...(project.env ?? {}) };
    delete environment.NODE_TEST_CONTEXT;
    const childOnlyCoverage = project.coverage === "children";
    if (project.coverage === false || childOnlyCoverage) delete environment.NODE_V8_COVERAGE;
    else environment.NODE_V8_COVERAGE = rawDirectory;
    if (childOnlyCoverage) {
      environment.PHASE20_CHILD_COVERAGE_DIRECTORY = rawDirectory;
      environment.PHASE20_CHILD_COVERAGE_PROJECT_ROOT = projectRoot;
    }
    let timedOut = false;
    let settled = false;
    const child = spawn(process.execPath, [
      "--test",
      `--test-concurrency=${String(concurrency)}`,
      "--test-timeout=600000",
      ...(childOnlyCoverage ? ["--test-isolation=none", `--import=${import.meta.url}`] : []),
      ...tests,
    ], {
      cwd: projectRoot,
      detached: process.platform !== "win32",
      env: environment,
      stdio: "inherit",
    });
    const timeout = setTimeout(() => {
      timedOut = true;
      signalProcessGroup(child, "SIGTERM");
      setTimeout(() => {
        signalProcessGroup(child, "SIGKILL");
        setTimeout(() => {
          if (settled) return;
          settled = true;
          reject(new Error(`phase20_coverage_project_timeout:${name}`));
        }, 25);
      }, terminateGraceMs);
    }, projectTimeoutMs);
    child.once("error", (error) => {
      if (timedOut || settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", (code, signal) => {
      if (timedOut || settled) return;
      settled = true;
      clearTimeout(timeout);
      if (code === 0) resolve();
      else reject(new Error(`phase20_coverage_project_failed:${name}:${String(code)}:${signal ?? "none"}`));
    });
  });
}

async function runBoundedProjects(projects, options, maxParallel) {
  let next = 0;
  const results = new Array(projects.length);
  async function worker() {
    while (next < projects.length) {
      const index = next;
      const project = projects[index];
      next += 1;
      results[index] = await options.run(project);
    }
  }
  await Promise.all(Array.from(
    { length: Math.min(maxParallel, projects.length) },
    () => worker(),
  ));
  return results;
}

async function loadPhase20CoverageMap({
  projectRoot,
  rawDirectory,
  targetFiles,
}) {
  const absoluteTargets = new Map(targetFiles.map((relativePath) => {
    const absolutePath = realpathSync(path.resolve(projectRoot, relativePath));
    return [pathToFileURL(absolutePath).href, { absolutePath, relativePath }];
  }));
  const coverageMap = createCoverageMap({});
  for (const file of readdirSync(rawDirectory).filter((name) => name.endsWith(".json"))) {
    const raw = JSON.parse(readFileSync(path.join(rawDirectory, file), "utf8"));
    for (const script of raw.result ?? []) {
      let normalizedUrl = script.url;
      try {
        const parsed = new URL(script.url);
        parsed.search = "";
        parsed.hash = "";
        normalizedUrl = parsed.href;
      } catch { /* non-file runtime scripts are not coverage targets */ }
      const target = absoluteTargets.get(normalizedUrl);
      if (target === undefined) continue;
      const converter = v8ToIstanbul(target.absolutePath, 0);
      await converter.load();
      converter.applyCoverage(script.functions);
      coverageMap.merge(converter.toIstanbul());
    }
  }

  return { absoluteTargets, coverageMap };
}

function summarizePhase20Coverage({ absoluteTargets, coverageMap }) {
  const files = {};
  const failures = [];
  for (const { absolutePath, relativePath } of absoluteTargets.values()) {
    if (!coverageMap.files().includes(absolutePath)) {
      failures.push(`${relativePath}: no coverage data`);
      continue;
    }
    const summary = coverageMap.fileCoverageFor(absolutePath).toSummary();
    const fileCoverage = coverageMap.fileCoverageFor(absolutePath);
    const summaryJson = summary.toJSON();
    files[relativePath] = {
      ...Object.fromEntries(
      COVERAGE_METRICS.map((metric) => [
        metric,
        summaryJson[metric],
      ]),
      ),
      uncovered_lines: Object.entries(
        fileCoverage.getLineCoverage(),
      ).filter(([, count]) => count === 0).map(([line]) => Number(line)),
      uncovered_functions: Object.entries(fileCoverage.data.f)
        .filter(([, count]) => count === 0)
        .map(([id]) => ({
          name: fileCoverage.data.fnMap[id].name,
          line: fileCoverage.data.fnMap[id].decl.start.line,
        })),
      uncovered_branches: Object.entries(fileCoverage.data.b).flatMap(([id, counts]) =>
        counts.flatMap((count, index) => count === 0 ? [{
          type: fileCoverage.data.branchMap[id].type,
          line: fileCoverage.data.branchMap[id].line,
          location_line: fileCoverage.data.branchMap[id].locations[index]?.start.line,
          index,
        }] : [])),
    };
    for (const metric of COVERAGE_METRICS) {
      if (summary[metric].pct !== 100) {
        failures.push(`${relativePath}: ${metric} ${String(summary[metric].pct)}%`);
      }
    }
  }
  return { files, failures };
}

export async function collectPhase20SubprocessCoverage(options) {
  return summarizePhase20Coverage(await loadPhase20CoverageMap(options));
}

export async function collectPhase20ProjectCoverage({ projectRoot, projects }) {
  const coverageMap = createCoverageMap({});
  const targetFiles = new Set();
  for (const project of projects) {
    for (const module of project.modules) targetFiles.add(module);
    const projectCoverage = await loadPhase20CoverageMap({
      projectRoot,
      rawDirectory: project.rawDirectory,
      targetFiles: project.modules,
    });
    coverageMap.merge(projectCoverage.coverageMap);
  }
  const absoluteTargets = new Map([...targetFiles].map((relativePath) => {
    const absolutePath = realpathSync(path.resolve(projectRoot, relativePath));
    return [pathToFileURL(absolutePath).href, { absolutePath, relativePath }];
  }));
  return summarizePhase20Coverage({ absoluteTargets, coverageMap });
}

function validateCoverageProjects(projects, projectRoot) {
  const names = new Set();
  const registeredTests = new Set();
  const registeredModules = new Set();
  for (const project of projects) {
    const { name, tests, modules = [] } = project;
    if (typeof name !== "string" || !/^[a-z0-9][a-z0-9-]*$/u.test(name) || names.has(name)) {
      throw new Error(`phase20_coverage_project_name_invalid:${String(name)}`);
    }
    names.add(name);
    if (!Array.isArray(tests) || tests.length === 0) {
      throw new Error(`phase20_coverage_project_tests_missing:${name}`);
    }
    if (project.coverage !== false && (!Array.isArray(modules) || modules.length === 0)) {
      throw new Error(`phase20_coverage_project_modules_missing:${name}`);
    }
    if (project.coverage === false && modules.length > 0) {
      throw new Error(`phase20_coverage_disabled_project_has_modules:${name}`);
    }
    for (const test of tests) {
      if (registeredTests.has(test)) {
        throw new Error(`phase20_coverage_project_test_overlap:${test}`);
      }
      registeredTests.add(test);
      if (!existsSync(path.resolve(projectRoot, test))) {
        throw new Error(`phase20_coverage_test_missing:${name}:${test}`);
      }
    }
    for (const module of modules) {
      registeredModules.add(module);
      if (!existsSync(path.resolve(projectRoot, module))) {
        throw new Error(`phase20_coverage_module_missing:${name}:${module}`);
      }
    }
  }
  return {
    registeredModules: [...registeredModules],
    registeredTests: [...registeredTests],
  };
}

export async function runPhase20SubprocessCoverage({
  projectRoot,
  projects,
  maxParallel = 2,
  outputDirectory = path.join(projectRoot, "coverage/phase20-node"),
  projectTimeoutMs = PROJECT_TIMEOUT_MS,
  terminateGraceMs = TERMINATE_GRACE_MS,
}) {
  const { registeredModules, registeredTests } = validateCoverageProjects(projects, projectRoot);
  rmSync(outputDirectory, { force: true, recursive: true });
  mkdirSync(outputDirectory, { recursive: true });
  const projectReports = await runBoundedProjects(projects, {
    run: async (project) => {
      const projectDirectory = path.join(outputDirectory, "projects", project.name);
      const rawDirectory = path.join(projectDirectory, "raw-v8");
      mkdirSync(rawDirectory, { recursive: true });
      await runTestProject(project, {
        projectRoot,
        rawDirectory,
        projectTimeoutMs,
        terminateGraceMs,
      });
      if (project.coverage === false) return {
        coverageMap: createCoverageMap({}),
        files: {},
      };
      const projectCoverage = await loadPhase20CoverageMap({
        projectRoot,
        rawDirectory,
        targetFiles: project.modules,
      });
      const report = summarizePhase20Coverage(projectCoverage);
      writeFileSync(
        path.join(projectDirectory, "coverage-summary.json"),
        `${JSON.stringify(report.files, null, 2)}\n`,
      );
      return {
        coverageMap: projectCoverage.coverageMap,
        files: report.files,
      };
    },
  }, maxParallel);
  const coverageMap = createCoverageMap({});
  for (const projectReport of projectReports) coverageMap.merge(projectReport.coverageMap);
  const absoluteTargets = new Map(registeredModules.map((relativePath) => {
    const absolutePath = realpathSync(path.resolve(projectRoot, relativePath));
    return [pathToFileURL(absolutePath).href, { absolutePath, relativePath }];
  }));
  const report = summarizePhase20Coverage({ absoluteTargets, coverageMap });
  writeFileSync(
    path.join(outputDirectory, "coverage-summary.json"),
    `${JSON.stringify(report.files, null, 2)}\n`,
  );
  if (report.failures.length > 0) {
    throw new Error(JSON.stringify({
      error: "phase20_integrity_coverage_failed",
      failures: report.failures,
    }));
  }
  for (const project of projects) {
    rmSync(path.join(outputDirectory, "projects", project.name, "raw-v8"), {
      recursive: true,
      force: true,
    });
  }
  rmSync(path.join(outputDirectory, "blackbox-fixture"), { recursive: true, force: true });
  console.log(JSON.stringify({
    ok: true,
    project_count: projects.length,
    test_count: registeredTests.length,
    integrity_critical_files: registeredModules.length,
    metrics: COVERAGE_METRICS,
    required_percent: 100,
  }));
}
