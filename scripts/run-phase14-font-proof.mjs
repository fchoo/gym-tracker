#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assertCleanCommittedTree, sourceTreeSha256 } from "./source-tree-digest.mjs";

const ROOT = process.cwd();
const EXPECTED_MANIFEST = "artifacts/native/phase14-font-proof/build.json";
export const CANONICAL_REPORT = ".planning/phases/14-prototype-visual-shell/evidence/font-axis-proof.json";
const SUPPORT_DIRECTORY = "artifacts/native/phase14-font-proof";
const EXPECTED_SUITE = "phase14-font-proof";
const EXPECTED_PACKAGE = "com.fchoo.gymtracker.devtest";
const EXPECTED_PROFILE = "development-test";
const PROOF_SOURCE = "src/testing/phase14FontProof.ts";
const REVISION18 = Object.freeze({ approved_html_sha256: "b5ddbad88fd465af2fa79475dc0c05efec49e551652f13c5220627730e1d9c96", approved_json_sha256: "b8e91e3098ec443c9dc283ae8383d1af552d7dc2b83648695a01dcb8a89ff0bf" });
const EXPECTED_STYLE = Object.freeze({ font_family: "ArchivoVariable", font_size_px: 57, font_stretch: "condensed", font_weight: 890, letter_spacing_em: -0.07, line_height_px: 49 });
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const isHash = (value, length = 64) => typeof value === "string" && new RegExp(`^[a-f0-9]{${length}}$`, "u").test(value);
const finitePositive = (value) => Number.isFinite(value) && value > 0;

export function parsePhase14FontProofArgs(args = process.argv.slice(2)) {
  let manifest; let verifyExisting = false; let capture = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--manifest") manifest = args[++index];
    else if (arg.startsWith("--manifest=")) manifest = arg.slice("--manifest=".length);
    else if (arg === "--verify-existing") verifyExisting = true;
    else if (arg === "--capture") capture = true;
    else throw new Error("phase14_font_argument_invalid");
  }
  if (manifest !== EXPECTED_MANIFEST || (verifyExisting === capture)) throw new Error("phase14_font_manifest_argument_invalid");
  return { manifest, verifyExisting, capture };
}

export function validatePhase14FontProofManifest(manifest) {
  if (manifest?.schema_version !== 1 || manifest.suite !== EXPECTED_SUITE || manifest.profile !== EXPECTED_PROFILE || manifest.package !== EXPECTED_PACKAGE || manifest.js_bundle?.embedded !== true || !isHash(manifest.base_head, 40) || !isHash(manifest.source_tree_sha256) || typeof manifest.apk?.path !== "string" || !manifest.apk.path.startsWith(`${SUPPORT_DIRECTORY}/`) || manifest.apk.path.includes("..") || !isHash(manifest.apk?.sha256)) throw new Error("phase14_font_manifest_invalid");
  return true;
}

function expectedCaseIds(proofSourceBytes) {
  const ids = proofSourceBytes.toString("utf8").match(/PHASE14_FONT_PROOF_CASE_IDS = \[\s*"(light-390-scale-1)",\s*"(light-390-scale-2)"/u)?.slice(1) ?? [];
  if (ids.length !== 2 || new Set(ids).size !== ids.length) throw new Error("phase14_font_source_case_registry_invalid");
  return ids;
}
function same(value, expected) { return JSON.stringify(value) === JSON.stringify(expected); }
function validDisplayDensity(value) { return Number.isFinite(value) && value >= 0.5 && value <= 8; }
function physicalPixelTolerance(density) { return 1 / density; }
function withinOnePhysicalPixel(value, limit, density) { return value <= limit + physicalPixelTolerance(density) + 1e-9; }
function contained(inner, outer, density) {
  const tolerance = physicalPixelTolerance(density) + 1e-9;
  return inner.x >= outer.x - tolerance && inner.y >= outer.y - tolerance && inner.width <= outer.width + tolerance && inner.height <= outer.height + tolerance && inner.x + inner.width <= outer.x + outer.width + tolerance && inner.y + inner.height <= outer.y + outer.height + tolerance;
}
function validBounds(value) { return value && [value.x, value.y, value.width, value.height].every(Number.isFinite) && value.width > 0 && value.height > 0; }
function validateCase(entry, id, scale) {
  if (entry?.id !== id || entry.status !== "passed" || entry.font_scale !== scale || !isHash(entry.screenshot_sha256) || entry.family !== "ArchivoVariable" || entry.family_loaded !== true || !same(entry.style, EXPECTED_STYLE) || !same(entry.lines, ["Today’s", "workout"])) throw new Error("phase14_font_case_invalid");
  const metrics = entry.metrics;
  if (!validDisplayDensity(entry.display_density) || !metrics || ![metrics.available_width_px, metrics.block_width_px, metrics.block_height_px, ...(metrics.line_advances_px ?? []), ...(metrics.line_heights_px ?? [])].every(finitePositive) || metrics.line_advances_px.length !== 2 || metrics.line_heights_px.length !== 2 || !validBounds(metrics.text_bounds) || !validBounds(metrics.container_bounds)) throw new Error("phase14_font_metrics_invalid");
  if (metrics.line_baselines_px?.length !== 2 || metrics.line_baselines_px.some((line, index) => ![line.ascender_px, line.descender_px, line.y_px, line.height_px, line.baseline_offset_px].every(Number.isFinite) || line.ascender_px < 0 || line.ascender_px > line.height_px || Math.abs(line.descender_px) > line.height_px || line.baseline_offset_px < line.y_px || line.baseline_offset_px > line.y_px + line.height_px || line.y_px + line.height_px > metrics.block_height_px || (index > 0 && line.y_px < metrics.line_baselines_px[index - 1].y_px))) throw new Error("phase14_font_baseline_metrics_invalid");
  if (!withinOnePhysicalPixel(metrics.available_width_px, 335, entry.display_density) || !withinOnePhysicalPixel(metrics.available_width_px, metrics.container_bounds.width, entry.display_density) || !withinOnePhysicalPixel(Math.max(...metrics.line_advances_px), metrics.available_width_px, entry.display_density) || !contained(metrics.text_bounds, metrics.container_bounds, entry.display_density)) throw new Error("phase14_font_crop_overflow_invalid");
}

export function validatePhase14FontProofArtifacts({ manifest, report, currentSourceTreeSha256, apkBytes, proofSourceBytes }) {
  validatePhase14FontProofManifest(manifest);
  // base_head records capture provenance; the source digest is the acceptance
  // identity so later planning-only commits do not invalidate native proof.
  if (manifest.source_tree_sha256 !== currentSourceTreeSha256 || sha256(apkBytes) !== manifest.apk.sha256) throw new Error("phase14_font_manifest_stale");
  if (report?.schema_version !== 2 || report.suite !== EXPECTED_SUITE || report.status !== "passed" || report.source_tree_sha256 !== manifest.source_tree_sha256 || report.apk_sha256 !== manifest.apk.sha256 || report.package !== manifest.package || report.profile !== manifest.profile || report.proof_source_sha256 !== sha256(proofSourceBytes) || report.font_scale_restored !== true || !same(report.revision18, REVISION18) || !Array.isArray(report.cases)) throw new Error("phase14_font_report_identity_invalid");
  const ids = expectedCaseIds(proofSourceBytes);
  report.cases.forEach((entry, index) => validateCase(entry, ids[index], index === 0 ? 1 : 2));
  if (report.cases.length !== ids.length) throw new Error("phase14_font_case_invalid");
  const review = report.overlay_review;
  if (review?.status !== "passed" || !isHash(review.screenshot_sha256) || review.screenshot_sha256 !== report.cases[0]?.screenshot_sha256 || !same({ approved_html_sha256: review.approved_html_sha256, approved_json_sha256: review.approved_json_sha256 }, REVISION18)) throw new Error("phase14_font_overlay_review_invalid");
  return true;
}

function adb(serial, ...args) { return execFileSync("adb", ["-s", serial, ...args], { encoding: "utf8" }); }
export function xmlAttribute(xml, id, attribute) {
  const node = xml.match(new RegExp(`<[^>]+resource-id="[^"]*${id}"[^>]*>`, "u"))?.[0];
  const match = node?.match(new RegExp(
    `${attribute}=(?:"([^"]*)"|'([^']*)')`,
    "u",
  ));
  const value = match?.[1] ?? match?.[2];
  return value
    ?.replace(/&quot;/gu, "\"")
    .replace(/&apos;/gu, "'")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&amp;/gu, "&");
}
function observationFromHierarchy(xml) {
  const raw = xmlAttribute(xml, "phase14-font-proof-observation", "text");
  if (!raw) throw new Error("phase14_font_observation_missing");
  try { return JSON.parse(raw); } catch { throw new Error("phase14_font_observation_invalid"); }
}
function wait(milliseconds) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds); }
function waitForProof(serial, attempts = 30) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const xml = adb(serial, "exec-out", "uiautomator", "dump", "/dev/tty");
    if (xml.includes("phase14-font-proof-root") && xml.includes("phase14-font-proof-observation") && xmlAttribute(xml, "phase14-font-proof-observation", "text")) return observationFromHierarchy(xml);
    wait(1000);
  }
  throw new Error("phase14_font_proof_route_timeout");
}
function installedApkHash(serial, packageName) {
  const remote = adb(serial, "shell", "pm", "path", packageName).split(/\r?\n/u).find((line) => line.startsWith("package:"))?.slice(8);
  if (!remote) throw new Error("phase14_font_installed_apk_missing");
  const temporary = path.join(os.tmpdir(), `phase14-font-proof-${process.pid}.apk`);
  try { adb(serial, "pull", remote, temporary); return sha256(readFileSync(temporary)); } finally { rmSync(temporary, { force: true }); }
}
function reportCase(id, fontScale, observation, screenshotSha256) {
  return { id, status: "passed", font_scale: fontScale, display_density: observation.displayDensity, screenshot_sha256: screenshotSha256, family: observation.family, family_loaded: observation.fontLoaded, style: EXPECTED_STYLE, lines: observation.wrapBreakpoints, metrics: { available_width_px: observation.availableWidthPx, block_width_px: observation.blockWidthPx, block_height_px: observation.blockHeightPx, line_advances_px: observation.lineAdvancesPx, line_heights_px: observation.lineHeightsPx, line_baselines_px: observation.lineBaselinesPx.map((line) => ({ ascender_px: line.ascenderPx, descender_px: line.descenderPx, y_px: line.yPx, height_px: line.heightPx, baseline_offset_px: line.baselineOffsetPx })), text_bounds: observation.textBounds, container_bounds: observation.containerBounds } };
}

export function withRestoredFontScale(runAdb, serial, work) {
  const originalScale = runAdb(serial, "shell", "settings", "get", "system", "font_scale").trim();
  let value;
  try {
    value = work(originalScale);
  } finally {
    runAdb(serial, "shell", "settings", "put", "system", "font_scale", originalScale);
  }
  return { value, fontScaleRestored: true };
}

/** Captures only the proof route's fixed-string JSON and restores font scale even when capture fails. */
export function capturePhase14FontProof({ manifest, root = ROOT, serial = process.env.GYM_TRACKER_ANDROID_SERIAL, runAdb = adb }) {
  if (!serial) throw new Error("phase14_font_device_missing");
  validatePhase14FontProofManifest(manifest);
  const currentHead = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  assertCleanCommittedTree(currentHead, root);
  const sourceDigest = sourceTreeSha256(root);
  const apkPath = path.resolve(root, manifest.apk.path);
  if (!existsSync(apkPath) || manifest.base_head !== currentHead || manifest.source_tree_sha256 !== sourceDigest || sha256(readFileSync(apkPath)) !== manifest.apk.sha256 || installedApkHash(serial, manifest.package) !== manifest.apk.sha256) throw new Error("phase14_font_capture_identity_invalid");
  const restoration = withRestoredFontScale(runAdb, serial, () => {
    const cases = [1, 2].map((fontScale) => {
      runAdb(serial, "shell", "settings", "put", "system", "font_scale", String(fontScale));
      runAdb(serial, "shell", "am", "force-stop", manifest.package);
      runAdb(serial, "shell", "am", "start", "-W", "-a", "android.intent.action.VIEW", "-d", "gymtracker-devtest://__phase2-attended-preview?scenario=phase14-font-axis", manifest.package);
      const observation = waitForProof(serial);
      const screenshot = execFileSync("adb", ["-s", serial, "exec-out", "screencap", "-p"]);
      const screenshotPath = path.join(root, SUPPORT_DIRECTORY, `font-axis-scale-${fontScale}.png`);
      mkdirSync(path.dirname(screenshotPath), { recursive: true }); writeFileSync(screenshotPath, screenshot);
      return reportCase(`light-390-scale-${fontScale}`, fontScale, observation, sha256(screenshot));
    });
    return cases;
  });
  const cases = restoration.value;
  return { schema_version: 2, suite: EXPECTED_SUITE, status: "captured_pending_overlay_review", source_tree_sha256: sourceDigest, apk_sha256: manifest.apk.sha256, package: manifest.package, profile: manifest.profile, proof_source_sha256: sha256(readFileSync(path.join(root, PROOF_SOURCE))), font_scale_restored: restoration.fontScaleRestored, revision18: REVISION18, overlay_review: { status: "pending", screenshot_sha256: cases[0].screenshot_sha256, ...REVISION18 }, cases };
}

export function executePhase14FontProof(args = process.argv.slice(2)) {
  const { manifest: manifestPath, capture } = parsePhase14FontProofArgs(args);
  const manifest = JSON.parse(readFileSync(path.join(ROOT, manifestPath), "utf8"));
  if (capture) {
    const report = capturePhase14FontProof({ manifest });
    mkdirSync(path.join(ROOT, path.dirname(CANONICAL_REPORT)), { recursive: true });
    writeFileSync(path.join(ROOT, CANONICAL_REPORT), `${JSON.stringify(report, null, 2)}\n`);
    return { status: report.status, report: CANONICAL_REPORT };
  }
  const reportPath = path.join(ROOT, CANONICAL_REPORT); const apkPath = path.resolve(ROOT, manifest.apk?.path ?? "");
  if (!existsSync(apkPath) || !existsSync(reportPath)) throw new Error("phase14_font_evidence_missing");
  validatePhase14FontProofArtifacts({ manifest, report: JSON.parse(readFileSync(reportPath, "utf8")), currentHead: execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim(), currentSourceTreeSha256: sourceTreeSha256(ROOT), apkBytes: readFileSync(apkPath), proofSourceBytes: readFileSync(path.join(ROOT, PROOF_SOURCE)) });
  return { status: "passed", report: CANONICAL_REPORT };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(`${JSON.stringify(executePhase14FontProof())}\n`); } catch (error) { process.stderr.write(`${error instanceof Error ? error.message : "phase14_font_unknown_error"}\n`); process.exitCode = 1; }
}
