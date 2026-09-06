import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Pause,
  Play,
  SkipForward,
  ChevronDown,
  ChevronUp,
  type LucideIcon,
} from "lucide-react-native";
import {
  StyleSheet,
  Text,
  View,
  AppState,
  type AppStateStatus,
  type TextStyle,
} from "react-native";

import type {
  RestNotificationPermission,
  RestStateV1,
} from "../../domains/rest";
import {
  remainingRestMs,
} from "../../domains/rest";
import type {
  RestCountdownCuePort,
} from "../../domains/rest/restCountdownCuePort";
import {
  InlineNotice,
  FocusablePressable,
  SecondaryAction,
} from "./index";
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

function thresholdMessage(durationMs: number): string | null {
  const seconds = Math.ceil(durationMs / 1_000);
  if (seconds === 60) {
    return "1 minute remaining";
  }
  if (seconds === 30) {
    return "30 seconds remaining";
  }
  if (seconds === 10) {
    return "10 seconds remaining";
  }
  if (seconds === 0) {
    return "Rest ended";
  }
  return null;
}

function RestControl({
  accessibilityLabel,
  disabled,
  icon: Icon,
  onPress,
  testID,
}: Readonly<{
  accessibilityLabel: string;
  disabled: boolean;
  icon: LucideIcon;
  onPress: () => void;
  testID: string;
}>) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.control} testID={testID}>
      <FocusablePressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled}
        focusable={!disabled}
        onPress={onPress}
        style={({ pressed }) => [
          styles.controlButton,
          {
            backgroundColor: pressed ? colors.surfaceSubtle : colors.surface,
            borderColor: colors.divider,
            opacity: disabled ? 0.62 : 1,
          },
        ]}
      >
        <Icon
          accessibilityElementsHidden
          color={colors.textPrimary}
          importantForAccessibility="no-hide-descendants"
          size={sizes.inlineIcon}
          strokeWidth={2}
        />
      </FocusablePressable>
    </View>
  );
}

function RestTextControl({
  accessibilityLabel,
  disabled,
  label,
  onPress,
  testID,
}: Readonly<{
  accessibilityLabel: string;
  disabled: boolean;
  label: string;
  onPress: () => void;
  testID: string;
}>) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.control} testID={testID}>
      <FocusablePressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled}
        focusable={!disabled}
        onPress={onPress}
        style={({ pressed }) => [
          styles.controlButton,
          {
            backgroundColor: pressed ? colors.surfaceSubtle : colors.surface,
            borderColor: colors.divider,
            opacity: disabled ? 0.62 : 1,
          },
        ]}
      >
        <Text
          style={[
            typeScale.bodyStrong as TextStyle,
            { color: colors.textPrimary },
          ]}
        >
          {label}
        </Text>
      </FocusablePressable>
    </View>
  );
}

export function RestDock({
  state,
  nowMs,
  nextSetIndex,
  nextTarget,
  notificationPermission,
  busy = false,
  undo,
  onAdjust,
  onExpired,
  onOpenSettings,
  onPause,
  onResume,
  onSkip,
  restSoundEnabled = false,
  countdownCue,
}: Readonly<{
  state: Extract<RestStateV1, { state: "running" | "paused" }>;
  nowMs: () => number;
  nextSetIndex: number;
  nextTarget: string;
  notificationPermission: RestNotificationPermission;
  busy?: boolean;
  undo?: Readonly<{
    setIndex: number;
    secondsRemaining: number;
    onUndo: () => void;
  }>;
  onAdjust: (deltaMs: -15_000 | 15_000) => void;
  onExpired: () => void;
  onOpenSettings: () => void;
  onPause: () => void;
  onResume: () => void;
  onSkip: () => void;
  restSoundEnabled?: boolean;
  countdownCue?: RestCountdownCuePort | undefined;
}>) {
  const { colors } = useAppTheme();
  const [displayNowMs, setDisplayNowMs] = useState(nowMs());
  const [expanded, setExpanded] = useState(false);
  const expiredRef = useRef(false);
  const announcedRef = useRef<string | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const cueLedgerRef = useRef<Readonly<{
    emitted: ReadonlySet<number>;
  }> | null>(null);
  const previousRemainingSecondsRef = useRef<number | null>(null);
  const [cueFailure, setCueFailure] = useState(false);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      appStateRef.current = nextState;
      previousRemainingSecondsRef.current = null;
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (cueLedgerRef.current === null) {
      cueLedgerRef.current = {
        emitted: new Set(),
      };
      setCueFailure(false);
    }
  }, []);

  useEffect(() => {
    setDisplayNowMs(nowMs());
    if (state.state === "paused") {
      return;
    }
    const interval = setInterval(() => {
      setDisplayNowMs(nowMs());
    }, 1_000);
    return () => clearInterval(interval);
  }, [nowMs, state]);

  const remainingMs = remainingRestMs(state, displayNowMs);
  const remainingSeconds = Math.ceil(remainingMs / 1_000);
  const announcement = useMemo(
    () => thresholdMessage(remainingMs),
    [remainingMs],
  );

  useEffect(() => {
    if (announcement !== null) {
      announcedRef.current = announcement;
    }
    if (
      state.state === "running"
      && remainingMs === 0
      && !expiredRef.current
    ) {
      expiredRef.current = true;
      onExpired();
    }
    if (remainingMs > 0) {
      expiredRef.current = false;
    }
  }, [announcement, onExpired, remainingMs, state.state]);

  useEffect(() => {
    const previousSeconds = previousRemainingSecondsRef.current;
    previousRemainingSecondsRef.current = remainingSeconds;
    const ledger = cueLedgerRef.current;
    if (
      state.state !== "running"
      || !restSoundEnabled
      || countdownCue === undefined
      || appStateRef.current !== "active"
      || previousSeconds === null
      || previousSeconds < remainingSeconds
      || ledger === null
    ) {
      return;
    }
    if (
      ![3, 2, 1, 0].includes(remainingSeconds)
      || previousSeconds !== remainingSeconds + 1
      || ledger.emitted.has(remainingSeconds)
    ) {
      return;
    }
    cueLedgerRef.current = {
      ...ledger,
      emitted: new Set([...ledger.emitted, remainingSeconds]),
    };
    void (remainingSeconds === 0
      ? countdownCue.playLongCue()
      : countdownCue.playShortCue()
    ).catch(() => setCueFailure(true));
  }, [countdownCue, remainingSeconds, restSoundEnabled, state.state]);

  const label = state.state === "paused"
    ? `REST PAUSED · NEXT: SET ${nextSetIndex} AT ${nextTarget}`
    : `RESTING · NEXT: SET ${nextSetIndex} AT ${nextTarget}`;

  return (
    <View
      style={[
        styles.dock,
        {
          backgroundColor: colors.surface,
          borderColor: colors.divider,
        },
      ]}
    >
      {notificationPermission === "denied" ? (
        <InlineNotice
          action={
            <SecondaryAction
              label="Open notification settings"
              onPress={onOpenSettings}
            />
          }
          body="The in-app timer stays accurate. You can allow notifications from Android settings."
          heading="Background rest alerts are off"
          tone="attention"
        />
      ) : null}
      {cueFailure ? (
        <InlineNotice
          body="The timer is still accurate. Keep watching the countdown."
          heading="Countdown sound unavailable"
          tone="attention"
        />
      ) : null}
      <Text
        style={[
          typeScale.label as TextStyle,
          { color: colors.textSecondary },
        ]}
      >
        {label}
      </Text>
      <Text
        accessibilityLabel={`${formatDuration(remainingMs)} remaining`}
        accessibilityLiveRegion="none"
        style={[
          typeScale.displayTimer as TextStyle,
          { color: remainingMs === 0 ? colors.timerAttention : colors.textPrimary },
        ]}
      >
        {formatDuration(remainingMs)}
      </Text>
      <RestControl
        accessibilityLabel={expanded
          ? "Collapse rest controls"
          : "Expand rest controls"}
        disabled={false}
        icon={expanded ? ChevronUp : ChevronDown}
        onPress={() => setExpanded((current) => !current)}
        testID="rest-collapse-toggle"
      />
      {announcement === null ? null : (
        <Text
          accessibilityLiveRegion="polite"
          style={[
            typeScale.secondary as TextStyle,
            { color: colors.textSecondary },
          ]}
        >
          {announcement}
        </Text>
      )}
      {expanded ? (
        <View style={styles.controls} testID="rest-controls">
          <RestControl
            accessibilityLabel="Skip rest"
            disabled={busy}
            icon={SkipForward}
            onPress={onSkip}
            testID="rest-control-Skip rest"
          />
          <RestControl
            accessibilityLabel={state.state === "paused" ? "Resume rest" : "Pause rest"}
            disabled={busy || remainingMs === 0}
            icon={state.state === "paused" ? Play : Pause}
            onPress={state.state === "paused" ? onResume : onPause}
            testID={`rest-control-${
              state.state === "paused" ? "Resume rest" : "Pause rest"
            }`}
          />
          <RestTextControl
            accessibilityLabel="Subtract 15 seconds"
            disabled={busy || remainingMs === 0}
            label="−15"
            onPress={() => onAdjust(-15_000)}
            testID="rest-control-Subtract 15 seconds"
          />
          <RestTextControl
            accessibilityLabel="Add 15 seconds"
            disabled={busy || remainingMs === 0}
            label="+15"
            onPress={() => onAdjust(15_000)}
            testID="rest-control-Add 15 seconds"
          />
        </View>
      ) : null}
      {expanded && undo !== undefined ? (
        <View style={styles.undo}>
          <Text
            style={[
              typeScale.secondary as TextStyle,
              { color: colors.textSecondary },
            ]}
          >
            {`Set ${undo.setIndex} saved · Undo set (${undo.secondsRemaining} sec)`}
          </Text>
          <SecondaryAction
            disabled={busy}
            label="Undo completed set"
            onPress={undo.onUndo}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  dock: {
    borderRadius: radius.emphasized,
    borderWidth: StyleSheet.hairlineWidth,
    gap: space[2],
    padding: space[4],
  },
  controls: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space[1],
  },
  control: {
    flexBasis: sizes.minimumTarget,
    flexGrow: 1,
    minWidth: 0,
  },
  controlButton: {
    alignItems: "center",
    borderRadius: radius.standard,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: "center",
    minHeight: sizes.minimumTarget,
    minWidth: sizes.minimumTarget,
  },
  undo: {
    gap: space[2],
  },
});
