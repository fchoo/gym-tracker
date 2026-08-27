import Constants from "expo-constants";
import {
  Redirect,
  router,
  useLocalSearchParams,
} from "expo-router";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  applyPhase1NotificationTestControl,
  type Phase1NotificationTestAction,
  type Phase1NotificationTestResult,
} from "../src/bootstrap/phase1NotificationTestControls";
import {
  useWorkoutAppRuntime,
} from "../src/bootstrap/workoutAppRuntime";
import {
  applyWorkoutMutationTestControl,
  isWorkoutMutationTestAction,
  type WorkoutMutationTestAction,
  type WorkoutMutationTestResult,
} from "../src/bootstrap/workoutMutationTestControls";
import {
  AdaptiveScreen,
} from "../src/ui/layout/AdaptiveScreen";
import {
  EmptyState,
  PrimaryAction,
  ScreenHeader,
  SecondaryAction,
  SkeletonBlock,
} from "../src/ui/components";

const actions = [
  ["set_sound_vibration", "Sound and vibration"],
  ["set_sound_only", "Sound only"],
  ["set_vibration_only", "Vibration only"],
  ["set_silent", "Silent"],
  ["foreground_expiry", "Test foreground expiry"],
  ["background_expiry", "Test background expiry"],
  ["inspect_permission", "Inspect notification permission"],
  ["inspect", "Inspect scheduled rest alerts"],
  ["reset_preferences", "Reset rest alert preferences"],
  ["cancel_all", "Cancel scheduled rest alerts"],
  ["schedule_late_stale", "Schedule stale rest alert"],
  ["arm_add_warmup_failure", "Arm Add warm-up failure"],
  ["arm_copy_warmup_failure", "Arm Copy warm-up failure"],
  ["arm_add_working_failure", "Arm Add working set failure"],
  [
    "arm_completed_set_correction_failure",
    "Arm completed set correction failure",
  ],
  ["reset_workout_failures", "Reset workout mutation failures"],
] as const satisfies readonly (readonly [NotificationTestControlAction, string])[];

type NotificationTestControlAction =
  | Phase1NotificationTestAction
  | WorkoutMutationTestAction;

type NotificationTestControlResult =
  | Phase1NotificationTestResult
  | WorkoutMutationTestResult;

function actionFrom(
  value: string | string[] | undefined,
): NotificationTestControlAction {
  const selected = Array.isArray(value) ? value[0] : value;
  return actions.some(([action]) => action === selected)
    ? selected as NotificationTestControlAction
    : "inspect";
}

export default function NotificationTestControlsRoute() {
  const runtime = useWorkoutAppRuntime();
  const parameters = useLocalSearchParams<{
    action?: string | string[];
  }>();
  const initialAction = actionFrom(parameters.action);
  const appliedAction = useRef<NotificationTestControlAction | null>(null);
  const enabled = Constants.expoConfig?.extra?.nativeContractsEnabled === true;
  const [result, setResult] = useState<NotificationTestControlResult | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  const perform = useCallback((action: NotificationTestControlAction) => {
    setBusy(true);
    if (isWorkoutMutationTestAction(action)) {
      setResult(applyWorkoutMutationTestControl(action));
      setBusy(false);
      return;
    }
    void applyPhase1NotificationTestControl(action, {
      exerciseExpiry: runtime.exerciseNotificationExpiry,
    })
      .then(setResult)
      .catch(() => {
        setResult({
          action,
          code: "platform_failure",
          heading: "Notification test control failed",
          body: "Platform operation failed. Workout state was not changed.",
          scheduledRestCount: 0,
        });
      })
      .finally(() => setBusy(false));
  }, [runtime.exerciseNotificationExpiry]);

  useEffect(() => {
    if (
      !enabled
      || runtime.launchState !== "trusted"
      || appliedAction.current === initialAction
    ) {
      return;
    }
    appliedAction.current = initialAction;
    perform(initialAction);
  }, [enabled, initialAction, perform, runtime.launchState]);

  if (!enabled) {
    return <Redirect href="/" />;
  }
  if (runtime.launchState !== "trusted" || (result === null && busy)) {
    return (
      <AdaptiveScreen
        primary={
          <>
            <ScreenHeader title="Notification test control" />
            <SkeletonBlock height={48} width="70%" />
            <SkeletonBlock height={72} />
          </>
        }
      />
    );
  }
  return (
    <AdaptiveScreen
      primary={
        <>
          <ScreenHeader
            eyebrow="DEVELOPMENT TEST"
            title="Notification test control"
          />
          <EmptyState
            body={result?.body ?? "Choose a deterministic test action."}
            heading={result?.heading ?? "Ready for notification testing"}
            primaryAction={<></>}
          />
          {actions.map(([action, label]) => (
            <SecondaryAction
              busy={busy}
              key={action}
              label={label}
              onPress={() => perform(action)}
              testID={`notification-test-${action}`}
            />
          ))}
          <PrimaryAction
            label="Return to Today"
            onPress={() => router.replace("/(tabs)")}
          />
        </>
      }
    />
  );
}
