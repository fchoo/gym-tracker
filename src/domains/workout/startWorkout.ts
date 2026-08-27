import type {
  StartedWorkout,
  StartWorkoutRequest,
  WorkoutRepository,
} from "./index";

export type StartWorkoutInput = Readonly<{
  repository: WorkoutRepository;
  request: StartWorkoutRequest;
}>;

const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

export function startWorkout(
  input: StartWorkoutInput,
): Promise<StartedWorkout> {
  const { request } = input;
  if (
    !LOCAL_DATE_PATTERN.test(request.localDate)
    || request.timezone.trim().length === 0
    || !Number.isSafeInteger(request.startedAtMs)
    || request.startedAtMs < 0
  ) {
    throw new TypeError("workout_start_invalid");
  }
  if (
    request.mode !== "empty"
    && (request.planId.length === 0 || request.planDayId.length === 0)
  ) {
    throw new TypeError("workout_start_invalid");
  }
  return input.repository.startWorkout(request);
}
