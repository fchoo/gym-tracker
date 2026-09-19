import {
  Pause,
  Play,
  SkipForward,
  Square,
  Timer,
} from "lucide-react-native";
import React, {
  useEffect,
  useRef,
  useState,
} from "react";
import {
  AppState,
  StyleSheet,
  Text,
  TextInput,
  View,
  type AppStateStatus,
  type TextStyle,
} from "react-native";

import type {
  AdvancedTimingCommandResult,
  AdvancedTimingConfigV1,
  AdvancedTimingStateV1,
} from "../../domains/advancedTiming";
import {
  ADVANCED_TIMING_MAX_CLUSTER_GROUPS,
  ADVANCED_TIMING_MAX_CLUSTER_TOTAL_REPS,
  ADVANCED_TIMING_MAX_INTERVAL_MS,
} from "../../domains/advancedTiming";
import {
  InlineNotice,
  FocusablePressable,
} from "./index";
import {
  SemanticNumberField,
} from "./SemanticNumberField";
import {
  radius,
  sizes,
  space,
  typeScale,
  useAppTheme,
} from "../theme";

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(durationMs / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${
    String(seconds).padStart(2, "0")
  }`;
}

function controlLabel(state: AdvancedTimingStateV1): string {
  if (state.state === "running") {
    return `Rep ${state.nextRepetitionIndex} · ${
      formatDuration(state.nextBoundaryAtMs - Date.now())
    }`;
  }
  if (state.state === "paused") {
    return `Paused · Rep ${state.nextRepetitionIndex} · ${
      formatDuration(state.remainingMs)
    }`;
  }
  if (state.state === "stopped") {
    return state.mode === "cluster"
      ? `Stopped · Cluster ${state.currentGroupIndex + 1}`
      : `Stopped · Rep ${state.nextRepetitionIndex}`;
  }
  if (state.state === "cluster_ready") {
    return `Cluster ${state.currentGroupIndex + 1} of ${state.groupSizes.length}`;
  }
  if (state.state === "cluster_gap_running") {
    return `Intra-set rest · ${formatDuration(state.gapEndsAtMs - Date.now())}`;
  }
  if (state.state === "cluster_gap_paused") {
    return `Paused · Intra-set rest · ${formatDuration(state.remainingMs)}`;
  }
  return "Ready";
}

function clusterProgressLabel(
  state: AdvancedTimingStateV1 | null,
): string | null {
  if (
    state?.state === "cluster_gap_running"
    || state?.state === "cluster_gap_paused"
  ) {
    return `Cluster ${state.currentGroupIndex + 1} of ${state.groupSizes.length}`;
  }
  return null;
}

function parseClusterPattern(value: string): readonly number[] {
  const parts = value.split("+").map((part) => part.trim());
  if (
    parts.length < 2
    || parts.length > ADVANCED_TIMING_MAX_CLUSTER_GROUPS
    || parts.some((part) => part.length === 0 || !/^\d+$/u.test(part))
  ) {
    throw new Error("advanced_timing_cluster_pattern_invalid");
  }
  const groups = parts.map((part) => Number(part));
  if (
    groups.some((group) => !Number.isSafeInteger(group) || group <= 0)
    || groups.reduce((total, group) => total + group, 0) > ADVANCED_TIMING_MAX_CLUSTER_TOTAL_REPS
  ) {
    throw new Error("advanced_timing_cluster_pattern_invalid");
  }
  return Object.freeze(groups);
}

function TimingControl({
  accessibilityLabel,
  disabled,
  icon: Icon,
  label,
  onPress,
  selected = false,
  testID,
}: Readonly<{
  accessibilityLabel: string;
  disabled: boolean;
  icon: typeof Play;
  label: string;
  onPress(): void;
  selected?: boolean;
  testID: string;
}>) {
  const { colors } = useAppTheme();
  return (
    <FocusablePressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      focusable={!disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.control,
        {
          backgroundColor: pressed || selected
            ? colors.surfaceSubtle
            : colors.surface,
          borderColor: selected ? colors.action : colors.divider,
          opacity: disabled ? 0.62 : 1,
        },
      ]}
      testID={testID}
    >
      <Icon
        accessibilityElementsHidden
        color={colors.textPrimary}
        importantForAccessibility="no-hide-descendants"
        size={sizes.inlineIcon}
        strokeWidth={2}
      />
      <Text style={[typeScale.bodyStrong as TextStyle, { color: colors.textPrimary }]}>
        {label}
      </Text>
    </FocusablePressable>
  );
}

export type AdvancedTimingIndicatorContext = Readonly<{
  sessionId: string;
  sessionRevision: number;
  state: AdvancedTimingStateV1;
}>;

type PerRepTimingConfig = Extract<AdvancedTimingConfigV1, {
  mode: "per_rep";
}>;

type ClusterTimingConfig = Extract<AdvancedTimingConfigV1, {
  mode: "cluster";
}>;

export function AdvancedTimingIndicator({
  busy = false,
  context,
  cueUnavailable = false,
  disabled = false,
  nowMs,
  onConfigureAndStart,
  onConfigureAndStartCluster,
  onBeginClusterGap,
  onPause,
  onReconcile,
  onResume,
  onSkipClusterGap,
  onStop,
  resolvedConfig,
  targetSetId,
}: Readonly<{
  busy?: boolean;
  context: AdvancedTimingIndicatorContext | null;
  cueUnavailable?: boolean;
  disabled?: boolean;
  nowMs(): number;
  onConfigureAndStart(config: PerRepTimingConfig): Promise<AdvancedTimingCommandResult>;
  onConfigureAndStartCluster(config: ClusterTimingConfig): Promise<AdvancedTimingCommandResult>;
  onBeginClusterGap(): Promise<AdvancedTimingCommandResult>;
  onPause(): Promise<AdvancedTimingCommandResult>;
  onReconcile(foregroundSinceMs: number): Promise<AdvancedTimingCommandResult>;
  onResume(): Promise<AdvancedTimingCommandResult>;
  onSkipClusterGap(): Promise<AdvancedTimingCommandResult>;
  onStop(): Promise<AdvancedTimingCommandResult>;
  resolvedConfig?: AdvancedTimingConfigV1;
  targetSetId: string | null;
}>) {
  const { colors } = useAppTheme();
  const [draftMode, setDraftMode] = useState<"per_rep" | "cluster">("per_rep");
  const [intervalSeconds, setIntervalSeconds] = useState("3");
  const [clusterPattern, setClusterPattern] = useState("3+3+3");
  const [clusterGapSeconds, setClusterGapSeconds] = useState("20");
  const [displayNowMs, setDisplayNowMs] = useState(nowMs());
  const [validation, setValidation] = useState<string | undefined>();
  const [commandFailed, setCommandFailed] = useState(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const foregroundSinceMsRef = useRef<number | null>(
    AppState.currentState === "active" ? nowMs() : null,
  );
  const reconcileInFlightRef = useRef(false);
  const reconciledRevisionRef = useRef<number | null>(null);
  const state = context?.state ?? null;
  const activeState = state?.targetSessionSetId === targetSetId ? state : null;
  const isRunning = activeState?.state === "running"
    || activeState?.state === "cluster_gap_running";
  const isPaused = activeState?.state === "paused"
    || activeState?.state === "cluster_gap_paused";
  const isClusterReady = activeState?.state === "cluster_ready";
  const isClusterGap = activeState?.state === "cluster_gap_running"
    || activeState?.state === "cluster_gap_paused";
  const activeMode = activeState !== null && activeState.state !== "idle"
    ? activeState.mode
    : null;
  const controlsDisabled = disabled || busy || targetSetId === null;

  useEffect(() => {
    if (resolvedConfig?.mode === "per_rep") {
      setDraftMode("per_rep");
      setIntervalSeconds(String(resolvedConfig.intervalMs / 1_000));
      return;
    }
    if (resolvedConfig?.mode === "cluster") {
      setDraftMode("cluster");
      setClusterPattern(resolvedConfig.groupSizes.join("+"));
      setClusterGapSeconds(String(resolvedConfig.intraRestMs / 1_000));
    }
  }, [resolvedConfig, targetSetId]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      appStateRef.current = nextState;
      foregroundSinceMsRef.current = nextState === "active" ? nowMs() : null;
    });
    return () => subscription.remove();
  }, [nowMs]);

  useEffect(() => {
    if (!isRunning || activeState === null) {
      return;
    }
    const interval = setInterval(() => {
      const currentNowMs = nowMs();
      setDisplayNowMs(currentNowMs);
      const previousForegroundMs = foregroundSinceMsRef.current;
      foregroundSinceMsRef.current = currentNowMs;
      const nextBoundaryAtMs = activeState.state === "running"
        ? activeState.nextBoundaryAtMs
        : activeState.gapEndsAtMs;
      if (
        appStateRef.current !== "active"
        || previousForegroundMs === null
        || (activeState.state !== "running" && activeState.state !== "cluster_gap_running")
        || currentNowMs < nextBoundaryAtMs
        || reconcileInFlightRef.current
        || reconciledRevisionRef.current === activeState.revision
      ) {
        return;
      }
      reconcileInFlightRef.current = true;
      void onReconcile(previousForegroundMs)
        .then(() => {
          reconciledRevisionRef.current = activeState.revision;
        })
        .catch(() => {
          reconciledRevisionRef.current = null;
          setCommandFailed(true);
        })
        .finally(() => {
          reconcileInFlightRef.current = false;
        });
    }, 1_000);
    return () => clearInterval(interval);
  }, [activeState, isRunning, nowMs, onReconcile]);

  const submitStart = async () => {
    const seconds = Number(intervalSeconds);
    if (
      !Number.isSafeInteger(seconds)
      || seconds < 1
      || seconds > ADVANCED_TIMING_MAX_INTERVAL_MS / 1_000
    ) {
      setValidation("Enter whole seconds from 1 to 60.");
      return;
    }
    setValidation(undefined);
    setCommandFailed(false);
    try {
      await onConfigureAndStart({
        version: 1,
        mode: "per_rep",
        intervalMs: seconds * 1_000,
        cueChannels: resolvedConfig?.mode === "per_rep"
          ? resolvedConfig.cueChannels
          : "haptic",
      });
    } catch {
      setCommandFailed(true);
    }
  };

  const submitClusterStart = async () => {
    let groupSizes: readonly number[];
    try {
      groupSizes = parseClusterPattern(clusterPattern);
    } catch {
      setValidation("Use groups like 3+3+3 with at least 2 groups.");
      return;
    }
    const seconds = Number(clusterGapSeconds);
    if (
      !Number.isSafeInteger(seconds)
      || seconds < 1
      || seconds > ADVANCED_TIMING_MAX_INTERVAL_MS / 1_000
    ) {
      setValidation("Enter cluster rest seconds from 1 to 60.");
      return;
    }
    setValidation(undefined);
    setCommandFailed(false);
    try {
      await onConfigureAndStartCluster({
        version: 1,
        mode: "cluster",
        groupSizes,
        intraRestMs: seconds * 1_000,
        cueChannels: resolvedConfig?.mode === "cluster"
          ? resolvedConfig.cueChannels
          : "haptic",
      });
    } catch {
      setCommandFailed(true);
    }
  };

  const runCommand = async (
    command: () => Promise<AdvancedTimingCommandResult>,
  ) => {
    setCommandFailed(false);
    try {
      await command();
    } catch {
      setCommandFailed(true);
    }
  };

  const statusText = activeState === null
    ? "Ready"
    : activeState.state === "running"
      ? `Rep ${activeState.nextRepetitionIndex} · ${
        formatDuration(activeState.nextBoundaryAtMs - displayNowMs)
      }`
      : activeState.state === "cluster_gap_running"
        ? `Intra-set rest · ${
          formatDuration(activeState.gapEndsAtMs - displayNowMs)
        }`
      : controlLabel(activeState);
  const progressText = clusterProgressLabel(activeState);
  const title = activeMode === "cluster" || draftMode === "cluster"
    ? "Cluster timing"
    : "Per-rep cadence";
  const statusMode = activeMode ?? draftMode;
  const clusterStatusText = progressText === null || progressText === statusText
    ? statusText
    : `${progressText}. ${statusText}`;
  const statusAccessibilityLabel = statusMode === "cluster"
    ? `Cluster timing status. ${clusterStatusText}`
    : `Per-rep cadence status. ${statusText}`;
  const canStartClusterGap = activeState?.state === "cluster_ready"
    && activeState.currentGroupIndex < activeState.groupSizes.length - 1;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.surface,
          borderColor: colors.divider,
        },
      ]}
      testID="advanced-timing-indicator"
    >
      {cueUnavailable ? (
        <InlineNotice
          body="The timer and recorded set remain accurate."
          heading="Timing cue unavailable"
          tone="attention"
        />
      ) : null}
      {commandFailed ? (
        <InlineNotice
          body="Your workout facts were not changed. Try again from the latest set."
          heading="Timing could not be updated"
          tone="error"
        />
      ) : null}
      <View style={styles.header}>
        <Timer
          accessibilityElementsHidden
          color={colors.textSecondary}
          importantForAccessibility="no-hide-descendants"
          size={sizes.inlineIcon}
          strokeWidth={2}
        />
        <View style={styles.copy}>
          <Text
            accessibilityRole="header"
            style={[typeScale.bodyStrong as TextStyle, { color: colors.textPrimary }]}
          >
            {title}
          </Text>
          {progressText === null ? null : (
            <Text style={[typeScale.secondary as TextStyle, { color: colors.textSecondary }]}>
              {progressText}
            </Text>
          )}
          <Text
            accessibilityLabel={statusAccessibilityLabel}
            style={[typeScale.secondary as TextStyle, { color: colors.textSecondary }]}
          >
            {statusText}
          </Text>
        </View>
      </View>
      {isClusterReady ? (
        <View style={styles.controls}>
          {canStartClusterGap ? (
            <TimingControl
              accessibilityLabel={`Start rest after group ${activeState.currentGroupIndex + 1}`}
              disabled={controlsDisabled}
              icon={Play}
              label={`Rest after group ${activeState.currentGroupIndex + 1}`}
              onPress={() => {
                void runCommand(onBeginClusterGap);
              }}
              testID="advanced-timing-cluster-begin-gap"
            />
          ) : null}
          <TimingControl
            accessibilityLabel="Stop cluster timing"
            disabled={controlsDisabled}
            icon={Square}
            label="Stop"
            onPress={() => {
              void runCommand(onStop);
            }}
            testID="advanced-timing-stop"
          />
        </View>
      ) : isRunning || isPaused ? (
        <View style={styles.controls}>
          <TimingControl
            accessibilityLabel={
              activeState?.mode === "cluster"
                ? isPaused ? "Resume intra-set rest" : "Pause intra-set rest"
                : isPaused ? "Resume per-rep cadence" : "Pause per-rep cadence"
            }
            disabled={controlsDisabled}
            icon={isPaused ? Play : Pause}
            label={isPaused ? "Resume" : "Pause"}
            onPress={() => {
              void runCommand(isPaused ? onResume : onPause);
            }}
            testID={isPaused ? "advanced-timing-resume" : "advanced-timing-pause"}
          />
          {isClusterGap ? (
            <TimingControl
              accessibilityLabel="Skip intra-set rest"
              disabled={controlsDisabled}
              icon={SkipForward}
              label="Skip"
              onPress={() => {
                void runCommand(onSkipClusterGap);
              }}
              testID="advanced-timing-cluster-skip-gap"
            />
          ) : null}
          <TimingControl
            accessibilityLabel={activeState?.mode === "cluster"
              ? "Stop cluster timing"
              : "Stop per-rep cadence"}
            disabled={controlsDisabled}
            icon={Square}
            label="Stop"
            onPress={() => {
              void runCommand(onStop);
            }}
            testID="advanced-timing-stop"
          />
        </View>
      ) : (
        <View style={styles.configure}>
          <View style={styles.modeSwitch}>
            <TimingControl
              accessibilityLabel="Select per-rep cadence"
              disabled={controlsDisabled}
              icon={Timer}
              label="Per-rep"
              onPress={() => {
                setDraftMode("per_rep");
                setValidation(undefined);
              }}
              selected={draftMode === "per_rep"}
              testID="advanced-timing-mode-per-rep"
            />
            <TimingControl
              accessibilityLabel="Select cluster timing"
              disabled={controlsDisabled}
              icon={Timer}
              label="Cluster"
              onPress={() => {
                setDraftMode("cluster");
                setValidation(undefined);
              }}
              selected={draftMode === "cluster"}
              testID="advanced-timing-mode-cluster"
            />
          </View>
          {draftMode === "per_rep" ? (
            <>
              <SemanticNumberField
                kind="integer"
                label="Per-rep interval in seconds"
                maximum={60}
                minimum={1}
                onChangeText={setIntervalSeconds}
                testID="advanced-timing-interval-seconds"
                value={intervalSeconds}
                {...(validation === undefined ? {} : { error: validation })}
              />
              <TimingControl
                accessibilityLabel="Configure and start per-rep cadence"
                disabled={controlsDisabled}
                icon={Play}
                label="Start"
                onPress={() => {
                  void submitStart();
                }}
                testID="advanced-timing-start"
              />
            </>
          ) : (
            <>
              <View style={styles.field}>
                <Text style={[typeScale.label as TextStyle, { color: colors.textPrimary }]}>
                  Cluster grouping
                </Text>
                <TextInput
                  accessibilityLabel="Cluster grouping"
                  autoCapitalize="none"
                  autoCorrect={false}
                  onChangeText={setClusterPattern}
                  style={[
                    typeScale.body as TextStyle,
                    styles.input,
                    {
                      backgroundColor: colors.surface,
                      borderColor: validation === undefined
                        ? colors.divider
                        : colors.destructive,
                      color: colors.textPrimary,
                    },
                  ]}
                  testID="advanced-timing-cluster-pattern"
                  value={clusterPattern}
                />
              </View>
              <SemanticNumberField
                kind="integer"
                label="Cluster gap in seconds"
                maximum={60}
                minimum={1}
                onChangeText={setClusterGapSeconds}
                testID="advanced-timing-cluster-gap-seconds"
                value={clusterGapSeconds}
              />
              {validation === undefined ? null : (
                <Text
                  accessibilityLiveRegion="polite"
                  style={[typeScale.secondary as TextStyle, { color: colors.destructive }]}
                >
                  {validation}
                </Text>
              )}
              <TimingControl
                accessibilityLabel="Configure and start cluster timing"
                disabled={controlsDisabled}
                icon={Play}
                label="Start cluster"
                onPress={() => {
                  void submitClusterStart();
                }}
                testID="advanced-timing-cluster-start"
              />
            </>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.standard,
    borderWidth: StyleSheet.hairlineWidth,
    gap: space[2],
    padding: space[2],
  },
  configure: {
    gap: space[2],
  },
  field: {
    gap: space[1],
  },
  input: {
    borderRadius: radius.standard,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: sizes.minimumTarget,
    paddingHorizontal: space[4],
    paddingVertical: space[2],
  },
  modeSwitch: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space[2],
  },
  controls: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space[2],
  },
  control: {
    alignItems: "center",
    borderRadius: radius.standard,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: space[1],
    justifyContent: "center",
    minHeight: sizes.minimumTarget,
    minWidth: sizes.minimumTarget,
    paddingHorizontal: space[2],
  },
  copy: {
    flex: 1,
    gap: space[1],
    minWidth: 0,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: space[2],
  },
});
