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
  removeExercise,
  reorderExercises,
  replaceExercise,
} from "./sessionExerciseCommands";

const view = {} as ActiveWorkoutView;
const validHash = "a".repeat(64);

function addInput() {
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

function replaceInput() {
  return {
    requestId: "replace-exercise-1",
    requestSha256: validHash,
    sessionId: "session-1",
    expectedSessionRevision: 1,
    sessionExerciseId: "original-exercise-1",
    expectedSessionExerciseRevision: 2,
    occurredAtMs: 2_000,
    libraryExerciseId: "replacement-library-1",
    replacementSessionExerciseId: "replacement-exercise-1",
    replacementSetId: "replacement-set-1",
  };
}

function removeInput() {
  return {
    requestId: "remove-exercise-1",
    requestSha256: validHash,
    sessionId: "session-1",
    expectedSessionRevision: 1,
    sessionExerciseId: "session-exercise-1",
    expectedSessionExerciseRevision: 2,
    occurredAtMs: 2_000,
  };
}

function reorderInput() {
  return {
    requestId: "reorder-exercises-1",
    requestSha256: validHash,
    sessionId: "session-1",
    expectedSessionRevision: 1,
    occurredAtMs: 2_000,
    orderedSessionExerciseIds: [
      "session-exercise-2",
      "session-exercise-1",
    ],
    expectedSessionExerciseRevisions: [
      { sessionExerciseId: "session-exercise-2", revision: 3 },
      { sessionExerciseId: "session-exercise-1", revision: 2 },
    ],
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
    replaceExercise: jest.fn(async () => ({
      outcome: "committed" as const,
      disposition: "deleted_provisional" as const,
      sessionId: "session-1",
      sessionExerciseId: "original-exercise-1",
      replacementSessionExerciseId: "replacement-exercise-1",
      replacementSetId: "replacement-set-1",
      sessionRevision: 2,
    })),
    removeExercise: jest.fn(async () => ({
      outcome: "committed" as const,
      disposition: "deleted_provisional" as const,
      sessionId: "session-1",
      sessionExerciseId: "session-exercise-1",
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
    const command = { ...addInput(), [key]: value };
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
      input: { ...addInput(), requestSha256 },
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
      input: { ...addInput(), ...invalid },
    })).rejects.toThrow("add_exercise_");
  });

  it("forwards exactly the immutable add envelope to the repository", async () => {
    const port = repository();
    const command = addInput();

    await expect(addExercise({ repository: port, input: command })).resolves.toEqual({
      outcome: "committed",
      sessionId: "session-1",
      sessionExerciseId: "session-exercise-1",
      setId: "set-1",
      sessionRevision: 2,
    });
    expect(port.addExercise).toHaveBeenCalledWith(command);
  });

  it("fails closed when the repository does not expose add support", async () => {
    const port = repository();
    delete port.addExercise;
    await expect(addExercise({ repository: port, input: addInput() }))
      .rejects.toThrow("add_exercise_unavailable");
  });
});

describe("Phase 09 Replace and Remove command boundary", () => {
  it.each([
    ["requestId", " invalid "],
    ["sessionId", ""],
    ["sessionExerciseId", ""],
    ["libraryExerciseId", ""],
    ["replacementSessionExerciseId", ""],
    ["replacementSetId", ""],
  ])("rejects invalid replace %s", async (key, value) => {
    await expect(replaceExercise({
      repository: repository(),
      input: { ...replaceInput(), [key]: value },
    })).rejects.toThrow("replace_exercise_identifier_invalid");
  });

  it.each([
    ["requestId", " invalid "],
    ["sessionId", ""],
    ["sessionExerciseId", ""],
  ])("rejects invalid remove %s", async (key, value) => {
    await expect(removeExercise({
      repository: repository(),
      input: { ...removeInput(), [key]: value },
    })).rejects.toThrow("remove_exercise_identifier_invalid");
  });

  it.each([
    { requestSha256: "A".repeat(64) },
    { requestSha256: "a".repeat(63) },
    { expectedSessionRevision: -1 },
    { expectedSessionExerciseRevision: 1.5 },
    { occurredAtMs: -1 },
  ])("rejects malformed replace envelopes", async (invalid) => {
    await expect(replaceExercise({
      repository: repository(),
      input: { ...replaceInput(), ...invalid },
    })).rejects.toThrow("replace_exercise_");
  });

  it.each([
    { requestSha256: "A".repeat(64) },
    { requestSha256: "a".repeat(63) },
    { expectedSessionRevision: -1 },
    { expectedSessionExerciseRevision: 1.5 },
    { occurredAtMs: -1 },
  ])("rejects malformed remove envelopes", async (invalid) => {
    await expect(removeExercise({
      repository: repository(),
      input: { ...removeInput(), ...invalid },
    })).rejects.toThrow("remove_exercise_");
  });

  it("forwards exact Replace and Remove envelopes and keeps history-preserved outcomes explicit", async () => {
    const port = repository();
    const replacement = replaceInput();
    const removal = removeInput();
    (port.removeExercise as unknown as {
      mockResolvedValueOnce(value: unknown): void;
    }).mockResolvedValueOnce({
      outcome: "committed",
      disposition: "skipped_history_preserved" as const,
      sessionId: removal.sessionId,
      sessionExerciseId: removal.sessionExerciseId,
      sessionRevision: 2,
    });

    await expect(replaceExercise({ repository: port, input: replacement }))
      .resolves.toMatchObject({ outcome: "committed" });
    await expect(removeExercise({ repository: port, input: removal }))
      .resolves.toEqual({
        outcome: "committed",
        disposition: "skipped_history_preserved",
        sessionId: removal.sessionId,
        sessionExerciseId: removal.sessionExerciseId,
        sessionRevision: 2,
      });
    expect(port.replaceExercise).toHaveBeenCalledWith(replacement);
    expect(port.removeExercise).toHaveBeenCalledWith(removal);
  });

  it("fails closed when Replace or Remove capability is unavailable", async () => {
    const port = repository();
    delete port.replaceExercise;
    delete port.removeExercise;

    await expect(replaceExercise({ repository: port, input: replaceInput() }))
      .rejects.toThrow("replace_exercise_unavailable");
    await expect(removeExercise({ repository: port, input: removeInput() }))
      .rejects.toThrow("remove_exercise_unavailable");
  });
});

describe("Phase 09 reorder command boundary", () => {
  it.each([
    { orderedSessionExerciseIds: [] },
    { orderedSessionExerciseIds: ["session-exercise-1", "session-exercise-1"] },
    { expectedSessionExerciseRevisions: [] },
    {
      expectedSessionExerciseRevisions: [
        { sessionExerciseId: "session-exercise-2", revision: 3 },
        { sessionExerciseId: "session-exercise-3", revision: 2 },
      ],
    },
    {
      expectedSessionExerciseRevisions: [
        { sessionExerciseId: "session-exercise-1", revision: 2 },
        { sessionExerciseId: "session-exercise-2", revision: 3 },
      ],
    },
    {
      expectedSessionExerciseRevisions: [
        { sessionExerciseId: "session-exercise-2", revision: 3 },
        { sessionExerciseId: " invalid ", revision: 2 },
      ],
    },
  ])("rejects incomplete or duplicate ordered membership: %j", async (invalid) => {
    await expect(reorderExercises({
      repository: repository(),
      input: { ...reorderInput(), ...invalid },
    })).rejects.toThrow("reorder_exercises_membership_invalid");
  });

  it.each([
    { requestId: " invalid " },
    { requestSha256: "A".repeat(64) },
    { expectedSessionRevision: -1 },
    { occurredAtMs: -1 },
    {
      expectedSessionExerciseRevisions: [
        { sessionExerciseId: "session-exercise-2", revision: 3 },
        { sessionExerciseId: "session-exercise-1", revision: 1.5 },
      ],
    },
  ])("rejects malformed reorder envelope: %j", async (invalid) => {
    await expect(reorderExercises({
      repository: repository(),
      input: { ...reorderInput(), ...invalid },
    })).rejects.toThrow("reorder_exercises_");
  });

  it("forwards the exact independent reorder receipt envelope", async () => {
    const port = repository();
    const command = reorderInput();
    port.reorderExercises = jest.fn(async () => ({
      outcome: "committed" as const,
      sessionId: command.sessionId,
      orderedSessionExerciseIds: command.orderedSessionExerciseIds,
      sessionRevision: 2,
    }));

    await expect(reorderExercises({ repository: port, input: command })).resolves.toEqual({
      outcome: "committed",
      sessionId: command.sessionId,
      orderedSessionExerciseIds: command.orderedSessionExerciseIds,
      sessionRevision: 2,
    });
    expect(port.reorderExercises).toHaveBeenCalledWith(command);
  });

  it("fails closed when reorder capability is unavailable", async () => {
    await expect(reorderExercises({ repository: repository(), input: reorderInput() }))
      .rejects.toThrow("reorder_exercises_unavailable");
  });
});
