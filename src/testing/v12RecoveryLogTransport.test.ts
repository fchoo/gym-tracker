import { createHash } from "node:crypto";
import { describe, expect, it, jest } from "@jest/globals";
import { publishV12RecoveryLog } from "./v12RecoveryLogTransport";

jest.mock("expo-crypto", () => ({ CryptoDigestAlgorithm: { SHA256: "SHA-256" }, digestStringAsync: async (_algorithm: string, body: string) => require("node:crypto").createHash("sha256").update(body).digest("hex") }));
const hash = async (body: string) => createHash("sha256").update(body).digest("hex");

describe("Recovery result log transport", () => {
  it.each(["x".repeat(9_600), "é".repeat(1_600), "漢".repeat(3_000), "😀".repeat(1_600), "\\\"".repeat(2_000)])("preserves complete multichunk facts with bounded records", async (fact) => {
    const result = { nonce: "a".repeat(32), kind: "recovery", fact };
    const lines: string[] = [];
    await publishV12RecoveryLog(result, (line) => { lines.push(line); }, { sha256: hash });
    expect(lines.every((line) => new TextEncoder().encode(line).length < 3_500)).toBe(true);
    const records = lines.map((line) => JSON.parse(line.slice(line.indexOf(":") + 1)) as Record<string, unknown>);
    const chunks = records.slice(0, -1);
    expect(chunks.map((chunk) => chunk.sequence)).toEqual(chunks.map((_, index) => index + 1));
    const body = chunks.map((chunk) => chunk.data).join("");
    expect(JSON.parse(body)).toEqual(result);
    expect(records.at(-1)).toEqual({ schema_version: 2, nonce: result.nonce, kind: "chunked", total: chunks.length, sha256: await hash(body) });
  });

  it("uses packaged hashing when no hasher is injected", async () => {
    const lines: string[] = [];
    await publishV12RecoveryLog({ nonce: "a".repeat(32) }, (line) => { lines.push(line); });
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[1]!.slice(lines[1]!.indexOf(":") + 1)).sha256)
      .toBe(await hash(JSON.stringify({ nonce: "a".repeat(32) })));
  });

  it("keeps the host's sixteen-chunk limit and publishes no partial oversized result", async () => {
    const emit = jest.fn();
    await expect(publishV12RecoveryLog({ nonce: "a".repeat(32), fact: "x".repeat(24_000) }, emit, { sha256: hash })).rejects.toThrow("v12_recovery_result_too_large");
    expect(emit).not.toHaveBeenCalled();
  });

  it("publishes no chunks when hashing fails or produces a bad digest", async () => {
    const emit = jest.fn();
    await expect(publishV12RecoveryLog({ nonce: "a".repeat(32) }, emit, { sha256: async () => "bad" })).rejects.toThrow("v12_recovery_result_digest_invalid");
    await expect(publishV12RecoveryLog({ nonce: "a".repeat(32) }, emit, { sha256: async () => { throw new Error("hash_failed"); } })).rejects.toThrow("hash_failed");
    expect(emit).not.toHaveBeenCalled();
  });

  it("never publishes the terminal barrier after cancellation or emission failure", async () => {
    const emit = jest.fn();
    await expect(publishV12RecoveryLog({ nonce: "a".repeat(32) }, emit, { sha256: hash, assertCurrent: () => { throw new Error("cancelled"); } })).rejects.toThrow("cancelled");
    expect(emit).not.toHaveBeenCalled();
    await expect(publishV12RecoveryLog({ nonce: "a".repeat(32) }, () => { throw new Error("emit_failed"); }, { sha256: hash })).rejects.toThrow("emit_failed");
  });
});
