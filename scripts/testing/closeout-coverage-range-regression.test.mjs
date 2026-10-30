import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { collectPhase20ProjectCoverage, collectPhase20SubprocessCoverage } from "../phase20-subprocess-coverage.mjs";

test("an imported module cannot supply branch hits for a path no execution entered", async t => {
  const root = realpathSync(mkdtempSync(path.join(process.cwd(), "artifacts/native/personal-closeout-20261027/verifier-coverage/range-regression-")));
  const raw = path.join(root, "raw");
  mkdirSync(raw);
  const source = "export function choose(flag) {\n  if (flag) {\n    return 'unexecuted';\n  }\n  return 'executed';\n}\n";
  writeFileSync(path.join(root, "target.mjs"), source);
  writeFileSync(path.join(root, "first.mjs"), "import { choose } from './target.mjs'; if (choose(false) !== 'executed') throw Error('bad result');\n");
  writeFileSync(path.join(root, "second.mjs"), "import './target.mjs';\n");
  for (const file of ["first.mjs", "second.mjs"]) {
    const result = spawnSync(process.execPath, [file], { cwd: root, encoding: "utf8", env: { ...process.env, NODE_V8_COVERAGE: raw } });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
  }
  const report = await collectPhase20SubprocessCoverage({ projectRoot: root, rawDirectory: raw, targetFiles: ["target.mjs"] });
  const sha = bytes => createHash("sha256").update(bytes).digest("hex");
  writeFileSync(path.join(root, "observed-report.json"), JSON.stringify({
    test_only: true, target_source_sha256: sha(source), collector_source_sha256: sha(readFileSync("scripts/phase20-subprocess-coverage.mjs")),
    executions: ["choose(false)", "import only"], actual: report,
    expected: { uncovered_line: 3, branches_less_than_100: true },
    raw_files: readdirSync(raw).map(file => ({ file, sha256: sha(readFileSync(path.join(raw, file))) })),
  }, null, 2) + "\n");
  assert.ok(report.files["target.mjs"].uncovered_lines.includes(3), "the never-entered return statement must stay uncovered");
  assert.ok(report.files["target.mjs"].branches.pct < 100, "the never-entered branch must stay uncovered across an import-only execution");
});

test("cross-project composition preserves a branch every real execution left uncovered", async () => {
  const root = realpathSync(mkdtempSync(path.join(process.cwd(), "artifacts/native/personal-closeout-20261027/verifier-coverage/project-range-regression-")));
  const source = "export function choose(flag) {\n  if (flag) {\n    return 'unexecuted';\n  }\n  return 'executed';\n}\n";
  writeFileSync(path.join(root, "target.mjs"), source);
  writeFileSync(path.join(root, "first.mjs"), "import { choose } from './target.mjs'; if (choose(false) !== 'executed') throw Error('bad result');\n");
  writeFileSync(path.join(root, "second.mjs"), "import './target.mjs';\n");
  const projects = [];
  for (const name of ["first", "second"]) {
    const rawDirectory = path.join(root, `raw-${name}`);
    mkdirSync(rawDirectory);
    const result = spawnSync(process.execPath, [`${name}.mjs`], { cwd: root, encoding: "utf8", env: { ...process.env, NODE_V8_COVERAGE: rawDirectory } });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    projects.push({ name, modules: ["target.mjs"], rawDirectory });
  }
  const report = await collectPhase20ProjectCoverage({ projectRoot: root, projects });
  writeFileSync(path.join(root, "observed-report.json"), JSON.stringify({ test_only: true,
    target_source_sha256: createHash("sha256").update(source).digest("hex"),
    collector_source_sha256: createHash("sha256").update(readFileSync("scripts/phase20-subprocess-coverage.mjs")).digest("hex"),
    actual: report, expected: { uncovered_line: 3, branches_less_than_100: true } }, null, 2) + "\n");
  assert.ok(report.files["target.mjs"].uncovered_lines.includes(3));
  assert.ok(report.files["target.mjs"].branches.pct < 100);
});
