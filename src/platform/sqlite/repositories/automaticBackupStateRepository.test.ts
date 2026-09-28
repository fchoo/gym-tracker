import { describe, expect, it } from "@jest/globals";
import type { SqliteKernel, SqliteTransactionExecutor } from "../sqliteKernel";
import { createAutomaticBackupStateRepository } from "./automaticBackupStateRepository";

describe("automatic backup state repository", () => {
  it("returns only bounded state and conditionally acknowledges captured generation", async () => {
    const repository = createAutomaticBackupStateRepository({
      queryAll: async () => [{ environment: "development-test", permission_id: "permission", display_email: "…@example.com", connection_generation: 2, writer_epoch: 3, mutation_generation: 5, backed_up_generation: 4 }],
      write: async (command: (transaction: SqliteTransactionExecutor) => Promise<unknown>) => command({ execute: async () => ({ changes: 1, lastInsertRowId: 0 }), queryAll: async () => [] }), connectionConfiguration: async () => undefined, close: async () => undefined,
    } as unknown as SqliteKernel);
    await expect(repository.read()).resolves.toMatchObject({ environment: "development-test", mutationGeneration: 5 });
    await expect(repository.acknowledge({ environment: "development-test", permissionId: "permission", writerEpoch: 3, capturedGeneration: 5 })).resolves.toBe(true);
  });
});
