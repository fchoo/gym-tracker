import type { RestCommandResult } from "../domains/rest";
import type {
  ActiveWorkoutExercise,
  ActiveWorkoutSet,
  ActiveWorkoutView,
} from "../domains/workout";
import type { ActiveWorkoutCommands } from "../ui/screens/ActiveWorkoutScreen";
import type {
  LibraryBrowseSnapshot,
  LibraryExerciseItem,
  LibrarySection,
  LibrarySectionPreference,
} from "../ui/screens/LibraryScreen";

export const PHASE2_ATTENDED_PREVIEW_REGISTRY = {
  "alert-settings-loading": null,
  "alert-settings-error": null,
  "calendar-zero-one-many": ["zero", "one", "many"],
  "global-card-loading": null,
  "library-exercise-card-loading": null,
  "library-exercise-card-error": null,
  "library-exercise-card-partial": null,
  "library-plan-card-loading": null,
  "library-plan-card-error": null,
  "library-plan-card-partial": null,
  "root-nav-loading": null,
  "set-mutations-loading": [
    "add-warmup",
    "copy-warmup",
    "add-working",
    "correction",
  ],
  "todays-plan-empty": null,
  "todays-plan-loading": null,
  "todays-plan-zero-one-many": ["zero", "one", "many"],
} as const;

export type Phase2AttendedPreviewScenario =
  keyof typeof PHASE2_ATTENDED_PREVIEW_REGISTRY;

export const PHASE2_ATTENDED_PREVIEW_SCENARIOS = Object.freeze(
  Object.keys(PHASE2_ATTENDED_PREVIEW_REGISTRY) as
    Phase2AttendedPreviewScenario[],
);

export const PHASE2_CALENDAR_PREVIEW_VARIANTS =
  PHASE2_ATTENDED_PREVIEW_REGISTRY["calendar-zero-one-many"];
export const PHASE2_TODAY_PLAN_PREVIEW_VARIANTS =
  PHASE2_ATTENDED_PREVIEW_REGISTRY["todays-plan-zero-one-many"];
export const PHASE2_SET_MUTATION_PREVIEW_VARIANTS =
  PHASE2_ATTENDED_PREVIEW_REGISTRY["set-mutations-loading"];

export type Phase2CalendarPreviewVariant =
  (typeof PHASE2_CALENDAR_PREVIEW_VARIANTS)[number];
export type Phase2TodayPlanPreviewVariant =
  (typeof PHASE2_TODAY_PLAN_PREVIEW_VARIANTS)[number];
export type Phase2SetMutationPreviewVariant =
  (typeof PHASE2_SET_MUTATION_PREVIEW_VARIANTS)[number];

export type Phase2AttendedPreviewVariant =
  | Phase2CalendarPreviewVariant
  | Phase2TodayPlanPreviewVariant
  | Phase2SetMutationPreviewVariant;
export type Phase2AttendedPreviewRoute = Readonly<{
  scenario: Phase2AttendedPreviewScenario;
  variant: Phase2AttendedPreviewVariant | null;
}>;

export const PHASE2_ATTENDED_PREVIEW_ROUTES:
  readonly Phase2AttendedPreviewRoute[] = Object.freeze(
    PHASE2_ATTENDED_PREVIEW_SCENARIOS.flatMap<Phase2AttendedPreviewRoute>(
      (scenario) => {
        const variants = PHASE2_ATTENDED_PREVIEW_REGISTRY[scenario];
        return variants === null
          ? [{ scenario, variant: null }]
          : variants.map((variant) => ({ scenario, variant }));
      },
    ),
  );

export function isPhase2AttendedPreviewScenario(
  value: unknown,
): value is Phase2AttendedPreviewScenario {
  return typeof value === "string"
    && Object.prototype.hasOwnProperty.call(
      PHASE2_ATTENDED_PREVIEW_REGISTRY,
      value,
    );
}

function isExactVariant<Value extends string>(
  value: unknown,
  allowed: readonly Value[],
): value is Value {
  return typeof value === "string"
    && allowed.some((candidate) => candidate === value);
}

export function isPhase2CalendarPreviewVariant(
  value: unknown,
): value is Phase2CalendarPreviewVariant {
  return isExactVariant(value, PHASE2_CALENDAR_PREVIEW_VARIANTS);
}

export function isPhase2TodayPlanPreviewVariant(
  value: unknown,
): value is Phase2TodayPlanPreviewVariant {
  return isExactVariant(value, PHASE2_TODAY_PLAN_PREVIEW_VARIANTS);
}

export function isPhase2SetMutationPreviewVariant(
  value: unknown,
): value is Phase2SetMutationPreviewVariant {
  return isExactVariant(value, PHASE2_SET_MUTATION_PREVIEW_VARIANTS);
}

export function resolvePhase2AttendedPreviewRoute(
  scenarioValue: unknown,
  variantValue: unknown,
): Phase2AttendedPreviewRoute | null {
  if (!isPhase2AttendedPreviewScenario(scenarioValue)) {
    return null;
  }
  const variants = PHASE2_ATTENDED_PREVIEW_REGISTRY[scenarioValue];
  if (variants === null) {
    return variantValue === undefined
      ? { scenario: scenarioValue, variant: null }
      : null;
  }
  if (
    typeof variantValue !== "string"
    || !(variants as readonly string[]).includes(variantValue)
  ) {
    return null;
  }
  return {
    scenario: scenarioValue,
    variant: variantValue as Phase2AttendedPreviewVariant,
  };
}

export function pendingPromise<Value>(): Promise<Value> {
  return new Promise(() => undefined);
}

const starterPlans: LibraryBrowseSnapshot["plans"]["starters"] = [
  {
    id: "full-body-foundation",
    ordinal: 0,
    name: "Full Body Foundation",
    daysPerWeek: 3,
    goal: "General strength and consistency",
    experience: "Beginner / returning",
    equipment: ["Barbell", "Cable", "Dumbbells"],
    estimateMinutes: 48,
  },
  {
    id: "upper-lower",
    ordinal: 1,
    name: "Upper / Lower",
    daysPerWeek: 4,
    goal: "Balanced strength and hypertrophy",
    experience: "Intermediate",
    equipment: ["Barbell", "Cable", "Machine"],
    estimateMinutes: 55,
  },
] as const;

export const phase2PlanPartialSnapshot: LibraryBrowseSnapshot = {
  sectionPreference: { section: "plans", revision: 4 },
  plans: {
    active: {
      id: "preview-active-plan",
      name: "Full Body Foundation · Current owner plan",
      daysPerWeek: 3,
      status: "Active",
      scheduleSummary: "Weekdays · next session pending",
      missingRequirement: "One day still needs equipment review.",
      templateUpdateTemplateId: "full-body-foundation",
    },
    owned: [
      {
        id: "preview-draft-plan",
        name: "Travel strength draft",
        daysPerWeek: 2,
        status: "Draft",
        missingRequirement: "Add at least one working set to Day 2.",
      },
      {
        id: "preview-archived-plan",
        name: "Archived hypertrophy block",
        daysPerWeek: 4,
        status: "Archived",
      },
    ],
    starters: starterPlans,
  },
};

export const phase2ExercisePartialItems: readonly LibraryExerciseItem[] = [
  {
    exerciseId: "preview-exercise-available",
    canonicalName: "Barbell front squat",
    matchedAlias: null,
    exerciseType: "strength",
    origin: "bundled",
    originLabel: "Built-in",
    availability: "available",
    favorite: true,
    hidden: false,
    archived: false,
    recentAtMs: 1_800_000_000_100,
    muscles: ["quadriceps", "glutes"],
    equipment: ["barbell"],
    source: {
      namespace: "kinetic-place.exercises-db",
      revision: "preview-r1",
      license: "MIT",
      attribution: "Preview attribution for the available search result",
    },
  },
  {
    exerciseId: "preview-exercise-unavailable",
    canonicalName: "Cable chest-supported single-arm row with a long owner-facing name",
    matchedAlias: {
      id: 1,
      displayText: "Single-arm cable row",
      label: "Matched alias: Single-arm cable row",
    },
    exerciseType: "strength",
    origin: "bundled",
    originLabel: "Built-in",
    availability: "unavailable",
    favorite: true,
    hidden: false,
    archived: false,
    recentAtMs: 1_800_000_000_000,
    muscles: ["back", "biceps"],
    equipment: ["cable", "bench"],
    source: {
      namespace: "kinetic-place.exercises-db",
      revision: "preview-r1",
      license: "MIT",
      attribution: "Preview attribution with deliberately long text for reflow review",
    },
  },
  {
    exerciseId: "preview-exercise-hidden",
    canonicalName: "Owner-created tempo goblet squat",
    matchedAlias: null,
    exerciseType: "strength",
    origin: "custom",
    originLabel: "Custom",
    availability: "available",
    favorite: false,
    hidden: true,
    archived: true,
    recentAtMs: null,
    muscles: ["quadriceps", "glutes"],
    equipment: ["dumbbell"],
    source: null,
  },
] as const;

export const phase2ExerciseRecentItems = phase2ExercisePartialItems.filter(
  (item) => item.recentAtMs !== null
    && item.availability === "available"
    && !item.hidden
    && !item.archived,
);

export const phase2ExercisePartialSnapshot: LibraryBrowseSnapshot = {
  sectionPreference: { section: "exercises", revision: 7 },
  plans: { active: null, owned: [], starters: starterPlans },
  exerciseFilterOptions: {
    exerciseTypes: ["strength"],
    muscles: ["back", "quadriceps"],
    equipment: ["cable", "dumbbell"],
  },
};

export function previewSectionPreference(
  section: LibrarySection,
  expectedRevision: number,
): Promise<LibrarySectionPreference> {
  return Promise.resolve({ section, revision: expectedRevision + 1 });
}

const metricIdentity = {
  profile: "load_reps" as const,
  contractVersion: 1,
  exerciseMetricGeneration: 1,
};

function set(
  id: string,
  kind: "warmup" | "working",
  ordinal: number,
  status: ActiveWorkoutSet["status"] = "planned",
): ActiveWorkoutSet {
  const loadGrams = kind === "warmup" ? 20_000 : 60_000;
  const observation = {
    version: 1 as const,
    profile: "load_reps" as const,
    loadGrams,
    reps: 8,
    source: "manual" as const,
  };
  return {
    id,
    kind,
    ordinal,
    sourceTargetId: kind === "working" ? `target-${ordinal + 1}` : null,
    metricIdentity,
    target: {
      version: 1,
      profile: "load_reps",
      loadGrams,
      minReps: 8,
      maxReps: 8,
      incrementGrams: 2_500,
      perSide: false,
    },
    observation: status === "completed" ? observation : null,
    status,
    completedAtMs: status === "completed" ? 1_799_999_999_000 + ordinal : null,
    revision: 1,
    valueSources: [{ source: "manual", observation }],
  };
}

function exercise(
  id: string,
  name: string,
  ordinal: number,
  status: ActiveWorkoutExercise["status"],
): ActiveWorkoutExercise {
  return {
    id,
    exerciseId: `catalog-${id}`,
    name,
    metricIdentity,
    metricProfile: "load_reps",
    ordinal,
    defaultRestSeconds: 120,
    status,
    revision: 1,
    warmups: ordinal === 0
      ? [set("preview-warmup-1", "warmup", 0)]
      : [],
    workingSets: [
      set(
        `preview-working-${ordinal + 1}-1`,
        "working",
        0,
        status === "completed" ? "completed"
          : status === "skipped" ? "skipped" : "planned",
      ),
      set(
        `preview-working-${ordinal + 1}-2`,
        "working",
        1,
        status === "completed" ? "completed"
          : status === "skipped" ? "skipped" : "planned",
      ),
    ],
  };
}

const previewExercises = [
  exercise("preview-exercise-1", "Back Squat", 0, "active"),
  exercise("preview-exercise-2", "Bench Press", 1, "completed"),
  exercise("preview-exercise-3", "Barbell Row", 2, "planned"),
  exercise("preview-exercise-4", "Pull-up", 3, "skipped"),
] as const;

export function workoutView(
  exercises: readonly ActiveWorkoutExercise[],
): ActiveWorkoutView {
  if (exercises.length === 0) {
    throw new Error("phase2_preview_workout_requires_exercise");
  }
  const currentExercise = exercises[0]!;
  const workingSets = exercises.flatMap((exercise) => exercise.workingSets);
  return {
    id: "preview-session",
    status: "in_progress",
    revision: 1,
    activeSetId: currentExercise.workingSets.find(({ status }) =>
      status === "planned" || status === "draft"
    )?.id ?? null,
    activeExerciseId: currentExercise.id,
    currentExercise,
    exercises,
    progress: {
      completedWorkingSets: workingSets.filter(({ status }) =>
        status === "completed"
      ).length,
      totalWorkingSets: workingSets.length,
    },
    rest: {
      version: 1,
      state: "idle",
      revision: 0,
      nextSetId: null,
    },
  };
}

export const phase2SetMutationPreviewView = workoutView([previewExercises[0]]);
export const phase2SetCorrectionPreviewView = workoutView([{
  ...previewExercises[0],
  workingSets: previewExercises[0].workingSets.map((candidate, index) =>
    index === 0
      ? {
          ...candidate,
          observation: candidate.valueSources[0]!.observation,
          status: "completed" as const,
          completedAtMs: 1_799_999_999_000,
          revision: 2,
        }
      : candidate
  ),
}]);
if (phase2SetCorrectionPreviewView.activeSetId === null) {
  throw new Error("phase2_preview_correction_requires_active_set");
}
export const phase2TodayPlanOneView = workoutView([previewExercises[0]]);
export const phase2TodayPlanManyView = workoutView(previewExercises);

const restResult: RestCommandResult = {
  state: phase2SetMutationPreviewView.rest,
  sessionRevision: 2,
  invalidationScopes: [
    ["active-workout", phase2SetMutationPreviewView.id],
    ["today"],
  ],
};

export const phase2SetMutationPreviewCommands: ActiveWorkoutCommands = {
  updateActiveSetDraft: async () => phase2SetMutationPreviewView,
  updateWarmupDraft: async () => phase2SetMutationPreviewView,
  addWarmup: () => pendingPromise(),
  addWorkingSet: () => pendingPromise(),
  copyPreviousWarmup: () => pendingPromise(),
  completeWarmup: async () => phase2SetMutationPreviewView,
  skipWarmup: async () => phase2SetMutationPreviewView,
  skipWorkingSet: async () => phase2SetMutationPreviewView,
  completeSet: async () => ({
    outcome: "committed",
    view: phase2SetMutationPreviewView,
  }),
  reviseCompletedSet: () => pendingPromise(),
  startManualRest: async () => restResult,
  pauseRest: async () => restResult,
  resumeRest: async () => restResult,
  adjustRest: async () => restResult,
  skipRest: async () => restResult,
  expireRest: async () => restResult,
  finishCompleted: () => pendingPromise(),
  finishPartial: () => pendingPromise(),
  saveZeroSetWorkout: () => pendingPromise(),
  discardWorkout: () => pendingPromise(),
  skipExercise: async () => ({
    sessionId: phase2SetMutationPreviewView.id,
    status: "in_progress",
    sessionRevision: 2,
  }),
};
