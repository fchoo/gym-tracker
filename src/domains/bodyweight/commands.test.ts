import { describe, expect, it, jest } from "@jest/globals";
import { createHash } from "node:crypto";

import { canonicalBodyweightRequestPayload, type BodyweightCommand } from "./contracts";
import { commitBodyweightCommand } from "./commands";

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
    grams: 62_500,
    ...overrides,
  };
  const { requestSha256, ...request } = value;
  return {
    ...request,
    requestSha256: requestSha256 ?? createHash("sha256")
      .update(canonicalBodyweightRequestPayload(request)).digest("hex"),
  };
}

describe("bodyweight command boundary", () => {
  it("returns an existing receipt transition unchanged for a matching canonical request", async () => {
    const receipt = Object.freeze({ kind: "created" as const, entry: undefined });
    const repository = { commit: jest.fn(async () => receipt) };
    const value = command();

    await expect(commitBodyweightCommand(
      repository,
      value,
      async (canonical) => createHash("sha256").update(canonical).digest("hex"),
    )).resolves.toBe(receipt);
    expect(repository.commit).toHaveBeenCalledWith(value);
  });

  it("rejects invalid measurements before the repository can stage a write", async () => {
    const repository = { commit: jest.fn(async () => ({ kind: "created" as const, entry: undefined })) };
    await expect(commitBodyweightCommand(
      repository,
      command({ grams: 19_900 }),
      async (canonical) => createHash("sha256").update(canonical).digest("hex"),
    )).rejects.toThrow("bodyweight_command_measurement_invalid");
    expect(repository.commit).not.toHaveBeenCalled();
  });
});
