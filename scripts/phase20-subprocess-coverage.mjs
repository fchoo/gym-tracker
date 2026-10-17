import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import {
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

function runTestProject(project, { projectRoot, rawDirectory }) {
  return new Promise((resolve, reject) => {
    const { name, tests, concurrency } = project;
    const environment = { ...process.env, ...(project.env ?? {}) };
    if (project.coverage === false) delete environment.NODE_V8_COVERAGE;
    else environment.NODE_V8_COVERAGE = rawDirectory;
    const child = spawn(process.execPath, [
      "--test",
      `--test-concurrency=${String(concurrency)}`,
      "--test-timeout=600000",
      ...tests,
    ], {
      cwd: projectRoot,
      env: environment,
      stdio: "inherit",
      timeout: PROJECT_TIMEOUT_MS,
      killSignal: "SIGTERM",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`phase20_coverage_project_failed:${name}:${String(code)}:${signal ?? "none"}`));
    });
  });
}

async function runBoundedProjects(projects, options, maxParallel) {
  let next = 0;
  async function worker() {
    while (next < projects.length) {
      const project = projects[next];
      next += 1;
      await runTestProject(project, options);
    }
  }
  await Promise.all(Array.from(
    { length: Math.min(maxParallel, projects.length) },
    () => worker(),
  ));
}

export async function collectPhase20SubprocessCoverage({
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

  const files = {};
  const failures = [];
  for (const { absolutePath, relativePath } of absoluteTargets.values()) {
    if (!coverageMap.files().includes(absolutePath)) {
      failures.push(`${relativePath}: no coverage data`);
      continue;
    }
    const summary = coverageMap.fileCoverageFor(absolutePath).toSummary();
    const summaryJson = summary.toJSON();
    files[relativePath] = {
      ...Object.fromEntries(
      ["statements", "branches", "functions", "lines"].map((metric) => [
        metric,
        summaryJson[metric],
      ]),
      ),
      uncovered_lines: Object.entries(
        coverageMap.fileCoverageFor(absolutePath).getLineCoverage(),
      ).filter(([, count]) => count === 0).map(([line]) => Number(line)),
    };
    for (const metric of ["statements", "branches", "functions", "lines"]) {
      if (summary[metric].pct !== 100) {
        failures.push(`${relativePath}: ${metric} ${String(summary[metric].pct)}%`);
      }
    }
  }
  return { files, failures };
}

export async function runPhase20SubprocessCoverage({
  projectRoot,
  targetFiles,
  projects,
  maxParallel = 2,
  outputDirectory = path.join(projectRoot, "coverage/phase20-node"),
}) {
  const registeredTests = projects.flatMap(({ tests }) => tests);
  if (new Set(registeredTests).size !== registeredTests.length) {
    throw new Error("phase20_coverage_project_test_overlap");
  }
  rmSync(outputDirectory, { force: true, recursive: true });
  const rawDirectory = path.join(outputDirectory, "raw-v8");
  mkdirSync(rawDirectory, { recursive: true });
  await runBoundedProjects(projects, { projectRoot, rawDirectory }, maxParallel);
  const report = await collectPhase20SubprocessCoverage({
    projectRoot,
    rawDirectory,
    targetFiles,
  });
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
  rmSync(rawDirectory, { recursive: true, force: true });
  rmSync(path.join(outputDirectory, "blackbox-fixture"), { recursive: true, force: true });
  console.log(JSON.stringify({
    ok: true,
    project_count: projects.length,
    test_count: registeredTests.length,
    integrity_critical_files: targetFiles.length,
    metrics: ["statements", "branches", "functions", "lines"],
    required_percent: 100,
  }));
}
