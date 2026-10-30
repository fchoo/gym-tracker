#!/usr/bin/env node

import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const PHASE20 = /phase[ -]?20|20-native-acceptance/iu;

export const V12_PREBUILD_PREDECESSORS = Object.freeze([
  Object.freeze({ phase: 13, slug: "13-multi-plan-running-foundation", terminalPlan: "14", validationStatus: "validated", verificationStatus: "passed", requirements: 17, authority: "closed", validationFacts: { nyquist_compliant: true, wave_0_complete: true, automated_gaps: 0 }, verificationFacts: { score: 100, gaps: [] } }),
  Object.freeze({ phase: 14, slug: "14-prototype-visual-shell", terminalPlan: "11", validationStatus: "validated", requirements: 13, authority: "closed", verificationRequired: false, validationFacts: { nyquist: true } }),
  Object.freeze({ phase: 15, slug: "15-workout-parity", terminalPlan: "13", validationStatus: "validated_host", verificationStatus: "passed_host", requirements: 36, authority: "phase20-deferred", validationFacts: { nyquist: true, wave_0_complete: true, host_test_status: "green", phase20_manual_items_pending: true }, verificationFacts: { phase20_native_pending: true, implementation_gaps: [] } }),
  Object.freeze({ phase: 16, slug: "16-calendar-parity", terminalPlan: "07", validationStatus: "validated", verificationStatus: "passed", requirements: 23, authority: "phase20-deferred", validationFacts: { nyquist_compliant: true, wave_0_complete: true, automated_gaps: 0 }, verificationFacts: { behavior_unverified: 0, overrides_applied: 0 } }),
  Object.freeze({ phase: 17, slug: "17-library-running-plans", terminalPlan: "14", validationStatus: "validated_host", verificationStatus: "passed_host", requirements: 36, authority: "phase20-deferred", validationFacts: { nyquist_compliant: false, wave_0_complete: false, automated_gaps: 0 }, verificationFacts: { phase20_native_pending: true, native_pass_claimed: false, implementation_gaps: [] } }),
  Object.freeze({ phase: 18, slug: "18-garmin-import", terminalPlan: "14", validationStatus: "validated", verificationStatus: "passed", requirements: 16, authority: "phase20-deferred", validationFacts: { host_status: "green", host_gaps_found: 0, native_status: "pending_phase20", native_items_pending: 6 }, verificationFacts: { behavior_unverified: 0, overrides_applied: 0, native_status: "deferred_phase20" } }),
  Object.freeze({ phase: 19, slug: "19-progress-parity", terminalPlan: "10", validationStatus: "validated", verificationStatus: "passed", requirements: 18, authority: "phase20-deferred", validationFacts: { nyquist_compliant: true, wave_0_complete: true, automated_gaps: 0 }, verificationFacts: { behavior_unverified: 0, overrides_applied: 0, gaps: [] } }),
].map((entry) => Object.freeze({
  ...entry,
  summary: `.planning/phases/${entry.slug}/${entry.phase}-${entry.terminalPlan}-SUMMARY.md`,
  validation: `.planning/phases/${entry.slug}/${entry.phase}-VALIDATION.md`,
  files: Object.freeze([
    `.planning/phases/${entry.slug}/${entry.phase}-${entry.terminalPlan}-SUMMARY.md`,
    `.planning/phases/${entry.slug}/${entry.phase}-VALIDATION.md`,
    ...(entry.verificationRequired === false ? [] : [`.planning/phases/${entry.slug}/${entry.phase}-VERIFICATION.md`]),
  ]),
  ...(entry.verificationRequired === false ? {} : {
    verification: `.planning/phases/${entry.slug}/${entry.phase}-VERIFICATION.md`,
  }),
})));

function fail(code, phase, kind) {
  throw new Error(`phase20_prebuild_predecessor_${code}:phase-${phase}:${kind}`);
}

function scalar(value) {
  const trimmed = value.trim();
  if (/^(?:true|false)$/u.test(trimmed)) return trimmed === "true";
  if (/^-?\d+$/u.test(trimmed)) return Number(trimmed);
  if (trimmed === "[]") return [];
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    const body = trimmed.slice(1, -1).trim();
    return body === "" ? [] : body.split(",").map((item) => scalar(item));
  }
  if ((trimmed.startsWith('"') && trimmed.endsWith('"'))
    || (trimmed.startsWith("'") && trimmed.endsWith("'"))) return trimmed.slice(1, -1);
  return trimmed;
}

function frontMatter(text, phase, kind) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(text);
  if (match === null) fail("schema", phase, kind);
  const result = {};
  for (const line of match[1].split(/\r?\n/u)) {
    if (/^\s/u.test(line) || line.trim() === "") continue;
    const item = /^([a-z][a-z0-9_-]*):\s*(.*)$/u.exec(line);
    if (item === null || Object.hasOwn(result, item[1])) fail("schema", phase, kind);
    result[item[1]] = scalar(item[2]);
  }
  return Object.freeze(result);
}

function safeRead(root, relative, phase, kind) {
  const absoluteRoot = realpathSync(path.resolve(root));
  const absolute = path.resolve(absoluteRoot, relative);
  if (!absolute.startsWith(`${absoluteRoot}${path.sep}`) || !existsSync(absolute)) fail("missing", phase, kind);
  let cursor = absoluteRoot;
  for (const part of relative.split("/")) {
    cursor = path.join(cursor, part);
    if (lstatSync(cursor).isSymbolicLink()) fail("schema", phase, kind);
  }
  let resolved;
  try { resolved = realpathSync(absolute); } catch { fail("missing", phase, kind); }
  if (!resolved.startsWith(`${absoluteRoot}${path.sep}`) || lstatSync(absolute).isSymbolicLink() || !lstatSync(resolved).isFile()) fail("schema", phase, kind);
  return readFileSync(resolved, "utf8");
}

function phaseMatches(value, predecessor) {
  return String(value) === String(predecessor.phase) || value === predecessor.slug;
}

function requirementsMatch(value, predecessor) {
  const prefix = { 13: "DOM", 14: "SHL", 15: "WRK", 16: "CAL", 17: "LIB", 18: "GAR", 19: "PRO" }[predecessor.phase];
  return Array.isArray(value) && value.length === predecessor.requirements
    && new Set(value).size === value.length
    && value.every((id, index) => id === `${prefix}-${String(index + 1).padStart(2, "0")}`);
}

function rejectAuthorityEscalation(text, metadata, predecessor, kind) {
  if (metadata.release_authorized === true || metadata.attended_status === "passed"
    || metadata.native_pass_claimed === true || metadata.phase20_acceptance === "passed") {
    fail("authority", predecessor.phase, kind);
  }
  if (predecessor.authority === "phase20-deferred" && !PHASE20.test(text)) {
    fail("authority", predecessor.phase, kind);
  }
}

function exactFacts(metadata, expected) {
  return Object.entries(expected).every(([key, value]) =>
    JSON.stringify(metadata[key]) === JSON.stringify(value)
  );
}

function validateSummary(root, predecessor) {
  const text = safeRead(root, predecessor.summary, predecessor.phase, "summary");
  const metadata = frontMatter(text, predecessor.phase, "summary");
  if (!phaseMatches(metadata.phase, predecessor) || String(metadata.plan).padStart(2, "0") !== predecessor.terminalPlan) {
    fail("schema", predecessor.phase, "summary");
  }
  if (metadata.status !== "complete") fail("status", predecessor.phase, "summary");
  const evidenceStatuses = [...text.matchAll(/^\s{2,}status:\s*([A-Za-z_]+)\s*$/gmu)].map((match) => match[1]);
  if (evidenceStatuses.some((status) => status !== "pass" && !(predecessor.authority === "phase20-deferred" && status === "unknown"))) {
    fail("status", predecessor.phase, "evidence");
  }
  rejectAuthorityEscalation(text, metadata, predecessor, "summary");
}

function validateValidation(root, predecessor) {
  const text = safeRead(root, predecessor.validation, predecessor.phase, "validation");
  const metadata = frontMatter(text, predecessor.phase, "validation");
  const requirementsValid = predecessor.phase === 18
    ? metadata.requirements_audited === predecessor.requirements
    : requirementsMatch(metadata.requirements, predecessor);
  if (!phaseMatches(metadata.phase, predecessor) || !requirementsValid) {
    fail("schema", predecessor.phase, "validation");
  }
  if (metadata.status !== predecessor.validationStatus) fail("status", predecessor.phase, "validation");
  if (!exactFacts(metadata, predecessor.validationFacts)) fail("schema", predecessor.phase, "validation");
  if (metadata.automated_gaps !== undefined && metadata.automated_gaps !== 0) fail("status", predecessor.phase, "validation");
  rejectAuthorityEscalation(text, metadata, predecessor, "validation");
  if (predecessor.phase === 15 && metadata.phase20_manual_items_pending !== true) fail("authority", 15, "validation");
  if (predecessor.phase === 18 && (metadata.host_status !== "green" || metadata.native_status !== "pending_phase20")) fail("authority", 18, "validation");
}

function validateVerification(root, predecessor) {
  if (predecessor.verification === undefined) return;
  const text = safeRead(root, predecessor.verification, predecessor.phase, "verification");
  const metadata = frontMatter(text, predecessor.phase, "verification");
  if (!phaseMatches(metadata.phase, predecessor)) fail("schema", predecessor.phase, "verification");
  if (metadata.status !== predecessor.verificationStatus) fail("status", predecessor.phase, "verification");
  rejectAuthorityEscalation(text, metadata, predecessor, "verification");
  if (predecessor.phase === 13 && (!Array.isArray(metadata.gaps) || metadata.gaps.length !== 0)) fail("status", 13, "verification");
  if (predecessor.phase === 15 && (metadata.phase20_native_pending !== true || !Array.isArray(metadata.implementation_gaps) || metadata.implementation_gaps.length !== 0)) fail("authority", 15, "verification");
  if (predecessor.phase === 16 && metadata.behavior_unverified !== 0) fail("status", 16, "verification");
  if (predecessor.phase === 17 && (metadata.phase20_native_pending !== true || metadata.native_pass_claimed !== false || !Array.isArray(metadata.implementation_gaps) || metadata.implementation_gaps.length !== 0)) fail("authority", 17, "verification");
  if (predecessor.phase === 18 && (metadata.native_status !== "deferred_phase20" || metadata.behavior_unverified !== 0)) fail("authority", 18, "verification");
  if (predecessor.phase === 19 && (metadata.behavior_unverified !== 0 || !Array.isArray(metadata.gaps) || metadata.gaps.length !== 0)) fail("status", 19, "verification");
  if (!exactFacts(metadata, predecessor.verificationFacts)) fail("schema", predecessor.phase, "verification");
}

export function validateV12PrebuildPredecessors({ root = process.cwd() } = {}) {
  for (const predecessor of V12_PREBUILD_PREDECESSORS) {
    validateSummary(root, predecessor);
    validateValidation(root, predecessor);
    validateVerification(root, predecessor);
  }
  return Object.freeze({
    ok: true,
    phases: Object.freeze(V12_PREBUILD_PREDECESSORS.map(({ phase }) => phase)),
    files: V12_PREBUILD_PREDECESSORS.reduce((count, predecessor) => count + predecessor.files.length, 0),
  });
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = validateV12PrebuildPredecessors();
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "phase20_prebuild_predecessor_invalid"}\n`);
    process.exitCode = 1;
  }
}
