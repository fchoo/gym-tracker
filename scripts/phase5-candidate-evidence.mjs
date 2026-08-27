import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import {
  validateReleaseCandidateBundle,
  validateReleaseCandidateManifest,
} from "./create-release-candidate-manifest.mjs";

export const PHASE5_MANIFEST_FILE = "release-candidate.json";
export const PHASE5_PRODUCTION_PACKAGE = "com.fchoo.gymtracker";
export const SHA256_PATTERN = /^[a-f0-9]{64}$/u;

export function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function sha256File(filePath) {
  return sha256Bytes(readFileSync(filePath));
}

function fail(message) {
  throw new Error(`phase5_candidate_invalid: ${message}`);
}

function exactJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function phase5CandidateIdentity(manifest, manifestSha256) {
  return {
    candidate_id: manifest.candidate_id,
    manifest_sha256: manifestSha256,
    source: manifest.source,
    profile: manifest.build.profile,
    package: manifest.source.package,
    artifacts: manifest.artifacts,
    workflow: manifest.workflow,
  };
}

export function validatePhase5CandidateIdentity({
  manifest,
  manifestSha256,
  expectedManifest,
  expectedManifestSha256,
} = {}) {
  validateReleaseCandidateManifest(manifest);
  if (!SHA256_PATTERN.test(manifestSha256 ?? "")) {
    fail("manifest digest is malformed.");
  }
  if (manifest.build.profile !== "production"
    || manifest.source.package !== PHASE5_PRODUCTION_PACKAGE
    || /devtest/iu.test(JSON.stringify(manifest))) {
    fail("only the production package/profile can support exact-candidate claims.");
  }
  if (expectedManifest !== undefined && !exactJson(manifest, expectedManifest)) {
    fail("candidate identity does not match the expected manifest.");
  }
  if (expectedManifestSha256 !== undefined
    && manifestSha256 !== expectedManifestSha256) {
    fail("manifest digest does not match the explicit expected digest.");
  }
  return phase5CandidateIdentity(manifest, manifestSha256);
}

export function loadPhase5Candidate({
  bundleDirectory,
  manifestFile = PHASE5_MANIFEST_FILE,
  expectedManifestSha256,
} = {}) {
  if (typeof bundleDirectory !== "string" || bundleDirectory.length < 1) {
    fail("bundle directory is required.");
  }
  const candidate = validateReleaseCandidateBundle({
    bundleDirectory,
    manifestFile,
  });
  validatePhase5CandidateIdentity({
    manifest: candidate.manifest,
    manifestSha256: candidate.manifest_sha256,
    expectedManifestSha256,
  });
  return candidate;
}

export function validatePhase5EvidenceIdentity(
  evidence,
  manifest,
  manifestSha256,
  expectedProducer,
) {
  const expected = phase5CandidateIdentity(manifest, manifestSha256);
  if (evidence?.schema_version !== 1
    || evidence?.suite !== "phase5"
    || evidence?.status !== "passed"
    || evidence?.mode !== "automated-only"
    || evidence?.approval_status !== "evidence_pending"
    || evidence?.attended_scope !== "excluded"
    || evidence?.producer !== expectedProducer
    || !exactJson(evidence?.candidate, expected)) {
    fail("automated producer or candidate identity is invalid.");
  }
}

export function validatePhase5DeviceIdentity(device, manifest) {
  const apk = manifest.artifacts.find(({ kind }) => kind === "apk");
  if (device?.role !== "automated-emulator"
    || typeof device.model !== "string"
    || device.model.length < 1
    || !Number.isSafeInteger(device.api)
    || device.api < 24
    || typeof device.abi !== "string"
    || !SHA256_PATTERN.test(device.serial_sha256 ?? "")
    || device.installed_package !== PHASE5_PRODUCTION_PACKAGE
    || device.installed_version_code !== manifest.source.version_code
    || device.installed_apk_sha256 !== apk?.sha256) {
    fail("installed production candidate identity is invalid.");
  }
}

export function parsePhase5CandidateArguments(args, extras = new Map()) {
  const options = {
    bundleDirectory: undefined,
    manifestFile: PHASE5_MANIFEST_FILE,
    expectedManifestSha256: undefined,
  };
  const mapping = new Map([
    ["--bundle-dir", "bundleDirectory"],
    ["--manifest-file", "manifestFile"],
    ["--manifest-sha256", "expectedManifestSha256"],
    ...extras,
  ]);
  for (let index = 0; index < args.length; index += 1) {
    const key = mapping.get(args[index]);
    const value = args[index + 1];
    if (key === undefined || typeof value !== "string"
      || value.length < 1 || value.startsWith("--")
      || options[key] !== undefined && key !== "manifestFile") {
      fail("arguments are malformed.");
    }
    options[key] = value;
    index += 1;
  }
  if (options.bundleDirectory === undefined
    || !SHA256_PATTERN.test(options.expectedManifestSha256 ?? "")) {
    fail("explicit bundle and manifest SHA-256 are required.");
  }
  return options;
}
