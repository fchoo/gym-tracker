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
import {
  METRIC_PROFILES,
} from "../../domains/metrics";
import type {
  MetricPolicyDecision,
  MetricProfileMigrationResult,
  MetricTargetReplacement,
  MigrateCustomExerciseMetricProfileInput,
} from "../../domains/metrics/migrateCustomExerciseMetricProfile";
import {
  AdaptiveScreen,
} from "../layout/AdaptiveScreen";
import {
  ConfirmationSheet,
  EmptyState,
  InlineNotice,
  PrimaryAction,
  ScreenHeader,
  SecondaryAction,
  SectionHeader,
  SkeletonBlock,
} from "../components";
import {
  MetricProfileOption,
} from "../components/MetricProfileOption";
import {
  PlanEditorTextField,
  SemanticNumberField,
  TimeDurationField,
} from "../components/PlanEditorFields";
import {
  radius,
  space,
  typeScale,
  useAppTheme,
} from "../theme";

export type MetricMigrationTarget = Readonly<{
  targetId: string;
  targetRevision: number;
  ordinal: number;
  currentTarget: string;
}>;

export type MetricMigrationOccurrence = Readonly<{
  graph: "legacy" | "owned";
  planId: string;
  planName: string;
  dayId: string;
  dayName: string;
  occurrenceId: string;
  occurrenceRevision: number;
  policyRevision: number | null;
  targets: readonly MetricMigrationTarget[];
}>;

export type MetricMigrationSnapshot = Readonly<{
  exerciseId: string;
  exerciseName: string;
  exerciseRevision: number;
  fromIdentity: MetricIdentity;
  activeWorkoutSessionId: string | null;
  occurrences: readonly MetricMigrationOccurrence[];
}>;

type MetricMigrationScreenProps = Readonly<{
  exerciseId: string;
  loadMigration(exerciseId: string): Promise<MetricMigrationSnapshot | null>;
  migrate(
    input: Omit<MigrateCustomExerciseMetricProfileInput, "migratedAtMs">,
  ): Promise<MetricProfileMigrationResult>;
  createId(kind: string): string;
  onBack(): void;
  onSaved(exerciseId: string): void;
  width?: number;
}>;

type ReplacementDraft = Readonly<{
  loadKg: string;
  minimumReps: string;
  maximumReps: string;
  incrementKg: string;
  variation: string;
  assistanceKg: string;
  assistanceEquipment: string;
  durationSeconds: string;
  distanceMeters: string;
  protocol: string;
  rounds: string;
  workSeconds: string;
  restSeconds: string;
}>;

type PolicyChoice = "manual_hold" | "metric" | null;
type LoadState = "loading" | "ready" | "empty" | "error";

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

function emptyReplacement(): ReplacementDraft {
  return {
    loadKg: "",
    minimumReps: "",
    maximumReps: "",
    incrementKg: "",
    variation: "",
    assistanceKg: "",
    assistanceEquipment: "",
    durationSeconds: "",
    distanceMeters: "",
    protocol: "",
    rounds: "",
    workSeconds: "",
    restSeconds: "",
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

function kilogramsToGrams(value: string): number | null {
  const kilograms = Number(value);
  const grams = kilograms * 1_000;
  return Number.isFinite(kilograms)
      && kilograms >= 0
      && Number.isSafeInteger(grams)
    ? grams
    : null;
}

function secondsToMs(value: string): number | null {
  const seconds = Number(value);
  const milliseconds = seconds * 1_000;
  return Number.isFinite(seconds)
      && seconds > 0
      && Number.isSafeInteger(milliseconds)
    ? milliseconds
    : null;
}

function replacementContract(
  draft: ReplacementDraft,
  identity: MetricIdentity,
): Readonly<{
  target: MetricTarget;
  unit: Readonly<Record<string, unknown>>;
}> | null {
  const minimumReps = positiveInteger(draft.minimumReps);
  const maximumReps = positiveInteger(draft.maximumReps);
  if (
    minimumReps !== null
    && maximumReps !== null
    && maximumReps < minimumReps
  ) {
    return null;
  }
  switch (identity.profile) {
    case "load_reps": {
      const loadGrams = kilogramsToGrams(draft.loadKg);
      const incrementGrams = kilogramsToGrams(draft.incrementKg);
      return loadGrams === null || incrementGrams === null
          || minimumReps === null || maximumReps === null
        ? null
        : {
            target: {
              version: 1,
              profile: "load_reps",
              loadGrams,
              minReps: minimumReps,
              maxReps: maximumReps,
              incrementGrams,
              perSide: false,
            },
            unit: {
              version: 1,
              load: "grams",
              count: "repetitions",
            },
          };
    }
    case "bodyweight_reps":
      return minimumReps === null || maximumReps === null
          || draft.variation.trim().length === 0
        ? null
        : {
            target: {
              version: 1,
              profile: "bodyweight_reps",
              minReps: minimumReps,
              maxReps: maximumReps,
              variationId: draft.variation.trim(),
              perSide: false,
            },
            unit: {
              version: 1,
              count: "repetitions",
            },
          };
    case "added_load_reps": {
      const addedLoadGrams = kilogramsToGrams(draft.loadKg);
      const incrementGrams = kilogramsToGrams(draft.incrementKg);
      return addedLoadGrams === null || incrementGrams === null
          || minimumReps === null || maximumReps === null
        ? null
        : {
            target: {
              version: 1,
              profile: "added_load_reps",
              addedLoadGrams,
              minReps: minimumReps,
              maxReps: maximumReps,
              incrementGrams,
              perSide: false,
            },
            unit: {
              version: 1,
              load: "grams",
              count: "repetitions",
            },
          };
    }
    case "assisted_reps": {
      const assistanceGrams = kilogramsToGrams(draft.assistanceKg);
      const decrementGrams = kilogramsToGrams(draft.incrementKg);
      return assistanceGrams === null || decrementGrams === null
          || minimumReps === null || maximumReps === null
          || draft.assistanceEquipment.trim().length === 0
        ? null
        : {
            target: {
              version: 1,
              profile: "assisted_reps",
              assistanceGrams,
              minReps: minimumReps,
              maxReps: maximumReps,
              decrementGrams,
              assistanceEquipmentId: draft.assistanceEquipment.trim(),
              perSide: false,
            },
            unit: {
              version: 1,
              assistance: "grams",
              count: "repetitions",
            },
          };
    }
    case "timed_hold": {
      const durationMs = secondsToMs(draft.durationSeconds);
      if (durationMs === null) {
        return null;
      }
      return identity.contractVersion === 2
        ? {
            target: {
              version: 2,
              profile: "timed_hold",
              durationMs,
              perSide: false,
            },
            unit: {
              version: 2,
              duration: "milliseconds",
            },
          }
        : {
            target: {
              version: 1,
              profile: "timed_hold",
              durationSeconds: durationMs / 1_000,
              perSide: false,
            },
            unit: {
              version: 1,
              duration: "seconds",
            },
          };
    }
    case "fixed_distance": {
      const distanceMeters = positiveInteger(draft.distanceMeters);
      return distanceMeters === null
        ? null
        : {
            target: {
              version: 1,
              profile: "fixed_distance",
              plannedDistanceMeters: distanceMeters,
            },
            unit: {
              version: 1,
              distance: "meters",
            },
          };
    }
    case "fixed_time": {
      const durationMs = secondsToMs(draft.durationSeconds);
      return durationMs === null
        ? null
        : {
            target: {
              version: 1,
              profile: "fixed_time",
              plannedDurationMs: durationMs,
            },
            unit: {
              version: 1,
              duration: "milliseconds",
            },
          };
    }
    case "intervals": {
      const plannedRounds = positiveInteger(draft.rounds);
      const workIntervalMs = secondsToMs(draft.workSeconds);
      const restSeconds = nonnegativeInteger(draft.restSeconds);
      return plannedRounds === null || workIntervalMs === null
          || restSeconds === null || draft.protocol.trim().length === 0
        ? null
        : {
            target: {
              version: 1,
              profile: "intervals",
              protocolId: draft.protocol.trim(),
              comparatorId: "rounds_then_work",
              comparatorVersion: 1,
              plannedRounds,
              workIntervalMs,
              restIntervalMs: restSeconds * 1_000,
            },
            unit: {
              version: 1,
              protocol: "rounds_then_work",
            },
          };
    }
    case "unscored":
      return {
        target: {
          version: 1,
          profile: "unscored",
          completionRequired: true,
        },
        unit: {
          version: 1,
          completion: "boolean",
        },
      };
  }
}

function targetFields(
  identity: MetricIdentity,
): readonly Readonly<{
  key: keyof ReplacementDraft;
  suffix: string;
  kind: "text" | "integer" | "decimal" | "duration";
}>[] {
  switch (identity.profile) {
    case "load_reps":
      return [
        { key: "loadKg", suffix: "load kg", kind: "decimal" },
        { key: "minimumReps", suffix: "minimum reps", kind: "integer" },
        { key: "maximumReps", suffix: "maximum reps", kind: "integer" },
        { key: "incrementKg", suffix: "increment kg", kind: "decimal" },
      ];
    case "bodyweight_reps":
      return [
        { key: "minimumReps", suffix: "minimum reps", kind: "integer" },
        { key: "maximumReps", suffix: "maximum reps", kind: "integer" },
        { key: "variation", suffix: "variation", kind: "text" },
      ];
    case "added_load_reps":
      return [
        { key: "loadKg", suffix: "added load kg", kind: "decimal" },
        { key: "minimumReps", suffix: "minimum reps", kind: "integer" },
        { key: "maximumReps", suffix: "maximum reps", kind: "integer" },
        { key: "incrementKg", suffix: "increment kg", kind: "decimal" },
      ];
    case "assisted_reps":
      return [
        { key: "assistanceKg", suffix: "assistance kg", kind: "decimal" },
        { key: "minimumReps", suffix: "minimum reps", kind: "integer" },
        { key: "maximumReps", suffix: "maximum reps", kind: "integer" },
        { key: "incrementKg", suffix: "assistance decrement kg", kind: "decimal" },
        { key: "assistanceEquipment", suffix: "assistance equipment", kind: "text" },
      ];
    case "timed_hold":
      return [{
        key: "durationSeconds",
        suffix: "duration seconds",
        kind: "duration",
      }];
    case "fixed_distance":
      return [{
        key: "distanceMeters",
        suffix: "planned distance meters",
        kind: "integer",
      }];
    case "fixed_time":
      return [{
        key: "durationSeconds",
        suffix: "planned duration seconds",
        kind: "duration",
      }];
    case "intervals":
      return [
        { key: "protocol", suffix: "protocol", kind: "text" },
        { key: "rounds", suffix: "planned rounds", kind: "integer" },
        { key: "workSeconds", suffix: "work seconds", kind: "duration" },
        { key: "restSeconds", suffix: "rest seconds", kind: "duration" },
      ];
    case "unscored":
      return [];
  }
}

function migrationIdentity(
  fromIdentity: MetricIdentity,
  profile: MetricProfile,
): MetricIdentity {
  return {
    profile,
    contractVersion: profile === "timed_hold"
      ? fromIdentity.profile === "timed_hold"
          && fromIdentity.contractVersion === 1
        ? 2
        : 1
      : 1,
    exerciseMetricGeneration: fromIdentity.exerciseMetricGeneration + 1,
  };
}

function profileLabel(
  profile: MetricProfile,
  identity: MetricIdentity,
): string {
  if (profile !== "timed_hold") {
    return PROFILE_PRESENTATION[profile].label;
  }
  return identity.contractVersion === 2
    ? "Timed hold (milliseconds)"
    : "Timed hold (seconds)";
}

export function MetricMigrationScreen({
  exerciseId,
  loadMigration,
  migrate,
  createId,
  onBack,
  onSaved,
  width,
}: MetricMigrationScreenProps) {
  const { colors } = useAppTheme();
  const saveActionRef = useRef<View>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [snapshot, setSnapshot] = useState<MetricMigrationSnapshot | null>(
    null,
  );
  const [retryGeneration, setRetryGeneration] = useState(0);
  const [selectedProfile, setSelectedProfile] =
    useState<MetricProfile | null>(null);
  const [replacements, setReplacements] = useState<
    Readonly<Record<string, ReplacementDraft>>
  >({});
  const [policies, setPolicies] = useState<
    Readonly<Record<string, PolicyChoice>>
  >({});
  const [confirmationVisible, setConfirmationVisible] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveError, setSaveError] = useState(false);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const value = await loadMigration(exerciseId);
      setSnapshot(value);
      setState(value === null ? "empty" : "ready");
    } catch {
      setSnapshot(null);
      setState("error");
    }
  }, [exerciseId, loadMigration]);

  useEffect(() => {
    void load();
  }, [load, retryGeneration]);

  const selectedIdentity = useMemo(() => {
    if (snapshot === null || selectedProfile === null) {
      return null;
    }
    return migrationIdentity(snapshot.fromIdentity, selectedProfile);
  }, [selectedProfile, snapshot]);

  const targets = snapshot?.occurrences.flatMap((occurrence) =>
    occurrence.targets.map((target) => ({ occurrence, target }))
  ) ?? [];

  function selectProfile(profile: MetricProfile) {
    setSelectedProfile(profile);
    setReplacements(Object.fromEntries(
      targets.map(({ target }) => [target.targetId, emptyReplacement()]),
    ));
    setPolicies({});
    setSaveError(false);
  }

  function updateReplacement(
    targetId: string,
    key: keyof ReplacementDraft,
    value: string,
  ) {
    setReplacements((current) => ({
      ...current,
      [targetId]: {
        ...(current[targetId] ?? emptyReplacement()),
        [key]: value,
      },
    }));
    setSaveError(false);
  }

  const commandParts = useMemo((): Readonly<{
    replacements: readonly MetricTargetReplacement[];
    policies: readonly MetricPolicyDecision[];
    complete: boolean;
  }> => {
    if (snapshot === null || selectedIdentity === null || targets.length === 0) {
      return {
        replacements: [],
        policies: [],
        complete: false,
      };
    }
    const nextReplacements: MetricTargetReplacement[] = [];
    for (const { target } of targets) {
      const contract = replacementContract(
        replacements[target.targetId] ?? emptyReplacement(),
        selectedIdentity,
      );
      if (contract === null) {
        return {
          replacements: [],
          policies: [],
          complete: false,
        };
      }
      nextReplacements.push({
        targetId: target.targetId,
        expectedTargetRevision: target.targetRevision,
        target: contract.target,
        unit: contract.unit,
      });
    }
    const nextPolicies: MetricPolicyDecision[] = [];
    for (const occurrence of snapshot.occurrences) {
      const choice = policies[occurrence.occurrenceId];
      if (choice === null || choice === undefined) {
        return {
          replacements: nextReplacements,
          policies: [],
          complete: false,
        };
      }
      nextPolicies.push(choice === "manual_hold"
        ? {
            planDayExerciseId: occurrence.occurrenceId,
            expectedPolicyRevision: occurrence.policyRevision,
            policy: {
              kind: "manual_hold",
              version: 1,
            },
          }
        : {
            planDayExerciseId: occurrence.occurrenceId,
            expectedPolicyRevision: occurrence.policyRevision,
            policy: {
              kind: "metric",
              profile: selectedIdentity.profile,
              version: 1,
              rule: {
                version: 1,
                progression: "manual_review",
              },
            },
          });
    }
    return {
      replacements: nextReplacements,
      policies: nextPolicies,
      complete: true,
    };
  }, [policies, replacements, selectedIdentity, snapshot, targets]);

  async function commit(): Promise<void> {
    if (
      snapshot === null
      || selectedIdentity === null
      || !commandParts.complete
    ) {
      return;
    }
    setSaveBusy(true);
    setSaveError(false);
    try {
      await migrate({
        exerciseId: snapshot.exerciseId,
        expectedExerciseRevision: snapshot.exerciseRevision,
        fromIdentity: snapshot.fromIdentity,
        toIdentity: selectedIdentity,
        replacements: commandParts.replacements,
        policyDecisions: commandParts.policies,
        acknowledgedHistoryImmutable: true,
        idempotencyKey: createId("metric-profile-migration"),
      });
      onSaved(snapshot.exerciseId);
    } catch {
      setSaveError(true);
    } finally {
      setSaveBusy(false);
    }
  }

  if (state === "loading") {
    return (
      <AdaptiveScreen
        onRequestBack={onBack}
        primary={(
          <View style={styles.screen}>
            <ScreenHeader backAction={onBack} title="Change metric profile" />
            {[1, 2, 3, 4].map((index) => (
              <SkeletonBlock
                height={index === 1 ? 72 : 104}
                key={index}
                testID={`metric-migration-skeleton-${index}`}
              />
            ))}
          </View>
        )}
        testID="metric-migration-screen"
        {...(width === undefined ? {} : { width })}
      />
    );
  }

  if (state === "empty") {
    return (
      <AdaptiveScreen
        onRequestBack={onBack}
        primary={(
          <View style={styles.screen}>
            <ScreenHeader backAction={onBack} title="Change metric profile" />
            <EmptyState
              body="This custom exercise is no longer available."
              heading="Exercise not found"
              primaryAction={<PrimaryAction label="Go back" onPress={onBack} />}
            />
          </View>
        )}
        testID="metric-migration-screen"
        {...(width === undefined ? {} : { width })}
      />
    );
  }

  if (state === "error" || snapshot === null) {
    return (
      <AdaptiveScreen
        onRequestBack={onBack}
        primary={(
          <View style={styles.screen}>
            <ScreenHeader backAction={onBack} title="Change metric profile" />
            <EmptyState
              body="Your exercise, targets, policies, and history were not changed."
              heading="Profile migration could not be loaded"
              primaryAction={(
                <PrimaryAction
                  label="Retry"
                  onPress={() => setRetryGeneration((value) => value + 1)}
                />
              )}
            />
          </View>
        )}
        testID="metric-migration-screen"
        {...(width === undefined ? {} : { width })}
      />
    );
  }

  if (snapshot.activeWorkoutSessionId !== null) {
    return (
      <AdaptiveScreen
        onRequestBack={onBack}
        primary={(
          <View style={styles.screen}>
            <ScreenHeader backAction={onBack} title="Change metric profile" />
            <InlineNotice
              body="Metric profile changes are blocked while this exercise is in an active workout. Resume, finish partial, or discard that workout before changing future targets."
              heading="Finish the current workout first"
              tone="attention"
            />
            <SecondaryAction label="Go back" onPress={onBack} />
          </View>
        )}
        testID="metric-migration-screen"
        {...(width === undefined ? {} : { width })}
      />
    );
  }

  return (
    <>
      <AdaptiveScreen
        onRequestBack={onBack}
        primary={(
          <View style={styles.screen}>
            <ScreenHeader
              backAction={onBack}
              eyebrow={snapshot.exerciseName}
              title="Change metric profile"
            />
            <InlineNotice
              body="Future plan targets will use the new metric profile. Completed workouts, in-progress snapshots, and historical observations will not change: history never changes. History remains separated by metric-profile version. Pending suggestions that no longer apply will be removed, and the next comparable exposure starts a fresh baseline."
              heading="Future targets only"
              tone="attention"
            />
            <SectionHeader
              supportingText={`Current: ${profileLabel(
                snapshot.fromIdentity.profile,
                snapshot.fromIdentity,
              )} · contract ${snapshot.fromIdentity.contractVersion} · generation ${snapshot.fromIdentity.exerciseMetricGeneration}`}
              title="New metric profile"
            />
            <View
              accessibilityLabel="New metric profile"
              accessibilityRole="radiogroup"
              style={styles.options}
            >
              {METRIC_PROFILES.map((profile) => {
                const identity = migrationIdentity(
                  snapshot.fromIdentity,
                  profile,
                );
                return (
                  <MetricProfileOption
                    comparison={PROFILE_PRESENTATION[profile].comparison}
                    example={PROFILE_PRESENTATION[profile].example}
                    key={profile}
                    label={profileLabel(profile, identity)}
                    onSelect={selectProfile}
                    profile={profile}
                    selected={selectedProfile === profile}
                  />
                );
              })}
            </View>
            <SectionHeader
              supportingText={`${targets.length} future target ${
                targets.length === 1 ? "replacement" : "replacements"
              } required`}
              title="Affected future plan targets"
            />
            {targets.length === 0 ? (
              <InlineNotice
                body="Choose a new metric profile after this exercise is added to a future plan target. No profile change can be saved without explicit target replacements."
                heading="No affected future plan targets"
              />
            ) : targets.map(({ occurrence, target }, index) => {
              const targetNumber = index + 1;
              const draft = replacements[target.targetId] ?? emptyReplacement();
              return (
                <View
                  key={target.targetId}
                  style={[styles.target, { borderColor: colors.divider }]}
                >
                  <Text style={[
                    typeScale.bodyStrong as TextStyle,
                    { color: colors.textPrimary },
                  ]}>
                    {`${occurrence.planName} · ${occurrence.dayName} · Target ${targetNumber}`}
                  </Text>
                  <Text style={[
                    typeScale.body as TextStyle,
                    { color: colors.textSecondary },
                  ]}>
                    {`Current target: ${target.currentTarget}`}
                  </Text>
                  {selectedIdentity === null ? (
                    <Text style={[
                      typeScale.body as TextStyle,
                      { color: colors.textSecondary },
                    ]}>
                      Choose a new metric profile to enter this replacement.
                    </Text>
                  ) : targetFields(selectedIdentity).map((field) => {
                    const label = `Target ${targetNumber} ${field.suffix}`;
                    const onChangeText = (value: string) =>
                      updateReplacement(target.targetId, field.key, value);
                    if (field.kind === "duration") {
                      return (
                        <TimeDurationField
                          key={field.key}
                          label={label}
                          onChangeText={onChangeText}
                          value={draft[field.key]}
                        />
                      );
                    }
                    if (field.kind === "integer" || field.kind === "decimal") {
                      return (
                        <SemanticNumberField
                          key={field.key}
                          kind={field.kind}
                          label={label}
                          minimum={0}
                          onChangeText={onChangeText}
                          value={draft[field.key]}
                        />
                      );
                    }
                    return (
                      <PlanEditorTextField
                        key={field.key}
                        label={label}
                        onChangeText={onChangeText}
                        value={draft[field.key]}
                      />
                    );
                  })}
                  {selectedIdentity?.profile === "unscored" ? (
                    <InlineNotice
                      body="Completion only; no performance value is inferred."
                      heading="Completed"
                    />
                  ) : null}
                </View>
              );
            })}
            <SectionHeader
              supportingText="Each occurrence requires a compatible reviewed policy or explicit manual Hold."
              title="Progression policy"
            />
            {snapshot.occurrences.map((occurrence) => (
              <View
                key={occurrence.occurrenceId}
                style={[styles.policy, { borderColor: colors.divider }]}
              >
                <Text style={[
                  typeScale.bodyStrong as TextStyle,
                  { color: colors.textPrimary },
                ]}>
                  {`${occurrence.planName} · ${occurrence.dayName}`}
                </Text>
                <MetricProfileOption
                  comparison="No automatic target change is made."
                  example="Owner reviews the next target."
                  label={`${occurrence.planName} ${occurrence.dayName} Hold / manual decision`}
                  onSelect={() => setPolicies((current) => ({
                    ...current,
                    [occurrence.occurrenceId]: "manual_hold",
                  }))}
                  profile={selectedProfile ?? snapshot.fromIdentity.profile}
                  selected={
                    policies[occurrence.occurrenceId] === "manual_hold"
                  }
                />
                <MetricProfileOption
                  comparison="The compatible policy starts from a fresh baseline."
                  example="Review-driven metric progression."
                  label={`${occurrence.planName} ${occurrence.dayName} Compatible metric policy`}
                  onSelect={() => setPolicies((current) => ({
                    ...current,
                    [occurrence.occurrenceId]: "metric",
                  }))}
                  profile={selectedProfile ?? snapshot.fromIdentity.profile}
                  selected={policies[occurrence.occurrenceId] === "metric"}
                />
              </View>
            ))}
            {saveError ? (
              <InlineNotice
                body="Your replacement targets and policy choices are still here. Try again."
                heading="Profile change could not be saved"
                tone="error"
              />
            ) : null}
            <PrimaryAction
              busy={saveBusy}
              disabled={!commandParts.complete}
              label="Save profile change"
              onPress={() => setConfirmationVisible(true)}
              ref={saveActionRef}
            />
            {!commandParts.complete ? (
              <Text style={[
                typeScale.body as TextStyle,
                { color: colors.textSecondary },
              ]}>
                Choose a new metric profile, enter every replacement, and select one policy for every occurrence.
              </Text>
            ) : null}
          </View>
        )}
        testID="metric-migration-screen"
        {...(width === undefined ? {} : { width })}
      />
      <ConfirmationSheet
        body="Future plan targets will migrate to the reviewed profile while completed workouts and historical observations stay immutable. Incompatible pending suggestions and policies will be invalidated, and a fresh baseline will begin. This replacement is one-way: discarded future target contracts cannot be reconstructed. Another explicit migration would be required to change back."
        cancelLabel="Keep reviewing"
        confirmLabel="Save profile change"
        heading="Change metric profile?"
        onCancel={() => setConfirmationVisible(false)}
        onConfirm={() => {
          setConfirmationVisible(false);
          void commit();
        }}
        restoreFocusRef={saveActionRef}
        visible={confirmationVisible}
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
  options: {
    gap: space[2],
  },
  target: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: space[2],
    paddingBottom: space[4],
  },
  policy: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: space[2],
    paddingBottom: space[4],
  },
  choice: {
    borderRadius: radius.standard,
  },
});
