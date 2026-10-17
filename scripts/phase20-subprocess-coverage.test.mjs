import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import { collectPhase20SubprocessCoverage } from "./phase20-subprocess-coverage.mjs";

test("subprocess coverage merges canonical child-process V8 ranges at 100 percent", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "phase20-subprocess-coverage-"));
  try {
    const relativePath = "integrity.mjs";
    const target = path.join(root, relativePath);
    const rawDirectory = path.join(root, "raw");
    mkdirSync(rawDirectory);
    writeFileSync(target, [
      "export function classify(value) {",
      "  if (value) return 'yes';",
      "  return 'no';",
      "}",
      "classify(true);",
      "classify(false);",
      "",
    ].join("\n"));
    const run = spawnSync(process.execPath, [target], {
      cwd: root,
      env: { ...process.env, NODE_V8_COVERAGE: rawDirectory },
      encoding: "utf8",
      timeout: 10_000,
    });
    assert.equal(run.status, 0, run.stderr);

    const report = await collectPhase20SubprocessCoverage({
      projectRoot: root,
      rawDirectory,
      targetFiles: [relativePath],
    });
    assert.deepEqual(report.failures, []);
    assert.deepEqual(
      ["statements", "branches", "functions", "lines"]
        .map((metric) => report.files[relativePath][metric].pct),
      [100, 100, 100, 100],
    );
    assert.deepEqual(report.files[relativePath].uncovered_lines, []);

    const imported = await import(pathToFileURL(target).href);
    assert.equal(imported.classify(true), "yes");
    assert.equal(imported.classify(false), "no");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
