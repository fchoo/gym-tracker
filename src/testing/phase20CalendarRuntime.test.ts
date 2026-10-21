import { describe, expect, it } from "@jest/globals";

import {
  phase20CalendarEvidencePathRequested,
  resolvePhase20CalendarIsolatedRuntime,
} from "./phase20CalendarRuntime";

const identity = {
  packageName: "com.fchoo.gymtracker.devtest",
  buildProfile: "development-test",
  nativeContractsEnabled: true,
  suite: "v1.2-acceptance",
} as const;

describe("Phase 20 Calendar isolated runtime", () => {
  it("classifies evidence intent before validating build identity", () => {
    expect(phase20CalendarEvidencePathRequested({
      phase20CalendarFixture: "v12-calendar-isolated-facts-v1",
    })).toBe(true);
    expect(phase20CalendarEvidencePathRequested({ unrelated: "value" })).toBe(false);
  });

  it("derives a nonce-scoped database only for a complete fixture request", () => {
    const nonce = "b".repeat(32);
    expect(resolvePhase20CalendarIsolatedRuntime(identity, {
      phase20CalendarFixture: "v12-calendar-isolated-facts-v1",
      phase20CalendarEvidenceNonce: nonce,
      phase20CalendarRequirementsSha256: "a".repeat(64),
    })).toEqual({
      databaseName: `gym-tracker-phase20-calendar-${nonce}.db`,
      nonce,
    });
    expect(resolvePhase20CalendarIsolatedRuntime(
      { ...identity, buildProfile: "production" },
      {
        phase20CalendarFixture: "v12-calendar-isolated-facts-v1",
        phase20CalendarEvidenceNonce: nonce,
        phase20CalendarRequirementsSha256: "a".repeat(64),
      },
    )).toBeNull();
  });

  it("derives a nonce-scoped database for a validated Calendar observation", () => {
    const nonce = "c".repeat(32);
    expect(resolvePhase20CalendarIsolatedRuntime(identity, {
      phase20CalendarStage: "leap-february",
      phase20CalendarNonce: nonce,
      phase20CalendarFlowSha256: "d".repeat(64),
      phase20CalendarFlowRevision: "calendar-flow-r35-real-v1",
    })).toEqual({
      databaseName: `gym-tracker-phase20-calendar-${nonce}.db`,
      nonce,
    });
  });
});
