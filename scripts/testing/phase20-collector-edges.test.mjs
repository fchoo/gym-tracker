import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";
import { collectPhase20ProjectCoverage, collectPhase20SubprocessCoverage, runPhase20SubprocessCoverage } from "../phase20-subprocess-coverage.mjs";

function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), "phase20-collector-edge-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(path.join(root, "target.mjs"), "export const value = 1;\n");
  writeFileSync(path.join(root, "target.test.mjs"), "import test from 'node:test'; test('ok', () => {});\n");
  return root;
}

test("coverage scope, overlap and retained run markers reject before process execution", async t => {
  const root = fixture(t);
  const options = { projectRoot: root, outputDirectory: path.join(root, "coverage"), spawnImplementation: () => assert.fail("must reject before spawn") };
  const valid = { name: "ok", modules: ["target.mjs"], tests: ["target.test.mjs"] };
  for (const projects of [
    [{ ...valid, name: undefined }], [{ ...valid, name: "BAD" }], [valid, valid],
    [{ ...valid, tests: [] }], [{ ...valid, tests: "wrong" }],
    [{ ...valid, modules: [] }], [{ ...valid, modules: "wrong" }], [{ name: "missing-modules", tests: valid.tests }],
    [{ ...valid, coverage: false }], [valid, { ...valid, name: "overlap" }],
  ]) await assert.rejects(runPhase20SubprocessCoverage({ ...options, projects }), /phase20_coverage_/u);
  mkdirSync(options.outputDirectory);
  writeFileSync(path.join(options.outputDirectory, ".process-ownership"), "preserve");
  await assert.rejects(runPhase20SubprocessCoverage({ ...options, projects: [valid] }), /ownership_retained/u);
  assert.equal(readFileSync(path.join(options.outputDirectory, ".process-ownership"), "utf8"), "preserve");
});

test("startup errors survive verified cleanup and malformed skipped summaries never pass", async t => {
  const root = fixture(t);
  for (const report of [null, "", "# skipped 0\n# skipped 0\n", "# skipped 9007199254740992\n"]) {
    const child = new EventEmitter(); child.pid = 9911; child.stdio = [null, null, null, new PassThrough()];
    await assert.rejects(runPhase20SubprocessCoverage({ projectRoot: root, projects: [{ name: "invalid", coverage: false, tests: ["target.test.mjs"] }], outputDirectory: path.join(root, "coverage"),
      platform: "win32", windowsTreeProbeImplementation: () => ({ status: 0, signal: null, stdout: "" }),
      spawnImplementation: () => {
        mkdirSync(path.join(root, "coverage/projects/invalid"), { recursive: true });
        if (report !== null) writeFileSync(path.join(root, "coverage/projects/invalid/test-results.tap"), report);
        queueMicrotask(() => { if (report === null) child.emit("error", new Error("spawn-error")); child.emit("close", 0, null); });
        return child;
      },
    }), report === null ? /spawn-error/u : /report_invalid:invalid/u);
  }
});

test("failed Windows task drains re-probe the tree rather than trusting taskkill status", async t => {
  const root = fixture(t);
  const child = new EventEmitter(); child.pid = 9911; child.stdio = [null, null, null, new PassThrough()];
  let alive = true;
  await runPhase20SubprocessCoverage({ projectRoot: root, projects: [{ name: "drain", coverage: false, tests: ["target.test.mjs"] }], outputDirectory: path.join(root, "coverage"),
    platform: "win32", terminateGraceMs: 5,
    windowsTreeProbeImplementation: () => ({ status: 0, signal: null, stdout: alive ? "9911" : "" }),
    taskkillImplementation: () => { alive = false; return { status: 1 }; },
    spawnImplementation: () => {
      mkdirSync(path.join(root, "coverage/projects/drain"), { recursive: true });
      writeFileSync(path.join(root, "coverage/projects/drain/test-results.tap"), "# skipped 0\n");
      queueMicrotask(() => child.emit("close", 0, null)); return child;
    },
  });
  assert.equal(alive, false);
});

test("child-only collection preserves explicit coverage environments and non-Node child ownership", async t => {
  const root = fixture(t);
  writeFileSync(path.join(root, "target.mjs"), "export const target = () => 1; target();\n");
  writeFileSync(path.join(root, "target.test.mjs"), [
    "import assert from 'node:assert/strict'; import { spawnSync } from 'node:child_process'; import test from 'node:test';",
    "test('keeps explicit environments', () => {",
    " const nonNode = spawnSync('true'); assert.equal(nonNode.status, 0);",
    " const explicit = spawnSync(process.execPath, ['target.mjs'], { env: { ...process.env, NODE_V8_COVERAGE: process.env.NODE_V8_COVERAGE ?? process.env.EXPLICIT_RAW } }); assert.equal(explicit.status, 0);",
    "});", "",
  ].join("\n"));
  // A separate real child stream is not silently relabelled as the project's raw.
  await assert.rejects(runPhase20SubprocessCoverage({ projectRoot: root, projects: [{ name: "explicit", coverage: "children", modules: ["target.mjs"], tests: ["target.test.mjs"], env: { EXPLICIT_RAW: path.join(root, "explicit-raw") } }], outputDirectory: path.join(root, "coverage") }), /no coverage data/u);
});

test("project maps merge real V8 branches while retaining genuinely uncovered code", async t => {
  const root = fixture(t);
  writeFileSync(path.join(root, "target.mjs"), "export function classify(value) { return value ? 'yes' : 'no'; }\nexport function unused() {\n  return 'unused';\n}\nexport function oneSide(value) { return value ? 'hit' : 'miss'; }\noneSide(true);\nclassify(process.argv[2] === 'yes');\n");
  const projects = [];
  for (const argument of ["yes", "no"]) {
    const raw = path.join(root, argument); mkdirSync(raw);
    const execution = spawnSync(process.execPath, [path.join(root, "target.mjs"), argument], { env: { ...process.env, NODE_V8_COVERAGE: raw }, encoding: "utf8" });
    assert.equal(execution.status, 0, execution.stderr);
    projects.push({ modules: ["target.mjs"], rawDirectory: raw });
  }
  writeFileSync(path.join(root, "yes/ignore.txt"), "ignored non-coverage file");
  writeFileSync(path.join(root, "yes/runtime.json"), JSON.stringify({ result: [{ url: "not-a-url", functions: [] }] }));
  writeFileSync(path.join(root, "yes/empty.json"), "{}");
  const report = await collectPhase20ProjectCoverage({ projectRoot: root, projects });
  assert.deepEqual(report.files["target.mjs"].uncovered_functions.map(value => value.name), ["unused"]);
  assert.ok(report.files["target.mjs"].uncovered_lines.length > 0);
  assert.ok(report.files["target.mjs"].uncovered_branches.length > 0);
  assert.ok(report.failures.length > 0);
  const branch = await collectPhase20SubprocessCoverage({ projectRoot: root, rawDirectory: path.join(root, "yes"), targetFiles: ["target.mjs"] });
  assert.ok(branch.files["target.mjs"].uncovered_branches.length > report.files["target.mjs"].uncovered_branches.length);
});
