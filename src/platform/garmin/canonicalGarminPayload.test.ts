import { createHash } from "node:crypto";
import { describe, expect, it } from "@jest/globals";

import {
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
});
