import { describe, expect, it } from "@jest/globals";

import { runtimeSha256 } from "./runtimeSha256";

describe("native runtime SHA-256 port", () => {
  it("falls back to host Web Crypto when the Expo Jest shim is empty", async () => {
    await expect(runtimeSha256("abc")).resolves.toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});
