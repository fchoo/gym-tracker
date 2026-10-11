import { createHash } from "node:crypto";
import { describe, expect, it } from "@jest/globals";

import {
  GARMIN_CANONICAL_LIMITS,
  GarminCanonicalPayloadError,
  canonicalizeGarminPayload,
  hashCanonicalGarminPayload,
} from "./canonicalGarminPayload";

const sha256 = async (value: string) => createHash("sha256").update(value).digest("hex");

describe("canonical Garmin payload", () => {
  it("sorts object keys by binary code-unit order while preserving array order", () => {
    expect(canonicalizeGarminPayload({
      z: [3, 1, 2],
      ä: true,
      a: "value",
      A: null,
    })).toBe('{"A":null,"a":"value","z":[3,1,2],"ä":true}');
  });

  it("produces the lower-case SHA-256 of the exact canonical bytes", async () => {
    const value = { version: 1, normalized: { sport: "running", distance_meters: 5_000 } };
    const canonical = '{"normalized":{"distance_meters":5000,"sport":"running"},"version":1}';

    await expect(hashCanonicalGarminPayload(value, sha256)).resolves.toBe(
      createHash("sha256").update(canonical).digest("hex"),
    );
  });

  it.each([
    ["undefined", undefined],
    ["bigint", BigInt(1)],
    ["symbol", Symbol("not-json")],
    ["function", () => undefined],
    ["NaN", Number.NaN],
    ["positive infinity", Number.POSITIVE_INFINITY],
    ["unsafe number", Number.MAX_SAFE_INTEGER + 1],
    ["non-plain object", new Date(0)],
    ["sparse array", Array(1)],
  ])("rejects %s as non-plain JSON", (_label, value) => {
    expect(() => canonicalizeGarminPayload(value)).toThrow("garmin_json_invalid");
  });

  it("rejects cycles, accessors, symbols, empty keys, and array properties", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const accessor = Object.defineProperty({}, "value", { enumerable: true, get: () => 1 });
    const symbolKey = { value: 1, [Symbol("private")]: 2 };
    const arrayProperty = Object.assign([1], { privateValue: 2 });

    for (const value of [cyclic, accessor, symbolKey, { "": 1 }, arrayProperty]) {
      expect(() => canonicalizeGarminPayload(value)).toThrow("garmin_json_invalid");
    }
  });

  it("accepts exact string, array, nesting, object-key, total-key, node, and byte limits", () => {
    expect(canonicalizeGarminPayload("x".repeat(GARMIN_CANONICAL_LIMITS.maxStringCodeUnits))).toHaveLength(
      GARMIN_CANONICAL_LIMITS.maxStringCodeUnits + 2,
    );
    expect(canonicalizeGarminPayload(Array(GARMIN_CANONICAL_LIMITS.maxArrayLength).fill(null))).toContain("null");

    let nested: unknown = null;
    for (let depth = 0; depth < GARMIN_CANONICAL_LIMITS.maxDepth; depth += 1) nested = [nested];
    expect(canonicalizeGarminPayload(nested)).toContain("null");

    const maximumKeys = Object.fromEntries(Array.from(
      { length: GARMIN_CANONICAL_LIMITS.maxObjectKeys },
      (_, index) => [`k${String(index).padStart(3, "0")}`, null],
    ));
    expect(canonicalizeGarminPayload(maximumKeys)).toContain('"k127"');

    const fullObjects = Array.from({ length: 78 }, () => ({ ...maximumKeys }));
    const lastObject = Object.fromEntries(Array.from({ length: 16 }, (_, index) => [`z${index}`, null]));
    expect(canonicalizeGarminPayload([...fullObjects, lastObject])).toContain('"z15"');

    const nodeHeavy = Array.from({ length: 12 }, () => Array(4_000).fill(null));
    expect(canonicalizeGarminPayload(nodeHeavy)).toContain("null");

    const fullString = "x".repeat(GARMIN_CANONICAL_LIMITS.maxStringCodeUnits);
    const exactBytes = [
      ...Array(122).fill(fullString),
      "x".repeat(782),
    ];
    expect(canonicalizeGarminPayload(exactBytes)).toHaveLength(GARMIN_CANONICAL_LIMITS.maxCanonicalBytes);
  });

  it("rejects each shape one step over its configured bound", () => {
    let tooDeep: unknown = null;
    for (let depth = 0; depth <= GARMIN_CANONICAL_LIMITS.maxDepth; depth += 1) tooDeep = [tooDeep];
    const tooManyKeys = Object.fromEntries(Array.from(
      { length: GARMIN_CANONICAL_LIMITS.maxObjectKeys + 1 },
      (_, index) => [`k${index}`, null],
    ));
    const maximumKeys = Object.fromEntries(Array.from(
      { length: GARMIN_CANONICAL_LIMITS.maxObjectKeys },
      (_, index) => [`k${String(index).padStart(3, "0")}`, null],
    ));
    const tooManyTotalKeys = [
      ...Array.from({ length: 78 }, () => ({ ...maximumKeys })),
      Object.fromEntries(Array.from({ length: 17 }, (_, index) => [`z${index}`, null])),
    ];
    const tooManyNodes = Array.from({ length: 13 }, () => Array(4_000).fill(null));
    const fullString = "x".repeat(GARMIN_CANONICAL_LIMITS.maxStringCodeUnits);
    const tooManyBytes = [...Array(122).fill(fullString), "x".repeat(783)];

    for (const value of [
      "x".repeat(GARMIN_CANONICAL_LIMITS.maxStringCodeUnits + 1),
      Array(GARMIN_CANONICAL_LIMITS.maxArrayLength + 1).fill(null),
      tooDeep,
      { ["k".repeat(GARMIN_CANONICAL_LIMITS.maxKeyCodeUnits + 1)]: null },
      tooManyKeys,
      tooManyTotalKeys,
      tooManyNodes,
      tooManyBytes,
    ]) {
      expect(() => canonicalizeGarminPayload(value)).toThrow("garmin_json_limit");
    }
  });

  it("counts multi-byte canonical strings and rejects invalid digest seams", async () => {
    expect(canonicalizeGarminPayload({ latin: "é", cjk: "漢", emoji: "🏃" })).toContain("🏃");
    await expect(hashCanonicalGarminPayload({ ok: true }, async () => "A".repeat(64))).rejects.toEqual(
      expect.objectContaining<Partial<GarminCanonicalPayloadError>>({ code: "garmin_digest_invalid" }),
    );
  });
});
