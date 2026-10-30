import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const generated = path.join(root, "src/testing/phase20VisualStateRegistry.generated.ts");
const generatedJson = path.join(root, "src/testing/phase20VisualStateRegistry.json");
const generatedFlow = path.join(root, "maestro/v1.2/visual-production-states.yaml");

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
  const registry = JSON.parse(readFileSync(generatedJson, "utf8"));
  const flow = readFileSync(generatedFlow, "utf8");
  const routeSource = readFileSync(path.join(root, "app/__phase20-visual-probe.tsx"), "utf8");
  for (const route of new Set(registry.map((state) => state.route))) {
    assert.ok(routeSource.includes(`case ${JSON.stringify(route)}:`), `missing production route ${route}`);
  }
  for (const state of registry.filter(({ scenario_steps }) => scenario_steps.length > 0)) {
    assert.match(flow, new RegExp(`VISUAL_STATE == '${state.id}'`, "u"));
  }
  assert.match(flow, /VISUAL_SCREEN_ID/u);
  assert.match(flow, /VISUAL_READY_ID/u);
});

test("an explicitly configured but unavailable external authority fails with a stable code", () => {
  const result = spawnSync(process.execPath, ["scripts/generate-phase20-visual-state-registry.mjs"], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, V12_APPROVED_SOURCE_ROOT: path.join(root, "missing-approved-authority") },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /v12_visual_authority_unavailable_external_authority/u);
  assert.doesNotMatch(result.stderr, /\/Users\//u);
});

test("keeps browser-walk names exact and resolves authority without a private path", () => {
  const walk = JSON.parse(readFileSync(path.join(root, ".planning/design/v1.2-browser-evidence/serial-walk.json"), "utf8"));
  const manifest = JSON.parse(readFileSync(path.join(root, ".planning/design/v1.2-browser-evidence/source-manifest.json"), "utf8"));
  execFileSync(process.execPath, ["scripts/generate-phase20-visual-state-registry.mjs"], {
    cwd: root,
    env: { ...process.env, V12_APPROVED_SOURCE_ROOT: "" },
  });
  const registry = JSON.parse(readFileSync(generatedJson, "utf8"));
  assert.deepEqual(registry.map(({ name }) => name), walk.slice(0, 107).map(({ name }) => name));
  assert.deepEqual(registry.slice(91).map(({ name }) => name), [
    "garmin-disconnected", "garmin-consent", "garmin-connected", "garmin-syncing",
    "garmin-synced", "garmin-idempotent", "garmin-error", "garmin-file-import",
    "garmin-outdoor", "garmin-match-outdoor", "garmin-confirmed-outdoor",
    "garmin-file-import", "garmin-treadmill", "garmin-match-treadmill",
    "garmin-confirmed-treadmill", "garmin-revoked",
  ]);
  assert.doesNotMatch(JSON.stringify(manifest), /\/Users\//u);
  assert.equal(manifest.portable_fallback.kind, "checked_in_derived_contract");
  assert.match(manifest.portable_fallback.renderer_digest, /^[a-f0-9]{64}$/u);
  assert.ok(registry.every(({ reference }) => {
    const binding = reference.kind === "retained_png" ? reference.source : reference;
    return binding.approved_json_sha256 === manifest.sources.find(({ id }) => id === "approved-json").sha256
      && binding.approved_hybrid_html_sha256 === manifest.sources.find(({ id }) => id === "approved-hybrid-html").sha256
      && /^[a-f0-9]{64}$/u.test(binding.renderer_digest)
      && /^[a-f0-9]{64}$/u.test(binding.semantic_digest)
      && /^[a-f0-9]{64}$/u.test(binding.layout_digest);
  }));
});
