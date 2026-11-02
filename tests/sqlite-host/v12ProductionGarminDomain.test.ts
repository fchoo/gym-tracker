import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { getGarminConnectNativeModule } from "../../modules/garmin-connect/src";
import { collectV12ProductionGarminDomain, v12ProductionGarminEnabled } from "../../src/bootstrap/v12ProductionGarminDomain";
import { openSqliteKernel } from "../../src/platform/sqlite";
import { configureSqliteConnection, type SqliteConnection } from "../../src/platform/sqlite/connection";
import { createSqliteKernel } from "../../src/platform/sqlite/sqliteKernel";
import { deleteDatabaseAsync } from "expo-sqlite";

jest.mock("expo-crypto", () => ({ CryptoDigestAlgorithm: { SHA256: "sha256" }, digestStringAsync: async (_algorithm: string, value: string) => require("node:crypto").createHash("sha256").update(value).digest("hex") }));
jest.mock("expo-sqlite", () => ({ deleteDatabaseAsync: jest.fn() }));
jest.mock("../../src/platform/sqlite", () => ({ openSqliteKernel: jest.fn() }));
jest.mock("../../modules/garmin-connect/src", () => {
  const actual = jest.requireActual("../../modules/garmin-connect/src") as object;
  return { ...actual, getGarminConnectNativeModule: jest.fn() };
});
jest.mock("expo-modules-core", () => ({ requireNativeModule: jest.fn() }));

const identity = { packageName: "com.fchoo.gymtracker.devtest", buildProfile: "development-test", nativeContractsEnabled: true, suite: "v1.2-acceptance", confirmation: "VERIFY-V12-DOMAIN", nonce: "a".repeat(32) };
let directory: string;
let databases: DatabaseSync[];
const success = (data: unknown) => ({ status: "ok", generation: 1, data });
const hash = "a".repeat(64);
const adversarial = [
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
] as const;
const adversarialCalls: Readonly<Record<string, number>> = {
  "PH18-ADV-READ": 4, "PH18-ADV-EXPIRED": 2, "PH18-ADV-401": 2,
  "PH18-ADV-TRUNCATED": 4, "PH18-ADV-UNSUPPORTED-JSON": 5,
  "PH18-ADV-MISSING-COMPONENT": 3, "PH18-ADV-PARTIAL-PAGE": 5, "PH18-ADV-ROTATION": 3,
};
function driver({
  operations,
  failReadsAfterAdversarial = false,
}: Readonly<{
  operations?: string[];
  failReadsAfterAdversarial?: boolean;
}> = {}) {
  let adversarialRan = false;
  const recordOperation = (operation: string) => operations?.push(operation);
  const assertRealBridgeAvailable = (operation: string) => {
    recordOperation(operation);
    if (failReadsAfterAdversarial && adversarialRan) throw new Error("real_bridge_cleared_by_adversarial_suite");
  };
  return {
    runtimeInfo: async () => ({ schemaVersion: 1, pythonVersion: "3.13", clientVersion: "0.3.17", clientCommit: "218e72ca5459e014435fc2d94fd18bd601fa0c14", abi: "arm64-v8a", capabilities: ["runtimeInfo"], benchmark: { processId: 1, installedApkSizeBytes: 100, garminModuleSizeBytes: 50, pythonStartupKind: "cold", pythonStartupDurationMs: 1, observedAtMonotonicMs: 1 } }),
    connectionState: async () => success({ kind: "connected", account_namespace: "garmin:abcdefabcdefabcdefabcdefabcdefab" }),
    restoreSession: async () => { recordOperation("restoreSession"); return success({ kind: "connected", account_namespace: "garmin:abcdefabcdefabcdefabcdefabcdefab" }); },
    login: async () => { throw new Error("must_not_login"); },
    resumeMfa: async () => { throw new Error("must_not_mfa"); },
    logout: async () => { throw new Error("must_not_logout"); },
    forceRefreshForTest: async () => success({ kind: "connected" }),
    sessionRecordState: async () => ({ present: true, version: 1, sha256: hash }),
    consumeV12EvidenceArm: async () => ({ schema_version: 1, code: "arm-consumed", receipt_sha256: hash }),
    runV12StoredSessionLifecycle: async () => { recordOperation("runV12StoredSessionLifecycle"); return ({
      schema_version: 1,
      evidence_source: "installed-chaquopy",
      bridge_operations: ["connectionState", "login", "resumeMfa", "restoreSession", "logout", "getActivities", "getActivity", "getActivitySplits", "getActivityDetails", "forceRefreshForTest", "runAdversarialSuite"],
      codes: {
        restore: "connected", refresh: "connected", cold_restore: "connected",
        logout: "disconnected", restored: "connected", rotation: "rotated",
        restart: "same-account", storage: "no-backup-encrypted",
        operation_rejection: "operation_rejected", arguments_rejection: "arguments_rejected",
      },
      before_sha256: hash, refreshed_sha256: "b".repeat(64), restored_sha256: "c".repeat(64),
      recovery_extensions: adversarial.filter(([id]) => ["PH18-ADV-EXPIRED", "PH18-ADV-401", "PH18-ADV-TRUNCATED", "PH18-ADV-UNSUPPORTED-JSON"].includes(id)).map(([id, code]) => ({ id, code, call_count: adversarialCalls[id] ?? 1, automatic_retry_count: 0, retry_after_ms: 0 })),
    }); },
    completeV12EvidenceArm: async () => ({ schema_version: 1, code: "arm-cleared", receipt_sha256: hash }),
    getActivities: async () => { assertRealBridgeAvailable("getActivities"); return success({ items: [{ activityId: 12345, activityType: { typeKey: "running" } }] }); },
    getActivity: async () => { assertRealBridgeAvailable("getActivity"); return success({ activityId: 12345, activityTypeDTO: { typeKey: "running" }, summaryDTO: { startTimeGMT: "2026-01-01T00:00:00.000Z", startTimeLocal: "2026-01-01T08:00:00", timeZoneId: "Asia/Singapore", distance: 5_000, duration: 1_500, elapsedDuration: 1_560, movingDuration: 1_475, averageHR: 152 } }); },
    getActivitySplits: async () => { assertRealBridgeAvailable("getActivitySplits"); return success({ lapDTOs: [] }); },
    getActivityDetails: async () => { assertRealBridgeAvailable("getActivityDetails"); return success({ metricDescriptors: [], activityDetailMetrics: [] }); },
    runAdversarialSuite: async () => { recordOperation("runAdversarialSuite"); adversarialRan = true; return ({
      schema_version: 1, suite: "phase18-garmin-adversarial", status: "passed",
      cases: adversarial.filter(([id]) => !["PH18-ADV-EXPIRED", "PH18-ADV-401", "PH18-ADV-TRUNCATED", "PH18-ADV-UNSUPPORTED-JSON"].includes(id)).map(([id, code]) => ({ id, code, call_count: adversarialCalls[id] ?? 1, automatic_retry_count: 0, retry_after_ms: id === "PH18-ADV-429" ? 900_000 : 0 })),
    }); },
  };
}
function terminal(lines: readonly string[]): Record<string, unknown> {
  const result = JSON.parse(lines.at(-1)!.split("GYM_TRACKER_V12_DOMAIN_RESULT:")[1]!);
  if (result.kind !== "chunked") return result;
  const chunks = lines.filter((line) => line.startsWith("GYM_TRACKER_V12_DOMAIN_RESULT_CHUNK:"))
    .map((line) => JSON.parse(line.split("GYM_TRACKER_V12_DOMAIN_RESULT_CHUNK:")[1]!))
    .sort((left, right) => left.sequence - right.sequence);
  expect(chunks).toHaveLength(result.total);
  return JSON.parse(chunks.map(({ data }) => data).join(""));
}

beforeEach(() => {
  jest.clearAllMocks(); directory = mkdtempSync(path.join(tmpdir(), "v12-domain-sqlite-")); databases = [];
  jest.mocked(getGarminConnectNativeModule).mockReturnValue(driver());
  jest.mocked(openSqliteKernel).mockImplementation(async (name) => {
    const database = new DatabaseSync(path.join(directory, name)); databases.push(database); let closed = false;
    const connection: SqliteConnection = {
      execAsync: async (sql) => { database.exec(sql); },
      prepareAsync: async (sql) => {
        const statement = database.prepare(sql);
        return { executeAsync: async <Row extends Record<string, unknown>>(parameters: readonly (null | number | string | Uint8Array)[]) => {
          if (statement.columns().length) {
            const rows = statement.all(...parameters) as Row[];
            return { changes: 0, lastInsertRowId: 0, getAllAsync: async () => rows };
          }
          const result = statement.run(...parameters);
          return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid), getAllAsync: async () => [] as Row[] };
        }, finalizeAsync: async () => undefined };
      },
      isInTransactionAsync: async () => database.isTransaction,
      closeAsync: async () => { if (!closed) { database.close(); closed = true; } },
    };
    await configureSqliteConnection(connection, { enableWal: false });
    return createSqliteKernel({ reader: connection, writer: connection });
  });
  jest.mocked(deleteDatabaseAsync).mockImplementation(async (name) => { rmSync(path.join(directory, name), { force: true }); });
});
afterEach(() => { for (const database of databases) { try { database.close(); } catch { /* already closed by producer */ } } rmSync(directory, { recursive: true, force: true }); });

test("gate rejects production, wrong suite, arrays and missing confirmation before native calls", async () => {
  for (const change of [{ buildProfile: "production" }, { suite: "phase16-calendar" }, { nonce: [identity.nonce] }, { confirmation: undefined }, { nativeContractsEnabled: false }]) {
    expect(v12ProductionGarminEnabled({ ...identity, ...change })).toBe(false);
    await expect(collectV12ProductionGarminDomain({ ...identity, ...change }, () => undefined, { aborted: false })).rejects.toThrow("domain_disabled");
  }
  expect(getGarminConnectNativeModule).not.toHaveBeenCalled();
});
test("production Garmin route is isolated in root layout before the normal workout runtime", () => {
  const layout = readFileSync("app/_layout.tsx", "utf8");
  const routeGate = layout.indexOf('pathname === "/__v12-production-garmin"');
  const isolatedNavigator = layout.lastIndexOf("<V12ProductionGarminNavigator");
  const normalRuntime = layout.indexOf("<WorkoutAppRuntimeProvider");
  expect(routeGate).toBeGreaterThan(0);
  expect(isolatedNavigator).toBeGreaterThan(routeGate);
  expect(normalRuntime).toBeGreaterThan(isolatedNavigator);
});
test.each(["missing", "corrupt", "expired"])("%s installed session emits exact auth_required before evidence databases", async (kind) => {
  jest.mocked(getGarminConnectNativeModule).mockReturnValue({
    ...driver(),
    restoreSession: async () => kind === "missing"
      ? success({ kind: "disconnected" })
      : { status: "error", error: { code: "sign_in_required" } },
  });
  const lines: string[] = []; await collectV12ProductionGarminDomain(identity, (line) => lines.push(line), { aborted: false });
  expect(lines.at(-1)).toBe(`GYM_TRACKER_V12_DOMAIN_RESULT:${JSON.stringify({ schema_version: 2, nonce: identity.nonce, kind: "error", code: "auth_required" })}`);
  expect(openSqliteKernel).not.toHaveBeenCalled();
  expect(deleteDatabaseAsync).not.toHaveBeenCalled();
});
test("real SQLite sync, restore, merge, dedupe and matching emit 17 operation receipts without app-authored status", async () => {
  const lines: string[] = []; await collectV12ProductionGarminDomain(identity, (line) => lines.push(line), { aborted: false });
  const result = terminal(lines);
  const chunks = lines.filter((line) => line.startsWith("GYM_TRACKER_V12_DOMAIN_RESULT_CHUNK:"));
  expect(chunks.length).toBeGreaterThan(1);
  expect(chunks.every((line) => line.length < 2_000)).toBe(true);
  expect(result.schema_version).toBe(2);
  expect(result.code).toBeUndefined();
  expect(result).toMatchObject({ kind: "garmin" });
  const receipts = result.receipts as Array<Record<string, unknown> & { id: string }>;
  expect(receipts).toHaveLength(17);
  expect(receipts.map((entry) => entry.id)).toEqual([
    "packaging", "bridge-allowlist", "canonical-json", "sync-read", "account-lifecycle", "recovery",
    "dedupe-restart", "dedupe-restore", "dedupe-merge", "match-zero", "match-one", "match-many",
    "match-stale", "match-alternate", "match-cancel", "match-confirm", "match-reassign",
  ]);
  expect(receipts.every((entry) => !Object.hasOwn(entry, "status")
    && Object.keys(entry).sort().join(",") === "code,count,id,order,receipt_sha256")).toBe(true);
  expect(JSON.stringify(result)).not.toMatch(/"status"/u);
  expect(result.cleanup).toEqual(expect.objectContaining({ arm: "cleared", databases_deleted: 3 }));
  expect(openSqliteKernel).toHaveBeenCalledTimes(4);
  expect(deleteDatabaseAsync).toHaveBeenCalledTimes(3);
  expect(lines.join("\n")).not.toMatch(/garmin:abcdef|averageHR|12345|payload_json/u);
});
test("real account reads and sync finish before the adversarial bridge stage clears its client", async () => {
  const operations: string[] = [];
  jest.mocked(getGarminConnectNativeModule).mockReturnValue(driver({
    operations,
    failReadsAfterAdversarial: true,
  }));

  const lines: string[] = [];
  await collectV12ProductionGarminDomain(identity, (line) => lines.push(line), { aborted: false });

  expect(terminal(lines)).toMatchObject({ kind: "garmin" });
  const adversarialIndex = operations.indexOf("runAdversarialSuite");
  expect(adversarialIndex).toBeGreaterThan(operations.lastIndexOf("getActivityDetails"));
  expect(operations.slice(adversarialIndex + 1)).not.toEqual(expect.arrayContaining([
    "restoreSession", "getActivities", "getActivity", "getActivitySplits", "getActivityDetails",
  ]));
});
test("cancelled producer emits no result and never opens a database", async () => {
  const emit = jest.fn(); await expect(collectV12ProductionGarminDomain(identity, emit, { aborted: true })).rejects.toThrow("domain_cancelled");
  expect(emit).not.toHaveBeenCalled(); expect(openSqliteKernel).not.toHaveBeenCalled();
  expect(getGarminConnectNativeModule).not.toHaveBeenCalled();
});
