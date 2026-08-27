#!/usr/bin/env node

import {
  createHash,
} from "node:crypto";
import {
  readFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import {
  validateReleaseCandidateBundle,
} from "./create-release-candidate-manifest.mjs";

const SHA256 = /^[a-f0-9]{64}$/u;
const RELEASE_TAG = /^v[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/u;

function fail(message) {
  throw new Error(`release_promotion_invalid: ${message}`);
}

function isPlainObject(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value, expected) {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length
    && actual.every((key, index) => key === sortedExpected[index]);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function readReview(filePath) {
  try {
    return { bytes: readFileSync(filePath), value: JSON.parse(readFileSync(filePath, "utf8")) };
  } catch {
    fail("physical review record is not valid JSON.");
  }
}

export function validateReleasePromotionRecord({ candidate, reviewBytes, review }) {
  if (!Array.isArray(review?.rows) || review.rows.length < 1) {
    fail("digest-only physical review records are disabled; use the Phase 5 attended record verifier.");
  }
  if (!isPlainObject(review) || !hasExactKeys(review, [
    "artifacts",
    "attended_evidence_sha256",
    "candidate_id",
    "manifest_sha256",
    "owner_token",
    "schema_version",
    "source",
  ])
    || review.schema_version !== 1
    || review.candidate_id !== candidate.manifest.candidate_id
    || review.manifest_sha256 !== candidate.manifest_sha256
    || review.owner_token !== "approved"
    || typeof review.attended_evidence_sha256 !== "string"
    || !SHA256.test(review.attended_evidence_sha256)) {
    fail("physical review record is malformed or unapproved.");
  }
  if (!isPlainObject(review.source) || JSON.stringify(review.source) !== JSON.stringify(candidate.manifest.source)) {
    fail("physical review source identity does not match the retained candidate.");
  }
  if (!Array.isArray(review.artifacts)
    || JSON.stringify(review.artifacts) !== JSON.stringify(candidate.manifest.artifacts)) {
    fail("physical review artifact identity does not match the retained candidate.");
  }
  if (JSON.stringify(review, null, 2) + "\n" !== reviewBytes.toString("utf8")) {
    fail("physical review record is not canonical.");
  }
  return Object.freeze({ review_sha256: sha256(reviewBytes) });
}

function parseArguments(args) {
  const options = { manifestFile: "release-candidate.json" };
  const mapping = new Map([
    ["--bundle-dir", "bundleDirectory"],
    ["--manifest-file", "manifestFile"],
    ["--physical-review", "physicalReview"],
    ["--release-tag", "releaseTag"],
  ]);
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const key = mapping.get(argument);
    const value = args[index + 1];
    if (key === undefined || typeof value !== "string" || value.length < 1 || value.startsWith("--")
      || options[key] !== undefined && key !== "manifestFile") {
      fail("promotion verifier arguments are malformed.");
    }
    options[key] = value;
    index += 1;
  }
  if (options.bundleDirectory === undefined
    || options.physicalReview === undefined
    || options.releaseTag === undefined
    || !RELEASE_TAG.test(options.releaseTag)) {
    fail("promotion verifier requires a bounded bundle, review, and release tag.");
  }
  return options;
}

export function executeReleasePromotionVerifier(args = process.argv.slice(2)) {
  const options = parseArguments(args);
  const candidate = validateReleaseCandidateBundle(options);
  const reviewPath = path.resolve(options.physicalReview);
  const review = readReview(reviewPath);
  const validatedReview = validateReleasePromotionRecord({
    candidate,
    reviewBytes: review.bytes,
    review: review.value,
  });
  return Object.freeze({
    ok: true,
    candidate_id: candidate.manifest.candidate_id,
    release_tag: options.releaseTag,
    source_commit: candidate.manifest.source.commit,
    manifest_sha256: candidate.manifest_sha256,
    physical_review_sha256: validatedReview.review_sha256,
    upload_files: candidate.manifest.artifacts.map(({ file, sha256: digest, size_bytes: sizeBytes }) => ({
      file,
      sha256: digest,
      size_bytes: sizeBytes,
    })),
  });
}

const isMain = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    process.stdout.write(`${JSON.stringify(executeReleasePromotionVerifier())}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      ok: false,
      error: "release_promotion_verification_failed",
      message: error instanceof Error ? error.message : "release_promotion_invalid",
    })}\n`);
    process.exitCode = 1;
  }
}
