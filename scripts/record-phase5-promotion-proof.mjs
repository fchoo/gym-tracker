#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
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

export function serializePhase5PromotionProof(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function createPhase5PromotionProof({
  candidate, candidateRunId, attendedRunId, attendedArtifactName,
  attendedRecordSha256, promotionRunId, repository, releaseTag,
  publicAssetsDirectory,
}) {
  if (!RUN_ID.test(candidateRunId ?? "") || !RUN_ID.test(attendedRunId ?? "")
    || !RUN_ID.test(promotionRunId ?? "") || !REPOSITORY.test(repository ?? "")
    || !RELEASE_TAG.test(releaseTag ?? "")
    || !SHA256_PATTERN.test(attendedRecordSha256 ?? "")
    || !ARTIFACT_NAME.test(attendedArtifactName ?? "")
    || candidate.manifest.workflow.run_id !== candidateRunId
    || candidate.manifest.workflow.repository !== repository) {
    throw new Error("promotion proof identity is malformed or substituted.");
  }
  const assets = candidate.manifest.artifacts.map(({ file, sha256, size_bytes: sizeBytes }) => {
    const publicPath = path.join(publicAssetsDirectory, file);
    const publicSha256 = sha256File(publicPath);
    const publicSize = readFileSync(publicPath).byteLength;
    if (publicSha256 !== sha256 || publicSize !== sizeBytes) {
      throw new Error(`public release asset differs from retained candidate: ${file}`);
    }
    return {
      file,
      retained_sha256: sha256,
      public_sha256: publicSha256,
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
    },
    candidate_run_id: candidateRunId,
    candidate_id: candidate.manifest.candidate_id,
    candidate_commit: candidate.manifest.source.commit,
    manifest_sha256: candidate.manifest_sha256,
    attended_run_id: attendedRunId,
    attended_artifact_name: attendedArtifactName,
    attended_record_sha256: attendedRecordSha256,
    release_tag: releaseTag,
    assets,
  };
}

export function validatePhase5PromotionProof({
  proof, proofBytes, candidate, attendedRecordSha256, publicAssetsDirectory,
}) {
  const expected = createPhase5PromotionProof({
    candidate,
    candidateRunId: proof?.candidate_run_id,
    attendedRunId: proof?.attended_run_id,
    attendedArtifactName: proof?.attended_artifact_name,
    attendedRecordSha256,
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

function parseArgs(args) {
  const options = {};
  const mapping = new Map([
    ["--bundle-dir", "bundleDirectory"],
    ["--manifest-sha256", "manifestSha256"],
    ["--candidate-run-id", "candidateRunId"],
    ["--attended-run-id", "attendedRunId"],
    ["--attended-artifact-name", "attendedArtifactName"],
    ["--attended-record", "attendedRecord"],
    ["--attended-record-sha256", "attendedRecordSha256"],
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
  const options = parseArgs(args);
  const candidate = loadPhase5Candidate({
    bundleDirectory: options.bundleDirectory,
    expectedManifestSha256: options.manifestSha256,
  });
  if (sha256File(options.attendedRecord) !== options.attendedRecordSha256) {
    throw new Error("promotion attended record hash does not match bytes.");
  }
  const proof = createPhase5PromotionProof({ candidate, ...options });
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
