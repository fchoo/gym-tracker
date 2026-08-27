#!/usr/bin/env node

import process from "node:process";
import { pathToFileURL } from "node:url";

import {
  validateReleaseCandidateBundle,
} from "./create-release-candidate-manifest.mjs";

function parseArguments(args) {
  const options = { manifestFile: "release-candidate.json" };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const value = args[index + 1];
    if ((argument !== "--bundle-dir" && argument !== "--manifest-file")
      || typeof value !== "string"
      || value.length < 1
      || value.startsWith("--")) {
      throw new Error("release_candidate_invalid: verifier arguments are malformed.");
    }
    if (argument === "--bundle-dir" && options.bundleDirectory !== undefined) {
      throw new Error("release_candidate_invalid: bundle directory was supplied twice.");
    }
    options[argument === "--bundle-dir" ? "bundleDirectory" : "manifestFile"] = value;
    index += 1;
  }
  if (options.bundleDirectory === undefined) {
    throw new Error("release_candidate_invalid: --bundle-dir is required.");
  }
  return options;
}

export function executeReleaseCandidateVerifier(args = process.argv.slice(2)) {
  const candidate = validateReleaseCandidateBundle(parseArguments(args));
  return Object.freeze({
    ok: true,
    candidate_id: candidate.manifest.candidate_id,
    manifest_sha256: candidate.manifest_sha256,
    artifacts: candidate.manifest.artifacts.map(({ kind, sha256, size_bytes: sizeBytes }) => ({
      kind,
      sha256,
      size_bytes: sizeBytes,
    })),
  });
}

const isMain = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    process.stdout.write(`${JSON.stringify(executeReleaseCandidateVerifier())}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      ok: false,
      error: "release_candidate_verification_failed",
      message: error instanceof Error ? error.message : "release_candidate_invalid",
    })}\n`);
    process.exitCode = 1;
  }
}
