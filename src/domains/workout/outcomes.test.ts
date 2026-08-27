import {
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

import {
  discardWorkout,
  finishCompleted,
  finishPartial,
  resumePartialWorkout,
  saveZeroSetWorkout,
  skipExercise,
  type WorkoutOutcomeRepository,
} from "./finishWorkout";
import {
  nextWorkoutStatus,
  sessionIsResumable,
  sessionStatusLabel,
} from "./outcomes";

function repository(): WorkoutOutcomeRepository {
  const finishResult = {
    detail: {} as never,
    invalidationScopes: [],
  };
  return {
    finishCompleted: jest.fn(async () => finishResult),
    finishPartial: jest.fn(async () => finishResult),
    saveZeroSetWorkout: jest.fn(async () => finishResult),
    discardWorkout: jest.fn(async () => finishResult),
    skipExercise: jest.fn<WorkoutOutcomeRepository["skipExercise"]>(
      async () => ({
      sessionId: "session-1",
      status: "in_progress" as const,
      sessionRevision: 2,
      }),
    ),
    resumePartialWorkout: jest.fn<
      WorkoutOutcomeRepository["resumePartialWorkout"]
    >(async () => ({
      sessionId: "session-1",
      status: "in_progress" as const,
      sessionRevision: 2,
    })),
    getSessionDetail: jest.fn(async () => ({} as never)),
  };
}

describe("Plan 01-10 outcome transitions and commands", () => {
  it.each([
    { from: "in_progress", action: "finish_completed", to: "completed" },
    { from: "in_progress", action: "finish_partial", to: "partial" },
    { from: "in_progress", action: "save_zero_sets", to: "zero_sets" },
    { from: "in_progress", action: "discard", to: "discarded" },
    { from: "partial", action: "resume_partial", to: "in_progress" },
  ] as const)(
    "transitions $from through $action to $to",
    ({ from, action, to }) => {
      expect(nextWorkoutStatus(from, action)).toBe(to);
    },
  );

  it("rejects an unapproved outcome transition", () => {
    expect(() => nextWorkoutStatus("completed", "resume_partial"))
      .toThrow("workout_outcome_transition_invalid");
  });

  it.each([
    { status: "in_progress", label: "In progress", resumable: true },
    { status: "completed", label: "Completed", resumable: false },
    { status: "partial", label: "Partial", resumable: true },
    { status: "discarded", label: "Discarded", resumable: false },
    { status: "voided", label: "Removed from history", resumable: false },
    { status: "manual_visit", label: "Manual visit", resumable: false },
    { status: "zero_sets", label: "Zero working sets", resumable: false },
  ] as const)("labels $status as $label", ({ status, label, resumable }) => {
    expect(sessionStatusLabel(status)).toBe(label);
    expect(sessionIsResumable(status)).toBe(resumable);
  });

  it("delegates every valid command with exact confirmation tokens", async () => {
    const port = repository();
    await finishCompleted({
      repository: port,
      input: {
        sessionId: "session-1",
        expectedSessionRevision: 1,
        endedAtMs: 2_000,
      },
    });
    await finishPartial({
      repository: port,
      input: {
        sessionId: "session-1",
        expectedSessionRevision: 1,
        confirmation: "save_partial_workout",
        endedAtMs: 2_000,
      },
    });
    await saveZeroSetWorkout({
      repository: port,
      input: {
        sessionId: "session-1",
        expectedSessionRevision: 1,
        confirmation: "save_zero_set_workout",
        endedAtMs: 2_000,
      },
    });
    await discardWorkout({
      repository: port,
      input: {
        sessionId: "session-1",
        expectedSessionRevision: 1,
        confirmation: "discard_workout",
        endedAtMs: 2_000,
      },
    });
    await skipExercise({
      repository: port,
      input: {
        sessionId: "session-1",
        sessionExerciseId: "exercise-1",
        expectedSessionRevision: 1,
        expectedExerciseRevision: 1,
        confirmation: "skip_exercise",
        nowMs: 2_000,
      },
    });
    await resumePartialWorkout({
      repository: port,
      input: {
        sessionId: "session-1",
        expectedSessionRevision: 2,
        resumedAtMs: 3_000,
      },
    });

    expect(port.finishCompleted).toHaveBeenCalledTimes(1);
    expect(port.finishPartial).toHaveBeenCalledTimes(1);
    expect(port.saveZeroSetWorkout).toHaveBeenCalledTimes(1);
    expect(port.discardWorkout).toHaveBeenCalledTimes(1);
    expect(port.skipExercise).toHaveBeenCalledTimes(1);
    expect(port.resumePartialWorkout).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["finish_completed", () => finishCompleted({
      repository: repository(),
      input: {
        sessionId: "session-1",
        expectedSessionRevision: -1,
        endedAtMs: 2_000,
      },
    }), "finish_completed_input_invalid"],
    ["finish_partial", () => finishPartial({
      repository: repository(),
      input: {
        sessionId: "session-1",
        expectedSessionRevision: -1,
        confirmation: "save_partial_workout",
        endedAtMs: 2_000,
      },
    }), "finish_partial_input_invalid"],
    ["zero_sets", () => saveZeroSetWorkout({
      repository: repository(),
      input: {
        sessionId: "session-1",
        expectedSessionRevision: 1,
        confirmation: "save_zero_set_workout",
        endedAtMs: -1,
      },
    }), "zero_set_input_invalid"],
    ["discard", () => discardWorkout({
      repository: repository(),
      input: {
        sessionId: "session-1",
        expectedSessionRevision: 1,
        confirmation: "discard_workout",
        endedAtMs: -1,
      },
    }), "discard_input_invalid"],
    ["skip", () => skipExercise({
      repository: repository(),
      input: {
        sessionId: "session-1",
        sessionExerciseId: "exercise-1",
        expectedSessionRevision: 1,
        expectedExerciseRevision: -1,
        confirmation: "skip_exercise",
        nowMs: 2_000,
      },
    }), "skip_exercise_input_invalid"],
    ["resume", () => resumePartialWorkout({
      repository: repository(),
      input: {
        sessionId: "session-1",
        expectedSessionRevision: 2,
        resumedAtMs: -1,
      },
    }), "resume_partial_input_invalid"],
  ])("rejects invalid %s input", (_label, command, error) => {
    expect(command).toThrow(error);
  });

  it.each([
    [() => finishPartial({
      repository: repository(),
      input: {
        sessionId: "session-1",
        expectedSessionRevision: 1,
        confirmation: "no",
        endedAtMs: 2_000,
      },
    }), "partial_confirmation_required"],
    [() => saveZeroSetWorkout({
      repository: repository(),
      input: {
        sessionId: "session-1",
        expectedSessionRevision: 1,
        confirmation: "no",
        endedAtMs: 2_000,
      },
    }), "zero_set_confirmation_required"],
    [() => discardWorkout({
      repository: repository(),
      input: {
        sessionId: "session-1",
        expectedSessionRevision: 1,
        confirmation: "no",
        endedAtMs: 2_000,
      },
    }), "discard_confirmation_required"],
    [() => skipExercise({
      repository: repository(),
      input: {
        sessionId: "session-1",
        sessionExerciseId: "exercise-1",
        expectedSessionRevision: 1,
        expectedExerciseRevision: 1,
        confirmation: "no",
        nowMs: 2_000,
      },
    }), "skip_exercise_confirmation_required"],
  ])("rejects an incorrect confirmation", (command, error) => {
    expect(command).toThrow(error);
  });
});
