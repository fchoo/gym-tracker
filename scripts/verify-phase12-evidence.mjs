#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { validatePhase12BackupBenchmark } from "./benchmark-phase12-backup.mjs";
import {
  validatePhase12GoogleAcceptanceRecord,
  validatePhase12GoogleObservations,
} from "./record-phase12-google-acceptance.mjs";
import {
  validatePhase12GoogleChecklist,
} from "./prepare-phase12-google-acceptance.mjs";
import { PHASE12_MAESTRO_STAGES } from "./run-phase12-maestro.mjs";
import { sourceTreeSha256 } from "./source-tree-digest.mjs";

const ROOT = process.cwd();
const PACKAGE = "com.fchoo.gymtracker.devtest";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function sourceCaseIds(file, exportName) {
  const source = readFileSync(path.join(ROOT, file), "utf8");
  const block = source.match(new RegExp(`export const ${exportName} = \\[(.*?)\\] as const;`, "su"))?.[1] ?? "";
  const ids = [...block.matchAll(/"([a-z0-9-]+)"/gu)].map((match) => match[1]);
  if (ids.length === 0 || new Set(ids).size !== ids.length) throw new Error(`phase12_evidence_case_registry_invalid:${exportName}`);
  return ids;
}

export const PHASE12_GOOGLE_CASE_IDS = Object.freeze(sourceCaseIds("src/testing/contracts/googleDriveBackup.contract.ts", "GOOGLE_DRIVE_BACKUP_REQUIRED_CASE_IDS"));
export const PHASE12_MIGRATION_CASE_IDS = Object.freeze(sourceCaseIds("src/testing/contracts/migrationsEffects.contract.ts", "MIGRATIONS_EFFECTS_CONTRACT_CASES"));

function readJson(file, label) {
  try { return JSON.parse(readFileSync(file, "utf8")); }
  catch (error) { throw new Error(`phase12_${label}_unreadable:${error instanceof Error ? error.message : "unknown"}`); }
}

function exactIdentity(label, result, manifest) {
  if (result?.schema_version !== 1 || result.status !== "passed" || result.build_manifest !== "artifacts/native/phase12/build.json"
    || result.base_head !== manifest.base_head || result.source_tree_sha256 !== manifest.source_tree_sha256
    || result.package !== manifest.package || result.apk?.sha256 !== manifest.apk?.sha256
    || result.apk?.path !== manifest.apk?.path || result.installed_apk?.matches_retained_apk !== true
    || result.installed_apk?.sha256 !== manifest.apk?.sha256) throw new Error(`phase12_${label}_identity_invalid`);
}

function exactCases(label, result, expected) {
  const contract = result?.contract;
  if (contract?.expected_count !== expected.length || contract.total !== expected.length || contract.passed !== expected.length
    || contract.failed !== 0 || contract.skipped !== 0 || !Array.isArray(contract.cases)
    || contract.cases.length !== expected.length || contract.cases.some((entry, index) => entry?.id !== expected[index] || entry.status !== "passed" || !Number.isFinite(entry.durationMs) || entry.durationMs < 0)) throw new Error(`phase12_${label}_cases_invalid`);
}

function noSecrets(value, pathName = "evidence") {
  if (typeof value === "string" && /(?:access[_-]?token|refresh[_-]?token|@[a-z0-9.-]+|permissionId|driveId)/iu.test(value)) throw new Error(`phase12_secret_or_personal_data:${pathName}`);
  if (Array.isArray(value)) value.forEach((entry, index) => noSecrets(entry, `${pathName}[${index}]`));
  if (value !== null && typeof value === "object") for (const [key, entry] of Object.entries(value)) {
    if (/(?:token|email|permission|drive[_-]?id|workout[_-]?row)/iu.test(key)) throw new Error(`phase12_secret_or_personal_data:${pathName}.${key}`);
    noSecrets(entry, `${pathName}.${key}`);
  }
}

export function validatePhase12AutomatedEvidence({ manifest, migrations, google, maestro, benchmark }) {
  if (manifest?.schema_version !== 1 || manifest.suite !== "phase12" || manifest.profile !== "development-test"
    || manifest.package !== PACKAGE || manifest.js_bundle?.embedded !== true || !/^[a-f0-9]{40}$/u.test(manifest.base_head ?? "")
    || !/^[a-f0-9]{64}$/u.test(manifest.source_tree_sha256 ?? "") || !/^[a-f0-9]{64}$/u.test(manifest.apk?.sha256 ?? "")) throw new Error("phase12_manifest_invalid");
  exactIdentity("migrations", migrations, manifest); exactCases("migrations", migrations, PHASE12_MIGRATION_CASE_IDS);
  exactIdentity("google", google, manifest); exactCases("google", google, PHASE12_GOOGLE_CASE_IDS);
  if (maestro?.schema_version !== 1 || maestro.suite !== "phase12" || maestro.status !== "passed"
    || maestro.build_manifest !== "artifacts/native/phase12/build.json"
    || maestro.base_head !== manifest.base_head || maestro.source_tree_sha256 !== manifest.source_tree_sha256
    || maestro.package !== manifest.package || maestro.apk_sha256 !== manifest.apk.sha256
    || !Array.isArray(maestro.stages)
    || maestro.stages.length !== PHASE12_MAESTRO_STAGES.length || maestro.stages.some((entry, index) => entry?.stage !== PHASE12_MAESTRO_STAGES[index]
      || entry.report !== `artifacts/native/phase12/maestro/${PHASE12_MAESTRO_STAGES[index]}.xml`
      || !/^[a-f0-9]{64}$/u.test(entry.sha256 ?? ""))) throw new Error("phase12_maestro_evidence_invalid");
  validatePhase12BackupBenchmark(benchmark, manifest);
  noSecrets({ migrations, google, maestro, benchmark });
  return Object.freeze({ schema_version: 1, suite: "phase12", status: "passed", mode: "automated-only", approval_status: "evidence_pending", attended_scope: "excluded", manifest: { base_head: manifest.base_head, source_tree_sha256: manifest.source_tree_sha256, apk_sha256: manifest.apk.sha256, package: manifest.package }, native: { migrations_cases: `${PHASE12_MIGRATION_CASE_IDS.length}/${PHASE12_MIGRATION_CASE_IDS.length}`, google_cases: `${PHASE12_GOOGLE_CASE_IDS.length}/${PHASE12_GOOGLE_CASE_IDS.length}` }, maestro_stages: `${PHASE12_MAESTRO_STAGES.length}/${PHASE12_MAESTRO_STAGES.length}`, benchmark_sha256: sha256(JSON.stringify(benchmark)) });
}

export function validatePhase12CurrentArtifacts({ manifest, currentHead, currentSourceTreeSha256, apkBytes }) {
  if (manifest.base_head !== currentHead
    || manifest.source_tree_sha256 !== currentSourceTreeSha256
    || sha256(apkBytes) !== manifest.apk?.sha256) {
    throw new Error("phase12_manifest_stale");
  }
}

export function validatePhase12MaestroReports(maestro, readReport) {
  for (const entry of maestro.stages ?? []) {
    let bytes;
    try { bytes = readReport(entry.report); }
    catch { throw new Error(`phase12_maestro_report_missing:${entry.stage}`); }
    if (sha256(bytes) !== entry.sha256) throw new Error(`phase12_maestro_report_stale:${entry.stage}`);
  }
}

export function parsePhase12VerifierArgs(args) {
  const options = {
    manifest: "artifacts/native/phase12/build.json",
    automatedOnly: false,
    requireRealGoogle: false,
    requireEmulatorReplacement: false,
    requirePhoneAuthScope: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--automated-only") options.automatedOnly = true;
    else if (arg === "--manifest") { const value = args[++index]; if (!value || value.startsWith("--")) throw new Error("phase12_manifest_argument_invalid"); options.manifest = value; }
    else if (arg.startsWith("--manifest=")) options.manifest = arg.slice("--manifest=".length);
    else if (arg === "--require-real-google") options.requireRealGoogle = true;
    else if (arg === "--require-emulator-replacement") options.requireEmulatorReplacement = true;
    else if (arg === "--require-phone-auth-scope") options.requirePhoneAuthScope = true;
    else throw new Error(`phase12_unknown_argument:${arg}`);
  }
  const attended = options.requireRealGoogle
    && options.requireEmulatorReplacement
    && options.requirePhoneAuthScope;
  if (options.manifest !== "artifacts/native/phase12/build.json"
    || options.automatedOnly === attended
    || (!options.automatedOnly && !attended)) {
    throw new Error("phase12_evidence_mode_invalid");
  }
  return options;
}

export function executePhase12EvidenceVerifier(args = process.argv.slice(2)) {
  const options = parsePhase12VerifierArgs(args);
  const directory = path.join(ROOT, "artifacts/native/phase12");
  const manifest = readJson(path.join(directory, "build.json"), "manifest");
  const apkPath = path.resolve(ROOT, manifest.apk?.path ?? "");
  if (!existsSync(apkPath)) throw new Error("phase12_apk_missing");
  validatePhase12CurrentArtifacts({
    manifest,
    currentHead: execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim(),
    currentSourceTreeSha256: sourceTreeSha256(ROOT),
    apkBytes: readFileSync(apkPath),
  });
  const maestro = readJson(path.join(directory, "maestro/phase12-evidence.json"), "maestro");
  validatePhase12MaestroReports(maestro, (reportPath) => readFileSync(path.resolve(ROOT, reportPath)));
  const automated = validatePhase12AutomatedEvidence({
    manifest,
    migrations: readJson(path.join(directory, "migrations-effects.json"), "migrations"),
    google: readJson(path.join(directory, "google-drive-backup.json"), "google"),
    maestro,
    benchmark: readJson(path.join(directory, "benchmark.json"), "benchmark"),
  });
  const result = options.automatedOnly
    ? automated
    : Object.freeze({
      ...automated,
      mode: "final",
      approval_status: "approved",
      attended_scope: "fresh-replacement-and-phone-auth-refresh",
      attended: (() => {
        const recordPath = path.join(directory, "attended/attended-record.json");
        const checklistPath = path.join(directory, "attended/checklist.pending.json");
        const observationsPath = path.join(directory, "attended/observations.json");
        const record = validatePhase12GoogleAcceptanceRecord(
          readJson(recordPath, "attended_record"),
          manifest,
        );
        validatePhase12GoogleChecklist(
          readJson(checklistPath, "attended_checklist"),
          manifest,
        );
        validatePhase12GoogleObservations(
          readJson(observationsPath, "attended_observations"),
          manifest,
        );
        if (record.checklist_sha256 !== sha256(readFileSync(checklistPath))
          || record.observations_sha256 !== sha256(readFileSync(observationsPath))) {
          throw new Error("phase12_attended_supporting_evidence_stale");
        }
        noSecrets(record);
        return Object.freeze({
          record_sha256: sha256(readFileSync(recordPath)),
          cases: `${record.cases.length}/${record.cases.length}`,
          devices: Object.freeze(record.devices.map(({ role }) => role)),
        });
      })(),
    });
  writeFileSync(
    path.join(directory, options.automatedOnly ? "automated-evidence.json" : "final-evidence.json"),
    `${JSON.stringify(result, null, 2)}\n`,
  );
  return result;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.stdout.write(`${JSON.stringify({ ok: true, ...executePhase12EvidenceVerifier() })}\n`); }
  catch (error) { process.stderr.write(`${JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "phase12_evidence_failed" })}\n`); process.exitCode = 1; }
}
