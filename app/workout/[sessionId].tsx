import {
  router,
  useFocusEffect,
  useLocalSearchParams,
  type Href,
} from "expo-router";
import Constants from "expo-constants";
import React, {
  useCallback,
  useEffect,
  useState,
} from "react";

import type {
  WorkoutSessionView,
} from "../../src/domains/workout";
import type {
  WorkoutPreference,
} from "../../src/domains/workout/workoutPreferences";
import {
  useWorkoutAppRuntime,
} from "../../src/bootstrap/workoutAppRuntime";
import {
  createWorkoutMutationTestCommandAdapters,
} from "../../src/bootstrap/workoutMutationTestControls";
import {
  useRestCountdownCue,
} from "../../src/bootstrap/restCountdownCue";
import {
  ActiveWorkoutLoadingScreen,
} from "../../src/ui/screens/RootScreens";
import {
  EmptyState,
  PrimaryAction,
  ScreenHeader,
} from "../../src/ui/components";
import {
  AdaptiveScreen,
} from "../../src/ui/layout/AdaptiveScreen";
import {
  ActiveWorkoutScreen,
} from "../../src/ui/screens/ActiveWorkoutScreen";
import {
  WorkoutPlanSettingsSheet,
} from "../../src/ui/components/WorkoutPlanSettingsSheet";
import { parseScalarRouteParam } from "../../src/navigation/routeOrigin";
import {
  emitPhase20CalendarProbeReceipt,
  phase20CalendarActiveWorkout,
  phase20CalendarFixtureRequestFromNativeContract,
  phase20CalendarProbeReceiptRequestFromNativeContract,
} from "../../src/testing/phase20CalendarFixture";

export default function ActiveWorkoutRoute() {
  const { sessionId, returnTo, phase20CalendarFixture, phase20CalendarEvidenceNonce, phase20CalendarRequirementsSha256, phase20CalendarFixtureSourceSha256, phase20CalendarRequirement, phase20CalendarEvidenceId, phase20CalendarProbe, phase20CalendarProbeReceipt } = useLocalSearchParams<{
    sessionId: string | string[];
    returnTo?: string;
    phase20CalendarFixture?: string | string[];
    phase20CalendarEvidenceNonce?: string | string[];
    phase20CalendarRequirementsSha256?: string | string[];
    phase20CalendarFixtureSourceSha256?: string | string[];
    phase20CalendarRequirement?: string | string[];
    phase20CalendarEvidenceId?: string | string[];
    phase20CalendarProbe?: string | string[];
    phase20CalendarProbeReceipt?: string | string[];
  }>();
  const runtime = useWorkoutAppRuntime();
  const countdownCue = useRestCountdownCue();
  const resolvedSessionId = typeof sessionId === "string" ? sessionId : "unknown";
  const scalar = (value: string | readonly string[] | undefined) => {
    const parsed = parseScalarRouteParam(value);
    return parsed.kind === "value" ? parsed.value : undefined;
  };
  const extra = Constants.expoConfig?.extra;
  const fixtureEnabled = phase20CalendarFixtureRequestFromNativeContract({
    packageName: Constants.expoConfig?.android?.package,
    buildProfile: extra?.buildProfile,
    nativeContractsEnabled: extra?.nativeContractsEnabled,
    suite: extra?.nativeContractSuite,
    fixtureId: scalar(phase20CalendarFixture),
    nonce: scalar(phase20CalendarEvidenceNonce),
    requirementsSha256: scalar(phase20CalendarRequirementsSha256),
  });
  const fixtureProbeReceipt = React.useMemo(() => phase20CalendarProbeReceiptRequestFromNativeContract({
    packageName: Constants.expoConfig?.android?.package,
    buildProfile: extra?.buildProfile,
    nativeContractsEnabled: extra?.nativeContractsEnabled,
    suite: extra?.nativeContractSuite,
    fixtureId: scalar(phase20CalendarFixture),
    nonce: scalar(phase20CalendarEvidenceNonce),
    flowSha256: scalar(phase20CalendarRequirementsSha256),
    fixtureSourceSha256: scalar(phase20CalendarFixtureSourceSha256),
    requirementId: scalar(phase20CalendarRequirement),
    evidenceId: scalar(phase20CalendarEvidenceId),
    probeId: scalar(phase20CalendarProbe),
    status: scalar(phase20CalendarProbeReceipt),
  }), [extra?.buildProfile, extra?.nativeContractSuite, extra?.nativeContractsEnabled, phase20CalendarEvidenceId,
    phase20CalendarEvidenceNonce, phase20CalendarFixture, phase20CalendarFixtureSourceSha256,
    phase20CalendarProbe, phase20CalendarProbeReceipt, phase20CalendarRequirement, phase20CalendarRequirementsSha256]);
  const [view, setView] = useState<WorkoutSessionView | null>(null);
  const [failed, setFailed] = useState(false);
  const [readAttempt, setReadAttempt] = useState(0);
  const [focusGeneration, setFocusGeneration] = useState(0);
  const [availableExercises, setAvailableExercises] = useState<readonly Readonly<{
    id: string;
    name: string;
  }>[]>([]);
  const [availableExercisesState, setAvailableExercisesState] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [availableExercisesAttempt, setAvailableExercisesAttempt] = useState(0);
  const [deferredPlanId, setDeferredPlanId] = useState<string | null>(null);
  const [planSettingsVisible, setPlanSettingsVisible] = useState(false);
  const [planPreference, setPlanPreference] = useState<WorkoutPreference | null>(null);
  const mutationCommands = createWorkoutMutationTestCommandAdapters({
    addWarmup: runtime.addWarmup,
    addWorkingSet: runtime.addWorkingSet,
    reviseCompletedSet: runtime.reviseCompletedSet,
    replaceExercise: runtime.replaceExercise,
    removeExercise: runtime.removeExercise,
  });
  useEffect(() => {
    setDeferredPlanId(null);
    setPlanSettingsVisible(false);
    setPlanPreference(null);
  }, [resolvedSessionId]);

  const activePlanId = view !== null && "planId" in view
    ? view.planId ?? null
    : null;
  const openPlanSettings = useCallback(async () => {
    if (activePlanId === null) return;
    const preference = await runtime.readWorkoutPreferences(activePlanId);
    setPlanPreference(preference);
    setPlanSettingsVisible(true);
  }, [activePlanId, runtime.readWorkoutPreferences]);
  const savePlanPreferences = useCallback(async (
    field: "defaultRestSeconds" | "weightIncrementGrams",
    value: number,
  ) => {
    if (activePlanId === null) {
      throw new Error("workout_plan_preferences_unavailable");
    }
    const write = async (source: WorkoutPreference) => runtime.setWorkoutPreferences({
      planId: activePlanId,
      expectedRevision: source.revision,
      defaultRestSeconds: field === "defaultRestSeconds"
        ? value
        : source.defaultRestSeconds,
      weightIncrementGrams: field === "weightIncrementGrams"
        ? value
        : source.weightIncrementGrams,
      updatedAtMs: Date.now(),
    });
    try {
      await write(await runtime.readWorkoutPreferences(activePlanId));
    } catch {
      const source = await runtime.readWorkoutPreferences(activePlanId);
      try {
        await write(source);
      } catch {
        throw new Error("workout_plan_preferences_not_saved");
      }
    }
    const source = await runtime.readWorkoutPreferences(activePlanId);
    setPlanPreference(source);
    setPlanSettingsVisible(false);
  }, [activePlanId, runtime.readWorkoutPreferences, runtime.setWorkoutPreferences]);
  useEffect(() => {
    let active = true;
    setFailed(false);
    setView((current) => current?.id === resolvedSessionId ? current : null);
    const read = fixtureEnabled
      ? Promise.resolve(phase20CalendarActiveWorkout(resolvedSessionId))
      : runtime.getActiveWorkout(resolvedSessionId);
    void read.then((nextView) => {
      if (active) {
        if (nextView === null) setFailed(true);
        else setView(nextView);
      }
    }).catch(() => {
      if (active) {
        setFailed(true);
      }
    });
    return () => {
      active = false;
    };
  }, [
    readAttempt,
    resolvedSessionId,
    fixtureEnabled,
    runtime.getActiveWorkout,
    runtime.workoutRefreshGeneration,
  ]);
  const emitFixtureProbeReceipt = useCallback(() => {
    void emitPhase20CalendarProbeReceipt(fixtureProbeReceipt);
  }, [fixtureProbeReceipt]);
  const returnToWorkout = useCallback(() => {
    if (returnTo === "/(tabs)") {
      router.replace(returnTo);
      return;
    }
    router.back();
  }, [returnTo]);
  useFocusEffect(useCallback(() => {
    setFocusGeneration((current) => current + 1);
  }, []));
  useEffect(() => {
    let active = true;
    setAvailableExercisesState("loading");
    const read = fixtureEnabled ? Promise.resolve([]) : runtime.listOwnedPlanExercises();
    void read.then((exercises) => {
      if (active) {
        setAvailableExercises(exercises.map(({ id, name }) => ({ id, name })));
        setAvailableExercisesState("ready");
      }
    }).catch(() => {
      if (active) {
        setAvailableExercises([]);
        setAvailableExercisesState("error");
      }
    });
    return () => { active = false; };
  }, [availableExercisesAttempt, fixtureEnabled, runtime.listOwnedPlanExercises]);

  if (failed) {
    return (
      <AdaptiveScreen
        constrainActiveWork
        primary={
          <>
            <ScreenHeader
              backAction={returnToWorkout}
              eyebrow="WORKOUT OVERVIEW"
              title="Workout"
            />
            <EmptyState
              body="Your workout was not changed. Return to Today and resume the active session."
              heading="Workout could not be opened"
              primaryAction={<>
                <PrimaryAction
                  label="Retry opening workout data"
                  onPress={() => setReadAttempt((attempt) => attempt + 1)}
                />
                <PrimaryAction
                  label="Go back to Workout"
                  onPress={returnToWorkout}
                />
              </>}
            />
          </>
        }
      />
    );
  }

  if (view === null) {
    return (
      <ActiveWorkoutLoadingScreen
        onGoBack={() => router.back()}
        sessionId={resolvedSessionId}
      />
    );
  }

  return (
    <>
    <ActiveWorkoutScreen
      commands={{
        addExercise: runtime.addExercise,
        replaceExercise: mutationCommands.replaceExercise ?? runtime.replaceExercise,
        removeExercise: mutationCommands.removeExercise ?? runtime.removeExercise,
        reorderExercises: runtime.reorderExercises,
        updateActiveSetDraft: runtime.updateActiveSetDraft,
        updateWarmupDraft: runtime.updateWarmupDraft,
        addWarmup: mutationCommands.addWarmup,
        addWorkingSet: mutationCommands.addWorkingSet,
        completeWarmup: runtime.completeWarmup,
        removeWarmup: runtime.removeWarmup,
        removeWorkingSet: runtime.removeWorkingSet,
        completeSet: runtime.completeSet,
        undoCompletedSet: runtime.undoCompletedSet,
        reviseCompletedSet: mutationCommands.reviseCompletedSet,
        startManualRest: runtime.startManualRest,
        pauseRest: runtime.pauseRest,
        resumeRest: runtime.resumeRest,
        adjustRest: runtime.adjustRest,
        skipRest: runtime.skipRest,
        expireRest: runtime.expireRest,
        updateSessionExerciseDefaultRest: runtime.updateSessionExerciseDefaultRest,
        finishCompleted: runtime.finishCompleted,
        finishPartial: runtime.finishPartial,
        saveZeroSetWorkout: runtime.saveZeroSetWorkout,
        discardWorkout: runtime.discardWorkout,
        skipExercise: runtime.skipExercise,
      }}
      availableExercises={availableExercises}
      availableExercisesState={availableExercisesState}
      nowMs={() => Date.now()}
      notificationPermission={runtime.notificationPermission}
      restSoundEnabled={runtime.readRestAlertPreferences().soundEnabled}
      countdownCue={countdownCue}
      onOpenNotificationSettings={() => {
        void runtime.openRestNotificationSettings();
      }}
      onRetryAvailableExercises={() => {
        setAvailableExercisesAttempt((attempt) => attempt + 1);
      }}
      onFinishLater={() => {
        if (deferredPlanId !== null) {
          router.replace(`/library/plan/${deferredPlanId}/edit` as Href);
          return;
        }
        router.replace("/(tabs)");
      }}
      onGoBack={returnToWorkout}
      onOutcomeSaved={(savedSessionId) => {
        if (deferredPlanId !== null) {
          router.replace(`/library/plan/${deferredPlanId}/edit` as Href);
          return;
        }
        router.replace({
          pathname: "/completion/[sessionId]",
          params: { sessionId: savedSessionId },
        } as unknown as Href);
      }}
      onResolveUnknownOutcome={(outcomeSessionId) => runtime.getSessionDetail(outcomeSessionId)}
      onDiscarded={() => router.replace("/(tabs)")}
      onRequestPlanEdit={() => {
        if ("planId" in view && view.planId !== null && view.planId !== undefined) {
          setDeferredPlanId(view.planId);
        }
      }}
      onOpenPlanSettings={() => { void openPlanSettings(); }}
      loadExerciseHistory={runtime.loadExerciseMetricHistory}
      initialHeaderFocus={fixtureEnabled}
      {...(fixtureEnabled ? { onInitialHeaderFocused: emitFixtureProbeReceipt } : {})}
      sessionId={resolvedSessionId}
      view={view}
      key={`${resolvedSessionId}:${focusGeneration}`}
    />
    {activePlanId === null || planPreference === null ? null : (
      <WorkoutPlanSettingsSheet
        defaultRestSeconds={planPreference.defaultRestSeconds}
        onClose={() => setPlanSettingsVisible(false)}
        onEditPlanAfterWorkout={() => {
          setPlanSettingsVisible(false);
          setDeferredPlanId(activePlanId);
        }}
        onOpenWorkoutActions={() => setPlanSettingsVisible(false)}
        onSave={savePlanPreferences}
        planName="Workout plan"
        scheduleSummary="Saved to this plan"
        visible={planSettingsVisible}
        weightIncrementGrams={planPreference.weightIncrementGrams}
      />
    )}
    </>
  );
}
