import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { createHash } from "node:crypto";
import * as commandsModule from "../domains/portability/restoreCommands";
import * as repositoryModule from "../platform/sqlite/repositories/logicalRestoreRepository";
import * as kernelModule from "../platform/sqlite/sqliteKernel";
import * as cryptoModule from "../platform/crypto/aesGcmArchivePort";
import * as kdfModule from "../platform/crypto/passwordKdf";
import { logicalBackupTablesForVersion, type LogicalBackupSnapshot } from "../domains/portability/backupContracts";
import type { SqliteKernel } from "../platform/sqlite/sqliteKernel";
import {
  executeRollbackBridge, productionRollbackPorts, rollbackNativeEnabled, validateRollbackArm, collectNativeRollbackBridge,
  type RollbackArm, type RollbackBridgePorts,
} from "./v12NativeRollbackBridge";

jest.mock("../platform/sqlite/migrations", () => ({ CURRENT_SCHEMA_VERSION: 47,
  migrations: [{ version: 22, up: async () => {}, verify: async () => {} }] }));
const mockFiles = new Map<string, Uint8Array>();
const mockPath = "private-files";
class MockFile {
  readonly path: string;
  constructor(...parts: unknown[]) {
    if (parts[0] === "/native-sqlite") throw new Error("native_file_uri_required");
    this.path = parts.join("/");
  }
  get exists() { return mockFiles.has(this.path); }
  textSync() { return new TextDecoder().decode(mockFiles.get(this.path)!); }
  bytesSync() { return mockFiles.get(this.path)!.slice(); }
  move(other: MockFile) { mockFiles.set(other.path, mockFiles.get(this.path)!); mockFiles.delete(this.path); }
  write(value: string | Uint8Array) { mockFiles.set(this.path, typeof value === "string" ? new TextEncoder().encode(value) : value); }
}
jest.mock("expo-file-system", () => ({ File: (..._args: unknown[]) => undefined, Paths: { document: "private-files" } }));
jest.mock("expo-sqlite", () => ({ defaultDatabaseDirectory: "/native-sqlite", deleteDatabaseAsync: jest.fn<() => Promise<void>>() }));
jest.mock("expo-crypto", () => ({ CryptoDigestAlgorithm: { SHA256: "SHA256" },
  digest: jest.fn(async () => new Uint8Array([0, 1, 255]).buffer), getRandomBytes: (size: number) => new Uint8Array(size).fill(1) }));

const nonce = "a".repeat(32);
const identity = { packageName: "com.fchoo.gymtracker.devtest", buildProfile: "development-test", nativeContractsEnabled: true, suite: "v1.2-acceptance" };
const archive = () => { const value = new Uint8Array(26); value[4] = 2; return value; };
const setting = { key: "appearance.theme", value_version: 1, value_json: '"dark"', revision: 1, updated_at_ms: 1 };
function snapshot(): LogicalBackupSnapshot {
  const tables = Object.fromEntries(logicalBackupTablesForVersion(2, 22).map(table => [table, table === "app_settings" ? [setting] : table === "portable_owner_identity" ? [{ id: 1, owner_namespace: "b".repeat(32) }] : []]));
  return { version: 2, schemaVersion: 22, snapshotId: "synthetic-rollback-v2", createdAtMs: 1, tables,
    catalogReferences: [], manifest: { catalogReferenceCount: 0, totalRows: 2,
      rowCounts: Object.fromEntries(Object.entries(tables).map(([table, rows]) => [table, rows.length])) } } as LogicalBackupSnapshot;
}
function fakeKernel() {
  const query = jest.fn(async (sql: string) => {
    if (sql === "PRAGMA integrity_check") return [{ integrity_check: "ok" }];
    return [];
  });
  const execute = jest.fn(async () => ({ changes: 1, lastInsertRowId: 1 }));
  const kernel = { queryAll: query, close: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    write: async (callback: (tx: unknown) => Promise<unknown>) => callback({ execute, queryAll: query }),
    readSnapshot: async (callback: (tx: unknown) => Promise<unknown>) => callback({ queryAll: async (sql: string) => {
      const table = /FROM "([a-z_]+)"/u.exec(sql)![1]!;
      return snapshot().tables[table];
    } }),
  } as unknown as SqliteKernel;
  return { kernel, query, execute };
}
function fakePorts() {
  const kernels: ReturnType<typeof fakeKernel>[] = [];
  const p = {
    open: jest.fn(async () => { const value = fakeKernel(); kernels.push(value); return value.kernel; }),
    remove: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    digest: jest.fn(async (value: Uint8Array) => createHash("sha256").update(value).digest("hex")),
    random: (size: number) => new Uint8Array(size).fill(1),
    kdf: { derive: jest.fn(async () => ({ bytes: new Uint8Array(32), algorithm: "argon2id", durationMs: 1,
      provider: "Bouncy Castle", providerVersion: "1.85.2" })) },
    crypto: { encrypt: async ({ plaintext }: { plaintext: Uint8Array }) => ({ ciphertext: plaintext.slice(), tag: new Uint8Array(16) }),
      decrypt: async () => new Uint8Array() },
  };
  return { p: p as unknown as RollbackBridgePorts, raw: p, kernels };
}
let preflight: "ready" | "cancelled" = "ready";
let capture = true;
let restoredSnapshot: LogicalBackupSnapshot;
beforeEach(() => {
  jest.restoreAllMocks(); mockFiles.clear(); preflight = "ready"; capture = true; restoredSnapshot = snapshot();
  const files = require("expo-file-system") as { File: typeof MockFile }; files.File = MockFile;
  jest.spyOn(repositoryModule, "createLogicalRestoreRepository").mockImplementation((_kernel, options) => {
    options!.nowMs();
    return { restore: async () => ({ state: "rebuild_pending" }) };
  });
  jest.spyOn(commandsModule, "createRestoreCommands").mockImplementation(deps => ({
    async preflightSecureRestore() {
      await deps.files.readSelectedArchiveAtMost(32 * 1024 * 1024);
      deps.store.issue({ snapshot: restoredSnapshot, digest: "digest", preview: {} } as never);
      return preflight === "ready" ? { outcome: "ready", token: nonce, preview: {} } as never : { outcome: "cancelled" };
    },
    async commitSecureRestore() { if (capture) return deps.restorer!.restore(restoredSnapshot); return { state: "rebuild_pending" }; },
    invalidateSecureRestorePreflight() {},
  }));
});

describe("rollback bridge guards and orchestration (host-only unit tests)", () => {
  it("enables exactly the development-test package/profile/suite", () => {
    expect(rollbackNativeEnabled(identity)).toBe(true);
    for (const patch of [{ packageName: "com.fchoo.gymtracker" }, { buildProfile: "production" }, { nativeContractsEnabled: false }, { suite: "phase11" }]) {
      expect(rollbackNativeEnabled({ ...identity, ...patch })).toBe(false);
    }
  });
  function arm(): RollbackArm { return { schema_version: 1, route_id: "v12-rollback-bridge", phase: "create", nonce,
    run_id: "phase20-20261023T000000Z-aaaaaaaaaaaa", source_tree_sha256: "b".repeat(64), apk_sha256: "c".repeat(64),
    device_identity_sha256: "d".repeat(64), lease_id_sha256: "e".repeat(64), archive_sha256: "f".repeat(64),
    declared_schema_version: 22, expires_at_ms: 61_000 };
  }
  it("requires the exact one-shot nonce-bound private arm and bounded expiry", () => {
    expect(validateRollbackArm(arm(), nonce, 1_000)).toEqual(arm());
    for (const value of [null, "text", [], {}, { ...arm(), extra: 1 }, { ...arm(), schema_version: 2 },
      { ...arm(), route_id: "wrong" }, { ...arm(), phase: "wrong" }, { ...arm(), nonce: "b".repeat(32) },
      { ...arm(), run_id: "wrong" }, { ...arm(), run_id: [arm().run_id] },
      { ...arm(), apk_sha256: "wrong" }, { ...arm(), apk_sha256: [arm().apk_sha256] }, { ...arm(), declared_schema_version: 45 },
      { ...arm(), expires_at_ms: 1.5 }, { ...arm(), expires_at_ms: 999 }, { ...arm(), expires_at_ms: 1_000 }, { ...arm(), expires_at_ms: 400_000 }]) {
      expect(() => validateRollbackArm(value, nonce, 1_000)).toThrow("v12_rollback_arm_invalid");
    }
    const missing = { ...arm(), replacement: 1 } as Record<string, unknown>; delete missing.route_id;
    expect(() => validateRollbackArm(missing, nonce, 1_000)).toThrow("v12_rollback_arm_invalid");
    expect(() => validateRollbackArm(arm(), [], 1_000)).toThrow("v12_rollback_arm_invalid");
    expect(() => validateRollbackArm(arm(), "wrong", 1_000)).toThrow("v12_rollback_arm_invalid");
    expect(() => validateRollbackArm(arm(), nonce, 1.5)).toThrow("v12_rollback_arm_invalid");
  });
  it("writes then restores synthetic source facts and deletes only its allocated databases", async () => {
    const f = fakePorts(); const result = await executeRollbackBridge({ nonce, phase: "create" }, f.p);
    expect(result.inspection.canonical_post_restore_facts.source_facts_sha256).toBe(result.inspection.canonical_post_restore_facts.reopened_facts_sha256);
    expect(f.raw.remove.mock.calls.length).toBe(2);
  });
  it.each([
    { nonce: "wrong", phase: "create" }, { nonce, phase: "wrong" },
  ])("rejects invalid operation before opening SQLite", async value => {
    const f = fakePorts(); await expect(executeRollbackBridge(value as never, f.p)).rejects.toThrow("v12_rollback_arguments_invalid");
    expect(f.raw.open).not.toHaveBeenCalled();
  });
  it.each([undefined, new Uint8Array(25), new Uint8Array(32 * 1024 * 1024 + 1), new Uint8Array(26)])("rejects missing/invalid archive", async value => {
    const f = fakePorts(); await expect(executeRollbackBridge({ nonce, phase: "restore", archive: value }, f.p)).rejects.toThrow("v12_rollback_archive_invalid");
  });
  it("rejects a non-byte archive at runtime", async () => {
    const f = fakePorts(); await expect(executeRollbackBridge({ nonce, phase: "restore", archive: { slice: () => ({}) } as never }, f.p)).rejects.toThrow("v12_rollback_archive_invalid");
  });
  it.each(["cancelled", "uncaptured", "format", "schema"])("rejects incomplete real-restore handoff: %s", async kind => {
    if (kind === "cancelled") preflight = "cancelled";
    if (kind === "uncaptured") capture = false;
    if (kind === "format") restoredSnapshot = { ...snapshot(), version: 1 };
    if (kind === "schema") restoredSnapshot = { ...snapshot(), schemaVersion: 21 };
    await expect(executeRollbackBridge({ nonce, phase: "restore", archive: archive() }, fakePorts().p)).rejects.toThrow("v12_rollback_");
  });
  it.each([[], [{ check: "bad" }], [{ a: "ok", b: "ok" }], [{ check: "ok" }, { check: "ok" }], [{}]].map(rows => ({ rows })))("rejects failed integrity proof", async ({ rows }) => {
    const f = fakePorts(); f.raw.open.mockImplementation(async () => {
      const value = fakeKernel(); value.query.mockImplementation(async sql => sql === "PRAGMA integrity_check" ? rows as never : []);
      return value.kernel;
    });
    await expect(executeRollbackBridge({ nonce, phase: "restore", archive: archive() }, f.p)).rejects.toThrow("v12_rollback_restore_facts_invalid");
  });
  it("rejects foreign keys and non-clean initialization", async () => {
    for (const match of ["PRAGMA foreign_key_check", "SELECT name FROM sqlite_master"]) {
      const f = fakePorts(); f.raw.open.mockImplementation(async () => {
        const value = fakeKernel(); value.query.mockImplementation(async sql => sql.startsWith(match) ? [{ bad: 1 }] as never : sql === "PRAGMA integrity_check" ? [{ integrity_check: "ok" }] : []);
        return value.kernel;
      });
      await expect(executeRollbackBridge({ nonce, phase: "restore", archive: archive() }, f.p)).rejects.toThrow("v12_rollback_");
    }
  });
  it("requires serialized snapshot reads", async () => {
    const f = fakePorts(); f.raw.open.mockImplementation(async () => {
      const value = fakeKernel(); delete value.kernel.readSnapshot; return value.kernel;
    });
    await expect(executeRollbackBridge({ nonce, phase: "create" }, f.p)).rejects.toThrow("v12_rollback_snapshot_required");
  });
  it.each([2, 3])("rejects differing committed/reopened facts at digest call %i", async call => {
    const f = fakePorts(); let index = 0;
    f.raw.digest.mockImplementation(async value => ++index === call ? "f".repeat(64) : createHash("sha256").update(value).digest("hex"));
    await expect(executeRollbackBridge({ nonce, phase: "restore", archive: archive() }, f.p)).rejects.toThrow("v12_rollback_restore_facts_invalid");
  });
  it("preserves first failure and refuses cleanup-only failures", async () => {
    for (const first of [undefined, new Error("private text"), "private text", new Error("v12_rollback_native_timeout")]) {
      const f = fakePorts();
      if (first !== undefined) f.raw.digest.mockRejectedValue(first);
      f.raw.remove.mockRejectedValue(new Error("private cleanup"));
      await expect(executeRollbackBridge({ nonce, phase: "restore", archive: archive() }, f.p)).rejects.toThrow(first === undefined ? "v12_rollback_cleanup_failed" : first instanceof Error && first.message.startsWith("v12_rollback_") ? first.message : "v12_rollback_archive_invalid");
    }
    const f = fakePorts();
    f.raw.open.mockImplementation(async () => {
      const value = fakeKernel(); jest.mocked(value.kernel.close).mockRejectedValue(new Error("private close")); return value.kernel;
    });
    await expect(executeRollbackBridge({ nonce, phase: "create" }, f.p)).rejects.toThrow("v12_rollback_archive_invalid");
  });
  it("rejects a close failure during final cleanup after successful restore", async () => {
    const f = fakePorts(); let count = 0;
    f.raw.open.mockImplementation(async () => { const value = fakeKernel(); if (++count === 2) jest.mocked(value.kernel.close).mockRejectedValue(new Error("close")); return value.kernel; });
    await expect(executeRollbackBridge({ nonce, phase: "restore", archive: archive() }, f.p)).rejects.toThrow("v12_rollback_cleanup_failed");
  });

  function nativePorts() {
    const f = fakePorts();
    jest.spyOn(cryptoModule, "createAesGcmArchivePort").mockReturnValue(f.p.crypto);
    jest.spyOn(cryptoModule, "createExpoAesGcmArchiveDriver").mockReturnValue(f.p.crypto);
    jest.spyOn(kdfModule, "createPasswordKdfPort").mockReturnValue(f.p.kdf);
    jest.spyOn(kernelModule, "openSqliteKernel").mockImplementation(async name => {
      mockFiles.set(`file:///native-sqlite/${name}`, new Uint8Array()); return (await f.p.open(name, true));
    });
    return f;
  }
  it("production ports use exact Expo directory, native crypto, and owned deletion", async () => {
    nativePorts(); const p = productionRollbackPorts(); const name = `v12-rollback-target-${nonce}.db`;
    await expect(p.open("workout.db", true)).rejects.toThrow("arguments_invalid");
    await expect(p.open(name, false)).rejects.toThrow("clean_target_required");
    await p.open(name, true);
    await expect(p.open(name, true)).rejects.toThrow("clean_target_required");
    await p.open(name, false);
    mockFiles.set(`file:///native-sqlite/v12-rollback-source-${nonce}.db`, new Uint8Array());
    await expect(p.open(`v12-rollback-source-${nonce}.db`, false)).rejects.toThrow("clean_target_required");
    expect(await p.digest(new Uint8Array([1]))).toBe("0001ff"); expect(p.random(3)).toHaveLength(3);
    await p.remove(name); await expect(p.remove(name)).rejects.toThrow("cleanup_failed");
    const sqlite = require("expo-sqlite") as { defaultDatabaseDirectory: string };
    sqlite.defaultDatabaseDirectory = "file:///native-sqlite";
    const uriPorts = productionRollbackPorts();
    const otherName = `v12-rollback-target-${"c".repeat(32)}.db`;
    await uriPorts.open(otherName, true); await uriPorts.remove(otherName);
    sqlite.defaultDatabaseDirectory = "/native-sqlite";
  });
  it("only consumes private arms once, without source-row or archive logs", async () => {
    const f = nativePorts();
    // Host mock digest must remain internally consistent for this orchestration test.
    const nativeCrypto = require("expo-crypto") as { digest: ReturnType<typeof jest.fn> };
    nativeCrypto.digest.mockImplementation(async (_algorithm: unknown, value: Uint8Array) => Uint8Array.from(createHash("sha256").update(value).digest()).buffer);
    const valid = { ...arm(), expires_at_ms: Date.now() + 60_000 };
    mockFiles.set(`${mockPath}/v12-rollback-${nonce}/arm.json`, new TextEncoder().encode(JSON.stringify(valid)));
    await collectNativeRollbackBridge(identity, nonce);
    expect(f.raw.open).toHaveBeenCalled();
    const result = JSON.parse(new TextDecoder().decode(mockFiles.get(`${mockPath}/v12-rollback-${nonce}/result.json`)!));
    expect(result.inspection.clean_restore_receipt.outcome).toBe("restored");
    await expect(collectNativeRollbackBridge(identity, nonce)).rejects.toThrow("arm_invalid");
  });
  it("keeps the final result absent until complete staged bytes are moved into place", async () => {
    const f = nativePorts();
    jest.spyOn(cryptoModule, "createExpoAesGcmArchiveDriver").mockImplementation(() => { throw new Error("v12_rollback_synthetic_failure"); });
    const valid = { ...arm(), expires_at_ms: Date.now() + 60_000 };
    mockFiles.set(`${mockPath}/v12-rollback-${nonce}/arm.json`, new TextEncoder().encode(JSON.stringify(valid)));
    const finalPath = `${mockPath}/v12-rollback-${nonce}/result.json`;
    const originalWrite = MockFile.prototype.write;
    let observedStaging = false;
    jest.spyOn(MockFile.prototype, "write").mockImplementation(function (this: MockFile, value) {
      if (this.path.endsWith("/result-staged.json")) {
        mockFiles.set(this.path, new Uint8Array());
        expect(mockFiles.has(finalPath)).toBe(false);
        observedStaging = true;
      }
      originalWrite.call(this, value);
    });
    await expect(collectNativeRollbackBridge(identity, nonce)).rejects.toThrow("v12_rollback_synthetic_failure");
    expect(observedStaging).toBe(true);
    expect(JSON.parse(new TextDecoder().decode(mockFiles.get(finalPath)!)).failure).toBe("v12_rollback_synthetic_failure");
    expect(mockFiles.has(`${mockPath}/v12-rollback-${nonce}/result-staged.json`)).toBe(false);
    expect(f.raw.open).not.toHaveBeenCalled();
  });
  it("does not announce readiness or completion while an asynchronous copy fallback is incomplete", async () => {
    nativePorts();
    jest.spyOn(cryptoModule, "createExpoAesGcmArchiveDriver").mockImplementation(() => { throw new Error("v12_rollback_synthetic_failure"); });
    const valid = { ...arm(), expires_at_ms: Date.now() + 60_000 };
    mockFiles.set(`${mockPath}/v12-rollback-${nonce}/arm.json`, new TextEncoder().encode(JSON.stringify(valid)));
    const finalPath = `${mockPath}/v12-rollback-${nonce}/result.json`;
    const readyPath = `${mockPath}/v12-rollback-${nonce}/result.ready`;
    const originalMove = MockFile.prototype.move;
    let copying!: () => void;
    const copyStarted = new Promise<void>(resolve => { copying = resolve; });
    let finish!: () => void;
    const pendingCopy = new Promise<void>(resolve => { finish = resolve; });
    jest.spyOn(MockFile.prototype, "move").mockImplementation(function (this: MockFile, other) {
      if (!this.path.endsWith("/result-staged.json")) return originalMove.call(this, other);
      mockFiles.set(other.path, new Uint8Array());
      copying();
      return pendingCopy.then(() => { originalMove.call(this, other); });
    });
    const operation = collectNativeRollbackBridge(identity, nonce);
    await copyStarted;
    expect(mockFiles.get(finalPath)).toEqual(new Uint8Array());
    expect(mockFiles.has(readyPath)).toBe(false);
    finish();
    await expect(operation).rejects.toThrow("v12_rollback_synthetic_failure");
    expect(JSON.parse(new TextDecoder().decode(mockFiles.get(finalPath)!)).failure).toBe("v12_rollback_synthetic_failure");
    expect(new TextDecoder().decode(mockFiles.get(readyPath)!)).toBe("ready");
  });
  it("rejects an existing readiness barrier instead of reusing stale completion", async () => {
    mockFiles.set(`${mockPath}/v12-rollback-${nonce}/result.ready`, new Uint8Array([1]));
    await expect(collectNativeRollbackBridge(identity, nonce)).rejects.toThrow("arm_invalid");
  });
  it("rejects an existing staged result instead of overwriting it", async () => {
    mockFiles.set(`${mockPath}/v12-rollback-${nonce}/result-staged.json`, new Uint8Array([1]));
    await expect(collectNativeRollbackBridge(identity, nonce)).rejects.toThrow("arm_invalid");
  });
  it("retains a sanitized failure receipt when a native port binding is unavailable", async () => {
    nativePorts();
    jest.spyOn(cryptoModule, "createExpoAesGcmArchiveDriver").mockImplementation(() => { throw new Error("private native binding path"); });
    const valid = { ...arm(), expires_at_ms: Date.now() + 60_000 };
    mockFiles.set(`${mockPath}/v12-rollback-${nonce}/arm.json`, new TextEncoder().encode(JSON.stringify(valid)));
    await expect(collectNativeRollbackBridge(identity, nonce)).rejects.toThrow("v12_rollback_failed");
    const result = JSON.parse(new TextDecoder().decode(mockFiles.get(`${mockPath}/v12-rollback-${nonce}/result.json`)!));
    expect(result.failure).toBe("v12_rollback_failed");
    expect(mockFiles.has(`${mockPath}/v12-rollback-${nonce}/consumed.json`)).toBe(true);
  });
  it("denies production/invalid nonces before private-file access", async () => {
    await expect(collectNativeRollbackBridge({}, nonce)).rejects.toThrow("disabled");
    await expect(collectNativeRollbackBridge(identity, [])).rejects.toThrow("disabled");
    await expect(collectNativeRollbackBridge(identity, "wrong")).rejects.toThrow("disabled");
  });
  it("rejects an existing result even without a consumed arm", async () => {
    mockFiles.set(`${mockPath}/v12-rollback-${nonce}/result.json`, new Uint8Array());
    await expect(collectNativeRollbackBridge(identity, nonce)).rejects.toThrow("arm_invalid");
  });
  it.each(["wrong-hash", "archive-exists", "unknown-error", "timeout"])("preserves fixed-code native failure: %s", async kind => {
    nativePorts();
    const valid = { ...arm(), phase: kind === "wrong-hash" ? "restore" : "create", expires_at_ms: Date.now() + 60_000 };
    mockFiles.set(`${mockPath}/v12-rollback-${nonce}/arm.json`, new TextEncoder().encode(JSON.stringify(valid)));
    if (kind === "wrong-hash") mockFiles.set(`${mockPath}/v12-rollback-${nonce}/incoming.gtbk`, archive());
    if (kind === "archive-exists") mockFiles.set(`${mockPath}/v12-rollback-${nonce}/archive.gtbk`, archive());
    if (kind === "unknown-error") jest.spyOn(MockFile.prototype, "write").mockImplementationOnce(() => { throw "private payload"; });
    if (kind === "timeout") jest.spyOn(Date, "now").mockReturnValueOnce(valid.expires_at_ms - 1).mockReturnValue(valid.expires_at_ms + 1);
    await expect(collectNativeRollbackBridge(identity, nonce)).rejects.toThrow("v12_rollback_");
    const result = JSON.parse(new TextDecoder().decode(mockFiles.get(`${mockPath}/v12-rollback-${nonce}/result.json`)!));
    expect(result.failure).toMatch(/^v12_rollback_[a-z_]+$/u);
  });
});
