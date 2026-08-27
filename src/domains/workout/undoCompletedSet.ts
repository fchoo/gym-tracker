import type {
  ActiveWorkoutRepository,
  UndoCompletedSetInput,
  UndoCompletedSetResult,
} from "./activeWorkout";

export function undoCompletedSet(input: Readonly<{
  repository: ActiveWorkoutRepository;
  input: UndoCompletedSetInput;
}>): Promise<UndoCompletedSetResult> {
  return input.repository.undoCompletedSet(input.input);
}
