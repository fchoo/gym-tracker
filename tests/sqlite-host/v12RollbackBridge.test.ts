import { describe, it, expect } from "@jest/globals";
import { createCipheriv, createDecipheriv, createHash, argon2Sync } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { configureSqliteConnection, type SqliteConnection } from "../../src/platform/sqlite/connection";
import { createSqliteKernel } from "../../src/platform/sqlite/sqliteKernel";
import { executeRollbackBridge, type RollbackBridgePorts } from "../../src/testing/v12NativeRollbackBridge";

function connection(file: string): SqliteConnection {
  const db = new DatabaseSync(file);
  return {
    async execAsync(sql) { db.exec(sql); },
    async isInTransactionAsync() { return db.isTransaction; },
    async closeAsync() { db.close(); },
    async prepareAsync(sql) {
      const stmt = db.prepare(sql);
      return {
        async executeAsync(parameters = []) {
          if (stmt.columns().length > 0) {
            const rows = stmt.all(...parameters);
            return { changes: 0, lastInsertRowId: 0, getAllAsync: async () => rows as never };
          }
          const result = stmt.run(...parameters);
          return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid), getAllAsync: async () => [] as never };
        },
        async finalizeAsync() {},
      };
    },
  };
}

// These host primitives are genuine AES-GCM/Argon2 and SQLite, but are NOT native acceptance evidence.
function ports(directory: string): RollbackBridgePorts {
  return {
    async open(name) {
      const writer = connection(join(directory, name));
      await configureSqliteConnection(writer, { enableWal: true });
      const reader = connection(join(directory, name));
      await configureSqliteConnection(reader, { enableWal: false });
      return createSqliteKernel({ reader, writer });
    },
    async remove(name) { rmSync(join(directory, name), { force: true }); },
    digest: async bytes => createHash("sha256").update(bytes).digest("hex"),
    random: size => new Uint8Array(size).fill(3),
    kdf: { async derive(password, descriptor) {
      const bytes = argon2Sync("argon2id", { message: Buffer.from(password), nonce: Buffer.from(descriptor.salt), memory: descriptor.memoryKiB,
        passes: descriptor.iterations, parallelism: descriptor.parallelism, tagLength: descriptor.outputLength });
      return { bytes: new Uint8Array(bytes), algorithm: "argon2id", durationMs: 0, provider: "Bouncy Castle", providerVersion: "1.85.2" };
    } },
    crypto: {
      async encrypt({ key, nonce, aad, plaintext }) {
        const cipher = createCipheriv("aes-256-gcm", key, nonce); cipher.setAAD(aad);
        return { ciphertext: new Uint8Array(Buffer.concat([cipher.update(plaintext), cipher.final()])), tag: new Uint8Array(cipher.getAuthTag()) };
      },
      async decrypt({ key, nonce, aad, ciphertext, tag }) {
        const cipher = createDecipheriv("aes-256-gcm", key, nonce); cipher.setAAD(aad); cipher.setAuthTag(tag);
        return new Uint8Array(Buffer.concat([cipher.update(ciphertext), cipher.final()]));
      },
    },
  };
}

describe("rollback bridge on real host SQLite (non-native proof)", () => {
  it("production codec seals genuine format-2/schema-22 source facts and current production restore commits then closes/reopens", async () => {
    const directory = mkdtempSync(join(tmpdir(), "rollback-real-sqlite-"));
    try {
      const p = ports(directory);
      const created = await executeRollbackBridge({ nonce: "a".repeat(32), phase: "create" }, p);
      expect(created.archive[4]).toBe(2);
      expect(new TextDecoder().decode(created.archive)).not.toContain("appearance.theme");
      expect(created.inspection.schema_version).toBe(22);
      expect(created.inspection.clean_restore_receipt.clean_target).toBe(true);
      expect(created.inspection.canonical_post_restore_facts.row_count).toBe(2);
      const restored = await executeRollbackBridge({ nonce: "b".repeat(32), phase: "restore", archive: created.archive }, p);
      expect(restored.archive).toEqual(created.archive);
      expect(restored.inspection).toEqual(created.inspection);
      const tampered = created.archive.slice(); tampered[tampered.length - 1] = tampered[tampered.length - 1]! ^ 1;
      await expect(executeRollbackBridge({ nonce: "c".repeat(32), phase: "restore", archive: tampered }, p)).rejects.toThrow("v12_rollback_archive_invalid");
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
