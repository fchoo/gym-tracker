export type AutomaticBackupRequest = "launch" | "foreground" | "post_commit" | "manual" | "retry" | "background";

export type AutomaticBackupScheduler = Readonly<{
  request(reason: AutomaticBackupRequest): void;
}>;

/** A fire-and-forget coalescer; callers never await network backup work. */
export function createAutomaticBackupScheduler(input: Readonly<{
  isWorkoutActive(): boolean;
  run(reason: AutomaticBackupRequest): Promise<void>;
  queue(work: () => void): void;
}>): AutomaticBackupScheduler {
  let queued = false;
  let running = false;
  let pending: AutomaticBackupRequest | null = null;
  const drain = () => {
    queued = false;
    if (running || pending === null || input.isWorkoutActive()) return;
    const reason = pending;
    pending = null;
    running = true;
    void input.run(reason).catch(() => undefined).finally(() => {
      running = false;
      if (pending !== null) schedule();
    });
  };
  const schedule = () => {
    if (queued) return;
    queued = true;
    input.queue(drain);
  };
  return Object.freeze({
    request(reason) {
      pending = reason;
      schedule();
    },
  });
}
