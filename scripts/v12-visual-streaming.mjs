import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  closeSync,
  existsSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  opendirSync,
  readFileSync,
  readSync,
  renameSync,
  rmSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import path from "node:path";

import { assertV12ArtifactPrivacySafe, assertV12PrivacySafeValue } from "./v12-artifact-privacy.mjs";
import { validateV12ExecutionOrigin } from "./v12-atomic-shard-publication.mjs";

const RUN_ID = /^phase20-\d{8}T\d{6}Z-[a-f0-9]{12}$/u;
const SAFE_SHARD = /^[a-z0-9][a-z0-9._-]*$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const ENTRY = /^\d{8}\.json$/u;
const READ_CHUNK_BYTES = 64 * 1024;
const MAX_HEADER_BYTES = 1024 * 1024;
const MAX_ARRAY_ITEM_BYTES = 16 * 1024 * 1024;
export const V12_VISUAL_BATCH_WINDOW = 4;

const digest = (value) => createHash("sha256").update(value).digest("hex");
const fail = (code) => { throw new Error(`v12_visual_stream_${code}`); };
const blackBoxFastPath = () => process.env.NODE_ENV === "test" && process.env.V12_PHASE20_BLACKBOX === "1"
  && process.env.V12_NATIVE_ADAPTER_TEST_PROCESS === "1";

function isDirectory(value) {
  const stat = lstatSync(value, { throwIfNoEntry: false });
  return stat !== undefined && !stat.isSymbolicLink() && stat.isDirectory();
}

function assertDirectory(value) {
  const stat = lstatSync(value, { throwIfNoEntry: false });
  if (stat === undefined || stat.isSymbolicLink() || !stat.isDirectory()) fail("path_invalid");
}

function assertInside(base, target, { required = false } = {}) {
  const resolvedBase = path.resolve(base);
  const resolved = path.resolve(target);
  if (!(resolved === resolvedBase || resolved.startsWith(`${resolvedBase}${path.sep}`))) fail("path_invalid");
  assertDirectory(resolvedBase);
  let cursor = resolvedBase;
  for (const part of path.relative(resolvedBase, resolved).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, part);
    const stat = lstatSync(cursor, { throwIfNoEntry: false });
    if (stat === undefined) {
      if (required) fail("path_invalid");
      return;
    }
    if (stat.isSymbolicLink()) fail("path_invalid");
    if (cursor !== resolved && !stat.isDirectory()) fail("path_invalid");
  }
}

function relativeArtifact(value) {
  if (typeof value !== "string" || value.length === 0 || path.isAbsolute(value) || value.includes("\\")
    || path.posix.normalize(value) !== value || value.split("/").some((part) => !part || part === "." || part === "..")) fail("path_invalid");
  return value;
}

function runRootFor(root, runId) {
  if (!RUN_ID.test(runId ?? "")) fail("arguments_invalid");
  const workspace = path.resolve(root);
  const runRoot = path.join(workspace, "artifacts/native/v1.2", runId);
  assertInside(workspace, runRoot, { required: true });
  assertDirectory(runRoot);
  return runRoot;
}

function syncFile(file) {
  if (blackBoxFastPath()) return;
  const descriptor = openSync(file, "r");
  try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
}

function syncDirectory(directory) {
  if (blackBoxFastPath()) return;
  const descriptor = openSync(directory, "r");
  try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
}

function ensureDirectory(base, directory) {
  assertInside(base, path.dirname(directory), { required: true });
  try { mkdirSync(directory, { mode: 0o700 }); }
  catch (error) { if (error?.code !== "EEXIST") throw error; }
  assertInside(base, directory, { required: true });
  assertDirectory(directory);
  syncDirectory(path.dirname(directory));
  return directory;
}

function ensureParents(base, target) {
  const relativeParent = path.relative(base, path.dirname(target));
  let cursor = base;
  for (const part of relativeParent.split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, part);
    ensureDirectory(base, cursor);
  }
}

function removeTree(directory) {
  const stat = lstatSync(directory, { throwIfNoEntry: false });
  if (stat === undefined) return;
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail("path_invalid");
  rmSync(directory, { recursive: true, force: false });
}

/** Inspect a leaf stat without bypassing its caller's ancestor checks. */
export function assertV12StreamingLeafStat(stat) {
  if (stat?.isSymbolicLink()) fail("path_invalid");
  return stat;
}

function removeStagedArtifact(stage, artifact, { recursive = false } = {}) {
  const safe = relativeArtifact(artifact);
  const target = path.join(stage, safe);
  assertInside(stage, target);
  const stat = lstatSync(target, { throwIfNoEntry: false });
  if (stat === undefined) return;
  assertV12StreamingLeafStat(stat);
  if (recursive) {
    if (!stat.isDirectory()) fail("path_invalid");
    removeTree(target);
  } else {
    if (!stat.isFile()) fail("path_invalid");
    unlinkSync(target);
  }
}

function removeEmpty(directory) {
  try { rmdirSync(directory); syncDirectory(path.dirname(directory)); } catch (error) {
    if (!["ENOENT", "ENOTEMPTY"].includes(error?.code)) throw error;
  }
}

function fileSha256(file) {
  const hash = createHash("sha256");
  const descriptor = openSync(file, "r");
  const buffer = Buffer.allocUnsafe(READ_CHUNK_BYTES);
  try {
    let read;
    while ((read = readSync(descriptor, buffer, 0, buffer.length, null)) > 0) hash.update(buffer.subarray(0, read));
  } finally { closeSync(descriptor); }
  return hash.digest("hex");
}

function validMember(runRoot, stage, member) {
  if (!member || relativeArtifact(member.artifact) !== member.artifact || !SHA256.test(member.sha256 ?? "")
    || !Number.isSafeInteger(member.size_bytes) || member.size_bytes < 1) return false;
  let found = false;
  for (const base of [stage, runRoot]) {
    if (!isDirectory(base)) continue;
    const file = path.join(base, member.artifact);
    assertInside(base, file);
    const stat = lstatSync(file, { throwIfNoEntry: false });
    assertV12StreamingLeafStat(stat);
    if (stat === undefined) continue;
    if (!stat.isFile() || stat.size !== member.size_bytes || fileSha256(file) !== member.sha256) return false;
    found = true;
  }
  return found;
}

export function isV12StreamingProcessAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) { return error?.code === "EPERM"; }
}

export function readV12StreamingProcessBirthSha256(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return null;
  const result = spawnSync("/bin/ps", ["-o", "lstart=", "-p", String(pid)], {
    encoding: "utf8", timeout: 5_000, maxBuffer: 16 * 1024, stdio: ["ignore", "pipe", "ignore"],
  });
  const birth = result.status === 0 && !result.error && !result.signal ? result.stdout.trim().replaceAll(/\s+/gu, " ") : "";
  return birth.length === 0 ? null : digest(birth);
}

function claimOwnerAlive(owner) {
  if (!isV12StreamingProcessAlive(owner.pid)) return false;
  const observed = readV12StreamingProcessBirthSha256(owner.pid);
  return observed === null || observed === owner.process_birth_sha256;
}

function validateClaimOwner(value, runId, shard) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).length !== 6 || value.schema_version !== 2
    || value.run_id !== runId || value.shard !== shard
    || !Number.isSafeInteger(value.pid) || value.pid < 1
    || !SHA256.test(value.process_birth_sha256 ?? "")
    || typeof value.nonce !== "string" || !/^[a-f0-9]{32}$/u.test(value.nonce)) fail("claim_conflict");
  return value;
}

function acquireClaim(runRoot, runId, shard) {
  const claims = ensureDirectory(runRoot, path.join(runRoot, ".claims"));
  const claim = path.join(claims, `${shard}.json`);
  const nonce = randomBytes(16).toString("hex");
  const processBirth = readV12StreamingProcessBirthSha256(process.pid);
  if (processBirth === null) fail("claim_conflict");
  const owner = `${JSON.stringify({ schema_version: 2, run_id: runId, shard, pid: process.pid, process_birth_sha256: processBirth, nonce })}\n`;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      writeFileSync(claim, owner, { encoding: "utf8", flag: "wx", mode: 0o600 });
      syncFile(claim); syncDirectory(claims);
      return () => {
        if (readFileSync(claim, "utf8") !== owner) fail("claim_conflict");
        unlinkSync(claim); syncDirectory(claims); removeEmpty(claims);
      };
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      let current;
      try { current = validateClaimOwner(JSON.parse(readFileSync(claim, "utf8")), runId, shard); }
      catch { fail("claim_conflict"); }
      if (claimOwnerAlive(current)) fail("claim_conflict");
      const stale = path.join(claims, `${shard}.stale-${nonce}-${attempt}.json`);
      try { renameSync(claim, stale); } catch (renameError) { if (renameError?.code === "ENOENT") continue; throw renameError; }
      unlinkSync(stale); syncDirectory(claims);
    }
  }
  fail("claim_conflict");
}

function atomicJson(base, file, value) {
  assertInside(base, file);
  ensureParents(base, file);
  const temporary = `${file}.tmp-${process.pid}-${randomBytes(6).toString("hex")}`;
  const bytes = Buffer.from(`${JSON.stringify(value)}\n`);
  writeFileSync(temporary, bytes, { flag: "wx", mode: 0o600 });
  syncFile(temporary);
  renameSync(temporary, file);
  syncDirectory(path.dirname(file));
}

export function writeV12StreamingFile(base, file, writer) {
  assertInside(base, file);
  ensureParents(base, file);
  if (existsSync(file)) unlinkSync(file);
  const descriptor = openSync(file, "wx", 0o600);
  const hash = createHash("sha256");
  let size = 0;
  const write = (value) => {
    const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
    writeSync(descriptor, bytes);
    hash.update(bytes);
    size += bytes.length;
  };
  try { writer(write); fsyncSync(descriptor); }
  catch (error) { closeSync(descriptor); throw error; }
  closeSync(descriptor);
  return Object.freeze({ sha256: hash.digest("hex"), size_bytes: size });
}

function readPrefix(file, marker) {
  const descriptor = openSync(file, "r");
  const chunks = [];
  let size = 0;
  try {
    while (size < MAX_HEADER_BYTES) {
      const chunk = Buffer.allocUnsafe(Math.min(READ_CHUNK_BYTES, MAX_HEADER_BYTES - size));
      const read = readSync(descriptor, chunk, 0, chunk.length, null);
      if (read === 0) break;
      chunks.push(chunk.subarray(0, read)); size += read;
      const combined = Buffer.concat(chunks);
      const offset = combined.indexOf(marker);
      if (offset >= 0) return combined.subarray(0, offset);
    }
  } finally { closeSync(descriptor); }
  fail("json_invalid");
}

/** Capture a plain header value before exposing it to its caller. */
export function validateV12VisualJsonHeader(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail("json_invalid");
  let snapshot;
  try { snapshot = structuredClone(value); } catch { fail("json_invalid"); }
  return Object.freeze(snapshot);
}

export function readV12VisualJsonHeader({ file, firstArrayKey } = {}) {
  if (typeof file !== "string" || typeof firstArrayKey !== "string" || !/^[a-z_]+$/u.test(firstArrayKey)) fail("arguments_invalid");
  const marker = Buffer.from(`${JSON.stringify(firstArrayKey)}:[`);
  let value;
  try {
    const prefix = readPrefix(file, marker).toString("utf8");
    value = JSON.parse(`${prefix}${JSON.stringify(firstArrayKey)}:[]}`);
  } catch { fail("json_invalid"); }
  return validateV12VisualJsonHeader(value);
}

export function* iterateV12VisualJsonArray({ file, arrayKey, maxItemBytes = MAX_ARRAY_ITEM_BYTES } = {}) {
  if (typeof file !== "string" || typeof arrayKey !== "string" || !/^[a-z_]+$/u.test(arrayKey)
    || !Number.isSafeInteger(maxItemBytes) || maxItemBytes < 1) fail("arguments_invalid");
  const marker = Buffer.from(`${JSON.stringify(arrayKey)}:[`);
  const descriptor = openSync(file, "r");
  let carry = Buffer.alloc(0);
  let fileOffset = 0;
  let found = false;
  let started = false;
  let inString = false;
  let escaped = false;
  let depth = 0;
  let itemOffset = 0;
  let itemSize = 0;
  let pieces = [];
  try {
    while (true) {
      const chunk = Buffer.allocUnsafe(READ_CHUNK_BYTES);
      const read = readSync(descriptor, chunk, 0, chunk.length, null);
      if (read === 0) break;
      const input = chunk.subarray(0, read);
      const inputOffset = fileOffset;
      fileOffset += read;
      let data = input;
      let dataOffset = inputOffset;
      if (!found) {
        const combined = carry.length === 0 ? input : Buffer.concat([carry, input]);
        const combinedOffset = inputOffset - carry.length;
        const markerOffset = combined.indexOf(marker);
        if (markerOffset < 0) {
          const retained = Math.min(marker.length - 1, combined.length);
          carry = Buffer.from(combined.subarray(combined.length - retained));
          continue;
        }
        found = true;
        const after = markerOffset + marker.length;
        data = combined.subarray(after);
        dataOffset = combinedOffset + after;
        carry = Buffer.alloc(0);
      }

      let pieceStart = started ? 0 : -1;
      for (let index = 0; index < data.length; index += 1) {
        const byte = data[index];
        if (!started) {
          if ([0x20, 0x09, 0x0a, 0x0d, 0x2c].includes(byte)) continue;
          if (byte === 0x5d) return;
          if (byte !== 0x7b) fail("json_invalid");
          started = true; inString = false; escaped = false; depth = 1;
          itemOffset = dataOffset + index; itemSize = 0; pieces = []; pieceStart = index;
          continue;
        }
        if (inString) {
          if (escaped) escaped = false;
          else if (byte === 0x5c) escaped = true;
          else if (byte === 0x22) inString = false;
        } else if (byte === 0x22) inString = true;
        else if (byte === 0x7b || byte === 0x5b) depth += 1;
        else if (byte === 0x7d || byte === 0x5d) depth -= 1;
        if (depth === 0) {
          const piece = data.subarray(pieceStart, index + 1);
          pieces.push(piece); itemSize += piece.length;
          if (itemSize > maxItemBytes) fail("json_item_too_large");
          const bytes = pieces.length === 1 ? Buffer.from(pieces[0]) : Buffer.concat(pieces, itemSize);
          let value; try { value = JSON.parse(bytes); } catch { fail("json_invalid"); }
          yield Object.freeze({ value, offset: itemOffset, size: itemSize });
          started = false; pieces = []; itemSize = 0; pieceStart = -1;
        }
      }
      if (started) {
        const piece = data.subarray(pieceStart);
        pieces.push(Buffer.from(piece)); itemSize += piece.length;
        if (itemSize > maxItemBytes) fail("json_item_too_large");
      }
    }
  } finally { closeSync(descriptor); }
  if (!found || started) fail("json_invalid");
  fail("json_invalid");
}

function journalPaths(runRoot, shard) {
  const streamRoot = path.join(runRoot, ".visual-stream");
  const journal = path.join(streamRoot, shard);
  return { streamRoot, journal, batches: path.join(journal, "batches"), nonces: path.join(journal, "nonces") };
}

function journalDefinition({ runId, shard, batchWindow, totalCount, indexRelative, indexHeader, resultKey, uniqueKey }) {
  return Object.freeze({
    schema_version: 1,
    producer: "v12-visual-stream-journal/v1",
    run_id: runId,
    shard,
    batch_window: batchWindow,
    total_count: totalCount,
    index_relative: indexRelative,
    index_header_sha256: digest(JSON.stringify(indexHeader)),
    result_key: resultKey,
    unique_key: typeof uniqueKey === "function",
  });
}

function initializeJournal(runRoot, paths, definition) {
  ensureDirectory(runRoot, paths.streamRoot);
  ensureDirectory(runRoot, paths.journal);
  ensureDirectory(runRoot, paths.batches);
  const definitionFile = path.join(paths.journal, "journal.json");
  if (!existsSync(definitionFile)) atomicJson(runRoot, definitionFile, definition);
  let retained;
  try { retained = JSON.parse(readFileSync(definitionFile, "utf8")); } catch { fail("journal_invalid"); }
  if (JSON.stringify(retained) !== JSON.stringify(definition)) fail("journal_invalid");
}

function createUniqueMarker(paths, key) {
  if (typeof key !== "string" || !/^[a-f0-9]{32,64}$/u.test(key)) fail("unique_key_invalid");
  const bucket = path.join(paths.nonces, key.slice(0, 2));
  ensureDirectory(paths.journal, paths.nonces);
  ensureDirectory(paths.journal, bucket);
  try { writeFileSync(path.join(bucket, key), "", { flag: "wx", mode: 0o600 }); }
  catch (error) { if (error?.code === "EEXIST") fail("duplicate_invalid"); throw error; }
}

function batchPayload(entry) {
  const { entry_sha256: _discarded, ...payload } = entry;
  return payload;
}

function readBatch(file) {
  let entry;
  try { entry = JSON.parse(readFileSync(file, "utf8")); } catch { fail("journal_invalid"); }
  if (!entry || entry.schema_version !== 1 || digest(JSON.stringify(batchPayload(entry))) !== entry.entry_sha256) fail("journal_invalid");
  return entry;
}

function cleanJournalNames(paths, batchCount) {
  for (const directory of [paths.journal, paths.batches]) {
    const handle = opendirSync(directory);
    try {
      let entry;
      while ((entry = handle.readSync()) !== null) {
        if (entry.isSymbolicLink()) fail("journal_invalid");
        if (entry.name.includes(".tmp-")) { rmSync(path.join(directory, entry.name), { force: true }); continue; }
        if (directory === paths.journal && ["journal.json", "batches", "nonces"].includes(entry.name)) continue;
        if (directory === paths.batches && ENTRY.test(entry.name) && Number(entry.name.slice(0, 8)) < batchCount) continue;
        fail("journal_invalid");
      }
    } finally { handle.closeSync(); }
  }
}

function scanJournal({ runRoot, paths, definition, validateBatch, uniqueKey }) {
  if (existsSync(paths.nonces)) removeTree(paths.nonces);
  let ordinal = 0;
  let offset = 0;
  let previousSha256 = "0".repeat(64);
  let lastExecutionOrigin;
  while (true) {
    const file = path.join(paths.batches, `${String(ordinal).padStart(8, "0")}.json`);
    if (!existsSync(file)) break;
    const entry = readBatch(file);
    if (entry.run_id !== definition.run_id || entry.shard !== definition.shard || entry.ordinal !== ordinal || entry.offset !== offset
      || entry.previous_sha256 !== previousSha256 || !Array.isArray(entry.records) || entry.records.length !== entry.count
      || entry.count < 1 || entry.count > definition.batch_window || !Array.isArray(entry.members)) fail("journal_invalid");
    if (validateBatch(entry, offset) !== true) fail("journal_invalid");
    for (const member of entry.members) if (!validMember(runRoot, path.join(runRoot, ".staging", definition.shard), member)) fail("journal_member_invalid");
    if (typeof uniqueKey === "function") for (const record of entry.records) createUniqueMarker(paths, uniqueKey(record));
    previousSha256 = entry.entry_sha256;
    lastExecutionOrigin = entry.execution_origin;
    offset += entry.count; ordinal += 1;
  }
  cleanJournalNames(paths, ordinal);
  return { batchCount: ordinal, itemCount: offset, lastSha256: previousSha256, lastExecutionOrigin };
}

function appendBatch({ runRoot, paths, definition, state, records, window, members, executionOrigin, uniqueKey }) {
  if (!Array.isArray(records) || records.length < 1 || records.length > definition.batch_window
    || window?.ordinal !== state.batchCount || window.offset !== state.itemCount || window.count !== records.length) fail("batch_invalid");
  for (const value of [window, ...records, ...members]) assertV12PrivacySafeValue(value);
  if (typeof uniqueKey === "function") for (const record of records) createUniqueMarker(paths, uniqueKey(record));
  const resolvedExecutionOrigin = executionOrigin === undefined ? undefined : validateV12ExecutionOrigin(executionOrigin);
  const payload = {
    schema_version: 1,
    run_id: definition.run_id,
    shard: definition.shard,
    ordinal: state.batchCount,
    offset: state.itemCount,
    count: records.length,
    previous_sha256: state.lastSha256,
    window,
    records,
    members,
    ...(resolvedExecutionOrigin === undefined ? {} : { execution_origin: resolvedExecutionOrigin }),
  };
  const entry = Object.freeze({ ...payload, entry_sha256: digest(JSON.stringify(payload)) });
  const file = path.join(paths.batches, `${String(state.batchCount).padStart(8, "0")}.json`);
  atomicJson(runRoot, file, entry);
  return { batchCount: state.batchCount + 1, itemCount: state.itemCount + records.length, lastSha256: entry.entry_sha256, lastExecutionOrigin: resolvedExecutionOrigin };
}

function* journalEntries(paths) {
  let ordinal = 0;
  let file = path.join(paths.batches, `${String(ordinal).padStart(8, "0")}.json`);
  while (existsSync(file)) {
    yield readBatch(file);
    ordinal += 1;
    file = path.join(paths.batches, `${String(ordinal).padStart(8, "0")}.json`);
  }
}

function writeIndex({ runRoot, stage, paths, definition, indexHeader }) {
  const file = path.join(stage, definition.index_relative);
  const descriptor = writeV12StreamingFile(stage, file, (write) => {
    const fields = Object.entries(indexHeader).map(([key, value]) => `${JSON.stringify(key)}:${JSON.stringify(value)}`);
    write(`{${fields.join(",")},"windows":[\n`);
    let first = true;
    for (const entry of journalEntries(paths)) {
      if (!first) write(",\n");
      write(JSON.stringify(entry.window)); first = false;
    }
    write(`\n],"${definition.result_key}":[\n`);
    first = true;
    for (const entry of journalEntries(paths)) {
      for (const record of entry.records) {
        if (!first) write(",\n");
        write(JSON.stringify(record)); first = false;
      }
    }
    write("\n]}\n");
  });
  return Object.freeze({ artifact: definition.index_relative, ...descriptor });
}

function publicationIdentity(runRoot) {
  const file = path.join(runRoot, "build.json");
  if (!existsSync(file)) return null;
  let build; try { build = JSON.parse(readFileSync(file, "utf8")); } catch { fail("build_identity_invalid"); }
  const identity = {
    evidence_origin: build?.evidence_origin ?? "native",
    source_tree_sha256: build?.source?.tree_sha256,
    apk_sha256: build?.build?.apk?.sha256,
    installed_apk_sha256: build?.device?.installed_apk_sha256,
    device_identity_sha256: build?.device?.identity_sha256,
    fixture_sha256: build?.fixtures?.registry_sha256,
    configuration_id: build?.configuration?.id,
  };
  if (identity.apk_sha256 !== identity.installed_apk_sha256 || !["native", "test"].includes(identity.evidence_origin)
    || Object.entries(identity).some(([key, value]) => ["configuration_id", "evidence_origin"].includes(key)
      ? typeof value !== "string" || value.length === 0 : !SHA256.test(value ?? ""))) fail("build_identity_invalid");
  return identity;
}

function writeManifest({ runRoot, stage, paths, definition, indexMember, executionOrigin }) {
  const file = path.join(stage, "manifest.json");
  const pending = path.join(stage, "manifest.pending");
  if (existsSync(pending)) unlinkSync(pending);
  const identity = publicationIdentity(runRoot);
  writeV12StreamingFile(stage, pending, (write) => {
    write(`${JSON.stringify({ schema_version: 1, producer: "v12-atomic-shard-publication/v1", run_id: definition.run_id, shard: definition.shard, identity }).slice(0, -1)}`);
    if (executionOrigin !== undefined) write(`,"execution_origin":${JSON.stringify(executionOrigin)}`);
    write(',"completed":true');
    write("," + JSON.stringify("members") + ":[\n");
    let first = true;
    for (const entry of journalEntries(paths)) {
      for (const member of entry.members) {
        if (!first) write(",\n");
        write(JSON.stringify(member)); first = false;
      }
    }
    if (!first) write(",\n");
    write(`${JSON.stringify(indexMember)}\n]}\n`);
  });
  renameSync(pending, file); syncDirectory(stage);
  return file;
}

function countStageFiles(stage) {
  let count = 0;
  const directories = [stage];
  while (directories.length > 0) {
    const directory = directories.pop();
    const handle = opendirSync(directory);
    try {
      let entry;
      while ((entry = handle.readSync()) !== null) {
        if (entry.isSymbolicLink()) fail("path_invalid");
        if (entry.isDirectory()) directories.push(path.join(directory, entry.name));
        else if (entry.isFile()) count += 1;
        else fail("path_invalid");
      }
    } finally { handle.closeSync(); }
  }
  return count;
}

function publicationHeader(file, runId, shard) {
  const header = readV12VisualJsonHeader({ file, firstArrayKey: "members" });
  if (header.schema_version !== 1 || header.producer !== "v12-atomic-shard-publication/v1" || header.run_id !== runId
    || header.shard !== shard) fail("manifest_invalid");
  if (header.completed !== true) {
    const size = lstatSync(file).size;
    const descriptor = openSync(file, "r");
    const tail = Buffer.alloc(Math.min(128, size));
    try { readSync(descriptor, tail, 0, tail.length, size - tail.length); } finally { closeSync(descriptor); }
    if (!tail.toString("utf8").trimEnd().endsWith('],"completed":true}')) fail("manifest_invalid");
  }
  if (header.execution_origin !== undefined) validateV12ExecutionOrigin(header.execution_origin);
  return header;
}

/** Validate a publication count without granting publication authority. */
export function validateV12StreamingPublicationMemberCount(count) {
  if (!Number.isSafeInteger(count) || count < 1) fail("manifest_invalid");
  return count;
}

function verifyPublication({ runRoot, stage, runId, shard, manifestFile }) {
  publicationHeader(manifestFile, runId, shard);
  let count = 0;
  let stagedMemberCount = 0;
  for (const { value: member } of iterateV12VisualJsonArray({ file: manifestFile, arrayKey: "members" })) {
    if (!validMember(runRoot, stage, member)) fail("manifest_member_invalid");
    const staged = path.join(stage, member.artifact);
    if (lstatSync(staged, { throwIfNoEntry: false })?.isFile()) stagedMemberCount += 1;
    count += 1;
  }
  validateV12StreamingPublicationMemberCount(count);
  if (isDirectory(stage)) {
    const stagedManifestCount = path.resolve(manifestFile) === path.resolve(stage, "manifest.json") ? 1 : 0;
    if (countStageFiles(stage) !== stagedMemberCount + stagedManifestCount) fail("stage_member_invalid");
  }
  return count;
}

function acceptPublishedStageManifest(stage, finalManifest) {
  if (!isDirectory(stage)) return;
  const stagedManifest = path.join(stage, "manifest.json");
  const stat = lstatSync(stagedManifest, { throwIfNoEntry: false });
  if (stat === undefined) return;
  if (stat.isSymbolicLink() || !stat.isFile()) fail("manifest_mismatch");
  const finalStat = lstatSync(finalManifest, { throwIfNoEntry: false });
  if (finalStat === undefined || finalStat.isSymbolicLink() || !finalStat.isFile()
    || stat.size !== finalStat.size || fileSha256(stagedManifest) !== fileSha256(finalManifest)) fail("manifest_mismatch");
  unlinkSync(stagedManifest); syncDirectory(stage);
}

function validateCompletedInventory({ runRoot, stage, manifestFile, indexRelative, indexHeader,
  resultKey, totalCount, batchWindow, validateBatch, validateComplete, uniqueKey }) {
  let indexMember;
  for (const { value } of iterateV12VisualJsonArray({ file: manifestFile, arrayKey: "members" })) indexMember = value;
  if (indexMember?.artifact !== indexRelative) fail("inventory_invalid");
  if (!validMember(runRoot, stage, indexMember)) fail("manifest_member_invalid");
  const stagedIndex = path.join(stage, indexRelative);
  const file = existsSync(stagedIndex) ? stagedIndex : path.join(runRoot, indexRelative);
  const { windows: _windows, ...retainedHeader } = readV12VisualJsonHeader({ file, firstArrayKey: "windows" });
  if (JSON.stringify(retainedHeader) !== JSON.stringify(indexHeader)) fail("inventory_invalid");
  const records = iterateV12VisualJsonArray({ file, arrayKey: resultKey });
  const keys = new Set();
  let offset = 0; let ordinal = 0;
  try {
    for (const { value: window } of iterateV12VisualJsonArray({ file, arrayKey: "windows" })) {
      const count = Math.min(batchWindow, totalCount - offset);
      if (count < 1 || window?.ordinal !== ordinal || window.offset !== offset || window.count !== count) fail("inventory_invalid");
      const batch = [];
      for (let index = 0; index < count; index += 1) {
        const entry = records.next();
        if (entry.done) fail("inventory_invalid");
        batch.push(entry.value.value);
        if (typeof uniqueKey === "function") {
          const key = uniqueKey(entry.value.value);
          if (typeof key !== "string" || !/^[a-f0-9]{32,64}$/u.test(key)) fail("unique_key_invalid");
          if (keys.has(key)) fail("duplicate_invalid");
          keys.add(key);
        }
      }
      if (validateBatch({ records: batch, window, count, ordinal, offset }, offset) !== true) fail("inventory_invalid");
      offset += count; ordinal += 1;
    }
    if (offset !== totalCount || !records.next().done
      || validateComplete({ itemCount: offset, batchCount: ordinal }) !== true) fail("inventory_invalid");
  } finally { records.return(); }
}

function publishMember(runRoot, stage, member) {
  const source = path.join(stage, member.artifact);
  const target = path.join(runRoot, member.artifact);
  assertInside(stage, source); assertInside(runRoot, target);
  if (existsSync(target)) {
    if (!validMember(runRoot, stage, member)) fail("output_conflict");
    if (existsSync(source)) unlinkSync(source);
    return;
  }
  if (!existsSync(source)) fail("output_conflict");
  ensureParents(runRoot, target);
  try { linkSync(source, target); }
  catch (error) {
    if (!(error?.code === "EEXIST" && validMember(runRoot, stage, member))) fail("output_conflict");
  }
  syncDirectory(path.dirname(target));
  if (existsSync(source)) unlinkSync(source);
}

function completePublication({ runRoot, stage, paths, runId, shard, manifestFile }) {
  const memberCount = verifyPublication({ runRoot, stage, runId, shard, manifestFile });
  for (const { value: member } of iterateV12VisualJsonArray({ file: manifestFile, arrayKey: "members" })) publishMember(runRoot, stage, member);
  const publication = ensureDirectory(runRoot, path.join(runRoot, "publication"));
  const finalManifest = path.join(publication, `${shard}.json`);
  const manifestMember = { artifact: `publication/${shard}.json`, sha256: fileSha256(manifestFile), size_bytes: lstatSync(manifestFile).size };
  if (existsSync(finalManifest)) {
    if (!validMember(runRoot, stage, manifestMember)) fail("output_conflict");
    unlinkSync(manifestFile);
  } else {
    linkSync(manifestFile, finalManifest); syncDirectory(publication); unlinkSync(manifestFile);
  }
  removeTree(stage); removeEmpty(path.dirname(stage));
  removeTree(paths.journal); removeEmpty(paths.streamRoot);
  return Object.freeze({ manifest_path: path.relative(path.dirname(path.dirname(path.dirname(path.dirname(runRoot)))), finalManifest), member_count: memberCount });
}

function writeFailure(runRoot, runId, shard, error) {
  const failures = ensureDirectory(runRoot, path.join(runRoot, "failures"));
  const file = path.join(failures, `${shard}.json`);
  if (existsSync(file)) return;
  const message = error instanceof Error ? error.message : String(error ?? "unknown");
  const value = { schema_version: 2, producer: "v12-atomic-shard-failure/v3", run_id: runId, shard, stage: "publication",
    failure_code: "producer_failed", failure_digest: digest(message), privacy: "safe", retry_allowed: false };
  const bytes = Buffer.from(`${JSON.stringify(value)}\n`); assertV12ArtifactPrivacySafe(`failures/${shard}.json`, bytes);
  writeFileSync(file, bytes, { flag: "wx", mode: 0o600 }); syncFile(file); syncDirectory(failures);
}

export function inspectV12VisualJournal({ root = process.cwd(), runId, shard } = {}) {
  const runRoot = runRootFor(root, runId);
  const paths = journalPaths(runRoot, shard);
  let batchCount = 0; let itemCount = 0; let lastSha256 = "0".repeat(64);
  while (existsSync(path.join(paths.batches, `${String(batchCount).padStart(8, "0")}.json`))) {
    const entry = readBatch(path.join(paths.batches, `${String(batchCount).padStart(8, "0")}.json`));
    if (entry.ordinal !== batchCount || entry.offset !== itemCount || entry.previous_sha256 !== lastSha256) fail("journal_invalid");
    itemCount += entry.count; lastSha256 = entry.entry_sha256; batchCount += 1;
  }
  return Object.freeze({ batch_count: batchCount, item_count: itemCount, last_sha256: lastSha256 });
}

export function executeV12VisualStreamingShard({
  root = process.cwd(),
  runId,
  shard,
  totalCount,
  batchWindow = V12_VISUAL_BATCH_WINDOW,
  indexRelative,
  indexHeader,
  resultKey,
  expectedWindow,
  processWindow,
  validateBatch,
  validateComplete = () => true,
  cleanupPending = () => {},
  uniqueKey,
  onWindowCommitted,
} = {}) {
  if (!SAFE_SHARD.test(shard ?? "") || !Number.isSafeInteger(totalCount) || totalCount < 1
    || !Number.isSafeInteger(batchWindow) || batchWindow < 1 || batchWindow > 512 || typeof expectedWindow !== "function"
    || typeof processWindow !== "function" || typeof validateBatch !== "function"
    || typeof validateComplete !== "function"
    || indexHeader === null || typeof indexHeader !== "object" || Array.isArray(indexHeader) || !["records", "results"].includes(resultKey)) fail("arguments_invalid");
  relativeArtifact(indexRelative);
  const runRoot = runRootFor(root, runId);
  assertInside(runRoot, path.join(runRoot, indexRelative));
  const release = acquireClaim(runRoot, runId, shard);
  const paths = journalPaths(runRoot, shard);
  const staging = path.join(runRoot, ".staging");
  const stage = path.join(staging, shard);
  const finalManifest = path.join(runRoot, "publication", `${shard}.json`);
  const executeAttempt = () => {
    if (existsSync(finalManifest)) {
      const memberCount = verifyPublication({ runRoot, stage, runId, shard, manifestFile: finalManifest });
      validateCompletedInventory({ runRoot, stage, manifestFile: finalManifest, indexRelative, indexHeader,
        resultKey, totalCount, batchWindow, validateBatch, validateComplete, uniqueKey });
      acceptPublishedStageManifest(stage, finalManifest);
      if (existsSync(stage)) removeTree(stage); removeEmpty(staging);
      if (existsSync(paths.journal)) removeTree(paths.journal); removeEmpty(paths.streamRoot);
      return Object.freeze({ ...indexHeader, [resultKey === "records" ? "capture_count" : "comparison_count"]: totalCount,
        batch_count: Math.ceil(totalCount / batchWindow), member_count: memberCount, resumed: true });
    }
    if (existsSync(path.join(runRoot, "failures", `${shard}.json`))) fail("attempt_consumed");
    ensureDirectory(runRoot, staging);
    ensureDirectory(runRoot, stage);
    const stagedManifest = path.join(stage, "manifest.json");
    if (existsSync(stagedManifest)) {
      verifyPublication({ runRoot, stage, runId, shard, manifestFile: stagedManifest });
      validateCompletedInventory({ runRoot, stage, manifestFile: stagedManifest, indexRelative, indexHeader,
        resultKey, totalCount, batchWindow, validateBatch, validateComplete, uniqueKey });
      const completed = completePublication({ runRoot, stage, paths, runId, shard, manifestFile: stagedManifest });
      return Object.freeze({ ...indexHeader, [resultKey === "records" ? "capture_count" : "comparison_count"]: totalCount,
        batch_count: Math.ceil(totalCount / batchWindow), member_count: completed.member_count, resumed: true });
    }
    const definition = journalDefinition({ runId, shard, batchWindow, totalCount, indexRelative, indexHeader, resultKey, uniqueKey });
    initializeJournal(runRoot, paths, definition);
    let state = scanJournal({ runRoot, paths, definition, validateBatch, uniqueKey });
    const resumedItemCount = state.itemCount;
    while (state.itemCount < totalCount) {
      const expectedCount = Math.min(batchWindow, totalCount - state.itemCount);
      const items = expectedWindow(state.itemCount, expectedCount);
      if (!Array.isArray(items) || items.length !== expectedCount) fail("inventory_invalid");
      cleanupPending(Object.freeze({ items, offset: state.itemCount, ordinal: state.batchCount,
        remove: (artifact, options) => removeStagedArtifact(stage, artifact, options) }));
      const members = [];
      const write = (artifact, value) => {
        const safe = relativeArtifact(artifact);
        const file = path.join(stage, safe);
        assertInside(stage, file);
        if (existsSync(file)) fail("second_write");
        ensureParents(stage, file);
        const bytes = Buffer.isBuffer(value) ? value : Buffer.from(typeof value === "string" ? value : `${JSON.stringify(value)}\n`);
        assertV12ArtifactPrivacySafe(safe, bytes);
        writeFileSync(file, bytes, { flag: "wx", mode: 0o600 }); syncFile(file);
        const member = Object.freeze({ artifact: safe, sha256: digest(bytes), size_bytes: bytes.length });
        members.push(member);
        return member;
      };
      const produced = processWindow(Object.freeze({ items, offset: state.itemCount, ordinal: state.batchCount, write }));
      if (!produced || !Array.isArray(produced.records) || produced.records.length !== items.length || !produced.window) fail("batch_invalid");
      state = appendBatch({ runRoot, paths, definition, state, records: produced.records, window: produced.window,
        members, executionOrigin: produced.execution_origin, uniqueKey });
      onWindowCommitted?.(Object.freeze({ ordinal: state.batchCount - 1, offset: state.itemCount - produced.records.length, count: produced.records.length, rss: process.memoryUsage().rss }));
    }
    if (state.itemCount !== totalCount || state.batchCount !== Math.ceil(totalCount / batchWindow)) fail("inventory_invalid");
    if (validateComplete(state) !== true) fail("inventory_invalid");
    const indexMember = writeIndex({ runRoot, stage, paths, definition, indexHeader });
    const completedManifest = writeManifest({ runRoot, stage, paths, definition, indexMember, executionOrigin: state.lastExecutionOrigin });
    const completed = completePublication({ runRoot, stage, paths, runId, shard, manifestFile: completedManifest });
    return Object.freeze({ ...indexHeader, [resultKey === "records" ? "capture_count" : "comparison_count"]: totalCount,
      batch_count: state.batchCount, member_count: completed.member_count, resumed: resumedItemCount > 0 });
  };
  let result;
  try { result = executeAttempt();
  } catch (error) {
    if (!existsSync(finalManifest) && !existsSync(path.join(stage, "manifest.json"))) {
      if (existsSync(stage)) removeTree(stage); removeEmpty(staging);
      if (existsSync(paths.journal)) removeTree(paths.journal); removeEmpty(paths.streamRoot);
      writeFailure(runRoot, runId, shard, error);
    }
    throw error;
  } finally { release(); }
  return result;
}
