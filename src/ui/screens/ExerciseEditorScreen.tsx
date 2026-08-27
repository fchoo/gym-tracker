import React, {
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
  CustomExerciseDuplicateDecision,
  CustomExerciseMovementClass,
  CustomExerciseProgression,
  CustomExerciseType,
} from "../../domains/library/customExerciseCommands";
import {
  CUSTOM_EXERCISE_TYPES,
} from "../../domains/library/customExerciseCommands";
import type {
  MetricIdentity,
  MetricProfile,
} from "../../domains/metrics";
import {
  METRIC_PROFILES,
} from "../../domains/metrics";
import {
  AdaptiveScreen,
} from "../layout/AdaptiveScreen";
import {
  ConfirmationSheet,
  FocusablePressable,
  InlineNotice,
  PrimaryAction,
  ScreenHeader,
  SectionHeader,
} from "../components";
import {
  MetricProfileOption,
} from "../components/MetricProfileOption";
import {
  PlanEditorTextField,
  TimeDurationField,
} from "../components/PlanEditorFields";
import {
  radius,
  sizes,
  space,
  typeScale,
  useAppTheme,
} from "../theme";

export type ExerciseEditorDraft = Readonly<{
  name: string;
  aliases: readonly string[];
  exerciseType: CustomExerciseType;
  movementClass: CustomExerciseMovementClass;
  primaryMuscles: readonly string[];
  secondaryMuscles: readonly string[];
  equipment: readonly string[];
  metricIdentity: MetricIdentity;
  defaultRestSeconds: number;
  progression: CustomExerciseProgression;
}>;

export type ExerciseEditorOrigin =
  | Readonly<{
      kind: "ordinary_create";
    }>
  | Readonly<{
      kind: "custom_copy";
      sourceExerciseId: string;
      sourceName: string;
      draft: ExerciseEditorDraft;
    }>;

export type ExerciseEditorSaveInput = ExerciseEditorDraft & Readonly<{
  requestId: string;
  exerciseId: string;
  origin: ExerciseEditorOrigin;
  expectedExerciseRevision?: number;
  duplicateDecision?: CustomExerciseDuplicateDecision;
}>;

type DuplicateCandidate = Readonly<{
  exerciseId: string;
  canonicalName: string;
  metricIdentity: MetricIdentity;
  equipment: readonly string[];
}>;

type ExerciseEditorScreenProps = Readonly<{
  mode: "create" | "edit";
  origin: ExerciseEditorOrigin;
  initialDraft?: ExerciseEditorDraft;
  exerciseId?: string;
  expectedExerciseRevision?: number;
  createId(kind: string): string;
  saveExercise(input: ExerciseEditorSaveInput): Promise<Readonly<{
    exercise: Readonly<{
      exerciseId: string;
    }>;
  }>>;
  onBack(): void;
  onSaved(exerciseId: string): void;
  width?: number;
}>;

type DraftState = Readonly<{
  name: string;
  aliases: string;
  exerciseType: CustomExerciseType;
  movementClass: CustomExerciseMovementClass;
  primaryMuscles: string;
  secondaryMuscles: string;
  equipment: string;
  metricProfile: MetricProfile | null;
  defaultRestSeconds: string;
}>;

const PROFILE_PRESENTATION: Readonly<Record<
  MetricProfile,
  Readonly<{
    label: string;
    example: string;
    comparison: string;
  }>
>> = {
  load_reps: {
    label: "Load + reps",
    example: "60 kg × 8",
    comparison: "Higher load meeting the target wins; ties use more reps.",
  },
  bodyweight_reps: {
    label: "Bodyweight reps",
    example: "12 reps",
    comparison: "More completed reps wins.",
  },
  added_load_reps: {
    label: "Added load + reps",
    example: "+10 kg × 6",
    comparison: "Higher added load meeting the target wins; ties use more reps.",
  },
  assisted_reps: {
    label: "Assisted reps",
    example: "20 kg assist × 8",
    comparison: "Lower assistance meeting the target wins; ties use more reps.",
  },
  timed_hold: {
    label: "Timed hold",
    example: "45 sec",
    comparison: "Longer completed duration wins.",
  },
  fixed_distance: {
    label: "Fixed distance",
    example: "2 km in 12 min",
    comparison: "Faster completed time for the same planned distance wins.",
  },
  fixed_time: {
    label: "Fixed time",
    example: "2.4 km in 12 min",
    comparison: "Greater distance for the same planned duration wins.",
  },
  intervals: {
    label: "Rounds / intervals",
    example: "6 rounds · 30 sec work",
    comparison: "Uses the plan-authored comparator for the same protocol.",
  },
  unscored: {
    label: "Mobility / unscored",
    example: "Completed",
    comparison: "Completion only; no performance ranking.",
  },
};

const EXERCISE_TYPE_LABELS: Readonly<Record<CustomExerciseType, string>> = {
  strength: "Strength",
  olympic_weightlifting: "Olympic weightlifting",
  stretching: "Stretching",
  cardio: "Cardio",
  plyometrics: "Plyometrics",
  strongman: "Strongman",
  powerlifting: "Powerlifting",
};

function commaValues(value: string): readonly string[] {
  return Object.freeze(value
    .split(",")
    .map((item) => item.trim().toLocaleLowerCase("en"))
    .filter((item) => item.length > 0));
}

function aliasValues(value: string): readonly string[] {
  return Object.freeze(value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0));
}

function initialDraftFromOrigin(origin: ExerciseEditorOrigin): DraftState {
  if (origin.kind === "custom_copy") {
    return {
      name: origin.draft.name,
      aliases: origin.draft.aliases.join(", "),
      exerciseType: origin.draft.exerciseType,
      movementClass: origin.draft.movementClass,
      primaryMuscles: origin.draft.primaryMuscles.join(", "),
      secondaryMuscles: origin.draft.secondaryMuscles.join(", "),
      equipment: origin.draft.equipment.join(", "),
      metricProfile: origin.draft.metricIdentity.profile,
      defaultRestSeconds: String(origin.draft.defaultRestSeconds),
    };
  }
  return {
    name: "",
    aliases: "",
    exerciseType: "strength",
    movementClass: "compound",
    primaryMuscles: "",
    secondaryMuscles: "",
    equipment: "",
    metricProfile: null,
    defaultRestSeconds: "90",
  };
}

function isDuplicateConflict(
  error: unknown,
): error is Readonly<{
  code: "custom_exercise_duplicate_confirmation_required";
  candidates: readonly DuplicateCandidate[];
}> {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const value = error as {
    code?: unknown;
    candidates?: unknown;
  };
  return value.code === "custom_exercise_duplicate_confirmation_required"
    && Array.isArray(value.candidates);
}

function Option({
  label,
  selected,
  onPress,
}: Readonly<{
  label: string;
  selected: boolean;
  onPress(): void;
}>) {
  const { colors } = useAppTheme();
  return (
    <FocusablePressable
      accessibilityLabel={label}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      focusable
      onPress={onPress}
      style={({ pressed }) => [
        styles.compactOption,
        {
          backgroundColor: pressed ? colors.surfaceSubtle : colors.surface,
          borderColor: selected ? colors.action : colors.divider,
        },
      ]}
    >
      <Text style={[
        typeScale.bodyStrong as TextStyle,
        { color: colors.textPrimary },
      ]}>
        {label}
      </Text>
    </FocusablePressable>
  );
}

function duplicateBody(candidates: readonly DuplicateCandidate[]): string {
  return candidates.map((candidate) => {
    const presentation = PROFILE_PRESENTATION[candidate.metricIdentity.profile];
    const equipment = candidate.equipment.length === 0
      ? "No equipment"
      : candidate.equipment.join(", ");
    return `${candidate.canonicalName}\n${presentation.label} · ${equipment}`;
  }).join("\n\n");
}

export function ExerciseEditorScreen({
  mode,
  origin,
  initialDraft,
  exerciseId: existingExerciseId,
  expectedExerciseRevision,
  createId,
  saveExercise,
  onBack,
  onSaved,
  width,
}: ExerciseEditorScreenProps) {
  const { colors } = useAppTheme();
  const saveActionRef = useRef<View>(null);
  const commandIdentityRef = useRef<Readonly<{
    exerciseId: string;
    requestId: string;
  }> | null>(null);
  const [draft, setDraft] = useState(() =>
    initialDraft === undefined
      ? initialDraftFromOrigin(origin)
      : {
          name: initialDraft.name,
          aliases: initialDraft.aliases.join(", "),
          exerciseType: initialDraft.exerciseType,
          movementClass: initialDraft.movementClass,
          primaryMuscles: initialDraft.primaryMuscles.join(", "),
          secondaryMuscles: initialDraft.secondaryMuscles.join(", "),
          equipment: initialDraft.equipment.join(", "),
          metricProfile: initialDraft.metricIdentity.profile,
          defaultRestSeconds: String(initialDraft.defaultRestSeconds),
        });
  const [saveBusy, setSaveBusy] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState(false);
  const [duplicateCandidates, setDuplicateCandidates] = useState<
    readonly DuplicateCandidate[]
  >([]);
  const identity = useMemo<MetricIdentity | null>(() =>
    draft.metricProfile === null
      ? null
      : {
          profile: draft.metricProfile,
          contractVersion: 1,
          exerciseMetricGeneration: 1,
        }, [draft.metricProfile]);

  function update(change: Partial<DraftState>) {
    setDraft((current) => ({ ...current, ...change }));
    setValidationError(null);
    setSaveError(false);
  }

  async function commit(
    duplicateDecision?: CustomExerciseDuplicateDecision,
  ): Promise<void> {
    const name = draft.name.trim();
    const restSeconds = Number(draft.defaultRestSeconds);
    if (name.length === 0) {
      setValidationError("Enter an exercise name.");
      return;
    }
    if (identity === null) {
      setValidationError("Choose one metric profile before saving.");
      return;
    }
    if (
      !Number.isSafeInteger(restSeconds)
      || restSeconds < 0
      || restSeconds > 86_400
    ) {
      setValidationError("Default rest must be a whole number of seconds.");
      return;
    }
    setSaveBusy(true);
    setSaveError(false);
    try {
      commandIdentityRef.current ??= Object.freeze({
        exerciseId: existingExerciseId ?? createId("exercise"),
        requestId: createId("custom-exercise-request"),
      });
      const {
        exerciseId,
        requestId,
      } = commandIdentityRef.current;
      const result = await saveExercise({
        requestId,
        exerciseId,
        origin,
        ...(expectedExerciseRevision === undefined
          ? {}
          : { expectedExerciseRevision }),
        name,
        aliases: aliasValues(draft.aliases),
        exerciseType: draft.exerciseType,
        movementClass: draft.movementClass,
        primaryMuscles: commaValues(draft.primaryMuscles).length === 0
          ? ["unspecified"]
          : commaValues(draft.primaryMuscles),
        secondaryMuscles: commaValues(draft.secondaryMuscles),
        equipment: commaValues(draft.equipment).length === 0
          ? ["unspecified"]
          : commaValues(draft.equipment),
        metricIdentity: identity,
        defaultRestSeconds: restSeconds,
        progression: {
          kind: "manual_hold",
          version: 1,
        },
        ...(duplicateDecision === undefined ? {} : { duplicateDecision }),
      });
      setDuplicateCandidates([]);
      onSaved(result.exercise.exerciseId);
    } catch (error) {
      if (isDuplicateConflict(error)) {
        setDuplicateCandidates(Object.freeze([...error.candidates]));
      } else {
        setSaveError(true);
      }
    } finally {
      setSaveBusy(false);
    }
  }

  return (
    <>
      <AdaptiveScreen
        dock={(
          <PrimaryAction
            busy={saveBusy}
            label="Save exercise"
            onPress={() => {
              void commit();
            }}
            ref={saveActionRef}
            testID="exercise-editor-save"
          />
        )}
        onRequestBack={onBack}
        primary={(
          <View style={styles.screen}>
            <ScreenHeader
              backAction={onBack}
              {...(origin.kind === "custom_copy"
                ? { eyebrow: "Custom copy" }
                : mode === "edit"
                  ? { eyebrow: "Custom" }
                  : {})}
              title={mode === "edit"
                ? "Edit exercise"
                : "Create custom exercise"}
            />
            {origin.kind === "custom_copy" ? (
              <InlineNotice
                body="This will save as a fresh user-owned exercise. The built-in source and its history will not change."
                heading={`Copied from ${origin.sourceName}`}
              />
            ) : null}
            <SectionHeader
              supportingText="Nothing is saved until Save exercise commits."
              title="Exercise"
            />
            <PlanEditorTextField
              label="Exercise name"
              onChangeText={(name) => update({ name })}
              testID="exercise-editor-name"
              value={draft.name}
            />
            <PlanEditorTextField
              help="Optional. Separate multiple aliases with commas."
              label="Aliases"
              onChangeText={(aliases) => update({ aliases })}
              value={draft.aliases}
            />
            <SectionHeader title="Exercise type" />
            <View
              accessibilityLabel="Exercise type"
              accessibilityRole="radiogroup"
              style={styles.optionGrid}
            >
              {CUSTOM_EXERCISE_TYPES.map((exerciseType) => (
                <Option
                  key={exerciseType}
                  label={EXERCISE_TYPE_LABELS[exerciseType]}
                  onPress={() => update({ exerciseType })}
                  selected={draft.exerciseType === exerciseType}
                />
              ))}
            </View>
            <SectionHeader title="Movement" />
            <View
              accessibilityLabel="Movement classification"
              accessibilityRole="radiogroup"
              style={styles.optionGrid}
            >
              {(["compound", "isolation"] as const).map((movementClass) => (
                <Option
                  key={movementClass}
                  label={movementClass === "compound" ? "Compound" : "Isolation"}
                  onPress={() => update({ movementClass })}
                  selected={draft.movementClass === movementClass}
                />
              ))}
            </View>
            <PlanEditorTextField
              help="Optional. Separate multiple values with commas."
              label="Primary muscles"
              onChangeText={(primaryMuscles) => update({ primaryMuscles })}
              testID="exercise-editor-primary-muscles"
              value={draft.primaryMuscles}
            />
            <PlanEditorTextField
              help="Optional. Separate multiple values with commas."
              label="Secondary muscles"
              onChangeText={(secondaryMuscles) => update({ secondaryMuscles })}
              value={draft.secondaryMuscles}
            />
            <PlanEditorTextField
              help="Optional. Separate multiple values with commas."
              label="Equipment"
              onChangeText={(equipment) => update({ equipment })}
              testID="exercise-editor-equipment"
              value={draft.equipment}
            />
            <TimeDurationField
              label="Default rest seconds"
              onChangeText={(defaultRestSeconds) =>
                update({ defaultRestSeconds })}
              value={draft.defaultRestSeconds}
            />
            <SectionHeader
              supportingText={mode === "edit"
                ? "Metric profile changes use the separate future-target migration review."
                : "Choose explicitly. No profile is preselected or inferred."}
              title="Metric profile"
            />
            {mode === "edit" && draft.metricProfile !== null ? (
              <MetricProfileOption
                comparison={PROFILE_PRESENTATION[draft.metricProfile].comparison}
                example={PROFILE_PRESENTATION[draft.metricProfile].example}
                label={PROFILE_PRESENTATION[draft.metricProfile].label}
                onSelect={() => undefined}
                profile={draft.metricProfile}
                selected
              />
            ) : (
              <View
                accessibilityLabel="Metric profile"
                accessibilityRole="radiogroup"
                style={styles.metricOptions}
              >
                {METRIC_PROFILES.map((profile) => (
                  <MetricProfileOption
                    comparison={PROFILE_PRESENTATION[profile].comparison}
                    example={PROFILE_PRESENTATION[profile].example}
                    key={profile}
                    label={PROFILE_PRESENTATION[profile].label}
                    onSelect={(metricProfile) => update({ metricProfile })}
                    profile={profile}
                    selected={draft.metricProfile === profile}
                  />
                ))}
              </View>
            )}
            <SectionHeader title="Progression policy" />
            <InlineNotice
              body="No automatic progression policy is configured. Future target changes require your decision."
              heading="Hold / manual decision"
            />
            {validationError === null ? null : (
              <InlineNotice
                body={validationError}
                heading="Exercise needs attention"
                tone="error"
              />
            )}
            {saveError ? (
              <InlineNotice
                body="Exercise could not be saved. Your edits are still here. Try again."
                heading="Save failed"
                tone="error"
              />
            ) : null}
          </View>
        )}
        testID="exercise-editor-screen"
        {...(width === undefined ? {} : { width })}
      />
      <ConfirmationSheet
        body={duplicateBody(duplicateCandidates)}
        cancelLabel="Review existing exercise"
        confirmLabel="Create anyway"
        heading="Similar exercises already exist"
        onCancel={() => setDuplicateCandidates([])}
        onConfirm={() => {
          const candidateExerciseIds = duplicateCandidates.map(
            ({ exerciseId }) => exerciseId,
          );
          setDuplicateCandidates([]);
          void commit({
            type: "create_anyway",
            candidateExerciseIds,
          });
        }}
        restoreFocusRef={saveActionRef}
        visible={duplicateCandidates.length > 0}
      />
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    gap: space[4],
    maxWidth: 960,
    width: "100%",
  },
  optionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space[2],
  },
  compactOption: {
    alignItems: "center",
    borderRadius: radius.standard,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: "center",
    minHeight: sizes.minimumTarget,
    paddingHorizontal: space[4],
    paddingVertical: space[2],
  },
  metricOptions: {
    gap: space[2],
  },
});
