import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  applyPhase14VisualAttestation,
  canonicalJson,
  validatePhase14CaptureIndex,
  validatePhase14VisualAttestation,
} from "./phase14-visual-review.mjs";
import { validatePhase14Evidence } from "./verify-phase14-evidence.mjs";

const ROOT = process.cwd();
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function relative(filePath) {
  return path.relative(ROOT, path.resolve(ROOT, filePath)).replace(/\\/gu, "/");
}

export function parsePhase14FinalizeArgs(args) {
  const options = { ids: [], all: false, attestation: "", output: "artifacts/native/phase14/finalized-evidence.json" };
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--attestation") options.attestation = args[++index] ?? "";
    else if (args[index] === "--output") options.output = args[++index] ?? "";
    else if (args[index] === "--all") options.all = true;
    else if (args[index] === "--ids") options.ids = (args[++index] ?? "").split(",").filter(Boolean);
    else throw new Error(`phase14_finalize_unknown_argument:${args[index]}`);
  }
  if (
    !options.attestation.startsWith("artifacts/native/phase14/review/")
    || !options.attestation.endsWith(".json")
    || options.output !== "artifacts/native/phase14/finalized-evidence.json"
    || options.all === (options.ids.length > 0)
    || new Set(options.ids).size !== options.ids.length
  ) throw new Error("phase14_finalize_arguments_invalid");
  return options;
}

export function finalizeExistingPhase14Evidence({ evidence, manifest, captureIndex, attestation, ids }) {
  validatePhase14Evidence(evidence, manifest, ids, { coverageMode: evidence.coverage?.mode });
  validatePhase14CaptureIndex(captureIndex, evidence);
  validatePhase14VisualAttestation(attestation, captureIndex);
  return applyPhase14VisualAttestation(evidence, captureIndex, attestation);
}

export function executePhase14Finalize(args = process.argv.slice(2)) {
  const options = parsePhase14FinalizeArgs(args);
  const manifest = JSON.parse(readFileSync("artifacts/native/phase14/build.json", "utf8"));
  const evidence = JSON.parse(readFileSync("artifacts/native/phase14/maestro/phase14-evidence.json", "utf8"));
  const captureIndex = JSON.parse(readFileSync("artifacts/native/phase14/capture-index.json", "utf8"));
  const attestationBytes = readFileSync(options.attestation);
  const attestation = JSON.parse(attestationBytes.toString("utf8"));
  const ids = options.all ? evidence.evidence.map(({ id }) => id) : options.ids;
  const finalized = structuredClone(finalizeExistingPhase14Evidence({ evidence, manifest, captureIndex, attestation, ids }));
  finalized.finalization.attestation = {
    path: relative(options.attestation),
    file_sha256: sha256(attestationBytes),
    content_sha256: sha256(canonicalJson(attestation)),
  };
  const outputBytes = Buffer.from(`${JSON.stringify(finalized, null, 2)}\n`);
  writeFileSync(options.output, outputBytes);
  return Object.freeze({
    schema_version: 1,
    producer: "phase14-finalize-existing/v1",
    verdict: finalized.verdict,
    capture_set_sha256: captureIndex.capture_set_sha256,
    output: options.output,
    output_sha256: sha256(outputBytes),
  });
}

if (process.argv[1]?.endsWith("finalize-phase14-evidence.mjs")) {
  try {
    process.stdout.write(`${JSON.stringify({ ok: true, ...executePhase14Finalize() })}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ ok: false, error: error.message })}\n`);
    process.exitCode = 1;
  }
}
