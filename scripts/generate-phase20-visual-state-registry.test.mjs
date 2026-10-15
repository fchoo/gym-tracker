import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const generated = path.join(root, "src/testing/phase20VisualStateRegistry.generated.ts");

test("generates all 107 ordered browser-walk occurrences with an approved reference binding", () => {
  execFileSync(process.execPath, ["scripts/generate-phase20-visual-state-registry.mjs"], { cwd: root });
  const output = readFileSync(generated, "utf8");
  assert.match(output, /BW-001/u);
  assert.match(output, /BW-107/u);
  assert.equal((output.match(/"id": "BW-/gu) ?? []).length, 107);
  assert.match(output, /"kind": "retained_png"/u);
  assert.match(output, /"kind": "approved_source"/u);
  assert.match(output, /"scenario": "appearance"/u);
  assert.match(output, /"fixture_seed": "phase20-shell-workout"/u);
  assert.match(output, /"readiness": \{/u);
  assert.match(output, /"evidence_scope": "visual_only"/u);
  assert.doesNotMatch(output, /BW-054-only|placeholder|fake UI|\/__v12-production-visual/u);
});
