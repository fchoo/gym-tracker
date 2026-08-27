import {
  describe,
  expect,
  it,
} from "@jest/globals";

import {
  FakeClock,
  SystemClock,
} from "./index";

describe("Clock", () => {
  it("uses wall and monotonic time through the system clock", () => {
    const clock = new SystemClock();

    expect(clock.nowMs()).toBeGreaterThan(0);
    expect(clock.monotonicNowMs()).toBeGreaterThanOrEqual(0);
  });

  it("advances wall and monotonic time deterministically", () => {
    const clock = new FakeClock(1_726_780_800_000, 125);

    clock.advanceBy(5_000);

    expect(clock.nowMs()).toBe(1_726_780_805_000);
    expect(clock.monotonicNowMs()).toBe(5_125);
  });

  it("supports deterministic zero defaults and forward wall-time setting", () => {
    const clock = new FakeClock();

    clock.setNowMs(2_500);

    expect(clock.nowMs()).toBe(2_500);
    expect(clock.monotonicNowMs()).toBe(2_500);
  });

  it("drives expiry, lease, retry, and performance calculations", () => {
    const clock = new FakeClock(10_000, 0);
    const expiryAtMs = clock.nowMs() + 30_000;
    const leaseExpiresAtMs = clock.nowMs() + 10_000;
    const retryAtMs = clock.nowMs() + 5_000;
    const startedAtMs = clock.monotonicNowMs();

    clock.advanceBy(12_500);

    expect(clock.nowMs() >= expiryAtMs).toBe(false);
    expect(clock.nowMs() >= leaseExpiresAtMs).toBe(true);
    expect(clock.nowMs() >= retryAtMs).toBe(true);
    expect(clock.monotonicNowMs() - startedAtMs).toBe(12_500);
  });

  it("rejects backward or non-finite time movement", () => {
    const clock = new FakeClock(10_000);

    expect(() => new FakeClock(Number.NaN)).toThrow("non-negative finite");
    expect(() => clock.advanceBy(-1)).toThrow("non-negative finite");
    expect(() => clock.setNowMs(9_999)).toThrow("cannot move backwards");
    expect(() => clock.advanceBy(Number.POSITIVE_INFINITY)).toThrow(
      "non-negative finite",
    );
  });
});
