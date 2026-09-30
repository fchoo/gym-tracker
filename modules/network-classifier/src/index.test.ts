import { describe, expect, it, jest } from "@jest/globals";

import { currentNetworkClass, normalizeNetworkClass } from "./index";

describe("network classifier bridge", () => {
  it("accepts every bounded native value", () => {
    for (const value of ["wifi", "cellular_or_metered", "unavailable", "unknown"] as const) {
      expect(normalizeNetworkClass(value)).toBe(value);
    }
  });

  it("fails closed for malformed native values and bridge errors", async () => {
    expect(normalizeNetworkClass("carrier-name")).toBe("unknown");
    await expect(currentNetworkClass({ current: jest.fn(async () => "wifi") })).resolves.toBe("wifi");
    await expect(currentNetworkClass({ current: jest.fn(async () => { throw new Error("permission"); }) })).resolves.toBe("unknown");
  });
});
