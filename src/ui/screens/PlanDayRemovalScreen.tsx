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
  DayRemovalPreview,
  PlanImpactCommandResult,
  RemovePlanDayWithImpactInput,
} from "../../domains/plans/planImpactCommands";
import {
  AdaptiveScreen,
} from "../layout/AdaptiveScreen";
import {
  EmptyState,
  CalendarField,
  FocusablePressable,
  InlineNotice,
  PrimaryAction,
  ScreenHeader,
  SecondaryAction,
  SkeletonBlock,
} from "../components";
import {
  ImpactPreview,
} from "../components/ImpactPreview";
import {
  radius,
  sizes,
  space,
  typeScale,
  useAppTheme,
} from "../theme";

type RemovalChoice =
  | Readonly<{
      kind: "replacement_day";
      replacementDayId: string;
    }>
  | Readonly<{ kind: "remove_binding" }>
  | Readonly<{ kind: "effective_date" }>;

type LoadState = "loading" | "ready" | "error";

export type PlanDayRemovalScreenProps = Readonly<{
  planId: string;
  dayId: string;
  loadPreview(input: Readonly<{
    planId: string;
    dayId: string;
  }>): Promise<DayRemovalPreview>;
  removeDay(
    input: RemovePlanDayWithImpactInput,
  ): Promise<PlanImpactCommandResult>;
  onBack(): void;
  onSaved(planId: string): void;
  createRequestId?(): string;
  width?: number;
}>;

function errorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return null;
  }
  return typeof error.code === "string" ? error.code : null;
}

function choiceLabel(
  choice: RemovalChoice,
  preview: DayRemovalPreview,
): string {
  if (choice.kind === "replacement_day") {
    return preview.replacementDays.find(({ id }) =>
      id === choice.replacementDayId
    )?.name ?? choice.replacementDayId;
  }
  return choice.kind === "remove_binding"
    ? "No workout"
    : `No workout from ${preview.earliestEffectiveLocalDate}`;
}

function RadioChoice({
  checked,
  label,
  onPress,
}: Readonly<{
  checked: boolean;
  label: string;
  onPress(): void;
}>) {
  const { colors } = useAppTheme();
  return (
    <FocusablePressable
      accessibilityLabel={label}
      accessibilityRole="radio"
      accessibilityState={{ checked }}
      focusable
      onPress={onPress}
      style={[
        styles.radio,
        {
          backgroundColor: checked ? colors.surfaceSubtle : colors.surface,
          borderColor: checked ? colors.action : colors.divider,
        },
      ]}
    >
      <Text style={[
        typeScale.bodyStrong as TextStyle,
        { color: colors.textPrimary },
      ]}>
        {checked ? `Selected · ${label}` : label}
      </Text>
    </FocusablePressable>
  );
}

export function PlanDayRemovalScreen({
  planId,
  dayId,
  loadPreview,
  removeDay,
  onBack,
  onSaved,
  createRequestId,
  width,
}: PlanDayRemovalScreenProps) {
  const { colors } = useAppTheme();
  const requestRef = useRef<Readonly<{
    fingerprint: string;
    requestId: string;
  }> | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [retryGeneration, setRetryGeneration] = useState(0);
  const [preview, setPreview] = useState<DayRemovalPreview | null>(null);
  const [choice, setChoice] = useState<RemovalChoice | null>(null);
  const [effectiveDate, setEffectiveDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<
    "stale" | "failed" | "date" | null
  >(null);
  const adaptiveWidth = width === undefined ? {} : { width };

  useEffect(() => {
    let active = true;
    setState("loading");
    void loadPreview({ planId, dayId }).then((loaded) => {
      if (!active) {
        return;
      }
      setPreview(loaded);
      setEffectiveDate((current) =>
        current.length === 0 ? loaded.earliestEffectiveLocalDate : current
      );
      setState("ready");
    }).catch(() => {
      if (active) {
        setState("error");
      }
    });
    return () => {
      active = false;
    };
  }, [dayId, loadPreview, planId, retryGeneration]);

  const affected = useMemo(() => {
    if (preview === null) {
      return [];
    }
    const after = choice === null
      ? "Choose replacement, removal, or effective date"
      : choiceLabel(choice, preview);
    return [
      ...preview.affectedBindings.map((binding) => ({
        id: binding.id,
        label: binding.label,
        before: preview.dayName,
        after,
      })),
      ...preview.affectedDates.map((date) => ({
        id: date.id,
        label: date.label,
        before: preview.dayName,
        after,
      })),
    ];
  }, [choice, preview]);

  const commit = useCallback(async () => {
    if (preview === null || choice === null || preview.schedule === null) {
      return;
    }
    if (
      choice.kind === "effective_date"
      && !/^\d{4}-\d{2}-\d{2}$/u.test(effectiveDate)
    ) {
      setSaveError("date");
      return;
    }
    setSaving(true);
    setSaveError(null);
    const selectedChoice: RemovePlanDayWithImpactInput["choice"] =
      choice.kind === "effective_date"
        ? {
            kind: "effective_date",
            effectiveLocalDate: effectiveDate,
          }
        : choice;
    const fingerprint = JSON.stringify({
      previewToken: preview.previewToken,
      selectedChoice,
    });
    const requestId = requestRef.current?.fingerprint === fingerprint
      ? requestRef.current.requestId
      : createRequestId?.()
        ?? `plan-impact-remove:${planId}:${dayId}:${preview.previewToken.slice(-12)}`;
    requestRef.current = { fingerprint, requestId };
    try {
      await removeDay({
        requestId,
        planId,
        dayId,
        expectedPlanRevision: preview.planRevision,
        expectedScheduleRevision: preview.schedule.revision,
        previewToken: preview.previewToken,
        choice: selectedChoice,
      });
      onSaved(planId);
    } catch (error) {
      if (
        errorCode(error) === "plan_impact_preview_stale"
        || errorCode(error) === "plan_impact_schedule_invalid"
      ) {
        requestRef.current = null;
        setSaveError("stale");
        setRetryGeneration((value) => value + 1);
      } else if (errorCode(error) === "plan_impact_date_invalid") {
        setSaveError("date");
      } else {
        setSaveError("failed");
      }
    } finally {
      setSaving(false);
    }
  }, [
    choice,
    createRequestId,
    dayId,
    effectiveDate,
    onSaved,
    planId,
    preview,
    removeDay,
  ]);

  if (state === "loading") {
    return (
      <AdaptiveScreen
        primary={(
          <View style={styles.screen} testID="plan-impact-loading">
            <SkeletonBlock height={48} width="60%" />
            <SkeletonBlock height={120} />
            <SkeletonBlock height={240} />
          </View>
        )}
        {...adaptiveWidth}
      />
    );
  }

  if (state === "error" || preview === null) {
    return (
      <AdaptiveScreen
        primary={(
          <EmptyState
            body="Your plan and schedule were not changed. Try again."
            heading="Impact could not be loaded"
            primaryAction={(
              <PrimaryAction
                label="Retry"
                onPress={() => setRetryGeneration((value) => value + 1)}
              />
            )}
            secondaryAction={(
              <SecondaryAction label="Go back" onPress={onBack} />
            )}
          />
        )}
        {...adaptiveWidth}
      />
    );
  }

  const revisionLabel = `Plan revision ${preview.planRevision} · ${
    preview.schedule === null
      ? "No active schedule"
      : `Schedule revision ${preview.schedule.revision}`
  }`;

  return (
    <AdaptiveScreen
      onRequestBack={onBack}
      primary={(
        <View style={styles.screen}>
          <ScreenHeader
            backAction={onBack}
            eyebrow={preview.planName}
            title={`Remove ${preview.dayName}?`}
          />
          {preview.currentWorkoutUnaffected ? (
            <InlineNotice
              body="This change is future-facing. The saved workout snapshot remains unchanged."
              heading="Current workout is unaffected"
            />
          ) : null}
          {preview.restructuringBlocked ? (
            <InlineNotice
              body="Resume, Finish partial, or Discard before restructuring the active schedule."
              heading="Finish the current workout first"
              tone="attention"
            />
          ) : null}
          <ImpactPreview
            affected={affected}
            heading="Schedule impact"
            revisionLabel={revisionLabel}
          />
          <View accessibilityRole="radiogroup" style={styles.choices}>
            {preview.replacementDays.map((replacement) => (
              <RadioChoice
                checked={choice?.kind === "replacement_day"
                  && choice.replacementDayId === replacement.id}
                key={replacement.id}
                label={`Replace with ${replacement.name}`}
                onPress={() => {
                  setChoice({
                    kind: "replacement_day",
                    replacementDayId: replacement.id,
                  });
                  setSaveError(null);
                }}
              />
            ))}
            <RadioChoice
              checked={choice?.kind === "remove_binding"}
              label="Remove binding"
              onPress={() => {
                setChoice({ kind: "remove_binding" });
                setSaveError(null);
              }}
            />
            <RadioChoice
              checked={choice?.kind === "effective_date"}
              label="Choose effective date"
              onPress={() => {
                setChoice({ kind: "effective_date" });
                setSaveError(null);
              }}
            />
          </View>
          {choice?.kind === "effective_date" ? (
            <CalendarField
              defaultDate={preview.earliestEffectiveLocalDate}
              help={`Earliest available date: ${preview.earliestEffectiveLocalDate}`}
              label="Effective date"
              minimumDate={preview.earliestEffectiveLocalDate}
              onChange={(value) => {
                setEffectiveDate(value);
                setSaveError(null);
              }}
              value={effectiveDate}
            />
          ) : null}
          {saveError === "date" ? (
            <InlineNotice
              body={`Choose a date on or after ${preview.earliestEffectiveLocalDate}.`}
              heading="Effective date needs attention"
              tone="attention"
            />
          ) : null}
          {saveError === "stale" ? (
            <InlineNotice
              body="Impact changed. Review the current preview before trying again."
              heading="Preview refreshed"
              tone="attention"
            />
          ) : null}
          {saveError === "failed" ? (
            <InlineNotice
              body="Day could not be removed. Your choice is still here. Try again."
              heading="Remove day failed"
              tone="error"
            />
          ) : null}
          <Text style={[
            typeScale.secondary as TextStyle,
            { color: colors.textSecondary },
          ]}>
            Existing opportunities, sessions, and history are unchanged.
          </Text>
          <PrimaryAction
            busy={saving}
            disabled={choice === null || preview.restructuringBlocked}
            label="Remove day"
            onPress={() => {
              void commit();
            }}
          />
        </View>
      )}
      {...adaptiveWidth}
    />
  );
}

const styles = StyleSheet.create({
  screen: {
    gap: space[4],
  },
  choices: {
    gap: space[2],
  },
  radio: {
    borderRadius: radius.standard,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: "center",
    minHeight: sizes.minimumTarget,
    paddingHorizontal: space[4],
    paddingVertical: space[2],
  },
});
