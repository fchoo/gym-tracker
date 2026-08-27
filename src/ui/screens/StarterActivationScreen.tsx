import React, {
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
  AcceptedStarterPlanActivation,
  AcceptedStarterTemplate,
  StarterPlanCopyChoice,
} from "../../domains/plans";
import type {
  InitialRotationScheduleBinding,
  InitialScheduleActivationInput,
  InitialWeekdayScheduleBinding,
} from "../../domains/scheduling";
import {
  starterFactLabel,
} from "../../bootstrap/starterPlanRuntime";
import {
  AdaptiveScreen,
} from "../layout/AdaptiveScreen";
import {
  ConfirmationSheet,
  CalendarField,
  FocusablePressable,
  IconAction,
  InlineNotice,
  PrimaryAction,
  ScreenHeader,
  SecondaryAction,
  SectionHeader,
  SkeletonBlock,
} from "../components";
import {
  radius,
  sizes,
  space,
  typeScale,
  useAppTheme,
} from "../theme";

export type StarterActivationCopy = Readonly<{
  planId: string;
  name: string;
  state: "Active" | "Inactive";
  scheduleSummary: string;
  planRevision: number;
  scheduleRevision: number;
}>;

export type StarterActivationPreview = Readonly<{
  template: AcceptedStarterTemplate;
  startLocalDate: string;
  timeZone: string;
  activeScheduleRevision: number | null;
  copies: readonly StarterActivationCopy[];
  activeWorkout: Readonly<{
    sessionId: string;
    sessionRevision: number;
  }> | null;
}>;

export type StarterActivationCommand = Readonly<{
  templateId: string;
  startLocalDate: string;
  timeZone: string;
  mode: "weekday" | "rotation";
  bindings:
    | readonly InitialWeekdayScheduleBinding[]
    | readonly InitialRotationScheduleBinding[];
  copyChoice: StarterPlanCopyChoice | null;
  expectedActiveScheduleRevision: number | null;
}>;

type StarterActivationScreenProps = Readonly<{
  templateId: string;
  loadPreview(templateId: string): Promise<StarterActivationPreview | null>;
  activateStarterPlan(
    command: StarterActivationCommand,
  ): Promise<AcceptedStarterPlanActivation>;
  onActivated(planId: string): void;
  onBack(): void;
  onResume(sessionId: string): void;
  onFinishPartial(input: Readonly<{
    sessionId: string;
    sessionRevision: number;
  }>): Promise<void>;
  onDiscard(input: Readonly<{
    sessionId: string;
    sessionRevision: number;
  }>): Promise<void>;
  width?: number;
}>;

type Mode = "weekday" | "rotation";
type CopyIntent = "reactivate_existing" | "create_another" | null;

const weekdays = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

function metricLabel(profile: AcceptedStarterTemplate["days"][number]["exercises"][number]["metricIdentity"]["profile"]): string {
  const labels = {
    load_reps: "Load + reps",
    bodyweight_reps: "Bodyweight reps",
    added_load_reps: "Added load + reps",
    assisted_reps: "Assisted reps",
    timed_hold: "Timed hold",
    fixed_distance: "Fixed distance",
    fixed_time: "Fixed time",
    intervals: "Rounds / intervals",
    unscored: "Mobility / unscored",
  } as const;
  return labels[profile];
}

function suggestedMode(template: AcceptedStarterTemplate): Mode {
  return template.scheduleSuggestion.mode;
}

function suggestedWeekdayBindings(
  template: AcceptedStarterTemplate,
): readonly InitialWeekdayScheduleBinding[] {
  if (template.scheduleSuggestion.mode === "weekday") {
    return template.scheduleSuggestion.cycleWeeks.flatMap(
      (week, weekIndex) => week.map((binding, ordinal) => ({
        planDaySourceId: binding.dayId,
        ordinal: weekIndex * week.length + ordinal,
        weekIndex,
        weekday: binding.weekday,
      })),
    );
  }
  return template.days.map((day, ordinal) => ({
    planDaySourceId: day.id,
    ordinal,
    weekIndex: 0,
    weekday: weekdays[ordinal] ?? "Monday",
  }));
}

function suggestedRotationBindings(
  template: AcceptedStarterTemplate,
): readonly InitialRotationScheduleBinding[] {
  const sourceIds = template.scheduleSuggestion.mode === "rotation"
    ? template.scheduleSuggestion.rotation
    : template.days.map(({ id }) => id);
  return sourceIds.map((planDaySourceId, ordinal) => ({
    planDaySourceId,
    ordinal,
  }));
}

function reorder<Value>(
  values: readonly Value[],
  index: number,
  direction: -1 | 1,
): readonly Value[] {
  const destination = index + direction;
  if (destination < 0 || destination >= values.length) {
    return values;
  }
  const next = [...values];
  const current = next[index]!;
  next[index] = next[destination]!;
  next[destination] = current;
  return next;
}

function ScheduleMode({
  mode,
  onChange,
}: Readonly<{
  mode: Mode;
  onChange(mode: Mode): void;
}>) {
  const { colors } = useAppTheme();

  return (
    <View accessibilityRole="radiogroup" style={styles.segmented}>
      {(["weekday", "rotation"] as const).map((option) => {
        const label = option === "weekday" ? "Weekday" : "Rotation";
        const selected = mode === option;
        return (
          <FocusablePressable
            accessibilityLabel={label}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            focusable
            key={option}
            onPress={() => onChange(option)}
            style={[
              styles.radio,
              {
                backgroundColor: selected ? colors.action : colors.surface,
                borderColor: selected ? colors.action : colors.divider,
              },
            ]}
          >
            <Text style={[
              typeScale.bodyStrong as TextStyle,
              { color: selected ? colors.onAction : colors.textPrimary },
            ]}>
              {label}
            </Text>
          </FocusablePressable>
        );
      })}
    </View>
  );
}

function ScheduleBindings({
  template,
  mode,
  weekdayBindings,
  rotationBindings,
  onWeekdayBindings,
  onRotationBindings,
}: Readonly<{
  template: AcceptedStarterTemplate;
  mode: Mode;
  weekdayBindings: readonly InitialWeekdayScheduleBinding[];
  rotationBindings: readonly InitialRotationScheduleBinding[];
  onWeekdayBindings(bindings: readonly InitialWeekdayScheduleBinding[]): void;
  onRotationBindings(bindings: readonly InitialRotationScheduleBinding[]): void;
}>) {
  const { colors } = useAppTheme();
  const names = new Map(
    template.days.map(({ id, displayName }) => [id, displayName]),
  );
  const rows = mode === "weekday" ? weekdayBindings : rotationBindings;

  function move(index: number, direction: -1 | 1) {
    if (mode === "weekday") {
      const reorderedDayIds = reorder(
        weekdayBindings.map(({ planDaySourceId }) => planDaySourceId),
        index,
        direction,
      );
      onWeekdayBindings(weekdayBindings.map((binding, ordinal) => ({
        ...binding,
        ordinal,
        planDaySourceId: reorderedDayIds[ordinal]!,
      })));
    } else {
      onRotationBindings(reorder(rotationBindings, index, direction).map(
        (binding, ordinal) => ({ ...binding, ordinal }),
      ));
    }
  }

  return (
    <View style={styles.bindingList}>
      {rows.map((binding, index) => {
        const name = names.get(binding.planDaySourceId)
          ?? binding.planDaySourceId;
        const prefix = mode === "weekday"
          ? `${(binding as InitialWeekdayScheduleBinding).weekday} · `
          : `${index + 1}. `;
        return (
          <View
            key={`${binding.planDaySourceId}:${index}`}
            style={[styles.bindingRow, { borderColor: colors.divider }]}
          >
            <Text style={[
              typeScale.bodyStrong as TextStyle,
              { color: colors.textPrimary },
            ]}>
              {prefix}{name}
            </Text>
            <View style={styles.bindingActions}>
              <IconAction
                accessibilityLabel={`Move ${name} up`}
                disabled={index === 0}
                icon="moveUp"
                onPress={() => move(index, -1)}
              />
              <IconAction
                accessibilityLabel={`Move ${name} down`}
                disabled={index === rows.length - 1}
                icon="moveDown"
                onPress={() => move(index, 1)}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}

function CopyChoice({
  copies,
  intent,
  selectedPlanId,
  onIntent,
  onSelectPlan,
}: Readonly<{
  copies: readonly StarterActivationCopy[];
  intent: CopyIntent;
  selectedPlanId: string | null;
  onIntent(intent: Exclude<CopyIntent, null>): void;
  onSelectPlan(planId: string): void;
}>) {
  const { colors } = useAppTheme();

  if (copies.length === 0) {
    return null;
  }

  return (
    <>
      <SectionHeader
        supportingText="Choose explicitly. Existing copies are never merged or selected automatically."
        title="Existing copies"
      />
      <View accessibilityRole="radiogroup" style={styles.choiceList}>
        {([
          ["reactivate_existing", "Reactivate existing copy"],
          ["create_another", "Create another copy"],
        ] as const).map(([value, label]) => (
          <FocusablePressable
            accessibilityLabel={label}
            accessibilityRole="radio"
            accessibilityState={{ checked: intent === value }}
            focusable
            key={value}
            onPress={() => onIntent(value)}
            style={[
              styles.radio,
              { borderColor: colors.divider },
            ]}
          >
            <Text style={[
              typeScale.bodyStrong as TextStyle,
              { color: colors.textPrimary },
            ]}>
              {label}
            </Text>
          </FocusablePressable>
        ))}
      </View>
      {copies.map((copy) => (
        <FocusablePressable
          accessibilityLabel={`${copy.name}. ${copy.state}. ${copy.scheduleSummary}`}
          accessibilityRole="radio"
          accessibilityState={{ checked: selectedPlanId === copy.planId }}
          focusable={intent === "reactivate_existing"}
          key={copy.planId}
          onPress={() => onSelectPlan(copy.planId)}
          style={[
            styles.copyRow,
            { borderColor: colors.divider },
          ]}
        >
          <Text style={[
            typeScale.bodyStrong as TextStyle,
            { color: colors.textPrimary },
          ]}>
            {copy.name}
          </Text>
          <Text style={[
            typeScale.label as TextStyle,
            { color: colors.textSecondary },
          ]}>
            {copy.state}
          </Text>
          <Text style={[
            typeScale.secondary as TextStyle,
            { color: colors.textSecondary },
          ]}>
            {copy.scheduleSummary}
          </Text>
        </FocusablePressable>
      ))}
    </>
  );
}

function CompletePreview({
  template,
}: Readonly<{ template: AcceptedStarterTemplate }>) {
  const { colors } = useAppTheme();
  const names = new Map(
    template.days.map(({ id, displayName }) => [id, displayName]),
  );
  const schedule = template.scheduleSuggestion.mode === "weekday"
    ? template.scheduleSuggestion.cycleWeeks.map((week) =>
        week.map(({ weekday, dayId }) =>
          `${weekday} ${names.get(dayId) ?? dayId}`
        ).join(" · ")
      ).join("\n")
    : `Rotation · ${template.scheduleSuggestion.rotation.map((dayId) =>
        names.get(dayId) ?? dayId
      ).join(" · ")}`;
  return (
    <>
      <SectionHeader title="Complete preview" />
      <Text style={[
        typeScale.body as TextStyle,
        { color: colors.textSecondary },
      ]}>
        {template.goal} · {starterFactLabel(template.experience)} ·{" "}
        {template.equipment.map(starterFactLabel).join(", ")} ·{" "}
        {template.estimatedDurationMinutes} minutes
      </Text>
      <Text style={[
        typeScale.body as TextStyle,
        { color: colors.textSecondary },
      ]}>
        {schedule}
      </Text>
      {template.days.map((day) => (
        <View key={day.id} style={styles.day}>
          <Text accessibilityRole="header" style={[
            typeScale.sectionTitle as TextStyle,
            { color: colors.textPrimary },
          ]}>
            {day.displayName}
          </Text>
          {day.exercises.map((occurrence) => (
            <View key={occurrence.id} style={styles.occurrence}>
              <Text style={[
                typeScale.bodyStrong as TextStyle,
                { color: colors.textPrimary },
              ]}>
                {occurrence.catalogName}
              </Text>
              <Text style={[
                typeScale.secondary as TextStyle,
                { color: colors.textSecondary },
              ]}>
                {metricLabel(occurrence.metricIdentity.profile)}
              </Text>
            </View>
          ))}
        </View>
      ))}
      <SectionHeader title="Progression summary" />
      <Text style={[
        typeScale.body as TextStyle,
        { color: colors.textSecondary },
      ]}>
        {template.progressionSummary}
      </Text>
      <SectionHeader title="Source notes" />
      {template.sourceNotes.map((note) => (
        <Text
          key={note.id}
          style={[
            typeScale.body as TextStyle,
            { color: colors.textSecondary },
          ]}
        >
          {note.text}
        </Text>
      ))}
    </>
  );
}

export function StarterActivationScreen({
  templateId,
  loadPreview,
  activateStarterPlan,
  onActivated,
  onBack,
  onResume,
  onFinishPartial,
  onDiscard,
  width,
}: StarterActivationScreenProps) {
  const { colors } = useAppTheme();
  const [preview, setPreview] = useState<StarterActivationPreview | null>(null);
  const [state, setState] = useState<
    "loading" | "ready" | "missing" | "error"
  >("loading");
  const [retryGeneration, setRetryGeneration] = useState(0);
  const [startLocalDate, setStartLocalDate] = useState("");
  const [mode, setMode] = useState<Mode>("weekday");
  const [weekdayBindings, setWeekdayBindings] = useState<
    readonly InitialWeekdayScheduleBinding[]
  >([]);
  const [rotationBindings, setRotationBindings] = useState<
    readonly InitialRotationScheduleBinding[]
  >([]);
  const [copyIntent, setCopyIntent] = useState<CopyIntent>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [activationError, setActivationError] = useState(false);
  const [committed, setCommitted] =
    useState<AcceptedStarterPlanActivation | null>(null);
  const confirmActionRef = useRef<View>(null);

  useEffect(() => {
    let active = true;
    setState("loading");
    void loadPreview(templateId).then((value) => {
      if (!active) {
        return;
      }
      setPreview(value);
      if (value === null) {
        setState("missing");
        return;
      }
      setStartLocalDate(value.startLocalDate);
      setMode(suggestedMode(value.template));
      setWeekdayBindings(suggestedWeekdayBindings(value.template));
      setRotationBindings(suggestedRotationBindings(value.template));
      setCopyIntent(null);
      setSelectedPlanId(null);
      setState("ready");
    }).catch(() => {
      if (active) {
        setState("error");
      }
    });
    return () => {
      active = false;
    };
  }, [loadPreview, retryGeneration, templateId]);

  const copyChoice = useMemo<StarterPlanCopyChoice | null>(() => {
    if (preview === null || preview.copies.length === 0) {
      return null;
    }
    if (copyIntent === "create_another") {
      return { type: "create_another" };
    }
    if (copyIntent !== "reactivate_existing" || selectedPlanId === null) {
      return null;
    }
    const selected = preview.copies.find(
      ({ planId }) => planId === selectedPlanId,
    );
    return selected === undefined
      ? null
      : {
          type: "reactivate_existing",
          planId: selected.planId,
          expectedPlanRevision: selected.planRevision,
          expectedScheduleRevision: selected.scheduleRevision,
        };
  }, [copyIntent, preview, selectedPlanId]);

  if (state === "loading") {
    return (
      <AdaptiveScreen
        primary={
          <>
            <ScreenHeader backAction={onBack} title="Activate starter plan" />
            {Array.from({ length: 4 }, (_, index) => (
              <SkeletonBlock
                height={index === 0 ? 96 : 72}
                key={index}
                testID={`starter-activation-skeleton-${index + 1}`}
              />
            ))}
          </>
        }
        testID="starter-activation"
        {...(width === undefined ? {} : { width })}
      />
    );
  }

  if (state !== "ready" || preview === null) {
    return (
      <AdaptiveScreen
        primary={
          <>
            <ScreenHeader backAction={onBack} title="Activate starter plan" />
            <InlineNotice
              action={state === "error" ? (
                <SecondaryAction
                  label="Retry"
                  onPress={() => setRetryGeneration((value) => value + 1)}
                />
              ) : undefined}
              body={state === "error"
                ? "Activation preview could not be loaded. Your current plan and schedule were not changed."
                : "Return to Library and select one of the six accepted starter plans."}
              heading={state === "error"
                ? "Activation preview could not be loaded"
                : "Starter plan not found"}
              tone={state === "error" ? "error" : "neutral"}
            />
          </>
        }
        testID="starter-activation"
        {...(width === undefined ? {} : { width })}
      />
    );
  }

  const activeWorkout = preview.activeWorkout;
  const requiresCopyChoice = preview.copies.length > 0;
  const copyChoiceComplete = !requiresCopyChoice
    || copyIntent === "create_another"
    || (
      copyIntent === "reactivate_existing"
      && selectedPlanId !== null
    );
  const bindings = mode === "weekday" ? weekdayBindings : rotationBindings;

  async function confirmActivation() {
    setConfirmVisible(false);
    setBusy(true);
    setActivationError(false);
    try {
      const result = await activateStarterPlan({
        templateId: preview!.template.id,
        startLocalDate,
        timeZone: preview!.timeZone,
        mode,
        bindings,
        copyChoice,
        expectedActiveScheduleRevision: preview!.activeScheduleRevision,
      } as StarterActivationCommand);
      setCommitted(result);
      onActivated(result.plan.id);
    } catch {
      setActivationError(true);
    } finally {
      setBusy(false);
    }
  }

  if (committed !== null) {
    return (
      <AdaptiveScreen
        primary={
          <>
            <ScreenHeader
              backAction={onBack}
              title={`Activate ${preview.template.displayName}`}
            />
            <InlineNotice
              body="Previous plans and schedules remain available as inactive copies."
              heading={`${committed.plan.name} is active`}
              tone="completed"
            />
            <Text style={[
              typeScale.body as TextStyle,
              { color: colors.textSecondary },
            ]}>
              {`${committed.schedule.version.mode === "weekday" ? "Weekday" : "Rotation"} · ${committed.schedule.version.effectiveLocalDate}`}
            </Text>
          </>
        }
        testID="starter-activation"
        {...(width === undefined ? {} : { width })}
      />
    );
  }

  return (
    <>
      <AdaptiveScreen
        primary={
          <>
            <ScreenHeader
              backAction={onBack}
              title={`Activate ${preview.template.displayName}`}
            />
            {activationError ? (
              <InlineNotice
                body="Plan could not be activated. Your current active plan and schedule are unchanged."
                heading="Plan could not be activated"
                tone="error"
              />
            ) : null}
            {activeWorkout === null ? (
              <>
                <SectionHeader title="Schedule setup" />
                <CalendarField
                  defaultDate={preview.startLocalDate}
                  label="Start date"
                  onChange={setStartLocalDate}
                  value={startLocalDate}
                />
                <Text style={[
                  typeScale.secondary as TextStyle,
                  { color: colors.textSecondary },
                ]}>
                  {`Schedule timezone · ${preview.timeZone}`}
                </Text>
                <ScheduleMode mode={mode} onChange={setMode} />
                <ScheduleBindings
                  mode={mode}
                  onRotationBindings={setRotationBindings}
                  onWeekdayBindings={setWeekdayBindings}
                  rotationBindings={rotationBindings}
                  template={preview.template}
                  weekdayBindings={weekdayBindings}
                />
                <CopyChoice
                  copies={preview.copies}
                  intent={copyIntent}
                  onIntent={(intent) => {
                    setCopyIntent(intent);
                    if (intent === "create_another") {
                      setSelectedPlanId(null);
                    }
                  }}
                  onSelectPlan={setSelectedPlanId}
                  selectedPlanId={selectedPlanId}
                />
                <CompletePreview template={preview.template} />
                <PrimaryAction
                  busy={busy}
                  disabled={!copyChoiceComplete || startLocalDate.length !== 10}
                  label="Activate plan"
                  onPress={() => setConfirmVisible(true)}
                  ref={confirmActionRef}
                />
              </>
            ) : (
              <InlineNotice
                action={
                  <View style={styles.blockActions}>
                    <PrimaryAction
                      label="Resume"
                      onPress={() => onResume(activeWorkout.sessionId)}
                    />
                    <SecondaryAction
                      label="Finish partial"
                      onPress={() => {
                        void onFinishPartial(activeWorkout).then(() =>
                          setRetryGeneration((value) => value + 1)
                        );
                      }}
                    />
                    <SecondaryAction
                      destructive
                      label="Discard"
                      onPress={() => {
                        void onDiscard(activeWorkout).then(() =>
                          setRetryGeneration((value) => value + 1)
                        );
                      }}
                    />
                  </View>
                }
                body="Finish the current workout before switching plans."
                heading="Finish the current workout first"
                tone="attention"
              />
            )}
          </>
        }
        testID="starter-activation"
        {...(width === undefined ? {} : { width })}
      />
      <ConfirmationSheet
        body={[
          `${preview.template.displayName} will become the active plan.`,
          `${mode === "weekday" ? "Weekday" : "Rotation"} starts ${startLocalDate} in ${preview.timeZone}.`,
          "The previous plan and schedule remain preserved as inactive.",
        ].join(" ")}
        cancelLabel="Keep editing"
        confirmLabel="Activate plan"
        heading={`Activate ${preview.template.displayName}?`}
        onCancel={() => setConfirmVisible(false)}
        onConfirm={() => {
          void confirmActivation();
        }}
        restoreFocusRef={confirmActionRef}
        visible={confirmVisible}
      />
    </>
  );
}

const styles = StyleSheet.create({
  segmented: {
    flexDirection: "row",
    gap: space[2],
  },
  radio: {
    borderRadius: radius.standard,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    justifyContent: "center",
    minHeight: sizes.minimumTarget,
    paddingHorizontal: space[4],
    paddingVertical: space[2],
  },
  bindingList: {
    gap: space[2],
  },
  bindingRow: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: space[2],
    paddingBottom: space[2],
  },
  bindingActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space[2],
  },
  choiceList: {
    gap: space[2],
  },
  copyRow: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: space[1],
    minHeight: sizes.minimumTarget,
    paddingVertical: space[2],
  },
  day: {
    gap: space[2],
  },
  occurrence: {
    gap: space[1],
  },
  blockActions: {
    gap: space[2],
    marginTop: space[2],
  },
});
