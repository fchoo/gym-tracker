import { describe, expect, it, jest } from "@jest/globals";

import {
  cleanupPhase12GoogleNamespace,
  PHASE12_GOOGLE_CLEANUP_CONFIRMATION,
  phase12GoogleCleanupEnabled,
} from "./phase12GoogleCleanup";

describe("Phase 12 Google cleanup", () => {
  it("requires the exact development-test native-contract gate", () => {
    const enabled = {
      buildProfile: "development-test",
      nativeContractsEnabled: true,
      suite: "phase12",
      confirmation: PHASE12_GOOGLE_CLEANUP_CONFIRMATION,
    };
    expect(phase12GoogleCleanupEnabled(enabled)).toBe(true);
    for (const override of [
      { buildProfile: "production" },
      { nativeContractsEnabled: false },
      { suite: "phase11" },
      { confirmation: "DELETE" },
    ]) expect(phase12GoogleCleanupEnabled({ ...enabled, ...override })).toBe(false);
  });

  it("deletes only discovered objects and requires two empty confirmations", async () => {
    const deleteTombstoned = jest.fn(async () => undefined);
    const responses = [[{ fileId: "one" }, { fileId: "two" }], [], []];
    await expect(cleanupPhase12GoogleNamespace({
      drive: { discover: async () => responses.shift() ?? [], deleteTombstoned },
      wait: async () => undefined,
    })).resolves.toEqual({ deleted: 2, remaining: 0 });
    expect(deleteTombstoned.mock.calls).toEqual([["one"], ["two"]]);
  });

  it("fails closed when Drive never confirms an empty namespace", async () => {
    await expect(cleanupPhase12GoogleNamespace({
      drive: { discover: async () => [{ fileId: "one" }], deleteTombstoned: async () => undefined },
      wait: async () => undefined,
      maxPasses: 2,
    })).rejects.toThrow("phase12_google_cleanup_incomplete");
  });
});
