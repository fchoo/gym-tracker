import { PNG } from "pngjs";
import { createHash } from "node:crypto";
import { readFileSync, lstatSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { V12_CONFIG_IDS, V12_BROWSER_WALK_STATE_IDS, loadV12ContractInputs } from "./v12-evidence-contract.mjs";

import { validateV12RunManifest } from "./create-v12-run-manifest.mjs";
import { validateV12RecoveryShard, V12_RECOVERY_STEPS, V12_RECOVERY_CUT_IDS } from "./v12-recovery-shard.mjs";

const sha = value => createHash("sha256").update(value).digest("hex");
const fail = code => { throw new Error(`personal_closeout_${code}`); };
const pair = value => `${value.state_id}/${value.configuration_id}`;
const HASH = /^[a-f0-9]{64}$/u;

export function validatePersonalCloseoutProfile(profile, requirementIds) {
  if (!profile || profile.schema_version !== 1 || profile.profile_id !== "personal-use-closeout-20261027"
    || profile.approval?.date !== "2026-10-27" || profile.approval.owner_instruction !== "let's proceed"
    || profile.completion_label !== "personal-use-verification-complete-with-deferred-configurations") fail("profile_invalid");
  if (!Array.isArray(profile.requirement_ids) || profile.requirement_ids.length !== 172
    || new Set(profile.requirement_ids).size !== 172 || profile.requirement_ids.some(id => !requirementIds.includes(id))) fail("requirements_invalid");
  if (!Array.isArray(profile.required_ui_observations) || !Array.isArray(profile.deferred_ui_observations)) fail("configuration_partition_invalid");
  const covered = new Set();
  for (const entry of [...profile.required_ui_observations, ...profile.deferred_ui_observations]) {
    if (!V12_CONFIG_IDS.includes(entry?.configuration_id) || !V12_BROWSER_WALK_STATE_IDS.includes(entry?.state_id)
      || covered.has(pair(entry))) fail("configuration_partition_invalid");
    covered.add(pair(entry));
  }
  if (covered.size !== 107 * 64 || profile.required_ui_observations.length !== 155
    || profile.deferred_ui_observations.length !== 6693
    || profile.deferred_ui_observations.some(entry => entry.disposition !== "DEFERRED" || !entry.reason)) fail("configuration_partition_invalid");
  if (profile.critical_native?.recovery_case_count !== 112
    || JSON.stringify(profile.critical_native.sqlite_categories) !== JSON.stringify([
      "fresh-migration", "schema27-upgrade", "supported-legacy-upgrade", "failure-reopen", "backup",
      "restore", "merge", "noop-replay", "rebuild", "immutable-history",
    ]) || Object.values(profile.evidence_rules).some(value => value !== true)
    || !Array.isArray(profile.critical_integrity_files) || profile.critical_integrity_files.length !== 208
    || new Set(profile.critical_integrity_files).size !== 208
    || !Array.isArray(profile.required_route_probes) || profile.required_route_probes.length !== 8
    || new Set(profile.required_route_probes).size !== 8) fail("critical_scope_invalid");
  return profile;
}

export function validatePersonalCloseoutEvidence(profile, evidence, readBytes) {
  if (!evidence || evidence.schema_version !== 1 || evidence.profile_id !== profile.profile_id
    || evidence.profile_sha256 !== sha(JSON.stringify(profile))
    || !/^[a-f0-9]{40}$/u.test(evidence.source_head ?? "") || !HASH.test(evidence.apk_sha256 ?? "")
    || typeof readBytes !== "function") fail("evidence_invalid");
  const hashFile = binding => {
    if (!binding || typeof binding.path !== "string" || !HASH.test(binding.sha256 ?? "")
      || binding.path.startsWith("/") || binding.path.includes("\\")
      || binding.path.split("/").some(p => !p || p === "." || p === "..")) fail("binding_invalid");
    const bytes = readBytes(binding.path);
    if (sha(bytes) !== binding.sha256) fail("binding_changed");
    return bytes;
  };
  if (sha(hashFile(evidence.apk)) !== evidence.apk_sha256) fail("apk_binding_invalid");
  const manifest = validateV12RunManifest(JSON.parse(hashFile(evidence.native_manifest)));
  if (manifest.mode !== "live" || manifest.evidence_origin !== "native"
    || manifest.source.head !== evidence.source_head || manifest.build.apk.sha256 !== evidence.apk_sha256
    || manifest.device.installed_apk_sha256 !== evidence.apk_sha256) fail("native_identity_invalid");
  if (!Array.isArray(evidence.requirements) || evidence.requirements.length !== 172
    || new Set(evidence.requirements.map(row => row.id)).size !== 172) fail("requirements_invalid");
  const missing = [];
  for (const row of evidence.requirements) {
    if (!profile.requirement_ids.includes(row.id) || !["PASS", "MISSING", "FAIL"].includes(row.status)
      || !Array.isArray(row.artifacts)) fail("requirement_evidence_invalid");
    row.artifacts.forEach(hashFile);
    if (row.status !== "PASS" || row.artifacts.length === 0) missing.push(row.id);
  }
  const captures = new Map();
  if (!Array.isArray(evidence.ui)) fail("ui_invalid");
  for (const observation of evidence.ui) {
    if (captures.has(pair(observation)) || !profile.required_ui_observations.some(entry => pair(entry) === pair(observation))
      || observation.native_execution !== "EXECUTED" || observation.apk_sha256 !== evidence.apk_sha256
      || observation.source_head !== evidence.source_head || observation.settings_restored !== true) fail("ui_invalid");
    const native = JSON.parse(hashFile(observation.native_receipt));
    if (!/^[a-f0-9]{32}$/u.test(native.nonce ?? "") || native.run_id !== manifest.run_id || native.device_identity_sha256 !== manifest.device.identity_sha256
      || native.state_id !== observation.state_id || native.configuration_id !== observation.configuration_id
      || native.native_execution !== "EXECUTED" || native.source_head !== evidence.source_head
      || native.apk_sha256 !== evidence.apk_sha256 || native.settings_restored !== true) fail("native_receipt_invalid");
    const bytes = hashFile(observation.png);
    if (bytes.length < 24 || bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") fail("png_invalid");
    if (bytes.readUInt32BE(16) * bytes.readUInt32BE(20) > 8_000_000) fail("png_invalid");
    try { PNG.sync.read(bytes, { checkCRC: true }); }
    catch { fail("png_invalid"); }
    captures.set(pair(observation), observation);
  }
  const uiMissing = profile.required_ui_observations.filter(entry => !captures.has(pair(entry))).map(pair);
  const routeIds = new Set();
  if (!Array.isArray(evidence.route_probes)) fail("route_evidence_invalid");
  for (const probe of evidence.route_probes) {
    if (!profile.required_route_probes.includes(probe.id) || routeIds.has(probe.id)) fail("route_evidence_invalid");
    const receipt = JSON.parse(hashFile(probe.artifact));
    if (receipt.probe_id !== probe.id || receipt.native_execution !== "EXECUTED"
      || receipt.source_head !== evidence.source_head || receipt.apk_sha256 !== evidence.apk_sha256
      || receipt.device_identity_sha256 !== manifest.device.identity_sha256) fail("route_evidence_invalid");
    routeIds.add(probe.id);
    if (receipt.status !== "PASS") missing.push(`route:${probe.id}`);
  }
  for (const id of profile.required_route_probes) if (!routeIds.has(id)) missing.push(`route:${id}`);
  const critical = evidence.critical;
  if (!critical || !Array.isArray(critical.sqlite) || !Array.isArray(critical.recovery)) fail("critical_evidence_invalid");
  const sqlite = new Set();
  for (const item of critical.sqlite) {
    if (sqlite.has(item.id) || !profile.critical_native.sqlite_categories.includes(item.id)) fail("critical_evidence_invalid");
    item.artifacts.forEach(hashFile); sqlite.add(item.id);
    if (item.status !== "PASS" || !item.artifacts.length) missing.push(`sqlite:${item.id}`);
  }
  const sqliteMissing = profile.critical_native.sqlite_categories.filter(id => !sqlite.has(id));
  const requiredRecovery = new Set(V12_RECOVERY_STEPS.flatMap(step => V12_RECOVERY_CUT_IDS.map(cut => `${step.case_id}:${step.id}:${cut}`)));
  const recovery = new Set();
  for (const item of critical.recovery) {
    if (recovery.has(item.id) || !requiredRecovery.has(item.id)) fail("critical_evidence_invalid");
    item.artifacts.forEach(hashFile); recovery.add(item.id);
    if (item.status !== "PASS" || !item.artifacts.length) missing.push(`recovery:${item.id}`);
  }
  if (recovery.size === 112) {
    const rawRecovery = JSON.parse(hashFile(critical.recovery_artifact));
    validateV12RecoveryShard(rawRecovery);
    if (rawRecovery.cases.some(row => row.status !== "PASS" || row.cuts.some(cut => cut.status !== "PASS"))) missing.push("recovery-result");
  }
  const integrity = evidence.integrity;
  if (!Array.isArray(integrity)) fail("integrity_evidence_invalid");
  const coverageIds = new Set();
  for (const report of integrity) {
    if (!profile.critical_integrity_files.includes(report.id) || coverageIds.has(report.id)) fail("coverage_scope_invalid");
    coverageIds.add(report.id);
    hashFile(report.artifact);
    const raw = JSON.parse(hashFile(report.artifact));
    if (!Array.isArray(report.source_inputs) || report.source_inputs.length === 0 || !report.source_inputs.some(input => input.path === report.id)) fail("coverage_inputs_invalid");
    report.source_inputs.forEach(hashFile);
    const metrics = raw.metrics;
    if (["statements", "branches", "functions", "lines"].some(metric => report.metrics?.[metric] !== 100 || metrics?.[metric] !== 100)) missing.push(`coverage:${report.id}`);
  }
  for (const id of profile.critical_integrity_files) if (!coverageIds.has(id)) missing.push(`coverage:${id}`);
  return {
    schema_version: 1, profile_id: profile.profile_id,
    status: missing.length || uiMissing.length || sqliteMissing.length || recovery.size !== 112 ? "NOT_READY" : "PERSONAL_USE_VERIFIED",
    source_head: evidence.source_head, apk_sha256: evidence.apk_sha256,
    required_ui: profile.required_ui_observations.length, completed_ui: captures.size,
    deferred_ui: profile.deferred_ui_observations.length,
    missing_requirements: missing, missing_ui: uiMissing, missing_sqlite: sqliteMissing,
    completed_recovery: recovery.size, required_recovery: 112,
    exhaustive_matrix_passed: false, release_authorized: false,
  };
}

export function runPersonalCloseoutCli(args, io = process, root = process.cwd()) {
  if (args.length !== 2 || args[0] !== "--evidence") fail("arguments_invalid");
  const readBytes = relative => {
    const full = path.resolve(root, relative);
    if (!full.startsWith(path.resolve(root) + path.sep)) fail("binding_invalid");
    let cursor = root;
    for (const part of relative.split("/")) {
      cursor = path.join(cursor, part);
      if (lstatSync(cursor).isSymbolicLink()) fail("binding_invalid");
    }
    return readFileSync(full);
  };
  const profile = validatePersonalCloseoutProfile(JSON.parse(readBytes(".planning/verification/personal-closeout-profile-20261027.json")),
    loadV12ContractInputs({ root }).matrix.rows.map(row => row.requirement_id));
  const result = validatePersonalCloseoutEvidence(profile, JSON.parse(readBytes(args[1])), readBytes);
  io.stdout.write(JSON.stringify(result) + "\n");
  return result.status === "PERSONAL_USE_VERIFIED" ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { process.exitCode = runPersonalCloseoutCli(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
