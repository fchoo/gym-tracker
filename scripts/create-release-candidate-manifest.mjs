#!/usr/bin/env node

import {
  execFileSync,
} from "node:child_process";
import {
  createHash,
} from "node:crypto";
import {
  lstatSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import {
  sourceTreeSha256,
} from "./source-tree-digest.mjs";

export const RELEASE_CANDIDATE_SCHEMA_VERSION = 1;
export const RELEASE_CANDIDATE_ARTIFACTS = Object.freeze([
  Object.freeze({
    kind: "apk",
    file: "gym-tracker-release.apk",
    innerFiles: Object.freeze([
      "assets/index.android.bundle",
      "assets/app.config",
    ]),
  }),
  Object.freeze({
    kind: "aab",
    file: "gym-tracker-release.aab",
    innerFiles: Object.freeze([
      "base/assets/index.android.bundle",
      "base/assets/app.config",
    ]),
  }),
]);

const SHA256 = /^[a-f0-9]{64}$/u;
const COMMIT = /^[a-f0-9]{40}$/u;
const CANDIDATE_ID = /^[a-z0-9][a-z0-9-]{2,79}$/u;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;
const RUN_ID = /^[1-9][0-9]*$/u;
const SAFE_FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const MAX_ARTIFACT_BYTES = 512 * 1024 * 1024;
const MAX_INNER_FILE_BYTES = 128 * 1024 * 1024;

function fail(message) {
  throw new Error(`release_candidate_invalid: ${message}`);
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

function assertSha256(value, label) {
  if (typeof value !== "string" || !SHA256.test(value)) {
    fail(`${label} must be a SHA-256 digest.`);
  }
}

function assertSafeFileName(value, label) {
  if (typeof value !== "string"
    || !SAFE_FILE_NAME.test(value)
    || path.posix.basename(value) !== value
    || path.win32.basename(value) !== value) {
    fail(`${label} must be a simple file name.`);
  }
}

function assertSafeInnerPath(value, label) {
  if (typeof value !== "string"
    || value.length < 1
    || value.length > 240
    || value.startsWith("/")
    || value.includes("\\")
    || value.split("/").some((part) => part === "" || part === "." || part === "..")) {
    fail(`${label} is not a safe archive entry.`);
  }
}

function assertSafePositiveInteger(value, label, maximum = MAX_ARTIFACT_BYTES) {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    fail(`${label} must be a bounded positive integer.`);
  }
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function canonicalJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function bundlePath(bundleDirectory, fileName) {
  assertSafeFileName(fileName, "bundle file");
  const absoluteBundle = path.resolve(bundleDirectory);
  const resolved = path.resolve(absoluteBundle, fileName);
  if (path.dirname(resolved) !== absoluteBundle) {
    fail("bundle file escapes its candidate directory.");
  }
  const details = lstatSync(resolved, { throwIfNoEntry: false });
  if (details === undefined || !details.isFile() || details.isSymbolicLink()) {
    fail("candidate bundle file is missing or unsafe.");
  }
  return resolved;
}

function bundleOutputPath(bundleDirectory, fileName) {
  assertSafeFileName(fileName, "output file");
  const absoluteBundle = path.resolve(bundleDirectory);
  const resolved = path.resolve(absoluteBundle, fileName);
  if (path.dirname(resolved) !== absoluteBundle) {
    fail("output file escapes its candidate directory.");
  }
  return resolved;
}

function zipEntryBytes(archivePath, entryPath) {
  assertSafeInnerPath(entryPath, "inner file");
  try {
    const bytes = execFileSync("unzip", ["-p", archivePath, entryPath], {
      encoding: null,
      maxBuffer: MAX_INNER_FILE_BYTES,
      stdio: ["ignore", "pipe", "ignore"],
    });
    if (bytes.byteLength < 1 || bytes.byteLength > MAX_INNER_FILE_BYTES) {
      fail("candidate inner file is empty or exceeds its bound.");
    }
    return bytes;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("release_candidate_invalid:")) {
      throw error;
    }
    fail("candidate inner file is unavailable.");
  }
}

function inspectArtifact(bundleDirectory, definition) {
  const archivePath = bundlePath(bundleDirectory, definition.file);
  const bytes = readFileSync(archivePath);
  assertSafePositiveInteger(bytes.byteLength, "candidate artifact size");
  return Object.freeze({
    kind: definition.kind,
    file: definition.file,
    sha256: sha256(bytes),
    size_bytes: bytes.byteLength,
    inner_files: definition.innerFiles.map((entryPath) => {
      const entry = zipEntryBytes(archivePath, entryPath);
      return Object.freeze({
        path: entryPath,
        sha256: sha256(entry),
        size_bytes: entry.byteLength,
      });
    }),
  });
}

function validateToolchain(value) {
  if (!isPlainObject(value) || !hasExactKeys(value, [
    "android_api", "build_tools", "java", "ndk", "node", "npm",
  ])) {
    fail("toolchain is malformed.");
  }
  if (typeof value.node !== "string"
    || typeof value.npm !== "string"
    || typeof value.java !== "string"
    || typeof value.build_tools !== "string"
    || typeof value.ndk !== "string"
    || !Number.isSafeInteger(value.android_api)
    || value.android_api < 1) {
    fail("toolchain values are malformed.");
  }
  return Object.freeze({
    node: value.node,
    npm: value.npm,
    java: value.java,
    android_api: value.android_api,
    build_tools: value.build_tools,
    ndk: value.ndk,
  });
}

function readJson(bundleDirectory, fileName, label) {
  const filePath = bundlePath(bundleDirectory, fileName);
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    fail(`${label} is not valid JSON.`);
  }
}

export function serializeReleaseCandidateManifest(manifest) {
  return canonicalJson(manifest);
}

export function manifestSha256(manifestBytes) {
  return sha256(manifestBytes);
}

export function createReleaseCandidateManifest({
  bundleDirectory,
  candidateId,
  sourceCommit,
  sourceTreeSha256,
  configFile = "release-config.json",
  toolchainFile = "release-toolchain.json",
  retainedArtifactName,
  retentionDays = 30,
  workflowRepository,
  workflowRunId,
} = {}) {
  if (typeof candidateId !== "string" || !CANDIDATE_ID.test(candidateId)) {
    fail("candidate_id is malformed.");
  }
  if (typeof sourceCommit !== "string" || !COMMIT.test(sourceCommit)) {
    fail("source commit is malformed.");
  }
  assertSha256(sourceTreeSha256, "source tree");
  assertSafeFileName(configFile, "config file");
  assertSafeFileName(toolchainFile, "toolchain file");
  if (typeof retainedArtifactName !== "string"
    || !/^[a-z0-9][a-z0-9-]{2,127}$/u.test(retainedArtifactName)) {
    fail("retained artifact name is malformed.");
  }
  if (!Number.isSafeInteger(retentionDays) || retentionDays < 1 || retentionDays > 90) {
    fail("retention days are outside the supported range.");
  }
  if (typeof workflowRepository !== "string" || !REPOSITORY.test(workflowRepository)
    || typeof workflowRunId !== "string" || !RUN_ID.test(workflowRunId)) {
    fail("candidate workflow repository or run ID is malformed.");
  }

  const config = readJson(bundleDirectory, configFile, "release config");
  const packageName = config?.android?.package;
  if (typeof packageName !== "string"
    || !/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/u.test(packageName)) {
    fail("release config package is malformed.");
  }
  const versionName = config?.version;
  const versionCode = config?.android?.versionCode;
  if (typeof versionName !== "string"
    || !/^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/u.test(versionName)
    || !Number.isSafeInteger(versionCode)
    || versionCode < 1
    || config?.extra?.buildProfile !== "production"
    || config?.extra?.nativeContractsEnabled !== false
    || /devtest/iu.test(JSON.stringify(config))) {
    fail("release config is not an exact production identity.");
  }
  const toolchain = validateToolchain(readJson(bundleDirectory, toolchainFile, "toolchain"));
  const configBytes = readFileSync(bundlePath(bundleDirectory, configFile));
  for (const definition of RELEASE_CANDIDATE_ARTIFACTS) {
    const embeddedConfigPath = definition.innerFiles.find((entry) => entry.endsWith("app.config"));
    let embeddedConfig;
    try {
      embeddedConfig = JSON.parse(zipEntryBytes(
        bundlePath(bundleDirectory, definition.file), embeddedConfigPath,
      ).toString("utf8"));
    } catch {
      fail(`embedded ${definition.kind} app.config is not valid JSON.`);
    }
    if (embeddedConfig?.android?.package !== packageName
      || embeddedConfig?.android?.versionCode !== versionCode
      || embeddedConfig?.version !== versionName
      || embeddedConfig?.extra?.buildProfile !== "production"
      || embeddedConfig?.extra?.nativeContractsEnabled !== false
      || /devtest/iu.test(JSON.stringify(embeddedConfig))) {
      fail(`embedded ${definition.kind} app.config is not production identity.`);
    }
  }

  return Object.freeze({
    schema_version: RELEASE_CANDIDATE_SCHEMA_VERSION,
    candidate_id: candidateId,
    source: Object.freeze({
      commit: sourceCommit,
      tree_sha256: sourceTreeSha256,
      config_sha256: sha256(configBytes),
      package: packageName,
      version_code: versionCode,
      version_name: versionName,
    }),
    build: Object.freeze({
      profile: "production",
      toolchain,
    }),
    workflow: Object.freeze({
      repository: workflowRepository,
      run_id: workflowRunId,
    }),
    artifacts: RELEASE_CANDIDATE_ARTIFACTS.map((definition) =>
      inspectArtifact(bundleDirectory, definition)),
    retained_bundle: Object.freeze({
      artifact_name: retainedArtifactName,
      retention_days: retentionDays,
    }),
  });
}

function validateArtifactShape(value, definition) {
  if (!isPlainObject(value) || !hasExactKeys(value, [
    "file", "inner_files", "kind", "sha256", "size_bytes",
  ])
    || value.kind !== definition.kind
    || value.file !== definition.file
    || !Array.isArray(value.inner_files)
    || value.inner_files.length !== definition.innerFiles.length) {
    fail("candidate artifact manifest is malformed.");
  }
  assertSha256(value.sha256, "artifact digest");
  assertSafePositiveInteger(value.size_bytes, "artifact size");
  for (const [index, expectedPath] of definition.innerFiles.entries()) {
    const inner = value.inner_files[index];
    if (!isPlainObject(inner) || !hasExactKeys(inner, ["path", "sha256", "size_bytes"])
      || inner.path !== expectedPath) {
      fail("candidate inner-file manifest is malformed.");
    }
    assertSafeInnerPath(inner.path, "inner-file path");
    assertSha256(inner.sha256, "inner-file digest");
    assertSafePositiveInteger(inner.size_bytes, "inner-file size", MAX_INNER_FILE_BYTES);
  }
}

export function validateReleaseCandidateManifest(manifest) {
  if (!isPlainObject(manifest) || !hasExactKeys(manifest, [
    "artifacts", "build", "candidate_id", "retained_bundle", "schema_version", "source", "workflow",
  ])
    || manifest.schema_version !== RELEASE_CANDIDATE_SCHEMA_VERSION
    || typeof manifest.candidate_id !== "string"
    || !CANDIDATE_ID.test(manifest.candidate_id)) {
    fail("candidate manifest is malformed.");
  }
  if (!isPlainObject(manifest.source) || !hasExactKeys(manifest.source, [
    "commit", "config_sha256", "package", "tree_sha256",
    "version_code", "version_name",
  ])
    || typeof manifest.source.commit !== "string"
    || !COMMIT.test(manifest.source.commit)
    || typeof manifest.source.package !== "string"
    || !/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/u.test(manifest.source.package)
    || typeof manifest.source.version_name !== "string"
    || !/^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/u.test(manifest.source.version_name)
    || !Number.isSafeInteger(manifest.source.version_code)
    || manifest.source.version_code < 1) {
    fail("candidate source identity is malformed.");
  }
  assertSha256(manifest.source.tree_sha256, "source tree");
  assertSha256(manifest.source.config_sha256, "source config");
  if (!isPlainObject(manifest.build) || !hasExactKeys(manifest.build, ["profile", "toolchain"])
    || manifest.build.profile !== "production") {
    fail("candidate build identity is malformed.");
  }
  validateToolchain(manifest.build.toolchain);
  if (!isPlainObject(manifest.workflow)
    || !hasExactKeys(manifest.workflow, ["repository", "run_id"])
    || !REPOSITORY.test(manifest.workflow.repository ?? "")
    || !RUN_ID.test(manifest.workflow.run_id ?? "")) {
    fail("candidate workflow provenance is malformed.");
  }
  if (!Array.isArray(manifest.artifacts)
    || manifest.artifacts.length !== RELEASE_CANDIDATE_ARTIFACTS.length) {
    fail("candidate artifacts are malformed.");
  }
  for (const [index, definition] of RELEASE_CANDIDATE_ARTIFACTS.entries()) {
    validateArtifactShape(manifest.artifacts[index], definition);
  }
  if (!isPlainObject(manifest.retained_bundle) || !hasExactKeys(manifest.retained_bundle, [
    "artifact_name", "retention_days",
  ])
    || typeof manifest.retained_bundle.artifact_name !== "string"
    || !/^[a-z0-9][a-z0-9-]{2,127}$/u.test(manifest.retained_bundle.artifact_name)
    || !Number.isSafeInteger(manifest.retained_bundle.retention_days)
    || manifest.retained_bundle.retention_days < 1
    || manifest.retained_bundle.retention_days > 90) {
    fail("candidate retention identity is malformed.");
  }
  return manifest;
}

export function validateReleaseCandidateBundle({
  bundleDirectory,
  manifestFile = "release-candidate.json",
} = {}) {
  assertSafeFileName(manifestFile, "manifest file");
  const manifestPath = bundlePath(bundleDirectory, manifestFile);
  const manifestBytes = readFileSync(manifestPath);
  let manifest;
  try {
    manifest = JSON.parse(manifestBytes.toString("utf8"));
  } catch {
    fail("candidate manifest is not valid JSON.");
  }
  validateReleaseCandidateManifest(manifest);
  if (canonicalJson(manifest) !== manifestBytes.toString("utf8")) {
    fail("candidate manifest is not canonical.");
  }
  const expected = createReleaseCandidateManifest({
    bundleDirectory,
    candidateId: manifest.candidate_id,
    sourceCommit: manifest.source.commit,
    sourceTreeSha256: manifest.source.tree_sha256,
    retainedArtifactName: manifest.retained_bundle.artifact_name,
    retentionDays: manifest.retained_bundle.retention_days,
    workflowRepository: manifest.workflow.repository,
    workflowRunId: manifest.workflow.run_id,
  });
  if (canonicalJson(expected) !== canonicalJson(manifest)) {
    fail("candidate bytes do not match the manifest.");
  }
  return Object.freeze({
    manifest,
    manifest_sha256: manifestSha256(manifestBytes),
  });
}

function parseCliArguments(args) {
  const options = {
    bundleDirectory: undefined,
    candidateId: undefined,
    configFile: "release-config.json",
    toolchainFile: "release-toolchain.json",
    manifestFile: "release-candidate.json",
    retainedArtifactName: undefined,
    workflowRepository: undefined,
    workflowRunId: undefined,
  };
  const keys = new Map([
    ["--bundle-dir", "bundleDirectory"],
    ["--candidate-id", "candidateId"],
    ["--config-file", "configFile"],
    ["--toolchain-file", "toolchainFile"],
    ["--manifest-file", "manifestFile"],
    ["--retained-artifact-name", "retainedArtifactName"],
    ["--repository", "workflowRepository"],
    ["--run-id", "workflowRunId"],
  ]);
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const key = keys.get(argument);
    if (key === undefined || options[key] !== undefined && key !== "configFile" && key !== "toolchainFile" && key !== "manifestFile") {
      fail("candidate manifest arguments are malformed.");
    }
    const value = args[index + 1];
    if (typeof value !== "string" || value.length < 1 || value.startsWith("--")) {
      fail("candidate manifest argument is missing its value.");
    }
    options[key] = value;
    index += 1;
  }
  if (options.bundleDirectory === undefined
    || options.candidateId === undefined
    || options.retainedArtifactName === undefined
    || options.workflowRepository === undefined
    || options.workflowRunId === undefined) {
    fail("candidate manifest requires bundle, candidate, and retained artifact identifiers.");
  }
  return options;
}

async function executeCli() {
  const options = parseCliArguments(process.argv.slice(2));
  const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  const manifest = createReleaseCandidateManifest({
    ...options,
    sourceCommit,
    sourceTreeSha256: sourceTreeSha256(),
  });
  const outputPath = bundleOutputPath(options.bundleDirectory, options.manifestFile);
  writeFileSync(outputPath, serializeReleaseCandidateManifest(manifest), { flag: "w" });
  const verified = validateReleaseCandidateBundle({
    bundleDirectory: options.bundleDirectory,
    manifestFile: options.manifestFile,
  });
  process.stdout.write(`${JSON.stringify({
    ok: true,
    candidate_id: verified.manifest.candidate_id,
    manifest_sha256: verified.manifest_sha256,
  })}\n`);
}

const isMain = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  executeCli().catch((error) => {
    process.stderr.write(`${JSON.stringify({
      ok: false,
      error: "release_candidate_manifest_failed",
      message: error instanceof Error ? error.message : "release_candidate_invalid",
    })}\n`);
    process.exitCode = 1;
  });
}
