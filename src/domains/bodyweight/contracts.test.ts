import { describe, expect, it, jest } from "@jest/globals";
import { createHash } from "node:crypto";

import {
  BodyweightCommandError,
  canonicalBodyweightRequestPayload,
  transitionBodyweight as transitionBodyweightWithExpectedHash,
  type BodyweightCommand,
  type BodyweightEntryState,
} from "./contracts";
import { commitBodyweightCommand } from "./commands";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalBodyweightRequestHash(value: unknown): string {
  return sha256(canonicalBodyweightRequestPayload(value));
}

function transitionBodyweight(
  current: BodyweightEntryState | undefined,
  input: BodyweightCommand,
) {
  const { requestSha256: _requestSha256, ...request } = input;
  return transitionBodyweightWithExpectedHash(
    current,
    input,
    canonicalBodyweightRequestHash(request),
  );
}

function command(overrides: Partial<BodyweightCommand> = {}): BodyweightCommand {
  const value = {
    operation: "create" as const,
    requestId: "bodyweight-request-1",
    entryId: "bodyweight-entry-1",
    ownerId: "owner-1",
    expectedRevision: 0,
    revisionId: "bodyweight-revision-1",
    eventId: "bodyweight-event-1",
    occurredAtMs: 1_790_000_000_000,
    localDate: "2026-10-07",
    timezone: "Asia/Singapore",
    grams: 72_500,
  };
  const merged = { ...value, ...overrides };
  const { requestSha256, ...request } = merged;
  return { ...request, requestSha256: requestSha256 ?? canonicalBodyweightRequestHash(request) };
}

const active: BodyweightEntryState = Object.freeze({
  entryId: "bodyweight-entry-1",
  ownerId: "owner-1",
  revision: 1,
  lifecycle: "active",
  revisionId: "bodyweight-revision-1",
  eventId: "bodyweight-event-1",
  localDate: "2026-10-07",
  timezone: "Asia/Singapore",
  grams: 72_500,
});

describe("dated bodyweight source facts", () => {
  it("creates a grams-only dated owner fact with a canonical request hash", () => {
    const transition = transitionBodyweight(undefined, command());

    expect(transition).toMatchObject({ kind: "created", entry: active });
    expect(canonicalBodyweightRequestHash({ b: 2, a: { y: 2, x: 1 } }))
      .toBe(canonicalBodyweightRequestHash({ a: { x: 1, y: 2 }, b: 2 }));
  });

  it.each([
    ["non-integer grams", command({ grams: 72_500.5 })],
    ["invalid date", command({ localDate: "2026-02-30" })],
    ["invalid timezone", command({ timezone: "Mars/Olympus" })],
    ["changed hash", command({ requestSha256: "0".repeat(64) })],
  ])("rejects %s before staging mutation", (_label, value) => {
    expect(() => transitionBodyweight(undefined, value)).toThrow(BodyweightCommandError);
  });

  it("requires reviewed decimal bounds and an owner-local nonfuture date", () => {
    const now = jest.spyOn(Date, "now").mockReturnValue(Date.UTC(2026, 9, 7, 12));
    try {
      expect(transitionBodyweight(undefined, command({ grams: 20_000, localDate: "2026-10-07" })))
        .toMatchObject({ kind: "created" });
      expect(transitionBodyweight(undefined, command({ grams: 400_000, localDate: "2026-10-07" })))
        .toMatchObject({ kind: "created" });
      for (const value of [
        command({ grams: 19_900 }),
        command({ grams: 400_100 }),
        command({ grams: 20_050 }),
        command({ localDate: "2026-10-08" }),
      ]) {
        expect(() => transitionBodyweight(undefined, value))
          .toThrow("bodyweight_command_measurement_invalid");
      }
    } finally {
      now.mockRestore();
    }
  });

  it("fails closed when owner-local date formatting cannot provide a calendar day", () => {
    const formatter = jest.spyOn(Intl, "DateTimeFormat").mockReturnValue({
      formatToParts: () => [],
    } as unknown as Intl.DateTimeFormat);
    try {
      expect(() => transitionBodyweight(undefined, command()))
        .toThrow("bodyweight_command_measurement_invalid");
    } finally {
      formatter.mockRestore();
    }
  });

  it("appends edit, delete, and explicit restore transitions without changing identity", () => {
    const edited = transitionBodyweight(active, command({
      operation: "edit", expectedRevision: 1, revisionId: "bodyweight-revision-2",
      eventId: "bodyweight-event-2", grams: 71_900,
    }));
    const deleted = transitionBodyweight(edited.entry, command({
      operation: "delete", expectedRevision: 2, revisionId: "bodyweight-revision-3",
      eventId: "bodyweight-event-3", localDate: undefined, timezone: undefined, grams: undefined,
    }));
    const restored = transitionBodyweight(deleted.entry, command({
      operation: "restore", expectedRevision: 3, revisionId: "bodyweight-revision-4",
      eventId: "bodyweight-event-4", grams: 72_100,
    }));

    expect(edited).toMatchObject({ kind: "edited", entry: { entryId: active.entryId, revision: 2, grams: 71_900 } });
    expect(deleted).toMatchObject({ kind: "deleted", entry: { entryId: active.entryId, revision: 3, lifecycle: "deleted" } });
    expect(restored).toMatchObject({ kind: "restored", entry: { entryId: active.entryId, revision: 4, lifecycle: "active", grams: 72_100 } });
  });

  it.each([
    ["create against an existing entry", active, command()],
    ["stale edit", active, command({ operation: "edit", expectedRevision: 0, revisionId: "bodyweight-revision-2", eventId: "bodyweight-event-2" })],
    ["restore an active entry", active, command({ operation: "restore", expectedRevision: 1, revisionId: "bodyweight-revision-2", eventId: "bodyweight-event-2" })],
  ])("returns a typed conflict for %s", (_label, current, value) => {
    expect(transitionBodyweight(current, value)).toMatchObject({ kind: "conflict", entry: current });
  });

  it("rejects every malformed mutation boundary and retains the current fact", () => {
    const deleted: BodyweightEntryState = { ...active, revision: 2, lifecycle: "deleted" };
    const noMeasurementDelete = command({ operation: "delete", expectedRevision: 2, revisionId: "r2", eventId: "e2", localDate: undefined, timezone: undefined, grams: undefined });
    expect(() => transitionBodyweight(undefined, command({ operation: "edit", expectedRevision: 0, localDate: undefined, timezone: undefined, grams: undefined }))).toThrow("bodyweight_command_measurement_invalid");
    expect(() => transitionBodyweight(undefined, command({ requestId: "not allowed spaces" }))).toThrow("bodyweight_command_identity_invalid");
    expect(() => transitionBodyweight(undefined, command({ expectedRevision: -1 }))).toThrow("bodyweight_command_revision_invalid");
    expect(() => transitionBodyweight(undefined, command({ operation: "delete", localDate: "2026-10-07" }))).toThrow("bodyweight_command_measurement_invalid");
    expect(transitionBodyweight(active, command({ operation: "edit", ownerId: "other", expectedRevision: 1 }))).toMatchObject({ kind: "conflict", conflictCode: "stale_revision" });
    expect(transitionBodyweight(deleted, command({ operation: "edit", expectedRevision: 2 }))).toMatchObject({ kind: "conflict", conflictCode: "lifecycle_conflict" });
    expect(transitionBodyweight(deleted, noMeasurementDelete)).toMatchObject({ kind: "conflict", conflictCode: "lifecycle_conflict" });
  });

  it("validates before delegating and returns the committed transition unchanged", async () => {
    const repository = { commit: jest.fn(async (input: BodyweightCommand) => transitionBodyweight(undefined, input)) };
    await expect(commitBodyweightCommand(repository, command(), async (value) => sha256(value))).resolves.toMatchObject({ kind: "created" });
    await expect(commitBodyweightCommand(repository, command({ grams: 0 }), async (value) => sha256(value))).rejects.toThrow(BodyweightCommandError);
    expect(repository.commit).toHaveBeenCalledTimes(1);
  });

  it("covers canonical nested values plus every create and missing-entry conflict", () => {
    expect(canonicalBodyweightRequestHash({ z: [2, { b: 1, a: null }], a: true })).toBe(canonicalBodyweightRequestHash({ a: true, z: [2, { a: null, b: 1 }] }));
    expect(() => transitionBodyweight(undefined, command({ localDate: "not-a-date" }))).toThrow("bodyweight_command_measurement_invalid");
    expect(transitionBodyweight(active, command({ operation: "create", expectedRevision: 0 }))).toMatchObject({ kind: "conflict", conflictCode: "entry_exists" });
    expect(transitionBodyweight(undefined, command({ operation: "create", expectedRevision: 1 }))).toMatchObject({ kind: "conflict", conflictCode: "stale_revision" });
    expect(transitionBodyweight(undefined, command({ operation: "delete", expectedRevision: 1, localDate: undefined, timezone: undefined, grams: undefined }))).toMatchObject({ kind: "conflict", conflictCode: "entry_missing" });
  });
});
