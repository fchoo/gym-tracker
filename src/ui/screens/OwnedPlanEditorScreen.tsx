import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  StyleSheet,
  Text,
  View,
  type TextStyle,
} from "react-native";

import type {
  MetricIdentity,
  MetricProfile,
  MetricTarget,
} from "../../domains/metrics";
import type {
  OwnedPlanDayInput,
  OwnedPlanDraftInput,
  OwnedPlanOccurrenceInput,
} from "../../domains/plans";
import {
  AdaptiveScreen,
} from "../layout/AdaptiveScreen";
import {
  ConfirmationSheet,
  ContentCard,
  EmptyState,
  FocusablePressable,
  InlineNotice,
  M3SearchField,
  PrimaryAction,
  ScreenHeader,
  SecondaryAction,
  SectionHeader,
  SkeletonBlock,
} from "../components";
import {
  PlanEditorReorderableRow,
  PlanEditorTextField,
  SemanticNumberField,
  TimeDurationField,
  type PlanEditorReorderPreview,
} from "../components/PlanEditorFields";
import {
  radius,
  space,
  typeScale,
  useAppTheme,
} from "../theme";

export type OwnedPlanEditorExerciseOption = Readonly<{
  id: string;
  name: string;
  metricIdentity: MetricIdentity;
  defaultRestSeconds?: number;
}>;

export type OwnedPlanEditorSnapshot = Readonly<{
  id: string;
  name: string;
  revision: number;
  lifecycle: "draft" | "ready" | "archived";
  graphStatus: "missing_valid_target" | "valid";
  missingRequirement: string | null;
  isActive: boolean;
  hasInProgressWorkout: boolean;
  days: readonly OwnedPlanDayInput[];
}>;

export type OwnedPlanEditorResult =
  | Readonly<{
      outcome: "committed" | "already_committed";
      plan: OwnedPlanEditorSnapshot;
      currentWorkoutUnaffected: boolean;
    }>
  | Readonly<{
      outcome: "requires_schedule_impact";
      code: "requires_schedule_impact";
    }>;

type OwnedPlanEditorScreenProps = Readonly<{
  mode: "create" | "edit";
  planId?: string;
  createDraft(input: Readonly<{
    name: string;
    dayName: string;
  }>): Promise<OwnedPlanEditorResult>;
  loadPlan(planId: string): Promise<OwnedPlanEditorSnapshot | null>;
  listExercises(): Promise<readonly OwnedPlanEditorExerciseOption[]>;
  savePlan(input: Readonly<{
    expectedRevision: number;
    plan: OwnedPlanDraftInput;
  }>): Promise<OwnedPlanEditorResult>;
  duplicatePlan(input: Readonly<{
    sourcePlanId: string;
    expectedRevision: number;
    name: string;
  }>): Promise<OwnedPlanEditorResult>;
  archivePlan(input: Readonly<{
    planId: string;
    expectedRevision: number;
  }>): Promise<OwnedPlanEditorResult>;
  restorePlan(input: Readonly<{
    planId: string;
    expectedRevision: number;
  }>): Promise<OwnedPlanEditorResult>;
  createId?(kind: string): string;
  onBack(): void;
  onSchedule?(planId: string): void;
  onRemoveDay?(dayId: string): void;
  onReplaceOccurrence?(occurrenceId: string): void;
  onSaved(planId: string): void;
  width?: number;
}>;

type LoadState = "create" | "loading" | "ready" | "error";
type ExerciseLoadState = "loading" | "ready" | "error";
type TargetDraft = Readonly<{
  exercise: OwnedPlanEditorExerciseOption;
  workingSets: string;
  restSeconds: string;
  loadKg: string;
  incrementKg: string;
  minimumReps: string;
  maximumReps: string;
  variationId: string;
  assistanceKg: string;
  assistanceEquipmentId: string;
  durationSeconds: string;
  distanceMeters: string;
  protocolId: string;
  plannedRounds: string;
  workIntervalSeconds: string;
  intervalRestSeconds: string;
}>;

const PROFILE_LABELS: Readonly<Record<MetricProfile, string>> = {
  load_reps: "Load + reps",
  bodyweight_reps: "Bodyweight reps",
  added_load_reps: "Added load + reps",
  assisted_reps: "Assisted reps",
  timed_hold: "Timed hold",
  fixed_distance: "Fixed distance",
  fixed_time: "Fixed time",
  intervals: "Rounds / intervals",
  unscored: "Mobility / unscored",
};

function draftFromSnapshot(
  snapshot: OwnedPlanEditorSnapshot,
): OwnedPlanDraftInput {
  return {
    id: snapshot.id,
    name: snapshot.name,
    days: snapshot.days.map((day) => ({
      id: day.id,
      name: day.name,
      ordinal: day.ordinal,
      occurrences: day.occurrences.map((occurrence) => ({
        ...occurrence,
        metricIdentity: { ...occurrence.metricIdentity },
        warmups: occurrence.warmups.map((warmup) => ({ ...warmup })),
        targets: occurrence.targets.map((target) => ({
          ...target,
          target: { ...target.target },
          units: { ...target.units },
        })),
        policy: {
          ...occurrence.policy,
          rule: { ...occurrence.policy.rule },
        },
      })),
    })),
  };
}

function initialTargetDraft(
  exercise: OwnedPlanEditorExerciseOption,
): TargetDraft {
  return {
    exercise,
    workingSets: "1",
    restSeconds: String(exercise.defaultRestSeconds ?? 90),
    loadKg: "0",
    incrementKg: "2.5",
    minimumReps: "8",
    maximumReps: "12",
    variationId: "standard",
    assistanceKg: "0",
    assistanceEquipmentId: "assistance-machine",
    durationSeconds: "30",
    distanceMeters: "1000",
    protocolId: "custom-interval",
    plannedRounds: "3",
    workIntervalSeconds: "30",
    intervalRestSeconds: "30",
  };
}

function positiveInteger(value: string): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function nonnegativeInteger(value: string): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function grams(value: string): number | null {
  const parsed = Number(value);
  const result = parsed * 1_000;
  return Number.isFinite(parsed)
      && parsed >= 0
      && Number.isSafeInteger(result)
    ? result
    : null;
}

function secondsToMs(value: string): number | null {
  const seconds = Number(value);
  const result = seconds * 1_000;
  return Number.isFinite(seconds)
      && seconds > 0
      && Number.isSafeInteger(result)
    ? result
    : null;
}

function buildMetricTarget(
  draft: TargetDraft,
): Readonly<{ target: MetricTarget; units: Readonly<Record<string, unknown>> }>
  | null {
  const minimumReps = positiveInteger(draft.minimumReps);
  const maximumReps = positiveInteger(draft.maximumReps);
  const loadGrams = grams(draft.loadKg);
  const incrementGrams = grams(draft.incrementKg);
  const durationSeconds = positiveInteger(draft.durationSeconds);
  const durationMs = secondsToMs(draft.durationSeconds);
  const distanceMeters = positiveInteger(draft.distanceMeters);
  const profile = draft.exercise.metricIdentity.profile;

  if (minimumReps !== null && maximumReps !== null
      && maximumReps < minimumReps) {
    return null;
  }

  switch (profile) {
    case "load_reps":
      return loadGrams === null || incrementGrams === null
          || minimumReps === null || maximumReps === null
        ? null
        : {
            target: {
              profile,
              version: 1,
              loadGrams,
              minReps: minimumReps,
              maxReps: maximumReps,
              incrementGrams,
              perSide: false,
            },
            units: {
              version: 1,
              load: "grams",
              count: "repetitions",
            },
          };
    case "bodyweight_reps":
      return minimumReps === null || maximumReps === null
          || draft.variationId.trim().length === 0
        ? null
        : {
            target: {
              profile,
              version: 1,
              minReps: minimumReps,
              maxReps: maximumReps,
              variationId: draft.variationId.trim(),
              perSide: false,
            },
            units: { version: 1, count: "repetitions" },
          };
    case "added_load_reps":
      return loadGrams === null || incrementGrams === null
          || minimumReps === null || maximumReps === null
        ? null
        : {
            target: {
              profile,
              version: 1,
              addedLoadGrams: loadGrams,
              minReps: minimumReps,
              maxReps: maximumReps,
              incrementGrams,
              perSide: false,
            },
            units: {
              version: 1,
              addedLoad: "grams",
              count: "repetitions",
            },
          };
    case "assisted_reps": {
      const assistanceGrams = grams(draft.assistanceKg);
      return assistanceGrams === null || incrementGrams === null
          || minimumReps === null || maximumReps === null
          || draft.assistanceEquipmentId.trim().length === 0
        ? null
        : {
            target: {
              profile,
              version: 1,
              assistanceGrams,
              minReps: minimumReps,
              maxReps: maximumReps,
              decrementGrams: incrementGrams,
              assistanceEquipmentId:
                draft.assistanceEquipmentId.trim(),
              perSide: false,
            },
            units: {
              version: 1,
              assistance: "grams",
              count: "repetitions",
            },
          };
    }
    case "timed_hold":
      return draft.exercise.metricIdentity.contractVersion === 2
        ? durationMs === null
          ? null
          : {
              target: {
                profile,
                version: 2,
                durationMs,
                perSide: false,
              },
              units: { version: 1, duration: "milliseconds" },
            }
        : durationSeconds === null
          ? null
          : {
              target: {
                profile,
                version: 1,
                durationSeconds,
                perSide: false,
              },
              units: { version: 1, duration: "seconds" },
            };
    case "fixed_distance":
      return distanceMeters === null
        ? null
        : {
            target: {
              profile,
              version: 1,
              plannedDistanceMeters: distanceMeters,
            },
            units: { version: 1, distance: "meters" },
          };
    case "fixed_time":
      return durationMs === null
        ? null
        : {
            target: {
              profile,
              version: 1,
              plannedDurationMs: durationMs,
            },
            units: { version: 1, duration: "milliseconds" },
          };
    case "intervals": {
      const plannedRounds = positiveInteger(draft.plannedRounds);
      const workIntervalMs = secondsToMs(draft.workIntervalSeconds);
      const restIntervalSeconds =
        nonnegativeInteger(draft.intervalRestSeconds);
      return plannedRounds === null || workIntervalMs === null
          || restIntervalSeconds === null
          || draft.protocolId.trim().length === 0
        ? null
        : {
            target: {
              profile,
              version: 1,
              protocolId: draft.protocolId.trim(),
              comparatorId: "rounds_then_work",
              comparatorVersion: 1,
              plannedRounds,
              workIntervalMs,
              restIntervalMs: restIntervalSeconds * 1_000,
            },
            units: {
              version: 1,
              rounds: "count",
              duration: "milliseconds",
            },
          };
    }
    case "unscored":
      return {
        target: {
          profile,
          version: 1,
          completionRequired: true,
        },
        units: { version: 1, completion: "boolean" },
      };
  }
}

function targetSummary(occurrence: OwnedPlanOccurrenceInput): string {
  const first = occurrence.targets[0]?.target;
  if (first === undefined) {
    return `${occurrence.targets.length} working sets`;
  }
  const count = occurrence.targets.length;
  const setCopy = `${count} working ${count === 1 ? "set" : "sets"}`;
  switch (first.profile) {
    case "load_reps":
      return `${setCopy} · ${first.loadGrams / 1_000} kg · ${first.minReps}–${first.maxReps} reps`;
    case "bodyweight_reps":
      return `${setCopy} · ${first.minReps}–${first.maxReps} reps`;
    case "added_load_reps":
      return `${setCopy} · ${first.addedLoadGrams / 1_000} kg added · ${first.minReps}–${first.maxReps} reps`;
    case "assisted_reps":
      return `${setCopy} · ${first.assistanceGrams / 1_000} kg assistance · ${first.minReps}–${first.maxReps} reps`;
    case "timed_hold":
      return `${setCopy} · ${
        first.version === 1
          ? `${first.durationSeconds} sec`
          : `${first.durationMs / 1_000} sec`
      }`;
    case "fixed_distance":
      return `${setCopy} · ${first.plannedDistanceMeters} m`;
    case "fixed_time":
      return `${setCopy} · ${first.plannedDurationMs / 1_000} sec`;
    case "intervals":
      return `${setCopy} · ${first.plannedRounds} rounds`;
    case "unscored":
      return `${setCopy} · Completion`;
  }
}

function resultPlan(
  result: OwnedPlanEditorResult,
): OwnedPlanEditorSnapshot | null {
  return result.outcome === "requires_schedule_impact" ? null : result.plan;
}

function move<Value>(
  values: readonly Value[],
  sourceIndex: number,
  targetIndex: number,
): readonly Value[] {
  if (
    sourceIndex < 0
    || sourceIndex >= values.length
    || targetIndex < 0
    || targetIndex >= values.length
    || sourceIndex === targetIndex
  ) {
    return values;
  }
  const result = [...values];
  const [item] = result.splice(sourceIndex, 1);
  result.splice(targetIndex, 0, item!);
  return result;
}

export function OwnedPlanEditorScreen({
  mode,
  planId,
  createDraft,
  loadPlan,
  listExercises,
  savePlan,
  duplicatePlan,
  archivePlan,
  restorePlan,
  createId,
  onBack,
  onSchedule,
  onRemoveDay,
  onReplaceOccurrence,
  onSaved,
  width,
}: OwnedPlanEditorScreenProps) {
  const { colors } = useAppTheme();
  const localId = useRef(0);
  const errorSummaryRef = useRef<View>(null);
  const duplicateActionRef = useRef<View>(null);
  const archiveActionRef = useRef<View>(null);
  const restoreActionRef = useRef<View>(null);
  const [state, setState] = useState<LoadState>(
    mode === "create" ? "create" : "loading",
  );
  const [retryGeneration, setRetryGeneration] = useState(0);
  const [snapshot, setSnapshot] = useState<OwnedPlanEditorSnapshot | null>(
    null,
  );
  const [draft, setDraft] = useState<OwnedPlanDraftInput | null>(null);
  const [createName, setCreateName] = useState("");
  const [firstDayName, setFirstDayName] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState(false);
  const [exercises, setExercises] = useState<
    readonly OwnedPlanEditorExerciseOption[]
  >([]);
  const [exerciseLoadState, setExerciseLoadState] =
    useState<ExerciseLoadState>("loading");
  const [exercisePickerVisible, setExercisePickerVisible] = useState(false);
  const [exerciseQuery, setExerciseQuery] = useState("");
  const [targetDraft, setTargetDraft] = useState<TargetDraft | null>(null);
  const [targetError, setTargetError] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [impactRequired, setImpactRequired] = useState(false);
  const [dirtyLeaveVisible, setDirtyLeaveVisible] = useState(false);
  const [duplicateVisible, setDuplicateVisible] = useState(false);
  const [archiveVisible, setArchiveVisible] = useState(false);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);
  const [draftFeedback, setDraftFeedback] = useState<string | null>(null);
  const [dayReorderPreview, setDayReorderPreview] =
    useState<PlanEditorReorderPreview | null>(null);
  const [exerciseReorderPreview, setExerciseReorderPreview] =
    useState<PlanEditorReorderPreview | null>(null);

  const nextId = useCallback((kind: string) => {
    if (createId !== undefined) {
      return createId(kind);
    }
    localId.current += 1;
    return `${kind}:local-${localId.current}`;
  }, [createId]);

  useEffect(() => {
    let active = true;
    setExerciseLoadState("loading");
    void listExercises().then((items) => {
      if (active) {
        setExercises(items);
        setExerciseLoadState("ready");
      }
    }).catch(() => {
      if (active) {
        setExercises([]);
        setExerciseLoadState("error");
      }
    });
    return () => {
      active = false;
    };
  }, [listExercises]);

  useEffect(() => {
    if (mode === "create") {
      setState(snapshot === null ? "create" : "ready");
      return;
    }
    if (planId === undefined || planId.length === 0) {
      setState("error");
      return;
    }
    let active = true;
    setState("loading");
    void loadPlan(planId).then((loaded) => {
      if (!active) {
        return;
      }
      if (loaded === null) {
        setState("error");
        return;
      }
      setSnapshot(loaded);
      setDraft(draftFromSnapshot(loaded));
      setSelectedDayId(loaded.days[0]?.id ?? null);
      setState("ready");
    }).catch(() => {
      if (active) {
        setState("error");
      }
    });
    return () => {
      active = false;
    };
  }, [loadPlan, mode, planId, retryGeneration]);

  const selectedDay = useMemo(
    () => draft?.days.find(({ id }) => id === selectedDayId)
      ?? draft?.days[0]
      ?? null,
    [draft, selectedDayId],
  );
  const names = useMemo(
    () => new Map(exercises.map((exercise) => [exercise.id, exercise.name])),
    [exercises],
  );
  const filteredExercises = useMemo(() => {
    const query = exerciseQuery.trim().toLocaleLowerCase("en");
    if (query.length === 0) {
      return exercises;
    }
    return exercises.filter((exercise) =>
      exercise.name.toLocaleLowerCase("en").includes(query)
      || PROFILE_LABELS[exercise.metricIdentity.profile]
        .toLocaleLowerCase("en")
        .includes(query)
    );
  }, [exerciseQuery, exercises]);
  const exerciseSearchState = exerciseLoadState === "loading"
    ? "busy"
    : exerciseLoadState === "error"
      ? "error"
      : filteredExercises.length === 0
        ? "empty"
        : "results";
  const exerciseResultCopy = `${filteredExercises.length} plan ${
    filteredExercises.length === 1 ? "exercise" : "exercises"
  }`;
  const dirty = useMemo(
    () => snapshot !== null
      && draft !== null
      && JSON.stringify(draft) !== JSON.stringify(draftFromSnapshot(snapshot)),
    [draft, snapshot],
  );

  const updateDraft = useCallback((
    update: (current: OwnedPlanDraftInput) => OwnedPlanDraftInput,
  ) => {
    setDraft((current) => current === null ? current : update(current));
    setSaveError(false);
    setImpactRequired(false);
    setDraftFeedback(null);
  }, []);

  const updateSelectedDay = useCallback((
    update: (current: OwnedPlanDayInput) => OwnedPlanDayInput,
  ) => {
    updateDraft((current) => ({
      ...current,
      days: current.days.map((day) =>
        day.id === (selectedDay?.id ?? selectedDayId) ? update(day) : day
      ),
    }));
  }, [selectedDay?.id, selectedDayId, updateDraft]);

  const create = useCallback(async () => {
    if (createName.trim().length === 0 || firstDayName.trim().length === 0) {
      setCreateError(true);
      return;
    }
    setCreateBusy(true);
    setCreateError(false);
    try {
      const result = await createDraft({
        name: createName.trim(),
        dayName: firstDayName.trim(),
      });
      const created = resultPlan(result);
      if (created === null) {
        setCreateError(true);
        return;
      }
      setSnapshot(created);
      setDraft(draftFromSnapshot(created));
      setSelectedDayId(created.days[0]?.id ?? null);
      setState("ready");
    } catch {
      setCreateError(true);
    } finally {
      setCreateBusy(false);
    }
  }, [createDraft, createName, firstDayName]);

  const commitTarget = useCallback(() => {
    if (targetDraft === null || selectedDay === null) {
      return;
    }
    const workingSets = positiveInteger(targetDraft.workingSets);
    const restSeconds = nonnegativeInteger(targetDraft.restSeconds);
    const metric = buildMetricTarget(targetDraft);
    if (workingSets === null || restSeconds === null || metric === null) {
      setTargetError(true);
      return;
    }
    const occurrenceId = nextId("owned-plan-occurrence");
    const profile = targetDraft.exercise.metricIdentity.profile;
    const policyId = `${profile}.manual_hold.v1`;
    const occurrence: OwnedPlanOccurrenceInput = {
      id: occurrenceId,
      exerciseId: targetDraft.exercise.id,
      ordinal: selectedDay.occurrences.length,
      restSeconds,
      metricIdentity: { ...targetDraft.exercise.metricIdentity },
      warmups: [],
      targets: Array.from({ length: workingSets }, (_, ordinal) => ({
        id: nextId("owned-plan-target"),
        ordinal,
        target: { ...metric.target },
        units: { ...metric.units },
      })),
      policy: {
        id: nextId("owned-plan-policy"),
        kind: "manual_hold",
        policyId,
        version: 1,
        rule: {
          kind: "manual_hold",
          id: policyId,
          version: 1,
        },
      },
    };
    updateSelectedDay((day) => ({
      ...day,
      occurrences: [...day.occurrences, occurrence],
    }));
    setTargetDraft(null);
    setTargetError(false);
    setExercisePickerVisible(false);
  }, [nextId, selectedDay, targetDraft, updateSelectedDay]);

  const commitPlan = useCallback(async (
    destination: "saved" | "back" = "saved",
  ): Promise<boolean> => {
    if (draft === null || snapshot === null) {
      return false;
    }
    if (
      draft.name.trim().length === 0
      || draft.days.length === 0
      || draft.days.some(({ name }) => name.trim().length === 0)
    ) {
      setSaveError(true);
      queueMicrotask(() => errorSummaryRef.current?.focus());
      return false;
    }
    setSaveBusy(true);
    setSaveError(false);
    try {
      const result = await savePlan({
        expectedRevision: snapshot.revision,
        plan: draft,
      });
      const committed = resultPlan(result);
      if (committed === null) {
        setImpactRequired(true);
        return false;
      }
      setSnapshot(committed);
      setDraft(draftFromSnapshot(committed));
      setSelectedDayId(committed.days[0]?.id ?? null);
      setDirtyLeaveVisible(false);
      if (destination === "back") {
        onBack();
      } else {
        onSaved(committed.id);
      }
      return true;
    } catch {
      setSaveError(true);
      queueMicrotask(() => errorSummaryRef.current?.focus());
      return false;
    } finally {
      setSaveBusy(false);
    }
  }, [draft, onBack, onSaved, savePlan, snapshot]);

  const requestBack = useCallback(() => {
    if (dirty) {
      setDirtyLeaveVisible(true);
      return;
    }
    onBack();
  }, [dirty, onBack]);

  const duplicate = useCallback(async () => {
    if (snapshot === null) {
      return;
    }
    setLifecycleBusy(true);
    try {
      const result = await duplicatePlan({
        sourcePlanId: snapshot.id,
        expectedRevision: snapshot.revision,
        name: `${snapshot.name} Copy`,
      });
      const duplicated = resultPlan(result);
      if (duplicated === null) {
        setImpactRequired(true);
        return;
      }
      setDuplicateVisible(false);
      onSaved(duplicated.id);
    } catch {
      setSaveError(true);
      queueMicrotask(() => errorSummaryRef.current?.focus());
    } finally {
      setLifecycleBusy(false);
    }
  }, [duplicatePlan, onSaved, snapshot]);

  const archive = useCallback(async () => {
    if (snapshot === null) {
      return;
    }
    setLifecycleBusy(true);
    try {
      const result = await archivePlan({
        planId: snapshot.id,
        expectedRevision: snapshot.revision,
      });
      const archived = resultPlan(result);
      if (archived === null) {
        setArchiveVisible(false);
        setImpactRequired(true);
        return;
      }
      setSnapshot(archived);
      setDraft(draftFromSnapshot(archived));
      setArchiveVisible(false);
      queueMicrotask(() => restoreActionRef.current?.focus());
    } catch {
      setSaveError(true);
      queueMicrotask(() => errorSummaryRef.current?.focus());
    } finally {
      setLifecycleBusy(false);
    }
  }, [archivePlan, snapshot]);

  const restore = useCallback(async () => {
    if (snapshot === null) {
      return;
    }
    setLifecycleBusy(true);
    try {
      const result = await restorePlan({
        planId: snapshot.id,
        expectedRevision: snapshot.revision,
      });
      const restored = resultPlan(result);
      if (restored === null) {
        setImpactRequired(true);
        return;
      }
      setSnapshot(restored);
      setDraft(draftFromSnapshot(restored));
    } catch {
      setSaveError(true);
      queueMicrotask(() => errorSummaryRef.current?.focus());
    } finally {
      setLifecycleBusy(false);
    }
  }, [restorePlan, snapshot]);

  const moveDay = useCallback((index: number, targetIndex: number) => {
    if (draft === null) {
      return;
    }
    const item = draft.days[index];
    if (
      item === undefined
      || targetIndex < 0
      || targetIndex >= draft.days.length
      || targetIndex === index
    ) {
      return;
    }
    const reordered = move(draft.days, index, targetIndex).map((
      day,
      ordinal,
    ) => ({ ...day, ordinal }));
    setDraft({ ...draft, days: reordered });
    setImpactRequired(false);
    setDraftFeedback(
      `${item.name} moved to ${targetIndex + 1} of ${reordered.length}`,
    );
  }, [draft]);

  const moveOccurrence = useCallback((
    day: OwnedPlanDayInput,
    index: number,
    targetIndex: number,
  ) => {
    const item = day.occurrences[index];
    if (
      item === undefined
      || targetIndex < 0
      || targetIndex >= day.occurrences.length
      || targetIndex === index
    ) {
      return;
    }
    updateSelectedDay((current) => ({
      ...current,
      occurrences: move(current.occurrences, index, targetIndex).map((
        occurrence,
        ordinal,
      ) => ({ ...occurrence, ordinal })),
    }));
    setDraftFeedback(
      `${names.get(item.exerciseId) ?? item.exerciseId} moved to `
        + `${targetIndex + 1} of ${day.occurrences.length}`,
    );
  }, [names, updateSelectedDay]);

  if (state === "create") {
    return (
      <AdaptiveScreen
        primary={(
          <>
            <ScreenHeader title="Create my own" backAction={onBack} />
            <PlanEditorTextField
              error={createError && createName.trim().length === 0
                ? "Enter a plan name."
                : undefined}
              label="Plan name"
              onChangeText={setCreateName}
              value={createName}
            />
            <PlanEditorTextField
              error={createError && firstDayName.trim().length === 0
                ? "Enter a first day name."
                : undefined}
              label="First day name"
              onChangeText={setFirstDayName}
              value={firstDayName}
            />
            {createError
              && createName.trim().length > 0
              && firstDayName.trim().length > 0
              ? (
                <InlineNotice
                  body="Your names are still here. Try again."
                  heading="Draft could not be created"
                  tone="error"
                />
              )
              : null}
            <PrimaryAction
              busy={createBusy}
              label="Create draft"
              onPress={() => {
                void create();
              }}
            />
          </>
        )}
        testID="owned-plan-create"
        {...(width === undefined ? {} : { width })}
      />
    );
  }

  if (state === "loading") {
    return (
      <AdaptiveScreen
        primary={(
          <View testID="owned-plan-editor-loading">
            <SkeletonBlock height={72} />
            <SkeletonBlock height={96} />
            <SkeletonBlock height={160} />
          </View>
        )}
        testID="owned-plan-editor"
        {...(width === undefined ? {} : { width })}
      />
    );
  }

  if (state === "error" || draft === null || snapshot === null) {
    return (
      <AdaptiveScreen
        primary={(
          <>
            <ScreenHeader title="Plan editor" backAction={onBack} />
            <EmptyState
              body="Your plans were not changed. Try again."
              heading="Plan could not be loaded"
              primaryAction={(
                <PrimaryAction
                  label="Retry"
                  onPress={() => setRetryGeneration((value) => value + 1)}
                />
              )}
            />
          </>
        )}
        testID="owned-plan-editor"
        {...(width === undefined ? {} : { width })}
      />
    );
  }

  const invalidDraft = snapshot.graphStatus === "missing_valid_target";
  const missingRequirement = snapshot.missingRequirement
    ?? "Add at least one exercise with valid targets before scheduling or activating.";

  return (
    <>
    <AdaptiveScreen
      dock={(
        <PrimaryAction
          busy={saveBusy}
          disabled={impactRequired}
          label="Save Plan Changes"
          onPress={() => {
            void commitPlan("saved");
          }}
        />
      )}
      primary={(
        <>
          <ScreenHeader title={draft.name} backAction={requestBack} />
          {snapshot.lifecycle === "draft" ? (
            <InlineNotice
              body={missingRequirement}
              heading="Draft"
              tone="attention"
            />
          ) : null}
          {snapshot.lifecycle === "archived" ? (
            <InlineNotice
              body="This plan is outside the default Library view. Its history is unchanged."
              heading="Archived"
            />
          ) : snapshot.isActive ? (
            <InlineNotice
              body="Future-facing edits use explicit Save and preserve the current schedule unless impact review is required."
              heading="Active"
              tone="completed"
            />
          ) : (
            <InlineNotice
              body="This plan is valid and inactive until you explicitly schedule or activate it."
              heading="Ready"
              tone="completed"
            />
          )}
          {snapshot.hasInProgressWorkout ? (
            <InlineNotice
              body="This workout uses immutable snapshots. Safe future-facing edits do not change it."
              heading="Current workout is unaffected"
            />
          ) : null}
          <PlanEditorTextField
            label="Plan name"
            onChangeText={(name) =>
              updateDraft((current) => ({ ...current, name }))}
            value={draft.name}
          />
          <View style={styles.scheduleActions}>
            <SecondaryAction
              disabled={invalidDraft}
              label="Schedule"
              onPress={() => {
                if (snapshot !== null && !invalidDraft) {
                  onSchedule?.(snapshot.id);
                }
              }}
            />
            <SecondaryAction
              disabled={invalidDraft}
              label="Activate"
              onPress={() => {
                if (snapshot !== null && !invalidDraft) {
                  onSchedule?.(snapshot.id);
                }
              }}
            />
          </View>
          {invalidDraft ? (
            <Text style={[
              typeScale.body as TextStyle,
              { color: colors.textSecondary },
            ]}>
              {`Schedule and Activate are unavailable. ${missingRequirement}`}
            </Text>
          ) : null}
          {saveError ? (
            <View
              accessibilityRole="alert"
              accessible
              focusable
              ref={errorSummaryRef}
              style={[
                styles.errorSummary,
                {
                  backgroundColor: colors.errorSurface,
                  borderColor: colors.destructive,
                },
              ]}
            >
              <Text style={[
                typeScale.bodyStrong as TextStyle,
                { color: colors.textPrimary },
              ]}>
                Plan could not be saved. Your edits are still here. Try again.
              </Text>
              <SecondaryAction
                label="Retry"
                onPress={() => {
                  void commitPlan();
                }}
              />
            </View>
          ) : null}
          {impactRequired ? (
            <InlineNotice
              body="The active schedule and current workout were not changed. Structural schedule impact is deferred to Plan 02-18."
              heading="Schedule impact review required"
              tone="attention"
            />
          ) : null}
          <View style={styles.lifecycleActions}>
            <SecondaryAction
              busy={lifecycleBusy}
              label="Duplicate plan"
              onPress={() => setDuplicateVisible(true)}
              ref={duplicateActionRef}
            />
            {snapshot.lifecycle === "archived" ? (
              <SecondaryAction
                busy={lifecycleBusy}
                label="Restore plan"
                onPress={() => {
                  void restore();
                }}
                ref={restoreActionRef}
              />
            ) : (
              <SecondaryAction
                busy={lifecycleBusy}
                destructive
                label="Archive plan"
                onPress={() => setArchiveVisible(true)}
                ref={archiveActionRef}
              />
            )}
          </View>
          <ContentCard testID="owned-plan-days-card">
            <SectionHeader
              supportingText={`${draft.days.length} ${
                draft.days.length === 1 ? "day" : "days"
              }`}
              title="Days"
              tone="card"
            />
            {draft.days.map((day, index) => (
              <PlanEditorReorderableRow
                count={draft.days.length}
                key={day.id}
                label={day.name}
                onDragPreview={setDayReorderPreview}
                onMoveDown={() => moveDay(index, index + 1)}
                onMoveTo={(targetIndex) => moveDay(index, targetIndex)}
                onMoveUp={() => moveDay(index, index - 1)}
                position={index}
                preview={dayReorderPreview}
                reorderId={`day-${day.name}`}
                tone="card"
              >
                <FocusablePressable
                  accessibilityLabel={`${day.name}. ${day.occurrences.length} exercises`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: selectedDay?.id === day.id }}
                  focusable
                  onPress={() => {
                    setDayReorderPreview(null);
                    setExerciseReorderPreview(null);
                    setSelectedDayId(day.id);
                  }}
                  style={styles.daySelect}
                >
                  <Text style={[
                    typeScale.bodyStrong as TextStyle,
                    { color: colors.contentCardText },
                  ]}>
                    {day.name}
                  </Text>
                  <Text style={[
                    typeScale.secondary as TextStyle,
                    { color: colors.contentCardTextSecondary },
                  ]}>
                    {`${day.occurrences.length} ${
                      day.occurrences.length === 1 ? "exercise" : "exercises"
                    }`}
                  </Text>
                </FocusablePressable>
              </PlanEditorReorderableRow>
            ))}
          </ContentCard>
          {selectedDay === null ? null : (
            <ContentCard
              style={styles.dayEditor}
              testID="owned-plan-day-editor-card"
            >
              <SectionHeader title="Day editor" tone="card" />
              <PlanEditorTextField
                label="Day name"
                onChangeText={(name) =>
                  updateSelectedDay((day) => ({ ...day, name }))}
                tone="card"
                value={selectedDay.name}
              />
              {onRemoveDay === undefined || draft.days.length < 2 ? null : (
                <SecondaryAction
                  destructive
                  label={`Remove ${selectedDay.name}`}
                  onPress={() => onRemoveDay(selectedDay.id)}
                />
              )}
              {selectedDay.occurrences.map((occurrence, index) => (
                <PlanEditorReorderableRow
                  count={selectedDay.occurrences.length}
                  key={occurrence.id}
                  label={names.get(occurrence.exerciseId)
                    ?? occurrence.exerciseId}
                  onDragPreview={setExerciseReorderPreview}
                  onMoveDown={() =>
                    moveOccurrence(selectedDay, index, index + 1)}
                  onMoveTo={(targetIndex) =>
                    moveOccurrence(selectedDay, index, targetIndex)}
                  onMoveUp={() =>
                    moveOccurrence(selectedDay, index, index - 1)}
                  position={index}
                  preview={exerciseReorderPreview}
                  reorderId={`exercise-${
                    names.get(occurrence.exerciseId) ?? occurrence.exerciseId
                  }`}
                  tone="card"
                >
                  <View style={styles.reorderLabelGroup}>
                    <Text style={[
                      typeScale.bodyStrong as TextStyle,
                      { color: colors.contentCardText },
                    ]}>
                      {names.get(occurrence.exerciseId)
                        ?? occurrence.exerciseId}
                    </Text>
                    <Text style={[
                      typeScale.secondary as TextStyle,
                      { color: colors.contentCardTextSecondary },
                    ]}>
                      {targetSummary(occurrence)}
                    </Text>
                    {onReplaceOccurrence === undefined ? null : (
                      <SecondaryAction
                        label={`Replace ${
                          names.get(occurrence.exerciseId)
                            ?? occurrence.exerciseId
                        }`}
                        onPress={() => onReplaceOccurrence(occurrence.id)}
                      />
                    )}
                  </View>
                </PlanEditorReorderableRow>
              ))}
              {targetDraft === null ? (
                <>
                  <SecondaryAction
                    label="Add exercise"
                    onPress={() => {
                      if (exercisePickerVisible) {
                        setExerciseQuery("");
                      }
                      setExercisePickerVisible(!exercisePickerVisible);
                    }}
                    testID="owned-plan-add-exercise"
                  />
                  {exercisePickerVisible ? (
                    <View style={styles.exercisePicker}>
                      <SectionHeader title="Choose exercise" tone="card" />
                      <M3SearchField
                        label="Search plan exercises"
                        onChangeText={setExerciseQuery}
                        onSearch={() =>
                          setExerciseQuery((query) => query.trim())}
                        resultCount={filteredExercises.length}
                        state={exerciseSearchState}
                        stateSlots={{
                          busy: <>Loading plan exercises</>,
                          error: <>Plan exercises could not be loaded</>,
                          results: <>{exerciseResultCopy}</>,
                        }}
                        testID="owned-plan-exercise-search"
                        value={exerciseQuery}
                      />
                      {exerciseSearchState === "empty" ? (
                        <InlineNotice
                          body="Try another exercise name or metric profile."
                          card
                          heading="No plan exercises match"
                        />
                      ) : exerciseLoadState === "ready"
                        ? filteredExercises.map((exercise) => (
                        <FocusablePressable
                          accessibilityLabel={`${exercise.name}. ${PROFILE_LABELS[exercise.metricIdentity.profile]}`}
                          accessibilityRole="button"
                          focusable
                          key={exercise.id}
                          onPress={() => {
                            setExerciseQuery("");
                            setTargetDraft(initialTargetDraft(exercise));
                          }}
                          style={[
                            styles.exerciseOption,
                            { borderColor: colors.contentCardBorder },
                          ]}
                        >
                          <Text style={[
                            typeScale.bodyStrong as TextStyle,
                            { color: colors.contentCardText },
                          ]}>
                            {exercise.name}
                          </Text>
                          <Text style={[
                            typeScale.secondary as TextStyle,
                            { color: colors.contentCardTextSecondary },
                          ]}>
                            {PROFILE_LABELS[exercise.metricIdentity.profile]}
                          </Text>
                        </FocusablePressable>
                        ))
                        : null}
                    </View>
                  ) : null}
                </>
              ) : (
                <TargetEditor
                  draft={targetDraft}
                  error={targetError}
                  onChange={setTargetDraft}
                  onSave={commitTarget}
                />
              )}
              {draftFeedback === null ? null : (
                <InlineNotice
                  body="This change remains in the plan draft until Save Plan Changes."
                  card
                  heading={draftFeedback}
                />
              )}
              <PrimaryAction
                label="Save day"
                onPress={() =>
                  setDraftFeedback(`${selectedDay.name} saved to draft`)}
              />
            </ContentCard>
          )}
        </>
      )}
      onRequestBack={requestBack}
      testID="owned-plan-editor"
      {...(width === undefined ? {} : { width })}
    />
    <ConfirmationSheet
      alternateLabel="Discard"
      body="Your edits are still here. Choose whether to save the complete plan, discard the local draft, or keep editing."
      cancelLabel="Keep editing"
      confirmLabel="Save changes"
      heading="Save changes?"
      onAlternate={() => {
        setDirtyLeaveVisible(false);
        onBack();
      }}
      onCancel={() => setDirtyLeaveVisible(false)}
      onConfirm={() => {
        void commitPlan("back");
      }}
      visible={dirtyLeaveVisible}
    />
    <ConfirmationSheet
      body="Days, exercise order, targets, warm-ups, rest, policies, and schedule defaults are copied into fresh identities. The duplicate stays inactive."
      cancelLabel="Keep editing"
      confirmLabel="Create duplicate"
      heading={`Duplicate ${snapshot.name}?`}
      onCancel={() => setDuplicateVisible(false)}
      onConfirm={() => {
        void duplicate();
      }}
      restoreFocusRef={duplicateActionRef}
      visible={duplicateVisible}
    />
    <ConfirmationSheet
      body="The plan will leave the default Library view. Its history is unchanged, and you can restore it later."
      cancelLabel="Keep editing"
      confirmLabel="Archive plan"
      destructive
      heading={`Archive ${snapshot.name}?`}
      onCancel={() => setArchiveVisible(false)}
      onConfirm={() => {
        void archive();
      }}
      restoreFocusRef={archiveActionRef}
      visible={archiveVisible}
    />
    </>
  );
}

function TargetEditor({
  draft,
  error,
  onChange,
  onSave,
}: Readonly<{
  draft: TargetDraft;
  error: boolean;
  onChange(value: TargetDraft): void;
  onSave(): void;
}>) {
  const profile = draft.exercise.metricIdentity.profile;
  const textField = (
    key: keyof TargetDraft,
    label: string,
    keyboardType: "default" = "default",
  ) => (
    <PlanEditorTextField
      keyboardType={keyboardType}
      label={label}
      onChangeText={(value) => onChange({ ...draft, [key]: value })}
      tone="card"
      value={String(draft[key])}
    />
  );
  const integerField = (key: keyof TargetDraft, label: string) => (
    <SemanticNumberField
      kind="integer"
      label={label}
      minimum={0}
      onChangeText={(value) => onChange({ ...draft, [key]: value })}
      tone="card"
      value={String(draft[key])}
    />
  );
  const decimalField = (key: keyof TargetDraft, label: string) => (
    <SemanticNumberField
      kind="decimal"
      label={label}
      minimum={0}
      onChangeText={(value) => onChange({ ...draft, [key]: value })}
      tone="card"
      value={String(draft[key])}
    />
  );
  const durationField = (key: keyof TargetDraft, label: string) => (
    <TimeDurationField
      label={label}
      onChangeText={(value) => onChange({ ...draft, [key]: value })}
      tone="card"
      value={String(draft[key])}
    />
  );

  return (
    <View style={styles.targetEditor}>
      <SectionHeader
        supportingText={PROFILE_LABELS[profile]}
        title={draft.exercise.name}
        tone="card"
      />
      {integerField("workingSets", "Working sets")}
      {profile === "load_reps" || profile === "added_load_reps" ? (
        <>
          {decimalField("loadKg", profile === "load_reps"
            ? "Load (kg)"
            : "Added load (kg)")}
          {decimalField("incrementKg", "Increment (kg)")}
          {integerField("minimumReps", "Minimum reps")}
          {integerField("maximumReps", "Maximum reps")}
        </>
      ) : null}
      {profile === "bodyweight_reps" ? (
        <>
          {integerField("minimumReps", "Minimum reps")}
          {integerField("maximumReps", "Maximum reps")}
          {textField("variationId", "Variation")}
        </>
      ) : null}
      {profile === "assisted_reps" ? (
        <>
          {decimalField("assistanceKg", "Assistance (kg)")}
          {decimalField("incrementKg", "Assistance decrement (kg)")}
          {integerField("minimumReps", "Minimum reps")}
          {integerField("maximumReps", "Maximum reps")}
          {textField(
            "assistanceEquipmentId",
            "Assistance equipment",
            "default",
          )}
        </>
      ) : null}
      {profile === "timed_hold" || profile === "fixed_time"
        ? durationField("durationSeconds", "Duration (seconds)")
        : null}
      {profile === "fixed_distance"
        ? integerField("distanceMeters", "Distance (meters)")
        : null}
      {profile === "intervals" ? (
        <>
          {textField("protocolId", "Protocol name")}
          {integerField("plannedRounds", "Planned rounds")}
          {durationField("workIntervalSeconds", "Work interval (seconds)")}
          {durationField("intervalRestSeconds", "Interval rest (seconds)")}
        </>
      ) : null}
      {durationField("restSeconds", "Rest (seconds)")}
      {error ? (
        <InlineNotice
          body="Enter complete valid target values. Your edits are still here."
          card
          heading="Target could not be saved"
          tone="error"
        />
      ) : null}
      <PrimaryAction label="Save target" onPress={onSave} />
    </View>
  );
}

const styles = StyleSheet.create({
  scheduleActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space[2],
  },
  lifecycleActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space[2],
  },
  errorSummary: {
    borderRadius: radius.standard,
    borderWidth: StyleSheet.hairlineWidth,
    gap: space[2],
    padding: space[4],
  },
  daySelect: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space[1],
    minHeight: 48,
    minWidth: 0,
  },
  dayEditor: {
    gap: space[4],
  },
  exercisePicker: {
    gap: space[2],
  },
  exerciseOption: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: space[1],
    minHeight: 48,
    paddingVertical: space[2],
  },
  reorderLabelGroup: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space[2],
    minWidth: 0,
  },
  targetEditor: {
    gap: space[4],
  },
});
