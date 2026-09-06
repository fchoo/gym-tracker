import {
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

import type {
  ActiveWorkoutRepository,
  ActiveWorkoutView,
  CompleteSetResult,
  SetObservation,
} from "./activeWorkout";
import {
  completeSet,
  removeWarmup,
  removeWorkingSet,
  reviseCompletedSet,
  updateActiveSetDraft,
} from "./setCommands";

const view = {} as ActiveWorkoutView;

function repository(
  completeResult: CompleteSetResult = {
    outcome: "already_completed",
    view,
  },
): ActiveWorkoutRepository {
  return {
    getActiveWorkout: jest.fn(async () => view),
    getWorkoutSession: jest.fn(async () => view),
    updateActiveSetDraft: jest.fn(async () => view),
    updateWarmupDraft: jest.fn(async () => view),
    addWarmup: jest.fn(async () => view),
    addWorkingSet: jest.fn(async () => view),
    copyPreviousWarmup: jest.fn(async () => view),
    completeWarmup: jest.fn(async () => view),
    skipWarmup: jest.fn(async () => view),
    skipWorkingSet: jest.fn(async () => view),
    removeWarmup: jest.fn(async () => ({
      outcome: "committed" as const,
      sessionId: "session-1",
      setId: "set-1",
      sessionRevision: 2,
    })),
    removeWorkingSet: jest.fn(async () => ({
      outcome: "committed" as const,
      sessionId: "session-1",
      setId: "set-1",
      sessionRevision: 2,
    })),
    completeSet: jest.fn(async () => completeResult),
    reviseCompletedSet: jest.fn(async () => view),
    undoCompletedSet: jest.fn<ActiveWorkoutRepository["undoCompletedSet"]>(
      async () => ({ outcome: "unavailable" as const }),
    ),
  };
}

const removeHash = "a".repeat(64);

function removeInput() {
  return {
    requestId: "remove-session-1-set-1",
    requestSha256: removeHash,
    sessionId: "session-1",
    setId: "set-1",
    expectedSessionRevision: 1,
    expectedSetRevision: 4,
    removedAtMs: 2_000,
  };
}

function activeInput(observation: SetObservation) {
  return {
    sessionId: "session-1",
    setId: "set-1",
    expectedSetRevision: 1,
    metricIdentity: {
      profile: observation.profile,
      contractVersion: observation.version,
      exerciseMetricGeneration: 1,
    },
    observation,
    updatedAtMs: 2_000,
  };
}

function completeInput(observation: SetObservation) {
  return {
    sessionId: "session-1",
    setId: "set-1",
    expectedSessionRevision: 1,
    expectedSetRevision: 1,
    completionIdempotencyKey: "complete-1",
    metricIdentity: {
      profile: observation.profile,
      contractVersion: observation.version,
      exerciseMetricGeneration: 1,
    },
    observation,
    completedAtMs: 2_000,
  };
}

describe("Plan 01-08 set command validation", () => {
  it.each([
    {
      observation: {
        version: 2,
        profile: "load_reps",
        loadGrams: 60_000,
        reps: 8,
        source: "manual",
      },
      error: "unsupported_observation_version",
    },
    {
      observation: {
        version: 1,
        profile: "load_reps",
        loadGrams: -1,
        reps: 8,
        source: "manual",
      },
      error: "invalid_load_reps_observation",
    },
    {
      observation: {
        version: 1,
        profile: "load_reps",
        loadGrams: 60_000,
        reps: -1,
        source: "manual",
      },
      error: "invalid_load_reps_observation",
    },
    {
      observation: {
        version: 1,
        profile: "timed_hold",
        durationSeconds: -1,
        source: "manual",
      },
      error: "invalid_timed_hold_observation",
    },
  ])("rejects $error", async ({ observation, error }) => {
    await expect(updateActiveSetDraft({
      repository: repository(),
      input: activeInput(observation as SetObservation),
    })).rejects.toThrow(error);
  });

  it("allows zero-value drafts but rejects zero-value completed observations", async () => {
    const port = repository();
    const loadDraft = {
      version: 1,
      profile: "load_reps",
      loadGrams: 0,
      reps: 0,
      source: "manual",
    } as const;
    const holdDraft = {
      version: 1,
      profile: "timed_hold",
      durationSeconds: 0,
      source: "manual",
    } as const;

    await expect(updateActiveSetDraft({
      repository: port,
      input: activeInput(loadDraft),
    })).resolves.toBe(view);
    await expect(updateActiveSetDraft({
      repository: port,
      input: activeInput(holdDraft),
    })).resolves.toBe(view);

    await expect(completeSet({
      repository: port,
      haptics: { committed: jest.fn(async () => undefined) },
      invalidate: jest.fn(async () => undefined),
      drainEffects: jest.fn(async () => undefined),
      input: completeInput(loadDraft),
    })).rejects.toThrow("invalid_load_reps_observation");
    await expect(completeSet({
      repository: port,
      haptics: { committed: jest.fn(async () => undefined) },
      invalidate: jest.fn(async () => undefined),
      drainEffects: jest.fn(async () => undefined),
      input: completeInput(holdDraft),
    })).rejects.toThrow("invalid_timed_hold_observation");
  });

  it("does not run post-commit derivatives for an already-completed set", async () => {
    const invalidate = jest.fn(async () => undefined);
    const committed = jest.fn(async () => undefined);
    const drainEffects = jest.fn(async () => undefined);

    await expect(completeSet({
      repository: repository(),
      haptics: { committed },
      invalidate,
      drainEffects,
      input: completeInput({
        version: 1,
        profile: "timed_hold",
        durationSeconds: 30,
        source: "manual",
      }),
    })).resolves.toMatchObject({ outcome: "already_completed" });

    expect(invalidate).not.toHaveBeenCalled();
    expect(committed).not.toHaveBeenCalled();
    expect(drainEffects).not.toHaveBeenCalled();
  });

  it("keeps a committed set successful when every derivative rejects", async () => {
    await expect(completeSet({
      repository: repository({ outcome: "committed", view }),
      haptics: {
        committed: jest.fn(async () => Promise.reject(new Error("haptic"))),
      },
      invalidate: jest.fn(async () => Promise.reject(new Error("invalidate"))),
      drainEffects: jest.fn(async () => Promise.reject(new Error("drain"))),
      input: completeInput({
        version: 1,
        profile: "timed_hold",
        durationSeconds: 30,
        source: "manual",
      }),
    })).resolves.toMatchObject({ outcome: "committed" });
  });
});

describe("Plan 07-02 hard-remove command validation", () => {
  it("forwards distinct warm-up and working-set removal commands without skip semantics", async () => {
    const port = repository();
    const warmup = removeInput();
    const working = { ...removeInput(), requestId: "remove-working-1" };

    await expect(removeWarmup({ repository: port, input: warmup }))
      .resolves.toEqual({
        outcome: "committed",
        sessionId: "session-1",
        setId: "set-1",
        sessionRevision: 2,
      });
    await expect(removeWorkingSet({ repository: port, input: working }))
      .resolves.toEqual({
        outcome: "committed",
        sessionId: "session-1",
        setId: "set-1",
        sessionRevision: 2,
      });

    expect(port.removeWarmup).toHaveBeenCalledWith(warmup);
    expect(port.removeWorkingSet).toHaveBeenCalledWith(working);
    expect(port.skipWarmup).not.toHaveBeenCalled();
    expect(port.skipWorkingSet).not.toHaveBeenCalled();
  });

  it.each([
    ["empty request ID", { requestId: " " }, "remove_set_identifier_invalid"],
    ["invalid request hash", { requestSha256: "bad" }, "remove_set_hash_invalid"],
    ["stale-shaped session revision", { expectedSessionRevision: -1 }, "remove_set_revision_invalid"],
    ["stale-shaped set revision", { expectedSetRevision: 1.5 }, "remove_set_revision_invalid"],
    ["invalid removal time", { removedAtMs: -1 }, "remove_set_time_invalid"],
  ])("rejects %s before repository access", async (...[_name, change, code]) => {
    const port = repository();

    await expect(removeWarmup({
      repository: port,
      input: { ...removeInput(), ...change },
    })).rejects.toThrow(code);

    expect(port.removeWarmup).not.toHaveBeenCalled();
  });

  it.each([
    ["warm-up", removeWarmup, "removeWarmup", "remove_warmup_unavailable"],
    ["working-set", removeWorkingSet, "removeWorkingSet", "remove_working_set_unavailable"],
  ])("rejects a valid %s removal when its repository capability is unavailable", async (
    _kind,
    remove,
    capability,
    error,
  ) => {
    const port = repository();
    const unavailable = { ...port, [capability]: undefined } as ActiveWorkoutRepository;

    await expect(remove({ repository: unavailable, input: removeInput() })).rejects.toThrow(error);
  });
});

const authoritativeObservations: readonly SetObservation[] = [
  {
    version: 1,
    profile: "load_reps",
    loadGrams: 60_000,
    reps: 8,
    source: "manual",
  },
  {
    version: 1,
    profile: "bodyweight_reps",
    reps: 12,
    source: "manual",
  },
  {
    version: 1,
    profile: "added_load_reps",
    addedLoadGrams: 10_000,
    reps: 8,
    source: "manual",
  },
  {
    version: 1,
    profile: "assisted_reps",
    assistanceGrams: 20_000,
    reps: 8,
    source: "manual",
  },
  {
    version: 1,
    profile: "timed_hold",
    durationSeconds: 45,
    source: "manual",
  },
  {
    version: 2,
    profile: "timed_hold",
    durationMs: 45_250,
    source: "manual",
  },
  {
    version: 1,
    profile: "fixed_distance",
    distanceMeters: 2_000,
    durationMs: 720_000,
    source: "manual",
  },
  {
    version: 1,
    profile: "fixed_time",
    durationMs: 720_000,
    distanceMeters: 2_400,
    source: "manual",
  },
  {
    version: 1,
    profile: "intervals",
    protocolId: "bike_30_30_6",
    completedRounds: 6,
    completedWorkMs: 180_000,
    source: "manual",
  },
  {
    version: 1,
    profile: "unscored",
    completed: true,
    source: "manual",
  },
];

describe("Plan 02-10 authoritative set command validation", () => {
  it.each(authoritativeObservations)(
    "accepts $profile contract $version through the registry",
    async (observation) => {
      const port = repository();

      await expect(updateActiveSetDraft({
        repository: port,
        input: activeInput(observation),
      })).resolves.toBe(view);
      expect(port.updateActiveSetDraft).toHaveBeenCalledWith(
        activeInput(observation),
      );
    },
  );

  it.each([
    ["bodyweight reps", {
      ...authoritativeObservations[1],
      reps: 0,
    }],
    ["added load reps", {
      ...authoritativeObservations[2],
      reps: 0,
    }],
    ["assisted reps", {
      ...authoritativeObservations[3],
      reps: 0,
    }],
    ["timed hold milliseconds", {
      ...authoritativeObservations[5],
      durationMs: 0,
    }],
    ["fixed distance", {
      ...authoritativeObservations[6],
      distanceMeters: 0,
    }],
    ["fixed time", {
      ...authoritativeObservations[7],
      durationMs: 0,
    }],
    ["interval rounds", {
      ...authoritativeObservations[8],
      completedRounds: -1,
    }],
    ["unscored completion", {
      ...authoritativeObservations[9],
      completed: "yes",
    }],
  ] as const)(
    "rejects invalid %s before repository access",
    async (...[_name, observation]) => {
      const port = repository();

      await expect(updateActiveSetDraft({
        repository: port,
        input: activeInput(observation as SetObservation),
      })).rejects.toThrow("metric_observation_invalid");
      expect(port.updateActiveSetDraft).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["unscored completion", {
      version: 1,
      profile: "unscored",
      completed: false,
      source: "manual",
    }],
    ["fixed-time distance", {
      version: 1,
      profile: "fixed_time",
      durationMs: 720_000,
      distanceMeters: 0,
      source: "manual",
    }],
    ["interval work", {
      version: 1,
      profile: "intervals",
      protocolId: "bike_30_30_6",
      completedRounds: 0,
      completedWorkMs: 0,
      source: "manual",
    }],
  ] as const)(
    "rejects incomplete completed %s before repository access",
    async (...[_name, observation]) => {
      const port = repository();

      await expect(completeSet({
        repository: port,
        haptics: { committed: jest.fn(async () => undefined) },
        invalidate: jest.fn(async () => undefined),
        drainEffects: jest.fn(async () => undefined),
        input: completeInput(observation),
      })).rejects.toThrow("metric_observation_invalid");
      expect(port.completeSet).not.toHaveBeenCalled();
    },
  );
});

describe("Plan 02-27 completed working-set correction", () => {
  function correctionInput(observation: SetObservation) {
    return {
      sessionId: "session-1",
      setId: "set-1",
      expectedSessionRevision: 4,
      expectedSetRevision: 2,
      correctionIdempotencyKey: "correction-session-1-set-1-revision-2",
      metricIdentity: {
        profile: observation.profile,
        contractVersion: observation.version,
        exerciseMetricGeneration: 1,
      },
      observation,
      revisedAtMs: 3_000,
    };
  }

  it("validates a completed replacement observation before forwarding it", async () => {
    const port = repository();
    const input = correctionInput({
      version: 1,
      profile: "load_reps",
      loadGrams: 62_500,
      reps: 8,
      source: "manual",
    });

    await expect(reviseCompletedSet({
      repository: port,
      input,
    })).resolves.toBe(view);
    expect(port.reviseCompletedSet).toHaveBeenCalledWith(input);
  });

  it("rejects invalid completed correction input without mutating the repository", async () => {
    const port = repository();

    await expect(reviseCompletedSet({
      repository: port,
      input: correctionInput({
        version: 1,
        profile: "load_reps",
        loadGrams: 62_500,
        reps: 0,
        source: "manual",
      }),
    })).rejects.toThrow("invalid_load_reps_observation");
    expect(port.reviseCompletedSet).not.toHaveBeenCalled();
  });

  it("requires a deterministic correction request identity", async () => {
    const port = repository();
    const input = correctionInput({
      version: 1,
      profile: "load_reps",
      loadGrams: 62_500,
      reps: 8,
      source: "manual",
    });

    await expect(reviseCompletedSet({
      repository: port,
      input: { ...input, correctionIdempotencyKey: " " },
    })).rejects.toThrow("invalid_correction_idempotency_key");
    expect(port.reviseCompletedSet).not.toHaveBeenCalled();
  });
});
