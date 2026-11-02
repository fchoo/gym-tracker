import { CryptoDigestAlgorithm, digestStringAsync } from "expo-crypto";
import { deleteDatabaseAsync } from "expo-sqlite";

import {
  getGarminConnectNativeModule,
  readGarminRuntimeInfo,
  type GarminConnectNativeModule,
} from "../../modules/garmin-connect/src";
import { canonicalJson } from "../domains/activities/importContracts";
import { canonicalMergeValue } from "../domains/portability/mergeCommands";
import { buildPortableMergePlan } from "../domains/portability/mergePlan";
import {
  confirmRunningActivityMatch,
  prepareRunningActivityMatchInput,
  queryRunningActivityMatchCandidates,
} from "../domains/running/activityMatchCommands";
import { createGarminActivityAdapter } from "../platform/garmin/garminActivityAdapter";
import {
  createGarminSharedImportCommitter,
  createGarminSyncCoordinator,
} from "../platform/garmin/garminSyncCoordinator";
import { normalizeGarminActivity } from "../platform/garmin/normalizeGarminActivity";
import { openSqliteKernel, type SqliteKernel } from "../platform/sqlite";
import { createMigrationRunner } from "../platform/sqlite/migrationRunner";
import { migrations } from "../platform/sqlite/migrations";
import { createFullPlanLogicalMergeWriter } from "../platform/sqlite/repositories/logicalMergeRepository";
import { createLogicalBackupRepository } from "../platform/sqlite/repositories/logicalBackupRepository";
import { createLogicalRestoreRepository } from "../platform/sqlite/repositories/logicalRestoreRepository";
import { createImportedActivityRepository } from "../platform/sqlite/repositories/importedActivityRepository";
import { createRunningActivityMatchRepository } from "../platform/sqlite/repositories/runningActivityMatchRepository";
import { createRunningPlanRepository } from "../platform/sqlite/repositories/runningPlanRepository";
import { createSqliteMergeLocalFactsPort } from "../platform/sqlite/repositories/restorePreflightAdapters";

const CASE_IDS = [
  "packaging", "bridge-allowlist", "canonical-json", "sync-read", "account-lifecycle", "recovery",
  "dedupe-restart", "dedupe-restore", "dedupe-merge", "match-zero", "match-one", "match-many",
  "match-stale", "match-alternate", "match-cancel", "match-confirm", "match-reassign",
] as const;
type CaseId = typeof CASE_IDS[number];
type Receipt = Readonly<{
  id: CaseId;
  order: number;
  code: string;
  count: number;
  receipt_sha256: string;
}>;
type Identity = Readonly<{
  packageName?: unknown;
  buildProfile?: unknown;
  nativeContractsEnabled?: unknown;
  suite?: unknown;
  confirmation?: unknown;
  nonce?: unknown;
  mode?: unknown;
}>;
type Signal = Readonly<{ aborted: boolean }>;

const HASH = /^[a-f0-9]{64}$/u;
const PRIVATE = /(?:authorization|bearer|ciphertext|credential|email|heart.?rate|latitude|longitude|password|raw.?json|route|secret|serial|token|url)/iu;
const SUCCESS_CODES = Object.freeze(Object.fromEntries(CASE_IDS.map((id) => [id, `${id}-observed`])) as Record<CaseId, string>);
const ADVERSARIAL_CASES = Object.freeze([
  ["PH18-ADV-RESTORE", "completed"], ["PH18-ADV-REFRESH", "completed"],
  ["PH18-ADV-READ", "completed"], ["PH18-ADV-LOGOUT", "completed"],
  ["PH18-ADV-RESTART", "sign_in_required"], ["PH18-ADV-LATE-GENERATION", "stale_generation"],
  ["PH18-ADV-EXPIRED", "sign_in_required"], ["PH18-ADV-401", "sign_in_required"],
  ["PH18-ADV-403", "data_access_denied"], ["PH18-ADV-429", "rate_limited"],
  ["PH18-ADV-OFFLINE", "offline"], ["PH18-ADV-TIMEOUT", "timeout"],
  ["PH18-ADV-5XX", "temporary_failure"], ["PH18-ADV-MALFORMED", "malformed_response"],
  ["PH18-ADV-TRUNCATED", "malformed_response"], ["PH18-ADV-OVERSIZED", "malformed_response"],
  ["PH18-ADV-UNSUPPORTED-JSON", "malformed_response"], ["PH18-ADV-MISSING-COMPONENT", "malformed_response"],
  ["PH18-ADV-PARTIAL-PAGE", "temporary_failure"], ["PH18-ADV-ROTATION", "stale_generation"],
] as const);

class V12GarminDomainError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "V12GarminDomainError";
  }
}

const sha256 = (value: string) => digestStringAsync(CryptoDigestAlgorithm.SHA256, value);
function record(value: unknown, code: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new V12GarminDomainError(code);
  return value as Record<string, unknown>;
}
function exact(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
function noPrivate(value: unknown): void {
  if (typeof value === "string") {
    if (PRIVATE.test(value) || value.includes("@") || value.includes("/Users/") || value.includes("/home/")) {
      throw new V12GarminDomainError("privacy_failed");
    }
    return;
  }
  if (Array.isArray(value)) return value.forEach(noPrivate);
  if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (PRIVATE.test(key)) throw new V12GarminDomainError("privacy_failed");
      noPrivate(child);
    }
  }
}

export function v12ProductionGarminEnabled(value: Identity): boolean {
  return value.packageName === "com.fchoo.gymtracker.devtest"
    && value.buildProfile === "development-test"
    && value.nativeContractsEnabled === true
    && value.suite === "v1.2-acceptance"
    && value.confirmation === "VERIFY-V12-DOMAIN"
    && (value.mode === undefined || value.mode === "preflight" || value.mode === "execute")
    && typeof value.nonce === "string"
    && /^[a-f0-9]{32}$/u.test(value.nonce);
}

function authRequired(error: unknown): boolean {
  const candidate = error as Readonly<{ code?: unknown }> | null;
  return candidate?.code === "sign_in_required"
    || candidate?.code === "invalid_credentials"
    || candidate?.code === "mfa_expired";
}

function parseArm(value: unknown): void {
  const arm = record(value, "arm_required");
  if (!exact(arm, ["schema_version", "code", "receipt_sha256"])
    || arm.schema_version !== 1 || arm.code !== "arm-consumed"
    || typeof arm.receipt_sha256 !== "string" || !HASH.test(arm.receipt_sha256)) {
    throw new V12GarminDomainError("arm_required");
  }
}

function parseSessionRecord(value: unknown): string {
  const session = record(value, "auth_required");
  if (session.present !== true || session.version !== 1
    || typeof session.sha256 !== "string" || !HASH.test(session.sha256)) {
    throw new V12GarminDomainError("auth_required");
  }
  return session.sha256;
}

function parseLifecycle(value: unknown): Readonly<Record<string, unknown>> {
  const report = record(value, "account_lifecycle_failed");
  const codes = record(report.codes, "account_lifecycle_failed");
  const codeKeys = ["restore", "refresh", "cold_restore", "logout", "restored", "rotation", "restart", "storage", "operation_rejection", "arguments_rejection"];
  if (report.schema_version !== 1 || typeof report.evidence_source !== "string"
    || !/^[a-z][a-z0-9-]{2,63}$/u.test(report.evidence_source) || !exact(codes, codeKeys)
    || Object.values(codes).some((entry) => typeof entry !== "string" || !/^[a-z][a-z0-9_-]{2,63}$/u.test(entry))
    || !Array.isArray(report.bridge_operations) || report.bridge_operations.length !== 11
    || report.bridge_operations.some((entry) => typeof entry !== "string" || !/^[A-Za-z][A-Za-z0-9]{2,63}$/u.test(entry))
    || ![report.before_sha256, report.refreshed_sha256, report.restored_sha256]
      .every((entry) => typeof entry === "string" && HASH.test(entry))
    || !Array.isArray(report.recovery_extensions) || report.recovery_extensions.length !== 4) {
    throw new V12GarminDomainError("account_lifecycle_failed");
  }
  noPrivate(report);
  return report;
}

function parseAdversarial(value: unknown, extensions: unknown): Readonly<Record<string, unknown>> {
  const report = record(value, "recovery_failed");
  const combined = Array.isArray(report.cases) && Array.isArray(extensions)
    ? [...report.cases.slice(0, 6), ...extensions.slice(0, 2), ...report.cases.slice(6, 12), extensions[2], report.cases[12], extensions[3], ...report.cases.slice(13)]
    : [];
  if (report.schema_version !== 1 || report.suite !== "phase18-garmin-adversarial"
    || !Array.isArray(report.cases) || report.cases.length !== 16 || combined.length !== ADVERSARIAL_CASES.length) {
    throw new V12GarminDomainError("recovery_failed");
  }
  combined.forEach((entry, index) => {
    const row = record(entry, "recovery_failed");
    const [id] = ADVERSARIAL_CASES[index]!;
    if (row.id !== id || typeof row.code !== "string" || !/^[a-z][a-z0-9_]{2,63}$/u.test(row.code) || !Number.isSafeInteger(row.call_count)
      || (row.call_count as number) < 1 || row.automatic_retry_count !== 0
      || !Number.isSafeInteger(row.retry_after_ms) || (row.retry_after_ms as number) < 0 || (row.retry_after_ms as number) > 900_000) {
      throw new V12GarminDomainError("recovery_failed");
    }
  });
  const projected = combined.map((entry) => {
    const row = entry as Record<string, unknown>;
    return Object.freeze({ id: row.id, code: row.code, call_count: row.call_count,
      automatic_retry_count: row.automatic_retry_count, retry_after_ms: row.retry_after_ms });
  });
  noPrivate({ cases: projected });
  return Object.freeze({ cases: Object.freeze(projected) });
}

async function openEvidenceDatabase(name: string): Promise<SqliteKernel> {
  const kernel = await openSqliteKernel(name);
  await createMigrationRunner({
    databaseName: name,
    kernel,
    migrations,
    recoveryBackup: {
      async createAndValidate(request) {
        if (request.databaseName !== name || request.fromVersion !== 0) throw new Error("database_not_empty");
        return { ...request, backupId: `${name}:empty`, validated: true as const };
      },
    },
  }).run();
  return kernel;
}

async function sourceDigest(kernel: SqliteKernel): Promise<string> {
  const tables = ["running_activity_match_events", "running_activity_match_receipts", "running_activity_current_matches"];
  const rows = [];
  for (const table of tables) rows.push([table, await kernel.queryAll(`SELECT * FROM ${table} ORDER BY rowid`)]);
  return sha256(canonicalJson(rows));
}

async function collectMatches(
  kernel: SqliteKernel,
  activityId: string,
  localDate: string,
  observe: (id: CaseId, operation: () => Promise<Readonly<{ count: number; evidence?: unknown }>>) => Promise<void>,
): Promise<void> {
  const repository = createRunningActivityMatchRepository(kernel);
  const candidates = () => queryRunningActivityMatchCandidates(repository, activityId);
  await observe("match-zero", async () => {
    if ((await candidates()).kind !== "no_candidates") throw new Error("candidates_present");
    return { count: 0 };
  });
  const weekday = (["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const)[new Date(`${localDate}T12:00:00Z`).getUTCDay()]!;
  async function seed(prefix: string) {
    const plans = createRunningPlanRepository(kernel);
    await plans.createInactiveMinimum({ planId: `${prefix}-plan`, planName: "Running", anchorDayId: `${prefix}-day`, scheduleId: `${prefix}-schedule`, scheduleVersionId: `${prefix}-version`, scheduleBindingId: `${prefix}-binding`, createdAtMs: 1_000, effectiveLocalDate: localDate, timezone: "UTC", recoveryRevisionId: `${prefix}-session`, slots: [{ id: `${prefix}-slot`, weekday, ordinal: 0, sessionRevisionId: `${prefix}-session` }] });
    await plans.activateMinimum({ planId: `${prefix}-plan`, scheduleId: `${prefix}-schedule`, expectedPlanRevision: 1, expectedScheduleRevision: 1, activatedAtMs: 2_000 });
    await plans.materializeOccurrences({ planId: `${prefix}-plan`, scheduleId: `${prefix}-schedule`, scheduleVersionId: `${prefix}-version`, localDate, timezone: "UTC", createdAtMs: 3_000, occurrenceIds: [`${prefix}-opportunity`] });
  }
  await observe("match-one", async () => {
    await seed("v12-one"); const result = await candidates();
    if (result.kind !== "ready" || result.candidates.length !== 1) throw new Error("candidate_count_invalid");
    return { count: result.candidates.length };
  });
  await observe("match-many", async () => {
    const nextWeek = new Date(`${localDate}T12:00:00Z`); nextWeek.setUTCDate(nextWeek.getUTCDate() + 7);
    await createRunningPlanRepository(kernel).materializeOccurrences({ planId: "v12-one-plan", scheduleId: "v12-one-schedule", scheduleVersionId: "v12-one-version", localDate: nextWeek.toISOString().slice(0, 10), timezone: "UTC", createdAtMs: 3_500, occurrenceIds: ["v12-two-opportunity"] });
    const result = await candidates();
    if (result.kind !== "ready" || result.candidates.length !== 2) throw new Error("candidate_count_invalid");
    return { count: result.candidates.length };
  });
  await observe("match-stale", async () => {
    const result = await candidates(); if (result.kind !== "ready") throw new Error("candidates_missing");
    const input = await prepareRunningActivityMatchInput({ action: "match", candidate: { ...result.candidates[0]!, expectedActivityRevision: 999 }, requestId: "v12-stale", occurredAtMs: 4_000 }, sha256);
    if ((await confirmRunningActivityMatch(repository, input)).kind !== "conflict") throw new Error("stale_not_rejected");
    return { count: 1 };
  });
  await observe("match-alternate", async () => {
    const result = await candidates();
    if (result.kind !== "ready" || new Set(result.candidates.map((candidate) => candidate.opportunityId)).size !== 2) throw new Error("alternate_missing");
    return { count: 2 };
  });
  await observe("match-cancel", async () => {
    const before = await sourceDigest(kernel); const result = await candidates();
    if (result.kind !== "ready") throw new Error("candidates_missing");
    const after = await sourceDigest(kernel);
    if (before !== after) throw new Error("cancel_wrote_source");
    return { count: 0, evidence: { before, after } };
  });
  await observe("match-confirm", async () => {
    const result = await candidates(); if (result.kind !== "ready") throw new Error("candidates_missing");
    const input = await prepareRunningActivityMatchInput({ action: "match", candidate: result.candidates[0]!, requestId: "v12-confirm", occurredAtMs: 5_000 }, sha256);
    if ((await confirmRunningActivityMatch(repository, input)).kind !== "matched") throw new Error("match_failed");
    return { count: 1 };
  });
  await observe("match-reassign", async () => {
    const result = await candidates(); if (result.kind !== "already_matched") throw new Error("match_missing");
    const next = result.candidates.find((candidate) => candidate.opportunityId !== result.opportunityId);
    if (!next) throw new Error("alternate_missing");
    const input = await prepareRunningActivityMatchInput({ action: "reassign", candidate: { ...next, expectedRelationRevision: result.relationRevision }, expectedCurrentOpportunityId: result.opportunityId, requestId: "v12-reassign", occurredAtMs: 6_000 }, sha256);
    if ((await confirmRunningActivityMatch(repository, input)).kind !== "reassigned") throw new Error("reassign_failed");
    return { count: 1 };
  });
}

/**
 * Isolated Phase 20 producer. It emits only operation receipts. The host owns
 * PASS/FAIL derivation after process, cleanup, privacy, identity and JUnit checks.
 */
export async function collectV12ProductionGarminDomain(
  identity: Identity,
  emit: (line: string) => void,
  signal: Signal,
): Promise<void> {
  if (!v12ProductionGarminEnabled(identity)) throw new Error("domain_disabled");
  const nonce = identity.nonce as string;
  const mode = identity.mode === "preflight" ? "preflight" : "execute";
  let sequence = 0;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const active = () => { if (signal.aborted) throw new Error("domain_cancelled"); };
  const progress = () => {
    active();
    emit(`GYM_TRACKER_V12_DOMAIN_PROGRESS:${JSON.stringify({ schema_version: 2, nonce, sequence: ++sequence })}`);
  };
  const startHeartbeat = () => {
    progress();
    heartbeat = setInterval(() => { try { progress(); } catch { /* cancellation is handled by the active operation */ } }, 5_000);
  };
  const stopHeartbeat = () => { if (heartbeat !== undefined) clearInterval(heartbeat); heartbeat = undefined; };
  active();
  const native = getGarminConnectNativeModule();
  const activeKernels = new Set<SqliteKernel>();
  const databaseNames: string[] = [];
  let armConsumed = false;
  let terminal: Record<string, unknown> = { schema_version: 2, nonce, kind: "error", code: "domain_failed" };
  let cleanupFailure: string | undefined;
  const receipts = new Map<CaseId, Receipt>();
  let hostObservations: Readonly<Record<string, unknown>> | undefined;
  const observe = async (id: CaseId, operation: () => Promise<Readonly<{ count: number; evidence?: unknown }>>) => {
    active(); progress();
    try {
      const result = await operation(); active();
      if (!Number.isSafeInteger(result.count) || result.count < 0) throw new Error("count_invalid");
      const code = SUCCESS_CODES[id];
      const receipt = await sha256(canonicalJson({ id, code, count: result.count, evidence: result.evidence ?? null }));
      receipts.set(id, Object.freeze({ id, order: CASE_IDS.indexOf(id), code, count: result.count, receipt_sha256: receipt }));
    } catch (error) {
      if (error instanceof V12GarminDomainError) throw error;
      throw new V12GarminDomainError(`${id.replaceAll("-", "_")}_failed`);
    }
  };
  const open = async (name: string) => {
    const kernel = await openEvidenceDatabase(name); activeKernels.add(kernel); databaseNames.push(name); return kernel;
  };
  const close = async (kernel: SqliteKernel) => { if (activeKernels.delete(kernel)) await kernel.close(); };

  startHeartbeat();
  try {
    parseArm(await native.consumeV12EvidenceArm({ nonce, phase: mode }));
    armConsumed = true;
    let namespace: string | undefined;
    const source = createGarminActivityAdapter({
      driver: native,
      mapper: { fromActivity: (activity) => {
        if (!namespace) throw new Error("auth_required");
        return normalizeGarminActivity({ ...activity, account_namespace: namespace }, sha256);
      } },
    });
    try {
      const state = await source.restoreSession();
      if (state.kind !== "connected") throw new V12GarminDomainError("auth_required");
      namespace = state.account_namespace;
    } catch (error) {
      if (error instanceof V12GarminDomainError || authRequired(error)) throw new V12GarminDomainError("auth_required");
      throw new V12GarminDomainError("auth_required");
    }
    const sessionSha256 = parseSessionRecord(await native.sessionRecordState());
    if (mode === "preflight") {
      terminal = { schema_version: 2, nonce, kind: "garmin-preflight", session_sha256: sessionSha256 };
    } else {
      await observe("packaging", async () => { await readGarminRuntimeInfo(native); return { count: 1 }; });
      const lifecycle = parseLifecycle(await native.runV12StoredSessionLifecycle());
      await observe("bridge-allowlist", async () => ({ count: 2, evidence: (lifecycle.codes as Record<string, unknown>) }));
      await observe("account-lifecycle", async () => ({ count: 5, evidence: {
        before: lifecycle.before_sha256, refreshed: lifecycle.refreshed_sha256, restored: lifecycle.restored_sha256,
      } }));
      const reconnected = await source.restoreSession();
      if (reconnected.kind !== "connected") throw new V12GarminDomainError("account_lifecycle_failed");
      namespace = reconnected.account_namespace;
      const lifecycleCodes = lifecycle.codes as Readonly<Record<string, unknown>>;

      const primaryName = `v12-production-garmin-${nonce}.db`;
      const restoreName = `v12-production-garmin-${nonce}-restore.db`;
      const mergeName = `v12-production-garmin-${nonce}-merge.db`;
      let primary = await open(primaryName);
      const baseline = await createLogicalBackupRepository(primary).collect({ snapshotId: `v12-${nonce}-baseline`, createdAtMs: 1 });
      let importedId: string | undefined;
      let importedDate: string | undefined;
      const syncFor = (kernel: SqliteKernel) => createGarminSyncCoordinator({
        source,
        limits: { pageSize: 1, maxPages: 1, maxActivities: 1 },
        importActivity: createGarminSharedImportCommitter({
          repository: createImportedActivityRepository(kernel),
          sha256,
          requestFor: async (prepared) => {
            const digest = await sha256(canonicalJson(prepared.envelope));
            const date = prepared.envelope.normalized.source_local_date_time?.slice(0, 10);
            if (!date) throw new Error("date_confirmation_required");
            importedId = `activity-${digest.slice(0, 32)}`;
            importedDate = date;
            return { requestId: `v12-${digest}`, requestSha256: digest, activityId: importedId, expectedAggregateRevision: 0, confirmedLocalDate: date };
          },
        }),
      }).syncNow({ isCancelled: () => signal.aborted, onProgress: progress });
      await observe("sync-read", async () => {
        const result = await syncFor(primary);
        if (result.kind !== "success" || result.counts.newActivities !== 1 || result.counts.attemptedActivities !== 1) throw new Error("sync_invalid");
        return { count: result.counts.newActivities, evidence: result.counts };
      });
      await observe("canonical-json", async () => {
        const rows = await primary.queryAll<{ payload_json: string; sha256: string }>("SELECT payload_json, sha256 FROM imported_activity_payloads WHERE activity_id = ?", [importedId!]);
        if (rows.length !== 1 || await sha256(rows[0]!.payload_json) !== rows[0]!.sha256
          || canonicalJson(JSON.parse(rows[0]!.payload_json)) !== rows[0]!.payload_json) throw new Error("canonical_invalid");
        return { count: rows.length, evidence: { sha256: rows[0]!.sha256 } };
      });
      await observe("dedupe-restart", async () => {
        await close(primary); primary = await open(primaryName);
        const result = await syncFor(primary);
        if (result.kind !== "success" || result.counts.unchangedActivities !== 1 || result.counts.newActivities !== 0) throw new Error("restart_dedupe_invalid");
        return { count: result.counts.unchangedActivities, evidence: result.counts };
      });
      const archive = await createLogicalBackupRepository(primary).collect({ snapshotId: `v12-${nonce}-archive`, createdAtMs: 2 });
      await observe("dedupe-restore", async () => {
        const restored = await open(restoreName);
        await createLogicalRestoreRepository(restored, { nowMs: () => 3 }).restore(archive);
        const result = await syncFor(restored);
        const rows = await restored.queryAll("SELECT id, activity_id, request_sha256, committed_at_ms FROM imported_activity_receipts ORDER BY id");
        if (result.kind !== "success" || result.counts.unchangedActivities !== 1 || rows.length !== 1) throw new Error("restore_dedupe_invalid");
        return { count: rows.length, evidence: { receipt_sha256: await sha256(canonicalJson(rows)) } };
      });
      await observe("dedupe-merge", async () => {
        const merged = await open(mergeName);
        await createLogicalRestoreRepository(merged, { nowMs: () => 4 }).restore(baseline);
        const local = await createSqliteMergeLocalFactsPort(merged).read();
        const plan = await buildPortableMergePlan({
          archive: { version: 2 as const, schemaVersion: archive.schemaVersion, tables: archive.tables },
          local: { version: 2 as const, schemaVersion: local.schemaVersion, tables: local.tables },
          payloadDigest: sha256,
        });
        await createFullPlanLogicalMergeWriter(merged, { sha256, nowMs: () => 5 }).commitFullPlan({
          localFingerprint: await sha256(canonicalMergeValue(local)), plan,
        });
        const result = await syncFor(merged);
        const rows = await merged.queryAll("SELECT id, activity_id, request_sha256, committed_at_ms FROM imported_activity_receipts ORDER BY id");
        if (result.kind !== "success" || result.counts.unchangedActivities !== 1 || rows.length !== 1) throw new Error("merge_dedupe_invalid");
        return { count: rows.length, evidence: { receipt_sha256: await sha256(canonicalJson(rows)) } };
      });
      if (!importedId || !importedDate) throw new V12GarminDomainError("sync_read_failed");
      await collectMatches(primary, importedId, importedDate, observe);
      // runAdversarialSuite clears the Chaquopy module-level bridge client. It
      // must run only after every real account read, sync, dedupe and match.
      const adversarial = parseAdversarial(await native.runAdversarialSuite({
        confirmation: "VERIFY-PHASE18-GARMIN-ADVERSARIAL",
        deviceIdentitySha256: sessionSha256,
      }), lifecycle.recovery_extensions);
      hostObservations = Object.freeze({
        bridge: Object.freeze({
          evidence_source: lifecycle.evidence_source,
          operations: lifecycle.bridge_operations,
          operation_rejection: lifecycleCodes.operation_rejection,
          arguments_rejection: lifecycleCodes.arguments_rejection,
        }),
        lifecycle: Object.freeze({
          restore: lifecycleCodes.restore, refresh: lifecycleCodes.refresh,
          cold_restore: lifecycleCodes.cold_restore, logout: lifecycleCodes.logout,
          restored: lifecycleCodes.restored, rotation: lifecycleCodes.rotation,
          restart: lifecycleCodes.restart, storage: lifecycleCodes.storage,
          before_sha256: lifecycle.before_sha256, refreshed_sha256: lifecycle.refreshed_sha256,
          restored_sha256: lifecycle.restored_sha256,
        }),
        recovery: adversarial.cases,
      });
      await observe("recovery", async () => ({ count: ADVERSARIAL_CASES.length, evidence: { cases: adversarial.cases } }));
      const ordered = CASE_IDS.map((id) => receipts.get(id));
      if (ordered.some((entry) => entry === undefined)) throw new V12GarminDomainError("receipt_set_failed");
      terminal = {
        schema_version: 2,
        nonce,
        kind: "garmin",
        receipts: ordered,
        host_observations: hostObservations,
        cleanup: { arm: "pending", databases_deleted: databaseNames.length },
      };
    }
  } catch (error) {
    const code = error instanceof V12GarminDomainError ? error.code : "domain_failed";
    terminal = { schema_version: 2, nonce, kind: "error", code };
  } finally {
    stopHeartbeat();
    for (const kernel of [...activeKernels]) {
      try { await close(kernel); } catch { cleanupFailure = "database_cleanup_failed"; }
    }
    for (const databaseName of [...new Set(databaseNames)]) {
      try { await deleteDatabaseAsync(databaseName); } catch { cleanupFailure = "database_cleanup_failed"; }
    }
    if (armConsumed) {
      try {
        const completion = record(await native.completeV12EvidenceArm(), "arm_cleanup_failed");
        if (!exact(completion, ["schema_version", "code", "receipt_sha256"])
          || completion.schema_version !== 1 || completion.code !== "arm-cleared"
          || typeof completion.receipt_sha256 !== "string" || !HASH.test(completion.receipt_sha256)) cleanupFailure = "arm_cleanup_failed";
      } catch { cleanupFailure = "arm_cleanup_failed"; }
    }
  }
  active();
  if (cleanupFailure !== undefined) terminal = { schema_version: 2, nonce, kind: "error", code: cleanupFailure };
  if (terminal.kind === "garmin") terminal = {
    ...terminal,
    cleanup: { arm: "cleared", databases_deleted: new Set(databaseNames).size },
  };
  try { noPrivate(terminal); }
  catch { terminal = { schema_version: 2, nonce, kind: "error", code: "privacy_failed" }; }
  let serialized = JSON.stringify(terminal);
  if (serialized.length <= 2_000) {
    emit(`GYM_TRACKER_V12_DOMAIN_RESULT:${serialized}`);
    return;
  }
  let chunks = Array.from({ length: Math.ceil(serialized.length / 1_500) }, (_, index) =>
    serialized.slice(index * 1_500, (index + 1) * 1_500));
  if (chunks.length > 16) {
    terminal = { schema_version: 2, nonce, kind: "error", code: "result_too_large" };
    serialized = JSON.stringify(terminal); chunks = [serialized];
  }
  for (const [index, data] of chunks.entries()) {
    emit(`GYM_TRACKER_V12_DOMAIN_RESULT_CHUNK:${JSON.stringify({ schema_version: 2, nonce, kind: "chunk", sequence: index + 1, total: chunks.length, data })}`);
  }
  emit(`GYM_TRACKER_V12_DOMAIN_RESULT:${JSON.stringify({ schema_version: 2, nonce, kind: "chunked", total: chunks.length, sha256: await sha256(serialized) })}`);
}
