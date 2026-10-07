import { describe, expect, it } from "@jest/globals";

import {
  BodyweightCommandError,
  canonicalBodyweightRequestHash,
  transitionBodyweight,
  type BodyweightCommand,
  type BodyweightEntryState,
} from "./contracts";

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
});
