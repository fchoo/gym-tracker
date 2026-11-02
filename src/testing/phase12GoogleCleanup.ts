export const PHASE12_GOOGLE_CLEANUP_CONFIRMATION = "DELETE-DEVELOPMENT-TEST-BACKUPS";
export const PHASE12_GOOGLE_CLEANUP_RESULT_MARKER = "GYM_TRACKER_PHASE12_GOOGLE_CLEANUP_RESULT:";

type CleanupDrive = Readonly<{
  discover(): Promise<readonly Readonly<{ fileId: string }>[] >;
  deleteTombstoned(fileId: string): Promise<void>;
}>;

export function phase12GoogleCleanupEnabled(input: Readonly<{
  buildProfile: unknown;
  nativeContractsEnabled: unknown;
  suite: unknown;
  confirmation: unknown;
}>): boolean {
  return input.buildProfile === "development-test"
    && input.nativeContractsEnabled === true
    && input.suite === "phase12"
    && input.confirmation === PHASE12_GOOGLE_CLEANUP_CONFIRMATION;
}

export async function cleanupPhase12GoogleNamespace(input: Readonly<{
  drive: CleanupDrive;
  wait?: () => Promise<void>;
  maxPasses?: number;
}>): Promise<Readonly<{ deleted: number; remaining: 0 }>> {
  const deleted = new Set<string>();
  const wait = input.wait ?? (() => new Promise((resolve) => setTimeout(resolve, 1_000)));
  const maxPasses = input.maxPasses ?? 8;
  let consecutiveEmpty = 0;
  for (let pass = 0; pass < maxPasses; pass += 1) {
    const objects = await input.drive.discover();
    if (objects.length === 0) {
      consecutiveEmpty += 1;
      if (consecutiveEmpty === 2) return Object.freeze({ deleted: deleted.size, remaining: 0 as const });
    } else {
      consecutiveEmpty = 0;
      for (const object of objects) {
        await input.drive.deleteTombstoned(object.fileId);
        deleted.add(object.fileId);
      }
    }
    await wait();
  }
  throw new Error("phase12_google_cleanup_incomplete");
}
