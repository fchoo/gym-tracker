#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const PACKAGE = "com.fchoo.gymtracker.devtest";
const APK_PATH = "artifacts/native/phase12/gym-tracker-phase12-devtest.apk";

export const PHASE12_GOOGLE_ATTENDED_CASES = Object.freeze([
  Object.freeze({
    id: "emulator-namespace-empty",
    role: "replacement-emulator",
    instructions: "With the dedicated test account connected, verify the development-test namespace contains no production objects before mutation.",
  }),
  Object.freeze({
    id: "emulator-auth-drive-file",
    role: "replacement-emulator",
    instructions: "Complete One-Tap and drive.file consent without granting broader Drive access.",
  }),
  Object.freeze({
    id: "emulator-latest-previous-rotation",
    role: "replacement-emulator",
    instructions: "Create two verified generations and confirm latest plus previous rotation.",
  }),
  Object.freeze({
    id: "emulator-restore-quarantine",
    role: "replacement-emulator",
    instructions: "After clearing and reinstalling only the development-test package, confirm restore quarantine cannot upload before resolution.",
  }),
  Object.freeze({
    id: "emulator-direct-restore-digest",
    role: "replacement-emulator",
    instructions: "Restore the latest generation and confirm its canonical source and restored digests match.",
  }),
  Object.freeze({
    id: "emulator-successor-writer",
    role: "replacement-emulator",
    instructions: "Claim the successor writer epoch and confirm the prior writer is rejected by the deterministic/native fence.",
  }),
  Object.freeze({
    id: "emulator-post-restore-backup",
    role: "replacement-emulator",
    instructions: "Create and promote a verified post-restore backup.",
  }),
  Object.freeze({
    id: "emulator-manifest-recovery",
    role: "replacement-emulator",
    instructions: "Exercise corrupt-manifest bounded recovery without exposing remote identifiers.",
  }),
  Object.freeze({
    id: "emulator-fenced-orphan-trash",
    role: "replacement-emulator",
    instructions: "Confirm one generation-fenced orphan is trashed while referenced generations remain.",
  }),
  Object.freeze({
    id: "emulator-nonempty-merge-adoption",
    role: "replacement-emulator",
    instructions: "Repeat with bounded local data and confirm previewed merge plus one-time namespace adoption.",
  }),
  Object.freeze({
    id: "phone-signed-package",
    role: "physical-phone-auth-only",
    instructions: "Confirm the installed development-test package bytes match the retained APK.",
  }),
  Object.freeze({
    id: "phone-auth-drive-file",
    role: "physical-phone-auth-only",
    instructions: "Complete One-Tap and drive.file consent only; do not read or mutate backup objects.",
  }),
  Object.freeze({
    id: "phone-token-refresh",
    role: "physical-phone-auth-only",
    instructions: "Confirm token refresh succeeds without recording credentials or account identifiers.",
  }),
  Object.freeze({
    id: "phone-environment-isolation",
    role: "physical-phone-auth-only",
    instructions: "Confirm the development-test environment is selected without uploading, restoring, merging, deleting, or inspecting backup content.",
  }),
]);

function command(program, args) {
  return execFileSync(program, args, { cwd: ROOT, encoding: "utf8" }).trim();
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function exactJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function exactKeys(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && exactJson(Object.keys(value), keys);
}

export function serializePhase12GoogleEvidence(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

function parseArguments(args) {
  const index = args.indexOf("--manifest");
  if (index < 0 || args[index + 1] === undefined || args.length !== 2) {
    throw new Error("prepare:phase12:google requires --manifest");
  }
  if (args[index + 1] !== "artifacts/native/phase12/build.json") {
    throw new Error("phase12_google_acceptance_manifest_path_invalid");
  }
  return { manifest: args[index + 1] };
}

export function phase12ManifestIdentity(manifest) {
  return Object.freeze({
    base_head: manifest.base_head,
    source_tree_sha256: manifest.source_tree_sha256,
    apk_sha256: manifest.apk.sha256,
    package: manifest.package,
  });
}

export function validateDevelopmentTestManifest(manifest, head, source, apkBytes) {
  if (manifest?.schema_version !== 1 || manifest.suite !== "phase12"
    || manifest.profile !== "development-test" || manifest.package !== PACKAGE
    || manifest.js_bundle?.embedded !== true || manifest.base_head !== head
    || manifest.source_tree_sha256 !== source
    || manifest.apk?.path !== APK_PATH
    || !/^[a-f0-9]{64}$/u.test(manifest.apk?.sha256 ?? "")
    || (apkBytes !== undefined && sha256(apkBytes) !== manifest.apk.sha256)) {
    throw new Error("phase12_google_acceptance_manifest_invalid");
  }
  return true;
}

export function buildPhase12GoogleChecklist(manifest, generatedAt) {
  if (!Number.isFinite(Date.parse(generatedAt))) {
    throw new Error("phase12_google_acceptance_timestamp_invalid");
  }
  const checklist = Object.freeze({
    schema_version: 1,
    suite: "phase12-google-attended",
    status: "pending_human",
    approval_status: "evidence_pending",
    manifest: phase12ManifestIdentity(manifest),
    generated_at: generatedAt,
    cases: PHASE12_GOOGLE_ATTENDED_CASES.map((entry) => Object.freeze({
      ...entry,
      status: "pending_human",
    })),
    privacy: Object.freeze([
      "Record only case IDs, counts, byte sizes, timestamps, and SHA-256 digests.",
      "Never record tokens, emails, permission IDs, Drive IDs, object names, or workout content.",
      "The physical-phone role is auth and scope smoke only; all destructive replacement actions stay on the emulator.",
    ]),
  });
  validatePhase12GoogleChecklist(checklist, manifest);
  return checklist;
}

export function validatePhase12GoogleChecklist(checklist, manifest) {
  if (!exactKeys(checklist, [
    "schema_version", "suite", "status", "approval_status", "manifest",
    "generated_at", "cases", "privacy",
  ]) || checklist.schema_version !== 1 || checklist.suite !== "phase12-google-attended"
    || checklist.status !== "pending_human" || checklist.approval_status !== "evidence_pending"
    || !exactJson(checklist.manifest, phase12ManifestIdentity(manifest))
    || !Number.isFinite(Date.parse(checklist.generated_at ?? ""))
    || !Array.isArray(checklist.cases)
    || checklist.cases.length !== PHASE12_GOOGLE_ATTENDED_CASES.length
    || !Array.isArray(checklist.privacy) || checklist.privacy.length !== 3) {
    throw new Error("phase12_google_acceptance_checklist_invalid");
  }
  for (const [index, definition] of PHASE12_GOOGLE_ATTENDED_CASES.entries()) {
    const entry = checklist.cases[index];
    if (!exactKeys(entry, ["id", "role", "instructions", "status"])
      || entry.id !== definition.id || entry.role !== definition.role
      || entry.instructions !== definition.instructions
      || entry.status !== "pending_human") {
      throw new Error("phase12_google_acceptance_checklist_invalid");
    }
  }
  return checklist;
}

function checklistMarkdown(checklist) {
  const rows = checklist.cases.map((entry) => (
    `- [ ] ${entry.id}: ${entry.instructions}`
  )).join("\n");
  return `# Phase 12 attended Google acceptance\n\nManifest source: \`${checklist.manifest.base_head}\`\nAPK SHA-256: \`${checklist.manifest.apk_sha256}\`\nPackage: \`${checklist.manifest.package}\`\n\n${rows}\n\n${checklist.privacy.join("\n")}\n`;
}

export function preparePhase12GoogleAcceptance(args = process.argv.slice(2)) {
  const { manifest: manifestPath } = parseArguments(args);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const head = command("git", ["rev-parse", "HEAD"]);
  const source = command("node", ["scripts/source-tree-digest.mjs", "--assert-no-untracked"]);
  validateDevelopmentTestManifest(manifest, head, source);
  const apkPath = path.resolve(ROOT, manifest.apk?.path ?? "");
  if (!apkPath.startsWith(`${ROOT}${path.sep}`)) {
    throw new Error("phase12_google_acceptance_apk_path_invalid");
  }
  validateDevelopmentTestManifest(manifest, head, source, readFileSync(apkPath));
  const checklist = buildPhase12GoogleChecklist(manifest, new Date().toISOString());
  const directory = path.join(ROOT, "artifacts/native/phase12/attended");
  mkdirSync(directory, { recursive: true });
  const jsonOutput = path.join(directory, "checklist.pending.json");
  const markdownOutput = path.join(directory, "CHECKLIST.md");
  const checklistBytes = serializePhase12GoogleEvidence(checklist);
  writeFileSync(jsonOutput, checklistBytes);
  writeFileSync(markdownOutput, checklistMarkdown(checklist));
  return Object.freeze({
    output: markdownOutput,
    checklist: jsonOutput,
    checklist_sha256: sha256(checklistBytes),
    manifest: checklist.manifest,
  });
}

if (process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.stdout.write(`${JSON.stringify(preparePhase12GoogleAcceptance())}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "phase12_google_acceptance_prepare_failed"}\n`);
    process.exitCode = 1;
  }
}
