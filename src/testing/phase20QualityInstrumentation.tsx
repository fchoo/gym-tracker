import { CryptoDigestAlgorithm, digestStringAsync } from "expo-crypto";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";

import {
  productionWorkoutAppRuntimeDependencies,
  useCalendarRangeReadPort,
  useWorkoutAppRuntime,
  WorkoutAppRuntimeProvider,
  type WorkoutAppRuntimeDependencies,
} from "../bootstrap/workoutAppRuntime";
import {
  createV12AcceptanceBenchmark,
  type V12AcceptanceBenchmarkMarker,
} from "../bootstrap/v12AcceptanceBenchmark";
import { openSqliteKernel } from "../platform/sqlite";
import { seedPhase20CalendarQualityFixture, seedPhase20ProgressQualityFixture } from "./contracts/progressParity.contract";
import { seedPhase20QualityWorkloadFixture } from "./phase20QualityWorkload";
import { AppRootShell, useRootSettingsController } from "../ui/shell/AppRootShell";
import { rootSettingsTriggerNativeID } from "../ui/shell/rootFocus";
import { ActiveWorkoutScreen } from "../ui/screens/ActiveWorkoutScreen";
import { CalendarScreen } from "../ui/screens/CalendarScreen";
import type { Phase16CalendarDiagnosticsProducer } from "../bootstrap/phase16CalendarTestControls";
import { LibraryScreen } from "../ui/screens/LibraryScreen";
import { ProgressScreen } from "../ui/screens/ProgressScreen";
import { TodayScreen } from "../ui/screens/TodayScreen";
import { AppearanceProvider, createMemoryAppearanceStore } from "../ui/theme";
import { AppTabs, M3SearchField } from "../ui/components";
import {
  PHASE20_QUALITY_WORKLOAD_MARKER,
  PHASE20_QUALITY_WORKLOAD_SOURCE,
  phase20OperationNeedsSqlite,
  phase20QualityDatabaseName,
  phase20QualityRootForOperation,
  phase20QualityScenarioForOperation,
  resolvePhase20QualityRequest,
  type Phase20QualityMarkerKind,
  type Phase20QualityOperation,
  type Phase20QualityRequest,
  type Phase20QualityRoot,
} from "./phase20QualityProtocol";
import { runPhase20HeavyWorkload } from "./phase20QualityWorkloads";

export type { Phase20QualityAction, Phase20QualityRequest } from "./phase20QualityProtocol";
export { resolvePhase20QualityRequest } from "./phase20QualityProtocol";

export function phase20QualityEnabled(extra: Readonly<Record<string, unknown>> | null | undefined): boolean {
  return extra?.buildProfile === "development-test"
    && extra.nativeContractsEnabled === true
    && extra.nativeContractSuite === "v1.2-acceptance";
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right, "en"))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function isolatedDependencies(databaseName: string, root: Phase20QualityRoot): WorkoutAppRuntimeDependencies {
  return Object.freeze({
    ...productionWorkoutAppRuntimeDependencies,
    openKernel: () => openSqliteKernel(databaseName),
    migrate: async (kernel) => {
      await productionWorkoutAppRuntimeDependencies.migrate(kernel);
      await seedPhase20QualityWorkloadFixture(kernel);
      if (root === "calendar") await seedPhase20CalendarQualityFixture(kernel);
      if (root === "progress") await seedPhase20ProgressQualityFixture(kernel);
    },
  });
}

function useQualityMarkerEmitter(
  request: Phase20QualityRequest,
  databaseName: string,
) {
  const runtime = useWorkoutAppRuntime();
  const runtimeRef = useRef(runtime);
  runtimeRef.current = runtime;
  const queue = useRef(Promise.resolve());
  const scenario = phase20QualityScenarioForOperation(request.operation);
  return useCallback((
    kind: Phase20QualityMarkerKind,
    monotonicMs: number,
    payload: Readonly<Record<string, unknown>> = {},
  ) => {
    queue.current = queue.current.then(async () => {
      const sqliteReceipt = phase20OperationNeedsSqlite(request.operation)
        ? await runtimeRef.current.collectPhase20QualitySourceProof().then((proof) =>
          digestStringAsync(CryptoDigestAlgorithm.SHA256, canonical(proof)))
        : undefined;
      const readiness = kind === "ready"
        ? await digestStringAsync(CryptoDigestAlgorithm.SHA256, canonical({
            databaseName,
            root: scenario.root,
            fixture_id: scenario.fixture_id,
            state_id: scenario.state_id,
            configuration_id: scenario.configuration_id,
            payload,
            sequence: request.sequence,
            sqliteReceipt,
          }))
        : undefined;
      const unsigned = {
        schema_version: 1 as const,
        nonce: request.nonce,
        action: request.action,
        operation: request.operation,
        sequence: request.sequence,
        kind,
        source: PHASE20_QUALITY_WORKLOAD_SOURCE,
        monotonic_ms: monotonicMs,
        database_name: databaseName,
        root: scenario.root,
        fixture_id: scenario.fixture_id,
        state_id: scenario.state_id,
        configuration_id: scenario.configuration_id,
        ...(sqliteReceipt === undefined ? {} : { sqlite_receipt_sha256: sqliteReceipt }),
        ...(readiness === undefined ? {} : { readiness_sha256: readiness }),
        ...(Object.keys(payload).length === 0 ? {} : { payload }),
      };
      const receipt = await digestStringAsync(
        CryptoDigestAlgorithm.SHA256,
        canonical(unsigned),
      );
      console.info(`${PHASE20_QUALITY_WORKLOAD_MARKER}${JSON.stringify({
        ...unsigned,
        receipt_sha256: receipt,
      })}`);
    }).catch(() => {
      // The native consumer times out and rejects the action. Never replace a
      // missing source receipt with a success-shaped marker.
    });
    return queue.current;
  }, [databaseName, request.action, request.nonce, request.operation, request.sequence, scenario.configuration_id, scenario.fixture_id, scenario.root, scenario.state_id]);
}

type ProductCallback = (id: string, payload?: Readonly<Record<string, unknown>>) => void;

function QualitySettingsContent({ onProductCallback }: Readonly<{ onProductCallback: ProductCallback }>) {
  const [query, setQuery] = useState("");
  return <View accessibilityLabel="App Settings" accessibilityRole="summary" style={styles.settings}>
    <Text>Appearance and workout settings</Text>
    <M3SearchField
      label="Search settings"
      onChangeText={(value) => { setQuery(value); onProductCallback("settings-search-change"); }}
      resultCount={query.length}
      state={query.length === 0 ? "idle" : "results"}
      value={query}
    />
  </View>;
}

function ProductRoot({
  acceptanceBenchmark,
  emit,
  onUsefulContent,
  onProductCallback,
  operation,
  root,
}: Readonly<{
  acceptanceBenchmark: ReturnType<typeof createV12AcceptanceBenchmark>;
  emit: ReturnType<typeof useQualityMarkerEmitter>;
  onUsefulContent: (state?: "current" | "updating") => void;
  onProductCallback: ProductCallback;
  operation: Phase20QualityOperation;
  root: Phase20QualityRoot;
}>) {
  const runtime = useWorkoutAppRuntime();
  const calendarRead = useCalendarRangeReadPort();
  const rootSettings = useRootSettingsController();
  const settingsActionRef = useRef<View>(null);
  const settingsRoot = root === "workout" ? "index" : root;
  const settingsActionNativeID = rootSettingsTriggerNativeID(settingsRoot);
  const openSettings = () => rootSettings.openRootSettings({
    root: settingsRoot,
    triggerNativeID: settingsActionNativeID,
    triggerRef: settingsActionRef,
  });
  const openMeasuredSettings = () => {
    openSettings();
    onProductCallback("settings-open");
  };
  const reportUsefulContent = (state: "current" | "updating" = "current") => {
    onProductCallback("route-ready", { rendered_root: root });
    onUsefulContent(state);
  };
  const nowLocalDate = "2026-08-24";
  const calendarDiagnostics = useMemo(() => {
    if (operation !== "calendar-month-selection") return undefined;
    let query: Readonly<Record<string, number | boolean>> | undefined;
    let interaction: Readonly<Record<string, number | boolean | string | readonly number[]>> | undefined;
    const producer: Phase16CalendarDiagnosticsProducer = Object.freeze({
      recordQuery(value) {
        query = Object.freeze({
          duration_ms: value.durationMs,
          event_count: value.eventCount,
          plan_count: value.planCount,
          imported_count: value.importedCount,
          source_backed: true,
        });
      },
      recordInteraction(value) {
        interaction = Object.freeze({
          complete: true,
          frame_work_ms: value.frameWorkMs,
          missed_frames: value.missedFrames,
          refresh_rate_hz: value.refreshRateHz,
          profiler_overhead_ms: value.profilerOverheadMs,
        });
      },
      exportResult() {
        if (query === undefined || interaction === undefined) {
          throw new Error("phase20_calendar_diagnostics_incomplete");
        }
        return Object.freeze({
          producer: "v12-calendar-native-diagnostics/v1" as const,
          native_execution: "EXECUTED" as const,
          query_samples: Object.freeze([query]),
          interaction_samples: Object.freeze([interaction]),
        });
      },
    });
    return Object.freeze({
      producer,
      request: Object.freeze({ querySamples: 1, interactionSamples: 1 }),
      onInteractionStart: () => { void emit("start", performance.now(), { input: "calendar-gesture" }); },
      onInteractionReady: (sample: Readonly<{
        frameWorkMs: readonly number[];
        missedFrames: number;
        refreshRateHz: number;
        profilerOverheadMs: number;
      }>) => { void emit("ready", performance.now(), {
        frame_work_ms: sample.frameWorkMs,
        missed_frames: sample.missedFrames,
        native_execution: "EXECUTED",
        profiler_overhead_ms: sample.profilerOverheadMs,
        refresh_rate_hz: sample.refreshRateHz,
      }); },
    });
  }, [emit, operation]);
  if (root === "calendar") {
    return <CalendarScreen
      {...(calendarDiagnostics === undefined ? {} : { diagnostics: calendarDiagnostics })}
      initialDate={nowLocalDate}
      loadCalendarRange={calendarRead.loadCalendarRange}
      onOpenEvent={() => undefined}
      onOpenSettings={openMeasuredSettings}
      onRequestRootBack={() => undefined}
      onUsefulContent={() => reportUsefulContent()}
      settingsActionNativeID={settingsActionNativeID}
      settingsActionRef={settingsActionRef}
      today={nowLocalDate}
    />;
  }
  if (root === "library") {
    return <LibraryScreen
      acceptanceBenchmark={acceptanceBenchmark}
      listRecentExercises={runtime.listLibraryRecentExercises}
      loadLibrary={runtime.loadLibrary}
      onCreateExercise={() => undefined}
      onCreatePlan={() => undefined}
      onOpenExercise={() => undefined}
      onOpenPlan={() => undefined}
      onOpenSettings={openMeasuredSettings}
      onUsefulContent={() => reportUsefulContent()}
      searchExercises={runtime.searchLibraryExercises}
      setExerciseFavorite={runtime.setLibraryExerciseFavorite}
      setSection={runtime.setLibrarySection}
      settingsActionNativeID={settingsActionNativeID}
      settingsActionRef={settingsActionRef}
    />;
  }
  if (root === "progress") {
    return <ProgressScreen
      loadProgress={runtime.loadProgress}
      nowLocalDate={nowLocalDate}
      onOpenExercise={() => undefined}
      onOpenSession={() => undefined}
      onOpenSettings={openMeasuredSettings}
      onUsefulContent={(state) => {
        if (operation !== "progress-review-open") reportUsefulContent(state);
      }}
      onReviewVisible={() => {
        if (operation === "progress-review-open") reportUsefulContent("current");
      }}
      progressBodyweightRuntime={runtime.progressBodyweightRuntime}
      progressRecommendationRuntime={runtime.progressRecommendationRuntime}
      runningTargetRuntime={runtime.progressRunningTargetRuntime}
      settingsActionNativeID={settingsActionNativeID}
      settingsActionRef={settingsActionRef}
    />;
  }
  return <TodayScreen
    launchState={runtime.launchState}
    onOpenSettings={openMeasuredSettings}
    onUsefulContent={() => reportUsefulContent()}
    planDays={runtime.planDays}
    settingsActionNativeID={settingsActionNativeID}
    settingsActionRef={settingsActionRef}
    {...(runtime.view === undefined ? {} : { view: runtime.view })}
  />;
}

function ActiveWorkoutQualityRoot({
  acceptanceBenchmark,
  onProductCallback,
  onReady,
  request,
}: Readonly<{
  acceptanceBenchmark: ReturnType<typeof createV12AcceptanceBenchmark>;
  onProductCallback: ProductCallback;
  onReady: () => void;
  request: Phase20QualityRequest;
}>) {
  const runtime = useWorkoutAppRuntime();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [view, setView] = useState<Awaited<ReturnType<typeof runtime.getActiveWorkout>> | null>(null);
  const setupState = useRef<"idle" | "activating" | "starting" | "loading" | "ready">("idle");
  const prepare = useCallback(async (
    initial: Awaited<ReturnType<typeof runtime.getActiveWorkout>>,
  ) => {
    if ("state" in initial) throw new Error("phase20_quality_active_workout_missing");
    let current = initial;
    if (request.operation === "committed-set-visible-dock") {
      if (current.rest.state === "running" || current.rest.state === "paused") {
        await runtime.skipRest({
          sessionId: current.id,
          expectedSessionRevision: current.revision,
          expectedRestRevision: current.rest.revision,
          nowMs: Date.now(),
        });
        const refreshed = await runtime.getActiveWorkout(current.id);
        if ("state" in refreshed) throw new Error("phase20_quality_active_workout_missing");
        current = refreshed;
      }
      const incomplete = () => current.exercises.flatMap(({ workingSets }) =>
        workingSets.filter(({ status }) => status !== "completed"));
      const sourceSet = current.currentExercise.workingSets[0];
      if (sourceSet === undefined) throw new Error("phase20_quality_source_set_missing");
      while (incomplete().length < 101) {
        const totalSets = current.exercises.reduce(
          (total, exercise) => total + exercise.workingSets.length,
          0,
        );
        current = await runtime.addWorkingSet({
          sessionId: current.id,
          sessionExerciseId: current.currentExercise.id,
          sourceSetId: sourceSet.id,
          setId: `phase20-quality-${request.nonce.slice(0, 12)}-${request.sequence}-${totalSets}`,
          nowMs: Date.now(),
        });
      }
    }
    if (request.operation === "rest-control") {
      if (current.rest.state !== "idle") {
        await runtime.skipRest({
          sessionId: current.id,
          expectedSessionRevision: current.revision,
          expectedRestRevision: current.rest.revision,
          nowMs: Date.now(),
        });
        const reset = await runtime.getActiveWorkout(current.id);
        if ("state" in reset) throw new Error("phase20_quality_active_workout_missing");
        current = reset;
      }
      await runtime.startManualRest({
        sessionId: current.id,
        expectedSessionRevision: current.revision,
        expectedRestRevision: current.rest.revision,
        nowMs: Date.now(),
      });
      const refreshed = await runtime.getActiveWorkout(current.id);
      if ("state" in refreshed) throw new Error("phase20_quality_active_workout_missing");
      if (refreshed.rest.state !== "running" || refreshed.rest.endsAtMs <= Date.now()) {
        throw new Error("phase20_quality_rest_reset_failed");
      }
      current = refreshed;
    }
    return current;
  }, [request.nonce, request.operation, runtime]);

  useEffect(() => {
    if (runtime.launchState !== "trusted" || setupState.current !== "idle") return;
    if (runtime.view?.state === "no_active_plan") {
      setupState.current = "activating";
      void runtime.activatePlan().then(() => { setupState.current = "idle"; }).catch(() => undefined);
      return;
    }
    if (runtime.view?.state === "active_workout") {
      setupState.current = "loading";
      setSessionId(runtime.view.sessionId);
      void runtime.getActiveWorkout(runtime.view.sessionId).then((next) => {
        return prepare(next);
      }).then((next) => {
        setView(next);
        setupState.current = "ready";
      }).catch(() => undefined);
      return;
    }
    const day = runtime.planDays[0];
    if (day === undefined) return;
    setupState.current = "starting";
    void runtime.startPlanDay(day.id, "alternate").then((id) => {
      setSessionId(id);
      return runtime.getActiveWorkout(id);
    }).then(prepare).then((next) => {
      setView(next);
      setupState.current = "ready";
    }).catch(() => undefined);
  }, [prepare, runtime]);

  useEffect(() => {
    if (view === null) return;
    const frame = requestAnimationFrame(onReady);
    return () => cancelAnimationFrame(frame);
  }, [onReady, view]);

  if (sessionId === null || view === null) {
    return <View accessibilityLabel="Preparing isolated workout fixture" accessibilityRole="progressbar" style={styles.center}><Text>Preparing workout</Text></View>;
  }
  return <ActiveWorkoutScreen
    acceptanceBenchmark={acceptanceBenchmark}
    commands={{
      addExercise: runtime.addExercise,
      replaceExercise: runtime.replaceExercise,
      removeExercise: runtime.removeExercise,
      reorderExercises: runtime.reorderExercises,
      updateActiveSetDraft: async (input) => {
        const next = await runtime.updateActiveSetDraft(input);
        onProductCallback("numeric-edit-commit", {
          value_sha256: await digestStringAsync(
            CryptoDigestAlgorithm.SHA256,
            canonical(input.observation),
          ),
        });
        return next;
      },
      updateWarmupDraft: async (input) => {
        const next = await runtime.updateWarmupDraft(input);
        onProductCallback("numeric-edit-commit", {
          value_sha256: await digestStringAsync(
            CryptoDigestAlgorithm.SHA256,
            canonical(input.observation),
          ),
        });
        return next;
      },
      addWarmup: runtime.addWarmup,
      addWorkingSet: runtime.addWorkingSet,
      completeWarmup: runtime.completeWarmup,
      removeWarmup: runtime.removeWarmup,
      removeWorkingSet: runtime.removeWorkingSet,
      completeSet: runtime.completeSet,
      undoCompletedSet: runtime.undoCompletedSet,
      reviseCompletedSet: runtime.reviseCompletedSet,
      startManualRest: runtime.startManualRest,
      pauseRest: runtime.pauseRest,
      resumeRest: runtime.resumeRest,
      adjustRest: async (input) => {
        const next = await runtime.adjustRest(input);
        onProductCallback("rest-adjust-commit", {
          delta_ms: input.deltaMs,
          rest_revision: next.state.revision,
        });
        return next;
      },
      skipRest: runtime.skipRest,
      expireRest: runtime.expireRest,
      updateSessionExerciseDefaultRest: runtime.updateSessionExerciseDefaultRest,
      finishCompleted: runtime.finishCompleted,
      finishPartial: runtime.finishPartial,
      saveZeroSetWorkout: runtime.saveZeroSetWorkout,
      discardWorkout: runtime.discardWorkout,
      skipExercise: runtime.skipExercise,
    }}
    loadExerciseHistory={runtime.loadExerciseMetricHistory}
    notificationPermission={runtime.notificationPermission}
    nowMs={() => Date.now()}
    onFinishLater={() => undefined}
    onGoBack={() => undefined}
    sessionId={sessionId}
    view={view}
  />;
}

function Phase20QualityRuntime({ request, databaseName }: Readonly<{
  request: Phase20QualityRequest;
  databaseName: string;
}>) {
  const runtime = useWorkoutAppRuntime();
  const emit = useQualityMarkerEmitter(request, databaseName);
  const targetRoot = phase20QualityRootForOperation(request.operation);
  const scenario = phase20QualityScenarioForOperation(request.operation);
  const callbackCounts = useRef<Record<string, number>>({});
  const productCallback = useCallback((callbackId: string, payload: Readonly<Record<string, unknown>> = {}) => {
    const callbackCount = (callbackCounts.current[callbackId] ?? 0) + 1;
    callbackCounts.current[callbackId] = callbackCount;
    void emit("callback", performance.now(), {
      callback_count: callbackCount,
      callback_id: callbackId,
      root: scenario.root,
      state_id: scenario.state_id,
      ...payload,
    });
  }, [emit, scenario.root, scenario.state_id]);
  const activeOperation = [
    "committed-set-visible-dock",
    "numeric-edit",
    "rest-control",
  ].includes(request.operation);
  const heavyOperation = [
    "ordinary-js-task",
    "phase12-backup",
    "garmin-json-normalization",
  ].includes(request.operation);
  const started = useRef(false);
  const finished = useRef(false);
  const [armed, setArmed] = useState(false);
  const [searchPrepared, setSearchPrepared] = useState(
    request.operation !== "search-after-debounce",
  );
  const [progressPrepared, setProgressPrepared] = useState(
    request.operation !== "progress-targeted-rebuild",
  );
  const [displayRoot, setDisplayRoot] = useState<Phase20QualityRoot>(() =>
    request.operation.startsWith("root-switch-")
      ? targetRoot === "workout" ? "progress" : "workout"
      : targetRoot);
  const benchmark = useMemo(() => createV12AcceptanceBenchmark({
    enabled: true,
    now: () => performance.now(),
    onMarker: (event: V12AcceptanceBenchmarkMarker) => {
      if (event.operation !== request.operation) {
        void emit("error", performance.now(), { code: "quality_operation_mismatch" });
        return;
      }
      void emit(event.kind, event.at_ms, { executed_operation: event.operation });
    },
  }), [emit, request.operation]);

  useEffect(() => {
    if (runtime.launchState !== "trusted"
      || request.operation !== "search-after-debounce"
      || searchPrepared) return;
    void runtime.loadLibrary().then(async (snapshot) => {
      if (snapshot.sectionPreference.section !== "exercises") {
        await runtime.setLibrarySection(
          "exercises",
          snapshot.sectionPreference.revision,
        );
      }
      setSearchPrepared(true);
    }).catch(() => undefined);
  }, [request.operation, runtime, searchPrepared]);

  useEffect(() => {
    if (runtime.launchState !== "trusted"
      || request.operation !== "progress-targeted-rebuild"
      || progressPrepared) return;
    void runtime.triggerPhase20ProgressRebuild().then(() => {
      setProgressPrepared(true);
    }).catch(() => undefined);
  }, [progressPrepared, request.operation, runtime]);

  useEffect(() => {
    if (runtime.launchState !== "trusted" || !progressPrepared || activeOperation || heavyOperation
      || request.operation === "search-after-debounce"
      || request.operation === "calendar-month-selection"
      || started.current) return;
    started.current = true;
    if (request.operation.startsWith("root-switch-")) {
      benchmark.markRootSwitchStart(targetRoot);
      setArmed(true);
      void emit("result", performance.now(), { armed: true, command_surface: "bottom-tabs", target_root: targetRoot });
      return;
    }
    if (request.operation.startsWith("progress-")) {
      benchmark.markProgressStart(request.operation.slice("progress-".length) as "useful-content" | "review-open" | "targeted-rebuild");
      setArmed(true);
      return;
    }
    void emit("start", performance.now(), { root: targetRoot });
    setArmed(true);
  }, [activeOperation, benchmark, emit, heavyOperation, progressPrepared, request.operation, runtime.launchState, targetRoot]);

  useEffect(() => {
    if (runtime.launchState !== "trusted" || !heavyOperation || finished.current) return;
    finished.current = true;
    const startedAt = performance.now();
    void emit("start", startedAt, { producer: "existing-native-benchmark" });
    const sourceFacts = request.operation === "ordinary-js-task"
      ? runtime.collectPhase20QualitySourceProof()
      : Promise.resolve(undefined);
    void sourceFacts.then((facts) => runPhase20HeavyWorkload(
      request.operation as "ordinary-js-task" | "phase12-backup" | "garmin-json-normalization",
      undefined,
      request.nonce,
      facts,
    )).then((result) => {
      if (result === null) throw new Error("phase20_quality_workload_missing");
      const retained = {
        command_receipt_sha256: result.command_receipt_sha256,
        native_execution: result.native_execution,
        producer: result.producer,
        result_database_name: result.database_name,
        samples: result.samples,
        timings: result.timings,
      };
      const serialized = JSON.stringify(retained);
      return digestStringAsync(CryptoDigestAlgorithm.SHA256, serialized).then(async (payloadSha256) => {
        const chunks = Array.from(
          { length: Math.ceil(serialized.length / 1_500) },
          (_, index) => serialized.slice(index * 1_500, (index + 1) * 1_500),
        );
        for (const [index, chunk] of chunks.entries()) {
          await emit("chunk", performance.now(), {
            chunk,
            chunk_sequence: index + 1,
            chunk_total: chunks.length,
          });
        }
        await emit("result", performance.now(), { payload_sha256: payloadSha256 });
        requestAnimationFrame(() => {
          void emit("ready", performance.now(), {
          command_receipt_sha256: result.command_receipt_sha256,
          native_execution: result.native_execution,
          producer: result.producer,
          });
        });
      });
    }).catch(() => {
      void emit("error", performance.now(), { code: "quality_workload_failed" });
    });
  }, [emit, heavyOperation, request.nonce, request.operation, runtime.launchState]);

  const useful = useCallback((state: "current" | "updating" = "current") => {
    if (!armed || finished.current) return;
    if (request.operation.startsWith("root-switch-")) {
      finished.current = true;
      benchmark.markUsefulContent(targetRoot);
      return;
    }
    if (request.operation === "progress-useful-content" && state === "current") {
      finished.current = true;
      benchmark.markProgressVisible("useful-content");
      return;
    }
    if (request.operation === "progress-targeted-rebuild" && state === "updating") {
      finished.current = true;
      benchmark.markProgressVisible("targeted-rebuild");
      return;
    }
    if (request.operation === "progress-review-open" && state === "current") {
      finished.current = true;
      benchmark.markProgressVisible("review-open");
      return;
    }
    if (activeOperation || heavyOperation || request.operation === "search-after-debounce"
      || request.operation === "calendar-month-selection") return;
    finished.current = true;
    void emit("ready", performance.now(), { root: targetRoot, semantic_tree: targetRoot });
  }, [activeOperation, armed, benchmark, emit, heavyOperation, request.operation, targetRoot]);

  const tabRoot = displayRoot === "workout" ? "index" : displayRoot;
  const tabRoutes = ["index", "calendar", "library", "progress"].map((name) => ({ key: `quality-${name}`, name }));
  const tabNavigation = {
    emit: () => ({ defaultPrevented: false }),
    navigate: (name: string) => {
      const nextRoot = name === "index" ? "workout" : name as Phase20QualityRoot;
      productCallback("root-tab-select", { target_root: nextRoot });
      setDisplayRoot(nextRoot);
    },
  };

  return <AppRootShell
    activeRoot={displayRoot === "workout" ? "index" : displayRoot}
    currentPath={displayRoot === "workout" ? "/" : `/${displayRoot}`}
    onSettingsVisibilityChange={(visible) => { if (!visible) productCallback("settings-close"); }}
    settingsContent={<QualitySettingsContent onProductCallback={productCallback} />}
  >
    <View style={styles.root} testID={`phase20-quality-root-${displayRoot}`}>
      {!searchPrepared || !progressPrepared
        ? <View accessibilityLabel="Preparing isolated library fixture" accessibilityRole="progressbar" style={styles.center}><Text>Preparing library</Text></View>
        : activeOperation
        ? <ActiveWorkoutQualityRoot acceptanceBenchmark={benchmark} onProductCallback={productCallback} request={request} onReady={() => {
            if (started.current) return;
            started.current = true;
            void emit("result", performance.now(), {
              armed: true,
              command_surface: "active-workout",
              root: "workout",
            });
          }} />
        : <ProductRoot
            acceptanceBenchmark={benchmark}
            emit={emit}
            onUsefulContent={useful}
            onProductCallback={productCallback}
            operation={request.operation}
            root={displayRoot}
          />}
    </View>
    <AppTabs navigation={tabNavigation} state={{ index: tabRoutes.findIndex(({ name }) => name === tabRoot), routes: tabRoutes }} />
  </AppRootShell>;
}

/** Development-test-only shell around production screens and repositories. */
export function Phase20QualityProbe({ request }: Readonly<{ request: Phase20QualityRequest }>) {
  const dimensions = useWindowDimensions();
  const root = phase20QualityRootForOperation(request.operation);
  const databaseName = phase20QualityDatabaseName(request.nonce, root);
  const dependencies = useMemo(() => isolatedDependencies(databaseName, root), [databaseName, root]);
  const appearance = useMemo(() => createMemoryAppearanceStore(null), []);
  return <AppearanceProvider store={appearance}>
    <WorkoutAppRuntimeProvider dependencies={dependencies}>
      <View
        accessibilityLabel={`Phase 20 ${request.action} ${request.operation}`}
        style={[styles.root, { minHeight: dimensions.height, minWidth: dimensions.width }]}
        testID="phase20-quality-probe"
      >
        <Phase20QualityRuntime
          databaseName={databaseName}
          key={`${request.action}:${request.operation}:${request.sequence}`}
          request={request}
        />
      </View>
    </WorkoutAppRuntimeProvider>
  </AppearanceProvider>;
}

export const resolveQualityRequest = resolvePhase20QualityRequest;

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { alignItems: "center", flex: 1, justifyContent: "center" },
  settings: { minHeight: 96, padding: 24 },
});
