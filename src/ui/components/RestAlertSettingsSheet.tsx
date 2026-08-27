import React, {
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
  type TextStyle,
} from "react-native";

import type {
  RestAlertPreferences,
  RestNotificationPermission,
} from "../../domains/rest";
import type {
  RestAlertPreferenceSaveResult,
} from "../../bootstrap/workoutAppRuntime";
import {
  FocusablePressable,
  SecondaryAction,
  SkeletonBlock,
} from "./index";
import {
  radius,
  sizes,
  space,
  typeScale,
  useAppTheme,
} from "../theme";

function samePreferences(
  left: RestAlertPreferences,
  right: RestAlertPreferences,
): boolean {
  return left.soundEnabled === right.soundEnabled
    && left.vibrationEnabled === right.vibrationEnabled;
}

function containsPreferences(
  values: readonly RestAlertPreferences[],
  preferences: RestAlertPreferences,
): boolean {
  return values.some((value) => samePreferences(value, preferences));
}

export function RestAlertSettingsSheet({
  visible,
  loading = false,
  onClose,
  restoreFocusRef,
  preferences,
  onChange,
  notificationPermission,
  onOpenNotificationSettings,
  onOpenAppearance,
}: Readonly<{
  visible: boolean;
  loading?: boolean;
  onClose(): void;
  restoreFocusRef?: React.RefObject<View | null>;
  preferences: RestAlertPreferences;
  onChange(
    preferences: RestAlertPreferences,
  ): void | Promise<void | RestAlertPreferenceSaveResult>;
  notificationPermission: RestNotificationPermission;
  onOpenNotificationSettings(): void | Promise<void>;
  onOpenAppearance(): void;
}>) {
  const { colors, reduceMotion } = useAppTheme();
  const headingRef = useRef<View>(null);
  const latestPreferencesRef = useRef(preferences);
  const latestExternalPreferencesRef = useRef(preferences);
  const pendingExternalPreferencesRef =
    useRef<RestAlertPreferences | null>(null);
  const submittedPreferencesRef = useRef<RestAlertPreferences[]>([]);
  const pendingWritesRef = useRef(0);
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());
  const wasVisibleRef = useRef(false);
  const [optimisticPreferences, setOptimisticPreferences] = useState(
    preferences,
  );
  const [saveFailed, setSaveFailed] = useState(false);

  useEffect(() => {
    if (visible && !wasVisibleRef.current) {
      if (pendingWritesRef.current === 0) {
        setSaveFailed(false);
      }
      headingRef.current?.focus();
    }
    wasVisibleRef.current = visible;
  }, [visible]);

  useEffect(() => {
    if (samePreferences(latestExternalPreferencesRef.current, preferences)) {
      return;
    }
    latestExternalPreferencesRef.current = preferences;
    if (pendingWritesRef.current !== 0) {
      if (!containsPreferences(submittedPreferencesRef.current, preferences)) {
        pendingExternalPreferencesRef.current = preferences;
      }
      return;
    }
    latestPreferencesRef.current = preferences;
    setOptimisticPreferences((current) => (
      samePreferences(current, preferences)
        ? current
        : preferences
    ));
  }, [preferences]);

  function close() {
    onClose();
    restoreFocusRef?.current?.focus();
  }

  function change(next: RestAlertPreferences) {
    setSaveFailed(false);
    latestPreferencesRef.current = next;
    setOptimisticPreferences(next);
    submittedPreferencesRef.current = [
      ...submittedPreferencesRef.current,
      next,
    ];
    pendingWritesRef.current += 1;
    const write = async () => {
      setSaveFailed(false);
      try {
        const result = await onChange(next) ?? {
          status: "persisted" as const,
          preferences: next,
        };
        if (samePreferences(latestPreferencesRef.current, next)) {
          latestPreferencesRef.current = result.preferences;
          setOptimisticPreferences(result.preferences);
        }
        if (result.status !== "persisted") {
          setSaveFailed(true);
        } else {
          setSaveFailed(false);
        }
      } catch {
        if (samePreferences(latestPreferencesRef.current, next)) {
          latestPreferencesRef.current = latestExternalPreferencesRef.current;
          setOptimisticPreferences(latestExternalPreferencesRef.current);
        }
        setSaveFailed(true);
      } finally {
        pendingWritesRef.current -= 1;
        if (pendingWritesRef.current === 0) {
          submittedPreferencesRef.current = [];
          const externalPreferences = pendingExternalPreferencesRef.current;
          if (externalPreferences !== null) {
            pendingExternalPreferencesRef.current = null;
            latestPreferencesRef.current = externalPreferences;
            setOptimisticPreferences(externalPreferences);
          }
        }
      }
    };
    writeQueueRef.current = writeQueueRef.current.then(write, write)
      .catch(() => undefined);
  }

  return (
    <Modal
      animationType={reduceMotion ? "none" : "fade"}
      onRequestClose={loading ? () => undefined : close}
      transparent
      visible={visible}
    >
      <View accessibilityViewIsModal style={styles.backdrop}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          style={[styles.sheet, { backgroundColor: colors.surface }]}
          testID="rest-alert-settings-sheet-content"
        >
          <View
            accessibilityRole="header"
            accessible
            focusable
            ref={headingRef}
          >
            <Text style={[typeScale.screenTitle as TextStyle, { color: colors.textPrimary }]}>
              Rest alerts
            </Text>
          </View>
          <Text style={[typeScale.body as TextStyle, { color: colors.textSecondary }]}>
            Choose feedback for rest completion. The in-app timer remains the
            authoritative workout record.
          </Text>
          {loading ? (
            <View
              accessibilityLabel="Loading rest alert settings"
              accessibilityLiveRegion="polite"
              accessibilityRole="progressbar"
              accessibilityState={{ busy: true, disabled: true }}
              accessible
              style={styles.loadingSettings}
            >
              <LoadingSettingSwitchRow setting="sound" />
              <LoadingSettingSwitchRow setting="vibration" />
            </View>
          ) : (
            <>
              <SettingSwitch
                hint="Plays a short tone when a rest ends."
                label="Rest sound"
                onValueChange={(soundEnabled) => change({
                  ...latestPreferencesRef.current,
                  soundEnabled,
                })}
                value={optimisticPreferences.soundEnabled}
              />
              {saveFailed ? (
                <Text
                  accessibilityRole="alert"
                  style={[typeScale.body as TextStyle, { color: colors.timerAttention }]}
                >
                  Rest alert setting was not saved
                </Text>
              ) : null}
              <SettingSwitch
                hint="Vibrates when a rest ends."
                label="Rest vibration"
                onValueChange={(vibrationEnabled) => change({
                  ...latestPreferencesRef.current,
                  vibrationEnabled,
                })}
                value={optimisticPreferences.vibrationEnabled}
              />
            </>
          )}
          {notificationPermission === "denied" ? (
            <View style={[styles.denied, { borderColor: colors.timerAttention }]}>
              <Text style={[typeScale.sectionTitle as TextStyle, { color: colors.textPrimary }]}>
                Background rest alerts are off
              </Text>
              <Text style={[typeScale.body as TextStyle, { color: colors.textSecondary }]}>
                Your in-app timer stays accurate. Allow notifications in Android
                settings for background rest alerts.
              </Text>
              <SecondaryAction
                disabled={loading}
                label="Open notification settings"
                onPress={() => { void onOpenNotificationSettings(); }}
              />
            </View>
          ) : null}
          <SecondaryAction
            disabled={loading}
            label="Appearance"
            onPress={onOpenAppearance}
          />
          <SecondaryAction
            disabled={loading}
            label="Close rest alerts"
            onPress={close}
          />
        </ScrollView>
      </View>
    </Modal>
  );
}

function LoadingSettingSwitchRow({
  setting,
}: Readonly<{
  setting: "sound" | "vibration";
}>) {
  const { colors } = useAppTheme();
  return (
    <View
      importantForAccessibility="no-hide-descendants"
      style={[styles.setting, { borderColor: colors.divider }]}
      testID={`rest-alert-${setting}-loading-row`}
    >
      <View style={styles.settingCopy}>
        <SkeletonBlock height={20} width="58%" />
        <SkeletonBlock height={16} width="24%" />
      </View>
      <SkeletonBlock
        height={32}
        testID={`rest-alert-${setting}-loading-switch`}
        width={52}
      />
    </View>
  );
}

function SettingSwitch({
  label,
  hint,
  value,
  onValueChange,
}: Readonly<{
  label: string;
  hint: string;
  value: boolean;
  onValueChange(value: boolean): void;
}>) {
  const { colors } = useAppTheme();
  return (
    <FocusablePressable
      accessibilityHint={hint}
      accessibilityLabel={label}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      focusable
      onPress={() => onValueChange(!value)}
      style={[styles.setting, { borderColor: colors.divider }]}
      testID={`rest-alert-${label === "Rest sound" ? "sound" : "vibration"}`}
    >
      <View style={styles.settingCopy}>
        <Text style={[typeScale.sectionTitle as TextStyle, { color: colors.textPrimary }]}>
          {label}
        </Text>
        <Text style={[typeScale.secondary as TextStyle, { color: colors.textSecondary }]}>
          {value ? "On" : "Off"}
        </Text>
      </View>
      <Switch
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        onValueChange={onValueChange}
        pointerEvents="none"
        value={value}
      />
    </FocusablePressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: "rgba(0, 0, 0, 0.48)",
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: radius.emphasized,
    borderTopRightRadius: radius.emphasized,
    maxHeight: "90%",
  },
  content: {
    gap: space[4],
    padding: space[6],
  },
  setting: {
    alignItems: "center",
    borderRadius: radius.standard,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: space[2],
    justifyContent: "space-between",
    minHeight: sizes.minimumTarget,
    paddingHorizontal: space[4],
    paddingVertical: space[2],
  },
  settingCopy: {
    flex: 1,
    gap: space[1],
  },
  loadingSettings: {
    gap: space[4],
  },
  denied: {
    borderLeftWidth: 4,
    gap: space[2],
    paddingLeft: space[2],
  },
});
