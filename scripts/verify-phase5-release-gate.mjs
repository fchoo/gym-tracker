#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import {
  derivePhase5AttendedRows,
  validatePhase5AttendedRecordBytes,
} from "./generate-phase5-attended-checklist.mjs";
import { loadPhase5Candidate, SHA256_PATTERN } from "./phase5-candidate-evidence.mjs";
import { validatePhase5PromotionProof } from "./record-phase5-promotion-proof.mjs";
import {
  loadAndValidatePhase5AutomatedEvidenceSet,
  validatePhase5AutomatedEvidenceSet,
} from "./verify-phase5-native-evidence.mjs";

const RELEASE_TAG = /^v[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/u;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;
const COMMIT = /^[a-f0-9]{40}$/u;
const RUN_ID = /^[1-9][0-9]*$/u;
const ARTIFACT = /^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/u;

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function validatePhase6N4ReleaseBinding({
  candidateManifest,
  manifestSha256,
  phase5Record,
  phase6Record,
  phase6RecordBytes,
  phase6N4RunId,
  phase6N4ArtifactName,
}) {
  const binding = phase5Record?.phase6_attended_evidence;
  const apk = candidateManifest?.artifacts?.filter(({ kind }) => kind === "apk");
  const expectedKeys = [
    "record_sha256",
    "evidence_run_id",
    "artifact_name",
    "candidate_id",
    "source_commit",
    "manifest_sha256",
    "apk_sha256",
    "status",
  ];
  if (binding === null
    || binding === undefined
    || typeof binding !== "object"
    || Array.isArray(binding)
    || JSON.stringify(Object.keys(binding)) !== JSON.stringify(expectedKeys)
    || !SHA256_PATTERN.test(binding.record_sha256 ?? "")
    || !RUN_ID.test(binding.evidence_run_id ?? "")
    || !ARTIFACT.test(binding.artifact_name ?? "")
    || binding.candidate_id !== candidateManifest?.candidate_id
    || binding.source_commit !== candidateManifest?.source?.commit
    || binding.manifest_sha256 !== manifestSha256
    || apk?.length !== 1
    || binding.apk_sha256 !== apk[0].sha256
    || binding.status !== "passed"
    || phase6Record?.status !== "passed"
    || !Buffer.isBuffer(phase6RecordBytes)
    || sha256(phase6RecordBytes) !== binding.record_sha256
    || binding.evidence_run_id !== phase6N4RunId
    || binding.artifact_name !== phase6N4ArtifactName) {
    throw new Error("Phase 6 N4 binding does not match the passed canonical record and candidate.");
  }
  return binding;
}

export function validatePhase5ReleaseEvidenceSet(input) {
  return validatePhase5AutomatedEvidenceSet({
    manifest: input.candidateManifest,
    manifestSha256: input.manifestSha256,
    aggregate: input.aggregate,
    aggregateBytes: input.aggregateBytes,
    reports: {
      source: { value: input.source, file: input.sourceFile ?? "source.json", rawReports: input.rawReports?.source },
      maestro: { value: input.maestro, file: input.maestroFile ?? "maestro.json", rawReports: input.rawReports?.maestro },
      benchmark: { value: input.benchmark, file: input.benchmarkFile ?? "benchmark.json", rawReports: input.rawReports?.benchmark },
    },
  });
}

function parseArgs(args) {
  const options = {};
  const keys = new Map([
    ["--bundle-dir", "bundleDirectory"],
    ["--manifest-sha256", "manifestSha256"],
    ["--automated-evidence", "automatedEvidence"],
    ["--attended-record", "attendedRecord"],
    ["--evidence-dir", "evidenceDirectory"],
    ["--phase6-n4-record", "phase6N4Record"],
    ["--phase6-n4-checklist", "phase6N4Checklist"],
    ["--phase6-n4-observations", "phase6N4Observations"],
    ["--phase6-n4-evidence-dir", "phase6N4EvidenceDirectory"],
    ["--phase6-n4-run-id", "phase6N4RunId"],
    ["--phase6-n4-artifact-name", "phase6N4ArtifactName"],
    ["--release-tag", "releaseTag"],
    ["--candidate-run-id", "candidateRunId"],
    ["--candidate-repository", "candidateRepository"],
    ["--candidate-commit", "candidateCommit"],
    ["--checklist", "checklist"],
    ["--observations", "observations"],
    ["--promotion-proof", "promotionProof"],
    ["--public-assets-dir", "publicAssetsDirectory"],
  ]);
  for (let index = 0; index < args.length; index += 2) {
    const key = keys.get(args[index]);
    const value = args[index + 1];
    if (!key || !value || value.startsWith("--") || Object.hasOwn(options, key)) {
      throw new Error("release gate arguments are malformed.");
    }
    options[key] = value;
  }
  if (Object.keys(options).length !== keys.size
    || !SHA256_PATTERN.test(options.manifestSha256 ?? "")
    || !RELEASE_TAG.test(options.releaseTag ?? "")
    || !RUN_ID.test(options.candidateRunId ?? "")
    || !RUN_ID.test(options.phase6N4RunId ?? "")
    || !ARTIFACT.test(options.phase6N4ArtifactName ?? "")
    || !REPOSITORY.test(options.candidateRepository ?? "")
    || !COMMIT.test(options.candidateCommit ?? "")) {
    throw new Error("release gate requires exact candidate, evidence, and promotion inputs.");
  }
  return options;
}

export function executePhase5ReleaseGate(args = process.argv.slice(2)) {
  const options = parseArgs(args);
  const candidate = loadPhase5Candidate({
    bundleDirectory: options.bundleDirectory,
    expectedManifestSha256: options.manifestSha256,
  });
  if (candidate.manifest.source.commit !== options.candidateCommit) {
    throw new Error("candidate promotion commit does not match manifest source.");
  }
  if (candidate.manifest.workflow.run_id !== options.candidateRunId
    || candidate.manifest.workflow.repository !== options.candidateRepository) {
    throw new Error("candidate promotion run/repository does not match manifest provenance.");
  }
  loadAndValidatePhase5AutomatedEvidenceSet({
    manifest: candidate.manifest,
    manifestSha256: candidate.manifest_sha256,
    aggregatePath: options.automatedEvidence,
  });
  const recordBytes = readFileSync(options.attendedRecord);
  const record = JSON.parse(recordBytes.toString("utf8"));
  const phase6RecordBytes = readFileSync(options.phase6N4Record);
  const phase6Record = JSON.parse(phase6RecordBytes.toString("utf8"));
  const validated = validatePhase5AttendedRecordBytes({
    candidateManifest: candidate.manifest,
    manifestSha256: candidate.manifest_sha256,
    record, recordBytes,
    evidenceDirectory: options.evidenceDirectory,
    automatedEvidencePath: options.automatedEvidence,
    checklistPath: options.checklist,
    observationsPath: options.observations,
    phase6N4RecordPath: options.phase6N4Record,
    phase6N4ChecklistPath: options.phase6N4Checklist,
    phase6N4ObservationsPath: options.phase6N4Observations,
    phase6N4EvidenceDirectory: options.phase6N4EvidenceDirectory,
    phase6N4RunId: options.phase6N4RunId,
    phase6N4ArtifactName: options.phase6N4ArtifactName,
    rows: derivePhase5AttendedRows(),
  });
  const phase6Binding = validatePhase6N4ReleaseBinding({
    candidateManifest: candidate.manifest,
    manifestSha256: candidate.manifest_sha256,
    phase5Record: record,
    phase6Record,
    phase6RecordBytes,
    phase6N4RunId: options.phase6N4RunId,
    phase6N4ArtifactName: options.phase6N4ArtifactName,
  });
  const proofBytes = readFileSync(options.promotionProof);
  const proof = validatePhase5PromotionProof({
    proof: JSON.parse(proofBytes.toString("utf8")),
    proofBytes, candidate,
    attendedRecordSha256: validated.attended_record_sha256,
    phase6N4RunId: phase6Binding.evidence_run_id,
    phase6N4ArtifactName: phase6Binding.artifact_name,
    phase6N4RecordSha256: phase6Binding.record_sha256,
    publicAssetsDirectory: options.publicAssetsDirectory,
  });
  if (proof.candidate_run_id !== options.candidateRunId
    || proof.workflow.repository !== options.candidateRepository
    || proof.candidate_commit !== options.candidateCommit
    || proof.phase6_n4_run_id !== options.phase6N4RunId
    || proof.phase6_n4_artifact_name !== options.phase6N4ArtifactName
    || proof.phase6_n4_record_sha256 !== phase6Binding.record_sha256
    || proof.release_tag !== options.releaseTag) {
    throw new Error("promotion proof does not match terminal inputs.");
  }
  return {
    ok: true,
    gate: "terminal_seal_validated_after_promotion",
    candidate_run_id: options.candidateRunId,
    candidate_repository: options.candidateRepository,
    candidate_commit: options.candidateCommit,
    candidate_id: candidate.manifest.candidate_id,
    manifest_sha256: candidate.manifest_sha256,
    attended_record_sha256: validated.attended_record_sha256,
    phase6_n4_record_sha256: phase6Binding.record_sha256,
    phase6_n4_run_id: phase6Binding.evidence_run_id,
    phase6_n4_artifact_name: phase6Binding.artifact_name,
    promotion_run_id: proof.workflow.run_id,
    release_tag: options.releaseTag,
    upload_files: candidate.manifest.artifacts.map(({ file, sha256, size_bytes: sizeBytes }) => ({
      file, sha256, size_bytes: sizeBytes,
    })),
  };
}

const isMain = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    process.stdout.write(`${JSON.stringify(executePhase5ReleaseGate())}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ ok: false, error: error.message })}\n`);
    process.exitCode = 1;
  }
}
