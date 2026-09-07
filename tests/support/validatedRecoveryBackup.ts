import type {
  RecoveryBackupPort,
} from "../../src/platform/sqlite/recoveryBackup";

export function validatedRecoveryBackup(
  backupId = "test-migration-recovery",
): RecoveryBackupPort {
  return {
    createAndValidate: async (request) => ({
      backupId,
      databaseName: request.databaseName,
      fromVersion: request.fromVersion,
      toVersion: request.toVersion,
      validated: true,
    }),
  };
}
