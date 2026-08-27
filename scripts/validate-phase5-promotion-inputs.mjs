#!/usr/bin/env node

import process from "node:process";
import { validateReleasePromotionInputValues } from "./phase5-promotion-contract.mjs";

const mapping = new Map([
  ["--candidate-run-id", "candidateRunId"],
  ["--attended-run-id", "attendedRunId"],
  ["--candidate-id", "candidateId"],
  ["--candidate-commit", "candidateCommit"],
  ["--attended-artifact-name", "attendedArtifactName"],
  ["--attended-record-sha256", "attendedRecordSha256"],
  ["--release-tag", "releaseTag"],
]);

try {
  const input = {};
  for (let index = 2; index < process.argv.length; index += 2) {
    const key = mapping.get(process.argv[index]);
    const value = process.argv[index + 1];
    if (!key || !value || value.startsWith("--") || Object.hasOwn(input, key)) {
      throw new Error("release promotion arguments are malformed.");
    }
    input[key] = value;
  }
  if (Object.keys(input).length !== mapping.size) {
    throw new Error("release promotion arguments are incomplete.");
  }
  validateReleasePromotionInputValues(input);
  process.stdout.write("{\"ok\":true}\n");
} catch (error) {
  process.stderr.write(`${JSON.stringify({ ok: false, error: error.message })}\n`);
  process.exitCode = 1;
}
