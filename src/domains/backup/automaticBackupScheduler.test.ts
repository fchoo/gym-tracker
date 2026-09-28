import { describe, expect, it, jest } from "@jest/globals";
import { createAutomaticBackupScheduler } from "./automaticBackupScheduler";

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("automatic backup scheduler", () => {
  it("coalesces committed mutations and never invokes Drive while a workout is active", async () => {
    let active = true;
    let calls = 0;
    const scheduler = createAutomaticBackupScheduler({
      isWorkoutActive: () => active,
      run: async () => { calls += 1; },
      queue: (work) => { void work(); },
    });
    scheduler.request("post_commit");
    scheduler.request("post_commit");
    await settle();
    expect(calls).toBe(0);
    active = false;
    scheduler.request("foreground");
    await settle();
    expect(calls).toBe(1);
  });

  it("rechecks authoritative workout activity after async eligibility resolves", async () => {
    let resolveEligibility: ((value: boolean) => void) | undefined;
    let active = false;
    const run = jest.fn(async () => undefined);
    const scheduler = createAutomaticBackupScheduler({
      isWorkoutActive: async () => active,
      eligible: () => new Promise<boolean>((resolve) => { resolveEligibility = resolve; }),
      run,
      queue: (work) => { void work(); },
    });

    scheduler.request("manual");
    await Promise.resolve();
    active = true;
    resolveEligibility?.(true);
    await settle();

    expect(run).not.toHaveBeenCalled();
  });
});
