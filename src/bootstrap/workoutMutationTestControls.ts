import Constants from "expo-constants";

export const workoutMutationTestActions = [
  "arm_add_warmup_failure",
  "arm_copy_warmup_failure",
  "arm_add_working_failure",
  "arm_completed_set_correction_failure",
  "arm_replace_exercise_failure",
  "arm_remove_exercise_failure",
  "arm_plan_write_back_failure",
  "reset_workout_failures",
] as const;

export type WorkoutMutationTestAction =
  (typeof workoutMutationTestActions)[number];

export type WorkoutMutationTestOperation =
  | "add_warmup"
  | "copy_warmup"
  | "add_working"
  | "completed_set_correction"
  | "replace_exercise"
  | "remove_exercise"
  | "plan_write_back";

export type WorkoutMutationTestResult = Readonly<{
  action: WorkoutMutationTestAction;
  code:
    | "workout_failure_armed"
    | "workout_failures_reset"
    | "workout_failure_control_unavailable";
  heading: string;
  body: string;
}>;

const armedControls = Object.freeze({
  arm_add_warmup_failure: Object.freeze({
    operation: "add_warmup",
    heading: "Add warm-up failure armed",
    body: "The next Add warm-up attempt will fail once.",
  }),
  arm_copy_warmup_failure: Object.freeze({
    operation: "copy_warmup",
    heading: "Copy warm-up failure armed",
    body: "The next Copy warm-up attempt will fail once.",
  }),
  arm_add_working_failure: Object.freeze({
    operation: "add_working",
    heading: "Add working set failure armed",
    body: "The next Add working set attempt will fail once.",
  }),
  arm_completed_set_correction_failure: Object.freeze({
    operation: "completed_set_correction",
    heading: "Completed set correction failure armed",
    body: "The next completed set correction attempt will fail once.",
  }),
  arm_replace_exercise_failure: Object.freeze({
    operation: "replace_exercise",
    heading: "Replace exercise failure armed",
    body: "The next Replace exercise attempt will fail once.",
  }),
  arm_remove_exercise_failure: Object.freeze({
    operation: "remove_exercise",
    heading: "Remove exercise failure armed",
    body: "The next Remove exercise attempt will fail once.",
  }),
  arm_plan_write_back_failure: Object.freeze({
    operation: "plan_write_back",
    heading: "Plan write-back failure armed",
    body: "The next Save changes to plan attempt will fail once.",
  }),
} as const satisfies Readonly<Record<
  Exclude<WorkoutMutationTestAction, "reset_workout_failures">,
  Readonly<{
    operation: WorkoutMutationTestOperation;
    heading: string;
    body: string;
  }>
>>);

let armedOperation: WorkoutMutationTestOperation | null = null;

type AsyncCommand = (...args: never[]) => Promise<unknown>;

type WorkoutMutationCommands = Readonly<{
  addWarmup: AsyncCommand;
  copyPreviousWarmup?: AsyncCommand;
  addWorkingSet: AsyncCommand;
  reviseCompletedSet: AsyncCommand;
  replaceExercise?: AsyncCommand;
  removeExercise?: AsyncCommand;
}>;

function result(
  action: WorkoutMutationTestAction,
  code: WorkoutMutationTestResult["code"],
  heading: string,
  body: string,
): WorkoutMutationTestResult {
  return Object.freeze({ action, code, heading, body });
}

export function isWorkoutMutationTestAction(
  action: string,
): action is WorkoutMutationTestAction {
  return workoutMutationTestActions.some((candidate) => candidate === action);
}

export function applyWorkoutMutationTestControl(
  action: WorkoutMutationTestAction,
): WorkoutMutationTestResult {
  if (!workoutMutationTestControlsEnabled()) {
    armedOperation = null;
    return result(
      action,
      "workout_failure_control_unavailable",
      "Workout failure control unavailable",
      "This control is available only in development-test builds.",
    );
  }
  if (action === "reset_workout_failures") {
    armedOperation = null;
    return result(
      action,
      "workout_failures_reset",
      "Workout mutation failures reset",
      "No workout mutation failure is armed.",
    );
  }

  const control = armedControls[action];
  armedOperation = control.operation;
  return result(
    action,
    "workout_failure_armed",
    control.heading,
    control.body,
  );
}

export function runWorkoutMutationWithTestFailure<T>(
  operation: WorkoutMutationTestOperation,
  command: () => Promise<T>,
): Promise<T> {
  if (!workoutMutationTestControlsEnabled()) {
    armedOperation = null;
    return command();
  }
  if (armedOperation === operation) {
    armedOperation = null;
    return Promise.reject(
      new Error("Development-test workout mutation failed once."),
    );
  }

  return command();
}

export function workoutMutationTestControlsEnabled(): boolean {
  return Constants.expoConfig?.extra?.nativeContractsEnabled === true;
}

function wrapCommand<TCommand extends AsyncCommand>(
  operation: WorkoutMutationTestOperation,
  command: TCommand,
): TCommand {
  return (((...args: Parameters<TCommand>) =>
    runWorkoutMutationWithTestFailure(operation, () => command(...args)))
  ) as TCommand;
}

export function createWorkoutMutationTestCommandAdapters<
  TCommands extends WorkoutMutationCommands,
>(commands: TCommands): TCommands {
  if (!workoutMutationTestControlsEnabled()) {
    return commands;
  }

  return {
    ...commands,
    addWarmup: wrapCommand("add_warmup", commands.addWarmup),
    ...(commands.copyPreviousWarmup === undefined ? {} : {
      copyPreviousWarmup: wrapCommand(
        "copy_warmup",
        commands.copyPreviousWarmup,
      ),
    }),
    addWorkingSet: wrapCommand("add_working", commands.addWorkingSet),
    reviseCompletedSet: wrapCommand(
      "completed_set_correction",
      commands.reviseCompletedSet,
    ),
    ...(commands.replaceExercise === undefined ? {} : {
      replaceExercise: wrapCommand(
        "replace_exercise",
        commands.replaceExercise,
      ),
    }),
    ...(commands.removeExercise === undefined ? {} : {
      removeExercise: wrapCommand(
        "remove_exercise",
        commands.removeExercise,
      ),
    }),
  } as TCommands;
}
