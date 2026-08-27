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
  ScheduleEditorRotationBinding,
  ScheduleEditorSnapshot,
  ScheduleEditorVersion,
  ScheduleEditorWeekdayBinding,
  ScheduleSaveDraft,
} from "../../bootstrap/scheduleRuntime";
import {
  parseLocalDate,
} from "../../domains/scheduling/localDate";
import {
  parseStoredTimeZone,
} from "../../domains/scheduling/timeZone";
import type {
  ScheduleOverrideSelection,
} from "../../domains/scheduling/scheduleState";
import {
  ConfirmationSheet,
  CalendarField,
  EmptyState,
  InlineNotice,
  PrimaryAction,
  ScheduleBindingEditor,
  ScheduleModeSelector,
  ScreenHeader,
  SecondaryAction,
  SectionHeader,
  SkeletonBlock,
} from "../components";
import {
  PlanEditorTextField,
} from "../components/PlanEditorFields";
import {
  AdaptiveScreen,
} from "../layout/AdaptiveScreen";
import {
  space,
  typeScale,
  useAppTheme,
} from "../theme";

export type ScheduleEditorScreenProps = Readonly<{
  planId: string;
  loadSchedule(planId: string): Promise<ScheduleEditorSnapshot | null>;
  saveSchedule(input: ScheduleSaveDraft): Promise<ScheduleEditorSnapshot>;
  setDateOverride?(input: Readonly<{
    localDate: string;
    replacement: ScheduleOverrideSelection;
    confirmation?: "replace_pending_override";
  }>): Promise<ScheduleEditorSnapshot>;
  onBack(): void;
  onSaved(planId: string): void;
  width?: number;
}>;

type DraftState = Readonly<{
  effectiveLocalDate: string;
  timeZone: string;
  mode: "weekday" | "rotation";
  weekdayBindings: readonly ScheduleEditorWeekdayBinding[];
  rotationBindings: readonly ScheduleEditorRotationBinding[];
}>;

function isWeekdayBinding(
  binding: ScheduleEditorVersion["bindings"][number],
): binding is ScheduleEditorWeekdayBinding {
  return "weekday" in binding && "weekIndex" in binding;
}

function initialDraft(snapshot: ScheduleEditorSnapshot): DraftState {
  const current = snapshot.current;
  const weekdayBindings = current?.mode === "weekday"
    ? current.bindings.filter(isWeekdayBinding).map((binding) => ({
        ordinal: binding.ordinal,
        weekIndex: binding.weekIndex,
        weekday: binding.weekday,
        planDayId: binding.planDayId,
      }))
    : snapshot.days.map((day, ordinal) => ({
        ordinal,
        weekIndex: 0,
        weekday: (
          ["Monday", "Wednesday", "Friday", "Tuesday", "Thursday"] as const
        )[ordinal % 5]!,
        planDayId: day.id,
      }));
  const rotationBindings = current?.mode === "rotation"
    ? current.bindings.map((binding, ordinal) => ({
        ordinal,
        planDayId: binding.planDayId,
      }))
    : snapshot.days.map((day, ordinal) => ({
        ordinal,
        planDayId: day.id,
      }));
  return {
    effectiveLocalDate: snapshot.todayLocalDate,
    timeZone: current?.timeZone ?? snapshot.deviceTimeZone,
    mode: current?.mode ?? "weekday",
    weekdayBindings,
    rotationBindings,
  };
}

function bindingLabel(
  version: ScheduleEditorVersion,
  snapshot: ScheduleEditorSnapshot,
): readonly string[] {
  const names = new Map(snapshot.days.map(({ id, name }) => [id, name]));
  return version.bindings.map((binding, index) => {
    const name = names.get(binding.planDayId) ?? binding.planDayId;
    return isWeekdayBinding(binding)
      ? `${binding.weekday} · ${name}`
      : `${index + 1}. ${name}`;
  });
}

function draftInput(draft: DraftState): ScheduleSaveDraft["next"] {
  if (draft.mode === "weekday") {
    return {
      effectiveLocalDate: draft.effectiveLocalDate,
      mode: draft.mode,
      timeZone: draft.timeZone,
      bindings: draft.weekdayBindings,
    };
  }
  return {
    effectiveLocalDate: draft.effectiveLocalDate,
    mode: draft.mode,
    timeZone: draft.timeZone,
    bindings: draft.rotationBindings,
  };
}

function validationMessage(
  snapshot: ScheduleEditorSnapshot,
  draft: DraftState,
): string | null {
  if (snapshot.graphStatus !== "valid") {
    return snapshot.missingRequirement
      ?? "Add at least one exercise with valid targets before scheduling this plan.";
  }
  try {
    parseLocalDate(draft.effectiveLocalDate);
    parseStoredTimeZone(draft.timeZone);
  } catch {
    return "Enter a valid effective date and stored timezone.";
  }
  const bindings = draft.mode === "weekday"
    ? draft.weekdayBindings
    : draft.rotationBindings;
  if (bindings.length === 0) {
    return draft.mode === "weekday"
      ? "Add at least one weekday binding."
      : "Add at least one rotation day.";
  }
  if (draft.mode === "weekday") {
    const slots = new Set<string>();
    for (const binding of draft.weekdayBindings) {
      const slot = `${binding.weekIndex}:${binding.weekday}`;
      if (slots.has(slot)) {
        return "Each Weekday slot can contain only one plan day.";
      }
      slots.add(slot);
    }
  }
  return null;
}

function overrideLabel(
  selection: ScheduleOverrideSelection,
  days: ScheduleEditorSnapshot["days"],
): string {
  if (selection.kind === "plan_day") {
    return days.find(({ id }) => id === selection.planDayId)?.name
      ?? "Plan day";
  }
  return selection.kind === "rest_day" ? "Rest day" : "Skip";
}

function ScheduleVersionSummary({
  title,
  version,
  snapshot,
}: Readonly<{
  title: string;
  version: ScheduleEditorVersion;
  snapshot: ScheduleEditorSnapshot;
}>) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.section}>
      <SectionHeader title={title} />
      <Text style={[
        typeScale.bodyStrong as TextStyle,
        { color: colors.textPrimary },
      ]}>
        {`${version.mode === "weekday" ? "Weekday" : "Rotation"} · ${version.timeZone}`}
      </Text>
      <Text style={[
        typeScale.secondary as TextStyle,
        { color: colors.textSecondary },
      ]}>
        {`Effective ${version.effectiveLocalDate}`}
      </Text>
      {bindingLabel(version, snapshot).map((label, index) => (
        <Text
          key={`${label}:${index}`}
          style={[
            typeScale.body as TextStyle,
            { color: colors.textPrimary },
          ]}
        >
          {label}
        </Text>
      ))}
    </View>
  );
}

export function ScheduleEditorScreen({
  planId,
  loadSchedule,
  saveSchedule,
  setDateOverride,
  onBack,
  onSaved,
  width,
}: ScheduleEditorScreenProps) {
  const { colors } = useAppTheme();
  const [retryGeneration, setRetryGeneration] = useState(0);
  const [snapshot, setSnapshot] = useState<ScheduleEditorSnapshot | null>();
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [overrideReplacement, setOverrideReplacement] =
    useState<ScheduleOverrideSelection | null>(null);
  const saveActionRef = useRef<View>(null);

  useEffect(() => {
    let active = true;
    setSnapshot(undefined);
    setLoadFailed(false);
    void loadSchedule(planId).then((loaded) => {
      if (!active) {
        return;
      }
      setSnapshot(loaded);
      setDraft(loaded === null ? null : initialDraft(loaded));
    }).catch(() => {
      if (active) {
        setSnapshot(null);
        setDraft(null);
        setLoadFailed(true);
      }
    });
    return () => {
      active = false;
    };
  }, [loadSchedule, planId, retryGeneration]);

  const error = useMemo(
    () => (
      snapshot === undefined || snapshot === null || draft === null
        ? null
        : validationMessage(snapshot, draft)
    ),
    [draft, snapshot],
  );

  if (snapshot === undefined) {
    return (
      <AdaptiveScreen
        primary={
          <>
            <ScreenHeader backAction={onBack} title="Edit schedule" />
            <View style={styles.section} testID="schedule-editor-loading">
              <SkeletonBlock height={34} width="48%" />
              <SkeletonBlock height={48} />
              <SkeletonBlock height={48} />
              <SkeletonBlock height={56} />
            </View>
          </>
        }
        testID="schedule-editor"
        {...(width === undefined ? {} : { width })}
      />
    );
  }

  if (snapshot === null || draft === null) {
    return (
      <AdaptiveScreen
        primary={
          <>
            <ScreenHeader backAction={onBack} title="Edit schedule" />
            <EmptyState
              body={loadFailed
                ? "Schedule could not be loaded. Your plan and schedule were not changed."
                : "This plan is not available for scheduling."}
              heading="Schedule could not be loaded"
              primaryAction={
                <PrimaryAction
                  label="Retry schedule"
                  onPress={() => setRetryGeneration((value) => value + 1)}
                />
              }
            />
          </>
        }
        testID="schedule-editor"
        {...(width === undefined ? {} : { width })}
      />
    );
  }

  const loadedSnapshot = snapshot;
  const after = draftInput(draft);
  const currentOverride = loadedSnapshot.dateOverride;
  const currentOverrideLabel = currentOverride === null
      || currentOverride === undefined
    ? null
    : currentOverride.state === "consumed"
      ? "Used"
      : overrideLabel(currentOverride.selection, loadedSnapshot.days);

  async function commitOverride() {
    if (setDateOverride === undefined || overrideReplacement === null) {
      return;
    }
    const saved = await setDateOverride({
      localDate: loadedSnapshot.todayLocalDate,
      replacement: overrideReplacement,
      ...(loadedSnapshot.dateOverride?.state === "pending"
        ? { confirmation: "replace_pending_override" as const }
        : {}),
    });
    setSnapshot(saved);
    setDraft(initialDraft(saved));
    setOverrideReplacement(null);
  }

  async function confirmSave() {
    if (
      draft === null
      || error !== null
    ) {
      return;
    }
    setBusy(true);
    setSaveFailed(false);
    try {
      const saved = await saveSchedule({
        planId: loadedSnapshot.planId,
        scheduleId: loadedSnapshot.scheduleId,
        expectedPlanRevision: loadedSnapshot.planRevision,
        expectedScheduleRevision: loadedSnapshot.scheduleRevision,
        expectedActivePair: loadedSnapshot.activeSchedule,
        before: loadedSnapshot.current,
        todayLocalDate: loadedSnapshot.todayLocalDate,
        next: after,
      });
      setSnapshot(saved);
      setDraft(initialDraft(saved));
      setConfirmVisible(false);
      onSaved(saved.planId);
    } catch {
      setSaveFailed(true);
      setConfirmVisible(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <AdaptiveScreen
        primary={
          <>
            <ScreenHeader backAction={onBack} title="Edit schedule" />
            {saveFailed ? (
              <InlineNotice
                action={
                  <SecondaryAction
                    label="Retry"
                    onPress={() => setConfirmVisible(true)}
                  />
                }
                body="Schedule could not be saved. Your edits are still here. Try again."
                heading="Schedule could not be saved"
                tone="error"
              />
            ) : null}
            {loadedSnapshot.current === null ? (
              <InlineNotice
                body="Choose a mode and bindings. Nothing is scheduled until Save schedule commits."
                heading="Set up this schedule"
              />
            ) : (
              <ScheduleVersionSummary
                snapshot={snapshot}
                title="Before"
                version={loadedSnapshot.current}
              />
            )}
            <View style={styles.section}>
              <SectionHeader title="Date override" />
              <Text style={[
                typeScale.bodyStrong as TextStyle,
                { color: colors.textPrimary },
              ]}>
                {currentOverrideLabel ?? "No override"}
              </Text>
              {currentOverride?.state === "consumed"
                  || setDateOverride === undefined
                ? null
                : (
                    <>
                      {loadedSnapshot.days.map((day) => (
                        <SecondaryAction
                          key={day.id}
                          label={`Override with ${day.name}`}
                          onPress={() => setOverrideReplacement({
                            kind: "plan_day",
                            planDayId: day.id,
                          })}
                        />
                      ))}
                      <SecondaryAction
                        label="Override with Rest day"
                        onPress={() => setOverrideReplacement({
                          kind: "rest_day",
                        })}
                      />
                      <SecondaryAction
                        label="Override with Skip"
                        onPress={() => setOverrideReplacement({
                          kind: "skip",
                        })}
                      />
                    </>
                  )}
            </View>
            <View style={styles.section}>
              <SectionHeader title="After" />
              <CalendarField
                defaultDate={loadedSnapshot.todayLocalDate}
                help="Defaults to today and applies prospectively."
                label="Effective date"
                minimumDate={loadedSnapshot.todayLocalDate}
                onChange={(effectiveLocalDate) =>
                  setDraft((current) => (
                    current === null
                      ? current
                      : { ...current, effectiveLocalDate }
                  ))}
                value={draft.effectiveLocalDate}
                {...(error?.includes("effective date")
                  ? { error }
                  : {})}
              />
              <PlanEditorTextField
                error={error?.includes("timezone") ? error : undefined}
                help="Weekday intent is resolved in this stored timezone."
                label="Schedule timezone"
                onChangeText={(timeZone) =>
                  setDraft((current) => (
                    current === null ? current : { ...current, timeZone }
                  ))}
                value={draft.timeZone}
              />
              <ScheduleModeSelector
                mode={draft.mode}
                onChange={(mode) =>
                  setDraft((current) => (
                    current === null ? current : { ...current, mode }
                  ))}
              />
              <ScheduleBindingEditor
                days={loadedSnapshot.days}
                mode={draft.mode}
                onRotationBindings={(rotationBindings) =>
                  setDraft((current) => (
                    current === null
                      ? current
                      : { ...current, rotationBindings }
                  ))}
                onWeekdayBindings={(weekdayBindings) =>
                  setDraft((current) => (
                    current === null
                      ? current
                      : { ...current, weekdayBindings }
                  ))}
                rotationBindings={draft.rotationBindings}
                weekdayBindings={draft.weekdayBindings}
              />
              {error === null ? null : (
                <InlineNotice
                  body={error}
                  heading="Schedule draft needs attention"
                  tone="attention"
                />
              )}
              <Text style={[
                typeScale.body as TextStyle,
                { color: colors.textSecondary },
              ]}>
                This change applies from the selected effective date. Earlier
                dates, sessions, planned opportunities, and history will not
                change.
              </Text>
              <PrimaryAction
                busy={busy}
                disabled={error !== null}
                label="Save schedule"
                onPress={() => setConfirmVisible(true)}
                ref={saveActionRef}
              />
            </View>
          </>
        }
        testID="schedule-editor"
        {...(width === undefined ? {} : { width })}
      />
      <ConfirmationSheet
        body={[
          `${loadedSnapshot.planName} will use ${
            after.mode === "weekday" ? "Weekday" : "Rotation"
          } from ${after.effectiveLocalDate} in ${after.timeZone}.`,
          loadedSnapshot.scheduleLifecycle === "active"
            ? null
            : "Your current active plan and schedule will be retained and marked inactive.",
          "This change applies from the selected effective date. Earlier dates, sessions, planned opportunities, and history will not change.",
        ].filter((value): value is string => value !== null).join(" ")}
        cancelLabel="Keep editing"
        confirmLabel="Save schedule"
        heading="Save this schedule?"
        onCancel={() => setConfirmVisible(false)}
        onConfirm={() => {
          void confirmSave();
        }}
        restoreFocusRef={saveActionRef}
        visible={confirmVisible}
      />
      <ConfirmationSheet
        body={[
          loadedSnapshot.dateOverride?.selection.kind === "rest_day"
            ? "Rest day"
            : loadedSnapshot.dateOverride?.selection.kind === "skip"
              ? "Skip"
              : "Current plan day",
          overrideReplacement?.kind === "plan_day"
            ? loadedSnapshot.days.find(({ id }) =>
                id === overrideReplacement.planDayId
              )?.name ?? overrideReplacement.planDayId
            : overrideReplacement?.kind === "rest_day"
              ? "Rest day"
              : "Skip",
        ].join(" → ")}
        cancelLabel="Keep current override"
        confirmLabel={currentOverride?.state === "pending"
          ? "Replace override"
          : "Save override"}
        heading={currentOverride?.state === "pending"
          ? "Replace this date override?"
          : "Set this date override?"}
        onCancel={() => setOverrideReplacement(null)}
        onConfirm={() => {
          void commitOverride();
        }}
        visible={overrideReplacement !== null}
      />
    </>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: space[2],
  },
});
