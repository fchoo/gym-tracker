import {
  Pause,
  Play,
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
  View,
  type AppStateStatus,
  type TextStyle,
} from "react-native";

import type {
  AdvancedTimingCommandResult,
  AdvancedTimingStateV1,
} from "../../domains/advancedTiming";
import {
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
    return `Stopped · Rep ${state.nextRepetitionIndex}`;
  }
  return "Ready";
}

function TimingControl({
  accessibilityLabel,
  disabled,
  icon: Icon,
  label,
  onPress,
  testID,
}: Readonly<{
  accessibilityLabel: string;
  disabled: boolean;
  icon: typeof Play;
  label: string;
  onPress(): void;
  testID: string;
}>) {
  const { colors } = useAppTheme();
  return (
    <FocusablePressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      focusable={!disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.control,
        {
          backgroundColor: pressed ? colors.surfaceSubtle : colors.surface,
          borderColor: colors.divider,
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

export function AdvancedTimingIndicator({
  busy = false,
  context,
  cueUnavailable = false,
  disabled = false,
  nowMs,
  onConfigureAndStart,
  onPause,
  onReconcile,
  onResume,
  onStop,
  targetSetId,
}: Readonly<{
  busy?: boolean;
  context: AdvancedTimingIndicatorContext | null;
  cueUnavailable?: boolean;
  disabled?: boolean;
  nowMs(): number;
  onConfigureAndStart(intervalMs: number): Promise<AdvancedTimingCommandResult>;
  onPause(): Promise<AdvancedTimingCommandResult>;
  onReconcile(foregroundSinceMs: number): Promise<AdvancedTimingCommandResult>;
  onResume(): Promise<AdvancedTimingCommandResult>;
  onStop(): Promise<AdvancedTimingCommandResult>;
  targetSetId: string | null;
}>) {
  const { colors } = useAppTheme();
  const [intervalSeconds, setIntervalSeconds] = useState("3");
  const [displayNowMs, setDisplayNowMs] = useState(nowMs());
  const [validation, setValidation] = useState<string | undefined>();
  const [commandFailed, setCommandFailed] = useState(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const foregroundSinceMsRef = useRef<number | null>(
    AppState.currentState === "active" ? nowMs() : null,
  );
  const reconcileInFlightRef = useRef(false);
  const state = context?.state ?? null;
  const activeState = state?.targetSessionSetId === targetSetId ? state : null;
  const isRunning = activeState?.state === "running";
  const isPaused = activeState?.state === "paused";
  const controlsDisabled = disabled || busy || targetSetId === null;

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      appStateRef.current = nextState;
      foregroundSinceMsRef.current = nextState === "active" ? nowMs() : null;
    });
    return () => subscription.remove();
  }, [nowMs]);

  useEffect(() => {
    if (!isRunning) {
      return;
    }
    const interval = setInterval(() => {
      const currentNowMs = nowMs();
      setDisplayNowMs(currentNowMs);
      const previousForegroundMs = foregroundSinceMsRef.current;
      foregroundSinceMsRef.current = currentNowMs;
      if (
        appStateRef.current !== "active"
        || previousForegroundMs === null
        || activeState.state !== "running"
        || currentNowMs < activeState.nextBoundaryAtMs
        || reconcileInFlightRef.current
      ) {
        return;
      }
      reconcileInFlightRef.current = true;
      void onReconcile(previousForegroundMs)
        .catch(() => setCommandFailed(true))
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
      await onConfigureAndStart(seconds * 1_000);
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
      : controlLabel(activeState);

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
            Per-rep cadence
          </Text>
          <Text
            accessibilityLabel={`Per-rep cadence status. ${statusText}`}
            style={[typeScale.secondary as TextStyle, { color: colors.textSecondary }]}
          >
            {statusText}
          </Text>
        </View>
      </View>
      {isRunning || isPaused ? (
        <View style={styles.controls}>
          <TimingControl
            accessibilityLabel={isPaused ? "Resume per-rep cadence" : "Pause per-rep cadence"}
            disabled={controlsDisabled}
            icon={isPaused ? Play : Pause}
            label={isPaused ? "Resume" : "Pause"}
            onPress={() => {
              void runCommand(isPaused ? onResume : onPause);
            }}
            testID={isPaused ? "advanced-timing-resume" : "advanced-timing-pause"}
          />
          <TimingControl
            accessibilityLabel="Stop per-rep cadence"
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
          <SemanticNumberField
            help="Haptic cue only for this slice"
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
