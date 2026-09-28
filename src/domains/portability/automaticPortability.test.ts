import { describe, expect, it, jest } from "@jest/globals";
import { createAutomaticPortableRestorePort } from "./automaticPortability";

describe("automatic portability", () => {
  it("refuses non-empty or stale-claim direct restore before invoking a writer", async () => {
    const restore = jest.fn(async () => ({ state: "rebuild_pending" as const }));
    const port = createAutomaticPortableRestorePort({ schema: { columnsFor: async () => [] }, candidateProbe: { validateCandidate: async () => undefined }, localIsEmpty: async () => false, claimIsCurrent: async () => true, restore, rebuild: async () => undefined });
    await expect(port.restore({} as never)).rejects.toThrow("restore_archive_unsupported_version");
    expect(restore).not.toHaveBeenCalled();
  });
});
