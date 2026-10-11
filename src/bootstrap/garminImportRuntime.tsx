import {
  confirmGarminImportDate,
  prepareGarminImport,
  type ConfirmGarminImportInput,
  type GarminImportResult,
  type GarminSha256,
  type ImportedActivityCommandRepository,
} from "../domains/activities/importCommands";
import type { GarminSourceEnvelope } from "../domains/activities/garminActivitySourcePort";

export type GarminImportConfirmation = Omit<
  ConfirmGarminImportInput,
  "staged"
>;

export type GarminImportRuntimeServices = Readonly<{
  /** Created once from the application-owned SqliteKernel during root bootstrap. */
  importedActivities: ImportedActivityCommandRepository;
}>;

export type GarminImportRuntime = Readonly<{
  commitEnvelope(input: Readonly<{
    envelope: GarminSourceEnvelope;
    confirmation: GarminImportConfirmation;
  }>): Promise<GarminImportResult>;
}>;

/**
 * Framework-light facade over the existing application import service. It owns
 * neither a kernel nor a repository, so Garmin paths cannot open a second
 * SQLite connection or bypass the shared Phase 13 commands.
 */
export function createGarminImportRuntime(input: Readonly<{
  services: GarminImportRuntimeServices;
  sha256: GarminSha256;
  invalidateReads(): Promise<void>;
}>): GarminImportRuntime {
  return Object.freeze({
    async commitEnvelope({ envelope, confirmation }) {
      const staged = await prepareGarminImport(envelope, input.sha256);
      const result = await confirmGarminImportDate(
        input.services.importedActivities,
        { ...confirmation, staged },
      );
      if (result.kind === "imported") {
        await input.invalidateReads();
      }
      return result;
    },
  });
}
