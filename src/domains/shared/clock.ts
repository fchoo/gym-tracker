export interface Clock {
  nowMs(): number;
  monotonicNowMs(): number;
}

export class SystemClock implements Clock {
  nowMs(): number {
    return Date.now();
  }

  monotonicNowMs(): number {
    return globalThis.performance.now();
  }
}

function assertFiniteTime(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be non-negative finite milliseconds`);
  }
}

export class FakeClock implements Clock {
  private wallTimeMs: number;
  private monotonicTimeMs: number;

  constructor(wallTimeMs = 0, monotonicTimeMs = 0) {
    assertFiniteTime(wallTimeMs, "wallTimeMs");
    assertFiniteTime(monotonicTimeMs, "monotonicTimeMs");
    this.wallTimeMs = wallTimeMs;
    this.monotonicTimeMs = monotonicTimeMs;
  }

  nowMs(): number {
    return this.wallTimeMs;
  }

  monotonicNowMs(): number {
    return this.monotonicTimeMs;
  }

  advanceBy(durationMs: number): void {
    assertFiniteTime(durationMs, "durationMs");
    this.wallTimeMs += durationMs;
    this.monotonicTimeMs += durationMs;
  }

  setNowMs(nextWallTimeMs: number): void {
    assertFiniteTime(nextWallTimeMs, "nextWallTimeMs");
    if (nextWallTimeMs < this.wallTimeMs) {
      throw new RangeError("FakeClock cannot move backwards");
    }

    this.advanceBy(nextWallTimeMs - this.wallTimeMs);
  }
}
