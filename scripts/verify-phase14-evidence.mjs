import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { PHASE14_SHELL_EVIDENCE_CASES } from "../src/testing/contracts/phase14Shell.contract.ts";
import { PHASE14_MAESTRO_STAGES, validatePhase14Manifest } from "./run-phase14-maestro.mjs";
import { sourceTreeSha256 } from "./source-tree-digest.mjs";

const ROOT = process.cwd();
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const hash = /^[a-f0-9]{64}$/u;
const expectedIds = PHASE14_SHELL_EVIDENCE_CASES.map(({ id }) => id);
const DEVICE_IDENTITY_PROPERTIES = Object.freeze([
  "ro.build.fingerprint",
  "ro.product.cpu.abi",
  "ro.product.model",
  "ro.build.version.sdk",
  "ro.build.version.release",
]);

export function stableDeviceIdentitySha256(values) {
  return sha256(`${values.join("\n")}\n`);
}

function readInstalledApkBytes(serial, installedPath) {
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "phase14-evidence-"));
  const localApkPath = path.join(temporaryDirectory, "installed.apk");
  try {
    execFileSync("adb", ["-s", serial, "pull", installedPath, localApkPath], { cwd: ROOT, stdio: "ignore" });
    return readFileSync(localApkPath);
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

function readStableDeviceIdentitySha256(serial) {
  const values = DEVICE_IDENTITY_PROPERTIES.map((property) => execFileSync("adb", ["-s", serial, "shell", "getprop", property], { cwd: ROOT, encoding: "utf8" }).trim());
  return stableDeviceIdentitySha256(values);
}

export function validatePhase14Privacy(value, pathName = "evidence") {
  if (typeof value === "string" && /(?:^\/|\\\\|\bselect\b|\binsert\b|\bupdate\b|\bdelete\b|access[_-]?token|refresh[_-]?token|password|archive[_-]?bytes|@[a-z0-9.-]+\.[a-z]{2,})/iu.test(value)) throw new Error("phase14_privacy_invalid");
  if (Array.isArray(value)) value.forEach((entry, index) => validatePhase14Privacy(entry, `${pathName}[${index}]`));
  if (value && typeof value === "object") for (const [key, entry] of Object.entries(value)) {
    if (/(?:sql|token|password|account|archive[_-]?bytes|email|identifier)/iu.test(key)) throw new Error("phase14_privacy_invalid");
    validatePhase14Privacy(entry, `${pathName}.${key}`);
  }
  return true;
}

export function validatePhase14SourceInventory({ confirmationSheet, appearanceSheet, consumers }) {
  if (!/BottomSheet/u.test(confirmationSheet ?? "") || /<Modal\b/u.test(confirmationSheet ?? "") || !/BottomSheet/u.test(appearanceSheet ?? "") || /<Modal\b/u.test(appearanceSheet ?? "")) throw new Error("phase14_sheet_delegation_invalid");
  for (const consumer of consumers ?? []) if (/<Modal\b/u.test(consumer.source ?? "") && consumer.exception !== "shared-frame" && consumer.exception !== "platform-overlay") throw new Error("phase14_legacy_modal_owner");
  return true;
}

export function validatePhase14Dev02(dev02) {
  if (dev02?.owner_record !== "accessible-9b470b" || dev02.title_hex !== "#9B470B" || dev02.sport_hex !== "#D97820") throw new Error("phase14_dev02_owner_invalid");
  if (dev02.status !== "approved" || dev02.native_blended_fill?.status !== "passed" || !hash.test(dev02.native_blended_fill?.report_sha256 ?? "")) throw new Error("phase14_dev02_native_evidence_invalid");
  return true;
}

export function validatePhase14CurrentArtifacts({ manifest, currentHead, currentSourceTreeSha256, apkBytes, installedApkSha256, deviceIdentitySha256 }) {
  const evidenceOnlyHeadAdvance = manifest.base_head !== currentHead && (() => {
    const changed = execFileSync("git", ["diff", "--name-only", manifest.base_head, currentHead], { cwd: ROOT, encoding: "utf8" }).trim().split("\n").filter(Boolean);
    return changed.length > 0 && changed.every((file) => file.startsWith(".planning/phases/14-prototype-visual-shell/evidence/"));
  })();
  if ((!evidenceOnlyHeadAdvance && manifest.base_head !== currentHead) || manifest.source_tree_sha256 !== currentSourceTreeSha256 || sha256(apkBytes) !== manifest.apk?.sha256) throw new Error("phase14_manifest_stale");
  if (installedApkSha256 !== manifest.apk.sha256) throw new Error("phase14_installed_apk_stale");
  if (deviceIdentitySha256 !== manifest.device?.identity_sha256) throw new Error("phase14_device_identity_stale");
  return true;
}

export function validatePhase14Evidence(evidence, manifest, ids = expectedIds) {
  validatePhase14Manifest(manifest, manifest.base_head, manifest.source_tree_sha256);
  if (evidence?.schema_version !== 1 || evidence.suite !== "phase14" || evidence.status !== "passed" || evidence.build_manifest !== "artifacts/native/phase14/build.json" || evidence.base_head !== manifest.base_head || evidence.source_tree_sha256 !== manifest.source_tree_sha256 || evidence.package !== manifest.package || evidence.profile !== manifest.profile || evidence.device_identity_sha256 !== manifest.device?.identity_sha256 || evidence.apk?.sha256 !== manifest.apk?.sha256 || evidence.apk?.installed_sha256 !== manifest.apk?.sha256 || evidence.apk?.matches_retained_apk !== true) throw new Error("phase14_evidence_identity_invalid");
  const expectedStages = PHASE14_SHELL_EVIDENCE_CASES.filter(({ id }) => ids.includes(id)).map(({ stage }) => stage);
  if (!Array.isArray(evidence.stages) || evidence.stages.length !== expectedStages.length || evidence.stages.some((entry, index) => entry?.stage !== expectedStages[index] || entry.status !== "passed")) throw new Error("phase14_stages_invalid");
  const rows = evidence.evidence;
  const expectedCases = PHASE14_SHELL_EVIDENCE_CASES.filter(({ id }) => ids.includes(id));
  if (!Array.isArray(rows) || rows.length !== expectedCases.length || rows.some((row, index) => row?.id !== expectedCases[index].id || row.status !== "passed" || row.requirement !== expectedCases[index].requirement || row.path !== expectedCases[index].evidencePath || !hash.test(row.report_sha256 ?? "") || !hash.test(row.screenshot_sha256 ?? "") || row.component_verdict !== "passed" || row.native_verdict !== "passed")) throw new Error("phase14_evidence_mapping_invalid");
  if (ids.includes("shell.tokens")) {
    if (evidence.dev02?.status !== "approved") throw new Error("phase14_dev02_pending");
    validatePhase14Dev02(evidence.dev02);
  }
  validatePhase14Privacy(evidence);
  return true;
}

export function parsePhase14VerifierArgs(args) {
  const options = { manifest: "artifacts/native/phase14/build.json", all: false, ids: [] };
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--manifest") options.manifest = args[++index] ?? "";
    else if (args[index] === "--all") options.all = true;
    else if (args[index] === "--ids") options.ids = (args[++index] ?? "").split(",").filter(Boolean);
    else throw new Error(`phase14_unknown_argument:${args[index]}`);
  }
  if (options.manifest !== "artifacts/native/phase14/build.json" || (options.all === (options.ids.length > 0)) || new Set(options.ids).size !== options.ids.length || options.ids.some((id) => !expectedIds.includes(id))) throw new Error("phase14_verifier_arguments_invalid");
  return options;
}

export function executePhase14EvidenceVerifier(args = process.argv.slice(2)) {
  const options = parsePhase14VerifierArgs(args);
  const directory = path.join(ROOT, "artifacts/native/phase14");
  const manifest = JSON.parse(readFileSync(path.join(directory, "build.json"), "utf8"));
  const apkPath = path.resolve(ROOT, manifest.apk.path);
  if (!existsSync(apkPath)) throw new Error("phase14_apk_missing");
  const installedPath = execFileSync("adb", ["-s", manifest.device.serial, "shell", "pm", "path", manifest.package], { cwd: ROOT, encoding: "utf8" }).trim().replace(/^package:/u, "");
  const installedApkBytes = readInstalledApkBytes(manifest.device.serial, installedPath);
  const deviceIdentitySha256 = readStableDeviceIdentitySha256(manifest.device.serial);
  validatePhase14CurrentArtifacts({ manifest, currentHead: execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim(), currentSourceTreeSha256: sourceTreeSha256(ROOT), apkBytes: readFileSync(apkPath), installedApkSha256: sha256(installedApkBytes), deviceIdentitySha256 });
  const ids = options.all ? expectedIds : options.ids;
  const evidence = JSON.parse(readFileSync(path.join(directory, "maestro/phase14-evidence.json"), "utf8"));
  validatePhase14Evidence(evidence, manifest, ids);
  for (const id of ids) {
    const expected = PHASE14_SHELL_EVIDENCE_CASES.find((entry) => entry.id === id);
    const record = JSON.parse(readFileSync(path.join(ROOT, expected.evidencePath), "utf8"));
    const row = record.evidence;
    validatePhase14Evidence({ ...record, stages: [record.stage], evidence: [row] }, manifest, [id]);
    if (!existsSync(path.join(ROOT, row.screenshot)) || sha256(readFileSync(path.join(ROOT, row.screenshot))) !== row.screenshot_sha256) throw new Error("phase14_screenshot_stale");
  }
  const result = { schema_version: 1, suite: "phase14", status: "passed", ids, evidence_sha256: sha256(JSON.stringify(evidence)) };
  writeFileSync(path.join(directory, "verified-evidence.json"), `${JSON.stringify(result, null, 2)}\n`);
  return result;
}

if (process.argv[1]?.endsWith("verify-phase14-evidence.mjs")) { try { process.stdout.write(`${JSON.stringify({ ok: true, ...executePhase14EvidenceVerifier() })}\n`); } catch (error) { process.stderr.write(`${JSON.stringify({ ok: false, error: error.message })}\n`); process.exitCode = 1; } }
