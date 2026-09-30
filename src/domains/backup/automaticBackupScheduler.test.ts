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

  it("cancels a queued request, preserves manual priority, and reports a rejected run", async () => {
    const queued: Array<() => void> = [];
    const errors: string[] = [];
    const scheduler = createAutomaticBackupScheduler({
      isWorkoutActive: () => false,
      eligible: () => true,
      isBackgroundAllowed: () => false,
      run: async (reason) => { if (reason === "manual") throw new Error("offline"); },
      queue: (work) => { queued.push(work); },
      onError: (reason) => { errors.push(reason); },
    });
    scheduler.request("background");
    queued.shift()?.();
    await settle();
    scheduler.request("retry");
    scheduler.request("manual");
    scheduler.request("post_commit");
    queued.shift()?.();
    await settle();
    expect(errors).toEqual(["manual"]);
    scheduler.request("retry");
    scheduler.cancel();
    queued.shift()?.();
    await settle();
    expect(errors).toEqual(["manual"]);
  });

  it("allows an eligible background request and drains a request queued while another run finishes", async () => {
    const queued: Array<() => void> = [];
    let release: (() => void) | undefined;
    const calls: string[] = [];
    const scheduler = createAutomaticBackupScheduler({
      isWorkoutActive: () => false,
      eligible: () => true,
      isBackgroundAllowed: () => true,
      run: async (reason) => {
        calls.push(reason);
        if (reason === "background") await new Promise<void>((resolve) => { release = resolve; });
      },
      queue: (work) => { queued.push(work); },
    });

    scheduler.request("background");
    queued.shift()?.();
    await settle();
    scheduler.request("retry");
    release?.();
    await settle();
    queued.shift()?.();
    await settle();

    expect(calls).toEqual(["background", "retry"]);
  });

  it("coalesces manual priority, cancellation, ineligible, and a workout that starts during eligibility", async () => {
    const queued: Array<() => void> = [];
    const calls: string[] = [];
    let active = false;
    const scheduler = createAutomaticBackupScheduler({
      isWorkoutActive: () => active, eligible: async () => { active = true; return true; },
      run: async (reason) => { calls.push(reason); }, queue: (work) => { queued.push(work); },
    });
    scheduler.request("retry"); scheduler.request("manual"); queued.shift()?.(); await settle();
    expect(calls).toEqual([]);
    active = false;
    const ineligible = createAutomaticBackupScheduler({ isWorkoutActive: () => false, eligible: () => false, run: async (reason) => { calls.push(reason); }, queue: (work) => { queued.push(work); } });
    ineligible.request("manual"); queued.shift()?.(); await settle();
    ineligible.request("retry"); ineligible.cancel(); queued.shift()?.(); await settle();
    expect(calls).toEqual([]);
  });

  it("enforces saved network policy without consuming blocked work", async () => {
    const queued: Array<() => void> = [];
    const calls: string[] = [];
    let network: "wifi" | "cellular_or_metered" | "unavailable" | "unknown" = "cellular_or_metered";
    const scheduler = createAutomaticBackupScheduler({
      isWorkoutActive: () => false,
      networkClass: async () => network,
      dataUsePolicy: async () => "wifi-only" as const,
      run: async (reason) => { calls.push(reason); },
      queue: (work) => { queued.push(work); },
    });

    scheduler.request("post_commit");
    queued.shift()?.(); await settle();
    expect(calls).toEqual([]);
    network = "wifi";
    scheduler.request("foreground");
    queued.shift()?.(); await settle();
    expect(calls).toEqual(["foreground"]);

    network = "unavailable";
    scheduler.request("retry");
    queued.shift()?.(); await settle();
    expect(calls).toEqual(["foreground"]);
  });

  it("consumes a cellular override for exactly one manual attempt", async () => {
    const queued: Array<() => void> = [];
    const calls: string[] = [];
    const confirmations: string[] = [];
    const scheduler = createAutomaticBackupScheduler({
      isWorkoutActive: () => false,
      networkClass: async () => "cellular_or_metered" as const,
      dataUsePolicy: async () => "wifi-only" as const,
      run: async (reason) => { calls.push(reason); },
      queue: (work) => { queued.push(work); },
      onCellularConfirmationRequired: () => { confirmations.push("required"); },
    });

    scheduler.request("manual"); queued.shift()?.(); await settle();
    expect(confirmations).toEqual(["required"]);
    expect(calls).toEqual([]);
    scheduler.request("manual_cellular"); queued.shift()?.(); await settle();
    expect(calls).toEqual(["manual_cellular"]);
    scheduler.request("retry"); queued.shift()?.(); await settle();
    expect(calls).toEqual(["manual_cellular"]);
  });
});
