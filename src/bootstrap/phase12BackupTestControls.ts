export type Phase12BackupFixture = "disconnected" | "no_cloud" | "restore_required" | "previous_available" | "update_required" | "pending_24h" | "stale_writer" | "deleted";

const allowed = new Set<Phase12BackupFixture>(["disconnected", "no_cloud", "restore_required", "previous_available", "update_required", "pending_24h", "stale_writer", "deleted"]);

/**
 * Development-test parser only. It deliberately requires the embedded native
 * contract identity as well as the suite/fixture pair: query strings, deep
 * links, and environment variables cannot enable fakes in production.
 */
export function phase12BackupFixtureFromNativeContract(input: Readonly<{
  suite: string | undefined;
  fixture: string | undefined;
  nativeContractsEnabled?: boolean;
  buildProfile?: string | undefined;
}>): Phase12BackupFixture | null {
  if (input.nativeContractsEnabled !== true || input.buildProfile !== "development-test" || input.suite !== "phase12" || input.fixture === undefined || !allowed.has(input.fixture as Phase12BackupFixture)) return null;
  return input.fixture as Phase12BackupFixture;
}
