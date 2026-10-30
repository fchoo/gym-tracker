import {
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

import {
  applyCompletedWorkoutPlanWriteBack,
  beginCompletedWorkoutPlanWriteBack,
  discardWorkout,
  finishCompleted,
  finishPartial,
  keepCompletedWorkoutPlanAsIs,
  previewCompletedWorkoutPlanWriteBack,
  resumePartialWorkout,
  saveZeroSetWorkout,
  skipExercise,
  type CompletedWorkoutPlanWriteBackPort,
  type WorkoutOutcomeRepository,
} from "./finishWorkout";
import type {
  SessionExerciseEditsForPlanPreview,
} from "../plans";
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

const writeBackPreview: SessionExerciseEditsForPlanPreview = {
  kind: "session_exercise_edits",
  sourceSessionId: "session-1",
  sourceSessionRevision: 4,
  planId: "plan-owner",
  planName: "Owner Strength",
  planDayId: "day-owner",
  dayName: "Strength Day",
  expectedPlanRevision: 3,
  currentWorkoutUnaffected: true,
  previewToken: `session-writeback-v1:${"a".repeat(64)}`,
  composition: [],
  changes: [],
};

function writeBackPort(
  overrides: Partial<CompletedWorkoutPlanWriteBackPort> = {},
): CompletedWorkoutPlanWriteBackPort {
  return {
    previewSessionExerciseEdits: jest.fn(async () => writeBackPreview),
    applySessionExerciseEdits: jest.fn(async () => ({
      outcome: "committed" as const,
      planId: writeBackPreview.planId,
      planRevision: writeBackPreview.expectedPlanRevision + 1,
      sourceSessionId: writeBackPreview.sourceSessionId,
    })),
    ...overrides,
  };
}

describe("Plan 01-10 outcome transitions and commands", () => {
  it("models the completed-session plan write-back choice and preserves a stale preview for retry", async () => {
    const noChange = writeBackPort({
      previewSessionExerciseEdits: jest.fn(async () => null),
    });
    await expect(previewCompletedWorkoutPlanWriteBack({
      port: noChange,
      sessionId: "session-1",
    })).resolves.toEqual({
      state: "completed",
      disposition: "not_eligible",
    });
    expect(noChange.applySessionExerciseEdits).not.toHaveBeenCalled();

    const stale = writeBackPort({
      applySessionExerciseEdits: jest.fn(async () => {
        throw Object.assign(new Error("plan_impact_preview_stale"), {
          code: "plan_impact_preview_stale",
        });
      }),
    });
    const awaiting = await previewCompletedWorkoutPlanWriteBack({
      port: stale,
      sessionId: "session-1",
    });
    expect(awaiting).toEqual({
      state: "awaiting_choice",
      preview: writeBackPreview,
    });
    if (awaiting.state !== "awaiting_choice") {
      throw new Error("expected_awaiting_choice");
    }
    expect(keepCompletedWorkoutPlanAsIs(awaiting)).toEqual({
      state: "completed",
      disposition: "kept",
    });
    expect(stale.applySessionExerciseEdits).not.toHaveBeenCalled();

    const applying = beginCompletedWorkoutPlanWriteBack(awaiting);
    expect(applying).toEqual({
      state: "applying",
      preview: writeBackPreview,
    });
    const failed = await applyCompletedWorkoutPlanWriteBack({
      port: stale,
      state: applying,
    });
    expect(failed).toEqual({
      state: "save_failed",
      preview: writeBackPreview,
      failure: {
        kind: "stale",
        code: "plan_impact_preview_stale",
      },
    });
    if (failed.state !== "save_failed") {
      throw new Error("expected_save_failed");
    }

    const retry = writeBackPort();
    const saved = await applyCompletedWorkoutPlanWriteBack({
      port: retry,
      state: beginCompletedWorkoutPlanWriteBack(failed),
    });
    expect(saved).toEqual({
      state: "completed",
      disposition: "saved",
      outcome: "committed",
    });
    expect(retry.applySessionExerciseEdits).toHaveBeenCalledWith({
      sourceSessionId: writeBackPreview.sourceSessionId,
      expectedPlanRevision: writeBackPreview.expectedPlanRevision,
      previewToken: writeBackPreview.previewToken,
      composition: writeBackPreview.composition,
    });
  });

  it.each([
    [
      "classifies a non-stale coded write-back failure",
      Object.assign(new Error("write_back_conflict"), {
        code: "owned_plan_revision_conflict",
      }),
      { kind: "failed", code: "owned_plan_revision_conflict" },
    ],
    [
      "classifies an uncoded write-back failure",
      new Error("write_back_failed"),
      { kind: "failed", code: "session_write_back_failed" },
    ],
    [
      "classifies a non-error write-back failure",
      "write_back_failed",
      { kind: "failed", code: "session_write_back_failed" },
    ],
  ] as const)("%s", async (...[_label, error, failure]) => {
    const port = writeBackPort({
      applySessionExerciseEdits: jest.fn(async () => {
        throw error;
      }),
    });

    const result = await applyCompletedWorkoutPlanWriteBack({
      port,
      state: { state: "applying", preview: writeBackPreview },
    });

    expect(result).toEqual({
      state: "save_failed",
      preview: writeBackPreview,
      failure,
    });
  });

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
