import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
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
function driver() {
  return {
    runtimeInfo: async () => ({ schemaVersion: 1, pythonVersion: "3.13", clientVersion: "0.3.17", clientCommit: "218e72ca5459e014435fc2d94fd18bd601fa0c14", abi: "arm64-v8a", capabilities: ["runtimeInfo"], benchmark: { processId: 1, installedApkSizeBytes: 100, garminModuleSizeBytes: 50, pythonStartupKind: "cold", pythonStartupDurationMs: 1, observedAtMonotonicMs: 1 } }),
    connectionState: async () => success({ kind: "connected", account_namespace: "garmin:abcdefabcdefabcdefabcdefabcdefab" }),
    restoreSession: async () => success({ kind: "connected", account_namespace: "garmin:abcdefabcdefabcdefabcdefabcdefab" }),
    login: async () => { throw new Error("must_not_login"); },
    resumeMfa: async () => { throw new Error("must_not_mfa"); },
    logout: async () => { throw new Error("must_not_logout"); },
    forceRefreshForTest: async () => success({ kind: "connected" }),
    sessionRecordState: async () => ({ present: true }),
    getActivities: async () => success({ items: [{ activityId: 12345, activityType: { typeKey: "running" } }] }),
    getActivity: async () => success({ activityId: 12345, activityTypeDTO: { typeKey: "running" }, summaryDTO: { startTimeGMT: "2026-01-01T00:00:00.000Z", startTimeLocal: "2026-01-01T08:00:00", timeZoneId: "Asia/Singapore", distance: 5_000, duration: 1_500, elapsedDuration: 1_560, movingDuration: 1_475, averageHR: 152 } }),
    getActivitySplits: async () => success({ lapDTOs: [] }),
    getActivityDetails: async () => success({ metricDescriptors: [], activityDetailMetrics: [] }),
    runAdversarialSuite: async () => { throw new Error("must_not_substitute_adversarial_fixture"); },
  };
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
test("missing installed session emits auth_required only and opens no database", async () => {
  jest.mocked(getGarminConnectNativeModule).mockReturnValue({ ...driver(), restoreSession: async () => success({ kind: "disconnected" }) });
  const lines: string[] = []; await collectV12ProductionGarminDomain(identity, (line) => lines.push(line), { aborted: false });
  expect(lines).toEqual([`GYM_TRACKER_V12_DOMAIN_RESULT:${JSON.stringify({ schema_version: 1, nonce: identity.nonce, kind: "error", code: "auth_required" })}`]);
  expect(openSqliteKernel).not.toHaveBeenCalled();
});
test("real SQLite sync, canonical reads, reopen dedupe and matching produce aggregate outcomes", async () => {
  const lines: string[] = []; await collectV12ProductionGarminDomain(identity, (line) => lines.push(line), { aborted: false });
  const result = JSON.parse(lines.at(-1)!.split("GYM_TRACKER_V12_DOMAIN_RESULT:")[1]!);
  expect(result.cases).toHaveLength(18);
  expect(result.cases.filter((entry: { status: string }) => entry.status === "FAIL")).toEqual([]);
  expect(result.cases.filter((entry: { status: string }) => entry.status === "NOT_RUN").map((entry: { id: string }) => entry.id)).toEqual(["bridge-allowlist", "account-lifecycle", "recovery", "dedupe-restore", "dedupe-merge", "match-cancel"]);
  expect(openSqliteKernel).toHaveBeenCalledTimes(2);
  expect(deleteDatabaseAsync).toHaveBeenCalledTimes(1);
  expect(lines.join("\n")).not.toMatch(/garmin:abcdef|averageHR|12345|payload_json/u);
});
test("cancelled producer emits no result and never opens a database", async () => {
  const emit = jest.fn(); await expect(collectV12ProductionGarminDomain(identity, emit, { aborted: true })).rejects.toThrow("domain_cancelled");
  expect(emit).not.toHaveBeenCalled(); expect(openSqliteKernel).not.toHaveBeenCalled();
  expect(getGarminConnectNativeModule).not.toHaveBeenCalled();
});
