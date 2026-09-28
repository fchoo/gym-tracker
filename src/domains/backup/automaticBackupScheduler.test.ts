import { describe, expect, it } from "@jest/globals";
import { createAutomaticBackupScheduler } from "./automaticBackupScheduler";

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
    await Promise.resolve();
    expect(calls).toBe(0);
    active = false;
    scheduler.request("foreground");
    await Promise.resolve();
    expect(calls).toBe(1);
  });
});
