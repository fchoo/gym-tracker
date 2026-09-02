#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  lstatSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import {
  loadPhase5Candidate,
  phase5CandidateIdentity,
  SHA256_PATTERN,
  validatePhase5CandidateIdentity,
} from "./phase5-candidate-evidence.mjs";
import { loadAndValidatePhase5AutomatedEvidenceSet } from "./verify-phase5-native-evidence.mjs";
import { validatePhase6AttendedRecordBytes } from "./generate-phase6-attended-checklist.mjs";

const PHASE2_VERIFICATION = ".planning/phases/02-owned-library-and-planning/02-VERIFICATION.md";
const PHASE3_VERIFICATION = ".planning/phases/03-calendar-and-history-integrity/03-VERIFICATION.md";
const PHASE4_VERIFICATION = ".planning/phases/04-overall-progress-and-complete-progression/04-VERIFICATION.md";
const PHASE5_VALIDATION = ".planning/phases/05-recovery-distribution-and-release/05-VALIDATION.md";
const RUN_ID_PATTERN = /^[1-9][0-9]*$/u;
const ARTIFACT_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/u;

export const PHASE5_ATTENDED_ROW_SPECS = Object.freeze([
  ["P5-AIRPLANE-WORKOUT", "attended-physical-phone"],
  ["P5-PROCESS-DEATH-RECOVERY", "attended-physical-phone"],
  ["P5-NOTIFICATION-STATES", "attended-physical-phone"],
  ["P5-CLEAN-RESTORE", "attended-physical-phone"],
  ["P5-ADAPTIVE-LAYOUT", "attended-emulator"],
  ["P5-TEXT-200", "attended-emulator"],
  ["P5-KEYBOARD-DPAD-FOCUS", "attended-emulator"],
  ["P5-REDUCED-MOTION-NON-COLOR", "attended-emulator"],
  ["P5-ASSISTIVE-TECH", "attended-assistive"],
  ["P5-MINIMUM-DEVICE-PERFORMANCE", "attended-physical-phone"],
  ["P5-POST-IMPLEMENTATION-DESIGN", "attended-design"],
  ["P5-PHYSICAL-ARGON2-CALIBRATION", "attended-physical-phone"],
].map(([id, evidenceClass]) => Object.freeze({ id, evidence_class: evidenceClass })));

export function serializeCanonicalJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function markdownRows(source, idPattern) {
  return source.split(/\r?\n/u)
    .filter((line) => /^\| /u.test(line))
    .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()))
    .filter(([id]) => idPattern.test(id));
}

function exactRows(label, actual, expected) {
  const ids = actual.map(({ row_id: id }) => id);
  if (new Set(ids).size !== ids.length) {
    throw new Error(`${label} contains duplicate rows.`);
  }
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} exact union/order is missing, extra, or stale.`);
  }
}

function exactKeys(value, keys, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || JSON.stringify(Object.keys(value)) !== JSON.stringify(keys)) {
    throw new Error(`${label} contains missing, reordered, or extra fields.`);
  }
}

function phase2EvidenceClass(id) {
  if (id === "G-02-02") return "attended-emulator";
  if (["G-02-06", "G-02-07"].includes(id)) return "attended-physical-phone";
  return "attended-emulator-and-physical-phone";
}

export function derivePhase5AttendedRows(root = process.cwd()) {
  const phase2 = markdownRows(readFileSync(path.join(root, PHASE2_VERIFICATION), "utf8"), /^G-02-\d{2}$/u)
    .map(([id, , , observation]) => ({
      row_id: `phase2:${id}`, phase: 2, source_id: id,
      evidence_class: phase2EvidenceClass(id), observation_contract: observation,
    }));
  const phase3 = markdownRows(readFileSync(path.join(root, PHASE3_VERIFICATION), "utf8"), /^HIST-\d{2}$/u)
    .map(([id, truth]) => ({
      row_id: `phase3:${id}`, phase: 3, source_id: id,
      evidence_class: "attended-emulator", observation_contract: truth,
    }));
  const phase4 = markdownRows(readFileSync(path.join(root, PHASE4_VERIFICATION), "utf8"), /^PROG-\d{2}$/u)
    .map(([id, , evidence]) => ({
      row_id: `phase4:${id}`, phase: 4, source_id: id,
      evidence_class: "attended-emulator", observation_contract: evidence,
    }));
  const phase5 = markdownRows(readFileSync(path.join(root, PHASE5_VALIDATION), "utf8"), /^P5-[A-Z0-9-]+$/u)
    .map(([id, evidenceClass, observation]) => ({
      row_id: `phase5:${id}`, phase: 5, source_id: id,
      evidence_class: evidenceClass, observation_contract: observation,
    }));
  const rows = [...phase2, ...phase3, ...phase4, ...phase5];
  validatePhase5AttendedRowDefinitions(rows, root);
  return rows;
}

export function validatePhase5AttendedRowDefinitions(rows, root = process.cwd()) {
  const expectedPhase2 = Array.from({ length: 9 }, (_, index) => `G-02-${String(index + 1).padStart(2, "0")}`);
  const expectedPhase3 = Array.from({ length: 9 }, (_, index) => `HIST-${String(index + 1).padStart(2, "0")}`);
  const expectedPhase4 = Array.from({ length: 11 }, (_, index) => `PROG-${String(index + 1).padStart(2, "0")}`);
  const expectedPhase5 = PHASE5_ATTENDED_ROW_SPECS.map(({ id }) => id);
  const expectedIds = [
    ...expectedPhase2.map((id) => `phase2:${id}`),
    ...expectedPhase3.map((id) => `phase3:${id}`),
    ...expectedPhase4.map((id) => `phase4:${id}`),
    ...expectedPhase5.map((id) => `phase5:${id}`),
  ];
  if (!Array.isArray(rows) || new Set(rows.map(({ row_id: id }) => id)).size !== rows.length) {
    throw new Error("attended row union contains duplicate or missing rows.");
  }
  if (JSON.stringify(rows.map(({ row_id: id }) => id)) !== JSON.stringify(expectedIds)) {
    throw new Error("attended row exact union/order is missing, extra, or stale.");
  }
  if (rows.some((row) => typeof row.observation_contract !== "string"
    || row.observation_contract.trim().length < 12
    || !/^attended-/u.test(row.evidence_class))) {
    throw new Error("attended row definition is malformed.");
  }
  if (root !== undefined) {
    const canonical = deriveRowsUnchecked(root);
    exactRows("attended row", rows, canonical);
  }
}

function deriveRowsUnchecked(root) {
  const read = (file) => readFileSync(path.join(root, file), "utf8");
  return [
    ...markdownRows(read(PHASE2_VERIFICATION), /^G-02-\d{2}$/u).map(([id, , , observation]) => ({
      row_id: `phase2:${id}`, phase: 2, source_id: id, evidence_class: phase2EvidenceClass(id), observation_contract: observation,
    })),
    ...markdownRows(read(PHASE3_VERIFICATION), /^HIST-\d{2}$/u).map(([id, truth]) => ({
      row_id: `phase3:${id}`, phase: 3, source_id: id, evidence_class: "attended-emulator", observation_contract: truth,
    })),
    ...markdownRows(read(PHASE4_VERIFICATION), /^PROG-\d{2}$/u).map(([id, , evidence]) => ({
      row_id: `phase4:${id}`, phase: 4, source_id: id, evidence_class: "attended-emulator", observation_contract: evidence,
    })),
    ...markdownRows(read(PHASE5_VALIDATION), /^P5-[A-Z0-9-]+$/u).map(([id, evidenceClass, observation]) => ({
      row_id: `phase5:${id}`, phase: 5, source_id: id, evidence_class: evidenceClass, observation_contract: observation,
    })),
  ];
}

function assertNoApprovalFields(value) {
  if (value === null || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (/approval|owner_token/iu.test(key)) {
      throw new Error("pending checklist cannot contain approval or owner token fields.");
    }
    assertNoApprovalFields(child);
  }
}

function validatePhase6AttendedEvidenceProvenance(value, candidate) {
  exactKeys(value, [
    "record_sha256", "evidence_run_id", "artifact_name", "candidate_id",
    "source_commit", "manifest_sha256", "apk_sha256", "status",
  ], "Phase 6 N4 provenance");
  const apks = candidate?.artifacts?.filter(({ kind }) => kind === "apk") ?? [];
  if (!SHA256_PATTERN.test(value.record_sha256 ?? "")
    || !RUN_ID_PATTERN.test(value.evidence_run_id ?? "")
    || !ARTIFACT_NAME_PATTERN.test(value.artifact_name ?? "")
    || value.candidate_id !== candidate?.candidate_id
    || value.source_commit !== candidate?.source?.commit
    || value.manifest_sha256 !== candidate?.manifest_sha256
    || apks.length !== 1
    || value.apk_sha256 !== apks[0].sha256
    || value.status !== "passed") {
    throw new Error("Phase 6 N4 provenance must bind a passed record to the exact candidate commit, manifest, APK, run, and artifact.");
  }
  return value;
}

export function loadPhase6N4AttendedEvidence({
  candidateManifest, manifestSha256, phase6N4RecordPath, phase6N4ChecklistPath,
  phase6N4ObservationsPath, phase6N4EvidenceDirectory, phase6N4RunId,
  phase6N4ArtifactName,
}) {
  validatePhase5CandidateIdentity({ manifest: candidateManifest, manifestSha256 });
  if ([
    phase6N4RecordPath, phase6N4ChecklistPath, phase6N4ObservationsPath,
    phase6N4EvidenceDirectory,
  ].some((value) => typeof value !== "string" || value.length < 1)
    || !RUN_ID_PATTERN.test(phase6N4RunId ?? "")
    || !ARTIFACT_NAME_PATTERN.test(phase6N4ArtifactName ?? "")) {
    throw new Error("Phase 6 N4 source paths, positive run ID, and canonical artifact name are required.");
  }
  const candidate = { manifest: candidateManifest, manifest_sha256: manifestSha256 };
  const checklistBytes = readFileSync(phase6N4ChecklistPath);
  const observationsBytes = readFileSync(phase6N4ObservationsPath);
  const recordBytes = readFileSync(phase6N4RecordPath);
  const record = validatePhase6AttendedRecordBytes({
    candidate, checklistBytes, observationsBytes, recordBytes,
    evidenceDirectory: phase6N4EvidenceDirectory,
  });
  const apk = candidateManifest.artifacts.filter(({ kind }) => kind === "apk");
  const provenance = {
    record_sha256: sha256(recordBytes),
    evidence_run_id: phase6N4RunId,
    artifact_name: phase6N4ArtifactName,
    candidate_id: record.candidate.candidate_id,
    source_commit: record.candidate.source.commit,
    manifest_sha256: record.candidate.manifest_sha256,
    apk_sha256: apk.length === 1 ? apk[0].sha256 : undefined,
    status: record.status,
  };
  return validatePhase6AttendedEvidenceProvenance(
    provenance, phase5CandidateIdentity(candidateManifest, manifestSha256),
  );
}

export function buildPhase5PendingChecklist({
  candidate, automatedEvidence, phase6AttendedEvidence, rows,
  generatedAt = new Date().toISOString(),
}) {
  validatePhase6AttendedEvidenceProvenance(phase6AttendedEvidence, candidate);
  const checklist = {
    schema_version: 1, suite: "phase5", status: "pending",
    candidate, automated_evidence: automatedEvidence,
    phase6_attended_evidence: phase6AttendedEvidence,
    rows: rows.map((row) => ({
      ...row, status: "pending", observation: "", attachments: [],
    })),
    generated_at: generatedAt,
  };
  assertNoApprovalFields(checklist);
  return checklist;
}

export function validatePhase5PendingChecklist(
  checklist, { candidate, automatedEvidence, phase6AttendedEvidence, rows },
) {
  assertNoApprovalFields(checklist);
  validatePhase6AttendedEvidenceProvenance(phase6AttendedEvidence, candidate);
  if (checklist?.schema_version !== 1 || checklist?.suite !== "phase5"
    || checklist?.status !== "pending"
    || JSON.stringify(checklist.candidate) !== JSON.stringify(candidate)
    || JSON.stringify(checklist.automated_evidence) !== JSON.stringify(automatedEvidence)
    || JSON.stringify(checklist.phase6_attended_evidence) !== JSON.stringify(phase6AttendedEvidence)
    || !Number.isFinite(Date.parse(checklist.generated_at ?? ""))) {
    throw new Error("pending checklist identity is invalid.");
  }
  exactRows("pending checklist", checklist.rows, rows.map((row) => ({
    ...row, status: "pending", observation: "", attachments: [],
  })));
}

function safeEvidenceFile(evidenceDirectory, relativePath) {
  if (typeof relativePath !== "string" || relativePath.length < 1
    || path.isAbsolute(relativePath) || relativePath.includes("\\")
    || relativePath.split("/").some((part) => ["", ".", ".."].includes(part))) {
    throw new Error("attended attachment path is unsafe.");
  }
  const root = realpathSync(evidenceDirectory);
  const target = path.resolve(root, relativePath);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw new Error("attended attachment escapes evidence directory.");
  }
  const details = lstatSync(target, { throwIfNoEntry: false });
  if (!details?.isFile() || details.isSymbolicLink() || realpathSync(target) !== target) {
    throw new Error("attended attachment is missing or unsafe.");
  }
  if (details.size < 1 || details.size > 64 * 1024 * 1024) {
    throw new Error("attended attachment size must be positive and bounded.");
  }
  return { target, size_bytes: details.size };
}

function validateAttendedDevices(devices, manifest) {
  const expectedRoles = ["attended-emulator", "attended-physical-phone"];
  if (!Array.isArray(devices)
    || JSON.stringify(devices.map(({ role }) => role)) !== JSON.stringify(expectedRoles)) {
    throw new Error("attended device roles are missing or substituted.");
  }
  const apk = manifest.artifacts.find(({ kind }) => kind === "apk");
  for (const device of devices) {
    if (typeof device.model !== "string" || device.model.length < 1
      || !Number.isSafeInteger(device.api) || device.api < 24
      || typeof device.abi !== "string" || device.abi.length < 1
      || !SHA256_PATTERN.test(device.serial_sha256 ?? "")
      || device.installed_package !== manifest.source.package
      || device.installed_version_code !== manifest.source.version_code
      || device.installed_apk_sha256 !== apk.sha256) {
      throw new Error("attended installed candidate/device identity is invalid.");
    }
  }
}

function validateObservationRows(observations, rows) {
  if (observations?.schema_version !== 1 || observations?.suite !== "phase5") {
    throw new Error("attended observations schema is invalid.");
  }
  exactRows("attended observation", observations.rows, rows.map((definition, index) => {
    const actual = observations.rows?.[index];
    return {
      row_id: definition.row_id,
      status: actual?.status,
      observation: actual?.observation,
      attachments: actual?.attachments,
    };
  }));
  for (const [index, row] of observations.rows.entries()) {
    if (row.row_id !== rows[index].row_id
      || row.status !== "passed"
      || typeof row.observation !== "string"
      || row.observation.trim().length < 12
      || !Array.isArray(row.attachments)
      || row.attachments.length < 1) {
      throw new Error(`attended row status/observation must be explicitly passed and nonblank: ${rows[index].row_id}`);
    }
  }
}

export function createPhase5AttendedRecord({
  candidateManifest, manifestSha256, checklist, checklistBytes,
  observations, observationsBytes, ownerToken, evidenceDirectory,
  phase6N4RecordPath, phase6N4ChecklistPath, phase6N4ObservationsPath,
  phase6N4EvidenceDirectory, phase6N4RunId, phase6N4ArtifactName, rows,
}) {
  if (ownerToken !== "approved") {
    throw new Error("owner token must be exact lowercase approved.");
  }
  validatePhase5CandidateIdentity({ manifest: candidateManifest, manifestSha256 });
  const phase6AttendedEvidence = loadPhase6N4AttendedEvidence({
    candidateManifest, manifestSha256, phase6N4RecordPath, phase6N4ChecklistPath,
    phase6N4ObservationsPath, phase6N4EvidenceDirectory, phase6N4RunId,
    phase6N4ArtifactName,
  });
  if (serializeCanonicalJson(checklist) !== checklistBytes.toString("utf8")
    || serializeCanonicalJson(observations) !== observationsBytes.toString("utf8")) {
    throw new Error("attended checklist or observations are not canonical.");
  }
  validatePhase5PendingChecklist(checklist, {
    candidate: phase5CandidateIdentity(candidateManifest, manifestSha256),
    automatedEvidence: checklist.automated_evidence, phase6AttendedEvidence, rows,
  });
  if (observations.candidate_id !== candidateManifest.candidate_id
    || observations.manifest_sha256 !== manifestSha256) {
    throw new Error("attended observation candidate identity is substituted.");
  }
  validateAttendedDevices(observations.devices, candidateManifest);
  validateObservationRows(observations, rows);
  const usedAttachments = new Set();
  const recordRows = observations.rows.map((row) => ({
    row_id: row.row_id,
    evidence_class: rows.find(({ row_id: rowId }) => rowId === row.row_id).evidence_class,
    status: row.status,
    observation: row.observation,
    attachments: row.attachments.map((attachmentPath) => {
      if (usedAttachments.has(attachmentPath)) {
        throw new Error("attended attachment cannot satisfy multiple rows.");
      }
      usedAttachments.add(attachmentPath);
      const attachment = safeEvidenceFile(evidenceDirectory, attachmentPath);
      return { path: attachmentPath, sha256: sha256(readFileSync(attachment.target)), size_bytes: attachment.size_bytes };
    }),
  }));
  return {
    schema_version: 1, suite: "phase5", status: "approved",
    owner_token: ownerToken,
    candidate: phase5CandidateIdentity(candidateManifest, manifestSha256),
    checklist_sha256: sha256(checklistBytes),
    observations_sha256: sha256(observationsBytes),
    automated_evidence: checklist.automated_evidence,
    phase6_attended_evidence: phase6AttendedEvidence,
    devices: observations.devices, rows: recordRows,
  };
}

export function validatePhase5AttendedRecordBytes({
  candidateManifest, manifestSha256, record, recordBytes, evidenceDirectory,
  automatedEvidencePath, checklistPath, observationsPath, rows,
  phase6N4RecordPath, phase6N4ChecklistPath, phase6N4ObservationsPath,
  phase6N4EvidenceDirectory, phase6N4RunId, phase6N4ArtifactName,
}) {
  const phase6AttendedEvidence = loadPhase6N4AttendedEvidence({
    candidateManifest, manifestSha256, phase6N4RecordPath, phase6N4ChecklistPath,
    phase6N4ObservationsPath, phase6N4EvidenceDirectory, phase6N4RunId,
    phase6N4ArtifactName,
  });
  if (serializeCanonicalJson(record) !== recordBytes.toString("utf8")) {
    throw new Error("attended record bytes are not canonical.");
  }
  if (record?.schema_version !== 1 || record?.suite !== "phase5"
    || record?.status !== "approved" || record?.owner_token !== "approved"
    || JSON.stringify(record.candidate) !== JSON.stringify(
      phase5CandidateIdentity(candidateManifest, manifestSha256),
    ) || !SHA256_PATTERN.test(record.checklist_sha256 ?? "")
    || !SHA256_PATTERN.test(record.observations_sha256 ?? "")) {
    throw new Error("attended record approval or candidate identity is invalid.");
  }
  exactKeys(record, [
    "schema_version", "suite", "status", "owner_token", "candidate",
    "checklist_sha256", "observations_sha256", "automated_evidence",
    "phase6_attended_evidence", "devices", "rows",
  ], "attended record");
  if (JSON.stringify(record.phase6_attended_evidence) !== JSON.stringify(phase6AttendedEvidence)) {
    throw new Error("Phase 6 N4 provenance does not match retained source bytes.");
  }
  validateAttendedDevices(record.devices, candidateManifest);
  if (record.automated_evidence?.sha256 !== sha256(readFileSync(automatedEvidencePath))) {
    throw new Error("automated evidence hash does not match bytes.");
  }
  const checklistBytes = readFileSync(checklistPath);
  const observationsBytes = readFileSync(observationsPath);
  let checklist;
  let observations;
  try {
    checklist = JSON.parse(checklistBytes.toString("utf8"));
    observations = JSON.parse(observationsBytes.toString("utf8"));
  } catch {
    throw new Error("attended checklist or observation source bytes are invalid JSON.");
  }
  if (serializeCanonicalJson(checklist) !== checklistBytes.toString("utf8")
    || sha256(checklistBytes) !== record.checklist_sha256) {
    throw new Error("attended checklist source bytes are noncanonical or changed.");
  }
  if (serializeCanonicalJson(observations) !== observationsBytes.toString("utf8")
    || sha256(observationsBytes) !== record.observations_sha256) {
    throw new Error("attended observation source bytes are noncanonical or changed.");
  }
  const expectedRecord = createPhase5AttendedRecord({
    candidateManifest, manifestSha256, checklist, checklistBytes,
    observations, observationsBytes, ownerToken: record.owner_token,
    evidenceDirectory, phase6N4RecordPath, phase6N4ChecklistPath,
    phase6N4ObservationsPath, phase6N4EvidenceDirectory, phase6N4RunId,
    phase6N4ArtifactName, rows,
  });
  if (serializeCanonicalJson(expectedRecord) !== recordBytes.toString("utf8")) {
    throw new Error("attended record does not match retained checklist/observation bytes.");
  }
  exactRows("attended record", record.rows, rows.map((definition, index) => {
    const actual = record.rows?.[index];
    return { row_id: definition.row_id, evidence_class: definition.evidence_class, status: actual?.status, observation: actual?.observation, attachments: actual?.attachments };
  }));
  const usedAttachments = new Set();
  for (const [index, row] of record.rows.entries()) {
    exactKeys(row, [
      "row_id", "evidence_class", "status", "observation", "attachments",
    ], `attended record row ${index}`);
    if (row.row_id !== rows[index].row_id
      || row.evidence_class !== rows[index].evidence_class
      || row.status !== "passed"
      || typeof row.observation !== "string" || row.observation.trim().length < 12
      || !Array.isArray(row.attachments) || row.attachments.length < 1) {
      throw new Error("attended record contains an invalid or blank row.");
    }
    for (const attachment of row.attachments) {
      exactKeys(attachment, ["path", "sha256", "size_bytes"], "attended attachment");
      if (usedAttachments.has(attachment.path)) {
        throw new Error("attended attachment cannot satisfy multiple rows.");
      }
      usedAttachments.add(attachment.path);
      const file = safeEvidenceFile(evidenceDirectory, attachment.path);
      if (file.size_bytes !== attachment.size_bytes
        || sha256(readFileSync(file.target)) !== attachment.sha256) {
        throw new Error("attended attachment hash/bytes changed.");
      }
    }
  }
  return {
    status: record.status,
    rows: record.rows,
    attended_record_sha256: sha256(recordBytes),
  };
}

export function parsePhase5AttendedCliArguments(args) {
  const mode = args[0];
  if (!["prepare", "record", "verify"].includes(mode)) {
    throw new Error("expected prepare, record, or verify mode.");
  }
  const options = { mode };
  const accepted = new Set([
    "--bundle-dir", "--manifest-sha256", "--automated-evidence",
    "--checklist", "--observations", "--evidence-dir",
    "--owner-token", "--record", "--output",
    "--phase6-n4-record", "--phase6-n4-checklist",
    "--phase6-n4-observations", "--phase6-n4-evidence-dir",
    "--phase6-n4-run-id", "--phase6-n4-artifact-name",
  ]);
  for (let index = 1; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!accepted.has(key) || !value || value.startsWith("--")) {
      throw new Error("attended arguments are malformed.");
    }
    const name = key.slice(2).replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase());
    if (Object.hasOwn(options, name)) throw new Error(`duplicate argument: ${key}`);
    options[name] = value;
  }
  for (const name of ["bundleDir", "manifestSha256", "automatedEvidence"]) {
    if (!options[name]) throw new Error(`missing ${name}.`);
  }
  for (const name of [
    "phase6N4Record", "phase6N4Checklist", "phase6N4Observations",
    "phase6N4EvidenceDir", "phase6N4RunId", "phase6N4ArtifactName",
  ]) {
    if (!options[name]) throw new Error(`missing ${name}.`);
  }
  if (!RUN_ID_PATTERN.test(options.phase6N4RunId)
    || !ARTIFACT_NAME_PATTERN.test(options.phase6N4ArtifactName)) {
    throw new Error("Phase 6 N4 run ID or artifact name is malformed.");
  }
  if (mode === "prepare" && !options.output) throw new Error("missing output.");
  if (mode === "record") {
    for (const name of ["checklist", "observations", "evidenceDir", "ownerToken"]) {
      if (!options[name]) throw new Error(`missing ${name}.`);
    }
    if (!options.output) throw new Error("missing output.");
  }
  if (mode === "verify") {
    for (const name of ["checklist", "observations", "evidenceDir", "record"]) {
      if (!options[name]) throw new Error(`missing ${name}.`);
    }
  }
  return options;
}

export function executePhase5AttendedCli(args = process.argv.slice(2)) {
  const options = parsePhase5AttendedCliArguments(args);
  const candidate = loadPhase5Candidate({
    bundleDirectory: options.bundleDir,
    expectedManifestSha256: options.manifestSha256,
  });
  const rows = derivePhase5AttendedRows();
  const automatedBytes = readFileSync(options.automatedEvidence);
  const automated = JSON.parse(automatedBytes.toString("utf8"));
  loadAndValidatePhase5AutomatedEvidenceSet({
    manifest: candidate.manifest, manifestSha256: candidate.manifest_sha256,
    aggregatePath: options.automatedEvidence,
  });
  const automatedEvidence = { file: path.basename(options.automatedEvidence), sha256: sha256(automatedBytes) };
  const phase6Options = {
    candidateManifest: candidate.manifest,
    manifestSha256: candidate.manifest_sha256,
    phase6N4RecordPath: options.phase6N4Record,
    phase6N4ChecklistPath: options.phase6N4Checklist,
    phase6N4ObservationsPath: options.phase6N4Observations,
    phase6N4EvidenceDirectory: options.phase6N4EvidenceDir,
    phase6N4RunId: options.phase6N4RunId,
    phase6N4ArtifactName: options.phase6N4ArtifactName,
  };
  const phase6AttendedEvidence = loadPhase6N4AttendedEvidence(phase6Options);
  if (options.mode === "prepare") {
    const checklist = buildPhase5PendingChecklist({
      candidate: phase5CandidateIdentity(candidate.manifest, candidate.manifest_sha256),
      automatedEvidence, phase6AttendedEvidence, rows,
    });
    writeFileSync(options.output, serializeCanonicalJson(checklist), { flag: "wx" });
    return checklist;
  }
  const checklistBytes = readFileSync(options.checklist);
  const observationsBytes = readFileSync(options.observations);
  if (options.mode === "verify") {
    const recordBytes = readFileSync(options.record);
    return validatePhase5AttendedRecordBytes({
      candidateManifest: candidate.manifest, manifestSha256: candidate.manifest_sha256,
      record: JSON.parse(recordBytes), recordBytes,
      evidenceDirectory: options.evidenceDir, automatedEvidencePath: options.automatedEvidence,
      checklistPath: options.checklist, observationsPath: options.observations, rows,
      ...phase6Options,
    });
  }
  const record = createPhase5AttendedRecord({
    candidateManifest: candidate.manifest, manifestSha256: candidate.manifest_sha256,
    checklist: JSON.parse(checklistBytes), checklistBytes,
    observations: JSON.parse(observationsBytes), observationsBytes,
    ownerToken: options.ownerToken, evidenceDirectory: options.evidenceDir,
    ...phase6Options, rows,
  });
  writeFileSync(options.output, serializeCanonicalJson(record), { flag: "wx" });
  return record;
}

const isMain = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    const result = executePhase5AttendedCli();
    process.stdout.write(`${JSON.stringify({ ok: true, status: result.status, rows: result.rows.length })}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ ok: false, error: error.message })}\n`);
    process.exitCode = 1;
  }
}
