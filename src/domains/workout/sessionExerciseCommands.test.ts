import {
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

import type {
  ActiveWorkoutRepository,
  ActiveWorkoutView,
} from "./activeWorkout";
import {
  addExercise,
} from "./sessionExerciseCommands";

const view = {} as ActiveWorkoutView;
const validHash = "a".repeat(64);

function input() {
  return {
    requestId: "add-exercise-1",
    requestSha256: validHash,
    sessionId: "session-1",
    expectedSessionRevision: 1,
    occurredAtMs: 2_000,
    libraryExerciseId: "exercise-1",
    sessionExerciseId: "session-exercise-1",
    setId: "set-1",
  };
}

function repository(): ActiveWorkoutRepository {
  return {
    getActiveWorkout: jest.fn(async () => view),
    getWorkoutSession: jest.fn(async () => view),
    addExercise: jest.fn(async () => ({
      outcome: "committed" as const,
      sessionId: "session-1",
      sessionExerciseId: "session-exercise-1",
      setId: "set-1",
      sessionRevision: 2,
    })),
    updateActiveSetDraft: jest.fn(async () => view),
    updateWarmupDraft: jest.fn(async () => view),
    addWarmup: jest.fn(async () => view),
    addWorkingSet: jest.fn(async () => view),
    copyPreviousWarmup: jest.fn(async () => view),
    completeWarmup: jest.fn(async () => view),
    skipWarmup: jest.fn(async () => view),
    skipWorkingSet: jest.fn(async () => view),
    completeSet: jest.fn(async () => ({ outcome: "already_completed" as const, view })),
    reviseCompletedSet: jest.fn(async () => view),
    undoCompletedSet: jest.fn(async () => ({ outcome: "unavailable" as const })),
  };
}

describe("Phase 09 add-exercise command boundary", () => {
  it.each([
    ["requestId", " invalid "],
    ["sessionId", ""],
    ["libraryExerciseId", "x".repeat(257)],
    ["sessionExerciseId", ""],
    ["setId", ""],
  ])("rejects invalid %s", async (key, value) => {
    const command = { ...input(), [key]: value };
    await expect(addExercise({ repository: repository(), input: command }))
      .rejects.toThrow("add_exercise_identifier_invalid");
  });

  it.each([
    "A".repeat(64),
    "a".repeat(63),
    "z".repeat(64),
  ])("rejects a non-lowercase SHA-256 request hash", async (requestSha256) => {
    await expect(addExercise({
      repository: repository(),
      input: { ...input(), requestSha256 },
    })).rejects.toThrow("add_exercise_hash_invalid");
  });

  it.each([
    { expectedSessionRevision: -1 },
    { expectedSessionRevision: 1.5 },
    { occurredAtMs: -1 },
    { occurredAtMs: 1.5 },
  ])("rejects invalid revision or time values", async (invalid) => {
    await expect(addExercise({
      repository: repository(),
      input: { ...input(), ...invalid },
    })).rejects.toThrow("add_exercise_");
  });

  it("forwards exactly the immutable add envelope to the repository", async () => {
    const port = repository();
    const command = input();

    await expect(addExercise({ repository: port, input: command })).resolves.toEqual({
      outcome: "committed",
      sessionId: "session-1",
      sessionExerciseId: "session-exercise-1",
      setId: "set-1",
      sessionRevision: 2,
    });
    expect(port.addExercise).toHaveBeenCalledWith(command);
  });
});
