import {
  Check,
  Clock3,
  Music,
  TimerOff,
} from "lucide-react-native";
import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Modal,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextStyle,
} from "react-native";

import type {
  AdvancedTimingConfigV1,
  AdvancedTimingCueChannels,
} from "../../domains/advancedTiming";
import {
  ADVANCED_TIMING_MAX_CLUSTER_GROUPS,
  ADVANCED_TIMING_MAX_CLUSTER_TOTAL_REPS,
  ADVANCED_TIMING_MAX_INTERVAL_MS,
  OFF_ADVANCED_TIMING_CONFIG,
  canonicalAdvancedTimingConfig,
} from "../../domains/advancedTiming";
import {
  FocusablePressable,
  InlineNotice,
  PrimaryAction,
  SecondaryAction,
  SectionHeader,
} from "./index";
import {
  radius,
  sizes,
  space,
  typeScale,
  useAppTheme,
} from "../theme";

export type AdvancedTimingConfigScope = "exercise" | "set";

type DraftMode = AdvancedTimingConfigV1["mode"] | "inherit";

type DraftState = Readonly<{
  mode: DraftMode;
  intervalSeconds: string;
  clusterPattern: string;
  clusterGapSeconds: string;
  cueChannels: AdvancedTimingCueChannels;
}>;

const DEFAULT_PER_REP_SECONDS = "3";
const DEFAULT_CLUSTER_PATTERN = "3+3+3";
const DEFAULT_CLUSTER_GAP_SECONDS = "20";

function secondsFromMs(value: number): string {
  return String(value / 1_000);
}

function draftFromValue(
  value: AdvancedTimingConfigV1 | null,
  scope: AdvancedTimingConfigScope,
): DraftState {
  if (value === null) {
    return {
      mode: scope === "set" ? "inherit" : "off",
      intervalSeconds: DEFAULT_PER_REP_SECONDS,
      clusterPattern: DEFAULT_CLUSTER_PATTERN,
      clusterGapSeconds: DEFAULT_CLUSTER_GAP_SECONDS,
      cueChannels: "haptic",
    };
  }
  if (value.mode === "per_rep") {
    return {
      mode: "per_rep",
      intervalSeconds: secondsFromMs(value.intervalMs),
      clusterPattern: DEFAULT_CLUSTER_PATTERN,
      clusterGapSeconds: DEFAULT_CLUSTER_GAP_SECONDS,
      cueChannels: value.cueChannels,
    };
  }
  if (value.mode === "cluster") {
    return {
      mode: "cluster",
      intervalSeconds: DEFAULT_PER_REP_SECONDS,
      clusterPattern: value.groupSizes.join("+"),
      clusterGapSeconds: secondsFromMs(value.intraRestMs),
      cueChannels: value.cueChannels,
    };
  }
  return {
    mode: "off",
    intervalSeconds: DEFAULT_PER_REP_SECONDS,
    clusterPattern: DEFAULT_CLUSTER_PATTERN,
    clusterGapSeconds: DEFAULT_CLUSTER_GAP_SECONDS,
    cueChannels: "haptic",
  };
}

function parseWholeSeconds(value: string): number | null {
  const seconds = Number(value);
  const ms = seconds * 1_000;
  return Number.isSafeInteger(seconds)
      && seconds >= 1
      && ms <= ADVANCED_TIMING_MAX_INTERVAL_MS
    ? ms
    : null;
}

function parseClusterPattern(value: string): readonly number[] | null {
  const parts = value.split("+").map((part) => part.trim());
  if (
    parts.length < 2
    || parts.length > ADVANCED_TIMING_MAX_CLUSTER_GROUPS
    || parts.some((part) => part.length === 0 || !/^\d+$/u.test(part))
  ) {
    return null;
  }
  const groupSizes = parts.map((part) => Number(part));
  if (
    groupSizes.some((part) => !Number.isSafeInteger(part) || part <= 0)
    || groupSizes.reduce((total, part) => total + part, 0)
      > ADVANCED_TIMING_MAX_CLUSTER_TOTAL_REPS
  ) {
    return null;
  }
  return Object.freeze(groupSizes);
}

export function advancedTimingConfigSummary(
  value: AdvancedTimingConfigV1 | null | undefined,
  scope: AdvancedTimingConfigScope,
): string {
  if (value === null) {
    return scope === "set" ? "Inherits exercise timing" : "Off";
  }
  if (value === undefined || value.mode === "off") return "Off";
  if (value.mode === "per_rep") {
    return `Per-rep every ${secondsFromMs(value.intervalMs)} sec · ${value.cueChannels}`;
  }
  return `Cluster ${value.groupSizes.join("+")} · ${secondsFromMs(value.intraRestMs)} sec · ${value.cueChannels}`;
}

export function AdvancedTimingConfigSheet({
  initialValue,
  onCancel,
  onSave,
  scope,
  visible,
}: Readonly<{
  initialValue: AdvancedTimingConfigV1 | null;
  onCancel(): void;
  onSave(value: AdvancedTimingConfigV1 | null): void;
  scope: AdvancedTimingConfigScope;
  visible: boolean;
}>) {
  const { colors, reduceMotion } = useAppTheme();
  const [draft, setDraft] = useState<DraftState>(() =>
    draftFromValue(initialValue, scope)
  );
  const [error, setError] = useState<string | null>(null);
  const wasVisible = useRef(visible);

  useEffect(() => {
    if (visible && !wasVisible.current) {
      setDraft(draftFromValue(initialValue, scope));
      setError(null);
    }
    wasVisible.current = visible;
  }, [initialValue, scope, visible]);
  const modes = useMemo<readonly Readonly<{
    label: string;
    mode: DraftMode;
  }>[]>(() => [
    ...(scope === "set" ? [{ label: "Inherit", mode: "inherit" as const }] : []),
    { label: "Off", mode: "off" as const },
    { label: "Per-rep", mode: "per_rep" as const },
    { label: "Cluster", mode: "cluster" as const },
  ], [scope]);

  const save = () => {
    setError(null);
    if (draft.mode === "inherit") {
      onSave(null);
      return;
    }
    if (draft.mode === "off") {
      onSave(OFF_ADVANCED_TIMING_CONFIG);
      return;
    }
    if (draft.mode === "per_rep") {
      const intervalMs = parseWholeSeconds(draft.intervalSeconds);
      if (intervalMs === null) {
        setError("Enter whole seconds from 1 to 60.");
        return;
      }
      onSave(canonicalAdvancedTimingConfig({
        version: 1,
        mode: "per_rep",
        intervalMs,
        cueChannels: draft.cueChannels,
      }));
      return;
    }
    const groupSizes = parseClusterPattern(draft.clusterPattern);
    const intraRestMs = parseWholeSeconds(draft.clusterGapSeconds);
    if (groupSizes === null) {
      setError("Use groups like 3+3+3 with at least 2 groups.");
      return;
    }
    if (intraRestMs === null) {
      setError("Enter cluster rest seconds from 1 to 60.");
      return;
    }
    onSave(canonicalAdvancedTimingConfig({
      version: 1,
      mode: "cluster",
      groupSizes,
      intraRestMs,
      cueChannels: draft.cueChannels,
    }));
  };

  return (
    <Modal
      animationType={reduceMotion ? "none" : "fade"}
      transparent
      visible={visible}
      onRequestClose={onCancel}
    >
      <View style={styles.backdrop}>
        <View
          accessibilityRole="summary"
          style={[styles.sheet, { backgroundColor: colors.surface }]}
        >
          <SectionHeader
            supportingText={scope === "set" ? "Set timing" : "Exercise timing"}
            title="Timing"
            tone="card"
          />
          <View style={styles.segmented}>
            {modes.map(({ label, mode }) => (
              <FocusablePressable
                accessibilityLabel={`${label} timing`}
                accessibilityRole="button"
                accessibilityState={{ selected: draft.mode === mode }}
                focusable
                key={mode}
                onPress={() => setDraft((current) => ({ ...current, mode }))}
                style={[
                  styles.modeButton,
                  {
                    borderColor: draft.mode === mode
                      ? colors.action
                      : colors.divider,
                    backgroundColor: draft.mode === mode
                      ? colors.surfaceSubtle
                      : colors.surface,
                  },
                ]}
                testID={`advanced-timing-mode-${mode}`}
              >
                {mode === "off" || mode === "inherit" ? (
                  <TimerOff color={colors.textPrimary} size={sizes.inlineIcon} />
                ) : mode === "per_rep" ? (
                  <Clock3 color={colors.textPrimary} size={sizes.inlineIcon} />
                ) : (
                  <Check color={colors.textPrimary} size={sizes.inlineIcon} />
                )}
                <Text style={[typeScale.bodyStrong as TextStyle, { color: colors.textPrimary }]}>
                  {label}
                </Text>
              </FocusablePressable>
            ))}
          </View>
          {draft.mode === "per_rep" ? (
            <TextInput
              accessibilityLabel="Per-rep interval in seconds"
              keyboardType="number-pad"
              onChangeText={(intervalSeconds) =>
                setDraft((current) => ({ ...current, intervalSeconds }))}
              style={[styles.input, { borderColor: colors.divider, color: colors.textPrimary }]}
              testID="advanced-timing-config-interval"
              value={draft.intervalSeconds}
            />
          ) : null}
          {draft.mode === "cluster" ? (
            <>
              <TextInput
                accessibilityLabel="Cluster group pattern"
                onChangeText={(clusterPattern) =>
                  setDraft((current) => ({ ...current, clusterPattern }))}
                style={[styles.input, { borderColor: colors.divider, color: colors.textPrimary }]}
                testID="advanced-timing-config-cluster-pattern"
                value={draft.clusterPattern}
              />
              <TextInput
                accessibilityLabel="Cluster rest in seconds"
                keyboardType="number-pad"
                onChangeText={(clusterGapSeconds) =>
                  setDraft((current) => ({ ...current, clusterGapSeconds }))}
                style={[styles.input, { borderColor: colors.divider, color: colors.textPrimary }]}
                testID="advanced-timing-config-cluster-rest"
                value={draft.clusterGapSeconds}
              />
            </>
          ) : null}
          {draft.mode === "per_rep" || draft.mode === "cluster" ? (
            <View style={styles.segmented}>
              {(["haptic", "audio", "both"] as const).map((channel) => (
                <FocusablePressable
                  accessibilityLabel={`${channel} cues`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: draft.cueChannels === channel }}
                  focusable
                  key={channel}
                  onPress={() => setDraft((current) => ({
                    ...current,
                    cueChannels: channel,
                  }))}
                  style={[
                    styles.modeButton,
                    {
                      borderColor: draft.cueChannels === channel
                        ? colors.action
                        : colors.divider,
                      backgroundColor: draft.cueChannels === channel
                        ? colors.surfaceSubtle
                        : colors.surface,
                    },
                  ]}
                  testID={`advanced-timing-channel-${channel}`}
                >
                  <Music color={colors.textPrimary} size={sizes.inlineIcon} />
                  <Text style={[typeScale.bodyStrong as TextStyle, { color: colors.textPrimary }]}>
                    {channel}
                  </Text>
                </FocusablePressable>
              ))}
            </View>
          ) : null}
          {error === null ? null : (
            <InlineNotice
              body="Your timing choices are still here."
              heading={error}
              tone="error"
            />
          )}
          <View style={styles.actions}>
            <SecondaryAction label="Cancel" onPress={onCancel} />
            <PrimaryAction label="Save timing" onPress={save} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space[2],
    justifyContent: "flex-end",
  },
  backdrop: {
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.32)",
    flex: 1,
    justifyContent: "center",
    padding: space[4],
  },
  input: {
    borderRadius: radius.standard,
    borderWidth: 1,
    minHeight: sizes.minimumTarget,
    paddingHorizontal: space[4],
    paddingVertical: space[2],
  },
  modeButton: {
    alignItems: "center",
    borderRadius: radius.standard,
    borderWidth: 1,
    flexDirection: "row",
    gap: space[1],
    minHeight: sizes.minimumTarget,
    minWidth: sizes.minimumTarget,
    paddingHorizontal: space[4],
    paddingVertical: space[2],
  },
  segmented: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space[2],
  },
  sheet: {
    borderRadius: radius.emphasized,
    gap: space[4],
    maxWidth: 520,
    padding: space[4],
    width: "100%",
  },
});
