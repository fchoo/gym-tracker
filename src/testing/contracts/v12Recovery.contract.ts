export const V12_RECOVERY_CUTS = [
  "pre-transaction", "in-transaction", "post-commit-before-ack", "post-acknowledgement",
  "relaunch", "retry", "offline", "recovery",
] as const;

export const V12_RECOVERY_CASES = [
  "legacy-playback", "foreground-reconciliation", "queued-callback", "relaunch",
  "restore", "merge", "zero-cue", "between-set-rest-pointer",
].map((id) => Object.freeze({ id, cuts: V12_RECOVERY_CUTS })) as readonly Readonly<{
  id: string;
  cuts: typeof V12_RECOVERY_CUTS;
}>[];

export type V12RecoveryContractAdapter = Readonly<{
  observe(definition: (typeof V12_RECOVERY_CASES)[number]): Promise<Readonly<{
    id: string;
    status: "passed" | "failed";
    digest: string;
  }>>;
}>;

export async function runV12RecoveryContract(adapter: V12RecoveryContractAdapter) {
  const cases = [] as Readonly<{ id: string; status: "passed" | "failed"; digest: string; cuts: readonly string[] }>[];
  for (const definition of V12_RECOVERY_CASES) {
    try {
      const observation = await adapter.observe(definition);
      cases.push(Object.freeze({
        id: definition.id,
        status: observation.id === definition.id && observation.status === "passed" && /^[a-f0-9]{64}$/u.test(observation.digest)
          ? "passed" as const : "failed" as const,
        digest: /^[a-f0-9]{64}$/u.test(observation.digest) ? observation.digest : "0".repeat(64),
        cuts: definition.cuts,
      }));
    } catch {
      cases.push(Object.freeze({ id: definition.id, status: "failed" as const, digest: "0".repeat(64), cuts: definition.cuts }));
    }
  }
  const passed = cases.filter((item) => item.status === "passed").length;
  return Object.freeze({ schemaVersion: 1, contractVersion: 1, status: passed === cases.length ? "passed" as const : "failed" as const, total: cases.length, passed, failed: cases.length - passed, skipped: 0 as const, cases });
}
