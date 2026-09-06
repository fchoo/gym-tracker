import {
  Check,
  Circle,
} from "lucide-react-native";
import React, {
  useEffect,
  useRef,
  useState,
} from "react";
import {
  StyleSheet,
  Switch,
  Text,
  View,
  type TextStyle,
} from "react-native";

import type {
  RestAlertPreferenceSaveResult,
} from "../../bootstrap/workoutAppRuntime";
import type {
  RestAlertPreferences,
  RestNotificationPermission,
} from "../../domains/rest";
import {
  ContentCard,
  FocusablePressable,
  ScreenHeader,
  SectionHeader,
  SecondaryAction,
  SkeletonBlock,
} from "../components";
import {
  AdaptiveScreen,
} from "../layout/AdaptiveScreen";
import {
  sizes,
  space,
  type AppearancePreference,
  typeScale,
  useAppTheme,
} from "../theme";

const appearanceOptions: readonly AppearancePreference[] = [
  "System",
  "Light",
  "Dark",
];

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

export type SettingsScreenProps = Readonly<{
  preferences: RestAlertPreferences;
  restAlertPreferencesLoading: boolean;
  notificationPermission: RestNotificationPermission;
  onBack(): void;
  onChangeRestAlertPreferences(
    preferences: RestAlertPreferences,
  ): void | Promise<void | RestAlertPreferenceSaveResult>;
  onOpenNotificationSettings(): void | Promise<void>;
  onOpenRemovedSessions(): void;
  onOpenDataAndRecovery(): void;
  width?: number;
}>;

export function SettingsScreen({
  preferences,
  restAlertPreferencesLoading,
  notificationPermission,
  onBack,
  onChangeRestAlertPreferences,
  onOpenNotificationSettings,
  onOpenRemovedSessions,
  onOpenDataAndRecovery,
  width,
}: SettingsScreenProps) {
  const { appearance, colors, setAppearance } = useAppTheme();
  const latestPreferencesRef = useRef(preferences);
  const latestExternalPreferencesRef = useRef(preferences);
  const pendingExternalPreferencesRef = useRef<RestAlertPreferences | null>(null);
  const submittedPreferencesRef = useRef<RestAlertPreferences[]>([]);
  const pendingWritesRef = useRef(0);
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());
  const [optimisticPreferences, setOptimisticPreferences] = useState(preferences);
  const [saveFailed, setSaveFailed] = useState(false);
  const adaptiveWidth = width === undefined ? {} : { width };

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
      samePreferences(current, preferences) ? current : preferences
    ));
  }, [preferences]);

  function changeRestAlertPreferences(next: RestAlertPreferences) {
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
        const result = await onChangeRestAlertPreferences(next) ?? {
          status: "persisted" as const,
          preferences: next,
        };
        if (samePreferences(latestPreferencesRef.current, next)) {
          latestPreferencesRef.current = result.preferences;
          setOptimisticPreferences(result.preferences);
        }
        setSaveFailed(result.status !== "persisted");
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
    <AdaptiveScreen
      {...adaptiveWidth}
      primary={
        <>
          <ScreenHeader backAction={onBack} title="Settings" />
          <ContentCard>
            <View style={styles.section}>
              <SectionHeader title="Appearance" tone="card" />
              <View
                accessibilityLabel="Appearance"
                accessibilityRole="radiogroup"
                style={styles.radioGroup}
                testID="settings-appearance-group"
              >
                {appearanceOptions.map((option) => {
                  const selected = appearance === option;
                  return (
                    <FocusablePressable
                      accessibilityLabel={option}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected, selected }}
                      focusable
                      key={option}
                      onPress={() => setAppearance(option)}
                      style={[
                        styles.radioOption,
                        {
                          borderColor: selected
                            ? colors.action
                            : colors.contentCardBorder,
                        },
                      ]}
                    >
                      {selected ? (
                        <Check
                          accessible={false}
                          color={colors.action}
                          size={sizes.inlineIcon}
                        />
                      ) : (
                        <Circle
                          accessible={false}
                          color={colors.contentCardTextSecondary}
                          size={sizes.inlineIcon}
                        />
                      )}
                      <Text
                        style={[
                          typeScale.body as TextStyle,
                          { color: colors.contentCardText },
                        ]}
                      >
                        {option}
                      </Text>
                    </FocusablePressable>
                  );
                })}
              </View>
            </View>
          </ContentCard>

          <ContentCard>
            <View style={styles.section}>
              <SectionHeader title="Rest alerts" tone="card" />
              {restAlertPreferencesLoading ? (
                <LoadingRestAlertRows />
              ) : (
                <>
                  <RestAlertSwitch
                    hint="Plays short beeps at 3, 2, and 1 seconds and a longer beep when rest ends."
                    label="Rest sound"
                    onValueChange={(soundEnabled) => {
                      changeRestAlertPreferences({
                        ...latestPreferencesRef.current,
                        soundEnabled,
                      });
                    }}
                    value={optimisticPreferences.soundEnabled}
                  />
                  <RestAlertSwitch
                    hint="Vibrates when a rest ends."
                    label="Rest vibration"
                    onValueChange={(vibrationEnabled) => {
                      changeRestAlertPreferences({
                        ...latestPreferencesRef.current,
                        vibrationEnabled,
                      });
                    }}
                    value={optimisticPreferences.vibrationEnabled}
                  />
                </>
              )}
              {saveFailed ? (
                <View
                  style={[styles.failure, { borderColor: colors.timerAttention }]}
                >
                  <Text
                    accessibilityRole="alert"
                    style={[
                      typeScale.sectionTitle as TextStyle,
                      { color: colors.contentCardText },
                    ]}
                  >
                    Rest alert setting was not saved
                  </Text>
                  <Text
                    style={[
                      typeScale.body as TextStyle,
                      { color: colors.contentCardTextSecondary },
                    ]}
                  >
                    Your saved rest alert setting was not changed. Try the switch again.
                  </Text>
                </View>
              ) : null}
              {notificationPermission === "denied" ? (
                <View
                  style={[styles.failure, { borderColor: colors.timerAttention }]}
                >
                  <Text
                    style={[
                      typeScale.sectionTitle as TextStyle,
                      { color: colors.contentCardText },
                    ]}
                  >
                    Background rest alerts are off
                  </Text>
                  <Text
                    style={[
                      typeScale.body as TextStyle,
                      { color: colors.contentCardTextSecondary },
                    ]}
                  >
                    Your in-app timer stays accurate. Allow notifications in Android
                    settings for background rest alerts.
                  </Text>
                  <SecondaryAction
                    disabled={restAlertPreferencesLoading}
                    label="Open notification settings"
                    onPress={() => { void onOpenNotificationSettings(); }}
                  />
                </View>
              ) : null}
            </View>
          </ContentCard>

          <ContentCard>
            <View style={styles.section}>
              <SectionHeader title="History and data" tone="card" />
              <Text
                style={[
                  typeScale.body as TextStyle,
                  { color: colors.contentCardTextSecondary },
                ]}
              >
                Restore a completed workout that was removed from ordinary history.
              </Text>
              <SecondaryAction
                label="Removed sessions"
                onPress={onOpenRemovedSessions}
              />
            </View>
          </ContentCard>

          <ContentCard>
            <View style={styles.section}>
              <SectionHeader title="Data and recovery" tone="card" />
              <Text
                style={[
                  typeScale.body as TextStyle,
                  { color: colors.contentCardTextSecondary },
                ]}
              >
                Create a secure backup, restore a previous backup, or export readable CSV data.
              </Text>
              <SecondaryAction
                label="Data and recovery"
                onPress={onOpenDataAndRecovery}
                testID="more-data-and-recovery"
              />
            </View>
          </ContentCard>
        </>
      }
    />
  );
}

function LoadingRestAlertRows() {
  const { colors } = useAppTheme();
  return (
    <View
      accessible
      accessibilityLabel="Loading rest alert settings"
      accessibilityLiveRegion="polite"
      accessibilityRole="progressbar"
      accessibilityState={{ busy: true, disabled: true }}
      style={styles.loadingRows}
    >
      {(["sound", "vibration"] as const).map((setting) => (
        <View
          importantForAccessibility="no-hide-descendants"
          key={setting}
          style={[styles.switchRow, { borderColor: colors.contentCardBorder }]}
          testID={`settings-rest-alert-${setting}-loading-row`}
        >
          <View style={styles.switchCopy}>
            <SkeletonBlock height={20} width="48%" />
            <SkeletonBlock height={16} width="82%" />
          </View>
          <SkeletonBlock height={32} width={52} />
        </View>
      ))}
    </View>
  );
}

function RestAlertSwitch({
  label,
  hint,
  value,
  onValueChange,
}: Readonly<{
  label: "Rest sound" | "Rest vibration";
  hint: string;
  value: boolean;
  onValueChange(value: boolean): void;
}>) {
  const { colors } = useAppTheme();
  const copyTestID = label === "Rest sound"
    ? "settings-rest-sound-copy"
    : "settings-rest-vibration-copy";

  return (
    <FocusablePressable
      accessibilityHint={hint}
      accessibilityLabel={label}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      focusable
      onPress={() => onValueChange(!value)}
      style={[styles.switchRow, { borderColor: colors.contentCardBorder }]}
      testID={`settings-${label === "Rest sound" ? "rest-sound" : "rest-vibration"}`}
    >
      <View style={styles.switchCopy} testID={copyTestID}>
        <Text
          style={[
            typeScale.sectionTitle as TextStyle,
            { color: colors.contentCardText },
          ]}
        >
          {label}
        </Text>
        <Text
          style={[
            typeScale.secondary as TextStyle,
            { color: colors.contentCardTextSecondary },
          ]}
        >
          {hint}
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
  section: {
    gap: space[2],
  },
  radioGroup: {
    gap: space[2],
  },
  radioOption: {
    alignItems: "center",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: space[2],
    minHeight: sizes.minimumTarget,
    paddingHorizontal: space[4],
    paddingVertical: space[2],
  },
  switchRow: {
    alignItems: "center",
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: space[2],
    justifyContent: "space-between",
    minHeight: sizes.minimumTarget,
    paddingHorizontal: space[4],
    paddingVertical: space[2],
  },
  switchCopy: {
    flex: 1,
    flexShrink: 1,
    gap: space[1],
  },
  loadingRows: {
    gap: space[2],
  },
  failure: {
    borderLeftWidth: 4,
    gap: space[2],
    paddingLeft: space[2],
  },
});
