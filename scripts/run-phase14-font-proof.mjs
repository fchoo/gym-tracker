#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { sourceTreeSha256 } from "./source-tree-digest.mjs";

const ROOT = process.cwd();
const EXPECTED_MANIFEST = "artifacts/native/phase14-font-proof/build.json";
const EXPECTED_SUITE = "phase14-font-proof";
const EXPECTED_PACKAGE = "com.fchoo.gymtracker.devtest";
const EXPECTED_PROFILE = "development-test";
const PROOF_SOURCE = "src/testing/phase14FontProof.ts";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const isHash = (value, length = 64) => typeof value === "string"
  && new RegExp(`^[a-f0-9]{${length}}$`, "u").test(value);

export function parsePhase14FontProofArgs(args = process.argv.slice(2)) {
  let manifest;
  let verifyExisting = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--manifest") {
      manifest = args[++index];
    } else if (arg.startsWith("--manifest=")) {
      manifest = arg.slice("--manifest=".length);
    } else if (arg === "--verify-existing") {
      verifyExisting = true;
    } else {
      throw new Error("phase14_font_argument_invalid");
    }
  }
  if (manifest !== EXPECTED_MANIFEST || !verifyExisting) {
    throw new Error("phase14_font_manifest_argument_invalid");
  }
  return { manifest, verifyExisting };
}

export function validatePhase14FontProofManifest(manifest) {
  if (manifest?.schema_version !== 1
    || manifest.suite !== EXPECTED_SUITE
    || manifest.profile !== EXPECTED_PROFILE
    || manifest.package !== EXPECTED_PACKAGE
    || manifest.js_bundle?.embedded !== true
    || !isHash(manifest.base_head, 40)
    || !isHash(manifest.source_tree_sha256)
    || typeof manifest.apk?.path !== "string"
    || !isHash(manifest.apk?.sha256)) {
    throw new Error("phase14_font_manifest_invalid");
  }
  return true;
}

function expectedCaseIds(proofSourceBytes) {
  const match = proofSourceBytes.toString("utf8").match(
    /PHASE14_FONT_PROOF_CASE_IDS = \[\s*"(light-390-scale-1)",\s*"(light-390-scale-2)",\s*\]/u,
  );
  const ids = match?.slice(1) ?? [];
  if (ids.length !== 2 || new Set(ids).size !== ids.length) {
    throw new Error("phase14_font_source_case_registry_invalid");
  }
  return ids;
}

export function validatePhase14FontProofArtifacts({
  manifest,
  report,
  currentHead,
  currentSourceTreeSha256,
  apkBytes,
  proofSourceBytes,
}) {
  validatePhase14FontProofManifest(manifest);
  if (manifest.base_head !== currentHead
    || manifest.source_tree_sha256 !== currentSourceTreeSha256
    || sha256(apkBytes) !== manifest.apk.sha256) {
    throw new Error("phase14_font_manifest_stale");
  }
  if (report?.schema_version !== 1
    || report.suite !== EXPECTED_SUITE
    || report.status !== "passed"
    || report.source_tree_sha256 !== manifest.source_tree_sha256
    || report.apk_sha256 !== manifest.apk.sha256
    || report.package !== manifest.package
    || report.profile !== manifest.profile
    || report.proof_source_sha256 !== sha256(proofSourceBytes)
    || !Array.isArray(report.cases)) {
    throw new Error("phase14_font_report_identity_invalid");
  }
  const expectedIds = expectedCaseIds(proofSourceBytes);
  if (report.cases.length !== expectedIds.length
    || report.cases.some((entry, index) => entry?.id !== expectedIds[index]
      || entry.status !== "passed"
      || !isHash(entry.screenshot_overlay_sha256))) {
    throw new Error("phase14_font_case_invalid");
  }
  return true;
}

export function executePhase14FontProof(args = process.argv.slice(2)) {
  const { manifest: manifestPath } = parsePhase14FontProofArgs(args);
  const manifest = JSON.parse(readFileSync(path.join(ROOT, manifestPath), "utf8"));
  const reportPath = path.join(path.dirname(path.join(ROOT, manifestPath)), "font-axis-proof.json");
  const apkPath = path.resolve(ROOT, manifest.apk?.path ?? "");
  if (!existsSync(apkPath) || !existsSync(reportPath)) {
    throw new Error("phase14_font_evidence_missing");
  }
  validatePhase14FontProofArtifacts({
    manifest,
    report: JSON.parse(readFileSync(reportPath, "utf8")),
    currentHead: execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim(),
    currentSourceTreeSha256: sourceTreeSha256(ROOT),
    apkBytes: readFileSync(apkPath),
    proofSourceBytes: readFileSync(path.join(ROOT, PROOF_SOURCE)),
  });
  return { status: "passed", report: path.relative(ROOT, reportPath) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(`${JSON.stringify(executePhase14FontProof())}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "phase14_font_unknown_error"}\n`);
    process.exitCode = 1;
  }
}
