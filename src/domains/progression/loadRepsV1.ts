export const LOAD_REPS_RULE = "load_reps.double_progression.v1" as const;

export type ExerciseEffort =
  | "easy"
  | "on_target"
  | "hard"
  | "failed";

export type LoadRepsEvidenceSet = Readonly<{
  id: string;
  kind: "warmup" | "working";
  status: "planned" | "draft" | "completed" | "skipped";
  profile: string;
  version: number;
  loadGrams: number;
  reps: number | null;
}>;

export type LoadRepsProgressionInput = Readonly<{
  version: 1;
  rule: typeof LOAD_REPS_RULE;
  target: Readonly<{
    version: 1;
    profile: "load_reps";
    loadGrams: number;
    minReps: number;
    maxReps: number;
    incrementGrams: number;
    /** The actual next increment the owner can load today, when known. */
    availableIncrementGrams?: number;
    plannedSets: number;
  }>;
  sets: readonly LoadRepsEvidenceSet[];
  effort: ExerciseEffort | null;
}>;

export type LoadRepsProgressionDecision =
  | "baseline"
  | "hold"
  | "increase"
  | "retry"
  | "manual";

export type LoadRepsProgressionResult = Readonly<{
  version: 1;
  rule: typeof LOAD_REPS_RULE;
  ruleVersion: 1;
  decision: LoadRepsProgressionDecision;
  reasonCode:
    | "baseline_no_comparable_working_sets"
    | "manual_noncomparable_working_sets"
    | "retry_incomplete_working_sets"
    | "retry_repeated_below_range"
    | "hold_progress_within_range"
    | "hold_effort_not_recorded"
    | "hold_hard_effort"
    | "retry_failed_effort"
    | "manual_equipment_increment_unavailable"
    | "increase_all_qualified_sets_at_upper_bound";
  reason: string;
  confidence: "baseline" | "high" | "manual";
  current: Readonly<{
    loadGrams: number;
    minReps: number;
    maxReps: number;
    targetReps: readonly number[];
  }>;
  proposed: Readonly<{
    loadGrams: number;
    targetReps: readonly number[];
  }>;
  evidence: Readonly<{
    version: 1;
    comparableReps: readonly number[];
    effort: ExerciseEffort | null;
    excludedWarmups: number;
    excludedWorkingSets: number;
    qualifiedWorkingSets: number;
    incompleteWorkingSets: number;
    belowRangeWorkingSets: number;
    availableEquipmentIncrementGrams: number | null;
    plannedSets: number;
  }>;
}>;

function positiveInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function validInput(input: LoadRepsProgressionInput): boolean {
  const { target } = input;
  return input.version === 1
    && input.rule === LOAD_REPS_RULE
    && target.version === 1
    && target.profile === "load_reps"
    && Number.isSafeInteger(target.loadGrams)
    && target.loadGrams >= 0
    && positiveInteger(target.minReps)
    && positiveInteger(target.maxReps)
    && target.maxReps >= target.minReps
    && Number.isSafeInteger(target.incrementGrams)
    && target.incrementGrams >= 0
    && positiveInteger(target.plannedSets);
}

function targetRepetitions(value: number, count: number): readonly number[] {
  return Array.from({ length: count }, () => value);
}

export function evaluateLoadRepsV1(
  input: LoadRepsProgressionInput,
): LoadRepsProgressionResult {
  if (!validInput(input)) {
    throw new TypeError("invalid_load_reps_progression_input");
  }

  const workingSets = input.sets.filter(({ kind }) => kind === "working");
  const excludedWarmups = input.sets.length - workingSets.length;
  const comparable = workingSets.filter((set) =>
    set.status === "completed"
    && set.version === 1
    && set.profile === "load_reps"
    && set.loadGrams === input.target.loadGrams
    && set.reps !== null
    && positiveInteger(set.reps),
  );
  const mismatchedCompleted = workingSets.some((set) =>
    set.status === "completed" && !comparable.includes(set),
  );
  const comparableReps = comparable.map(({ reps }) => reps!);
  const incompleteWorkingSets = workingSets.filter(({ status }) =>
    status === "planned" || status === "draft" || status === "skipped"
  ).length;
  const belowRangeWorkingSets = comparable.filter(({ reps }) =>
    reps! < input.target.minReps
  ).length;
  const availableEquipmentIncrementGrams = input.target.availableIncrementGrams
    ?? input.target.incrementGrams;
  const currentTargetReps = targetRepetitions(
    input.target.maxReps,
    input.target.plannedSets,
  );
  const evidence = {
    version: 1 as const,
    comparableReps,
    effort: input.effort,
    excludedWarmups,
    excludedWorkingSets: workingSets.length - comparable.length,
    qualifiedWorkingSets: comparable.length,
    incompleteWorkingSets,
    belowRangeWorkingSets,
    availableEquipmentIncrementGrams: positiveInteger(availableEquipmentIncrementGrams)
      ? availableEquipmentIncrementGrams
      : null,
    plannedSets: input.target.plannedSets,
  };
  const current = {
    loadGrams: input.target.loadGrams,
    minReps: input.target.minReps,
    maxReps: input.target.maxReps,
    targetReps: currentTargetReps,
  };
  const result = (
    decision: LoadRepsProgressionDecision,
    reasonCode: LoadRepsProgressionResult["reasonCode"],
    reason: string,
    loadGrams: number,
    repetitions: readonly number[],
    confidence: LoadRepsProgressionResult["confidence"] = "high",
  ): LoadRepsProgressionResult => ({
    version: 1,
    rule: LOAD_REPS_RULE,
    ruleVersion: 1,
    decision,
    reasonCode,
    reason,
    confidence,
    current,
    proposed: {
      loadGrams,
      targetReps: repetitions,
    },
    evidence,
  });

  if (workingSets.length === 0) {
    return result(
      "baseline",
      "baseline_no_comparable_working_sets",
      "No comparable working-set history",
      input.target.loadGrams,
      targetRepetitions(input.target.minReps, input.target.plannedSets),
      "baseline",
    );
  }
  if (mismatchedCompleted) {
    return result(
      "manual",
      "manual_noncomparable_working_sets",
      "Working-set evidence is not comparable",
      input.target.loadGrams,
      currentTargetReps,
      "manual",
    );
  }
  if (
    workingSets.length < input.target.plannedSets
    || comparable.length < input.target.plannedSets
    || workingSets.some(({ status }) => status !== "completed")
  ) {
    return result(
      "retry",
      "retry_incomplete_working_sets",
      "Planned working sets are incomplete",
      input.target.loadGrams,
      currentTargetReps,
    );
  }
  if (belowRangeWorkingSets >= 2) {
    return result(
      "retry",
      "retry_repeated_below_range",
      "Repeated working sets are below the planned range",
      input.target.loadGrams,
      currentTargetReps,
    );
  }

  const reachedUpperBound = comparableReps.every(
    (reps) => reps >= input.target.maxReps,
  );
  if (!reachedUpperBound) {
    return result(
      "hold",
      "hold_progress_within_range",
      "One more repetition completes the range",
      input.target.loadGrams,
      currentTargetReps,
    );
  }
  if (input.effort === null) {
    return result(
      "hold",
      "hold_effort_not_recorded",
      "Effort not recorded",
      input.target.loadGrams,
      currentTargetReps,
    );
  }
  if (input.effort === "hard") {
    return result(
      "hold",
      "hold_hard_effort",
      "Hard effort recorded",
      input.target.loadGrams,
      currentTargetReps,
    );
  }
  if (input.effort === "failed") {
    return result(
      "retry",
      "retry_failed_effort",
      "Retry the current target",
      input.target.loadGrams,
      currentTargetReps,
    );
  }
  if (!positiveInteger(availableEquipmentIncrementGrams)) {
    return result(
      "manual",
      "manual_equipment_increment_unavailable",
      "A usable equipment increment is not available",
      input.target.loadGrams,
      currentTargetReps,
      "manual",
    );
  }
  return result(
    "increase",
    "increase_all_qualified_sets_at_upper_bound",
    "All working sets reached the range",
    input.target.loadGrams + availableEquipmentIncrementGrams,
    targetRepetitions(input.target.minReps, input.target.plannedSets),
  );
}
