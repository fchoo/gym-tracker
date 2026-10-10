import type {
  ActiveWorkoutExercise,
  ActiveWorkoutSet,
  ActiveWorkoutSetStatus,
  ActiveWorkoutView,
  SetObservation,
} from "./activeWorkout";
import type {
  SessionDetail,
  SessionExerciseDetail,
  SessionSetDetail,
} from "./sessionDetail";

export type WorkoutPresentationSet = Readonly<{
  id: string;
  kind: "warmup" | "working";
  ordinal: number;
  status: ActiveWorkoutSetStatus;
  previous: string | null;
  target: string;
  result: string | null;
}>;

export type WorkoutPresentationExercise = Readonly<{
  id: string;
  exerciseId: string;
  name: string;
  status: ActiveWorkoutExercise["status"];
  warmups: readonly WorkoutPresentationSet[];
  workingSets: readonly WorkoutPresentationSet[];
}>;

export type WorkoutPresentationModel = Readonly<{
  sessionId: string;
  revision: number;
  progress: ActiveWorkoutView["progress"];
  activeExerciseId: string | null;
  exercises: readonly WorkoutPresentationExercise[];
}>;

function formatLoadGrams(loadGrams: number): string {
  const kilograms = loadGrams / 1_000;
  return Number.isInteger(kilograms)
    ? String(kilograms)
    : kilograms.toFixed(1).replace(/\.0$/u, "");
}

function formatObservation(observation: SetObservation): string {
  switch (observation.profile) {
    case "load_reps": return `${formatLoadGrams(observation.loadGrams)} kg × ${observation.reps}`;
    case "bodyweight_reps": return `Bodyweight × ${observation.reps}`;
    case "added_load_reps": return `BW + ${formatLoadGrams(observation.addedLoadGrams)} kg × ${observation.reps}`;
    case "assisted_reps": return `${formatLoadGrams(observation.assistanceGrams)} kg assist × ${observation.reps}`;
    case "timed_hold": return observation.version === 1
      ? `${observation.durationSeconds} sec`
      : `${observation.durationMs / 1_000} sec`;
    case "fixed_distance": return `${observation.distanceMeters} m in ${observation.durationMs / 1_000} sec`;
    case "fixed_time": return `${observation.distanceMeters} m in ${observation.durationMs / 1_000} sec`;
    case "intervals": return `${observation.completedRounds} rounds · ${observation.completedWorkMs / 1_000} sec work`;
    case "unscored": return observation.completed ? "Completed" : "Not completed";
  }
}

function targetFor(set: ActiveWorkoutSet): string {
  switch (set.target.profile) {
    case "load_reps": return `${formatLoadGrams(set.target.loadGrams)} kg × ${set.target.maxReps}`;
    case "bodyweight_reps": return `Bodyweight × ${set.target.maxReps}`;
    case "added_load_reps": return `BW + ${formatLoadGrams(set.target.addedLoadGrams)} kg × ${set.target.maxReps}`;
    case "assisted_reps": return `${formatLoadGrams(set.target.assistanceGrams)} kg assist × ${set.target.maxReps}`;
    case "timed_hold": return set.target.version === 1
      ? `${set.target.durationSeconds} sec`
      : `${set.target.durationMs / 1_000} sec`;
    case "fixed_distance": return `${set.target.plannedDistanceMeters} m`;
    case "fixed_time": return `${set.target.plannedDurationMs / 1_000} sec`;
    case "intervals": return `${set.target.plannedRounds} rounds · ${set.target.workIntervalMs / 1_000} sec work`;
    case "unscored": return "Complete";
  }
}

function presentSet(set: ActiveWorkoutSet): WorkoutPresentationSet {
  return {
    id: set.id,
    kind: set.kind,
    ordinal: set.ordinal,
    status: set.status,
    previous: set.valueSources.find(({ source }) => source === "last_workout")
      ? formatObservation(set.valueSources.find(({ source }) => source === "last_workout")!.observation)
      : null,
    target: targetFor(set),
    result: set.observation === null ? null : formatObservation(set.observation),
  };
}

function presentExercise(exercise: ActiveWorkoutExercise): WorkoutPresentationExercise {
  return {
    id: exercise.id,
    exerciseId: exercise.exerciseId,
    name: exercise.name,
    status: exercise.status,
    warmups: exercise.warmups.map(presentSet),
    workingSets: exercise.workingSets.map(presentSet),
  };
}

function presentDetailSet(set: SessionSetDetail): WorkoutPresentationSet {
  return {
    id: set.id,
    kind: set.kind,
    ordinal: set.ordinal,
    status: set.status,
    previous: null,
    target: set.value,
    result: set.status === "completed" && set.observation !== null ? set.value : null,
  };
}

function presentDetailExercise(exercise: SessionExerciseDetail): WorkoutPresentationExercise {
  return {
    id: exercise.id,
    exerciseId: exercise.exerciseId,
    name: exercise.name,
    status: exercise.status,
    warmups: exercise.warmups.map(presentDetailSet),
    workingSets: exercise.workingSets.map(presentDetailSet),
  };
}

/** Maps authoritative live-session facts to immutable, command-free display facts. */
export function presentWorkoutSession(view: ActiveWorkoutView): WorkoutPresentationModel {
  const exercises = view.exercises.length > 0 ? view.exercises : [view.currentExercise];
  return {
    sessionId: view.id,
    revision: view.revision,
    progress: view.progress,
    activeExerciseId: view.activeExerciseId,
    exercises: exercises.map(presentExercise),
  };
}

/** Maps a historical or planned SessionDetail to the same read-only facts surface. */
export function presentSessionDetail(detail: SessionDetail): WorkoutPresentationModel {
  return {
    sessionId: detail.id,
    revision: detail.revision,
    progress: {
      completedWorkingSets: detail.workingSetProgress.completed,
      totalWorkingSets: detail.workingSetProgress.planned,
    },
    activeExerciseId: null,
    exercises: detail.exercises.map(presentDetailExercise),
  };
}
