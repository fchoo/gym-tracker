import { describe, expect, it } from "@jest/globals";

import { runtimeSha256 } from "../../src/platform/crypto/runtimeSha256";

describe("runtime SHA-256 port", () => {
  it("matches the standard SHA-256 UTF-8 digest on the host", async () => {
    await expect(runtimeSha256("abc")).resolves.toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});
