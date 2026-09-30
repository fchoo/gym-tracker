export type AutomaticBackupRequest = "launch" | "foreground" | "post_commit" | "manual" | "manual_cellular" | "retry" | "background";
export type AutomaticBackupNetworkClass = "wifi" | "cellular_or_metered" | "unavailable" | "unknown";

export type AutomaticBackupScheduler = Readonly<{
  request(reason: AutomaticBackupRequest): void;
  cancel(): void;
}>;

/** A fire-and-forget coalescer; callers never await network backup work. */
export function createAutomaticBackupScheduler(input: Readonly<{
  isWorkoutActive(): boolean | Promise<boolean>;
  run(reason: AutomaticBackupRequest): Promise<void>;
  queue(work: () => void): void;
  eligible?(): boolean | Promise<boolean>;
  networkClass?(): AutomaticBackupNetworkClass | Promise<AutomaticBackupNetworkClass>;
  dataUsePolicy?(): "any-network" | "wifi-only" | Promise<"any-network" | "wifi-only">;
  onCellularConfirmationRequired?(): void;
  isBackgroundAllowed?(): boolean;
  onError?(reason: AutomaticBackupRequest): void;
}>): AutomaticBackupScheduler {
  let queued = false;
  let running = false;
  let pending: AutomaticBackupRequest | null = null;
  const drain = async () => {
    queued = false;
    if (running || pending === null || await input.isWorkoutActive()) return;
    if (input.eligible !== undefined && !await input.eligible()) return;
    const reason = pending;
    if (input.networkClass !== undefined && input.dataUsePolicy !== undefined) {
      const [network, policy] = await Promise.all([input.networkClass(), input.dataUsePolicy()]);
      if (network === "unavailable" || network === "unknown") return;
      if (policy === "wifi-only" && network !== "wifi") {
        if (reason === "manual") {
          pending = null;
          input.onCellularConfirmationRequired?.();
        }
        if (reason !== "manual_cellular") return;
      }
    }
    // A workout may start while the read-only eligibility check is resolving.
    // Recheck immediately before handing work to any network capture.
    if (await input.isWorkoutActive()) return;
    if (reason === "background" && input.isBackgroundAllowed?.() === false) return;
    pending = null;
    running = true;
    void input.run(reason).catch(() => { input.onError?.(reason); }).finally(() => {
      running = false;
      if (pending !== null) schedule();
    });
  };
  const schedule = () => {
    if (queued) return;
    queued = true;
    input.queue(() => { void drain(); });
  };
  return Object.freeze({
    request(reason) {
      const pendingIsManual = pending === "manual" || pending === "manual_cellular";
      const reasonIsManual = reason === "manual" || reason === "manual_cellular";
      if (!pendingIsManual || reasonIsManual) pending = reason;
      schedule();
    },
    cancel() { pending = null; },
  });
}
