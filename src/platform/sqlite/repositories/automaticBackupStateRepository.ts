import type { SqliteKernel } from "../sqliteKernel";

export type AutomaticBackupState = Readonly<{
  environment: "production" | "development-test"; permissionId: string | null; displayEmail: string | null;
  connectionGeneration: number; writerEpoch: number; mutationGeneration: number; backedUpGeneration: number;
}>;

export function createAutomaticBackupStateRepository(kernel: SqliteKernel): Readonly<{
  read(): Promise<AutomaticBackupState>;
  acknowledge(input: Readonly<{ environment: AutomaticBackupState["environment"]; permissionId: string; writerEpoch: number; capturedGeneration: number }>): Promise<boolean>;
}> {
  return Object.freeze({
    async read() {
      const rows = await kernel.queryAll<Record<string, unknown>>("SELECT environment, permission_id, display_email, connection_generation, writer_epoch, mutation_generation, backed_up_generation FROM automatic_backup_state WHERE id = 1");
      const row = rows[0];
      if (rows.length !== 1 || row === undefined || (row.environment !== "production" && row.environment !== "development-test") || !Number.isSafeInteger(row.connection_generation) || !Number.isSafeInteger(row.writer_epoch) || !Number.isSafeInteger(row.mutation_generation) || !Number.isSafeInteger(row.backed_up_generation)) throw new Error("automatic_backup_state_invalid");
      const environment = row.environment as AutomaticBackupState["environment"];
      const connectionGeneration = row.connection_generation as number;
      const writerEpoch = row.writer_epoch as number;
      const mutationGeneration = row.mutation_generation as number;
      const backedUpGeneration = row.backed_up_generation as number;
      return Object.freeze({ environment, permissionId: typeof row.permission_id === "string" ? row.permission_id : null, displayEmail: typeof row.display_email === "string" ? row.display_email : null, connectionGeneration, writerEpoch, mutationGeneration, backedUpGeneration });
    },
    async acknowledge(input: Readonly<{ environment: AutomaticBackupState["environment"]; permissionId: string; writerEpoch: number; capturedGeneration: number }>) {
      const outcome = await kernel.write((transaction) => transaction.execute(
        `UPDATE automatic_backup_state SET backed_up_generation = ? WHERE id = 1
         AND environment = ? AND permission_id = ? AND writer_epoch = ? AND mutation_generation >= ?`,
        [input.capturedGeneration, input.environment, input.permissionId, input.writerEpoch, input.capturedGeneration],
      ));
      return outcome.changes === 1;
    },
  });
}
