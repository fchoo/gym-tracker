import {
  Check,
  CircleCheck,
  Circle,
  CircleX,
  Copy,
  RotateCcw,
  type LucideIcon,
} from "lucide-react-native";
import React from "react";
import {
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type PressableProps,
  type TextStyle,
} from "react-native";

import type {
  ActiveWorkoutSet,
  SetObservation,
} from "../../domains/workout";
import {
  radius,
  sizes,
  space,
  typeScale,
  useAppTheme,
} from "../theme";
import {
  FocusablePressable,
} from "./index";
import {
  SemanticNumberField,
  TimeDurationField,
} from "./PlanEditorFields";

export function formatLoadGrams(loadGrams: number): string {
  const kilograms = loadGrams / 1_000;
  return Number.isInteger(kilograms)
    ? String(kilograms)
    : kilograms.toFixed(1).replace(/\.0$/u, "");
}

export function formatObservation(observation: SetObservation): string {
  switch (observation.profile) {
    case "load_reps":
      return `${formatLoadGrams(observation.loadGrams)} kg × ${observation.reps}`;
    case "bodyweight_reps":
      return `Bodyweight × ${observation.reps}`;
    case "added_load_reps":
      return `BW + ${formatLoadGrams(observation.addedLoadGrams)} kg × ${observation.reps}`;
    case "assisted_reps":
      return `${formatLoadGrams(observation.assistanceGrams)} kg assist × ${observation.reps}`;
    case "timed_hold":
      return observation.version === 1
        ? `${observation.durationSeconds} sec`
        : `${observation.durationMs / 1_000} sec`;
    case "fixed_distance":
      return `${observation.distanceMeters} m in ${observation.durationMs / 1_000} sec`;
    case "fixed_time":
      return `${observation.distanceMeters} m in ${observation.durationMs / 1_000} sec`;
    case "intervals":
      return `${observation.completedRounds} rounds · ${observation.completedWorkMs / 1_000} sec work`;
    case "unscored":
      return observation.completed ? "Completed" : "Not completed";
  }
}

export function observationForSet(set: ActiveWorkoutSet): SetObservation {
  const persisted = set.observation
    ?? set.valueSources.find(({ source }) => source === "plan_default")
      ?.observation;
  if (persisted !== undefined) {
    return persisted;
  }
  switch (set.target.profile) {
    case "load_reps":
      return {
        version: 1,
        profile: "load_reps",
        loadGrams: set.target.loadGrams,
        reps: set.target.maxReps,
        source: "plan_default",
      };
    case "bodyweight_reps":
      return {
        version: 1,
        profile: "bodyweight_reps",
        reps: set.target.maxReps,
        source: "plan_default",
      };
    case "added_load_reps":
      return {
        version: 1,
        profile: "added_load_reps",
        addedLoadGrams: set.target.addedLoadGrams,
        reps: set.target.maxReps,
        source: "plan_default",
      };
    case "assisted_reps":
      return {
        version: 1,
        profile: "assisted_reps",
        assistanceGrams: set.target.assistanceGrams,
        reps: set.target.maxReps,
        source: "plan_default",
      };
    case "timed_hold":
      return set.target.version === 1
        ? {
            version: 1,
            profile: "timed_hold",
            durationSeconds: set.target.durationSeconds,
            source: "plan_default",
          }
        : {
            version: 2,
            profile: "timed_hold",
            durationMs: set.target.durationMs,
            source: "plan_default",
          };
    case "fixed_distance":
      return {
        version: 1,
        profile: "fixed_distance",
        distanceMeters: set.target.plannedDistanceMeters,
        durationMs: 0,
        source: "manual",
      };
    case "fixed_time":
      return {
        version: 1,
        profile: "fixed_time",
        durationMs: set.target.plannedDurationMs,
        distanceMeters: 0,
        source: "manual",
      };
    case "intervals":
      return {
        version: 1,
        profile: "intervals",
        protocolId: set.target.protocolId,
        completedRounds: 0,
        completedWorkMs: 0,
        source: "manual",
      };
    case "unscored":
      return {
        version: 1,
        profile: "unscored",
        completed: false,
        source: "manual",
      };
  }
}

function targetText(set: ActiveWorkoutSet): string {
  switch (set.target.profile) {
    case "load_reps":
      return `${formatLoadGrams(set.target.loadGrams)} kg × ${set.target.maxReps}`;
    case "bodyweight_reps":
      return `Bodyweight × ${set.target.maxReps}`;
    case "added_load_reps":
      return `BW + ${formatLoadGrams(set.target.addedLoadGrams)} kg × ${set.target.maxReps}`;
    case "assisted_reps":
      return `${formatLoadGrams(set.target.assistanceGrams)} kg assist × ${set.target.maxReps}`;
    case "timed_hold":
      return set.target.version === 1
        ? `${set.target.durationSeconds} sec`
        : `${set.target.durationMs / 1_000} sec`;
    case "fixed_distance":
      return `${set.target.plannedDistanceMeters} m`;
    case "fixed_time":
      return `${set.target.plannedDurationMs / 1_000} sec`;
    case "intervals":
      return `${set.target.plannedRounds} rounds · ${set.target.workIntervalMs / 1_000} sec work`;
    case "unscored":
      return "Complete";
  }
}

function resistanceValue(observation: SetObservation): string {
  switch (observation.profile) {
    case "load_reps":
      return formatLoadGrams(observation.loadGrams);
    case "added_load_reps":
      return formatLoadGrams(observation.addedLoadGrams);
    case "assisted_reps":
      return formatLoadGrams(observation.assistanceGrams);
    default:
      return "";
  }
}

function repetitionsValue(observation: SetObservation): string {
  switch (observation.profile) {
    case "load_reps":
    case "bodyweight_reps":
    case "added_load_reps":
    case "assisted_reps":
      return String(observation.reps);
    default:
      return "";
  }
}

function timedHoldValue(observation: SetObservation): string {
  if (observation.profile !== "timed_hold") {
    return "";
  }
  return observation.version === 1
    ? String(observation.durationSeconds)
    : String(observation.durationMs / 1_000);
}

function observationDurationValue(observation: SetObservation): string {
  switch (observation.profile) {
    case "timed_hold":
      return timedHoldValue(observation);
    case "fixed_distance":
      return String(observation.durationMs / 1_000);
    case "intervals":
      return String(observation.completedWorkMs / 1_000);
    default:
      return "";
  }
}

function distanceValue(observation: SetObservation): string {
  return observation.profile === "fixed_time"
    ? String(observation.distanceMeters)
    : "";
}

function roundsValue(observation: SetObservation): string {
  return observation.profile === "intervals"
    ? String(observation.completedRounds)
    : "";
}

function plannedValueLabel(set: ActiveWorkoutSet): string | null {
  switch (set.target.profile) {
    case "bodyweight_reps":
      return `Bodyweight · ${set.target.variationId}`;
    case "assisted_reps":
      return `Assistance equipment · ${set.target.assistanceEquipmentId}`;
    case "fixed_distance":
      return `Planned distance · ${set.target.plannedDistanceMeters} m`;
    case "fixed_time":
      return `Planned duration · ${set.target.plannedDurationMs / 1_000} sec`;
    case "intervals":
      return `Protocol · ${set.target.plannedRounds} rounds · ${
        set.target.workIntervalMs / 1_000
      } sec work · ${set.target.restIntervalMs / 1_000} sec rest`;
    case "unscored":
      return "Completion only · no performance ranking";
    default:
      return null;
  }
}

function observationsHaveSameValues(
  left: SetObservation,
  right: SetObservation,
): boolean {
  return JSON.stringify({ ...left, source: "manual" })
    === JSON.stringify({ ...right, source: "manual" });
}

const sourceLabels = {
  recommended: "Recommended",
  last_workout: "Last workout",
  plan_default: "Plan default",
  manual: "Manual",
} as const;

function GlyphAction({
  accessibilityLabel,
  accessibilityActions,
  busy = false,
  disabled = false,
  icon: Icon,
  onAccessibilityAction,
  onPress,
  tone,
}: Readonly<{
  accessibilityLabel: string;
  accessibilityActions?: PressableProps["accessibilityActions"];
  busy?: boolean;
  disabled?: boolean;
  icon: LucideIcon;
  onAccessibilityAction?: PressableProps["onAccessibilityAction"];
  onPress: () => void;
  tone: "default" | "card";
}>) {
  const { colors } = useAppTheme();
  const unavailable = busy || disabled;
  const foreground = tone === "card"
    ? colors.contentCardText
    : colors.textPrimary;
  const border = tone === "card"
    ? colors.contentCardBorder
    : colors.divider;
  return (
    <FocusablePressable
      accessibilityLabel={accessibilityLabel}
      accessibilityActions={accessibilityActions}
      onAccessibilityAction={onAccessibilityAction}
      accessibilityRole="button"
      accessibilityState={{ busy, disabled: unavailable }}
      disabled={unavailable}
      focusable={!unavailable}
      onPress={onPress}
      style={({ pressed }) => [
        styles.glyphAction,
        {
          backgroundColor: pressed
            ? tone === "card" ? colors.contentCardPressed : colors.surfaceSubtle
            : "transparent",
          borderColor: border,
          opacity: unavailable ? 0.62 : 1,
        },
      ]}
    >
      <Icon
        accessibilityElementsHidden
        color={foreground}
        importantForAccessibility="no-hide-descendants"
        size={sizes.icon}
        strokeWidth={2}
      />
    </FocusablePressable>
  );
}

type InlineField = Readonly<{
  key: "distance" | "duration" | "load" | "reps" | "rounds";
  accessibilityLabel: string;
  kind: "decimal" | "integer" | "duration";
  suffix: string;
  value: string;
  onChangeText(value: string): void;
}>;

export function SetRow({
  set,
  kind,
  index,
  count,
  active,
  actionsDisabled = false,
  busy = false,
  correctionBusy = false,
  correctionError,
  correctionMode = false,
  revealed = false,
  tone = "default",
  onChangeValues,
  onCancelCorrection = () => undefined,
  onComplete,
  onEditCompleted = () => undefined,
  onRevealedLayout,
  onSaveCorrection = () => undefined,
  onSkip,
}: Readonly<{
  set: ActiveWorkoutSet;
  kind: "warmup" | "working";
  index: number;
  count: number;
  active: boolean;
  actionsDisabled?: boolean;
  busy?: boolean;
  correctionBusy?: boolean;
  correctionError?: string | undefined;
  correctionMode?: boolean;
  revealed?: boolean;
  tone?: "default" | "card";
  onChangeValues: (
    observation: SetObservation,
  ) => Promise<void> | void;
  onCancelCorrection?(): void;
  onComplete: () => void;
  onEditCompleted?(): void;
  onRevealedLayout?(y: number): void;
  onSaveCorrection?(observation: SetObservation): Promise<void> | void;
  onSkip: () => void;
}>) {
  const { colors } = useAppTheme();
  const completed = set.status === "completed";
  const primary = tone === "card" ? colors.contentCardText : colors.textPrimary;
  const secondary = tone === "card"
    ? colors.contentCardTextSecondary
    : colors.textSecondary;
  const completedColor = tone === "card"
    ? colors.contentCardStatusCompleted
    : colors.completed;
  const skipped = set.status === "skipped";
  const current = formatObservation(observationForSet(set));
  const state = completed
    ? "Completed"
    : skipped
      ? "Skipped"
    : busy
      ? "Saving"
      : active
        ? "Current set"
        : "Not completed";
  const rowLabel = kind === "warmup" ? `W${index}` : String(index);
  const spokenKind = kind === "warmup" ? "Warm-up" : "Working set";
  const actionKind = kind === "warmup" ? `warm-up W${index}` : `Set ${index}`;
  const observation = observationForSet(set);
  const [loadValue, setLoadValue] = React.useState(
    resistanceValue(observation),
  );
  const [repsValue, setRepsValue] = React.useState(
    repetitionsValue(observation),
  );
  const [durationValue, setDurationValue] = React.useState(
    observationDurationValue(observation),
  );
  const [distanceValueText, setDistanceValueText] = React.useState(
    distanceValue(observation),
  );
  const [roundsValueText, setRoundsValueText] = React.useState(
    roundsValue(observation),
  );
  const [validationMessage, setValidationMessage] = React.useState<
    string | null
  >(null);
  const [focusedField, setFocusedField] = React.useState<
    "distance" | "duration" | "load" | "reps" | "rounds" | null
  >(null);
  const [savingValues, setSavingValues] = React.useState(false);
  const queuedSave = React.useRef<Readonly<{
    observation: SetObservation;
    promise: Promise<void>;
  }> | null>(null);
  const completionRequested = React.useRef(false);
  const rowRef = React.useRef<View>(null);

  React.useEffect(() => {
    const next = observationForSet(set);
    setLoadValue(resistanceValue(next));
    setRepsValue(repetitionsValue(next));
    setDurationValue(observationDurationValue(next));
    setDistanceValueText(distanceValue(next));
    setRoundsValueText(roundsValue(next));
    queuedSave.current = null;
    completionRequested.current = false;
    setSavingValues(false);
    setValidationMessage(null);
  }, [set]);

  React.useEffect(() => {
    if (revealed) {
      rowRef.current?.focus();
    }
  }, [revealed]);

  const inlineObservation = (durationOverride?: string): SetObservation | null => {
    if (skipped || busy || (completed && !correctionMode)) {
      return null;
    }
    if (
      set.target.profile === "load_reps"
      || set.target.profile === "added_load_reps"
      || set.target.profile === "assisted_reps"
    ) {
      const loadKilograms = Number(loadValue);
      if (!Number.isFinite(loadKilograms) || loadKilograms < 0) {
        setValidationMessage(
          set.target.profile === "assisted_reps"
            ? "Enter valid assistance."
            : "Enter a valid load.",
        );
        return null;
      }
      const reps = Number(repsValue);
      if (!Number.isSafeInteger(reps) || reps < 0) {
        setValidationMessage("Enter valid repetitions.");
        return null;
      }
      if (set.target.profile === "load_reps") {
        return {
            version: 1,
            profile: "load_reps",
            loadGrams: Math.round(loadKilograms * 1_000),
            reps,
            source: "manual",
        };
      }
      if (set.target.profile === "added_load_reps") {
        return {
          version: 1,
          profile: "added_load_reps",
          addedLoadGrams: Math.round(loadKilograms * 1_000),
          reps,
          source: "manual",
        };
      }
      return {
        version: 1,
        profile: "assisted_reps",
        assistanceGrams: Math.round(loadKilograms * 1_000),
        reps,
        source: "manual",
      };
    }
    if (set.target.profile === "bodyweight_reps") {
      const reps = Number(repsValue);
      if (!Number.isSafeInteger(reps) || reps < 1) {
        setValidationMessage("Enter valid repetitions.");
        return null;
      }
      return {
        version: 1,
        profile: "bodyweight_reps",
        reps,
        source: "manual",
      };
    }
    if (set.target.profile === "timed_hold") {
      const durationSeconds = Number(durationOverride ?? durationValue);
      if (!Number.isFinite(durationSeconds) || durationSeconds < 0) {
        setValidationMessage("Enter a valid duration.");
        return null;
      }
      return set.target.version === 1
        ? {
            version: 1,
            profile: "timed_hold",
            durationSeconds,
            source: "manual",
          }
        : {
            version: 2,
            profile: "timed_hold",
            durationMs: Math.round(durationSeconds * 1_000),
            source: "manual",
          };
    }
    if (set.target.profile === "fixed_distance") {
      const durationSeconds = Number(durationOverride ?? durationValue);
      if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
        setValidationMessage("Enter a valid duration.");
        return null;
      }
      return {
        version: 1,
        profile: "fixed_distance",
        distanceMeters: set.target.plannedDistanceMeters,
        durationMs: Math.round(durationSeconds * 1_000),
        source: "manual",
      };
    }
    if (set.target.profile === "fixed_time") {
      const distanceMeters = Number(distanceValueText);
      if (!Number.isSafeInteger(distanceMeters) || distanceMeters < 1) {
        setValidationMessage("Enter a valid distance.");
        return null;
      }
      return {
        version: 1,
        profile: "fixed_time",
        durationMs: set.target.plannedDurationMs,
        distanceMeters,
        source: "manual",
      };
    }
    if (set.target.profile === "intervals") {
      const completedRounds = Number(roundsValueText);
      const completedWorkSeconds = Number(durationOverride ?? durationValue);
      if (
        !Number.isSafeInteger(completedRounds)
        || completedRounds < 0
        || !Number.isFinite(completedWorkSeconds)
        || completedWorkSeconds < 0
      ) {
        setValidationMessage("Enter valid completed work.");
        return null;
      }
      return {
        version: 1,
        profile: "intervals",
        protocolId: set.target.protocolId,
        completedRounds,
        completedWorkMs: Math.round(completedWorkSeconds * 1_000),
        source: "manual",
      };
    }
    return {
      version: 1,
      profile: "unscored",
      completed: true,
      source: "manual",
    };
  };

  const persistInlineValues = async (durationOverride?: string): Promise<boolean> => {
    const next = inlineObservation(durationOverride);
    if (next === null) {
      return false;
    }
    setValidationMessage(null);
    const comparison = queuedSave.current?.observation ?? observation;
    const unchanged = observationsHaveSameValues(next, comparison);
    if (unchanged) {
      try {
        await queuedSave.current?.promise;
        return true;
      } catch {
        return false;
      }
    }
    setSavingValues(true);
    const promise = Promise.resolve(onChangeValues(next));
    queuedSave.current = {
      observation: next,
      promise,
    };
    try {
      await promise;
      return true;
    } catch {
      if (queuedSave.current?.promise === promise) {
        queuedSave.current = null;
      }
      setSavingValues(false);
      return false;
    }
  };

  const complete = async () => {
    if (completionRequested.current) {
      return;
    }
    completionRequested.current = true;
    try {
      if (await persistInlineValues()) {
        onComplete();
      }
    } finally {
      completionRequested.current = false;
    }
  };

  const saveCorrection = async () => {
    if (!completed || !correctionMode || correctionBusy) {
      return;
    }
    const next = inlineObservation();
    if (next === null) {
      return;
    }
    setValidationMessage(null);
    await onSaveCorrection(next);
  };

  const inputFields: readonly InlineField[] = (() => {
    const repetitions: InlineField = {
      key: "reps",
      accessibilityLabel: `${spokenKind} ${rowLabel} repetitions`,
      kind: "integer",
      suffix: "reps",
      value: repsValue,
      onChangeText: setRepsValue,
    };
    switch (set.target.profile) {
      case "load_reps":
        return [{
          key: "load",
          accessibilityLabel:
            `${spokenKind} ${rowLabel} load in kilograms`,
          kind: "decimal",
          suffix: "kg",
          value: loadValue,
          onChangeText: setLoadValue,
        }, repetitions];
      case "bodyweight_reps":
        return [repetitions];
      case "added_load_reps":
        return [{
          key: "load",
          accessibilityLabel:
            `${spokenKind} ${rowLabel} added load in kilograms`,
          kind: "decimal",
          suffix: "kg",
          value: loadValue,
          onChangeText: setLoadValue,
        }, repetitions];
      case "assisted_reps":
        return [{
          key: "load",
          accessibilityLabel:
            `${spokenKind} ${rowLabel} assistance in kilograms`,
          kind: "decimal",
          suffix: "kg assist",
          value: loadValue,
          onChangeText: setLoadValue,
        }, repetitions];
      case "timed_hold":
        return [{
          key: "duration",
          accessibilityLabel:
            `${spokenKind} ${rowLabel} duration in seconds`,
          kind: "duration",
          suffix: "sec",
          value: durationValue,
          onChangeText: setDurationValue,
        }];
      case "fixed_distance":
        return [{
          key: "duration",
          accessibilityLabel:
            `${spokenKind} ${rowLabel} actual duration in seconds`,
          kind: "duration",
          suffix: "sec",
          value: durationValue,
          onChangeText: setDurationValue,
        }];
      case "fixed_time":
        return [{
          key: "distance",
          accessibilityLabel:
            `${spokenKind} ${rowLabel} actual distance in meters`,
          kind: "integer",
          suffix: "m",
          value: distanceValueText,
          onChangeText: setDistanceValueText,
        }];
      case "intervals":
        return [{
          key: "rounds",
          accessibilityLabel:
            `${spokenKind} ${rowLabel} completed rounds`,
          kind: "integer",
          suffix: "rounds",
          value: roundsValueText,
          onChangeText: setRoundsValueText,
        }, {
          key: "duration",
          accessibilityLabel:
            `${spokenKind} ${rowLabel} completed work in seconds`,
          kind: "duration",
          suffix: "sec work",
          value: durationValue,
          onChangeText: setDurationValue,
        }];
      case "unscored":
        return [];
    }
  })();
  const fixedValueLabel = plannedValueLabel(set);
  const accessibilityLabel = [
    `${spokenKind} ${index} of ${count}.`,
    `Planned ${targetText(set)}.`,
    `Current values ${current}.`,
    `${savingValues ? "Saving values" : state}.`,
  ].join(" ");

  return (
    <FocusablePressable
      accessible={false}
      focusable={revealed}
      importantForAccessibility="no"
      onLayout={(event: LayoutChangeEvent) => {
        if (revealed) {
          onRevealedLayout?.(event.nativeEvent.layout.y);
        }
      }}
      onPress={() => undefined}
      ref={rowRef}
      testID={`${kind === "warmup" ? `warmup-W${index}` : `working-set-${index}`}-row`}
      style={[
        styles.row,
        revealed && styles.revealedRow,
        {
          backgroundColor: active ? colors.surface : "transparent",
          borderColor: active ? colors.focusRing : colors.divider,
        },
      ]}
    >
      {completed || skipped ? (
        <View
          accessible={false}
          style={styles.statusGlyph}
          testID={`${kind}-${rowLabel}-status-glyph`}
        >
          {completed ? (
            <CircleCheck
              accessibilityElementsHidden
              color={completedColor}
              importantForAccessibility="no-hide-descendants"
              size={sizes.inlineIcon}
              strokeWidth={2.5}
            />
          ) : (
            <CircleX
              accessibilityElementsHidden
              color={secondary}
              importantForAccessibility="no-hide-descendants"
              size={sizes.inlineIcon}
              strokeWidth={2.5}
            />
          )}
        </View>
      ) : null}
      <View
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="summary"
        accessibilityState={{ selected: active || revealed }}
        accessible
        style={styles.heading}
      >
        {completed || skipped ? null : (
          <Circle
            accessibilityElementsHidden
            color={active ? colors.action : secondary}
            importantForAccessibility="no-hide-descendants"
            size={sizes.inlineIcon}
            strokeWidth={2}
          />
        )}
        <Text
          style={[
            typeScale.bodyStrong as TextStyle,
            { color: primary },
          ]}
        >
          {rowLabel}
        </Text>
        <Text
          style={[
            typeScale.secondary as TextStyle,
            { color: secondary },
          ]}
        >
          {completed
            ? `Completed ${kind === "warmup" ? "warm-up" : "working set"} ${rowLabel}`
            : skipped
              ? `Skipped ${kind === "warmup" ? "warm-up" : "working set"} ${rowLabel}`
              : state}
        </Text>
      </View>
      {completed || skipped ? (
        <Text
          style={[
            typeScale.bodyStrong as TextStyle,
            { color: completed ? completedColor : secondary },
          ]}
        >
          {current}
        </Text>
      ) : null}
      {completed && kind === "working" && !correctionMode ? (
        <GlyphAction
          accessibilityLabel={`Edit completed set ${index}`}
          icon={RotateCcw}
          onPress={onEditCompleted}
          tone={tone}
        />
      ) : null}
      {completed && correctionMode ? (
        <>
          <View style={styles.values}>
            {inputFields.map((field) => (
              <View key={field.key} style={styles.valueField}>
                {field.kind === "duration" ? (
                  <TimeDurationField
                    label={field.accessibilityLabel}
                    onChangeText={field.onChangeText}
                    tone={tone}
                    value={field.value}
                  />
                ) : (
                  <SemanticNumberField
                    kind={field.kind}
                    label={field.accessibilityLabel}
                    minimum={0}
                    onBlur={() => setFocusedField(null)}
                    onChangeText={field.onChangeText}
                    onFocus={() => setFocusedField(field.key)}
                    style={[
                      styles.input,
                      field.key === "reps" || field.key === "rounds"
                        ? styles.repsInput
                        : undefined,
                      typeScale.bodyStrong as TextStyle,
                      {
                        borderColor: tone === "card"
                          ? colors.contentCardBorder
                          : colors.divider,
                        color: colors.textPrimary,
                        outlineColor: colors.focusRing,
                        outlineStyle: "solid",
                        outlineWidth:
                          focusedField === field.key ? sizes.focusRing : 0,
                      },
                    ]}
                    tone={tone}
                    value={field.value}
                  />
                )}
                <Text style={[typeScale.secondary as TextStyle, {
                  color: secondary,
                }]}>
                  {field.suffix}
                </Text>
              </View>
            ))}
          </View>
          {validationMessage === null ? null : (
            <Text
              accessibilityLiveRegion="polite"
              style={[typeScale.secondary as TextStyle, {
                color: colors.destructive,
              }]}
            >
              {validationMessage}
            </Text>
          )}
          {correctionError === undefined ? null : (
            <Text
              accessibilityLiveRegion="polite"
              style={[typeScale.secondary as TextStyle, {
                color: colors.destructive,
              }]}
            >
              {correctionError}
            </Text>
          )}
          <View style={styles.actions}>
            <FocusablePressable
              accessibilityLabel={`Save correction for completed set ${index}`}
              accessibilityRole="button"
              accessibilityState={{ busy: correctionBusy, disabled: correctionBusy }}
              disabled={correctionBusy}
              focusable={!correctionBusy}
              onPress={() => {
                void saveCorrection();
              }}
              style={({ pressed }) => [
                styles.correctionAction,
                {
                  backgroundColor: pressed ? colors.contentCardPressed : colors.surface,
                  borderColor: colors.contentCardBorder,
                  opacity: correctionBusy ? 0.62 : 1,
                },
              ]}
            >
              <Text style={[typeScale.bodyStrong as TextStyle, {
                color: primary,
              }]}>
                Save correction
              </Text>
            </FocusablePressable>
            <FocusablePressable
              accessibilityLabel={`Cancel correction for completed set ${index}`}
              accessibilityRole="button"
              disabled={correctionBusy}
              focusable={!correctionBusy}
              onPress={onCancelCorrection}
              style={({ pressed }) => [
                styles.correctionAction,
                {
                  backgroundColor: pressed ? colors.contentCardPressed : "transparent",
                  borderColor: colors.contentCardBorder,
                  opacity: correctionBusy ? 0.62 : 1,
                },
              ]}
            >
              <Text style={[typeScale.bodyStrong as TextStyle, {
                color: primary,
              }]}>
                Cancel
              </Text>
            </FocusablePressable>
          </View>
        </>
      ) : completed || skipped ? null : (
        <>
          {fixedValueLabel === null ? null : (
            <Text
              style={[
                typeScale.secondary as TextStyle,
                { color: secondary },
              ]}
            >
              {fixedValueLabel}
            </Text>
          )}
          <View style={styles.values}>
            {inputFields.map((field) => (
              <View key={field.key} style={styles.valueField}>
                {field.kind === "duration" ? (
                  <TimeDurationField
                    label={field.accessibilityLabel}
                    onChangeText={(value) => {
                      field.onChangeText(value);
                      void persistInlineValues(value);
                    }}
                    tone={tone}
                    value={field.value}
                  />
                ) : (
                  <SemanticNumberField
                    kind={field.kind}
                    label={field.accessibilityLabel}
                    minimum={0}
                    onBlur={() => {
                      setFocusedField(null);
                      void persistInlineValues();
                    }}
                    onChangeText={field.onChangeText}
                    onFocus={() => setFocusedField(field.key)}
                    style={[
                      styles.input,
                      field.key === "reps" || field.key === "rounds"
                        ? styles.repsInput
                        : undefined,
                      typeScale.bodyStrong as TextStyle,
                      {
                        borderColor: tone === "card"
                          ? colors.contentCardBorder
                          : colors.divider,
                        color: colors.textPrimary,
                        outlineColor: colors.focusRing,
                        outlineStyle: "solid",
                        outlineWidth:
                          focusedField === field.key ? sizes.focusRing : 0,
                      },
                    ]}
                    tone={tone}
                    value={field.value}
                  />
                )}
                <Text style={[typeScale.secondary as TextStyle, {
                  color: secondary,
                }]}>
                  {field.suffix}
                </Text>
              </View>
            ))}
          </View>
          {kind === "working" && set.valueSources.length > 0 ? (
            <View style={styles.sources}>
              {set.valueSources
                .filter(({ source }) => source !== "manual")
                .map((source) => (
                  <GlyphAction
                    accessibilityLabel={
                      `Use ${sourceLabels[source.source]} values for working set ${index}: ${
                        formatObservation(source.observation)
                      }`
                    }
                    key={source.source}
                    onPress={() => onChangeValues(source.observation)}
                    icon={source.source === "recommended"
                      ? Check
                      : source.source === "last_workout"
                        ? Copy
                        : RotateCcw}
                    tone={tone}
                  />
                ))}
            </View>
          ) : null}
          {validationMessage === null ? null : (
            <Text
              accessibilityLiveRegion="polite"
              style={[typeScale.secondary as TextStyle, {
                color: colors.destructive,
              }]}
            >
              {validationMessage}
            </Text>
          )}
          {savingValues ? (
            <Text
              accessibilityLiveRegion="polite"
              style={[typeScale.secondary as TextStyle, {
                color: secondary,
              }]}
            >
              Saving values…
            </Text>
          ) : null}
          <View
            style={styles.actions}
            testID={`${kind === "warmup" ? `warmup-W${index}` : `working-set-${index}`}-actions`}
          >
            <GlyphAction
              accessibilityActions={[
                { name: "activate", label: "Complete current set" },
              ]}
              accessibilityLabel={
                busy && kind === "working"
                  ? "Saving set…"
                  : `Complete ${actionKind}`
              }
              busy={busy}
              disabled={
                actionsDisabled
                || (kind === "working" && !active)
              }
              icon={CircleCheck}
              onAccessibilityAction={(event) => {
                if (event.nativeEvent.actionName === "activate") {
                  void complete();
                }
              }}
              onPress={() => {
                void complete();
              }}
              tone={tone}
            />
            <GlyphAction
              accessibilityLabel={`Skip ${actionKind}`}
              disabled={
                busy
                || actionsDisabled
                || (kind === "working" && !active)
              }
              icon={CircleX}
              onPress={onSkip}
              tone={tone}
            />
          </View>
        </>
      )}
    </FocusablePressable>
  );
}

const styles = StyleSheet.create({
  row: {
    borderRadius: radius.standard,
    borderWidth: StyleSheet.hairlineWidth,
    gap: space[2],
    minHeight: 64,
    padding: space[2],
  },
  revealedRow: {
    borderWidth: sizes.focusRing,
  },
  statusGlyph: {
    position: "absolute",
    right: space[2],
    top: space[2],
  },
  heading: {
    alignItems: "center",
    flexDirection: "row",
    gap: space[2],
  },
  values: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space[2],
  },
  valueField: {
    alignItems: "center",
    flexDirection: "row",
    gap: space[1],
  },
  input: {
    borderRadius: radius.standard,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: sizes.minimumTarget,
    minWidth: 72,
    paddingHorizontal: space[2],
    textAlign: "right",
  },
  repsInput: {
    minWidth: 56,
  },
  sources: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space[1],
  },
  actions: {
    alignSelf: "flex-end",
    flexDirection: "row",
    gap: space[2],
    justifyContent: "flex-end",
  },
  glyphAction: {
    alignItems: "center",
    borderRadius: radius.standard,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: "center",
    minHeight: sizes.minimumTarget,
    minWidth: sizes.minimumTarget,
  },
  correctionAction: {
    alignItems: "center",
    borderRadius: radius.standard,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: "center",
    minHeight: sizes.minimumTarget,
    paddingHorizontal: space[4],
  },
});
