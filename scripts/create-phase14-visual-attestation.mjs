import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  createPhase14VisualAttestation,
  validatePhase14CaptureIndex,
} from "./phase14-visual-review.mjs";

export function parsePhase14VisualAttestationArgs(args) {
  const options = { decisions: "", output: "", reviewerIdentity: "", reviewerFingerprint: "" };
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--decisions") options.decisions = args[++index] ?? "";
    else if (args[index] === "--output") options.output = args[++index] ?? "";
    else if (args[index] === "--reviewer-identity") options.reviewerIdentity = args[++index] ?? "";
    else if (args[index] === "--reviewer-fingerprint") options.reviewerFingerprint = args[++index] ?? "";
    else throw new Error(`phase14_visual_attestation_unknown_argument:${args[index]}`);
  }
  if (
    !options.decisions.endsWith(".json")
    || !options.output.startsWith("artifacts/native/phase14/review/")
    || !options.output.endsWith(".json")
    || options.reviewerIdentity.trim().length < 3
    || !/^[a-f0-9]{64}$/u.test(options.reviewerFingerprint)
  ) throw new Error("phase14_visual_attestation_arguments_invalid");
  return options;
}

export function executePhase14VisualAttestation(args = process.argv.slice(2)) {
  const options = parsePhase14VisualAttestationArgs(args);
  const evidence = JSON.parse(readFileSync("artifacts/native/phase14/maestro/phase14-evidence.json", "utf8"));
  const index = JSON.parse(readFileSync("artifacts/native/phase14/capture-index.json", "utf8"));
  validatePhase14CaptureIndex(index, evidence);
  const decisionDocument = JSON.parse(readFileSync(options.decisions, "utf8"));
  const attestation = createPhase14VisualAttestation({
    index,
    reviewer: {
      identity: options.reviewerIdentity,
      fingerprint: options.reviewerFingerprint,
      independence_attested: true,
    },
    reviewedAt: decisionDocument.reviewed_at,
    decisions: decisionDocument.comparisons,
  });
  mkdirSync(path.dirname(options.output), { recursive: true });
  writeFileSync(options.output, `${JSON.stringify(attestation, null, 2)}\n`, { flag: "wx" });
  return Object.freeze({
    schema_version: 1,
    producer: "phase14-independent-review-artifact-writer/v1",
    capture_set_sha256: index.capture_set_sha256,
    output: options.output,
  });
}

if (process.argv[1]?.endsWith("create-phase14-visual-attestation.mjs")) {
  try {
    process.stdout.write(`${JSON.stringify({ ok: true, ...executePhase14VisualAttestation() })}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ ok: false, error: error.message })}\n`);
    process.exitCode = 1;
  }
}
