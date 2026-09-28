export type Phase12BackupFixture = "disconnected" | "no_cloud" | "restore_required" | "previous_available" | "update_required" | "pending_24h" | "stale_writer" | "deleted";

const allowed = new Set<Phase12BackupFixture>(["disconnected", "no_cloud", "restore_required", "previous_available", "update_required", "pending_24h", "stale_writer", "deleted"]);

/** Development-test parser only. Production callers receive no fixture authority. */
export function phase12BackupFixtureFromNativeContract(input: Readonly<{ suite: string | undefined; fixture: string | undefined }>): Phase12BackupFixture | null {
  if (input.suite !== "phase12" || input.fixture === undefined || !allowed.has(input.fixture as Phase12BackupFixture)) return null;
  return input.fixture as Phase12BackupFixture;
}
