#!/usr/bin/env node

import { lstatSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import {
  loadPhase5Candidate,
  SHA256_PATTERN,
  sha256File,
} from "./phase5-candidate-evidence.mjs";

const RUN_ID = /^[1-9][0-9]*$/u;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;
const RELEASE_TAG = /^v[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/u;
const ARTIFACT_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/u;
const PUBLIC_ASSET_FILES = Object.freeze([
  "gym-tracker-release.aab",
  "gym-tracker-release.apk",
]);

function validatePublicAssetsDirectory(publicAssetsDirectory) {
  const directory = path.resolve(publicAssetsDirectory);
  const details = lstatSync(directory, { throwIfNoEntry: false });
  if (!details?.isDirectory()
    || details.isSymbolicLink()) {
    throw new Error("public release asset directory is missing or unsafe.");
  }
  const canonicalDirectory = realpathSync(directory);
  const entries = readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name));
  if (JSON.stringify(entries.map(({ name }) => name)) !== JSON.stringify(PUBLIC_ASSET_FILES)
    || entries.some((entry) => !entry.isFile() || entry.isSymbolicLink())) {
    throw new Error("public release asset set must contain exactly the two regular release files.");
  }
  for (const file of PUBLIC_ASSET_FILES) {
    const target = path.join(canonicalDirectory, file);
    const fileDetails = lstatSync(target);
    if (!fileDetails.isFile() || fileDetails.isSymbolicLink()
      || realpathSync(target) !== target) {
      throw new Error("public release asset set contains an unsafe file.");
    }
  }
  return canonicalDirectory;
}

export function serializePhase5PromotionProof(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function createPhase5PromotionProof({
  candidate, candidateRunId, attendedRunId, attendedArtifactName,
  attendedRecordSha256, phase6N4RunId, phase6N4ArtifactName,
  phase6N4RecordSha256, promotionRunId, repository, releaseTag,
  releaseId, publicationJobAttempt, publicAssetMetadata, publicAssetsDirectory,
}) {
  if (!RUN_ID.test(candidateRunId ?? "") || !RUN_ID.test(attendedRunId ?? "")
    || !RUN_ID.test(promotionRunId ?? "") || !REPOSITORY.test(repository ?? "")
    || !RELEASE_TAG.test(releaseTag ?? "")
    || !SHA256_PATTERN.test(attendedRecordSha256 ?? "")
    || !ARTIFACT_NAME.test(attendedArtifactName ?? "")
    || !RUN_ID.test(phase6N4RunId ?? "")
    || phase6N4RunId === candidateRunId
    || phase6N4RunId === attendedRunId
    || !ARTIFACT_NAME.test(phase6N4ArtifactName ?? "")
    || !SHA256_PATTERN.test(phase6N4RecordSha256 ?? "")
    || !Number.isSafeInteger(releaseId)
    || releaseId < 1
    || !Number.isSafeInteger(publicationJobAttempt)
    || publicationJobAttempt < 1
    || candidate.manifest.workflow.run_id !== candidateRunId
    || candidate.manifest.workflow.repository !== repository) {
    throw new Error("promotion proof identity is malformed or substituted.");
  }
  const publicAssetsRoot = validatePublicAssetsDirectory(publicAssetsDirectory);
  if (JSON.stringify(candidate.manifest.artifacts.map(({ file }) => file).sort())
    !== JSON.stringify(PUBLIC_ASSET_FILES)) {
    throw new Error("candidate and public release asset sets do not match.");
  }
  if (!Array.isArray(publicAssetMetadata) || publicAssetMetadata.length !== PUBLIC_ASSET_FILES.length) {
    throw new Error("promotion proof release asset metadata is malformed.");
  }
  const sortedMetadata = [...publicAssetMetadata].sort((left, right) =>
    left.name.localeCompare(right.name));
  if (JSON.stringify(sortedMetadata.map(({ name }) => name)) !== JSON.stringify(PUBLIC_ASSET_FILES)
    || sortedMetadata.some(({ id, digest }) => !Number.isSafeInteger(id) || id < 1
      || typeof digest !== "string" || !/^sha256:[a-f0-9]{64}$/u.test(digest))) {
    throw new Error("promotion proof release asset metadata is malformed.");
  }
  const assets = candidate.manifest.artifacts.map(({ file, sha256, size_bytes: sizeBytes }) => {
    const publicPath = path.join(publicAssetsRoot, file);
    const publicSha256 = sha256File(publicPath);
    const publicSize = readFileSync(publicPath).byteLength;
    const metadata = sortedMetadata.find(({ name }) => name === file);
    if (publicSha256 !== sha256 || publicSize !== sizeBytes
      || metadata?.size !== sizeBytes || metadata.digest !== `sha256:${sha256}`) {
      throw new Error(`public release asset differs from retained candidate: ${file}`);
    }
    return {
      id: metadata.id,
      file,
      retained_sha256: sha256,
      public_sha256: publicSha256,
      api_digest: metadata.digest,
      size_bytes: sizeBytes,
    };
  });
  return {
    schema_version: 1,
    status: "published",
    producer: "phase5-release-promotion/v1",
    workflow: {
      path: ".github/workflows/release-promotion.yml",
      event: "workflow_dispatch",
      environment: "public-release-promotion",
      repository,
      run_id: promotionRunId,
      publication_job_attempt: publicationJobAttempt,
    },
    candidate_run_id: candidateRunId,
    candidate_id: candidate.manifest.candidate_id,
    candidate_commit: candidate.manifest.source.commit,
    manifest_sha256: candidate.manifest_sha256,
    attended_run_id: attendedRunId,
    attended_artifact_name: attendedArtifactName,
    attended_record_sha256: attendedRecordSha256,
    phase6_n4_run_id: phase6N4RunId,
    phase6_n4_artifact_name: phase6N4ArtifactName,
    phase6_n4_record_sha256: phase6N4RecordSha256,
    release_id: releaseId,
    release_tag: releaseTag,
    assets,
  };
}

export function validatePhase5PromotionProof({
  proof, proofBytes, candidate, attendedRecordSha256, phase6N4RunId,
  phase6N4ArtifactName, phase6N4RecordSha256, releaseId,
  publicationJobAttempt, publicAssetMetadata, publicAssetsDirectory,
}) {
  if (proof?.phase6_n4_run_id !== phase6N4RunId
    || proof?.phase6_n4_artifact_name !== phase6N4ArtifactName
    || proof?.phase6_n4_record_sha256 !== phase6N4RecordSha256) {
    throw new Error("promotion proof does not match Phase 6 N4 evidence.");
  }
  const expected = createPhase5PromotionProof({
    candidate,
    candidateRunId: proof?.candidate_run_id,
    attendedRunId: proof?.attended_run_id,
    attendedArtifactName: proof?.attended_artifact_name,
    attendedRecordSha256,
    phase6N4RunId,
    phase6N4ArtifactName,
    phase6N4RecordSha256,
    releaseId,
    publicationJobAttempt,
    publicAssetMetadata,
    promotionRunId: proof?.workflow?.run_id,
    repository: proof?.workflow?.repository,
    releaseTag: proof?.release_tag,
    publicAssetsDirectory,
  });
  if (serializePhase5PromotionProof(expected) !== proofBytes.toString("utf8")) {
    throw new Error("promotion proof is noncanonical or does not match public bytes.");
  }
  return expected;
}

export function parsePhase5PromotionProofArguments(args) {
  const options = {};
  const mapping = new Map([
    ["--bundle-dir", "bundleDirectory"],
    ["--manifest-sha256", "manifestSha256"],
    ["--candidate-run-id", "candidateRunId"],
    ["--attended-run-id", "attendedRunId"],
    ["--attended-artifact-name", "attendedArtifactName"],
    ["--attended-record", "attendedRecord"],
    ["--attended-record-sha256", "attendedRecordSha256"],
    ["--phase6-n4-run-id", "phase6N4RunId"],
    ["--phase6-n4-artifact-name", "phase6N4ArtifactName"],
    ["--phase6-n4-record", "phase6N4Record"],
    ["--phase6-n4-record-sha256", "phase6N4RecordSha256"],
    ["--release-id", "releaseId"],
    ["--publication-job-attempt", "publicationJobAttempt"],
    ["--public-asset-metadata", "publicAssetMetadata"],
    ["--promotion-run-id", "promotionRunId"],
    ["--repository", "repository"],
    ["--release-tag", "releaseTag"],
    ["--public-assets-dir", "publicAssetsDirectory"],
    ["--output", "output"],
  ]);
  for (let index = 0; index < args.length; index += 2) {
    const key = mapping.get(args[index]);
    const value = args[index + 1];
    if (!key || !value || value.startsWith("--") || Object.hasOwn(options, key)) {
      throw new Error("promotion proof arguments are malformed.");
    }
    options[key] = value;
  }
  if (Object.keys(options).length !== mapping.size) {
    throw new Error("promotion proof requires every immutable input.");
  }
  return options;
}

export function executePhase5PromotionProof(args = process.argv.slice(2)) {
  const options = parsePhase5PromotionProofArguments(args);
  const candidate = loadPhase5Candidate({
    bundleDirectory: options.bundleDirectory,
    expectedManifestSha256: options.manifestSha256,
  });
  if (sha256File(options.attendedRecord) !== options.attendedRecordSha256) {
    throw new Error("promotion attended record hash does not match bytes.");
  }
  if (sha256File(options.phase6N4Record) !== options.phase6N4RecordSha256) {
    throw new Error("promotion Phase 6 N4 record hash does not match bytes.");
  }
  let publicAssetMetadata;
  try {
    publicAssetMetadata = JSON.parse(readFileSync(options.publicAssetMetadata, "utf8"));
  } catch {
    throw new Error("promotion release asset metadata is invalid JSON.");
  }
  if (!/^[1-9][0-9]*$/u.test(options.releaseId ?? "")) {
    throw new Error("promotion release ID is malformed.");
  }
  if (!/^[1-9][0-9]*$/u.test(options.publicationJobAttempt ?? "")) {
    throw new Error("promotion publication job attempt is malformed.");
  }
  const proof = createPhase5PromotionProof({
    candidate,
    ...options,
    releaseId: Number(options.releaseId),
    publicationJobAttempt: Number(options.publicationJobAttempt),
    publicAssetMetadata,
  });
  writeFileSync(options.output, serializePhase5PromotionProof(proof), { flag: "wx" });
  return proof;
}

const isMain = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    const proof = executePhase5PromotionProof();
    process.stdout.write(`${JSON.stringify({ ok: true, release_tag: proof.release_tag })}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ ok: false, error: error.message })}\n`);
    process.exitCode = 1;
  }
}
