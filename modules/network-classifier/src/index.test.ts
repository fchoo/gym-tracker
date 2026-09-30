import { describe, expect, it, jest } from "@jest/globals";

import { currentNetworkClass, normalizeNetworkClass } from "./index";

describe("network classifier bridge", () => {
  it.each([
    ["wifi", "wifi"],
    ["cellular_or_metered", "cellular_or_metered"],
    ["unavailable", "unavailable"],
    ["unknown", "unknown"],
  ] as const)("accepts the bounded native value %s", (value, expected) => {
    expect(normalizeNetworkClass(value)).toBe(expected);
  });

  it("fails closed for malformed native values and bridge errors", async () => {
    expect(normalizeNetworkClass("carrier-name")).toBe("unknown");
    await expect(currentNetworkClass({ current: jest.fn(async () => "wifi") })).resolves.toBe("wifi");
    await expect(currentNetworkClass({ current: jest.fn(async () => { throw new Error("permission"); }) })).resolves.toBe("unknown");
  });
});
