import {
  describe,
  expect,
  it,
  test,
} from "@jest/globals";

import {
  BoundedDiagnostics,
  DiagnosticEntry,
} from "./index";

describe("bounded diagnostics", () => {
  const safeEntry: DiagnosticEntry = {
    timestampMs: 1_726_780_800_000,
    operation: "complete_set",
    category: "storage",
    code: "write_failed",
    correlationCode: "GT-01J5AV2Q",
    revision: 12,
    durationMs: 34,
    attempt: 2,
  };

  it("serializes only allowlisted stable metadata", () => {
    const diagnostics = new BoundedDiagnostics();

    diagnostics.record(safeEntry);

    expect(diagnostics.serialize()).toBe(JSON.stringify([safeEntry]));
  });

  test.each([
    ["password", "super-secret"],
    ["key", "derived-key"],
    ["backupPlaintext", "full archive"],
    ["note", "private exercise note"],
    ["setPayload", { loadGrams: 100_000, reps: 5 }],
    ["sqlParameters", ["owner-secret"]],
    ["message", "raw platform exception"],
  ])("redacts forbidden field %s", (field, value) => {
    const diagnostics = new BoundedDiagnostics();

    diagnostics.record({
      ...safeEntry,
      [field]: value,
    } as DiagnosticEntry);

    const serialized = diagnostics.serialize();
    expect(serialized).not.toContain(field);
    expect(serialized).not.toContain(
      typeof value === "string" ? value : JSON.stringify(value),
    );
  });

  it("bounds retained entries and string field lengths", () => {
    const diagnostics = new BoundedDiagnostics({
      maxEntries: 2,
      maxStringLength: 12,
    });

    diagnostics.record({ ...safeEntry, operation: "first-operation" });
    diagnostics.record({ ...safeEntry, operation: "second-operation" });
    diagnostics.record({ ...safeEntry, operation: "third-operation" });

    expect(JSON.parse(diagnostics.serialize())).toEqual([
      expect.objectContaining({ operation: "second-opera" }),
      expect.objectContaining({ operation: "third-operat" }),
    ]);
  });

  it("rejects invalid diagnostic bounds", () => {
    expect(() => new BoundedDiagnostics({ maxEntries: 0 })).toThrow(
      "positive safe integers",
    );
    expect(() => new BoundedDiagnostics({ maxStringLength: 1.5 })).toThrow(
      "positive safe integers",
    );
  });

  it("omits absent optional metadata", () => {
    const diagnostics = new BoundedDiagnostics();

    diagnostics.record({
      timestampMs: 1_726_780_800_000,
      operation: "launch",
      category: "transient_platform",
      code: "launch_retry",
      correlationCode: "GT-01J5AV2Q",
    });

    expect(JSON.parse(diagnostics.serialize())).toEqual([
      {
        timestampMs: 1_726_780_800_000,
        operation: "launch",
        category: "transient_platform",
        code: "launch_retry",
        correlationCode: "GT-01J5AV2Q",
      },
    ]);
  });

  it("normalizes unsafe numeric metadata rather than emitting invalid JSON", () => {
    const diagnostics = new BoundedDiagnostics();

    diagnostics.record({
      ...safeEntry,
      timestampMs: Number.NaN,
      durationMs: Number.POSITIVE_INFINITY,
      revision: -1,
      attempt: 1.5,
    });

    expect(JSON.parse(diagnostics.serialize())).toEqual([
      expect.objectContaining({
        timestampMs: 0,
        durationMs: 0,
        revision: 0,
        attempt: 0,
      }),
    ]);
  });

  it("normalizes a missing runtime timestamp at the diagnostics boundary", () => {
    const diagnostics = new BoundedDiagnostics();

    diagnostics.record({
      ...safeEntry,
      timestampMs: undefined,
    } as unknown as DiagnosticEntry);

    expect(JSON.parse(diagnostics.serialize())).toEqual([
      expect.objectContaining({ timestampMs: 0 }),
    ]);
  });
});
