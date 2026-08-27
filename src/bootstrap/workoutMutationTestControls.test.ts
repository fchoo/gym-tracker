import {
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

import {
  applyWorkoutMutationTestControl,
  createWorkoutMutationTestCommandAdapters,
  isWorkoutMutationTestAction,
  runWorkoutMutationWithTestFailure,
  type WorkoutMutationTestAction,
  type WorkoutMutationTestOperation,
} from "./workoutMutationTestControls";

let mockNativeContractsEnabled = true;

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: {
        get nativeContractsEnabled() {
          return mockNativeContractsEnabled;
        },
      },
    },
  },
}));

const cases: [
  Exclude<WorkoutMutationTestAction, "reset_workout_failures">,
  WorkoutMutationTestOperation,
  string,
  string,
][] = [
  [
    "arm_add_warmup_failure",
    "add_warmup",
    "Add warm-up failure armed",
    "The next Add warm-up attempt will fail once.",
  ],
  [
    "arm_copy_warmup_failure",
    "copy_warmup",
    "Copy warm-up failure armed",
    "The next Copy warm-up attempt will fail once.",
  ],
  [
    "arm_add_working_failure",
    "add_working",
    "Add working set failure armed",
    "The next Add working set attempt will fail once.",
  ],
  [
    "arm_completed_set_correction_failure",
    "completed_set_correction",
    "Completed set correction failure armed",
    "The next completed set correction attempt will fail once.",
  ],
];

describe("development-test workout mutation controls", () => {
  beforeEach(() => {
    mockNativeContractsEnabled = true;
    applyWorkoutMutationTestControl("reset_workout_failures");
  });

  it("recognizes only the bounded workout mutation control actions", () => {
    for (const [action] of cases) {
      expect(isWorkoutMutationTestAction(action)).toBe(true);
    }
    expect(isWorkoutMutationTestAction("reset_workout_failures")).toBe(true);
    expect(isWorkoutMutationTestAction("inspect")).toBe(false);
    expect(isWorkoutMutationTestAction("arm_owner-secret_failure"))
      .toBe(false);
  });

  it.each(cases)(
    "arms %s for exactly one matching operation",
    async (action, operation, heading, body) => {
      expect(applyWorkoutMutationTestControl(action)).toEqual({
        action,
        code: "workout_failure_armed",
        heading,
        body,
      });
      const command = jest.fn(async () => "committed");

      await expect(runWorkoutMutationWithTestFailure(
        operation,
        command,
      )).rejects.toThrow("Development-test workout mutation failed once.");
      expect(command).not.toHaveBeenCalled();

      await expect(runWorkoutMutationWithTestFailure(
        operation,
        command,
      )).resolves.toBe("committed");
      expect(command).toHaveBeenCalledTimes(1);
    },
  );

  it("does not consume an armed failure for a different operation", async () => {
    applyWorkoutMutationTestControl("arm_add_warmup_failure");
    const otherCommand = jest.fn(async () => "other committed");
    const matchingCommand = jest.fn(async () => "matching committed");

    await expect(runWorkoutMutationWithTestFailure(
      "add_working",
      otherCommand,
    )).resolves.toBe("other committed");
    await expect(runWorkoutMutationWithTestFailure(
      "add_warmup",
      matchingCommand,
    )).rejects.toThrow("Development-test workout mutation failed once.");
    expect(otherCommand).toHaveBeenCalledTimes(1);
    expect(matchingCommand).not.toHaveBeenCalled();
  });

  it("resets an armed failure without invoking a command", async () => {
    applyWorkoutMutationTestControl("arm_copy_warmup_failure");
    expect(applyWorkoutMutationTestControl("reset_workout_failures"))
      .toEqual({
        action: "reset_workout_failures",
        code: "workout_failures_reset",
        heading: "Workout mutation failures reset",
        body: "No workout mutation failure is armed.",
      });
    const command = jest.fn(async () => "committed");

    await expect(runWorkoutMutationWithTestFailure(
      "copy_warmup",
      command,
    )).resolves.toBe("committed");
  });

  it("cannot arm or consume failures outside a development-test build", async () => {
    mockNativeContractsEnabled = false;
    expect(applyWorkoutMutationTestControl(
      "arm_completed_set_correction_failure",
    )).toEqual({
      action: "arm_completed_set_correction_failure",
      code: "workout_failure_control_unavailable",
      heading: "Workout failure control unavailable",
      body: "This control is available only in development-test builds.",
    });
    const command = jest.fn(async () => "production committed");

    await expect(runWorkoutMutationWithTestFailure(
      "add_working",
      command,
    )).resolves.toBe("production committed");
    expect(command).toHaveBeenCalledTimes(1);

    mockNativeContractsEnabled = true;
    await expect(runWorkoutMutationWithTestFailure("add_working", command))
      .resolves.toBe("production committed");

    applyWorkoutMutationTestControl("arm_add_working_failure");
    mockNativeContractsEnabled = false;
    await expect(runWorkoutMutationWithTestFailure("add_working", command))
      .resolves.toBe("production committed");
    mockNativeContractsEnabled = true;
    await expect(runWorkoutMutationWithTestFailure("add_working", command))
      .resolves.toBe("production committed");
  });

  it("returns the original command object in production", () => {
    mockNativeContractsEnabled = false;
    const commands = {
      addWarmup: jest.fn(async () => undefined),
      copyPreviousWarmup: jest.fn(async () => undefined),
      addWorkingSet: jest.fn(async () => undefined),
      reviseCompletedSet: jest.fn(async () => undefined),
    };

    expect(createWorkoutMutationTestCommandAdapters(commands)).toBe(commands);
  });

  it("returns and throws only bounded control data", async () => {
    const sensitive = [
      "owner-secret",
      "session-secret",
      "set-secret",
    ];
    const result = applyWorkoutMutationTestControl(
      "arm_add_warmup_failure",
    );
    let thrown: unknown;
    try {
      await runWorkoutMutationWithTestFailure(
        "add_warmup",
        async () => sensitive.join("/"),
      );
    } catch (error) {
      thrown = error;
    }

    const observable = `${JSON.stringify(result)} ${String(thrown)}`;
    for (const value of sensitive) {
      expect(observable).not.toContain(value);
    }
    expect(Object.keys(result).sort()).toEqual([
      "action",
      "body",
      "code",
      "heading",
    ]);
  });

  it.each(cases)(
    "maps %s to only its matching active-workout command adapter",
    async (action, operation) => {
      const commandNames = {
        add_warmup: "addWarmup",
        copy_warmup: "copyPreviousWarmup",
        add_working: "addWorkingSet",
        completed_set_correction: "reviseCompletedSet",
      } as const;
      const source = {
        addWarmup: jest.fn(async () => "add-warmup committed"),
        copyPreviousWarmup: jest.fn(async () => "copy-warmup committed"),
        addWorkingSet: jest.fn(async () => "add-working committed"),
        reviseCompletedSet: jest.fn(async () => "correction committed"),
      };
      const adapters = createWorkoutMutationTestCommandAdapters(source);
      const commandName = commandNames[operation];
      const command = adapters[commandName] as (input: never) => Promise<string>;

      applyWorkoutMutationTestControl(action);
      await expect(command({ marker: "private" } as never)).rejects.toThrow(
        "Development-test workout mutation failed once.",
      );
      expect(source[commandName]).not.toHaveBeenCalled();
      await expect(command({ marker: "private" } as never)).resolves
        .toMatch(/committed$/u);
      expect(source[commandName]).toHaveBeenCalledTimes(1);
    },
  );
});
