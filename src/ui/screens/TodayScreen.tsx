import React, {
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
  ActivatedPlanDay,
} from "../../domains/plans";
import type {
  TodayExercise,
  TodayView,
} from "../../domains/workout";
import type {
  ProgressRecommendationReview,
} from "../../domains/progress";
import type {
  ScheduleTodayAction,
  ScheduleTodayPresentation,
} from "../../bootstrap/scheduleRuntime";
import type {
  ScheduleTimeZoneChoice,
} from "../../domains/scheduling/scheduleState";
import type {
  LaunchFailure,
} from "../../bootstrap/launchCoordinator";
import {
  AppearanceSheet,
  ConfirmationSheet,
  ExerciseRow,
  ContentCard,
  IconAction,
  InlineNotice,
  PlanActivationRow,
  PrimaryAction,
  RestAlertSettingsSheet,
  ScreenHeader,
  SecondaryAction,
  SectionHeader,
  SkeletonBlock,
} from "../components";
import { WorkoutStartSheet } from "../components/WorkoutStartSheet";
import type {
  RestAlertPreferences,
  RestNotificationPermission,
} from "../../domains/rest";
import type {
  RestAlertPreferenceSaveResult,
} from "../../bootstrap/workoutAppRuntime";
import { AdaptiveScreen } from "../layout/AdaptiveScreen";
import { RootFailureState } from "./RootFailureState";
import {
  space,
  typeScale,
  useAppTheme,
} from "../theme";
import type { LaunchState } from "./RootScreens";

const noOp = () => undefined;

export type TodayScreenProps = Readonly<{
  launchState: LaunchState;
  view?: TodayView;
  planDays?: readonly ActivatedPlanDay[];
  failure?: LaunchFailure;
  actionFailure?: Readonly<{
    code: "workout_action_failed";
    correlationCode: "GT-ACTION01";
  }>;
  width?: number;
  onActivatePlan?: () => void;
  onResumeWorkout?: (sessionId: string, expectedRevision?: number) => void;
  onReviewSuggestion?: (exerciseId: string) => void;
  pendingRecommendations?: readonly ProgressRecommendationReview[];
  onStartEmpty?: (advanceRotation?: boolean) => void;
  onStartPlanDay?: (
    dayId: string,
    mode: "scheduled" | "alternate" | "rest_day",
    advanceRotation?: boolean,
  ) => void;
  scheduleToday?: ScheduleTodayPresentation;
  actOnSchedule?: (action: ScheduleTodayAction) => void | Promise<void>;
  chooseScheduleTimeZone?: (
    choice: ScheduleTimeZoneChoice,
  ) => void | Promise<void>;
  onWeekdaySkip?: () => void | Promise<void>;
  restAlertPreferences?: RestAlertPreferences;
  restAlertPreferencesLoading?: boolean;
  notificationPermission?: RestNotificationPermission;
  onReadRestAlertPreferences?: () => void | Promise<void>;
  onChangeRestAlertPreferences?: (
    preferences: RestAlertPreferences,
  ) => void | Promise<void | RestAlertPreferenceSaveResult>;
  onOpenRestNotificationSettings?: () => void | Promise<void>;
  onOpenMore?: () => void;
  onRetry?: () => void;
}>;

function TodaySkeleton() {
  return (
    <View style={styles.skeletonLayout}>
      <SkeletonBlock
        height={34}
        testID="today-skeleton-title"
        width="58%"
      />
      <SkeletonBlock
        height={22}
        testID="today-skeleton-metadata"
        width="72%"
      />
      <SkeletonBlock height={56} testID="today-skeleton-action" />
      <SkeletonBlock height={64} testID="today-skeleton-exercise-1" />
      <SkeletonBlock height={64} testID="today-skeleton-exercise-2" />
      <SkeletonBlock height={64} testID="today-skeleton-exercise-3" />
    </View>
  );
}

function ActivationContent({
  preview,
  onPreview,
  onActivate,
}: Readonly<{
  preview: boolean;
  onPreview: () => void;
  onActivate: () => void;
}>) {
  const { colors } = useAppTheme();

  if (preview) {
    return (
      <ContentCard style={styles.section} testID="today-activation-card">
        <SectionHeader
          supportingText="Activation creates a personal copy and starts its schedule. Bundled content stays unchanged."
          title="Your Full Body Foundation copy"
          tone="card"
        />
        <Text
          style={[
            typeScale.body as TextStyle,
            { color: colors.contentCardTextSecondary },
          ]}
        >
          First day · Back Squat, Bench Press, Lat Pulldown, Romanian Deadlift,
          and Plank
        </Text>
        <PrimaryAction
          label="Activate Full Body Foundation"
          onPress={onActivate}
        />
      </ContentCard>
    );
  }

  return (
    <ContentCard style={styles.section} testID="today-activation-card">
      <SectionHeader
        supportingText="One reviewed plan is available in Phase 1."
        title="Choose your starting plan"
        tone="card"
      />
      <PlanActivationRow onPress={onPreview} tone="card" />
      <Text
        style={[
          typeScale.body as TextStyle,
          { color: colors.contentCardTextSecondary },
        ]}
      >
        Barbell, cable machine, dumbbells, and bodyweight · First day starts
        with Back Squat
      </Text>
      <PrimaryAction
        label="Use Full Body Foundation"
        onPress={onPreview}
      />
    </ContentCard>
  );
}

function historyText(exercise: TodayExercise): string {
  if (exercise.history === null) {
    return "First recorded session";
  }
  return exercise.history.change === null
    ? exercise.history.summary
    : `${exercise.history.summary} · ${exercise.history.change}`;
}

function ScheduledContent({
  view,
  planDays,
  onStart,
  onStartEmpty,
  onReviewSuggestion,
  pendingRecommendations,
  scheduleToday,
  onScheduleAction,
  onWeekdaySkip,
}: Readonly<{
  view: Extract<TodayView, { state: "scheduled" }>;
  planDays: readonly ActivatedPlanDay[];
  onStart: (
    dayId: string,
    mode: "scheduled" | "alternate",
    advanceRotation: boolean,
  ) => void;
  onStartEmpty: (advanceRotation: boolean) => void;
  onReviewSuggestion: (exerciseId: string) => void;
  pendingRecommendations: readonly ProgressRecommendationReview[];
  scheduleToday?: ScheduleTodayPresentation;
  onScheduleAction(action: ScheduleTodayAction): void;
  onWeekdaySkip(): void;
}>) {
  const [startSheetVisible, setStartSheetVisible] = useState(false);
  const { colors } = useAppTheme();
  const startSheetActionRef = useRef<View>(null);

  return (
    <>
      <ContentCard style={styles.section} testID="today-workout-card">
        <Text
          style={[
            typeScale.label as TextStyle,
            { color: colors.contentCardTextSecondary },
          ]}
        >
          PLANNED WORKOUT
        </Text>
        <SectionHeader
          supportingText={`${view.exercises.length} exercises · about ${view.estimateMinutes} min`}
          title={view.dayName}
          tone="card"
        />
        <PrimaryAction
          label={`Start ${view.dayName}`}
          onPress={() => onStart(view.dayId, "scheduled", false)}
        />
        <SecondaryAction
          label="Choose another day"
          onPress={() => setStartSheetVisible(true)}
          ref={startSheetActionRef}
        />
        {scheduleToday?.mode === "rotation" ? (
          <View style={styles.scheduleActions}>
            <SecondaryAction
              label="Repeat"
              onPress={() => onScheduleAction("repeat")}
            />
            <SecondaryAction
              label="Skip"
              onPress={() => onScheduleAction("skip")}
            />
            <SecondaryAction
              label="Advance"
              onPress={() => onScheduleAction("advance")}
            />
          </View>
        ) : scheduleToday?.mode === "weekday" ? (
          <View style={styles.section}>
            <SecondaryAction label="Skip" onPress={onWeekdaySkip} />
            <Text style={[
              typeScale.secondary as TextStyle,
              { color: colors.contentCardTextSecondary },
            ]}>
              Skip applies to this local date only. The recurring Weekday
              binding stays unchanged.
            </Text>
          </View>
        ) : null}
      </ContentCard>
      <View style={styles.section}>
        <Text
          style={[
            typeScale.label as TextStyle,
            { color: colors.textSecondary },
          ]}
        >
          TODAY IN CONTEXT
        </Text>
        {view.exercises.map((exercise) => (
          <ContentCard
            key={exercise.exerciseId}
            style={styles.exerciseGroup}
            testID={`today-exercise-card-${exercise.exerciseId}`}
          >
            <ExerciseRow
              history={historyText(exercise)}
              name={exercise.name}
              nextTarget={exercise.nextTarget}
              recommendationState={
                exercise.recommendationStatus === "pending"
                  ? "Suggestion pending"
                  : "No suggestion pending"
              }
              tone="card"
            />
            {exercise.recommendationStatus === "pending" ? (
              <SecondaryAction
                label={`Review suggestion for ${exercise.name}`}
                onPress={() => onReviewSuggestion(exercise.exerciseId)}
              />
            ) : null}
            {pendingRecommendations.find(({
              exerciseId,
              lifecycle,
            }) => exerciseId === exercise.exerciseId && lifecycle === "pending")
              === undefined
              ? null
              : (
                  <Text
                    accessibilityLabel={`Pending target review for ${exercise.name}`}
                    style={[
                      typeScale.secondary as TextStyle,
                      { color: colors.contentCardTextSecondary },
                    ]}
                  >
                    Pending target review · current target above remains active
                  </Text>
                )}
          </ContentCard>
        ))}
      </View>
      <WorkoutStartSheet
        onClose={() => setStartSheetVisible(false)}
        allowRotationAdvance={scheduleToday?.mode === "rotation"}
        onStartDay={(dayId, advanceRotation) => {
          onStart(
            dayId,
            dayId === view.dayId ? "scheduled" : "alternate",
            dayId === view.dayId ? false : advanceRotation,
          );
        }}
        onStartEmpty={onStartEmpty}
        planDays={planDays}
        restoreFocusRef={startSheetActionRef}
        scheduledDayId={view.dayId}
        visible={startSheetVisible}
      />
    </>
  );
}

function RestDayContent({
  view,
  planDays,
  onStart,
  onStartEmpty,
  scheduleToday,
}: Readonly<{
  view: Extract<TodayView, { state: "rest_day" }>;
  planDays: readonly ActivatedPlanDay[];
  onStart: (
    dayId: string,
    mode: "rest_day" | "alternate",
    advanceRotation: boolean,
  ) => void;
  onStartEmpty: (advanceRotation: boolean) => void;
  scheduleToday?: ScheduleTodayPresentation;
}>) {
  const [startSheetVisible, setStartSheetVisible] = useState(false);
  const startSheetActionRef = useRef<View>(null);

  return (
    <>
      <ContentCard style={styles.section} testID="today-rest-day-card">
        <SectionHeader
          supportingText={`Next scheduled workout · ${view.nextDayName} · ${view.nextLocalDate}`}
          title="Rest day"
          tone="card"
        />
        <PrimaryAction
          label="Train anyway"
          onPress={() => setStartSheetVisible(true)}
          ref={startSheetActionRef}
        />
      </ContentCard>
      <WorkoutStartSheet
        allowRotationAdvance={scheduleToday?.mode === "rotation"}
        onClose={() => setStartSheetVisible(false)}
        onStartDay={(dayId, advanceRotation) => {
          onStart(
            dayId,
            dayId === view.nextDayId ? "rest_day" : "alternate",
            advanceRotation,
          );
        }}
        onStartEmpty={onStartEmpty}
        planDays={planDays}
        restoreFocusRef={startSheetActionRef}
        scheduledDayId={view.nextDayId}
        visible={startSheetVisible}
      />
    </>
  );
}

function activeWorkoutBody(
  view: Extract<TodayView, { state: "active_workout" }>,
): string {
  const context = [view.exerciseName, view.setLabel]
    .filter((value): value is string => value !== null)
    .join(" · ");
  const rest = `Rest ${view.restStatus}`;
  return context.length === 0 ? rest : `${context} · ${rest}`;
}

export function TodayScreen({
  launchState,
  view,
  planDays = [],
  failure,
  actionFailure,
  width,
  onActivatePlan = noOp,
  onResumeWorkout = noOp,
  onReviewSuggestion = noOp,
  pendingRecommendations = [],
  onStartEmpty = noOp,
  onStartPlanDay = noOp,
  scheduleToday,
  actOnSchedule = noOp,
  chooseScheduleTimeZone = noOp,
  onWeekdaySkip = noOp,
  restAlertPreferences = { soundEnabled: true, vibrationEnabled: true },
  restAlertPreferencesLoading = false,
  notificationPermission = "undetermined",
  onReadRestAlertPreferences = noOp,
  onChangeRestAlertPreferences = async (preferences) => ({
    status: "persisted" as const,
    preferences,
  }),
  onOpenRestNotificationSettings = noOp,
  onOpenMore = noOp,
  onRetry = noOp,
}: TodayScreenProps) {
  const [appearanceVisible, setAppearanceVisible] = useState(false);
  const [restAlertSettingsVisible, setRestAlertSettingsVisible] = useState(false);
  const [activationPreview, setActivationPreview] = useState(false);
  const [scheduleAction, setScheduleAction] =
    useState<ScheduleTodayAction | null>(null);
  const moreActionRef = useRef<View>(null);
  const trusted = launchState === "trusted";
  const adaptiveWidth = width === undefined ? {} : { width };

  let content: React.ReactNode;
  if (launchState === "failed") {
    content = (
      <RootFailureState
        failure={failure ?? {
          category: "storage",
          code: "launch_firstTrustedQuery_failed",
          correlationCode: "GT-QUERY001",
          retryable: true,
        }}
        onRetry={onRetry}
      />
    );
  } else if (!trusted || view === undefined) {
    content = <TodaySkeleton />;
  } else {
    switch (view.state) {
      case "no_active_plan":
        content = (
          <ActivationContent
            onActivate={onActivatePlan}
            onPreview={() => setActivationPreview(true)}
            preview={activationPreview}
          />
        );
        break;
      case "scheduled":
        content = (
          <ScheduledContent
            onReviewSuggestion={onReviewSuggestion}
            pendingRecommendations={pendingRecommendations}
            onScheduleAction={setScheduleAction}
            onWeekdaySkip={() => {
              void onWeekdaySkip();
            }}
            onStart={(dayId, mode, advanceRotation) => {
              if (scheduleToday?.mode === "rotation") {
                onStartPlanDay(dayId, mode, advanceRotation);
                return;
              }
              onStartPlanDay(dayId, mode);
            }}
            onStartEmpty={(advanceRotation) => onStartEmpty(advanceRotation)}
            planDays={planDays}
            {...(scheduleToday === undefined ? {} : { scheduleToday })}
            view={view}
          />
        );
        break;
      case "rest_day":
        content = (
          <RestDayContent
            onStart={(dayId, mode, advanceRotation) => {
              if (scheduleToday?.mode === "rotation") {
                onStartPlanDay(dayId, mode, advanceRotation);
                return;
              }
              onStartPlanDay(dayId, mode);
            }}
            onStartEmpty={(advanceRotation) => onStartEmpty(advanceRotation)}
            planDays={planDays}
            {...(scheduleToday === undefined ? {} : { scheduleToday })}
            view={view}
          />
        );
        break;
      case "active_workout":
        content = (
          <InlineNotice
            action={
              <PrimaryAction
                label="Resume workout"
                onPress={() => onResumeWorkout(view.sessionId)}
              />
            }
            body={activeWorkoutBody(view)}
            heading="Workout in progress"
            tone="attention"
          />
        );
        break;
      case "saved_partial":
        content = (
          <InlineNotice
            action={
              <PrimaryAction
                label="Resume workout"
                onPress={() => onResumeWorkout(
                  view.sessionId,
                  view.revision,
                )}
              />
            }
            body={[
              view.exerciseName,
              view.setLabel,
              `${view.completedWorkingSets}/${view.totalWorkingSets} working sets`,
            ].filter(Boolean).join(" · ")}
            heading="Workout saved as partial"
            tone="neutral"
          />
        );
        break;
    }
  }

  return (
    <>
      <AdaptiveScreen
        {...adaptiveWidth}
        primary={
          <>
            <ScreenHeader
              action={
                <IconAction
                  accessibilityHint={trusted
                    ? "Opens appearance and rest-alert settings"
                    : "Unavailable while workout data is prepared"}
                  accessibilityLabel="Appearance and rest-alert settings"
                  disabled={!trusted}
                  icon="more"
                  onPress={() => {
                    setRestAlertSettingsVisible(true);
                    void onReadRestAlertPreferences();
                  }}
                  ref={moreActionRef}
                />
              }
              title="Today"
            />
            {trusted ? (
              <SecondaryAction
                label="More"
                onPress={onOpenMore}
              />
            ) : null}
            {actionFailure === undefined ? null : (
              <InlineNotice
                action={
                  <SecondaryAction
                    label="Retry Today action"
                    onPress={onRetry}
                  />
                }
                body={`Your saved data was not changed. ${actionFailure.correlationCode}`}
                heading="Workout action was not saved"
                tone="error"
              />
            )}
            {scheduleToday?.missedLabel === null
                || scheduleToday?.missedLabel === undefined
              ? null
              : (
                  <InlineNotice
                    body="This earlier weekday remains a historical plan fact. It did not carry forward or block today."
                    heading={scheduleToday.missedLabel}
                  />
                )}
            {scheduleToday?.timezonePrompt === null
                || scheduleToday?.timezonePrompt === undefined
              ? null
              : (
                  <InlineNotice
                    action={
                      <View style={styles.timeZoneActions}>
                        <SecondaryAction
                          label="Follow device timezone from today"
                          onPress={() => {
                            void chooseScheduleTimeZone(
                              "Follow device timezone from today",
                            );
                          }}
                        />
                        <SecondaryAction
                          label="Keep current timezone"
                          onPress={() => {
                            void chooseScheduleTimeZone(
                              "Keep current timezone",
                            );
                          }}
                        />
                      </View>
                    }
                    body={[
                      `Stored timezone: ${scheduleToday.timezonePrompt.storedTimeZone}.`,
                      `Device timezone: ${scheduleToday.timezonePrompt.deviceTimeZone}.`,
                      "Either choice applies prospectively. Prior local dates remain unchanged.",
                    ].join(" ")}
                    heading="Device timezone changed"
                    tone="attention"
                  />
                )}
            {content}
          </>
        }
      />
      <RestAlertSettingsSheet
        loading={restAlertPreferencesLoading}
        notificationPermission={notificationPermission}
        onChange={onChangeRestAlertPreferences}
        onClose={() => setRestAlertSettingsVisible(false)}
        onOpenAppearance={() => {
          setRestAlertSettingsVisible(false);
          setAppearanceVisible(true);
        }}
        onOpenNotificationSettings={onOpenRestNotificationSettings}
        preferences={restAlertPreferences}
        restoreFocusRef={moreActionRef}
        visible={restAlertSettingsVisible}
      />
      <AppearanceSheet
        onClose={() => setAppearanceVisible(false)}
        restoreFocusRef={moreActionRef}
        visible={appearanceVisible}
      />
      <ConfirmationSheet
        body={[
          `${scheduleToday?.currentDayName ?? "Current day"} remains the current plan fact until this action commits.`,
          `${scheduleAction === "repeat"
            ? scheduleToday?.currentDayName ?? "Current day"
            : scheduleToday?.nextDayName ?? "Next day"} will be next.`,
        ].join(" ")}
        cancelLabel="Keep current schedule"
        confirmLabel={scheduleAction === null
          ? "Confirm"
          : scheduleAction[0]!.toUpperCase() + scheduleAction.slice(1)}
        heading={scheduleAction === null
          ? "Review schedule action"
          : `${
              scheduleAction[0]!.toUpperCase() + scheduleAction.slice(1)
            } ${scheduleToday?.currentDayName ?? "current day"}?`}
        onCancel={() => setScheduleAction(null)}
        onConfirm={() => {
          if (scheduleAction !== null) {
            void actOnSchedule(scheduleAction);
          }
          setScheduleAction(null);
        }}
        visible={scheduleAction !== null}
      />
    </>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: space[4],
  },
  skeletonLayout: {
    gap: space[4],
  },
  exerciseGroup: {
    gap: space[2],
  },
  scheduleActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space[2],
  },
  timeZoneActions: {
    gap: space[2],
  },
});
