import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

const RUN_ID = /^phase20-\d{8}T\d{6}Z-[a-f0-9]{12}$/u;
const HASH = /^[a-f0-9]{64}$/u;
const UNIT_DIRECTORY = /^\d{6}$/u;
const STAGE_PATH = /^calendar\/stages\/\d{2}-[a-z0-9_-]+\.(?:png|trace\.json)$/u;
const REQUIREMENT_PATH = /^calendar\/requirements\/\d{2}-CAL-\d{2}-[a-z0-9-]+\.(?:png|trace\.xml)$/u;
const TRANSPORT_DIRECTORY = ".calendar-transport";
const MAX_RESULT_BYTES = 16 * 1024 * 1024;
const BINDING_KEYS = Object.freeze([
  "schema_version", "run_id", "execution_origin", "request_sha256", "flow_sha256",
  "requirements_flow_sha256", "fixture_source_sha256", "tool_facts",
]);

const fail = (code) => { throw new Error(`calendar_transport_${code}`); };
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value)}\n`);

function exact(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function validateBinding(value, runId) {
  if (!exact(value, BINDING_KEYS) || value.schema_version !== 1 || value.run_id !== runId
    || !["production-attested/v1", "test-controlled/v1"].includes(value.execution_origin)
    || ![value.request_sha256, value.flow_sha256, value.requirements_flow_sha256, value.fixture_source_sha256]
      .every((digest) => HASH.test(digest ?? ""))
    || !exact(value.tool_facts, ["adb_sha256", "maestro_sha256", "unzip_sha256"])
    || !Object.values(value.tool_facts).every((digest) => HASH.test(digest ?? ""))) fail("binding_invalid");
  return value;
}

function runRoot(root, runId) {
  if (!RUN_ID.test(runId ?? "")) fail("arguments_invalid");
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(root, "artifacts/native/v1.2", runId);
  if (!resolved.startsWith(`${resolvedRoot}${path.sep}`) || !existsSync(resolved)) fail("run_root_invalid");
  let cursor = resolvedRoot;
  for (const part of path.relative(resolvedRoot, resolved).split(path.sep)) {
    cursor = path.join(cursor, part);
    if (lstatSync(cursor).isSymbolicLink()) fail("symlink_forbidden");
  }
  return resolved;
}

function noLinks(base, target) {
  const relative = path.relative(base, target);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) fail("path_invalid");
  let cursor = base;
  for (const part of relative.split(path.sep)) {
    cursor = path.join(cursor, part);
    if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink()) fail("symlink_forbidden");
  }
}

function syncDirectory(directory) {
  const descriptor = openSync(directory, "r");
  try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
}

function writeDurable(file, bytes) {
  writeFileSync(file, bytes, { flag: "wx", mode: 0o600 });
  const descriptor = openSync(file, "r");
  try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
}

export function canonicalV12CalendarArtifactDescriptor(value) {
  const stage = typeof value?.stage_id === "string" && value.stage_id.length > 0;
  const requirement = typeof value?.requirement_id === "string" && typeof value?.probe_id === "string"
    && value.requirement_id.length > 0 && value.probe_id.length > 0;
  if (stage === requirement || !["png", "trace"].includes(value?.kind)
    || typeof value.relative_path !== "string" || !(STAGE_PATH.test(value.relative_path) || REQUIREMENT_PATH.test(value.relative_path))
    || !HASH.test(value.sha256 ?? "") || !Number.isSafeInteger(value.size_bytes) || value.size_bytes < 1) fail("artifact_descriptor_invalid");
  return Object.freeze({
    ...(stage ? { stage_id: value.stage_id } : { requirement_id: value.requirement_id, probe_id: value.probe_id }),
    kind: value.kind,
    relative_path: value.relative_path,
    sha256: value.sha256,
    size_bytes: value.size_bytes,
  });
}

function unitChainBody(receipt) {
  return {
    schema_version: 1,
    producer: "v12-calendar-artifact-transport-unit/v1",
    run_id: receipt.run_id,
    binding_sha256: receipt.binding_sha256,
    ordinal: receipt.ordinal,
    kind: receipt.kind,
    key: receipt.key,
    previous_chain_sha256: receipt.previous_chain_sha256,
    payload: receipt.payload,
    artifacts: receipt.artifacts.map(canonicalV12CalendarArtifactDescriptor),
  };
}

function freezeUnit(receipt) {
  return Object.freeze({ payload: receipt.payload, artifacts: Object.freeze(receipt.artifacts.map((artifact) => Object.freeze({ ...artifact }))) });
}

function createTransport({ root, runId, binding, create }) {
  const run = runRoot(root, runId);
  const directory = path.join(run, TRANSPORT_DIRECTORY);
  if (!existsSync(directory)) {
    if (!create) fail("missing");
    mkdirSync(directory, { mode: 0o700 });
    syncDirectory(run);
  }
  noLinks(run, directory);
  const bindingFile = path.join(directory, "binding.json");
  const validatedBinding = validateBinding(binding, runId);
  if (!existsSync(bindingFile)) {
    if (!create) fail("binding_missing");
    writeDurable(bindingFile, jsonBytes(validatedBinding));
    syncDirectory(directory);
  } else {
    let persisted;
    try { persisted = JSON.parse(readFileSync(bindingFile, "utf8")); } catch { fail("binding_invalid"); }
    validateBinding(persisted, runId);
    if (JSON.stringify(persisted) !== JSON.stringify(validatedBinding)) fail("binding_mismatch");
  }
  const bindingSha256 = sha256(JSON.stringify(validatedBinding));
  const unitsDirectory = path.join(directory, "units");
  if (!existsSync(unitsDirectory)) mkdirSync(unitsDirectory, { mode: 0o700 });
  noLinks(directory, unitsDirectory);

  const receipts = [];
  const unitNames = readdirSync(unitsDirectory).filter((name) => UNIT_DIRECTORY.test(name)).sort();
  if (readdirSync(unitsDirectory).some((name) => !UNIT_DIRECTORY.test(name))) fail("unit_invalid");
  for (const [ordinal, name] of unitNames.entries()) {
    if (name !== String(ordinal).padStart(6, "0")) fail("unit_order_invalid");
    const unitDirectory = path.join(unitsDirectory, name);
    noLinks(unitsDirectory, unitDirectory);
    let receipt;
    try { receipt = JSON.parse(readFileSync(path.join(unitDirectory, "receipt.json"), "utf8")); } catch { fail("unit_invalid"); }
    const previous = ordinal === 0 ? "0".repeat(64) : receipts[ordinal - 1].unit_chain_sha256;
    if (receipt.schema_version !== 1 || receipt.producer !== "v12-calendar-artifact-transport-unit/v1"
      || receipt.run_id !== runId || receipt.binding_sha256 !== bindingSha256 || receipt.ordinal !== ordinal
      || !["stage", "requirement"].includes(receipt.kind) || typeof receipt.key !== "string" || receipt.key.length < 1
      || receipt.previous_chain_sha256 !== previous || !Array.isArray(receipt.artifacts) || receipt.artifacts.length !== 2
      || receipt.unit_chain_sha256 !== sha256(JSON.stringify(unitChainBody(receipt)))) fail("unit_invalid");
    for (const [artifactOrdinal, artifact] of receipt.artifacts.entries()) {
      const canonical = canonicalV12CalendarArtifactDescriptor(artifact);
      if (artifact.transport_ordinal !== ordinal || artifact.transport_artifact_ordinal !== artifactOrdinal
        || artifact.transport_chain_sha256 !== receipt.unit_chain_sha256) fail("unit_invalid");
      const file = path.join(unitDirectory, `artifact-${String(artifactOrdinal).padStart(3, "0")}.bin`);
      noLinks(unitDirectory, file);
      const bytes = readFileSync(file);
      if (bytes.length !== canonical.size_bytes || sha256(bytes) !== canonical.sha256) fail("artifact_invalid");
    }
    receipts.push(receipt);
  }

  const expectedArtifacts = () => receipts.flatMap(({ artifacts }) => artifacts);
  function validateResult(result, resultBytes, code, requireCanonical = false) {
    const artifacts = expectedArtifacts();
    if (resultBytes.length > MAX_RESULT_BYTES || !Array.isArray(result?.artifacts)
      || JSON.stringify(result.artifacts) !== JSON.stringify(artifacts)
      || resultBytes.includes(Buffer.from("bytes_base64"))
      || (requireCanonical && !resultBytes.equals(jsonBytes(result)))) fail(code);
    return result;
  }

  const api = {
    binding: validatedBinding,
    resumeUnit({ ordinal, kind, key }) {
      const receipt = receipts[ordinal];
      if (receipt === undefined) return undefined;
      if (receipt.kind !== kind || receipt.key !== key) fail("resume_mismatch");
      return freezeUnit(receipt);
    },
    appendUnit({ kind, key, payload, artifacts }) {
      if (existsSync(path.join(directory, "manifest.json"))) fail("completed");
      const ordinal = receipts.length;
      if (!["stage", "requirement"].includes(kind) || typeof key !== "string" || key.length < 1
        || payload === null || typeof payload !== "object" || Array.isArray(payload)
        || !Array.isArray(artifacts) || artifacts.length !== 2) fail("unit_invalid");
      const pending = path.join(directory, `.pending-${process.pid}-${Date.now()}-${ordinal}`);
      mkdirSync(pending, { mode: 0o700 });
      const canonical = artifacts.map((artifact, artifactOrdinal) => {
        if (!Buffer.isBuffer(artifact.bytes) || artifact.bytes.length < 1) fail("artifact_invalid");
        const descriptor = canonicalV12CalendarArtifactDescriptor({ ...artifact, sha256: sha256(artifact.bytes), size_bytes: artifact.bytes.length });
        const file = path.join(pending, `artifact-${String(artifactOrdinal).padStart(3, "0")}.bin`);
        writeDurable(file, artifact.bytes);
        return descriptor;
      });
      const previous = ordinal === 0 ? "0".repeat(64) : receipts[ordinal - 1].unit_chain_sha256;
      const chainBody = { schema_version: 1, producer: "v12-calendar-artifact-transport-unit/v1", run_id: runId,
        binding_sha256: bindingSha256, ordinal, kind, key, previous_chain_sha256: previous, payload, artifacts: canonical };
      const unitChainSha256 = sha256(JSON.stringify(chainBody));
      const descriptors = canonical.map((descriptor, artifactOrdinal) => Object.freeze({ ...descriptor,
        transport_ordinal: ordinal, transport_artifact_ordinal: artifactOrdinal, transport_chain_sha256: unitChainSha256 }));
      const receipt = { ...chainBody, artifacts: descriptors, unit_chain_sha256: unitChainSha256 };
      writeDurable(path.join(pending, "receipt.json"), jsonBytes(receipt));
      syncDirectory(pending);
      const finalDirectory = path.join(unitsDirectory, String(ordinal).padStart(6, "0"));
      if (existsSync(finalDirectory)) fail("unit_exists");
      renameSync(pending, finalDirectory);
      syncDirectory(unitsDirectory);
      receipts.push(receipt);
      return freezeUnit(receipt);
    },
    readArtifact(descriptor) {
      const ordinal = descriptor?.transport_ordinal;
      const artifactOrdinal = descriptor?.transport_artifact_ordinal;
      const receipt = receipts[ordinal];
      if (!Number.isSafeInteger(ordinal) || !Number.isSafeInteger(artifactOrdinal) || artifactOrdinal < 0
        || receipt === undefined || receipt.unit_chain_sha256 !== descriptor.transport_chain_sha256
        || JSON.stringify(receipt.artifacts[artifactOrdinal]) !== JSON.stringify(descriptor)) fail("artifact_invalid");
      const file = path.join(unitsDirectory, String(ordinal).padStart(6, "0"), `artifact-${String(artifactOrdinal).padStart(3, "0")}.bin`);
      const bytes = readFileSync(file);
      if (bytes.length !== descriptor.size_bytes || sha256(bytes) !== descriptor.sha256) fail("artifact_invalid");
      return bytes;
    },
    complete(result) {
      const existing = api.loadCompleted();
      if (existing !== null) {
        if (JSON.stringify(existing) !== JSON.stringify(result)) fail("result_mismatch");
        return existing;
      }
      const requestedBytes = jsonBytes(result);
      validateResult(result, requestedBytes, "result_invalid", true);
      const resultFile = path.join(directory, "result.json");
      noLinks(directory, resultFile);
      let resultBytes = requestedBytes;
      if (existsSync(resultFile)) {
        let resumed;
        try {
          resultBytes = readFileSync(resultFile);
          resumed = JSON.parse(resultBytes);
        } catch { fail("result_invalid"); }
        validateResult(resumed, resultBytes, "result_invalid", true);
        if (JSON.stringify(resumed) !== JSON.stringify(result)) fail("result_mismatch");
      } else {
        writeDurable(resultFile, resultBytes);
        syncDirectory(directory);
      }
      const artifacts = expectedArtifacts();
      const manifest = Object.freeze({ schema_version: 1, producer: "v12-calendar-artifact-transport/v1", run_id: runId,
        binding_sha256: bindingSha256, unit_count: receipts.length, artifact_count: artifacts.length,
        final_chain_sha256: receipts.at(-1)?.unit_chain_sha256 ?? "0".repeat(64), result_sha256: sha256(resultBytes) });
      writeDurable(path.join(directory, "manifest.json"), jsonBytes(manifest));
      syncDirectory(directory);
      return result;
    },
    loadCompleted() {
      const manifestFile = path.join(directory, "manifest.json");
      if (!existsSync(manifestFile)) return null;
      noLinks(directory, manifestFile);
      const resultFile = path.join(directory, "result.json");
      noLinks(directory, resultFile);
      let manifest; let result; let resultBytes;
      try {
        manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
        resultBytes = readFileSync(resultFile);
        result = JSON.parse(resultBytes);
      } catch { fail("manifest_invalid"); }
      if (!exact(manifest, ["schema_version", "producer", "run_id", "binding_sha256", "unit_count", "artifact_count", "final_chain_sha256", "result_sha256"])
        || manifest.schema_version !== 1 || manifest.producer !== "v12-calendar-artifact-transport/v1" || manifest.run_id !== runId
        || manifest.binding_sha256 !== bindingSha256 || manifest.unit_count !== receipts.length
        || manifest.artifact_count !== receipts.length * 2 || manifest.final_chain_sha256 !== (receipts.at(-1)?.unit_chain_sha256 ?? "0".repeat(64))
        || manifest.result_sha256 !== sha256(resultBytes)) fail("manifest_invalid");
      validateResult(result, resultBytes, "manifest_invalid");
      return result;
    },
    cleanup() {
      rmSync(directory, { recursive: true, force: true });
      syncDirectory(run);
    },
  };
  return Object.freeze(api);
}

export function createV12CalendarArtifactTransport({ root = process.cwd(), runId, binding } = {}) {
  return createTransport({ root, runId, binding, create: true });
}

export function openV12CalendarArtifactTransport({ root = process.cwd(), runId } = {}) {
  const run = runRoot(root, runId);
  let binding;
  try { binding = JSON.parse(readFileSync(path.join(run, TRANSPORT_DIRECTORY, "binding.json"), "utf8")); }
  catch { fail("missing"); }
  return createTransport({ root, runId, binding, create: false });
}

export function hasV12CalendarArtifactTransport({ root = process.cwd(), runId } = {}) {
  return existsSync(path.join(runRoot(root, runId), TRANSPORT_DIRECTORY, "binding.json"));
}
