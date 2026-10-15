import { CryptoDigestAlgorithm, digestStringAsync } from "expo-crypto";
import { deleteDatabaseAsync } from "expo-sqlite";

import { getGarminConnectNativeModule, readGarminRuntimeInfo } from "../../modules/garmin-connect/src";
import { canonicalJson } from "../domains/activities/importContracts";
import { confirmRunningActivityMatch, prepareRunningActivityMatchInput, queryRunningActivityMatchCandidates } from "../domains/running/activityMatchCommands";
import { createGarminActivityAdapter } from "../platform/garmin/garminActivityAdapter";
import { createGarminSharedImportCommitter, createGarminSyncCoordinator } from "../platform/garmin/garminSyncCoordinator";
import { normalizeGarminActivity } from "../platform/garmin/normalizeGarminActivity";
import { openSqliteKernel, type SqliteKernel } from "../platform/sqlite";
import { createMigrationRunner } from "../platform/sqlite/migrationRunner";
import { migrations } from "../platform/sqlite/migrations";
import { createImportedActivityRepository } from "../platform/sqlite/repositories/importedActivityRepository";
import { createRunningActivityMatchRepository } from "../platform/sqlite/repositories/runningActivityMatchRepository";
import { createRunningPlanRepository } from "../platform/sqlite/repositories/runningPlanRepository";

const IDS = ["packaging", "bridge-allowlist", "canonical-json", "sync-read", "account-lifecycle", "recovery", "dedupe-restart", "dedupe-restore", "dedupe-merge", "match-zero", "match-one", "match-many", "match-stale", "match-alternate", "match-cancel", "match-confirm", "match-reassign", "privacy"] as const;
type Id = typeof IDS[number];
type Observation = { id: Id; order: number; status: "PASS" | "FAIL" | "NOT_RUN"; code: string; count: number };
type Identity = Readonly<{ packageName?: unknown; buildProfile?: unknown; nativeContractsEnabled?: unknown; suite?: unknown; confirmation?: unknown; nonce?: unknown }>;
const sha256 = (value: string) => digestStringAsync(CryptoDigestAlgorithm.SHA256, value);
const assert = (value: boolean): void => { if (!value) throw new Error("observation_failed"); };

export function v12ProductionGarminEnabled(value: Identity): boolean {
  return value.packageName === "com.fchoo.gymtracker.devtest" && value.buildProfile === "development-test"
    && value.nativeContractsEnabled === true && value.suite === "v1.2-acceptance"
    && value.confirmation === "VERIFY-V12-DOMAIN" && typeof value.nonce === "string" && /^[a-f0-9]{32}$/u.test(value.nonce);
}

/** A standalone, gated native producer. Account access is restored only from the
 * installed native encrypted session. Credentials never cross ADB or logcat.
 * Unexercised concerns remain NOT_RUN; successful reads cannot certify them.
 */
export async function collectV12ProductionGarminDomain(
  identity: Identity,
  emit: (line: string) => void,
  signal: Readonly<{ aborted: boolean }>,
): Promise<void> {
  if (!v12ProductionGarminEnabled(identity)) throw new Error("domain_disabled");
  const nonce = identity.nonce as string;
  const cases: Observation[] = IDS.map((id, order) => ({ id, order, status: "NOT_RUN", code: "instrumentation-unavailable", count: 0 }));
  let progress = 0;
  const active = () => { if (signal.aborted) throw new Error("domain_cancelled"); };
  const send = (value: object) => { active(); emit(`GYM_TRACKER_V12_DOMAIN_RESULT:${JSON.stringify({ schema_version: 1, nonce, ...value })}`); };
  const observe = async (id: Id, operation: () => Promise<number>) => {
    active(); emit(`GYM_TRACKER_V12_DOMAIN_PROGRESS:${JSON.stringify({ schema_version: 1, nonce, sequence: ++progress })}`);
    const entry = cases[IDS.indexOf(id)]!;
    try { entry.count = await operation(); active(); entry.status = "PASS"; entry.code = "observed"; }
    catch { active(); entry.status = "FAIL"; entry.code = "observation-failed"; entry.count = 0; }
  };
  active();
  const native = getGarminConnectNativeModule();
  let namespace: string | undefined;
  const source = createGarminActivityAdapter({
    driver: native,
    mapper: { fromActivity: (activity) => {
      if (!namespace) throw new Error("auth_required");
      return normalizeGarminActivity({ ...activity, account_namespace: namespace }, sha256);
    } },
  });
  // Authentication absence is a terminal bounded failure, not eighteen made-up cases.
  try {
    const state = await source.restoreSession();
    active();
    if (state.kind !== "connected") { send({ kind: "error", code: "auth_required" }); return; }
    namespace = state.account_namespace;
  } catch (error) {
    active();
    const code = error !== null && typeof error === "object" && "code" in error ? error.code : undefined;
    send({ kind: "error", code: code === "sign_in_required" || code === "invalid_credentials" || code === "mfa_expired" ? "auth_required" : "domain_failed" }); return;
  }
  await observe("packaging", async () => { await readGarminRuntimeInfo(native); return 1; });
  const databaseName = `v12-production-garmin-${nonce}.db`;
  let kernel: SqliteKernel | undefined;
  let importedId: string | undefined;
  let importedDate: string | undefined;
  try {
    kernel = await openSqliteKernel(databaseName);
    await createMigrationRunner({ databaseName, kernel, migrations, recoveryBackup: {
      async createAndValidate(request) {
        if (request.databaseName !== databaseName || request.fromVersion !== 0) throw new Error("database_not_empty");
        return { ...request, backupId: `${nonce}:empty`, validated: true as const };
      },
    } }).run();
    const sync = () => createGarminSyncCoordinator({
      source, limits: { pageSize: 1, maxPages: 1, maxActivities: 1 },
      importActivity: createGarminSharedImportCommitter({ repository: createImportedActivityRepository(kernel!), sha256,
        requestFor: async (prepared) => {
          const digest = await sha256(canonicalJson(prepared.envelope));
          const date = prepared.envelope.normalized.source_local_date_time?.slice(0, 10);
          if (!date) throw new Error("date_confirmation_required");
          importedId = `activity-${digest.slice(0, 32)}`; importedDate = date;
          return { requestId: `v12-${digest}`, requestSha256: digest, activityId: importedId, expectedAggregateRevision: 0, confirmedLocalDate: date };
        },
      }),
    }).syncNow({ isCancelled: () => signal.aborted });
    await observe("sync-read", async () => {
      const result = await sync();
      assert(result.kind === "success" && result.counts.newActivities === 1 && result.counts.attemptedActivities === 1);
      return result.counts.newActivities;
    });
    if (cases[IDS.indexOf("sync-read")]!.status === "PASS") {
      await observe("canonical-json", async () => {
        const rows = await kernel!.queryAll<{ payload_json: string; sha256: string }>("SELECT payload_json, sha256 FROM imported_activity_payloads WHERE activity_id = ?", [importedId!]);
        assert(rows.length === 1 && await sha256(rows[0]!.payload_json) === rows[0]!.sha256);
        assert(canonicalJson(JSON.parse(rows[0]!.payload_json)) === rows[0]!.payload_json);
        return rows.length;
      });
      await observe("dedupe-restart", async () => {
        await kernel!.close(); kernel = undefined;
        kernel = await openSqliteKernel(databaseName);
        const result = await sync();
        assert(result.kind === "success" && result.counts.unchangedActivities === 1 && result.counts.newActivities === 0);
        return result.counts.unchangedActivities;
      });
      await collectMatches(kernel!, importedId!, importedDate!, observe);
    }
  } finally {
    try { await kernel?.close(); }
    finally { await deleteDatabaseAsync(databaseName); }
  }
  await observe("privacy", async () => {
    assert(cases.every((entry) => Object.keys(entry).length === 5 && /^[a-z0-9-]+$/u.test(entry.code) && Number.isSafeInteger(entry.count)));
    return cases.length;
  });
  send({ kind: "garmin", cases });
}

async function collectMatches(kernel: SqliteKernel, activityId: string, localDate: string, observe: (id: Id, operation: () => Promise<number>) => Promise<void>) {
  const repository = createRunningActivityMatchRepository(kernel);
  const candidates = () => queryRunningActivityMatchCandidates(repository, activityId);
  await observe("match-zero", async () => { assert((await candidates()).kind === "no_candidates"); return 0; });
  const weekday = (["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const)[new Date(`${localDate}T12:00:00Z`).getUTCDay()]!;
  async function seed(prefix: string) {
    const plans = createRunningPlanRepository(kernel);
    await plans.createInactiveMinimum({ planId: `${prefix}-plan`, planName: "Running", anchorDayId: `${prefix}-day`, scheduleId: `${prefix}-schedule`, scheduleVersionId: `${prefix}-version`, scheduleBindingId: `${prefix}-binding`, createdAtMs: 1_000, effectiveLocalDate: localDate, timezone: "UTC", recoveryRevisionId: `${prefix}-session`, slots: [{ id: `${prefix}-slot`, weekday, ordinal: 0, sessionRevisionId: `${prefix}-session` }] });
    await plans.activateMinimum({ planId: `${prefix}-plan`, scheduleId: `${prefix}-schedule`, expectedPlanRevision: 1, expectedScheduleRevision: 1, activatedAtMs: 2_000 });
    await plans.materializeOccurrences({ planId: `${prefix}-plan`, scheduleId: `${prefix}-schedule`, scheduleVersionId: `${prefix}-version`, localDate, timezone: "UTC", createdAtMs: 3_000, occurrenceIds: [`${prefix}-opportunity`] });
  }
  await observe("match-one", async () => { await seed("v12-one"); const result = await candidates(); assert(result.kind === "ready" && result.candidates.length === 1); return result.kind === "ready" ? result.candidates.length : 0; });
  await observe("match-many", async () => {
    const nextWeek = new Date(`${localDate}T12:00:00Z`); nextWeek.setUTCDate(nextWeek.getUTCDate() + 7);
    await createRunningPlanRepository(kernel).materializeOccurrences({ planId: "v12-one-plan", scheduleId: "v12-one-schedule", scheduleVersionId: "v12-one-version", localDate: nextWeek.toISOString().slice(0, 10), timezone: "UTC", createdAtMs: 3_500, occurrenceIds: ["v12-two-opportunity"] });
    const result = await candidates(); assert(result.kind === "ready" && result.candidates.length === 2); return result.kind === "ready" ? result.candidates.length : 0;
  });
  await observe("match-stale", async () => {
    const result = await candidates(); if (result.kind !== "ready") throw new Error("candidates_missing");
    const input = await prepareRunningActivityMatchInput({ action: "match", candidate: { ...result.candidates[0]!, expectedActivityRevision: 999 }, requestId: "v12-stale", occurredAtMs: 4_000 }, sha256);
    assert((await confirmRunningActivityMatch(repository, input)).kind === "conflict"); return 1;
  });
  await observe("match-alternate", async () => { const result = await candidates(); assert(result.kind === "ready" && new Set(result.candidates.map((c) => c.opportunityId)).size === 2); return 2; });
  // Cancellation at the UI is intentionally NOT_RUN: a no-op cannot prove it.
  await observe("match-confirm", async () => {
    const result = await candidates(); if (result.kind !== "ready") throw new Error("candidates_missing");
    const input = await prepareRunningActivityMatchInput({ action: "match", candidate: result.candidates[0]!, requestId: "v12-confirm", occurredAtMs: 5_000 }, sha256);
    assert((await confirmRunningActivityMatch(repository, input)).kind === "matched"); return 1;
  });
  await observe("match-reassign", async () => {
    const result = await candidates(); if (result.kind !== "already_matched") throw new Error("match_missing");
    const next = result.candidates.find((c) => c.opportunityId !== result.opportunityId); if (!next) throw new Error("alternate_missing");
    const input = await prepareRunningActivityMatchInput({ action: "reassign", candidate: { ...next, expectedRelationRevision: result.relationRevision }, expectedCurrentOpportunityId: result.opportunityId, requestId: "v12-reassign", occurredAtMs: 6_000 }, sha256);
    assert((await confirmRunningActivityMatch(repository, input)).kind === "reassigned"); return 1;
  });
}
