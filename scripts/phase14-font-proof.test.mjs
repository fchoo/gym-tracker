import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  CANONICAL_REPORT,
  parsePhase14FontProofArgs,
  withRestoredFontScale,
  validatePhase14FontProofArtifacts,
  validatePhase14FontProofManifest,
  xmlAttribute,
} from "./run-phase14-font-proof.mjs";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const sourceTreeSha256 = "a".repeat(64);
const apkBytes = Buffer.from("phase14-font-proof-apk");
const apkSha256 = hash(apkBytes);
const proofSource = [
  "export const PHASE14_FONT_PROOF_CASE_IDS = [",
  '  "light-390-scale-1",',
  '  "light-390-scale-2",',
  "];",
  "",
].join("\n");

function fixture() {
  const directory = mkdtempSync(path.join(os.tmpdir(), "phase14-font-proof-"));
  const apk = path.join(directory, "phase14.apk");
  const report = path.join(directory, "font-axis-proof.json");
  writeFileSync(apk, apkBytes);
  writeFileSync(path.join(directory, "phase14FontProof.ts"), proofSource);
  const manifest = {
    schema_version: 1,
    suite: "phase14-font-proof",
    profile: "development-test",
    js_bundle: { embedded: true },
    package: "com.fchoo.gymtracker.devtest",
    base_head: "b".repeat(40),
    source_tree_sha256: sourceTreeSha256,
    apk: { path: "artifacts/native/phase14-font-proof/gym-tracker-phase14-font-proof-devtest.apk", sha256: apkSha256 },
  };
  const evidence = {
    schema_version: 2,
    suite: "phase14-font-proof",
    status: "passed",
    source_tree_sha256: sourceTreeSha256,
    apk_sha256: apkSha256,
    package: "com.fchoo.gymtracker.devtest",
    profile: "development-test",
    proof_source_sha256: hash(proofSource),
    font_scale_restored: true,
    revision18: { approved_html_sha256: "b5ddbad88fd465af2fa79475dc0c05efec49e551652f13c5220627730e1d9c96", approved_json_sha256: "b8e91e3098ec443c9dc283ae8383d1af552d7dc2b83648695a01dcb8a89ff0bf" },
    overlay_review: { status: "passed", screenshot_sha256: "c".repeat(64), approved_html_sha256: "b5ddbad88fd465af2fa79475dc0c05efec49e551652f13c5220627730e1d9c96", approved_json_sha256: "b8e91e3098ec443c9dc283ae8383d1af552d7dc2b83648695a01dcb8a89ff0bf" },
    cases: [
      { id: "light-390-scale-1", status: "passed", font_scale: 1, display_density: 2.625, screenshot_sha256: "c".repeat(64), family: "ArchivoVariable", family_loaded: true, style: { font_family: "ArchivoVariable", font_size_px: 57, font_stretch: "condensed", font_weight: 890, letter_spacing_em: -0.07, line_height_px: 49 }, lines: ["Today’s", "workout"], metrics: { available_width_px: 335, block_width_px: 224, block_height_px: 98, line_advances_px: [191, 224], line_heights_px: [49, 49], line_baselines_px: [{ ascender_px: 37, descender_px: 8, y_px: 0, height_px: 49, baseline_offset_px: 37 }, { ascender_px: 37, descender_px: 8, y_px: 49, height_px: 49, baseline_offset_px: 86 }], text_bounds: { x: 0, y: 0, width: 224, height: 98 }, container_bounds: { x: 0, y: 0, width: 335, height: 98 } } },
      { id: "light-390-scale-2", status: "passed", font_scale: 2, display_density: 2.625, screenshot_sha256: "d".repeat(64), family: "ArchivoVariable", family_loaded: true, style: { font_family: "ArchivoVariable", font_size_px: 57, font_stretch: "condensed", font_weight: 890, letter_spacing_em: -0.07, line_height_px: 49 }, lines: ["Today’s", "workout"], metrics: { available_width_px: 335, block_width_px: 224, block_height_px: 196, line_advances_px: [191, 224], line_heights_px: [98, 98], line_baselines_px: [{ ascender_px: 74, descender_px: 16, y_px: 0, height_px: 98, baseline_offset_px: 74 }, { ascender_px: 74, descender_px: 16, y_px: 98, height_px: 98, baseline_offset_px: 172 }], text_bounds: { x: 0, y: 0, width: 224, height: 196 }, container_bounds: { x: 0, y: 0, width: 335, height: 196 } } },
    ],
  };
  writeFileSync(report, `${JSON.stringify(evidence)}\n`);
  return { apk, directory, evidence, manifest, report };
}

test("font proof rejects stale source, APK, package/profile, fabricated pass reports and skipped cases", () => {
  const value = fixture();
  try {
    assert.equal(validatePhase14FontProofManifest(value.manifest), true);
    assert.throws(() => validatePhase14FontProofManifest({
      ...value.manifest,
      apk: { ...value.manifest.apk, path: "../outside-proof.apk" },
    }), /phase14_font_manifest_invalid/u);
    assert.doesNotThrow(() => validatePhase14FontProofArtifacts({
      manifest: value.manifest,
      report: value.evidence,
      currentHead: value.manifest.base_head,
      currentSourceTreeSha256: sourceTreeSha256,
      apkBytes: readFileSync(value.apk),
      proofSourceBytes: readFileSync(path.join(value.directory, "phase14FontProof.ts")),
    }));
    assert.doesNotThrow(() => validatePhase14FontProofArtifacts({
      manifest: value.manifest,
      report: value.evidence,
      currentHead: "e".repeat(40),
      currentSourceTreeSha256: sourceTreeSha256,
      apkBytes: readFileSync(value.apk),
      proofSourceBytes: readFileSync(path.join(value.directory, "phase14FontProof.ts")),
    }));
    assert.throws(() => validatePhase14FontProofArtifacts({
      manifest: value.manifest,
      report: value.evidence,
      currentHead: "e".repeat(40),
      currentSourceTreeSha256: "f".repeat(64),
      apkBytes: readFileSync(value.apk),
      proofSourceBytes: readFileSync(path.join(value.directory, "phase14FontProof.ts")),
    }), /phase14_font_manifest_stale/u);
    assert.throws(() => validatePhase14FontProofArtifacts({
      manifest: value.manifest,
      report: { ...value.evidence, cases: [{ ...value.evidence.cases[0], status: "skipped" }, value.evidence.cases[1] ] },
      currentHead: value.manifest.base_head,
      currentSourceTreeSha256: sourceTreeSha256,
      apkBytes: readFileSync(value.apk),
      proofSourceBytes: readFileSync(path.join(value.directory, "phase14FontProof.ts")),
    }), /phase14_font_case_invalid/u);
    assert.throws(() => validatePhase14FontProofArtifacts({
      manifest: value.manifest,
      report: { ...value.evidence, overlay_review: { ...value.evidence.overlay_review, status: "pending" } },
      currentHead: value.manifest.base_head,
      currentSourceTreeSha256: sourceTreeSha256,
      apkBytes: readFileSync(value.apk),
      proofSourceBytes: readFileSync(path.join(value.directory, "phase14FontProof.ts")),
    }), /phase14_font_overlay_review_invalid/u);
  } finally {
    rmSync(value.directory, { recursive: true, force: true });
  }
});

test("font proof allows no more than one density-normalized physical pixel", () => {
  const value = fixture();
  try {
    const first = value.evidence.cases[0];
    const withinOnePhysicalPixel = {
      ...first,
      metrics: {
        ...first.metrics,
        available_width_px: 302.8571472167969,
        line_advances_px: [191, 303.23809814453125],
        text_bounds: { x: -(1 / first.display_density), y: -(1 / first.display_density), width: 303.23809814453125, height: 98 + (1 / first.display_density) },
        container_bounds: { x: 0, y: 0, width: 302.8571472167969, height: 98 },
      },
    };
    assert.doesNotThrow(() => validatePhase14FontProofArtifacts({
      manifest: value.manifest, report: { ...value.evidence, cases: [withinOnePhysicalPixel, value.evidence.cases[1]] }, currentHead: value.manifest.base_head, currentSourceTreeSha256: sourceTreeSha256, apkBytes: readFileSync(value.apk), proofSourceBytes: readFileSync(path.join(value.directory, "phase14FontProof.ts")),
    }));
    assert.throws(() => validatePhase14FontProofArtifacts({
      manifest: value.manifest, report: { ...value.evidence, cases: [{ ...withinOnePhysicalPixel, metrics: { ...withinOnePhysicalPixel.metrics, text_bounds: { ...withinOnePhysicalPixel.metrics.text_bounds, width: 303.2382 } }, }, value.evidence.cases[1]] }, currentHead: value.manifest.base_head, currentSourceTreeSha256: sourceTreeSha256, apkBytes: readFileSync(value.apk), proofSourceBytes: readFileSync(path.join(value.directory, "phase14FontProof.ts")),
    }), /phase14_font_crop_overflow_invalid/u);
    for (const invalidDensity of [undefined, Number.NaN, 0, 9]) {
      assert.throws(() => validatePhase14FontProofArtifacts({
        manifest: value.manifest, report: { ...value.evidence, cases: [{ ...first, display_density: invalidDensity }, value.evidence.cases[1]] }, currentHead: value.manifest.base_head, currentSourceTreeSha256: sourceTreeSha256, apkBytes: readFileSync(value.apk), proofSourceBytes: readFileSync(path.join(value.directory, "phase14FontProof.ts")),
      }), /phase14_font_metrics_invalid/u);
    }
  } finally {
    rmSync(value.directory, { recursive: true, force: true });
  }
});

test("font proof waits for the launcher before deep-linking to the proof route", () => {
  assert.equal(CANONICAL_REPORT, ".planning/phases/14-prototype-visual-shell/evidence/font-axis-proof.json");
  const flow = readFileSync(new URL("../maestro/phase14/font-axis.yaml", import.meta.url), "utf8");
  assert.match(flow, /launchApp:[\s\S]*extendedWaitUntil:[\s\S]*Native bootstrap ready\.[\s\S]*openLink:[\s\S]*extendedWaitUntil:[\s\S]*phase14-font-proof-root/u);
  const beforeDeepLink = flow.slice(0, flow.indexOf("openLink:"));
  assert.doesNotMatch(beforeDeepLink, /phase2-attended-preview-unknown/u);
  assert.match(flow, /gymtracker-devtest:\/\/__phase2-attended-preview/u);
  assert.doesNotMatch(flow, /gymtracker-devtest:\/\/\//u);
});

test("font proof waits for the populated observation rather than only its root", () => {
  const runner = readFileSync(new URL("./run-phase14-font-proof.mjs", import.meta.url), "utf8");
  assert.match(runner, /phase14-font-proof-root[\s\S]*phase14-font-proof-observation[\s\S]*xmlAttribute\(xml, "phase14-font-proof-observation", "text"\)/u);
  assert.match(runner, /if \(xml\.includes[\s\S]*wait\(1000\);/u);
});

test("font proof reads Android hierarchy JSON from single- or double-quoted attributes", () => {
  const singleQuoted = '<node text=\'{&quot;family&quot;:&quot;ArchivoVariable&quot;}\' resource-id="phase14-font-proof-observation" />';
  const doubleQuoted = '<node text="{&quot;family&quot;:&quot;ArchivoVariable&quot;}" resource-id="phase14-font-proof-observation" />';

  assert.equal(
    xmlAttribute(singleQuoted, "phase14-font-proof-observation", "text"),
    '{"family":"ArchivoVariable"}',
  );
  assert.equal(
    xmlAttribute(doubleQuoted, "phase14-font-proof-observation", "text"),
    '{"family":"ArchivoVariable"}',
  );
});

test("font proof restores the original font scale when observation fails", () => {
  const calls = [];
  assert.throws(() => withRestoredFontScale((...args) => {
    calls.push(args.join(" "));
    return args.at(-1) === "font_scale" ? "1.3\n" : "";
  }, "emulator-5554", () => { throw new Error("observation failed"); }), /observation failed/u);
  assert.equal(calls.at(-1), "emulator-5554 shell settings put system font_scale 1.3");
});

test("font proof reports restored scale only after the restore command succeeds", () => {
  const calls = [];
  const success = withRestoredFontScale((...args) => {
    calls.push(args.join(" "));
    return args.at(-1) === "font_scale" ? "1.3\n" : "";
  }, "emulator-5554", () => "captured");
  assert.deepEqual(success, { value: "captured", fontScaleRestored: true });
  assert.throws(() => withRestoredFontScale((...args) => {
    calls.push(args.join(" "));
    if (args.includes("put")) throw new Error("restore failed");
    return "1.3\n";
  }, "emulator-5554", () => "captured"), /restore failed/u);
  assert.equal(calls.at(-1), "emulator-5554 shell settings put system font_scale 1.3");
});

test("font proof CLI only accepts an explicit manifest and existing-report mode", () => {
  assert.deepEqual(parsePhase14FontProofArgs([
    "--manifest", "artifacts/native/phase14-font-proof/build.json", "--verify-existing",
  ]), {
    manifest: "artifacts/native/phase14-font-proof/build.json",
    verifyExisting: true,
    capture: false,
  });
  assert.throws(() => parsePhase14FontProofArgs([]), /phase14_font_manifest_argument_invalid/u);
  assert.throws(() => parsePhase14FontProofArgs([
    "--manifest", "other.json", "--verify-existing",
  ]), /phase14_font_manifest_argument_invalid/u);
});
