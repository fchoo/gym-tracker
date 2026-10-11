import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  AccessibilityInfo,
  findNodeHandle,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextStyle,
} from "react-native";

import {
  AppearanceSheet,
  ContentCard,
  FocusablePressable,
  InlineNotice,
  PrimaryAction,
  SecondaryAction,
  SectionHeader,
} from "../components";
import { ConfirmationDialog } from "../components/ConfirmationDialog";
import { BottomSheet } from "../components/BottomSheet";
import {
  type GarminActivityListItem,
  type GarminConnectionControllerError,
  type GarminConnectionControllerInput,
  type GarminSyncPresentation,
  useGarminConnectionController,
} from "../garmin/useGarminConnectionController";
import { AdaptiveScreen } from "../layout/AdaptiveScreen";
import {
  radius,
  sizes,
  space,
  typeScale,
  useAppTheme,
} from "../theme";

export type GarminSyncScreenProps = GarminConnectionControllerInput & Readonly<{
  onOpenActivity(activityId: string): void;
}>;

type FocusTarget = View & Readonly<{ focus?: () => void }>;

function focusAccessible(ref: React.RefObject<FocusTarget | null>): void {
  ref.current?.focus?.();
  let node: number | null = null;
  try {
    node = findNodeHandle(ref.current);
  } catch {
    // Host component renderers may not provide a native handle.
  }
  if (typeof node === "number" && node > 0) {
    AccessibilityInfo.setAccessibilityFocus(node);
  }
}

function errorCopy(error: GarminConnectionControllerError): Readonly<{
  heading: string;
  body: string;
}> {
  switch (error.code) {
    case "invalid_credentials":
      return {
        heading: "Garmin sign-in was not completed",
        body: "Check your email and password, then try again.",
      };
    case "mfa_expired":
      return {
        heading: "One-time code was not accepted",
        body: "Enter a current one-time code, then verify again.",
      };
    case "sign_in_required":
      return {
        heading: "Sign in to Garmin again",
        body: "Your imported history is still available on this device.",
      };
    case "data_access_denied":
      return {
        heading: "Garmin data access was denied",
        body: "Your imported history was kept. Sign in again when access is available.",
      };
    case "rate_limited":
      return {
        heading: "Garmin asked us to wait",
        body: "Your imported history was kept. Retry when you are ready.",
      };
    case "offline":
      return {
        heading: "You are offline",
        body: "Connect to the internet to fetch new activities. Imported history remains available.",
      };
    case "timeout":
      return {
        heading: "Garmin took too long to respond",
        body: "Your imported history was kept. Try again.",
      };
    case "malformed_response":
      return {
        heading: "Garmin returned data this app could not use",
        body: "Nothing new was saved. Your imported history was kept.",
      };
    case "logout_failed":
      return {
        heading: "Garmin could not be disconnected",
        body: "The prior connection and imported history were kept. Try again.",
      };
    case "history_unavailable":
      return {
        heading: "Imported history could not be loaded",
        body: "No activity was fabricated. Try loading your saved history again.",
      };
    case "temporary_failure":
      return {
        heading: "Garmin is temporarily unavailable",
        body: "Your imported history was kept. Try again.",
      };
  }
}

function GarminHeader({
  onAppearance,
  appearanceRef,
}: Readonly<{
  onAppearance(): void;
  appearanceRef: React.RefObject<View | null>;
}>) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.header} testID="garmin-three-column-header">
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.headerPlaceholder}
        testID="garmin-inert-back-placeholder"
      />
      <View
        accessibilityLabel="Garmin Sync"
        accessibilityRole="header"
        accessible
        style={styles.headerTitleColumn}
      >
        <Text
          numberOfLines={1}
          style={[typeScale.screenTitle as TextStyle, styles.headerTitle, { color: colors.textPrimary }]}
        >
          Garmin Sync
        </Text>
      </View>
      <SecondaryAction
        label="Appearance"
        onPress={onAppearance}
        ref={appearanceRef}
        style={styles.headerAction}
      />
    </View>
  );
}

function ImportedActivities({
  activities,
  historyStatus,
  onOpenActivity,
}: Readonly<{
  activities: readonly GarminActivityListItem[];
  historyStatus: "loading" | "ready" | "failed";
  onOpenActivity(activityId: string): void;
}>) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.section}>
      <SectionHeader
        supportingText="Saved on this device and retained when Garmin is disconnected."
        title="Imported activities"
      />
      {historyStatus === "loading" && activities.length === 0 ? (
        <Text
          accessibilityLiveRegion="polite"
          accessibilityRole="progressbar"
          style={[typeScale.body as TextStyle, { color: colors.textSecondary }]}
        >
          Loading imported activities
        </Text>
      ) : null}
      {historyStatus !== "loading" && activities.length === 0 ? (
        <Text style={[typeScale.body as TextStyle, { color: colors.textSecondary }]}>No imported activities yet.</Text>
      ) : null}
      {activities.map((activity) => (
        <FocusablePressable
          accessibilityLabel={`Open ${activity.title}`}
          accessibilityRole="button"
          key={activity.activityId}
          onPress={() => onOpenActivity(activity.activityId)}
          style={styles.activityTarget}
        >
          <ContentCard status={activity.revisionState === "needs_review" ? "attention" : undefined}>
            <View style={styles.activityCopy}>
              <Text style={[typeScale.bodyStrong as TextStyle, { color: colors.contentCardText }]}>{activity.title}</Text>
              <Text style={[typeScale.secondary as TextStyle, { color: colors.contentCardTextSecondary }]}>
                {`${activity.activityType} · ${activity.confirmedLocalDate}`}
              </Text>
              {activity.summary === undefined ? null : (
                <Text style={[typeScale.secondary as TextStyle, { color: colors.contentCardTextSecondary }]}>
                  {activity.summary}
                </Text>
              )}
              {activity.revisionState === "needs_review" ? (
                <Text style={[typeScale.bodyStrong as TextStyle, { color: colors.timerAttention }]}>Needs review</Text>
              ) : null}
            </View>
          </ContentCard>
        </FocusablePressable>
      ))}
    </View>
  );
}

function SyncResult({ sync }: Readonly<{ sync: GarminSyncPresentation }>) {
  if (sync.kind === "idle") return null;
  if (sync.kind === "syncing") {
    const counts = sync.progress?.counts;
    const detail = counts === undefined
      ? "Starting foreground sync"
      : `${counts.pages} page${counts.pages === 1 ? "" : "s"} · ${counts.attemptedActivities} activit${counts.attemptedActivities === 1 ? "y" : "ies"}`;
    return <InlineNotice body={detail} heading="Syncing Garmin activities" tone="neutral" />;
  }
  if (sync.kind === "success") {
    return sync.counts.newActivities === 0
      ? <InlineNotice body="Your imported history is up to date." heading="No new activities" tone="completed" />
      : <InlineNotice body={`${sync.counts.newActivities} new activit${sync.counts.newActivities === 1 ? "y" : "ies"} committed.`} heading="New activities" tone="completed" />;
  }
  return <InlineNotice body="Your imported history was kept." heading={sync.kind === "partial" ? "Sync partly completed" : "Garmin sync was not completed"} tone="error" />;
}

export function GarminSyncScreen(props: GarminSyncScreenProps) {
  const { colors } = useAppTheme();
  const passwordInputRef = useRef<TextInput>(null);
  const mfaCodeInputRef = useRef<TextInput>(null);
  const connectRef = useRef<View>(null);
  const appearanceRef = useRef<View>(null);
  const disconnectRef = useRef<View>(null);
  const errorSummaryRef = useRef<FocusTarget>(null);
  const [passwordInputVersion, setPasswordInputVersion] = useState(0);
  const [mfaInputVersion, setMfaInputVersion] = useState(0);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const clearPasswordInput = useCallback(() => {
    passwordInputRef.current?.clear();
    setPasswordInputVersion((current) => current + 1);
  }, []);
  const clearMfaCodeInput = useCallback(() => {
    mfaCodeInputRef.current?.clear();
    setMfaInputVersion((current) => current + 1);
  }, []);
  const controller = useGarminConnectionController({
    ...props,
    clearPasswordInput,
    clearMfaCodeInput,
  });
  const { state } = controller;

  useEffect(() => {
    if (state.error !== null) focusAccessible(errorSummaryRef);
  }, [state.error]);

  const cancelConnection = useCallback(() => {
    void controller.cancelConnection();
  }, [controller]);

  const requestBack = useCallback(() => {
    if (appearanceOpen) {
      setAppearanceOpen(false);
      return;
    }
    if (disconnectOpen) {
      setDisconnectOpen(false);
      return;
    }
    if (state.connection === "mfa" || state.connection === "credentials") {
      cancelConnection();
    }
  }, [appearanceOpen, cancelConnection, disconnectOpen, state.connection]);

  const error = state.error === null ? null : errorCopy(state.error);
  const primary = (
    <>
      <GarminHeader appearanceRef={appearanceRef} onAppearance={() => setAppearanceOpen(true)} />
      {state.connection === "loading" ? (
        <Text
          accessibilityLiveRegion="polite"
          accessibilityRole="progressbar"
          style={[typeScale.body as TextStyle, { color: colors.textSecondary }]}
        >
          Checking Garmin connection
        </Text>
      ) : null}
      {error === null ? null : (
        <View accessible focusable ref={errorSummaryRef}>
          <InlineNotice body={error.body} heading={error.heading} tone="error" />
        </View>
      )}
      {state.connection === "disconnected" ? (
        <View style={styles.section}>
          <SectionHeader
            supportingText="Sign in happens in this installed app. Internet is needed only to fetch new activities."
            title="Garmin not connected"
          />
          <PrimaryAction label="Connect Garmin" onPress={controller.openCredentials} ref={connectRef} />
        </View>
      ) : null}
      {state.connection === "credentials" ? (
        <View style={styles.section}>
          <SectionHeader
            supportingText="Your password is used only for this foreground sign-in and is cleared after the attempt."
            title="Connect Garmin"
          />
          <View style={styles.fieldGroup}>
            <Text style={[typeScale.label as TextStyle, { color: colors.textPrimary }]}>Email</Text>
            <TextInput
              accessibilityLabel="Email"
              autoCapitalize="none"
              autoComplete="email"
              editable={state.operation !== "connecting"}
              inputMode="email"
              onChangeText={controller.setEmail}
              returnKeyType="next"
              style={[styles.input, typeScale.body as TextStyle, { borderColor: colors.divider, color: colors.textPrimary }]}
              value={state.email}
            />
          </View>
          <View style={styles.fieldGroup}>
            <Text style={[typeScale.label as TextStyle, { color: colors.textPrimary }]}>Password</Text>
            <TextInput
              accessibilityLabel="Password"
              autoCapitalize="none"
              autoComplete="current-password"
              defaultValue=""
              editable={state.operation !== "connecting"}
              key={`garmin-password-${passwordInputVersion}`}
              onChangeText={controller.setPassword}
              onSubmitEditing={() => { void controller.submitCredentials(); }}
              ref={passwordInputRef}
              returnKeyType="done"
              secureTextEntry
              style={[styles.input, typeScale.body as TextStyle, { borderColor: colors.divider, color: colors.textPrimary }]}
            />
          </View>
          <View style={styles.actions}>
            <PrimaryAction
              busy={state.operation === "connecting"}
              label="Continue"
              onPress={() => { void controller.submitCredentials(); }}
            />
            <SecondaryAction
              disabled={state.operation === "connecting"}
              label="Cancel"
              onPress={cancelConnection}
            />
          </View>
        </View>
      ) : null}
      {state.connection === "connected" ? (
        <View style={styles.section}>
          <SectionHeader
            supportingText="Only committed activity results appear in your local history."
            title="Connected to Garmin"
          />
          <View style={styles.actions}>
            <PrimaryAction
              busy={state.operation === "syncing"}
              label="Sync now"
              onPress={() => { void controller.syncNow(); }}
            />
            <SecondaryAction
              disabled={state.operation !== "idle"}
              label="Disconnect Garmin"
              onPress={() => setDisconnectOpen(true)}
              ref={disconnectRef}
            />
          </View>
          <SyncResult sync={state.sync} />
        </View>
      ) : null}
      <ImportedActivities
        activities={state.activities}
        historyStatus={state.historyStatus}
        onOpenActivity={props.onOpenActivity}
      />
    </>
  );

  return (
    <>
      <AdaptiveScreen
        onRequestBack={state.connection === "credentials" || state.connection === "mfa" || appearanceOpen || disconnectOpen ? requestBack : undefined}
        primary={primary}
        testID="garmin-sync-screen"
      />
      <BottomSheet
        cancelDisabled={state.operation === "verifying_mfa"}
        cancelLabel="Cancel Garmin verification"
        heading="One-time code"
        onCancel={cancelConnection}
        restoreFocusRef={connectRef}
        visible={state.connection === "mfa"}
      >
        <Text style={[typeScale.body as TextStyle, { color: colors.textSecondary }]}>Enter the current code from Garmin.</Text>
        <TextInput
          accessibilityLabel="One-time code"
          autoComplete="one-time-code"
          defaultValue=""
          editable={state.operation !== "verifying_mfa"}
          key={`garmin-mfa-${mfaInputVersion}`}
          keyboardType="number-pad"
          onChangeText={controller.setMfaCode}
          onSubmitEditing={() => { void controller.submitMfa(); }}
          ref={mfaCodeInputRef}
          returnKeyType="done"
          secureTextEntry
          style={[styles.input, typeScale.body as TextStyle, { borderColor: colors.divider, color: colors.textPrimary }]}
          testID="garmin-mfa-code-input"
        />
        <PrimaryAction
          busy={state.operation === "verifying_mfa"}
          label="Verify"
          onPress={() => { void controller.submitMfa(); }}
        />
        <SecondaryAction
          disabled={state.operation === "verifying_mfa"}
          label="Cancel"
          onPress={cancelConnection}
        />
      </BottomSheet>
      <ConfirmationDialog
        body="Your encrypted Garmin session will be cleared. Imported activity history remains on this device."
        cancelLabel="Keep connected"
        confirmBusy={state.operation === "disconnecting"}
        confirmLabel="Disconnect Garmin"
        destructive
        heading="Disconnect Garmin?"
        onCancel={() => setDisconnectOpen(false)}
        onConfirm={() => {
          void controller.disconnect().finally(() => setDisconnectOpen(false));
        }}
        restoreFocusRef={disconnectRef}
        visible={disconnectOpen}
      />
      <AppearanceSheet
        onClose={() => setAppearanceOpen(false)}
        restoreFocusRef={appearanceRef}
        visible={appearanceOpen}
      />
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: space[2],
    minHeight: sizes.primaryAction,
    width: "100%",
  },
  headerPlaceholder: {
    height: sizes.minimumTarget,
    width: sizes.minimumTarget,
  },
  headerTitleColumn: {
    alignItems: "center",
    flex: 1,
    minWidth: 0,
  },
  headerTitle: {
    maxWidth: "100%",
    textAlign: "center",
  },
  headerAction: {
    minWidth: 104,
  },
  section: {
    gap: space[4],
    minWidth: 0,
  },
  fieldGroup: {
    gap: space[2],
  },
  input: {
    borderRadius: radius.standard,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: sizes.minimumTarget,
    paddingHorizontal: space[4],
    paddingVertical: space[2],
  },
  actions: {
    gap: space[2],
  },
  activityTarget: {
    minHeight: sizes.minimumTarget,
    width: "100%",
  },
  activityCopy: {
    gap: space[1],
  },
});
