import type {
  ActiveWorkoutRepository,
  AddExerciseInput,
  AddExerciseResult,
} from "./activeWorkout";

const REQUEST_ID_MAX_LENGTH = 128;
const PERSISTED_ENTITY_ID_MAX_LENGTH = 256;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;

function validIdentifier(value: string, maxLength: number): boolean {
  return typeof value === "string"
    && value.trim() === value
    && value.length > 0
    && [...value].length <= maxLength;
}

function validNonnegativeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function validateAddExerciseInput(input: AddExerciseInput): void {
  if (!validIdentifier(input.requestId, REQUEST_ID_MAX_LENGTH)
    || !validIdentifier(input.sessionId, PERSISTED_ENTITY_ID_MAX_LENGTH)
    || !validIdentifier(input.libraryExerciseId, PERSISTED_ENTITY_ID_MAX_LENGTH)
    || !validIdentifier(input.sessionExerciseId, PERSISTED_ENTITY_ID_MAX_LENGTH)
    || !validIdentifier(input.setId, PERSISTED_ENTITY_ID_MAX_LENGTH)) {
    throw new TypeError("add_exercise_identifier_invalid");
  }
  if (!SHA256_PATTERN.test(input.requestSha256)) {
    throw new TypeError("add_exercise_hash_invalid");
  }
  if (!validNonnegativeInteger(input.expectedSessionRevision)) {
    throw new TypeError("add_exercise_revision_invalid");
  }
  if (!validNonnegativeInteger(input.occurredAtMs)) {
    throw new TypeError("add_exercise_time_invalid");
  }
}

export async function addExercise(input: Readonly<{
  repository: ActiveWorkoutRepository;
  input: AddExerciseInput;
}>): Promise<AddExerciseResult> {
  validateAddExerciseInput(input.input);
  if (input.repository.addExercise === undefined) {
    throw new TypeError("add_exercise_unavailable");
  }
  return input.repository.addExercise(input.input);
}
