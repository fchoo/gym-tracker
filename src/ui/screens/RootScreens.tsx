import React, {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  StyleSheet,
  View,
} from "react-native";

import {
  InlineNotice,
  AppTabs,
  EmptyState,
  PrimaryAction,
  ScreenHeader,
  SecondaryAction,
  SkeletonBlock,
} from "../components";
import type {
  RestNotificationPermission,
} from "../../domains/rest";
import {
  TodayScreen as SourceBackedTodayScreen,
} from "./TodayScreen";
import {
  AdaptiveScreen,
  classifyWidth,
} from "../layout/AdaptiveScreen";
import { space } from "../theme";

export const rootBackBehavior = "history" as const;

export type LaunchState = "booting" | "trusted" | "failed";

type LaunchContextValue = Readonly<{
  launchState: LaunchState;
  retry: () => void;
}>;

const LaunchContext = createContext<LaunchContextValue>({
  launchState: "booting",
  retry: () => undefined,
});

export function LaunchStateProvider({
  children,
  initialState = "booting",
  autoTrust = false,
}: Readonly<{
  children: React.ReactNode;
  initialState?: LaunchState;
  autoTrust?: boolean;
}>) {
  const [launchState, setLaunchState] = useState(initialState);

  useEffect(() => {
    if (autoTrust && launchState === "booting") {
      setLaunchState("trusted");
    }
  }, [autoTrust, launchState]);

  return (
    <LaunchContext.Provider
      value={{
        launchState,
        retry: () => setLaunchState("booting"),
      }}
    >
      {children}
    </LaunchContext.Provider>
  );
}

export function useLaunchState(): LaunchContextValue {
  return useContext(LaunchContext);
}

export function StartupReadinessGate({
  children,
  launchState,
  notificationPermission,
  onContinueWithoutAlerts,
  onOpenSettings,
  onRequestPermission,
}: Readonly<{
  children: React.ReactNode;
  launchState: LaunchState;
  notificationPermission: RestNotificationPermission;
  onContinueWithoutAlerts: () => void;
  onOpenSettings: () => void;
  onRequestPermission: () => Promise<RestNotificationPermission>;
}>) {
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [requestDenied, setRequestDenied] = useState(false);

  if (
    launchState !== "trusted"
    || notificationPermission === "granted"
    || (notificationPermission === "denied" && !requestDenied)
    || dismissed
  ) {
    return <>{children}</>;
  }

  const continueWithoutAlerts = () => {
    setDismissed(true);
    onContinueWithoutAlerts();
  };
  const denied = notificationPermission === "denied" || requestDenied;

  return (
    <AdaptiveScreen
      primary={
        <>
          <ScreenHeader title="Set up workout alerts" />
          <InlineNotice
            body="Allow notifications for background rest alerts. The in-app timer and every workout feature still work if you continue without them."
            heading={
              denied
                ? "Notifications are off"
                : "Get rest alerts when the app is in the background"
            }
            tone="attention"
          />
          {!denied ? (
            <PrimaryAction
              busy={busy}
              label="Enable notifications"
              onPress={() => {
                setBusy(true);
                void onRequestPermission().then((permission) => {
                  if (permission === "granted") {
                    setDismissed(true);
                  } else {
                    setRequestDenied(true);
                  }
                }).finally(() => setBusy(false));
              }}
            />
          ) : (
            <PrimaryAction
              label="Open notification settings"
              onPress={onOpenSettings}
            />
          )}
          <SecondaryAction
            disabled={busy}
            label="Continue without alerts"
            onPress={continueWithoutAlerts}
          />
        </>
      }
    />
  );
}

const loadingRoutes = [
  { key: "today-loading", name: "index" },
  { key: "calendar-loading", name: "calendar" },
  { key: "library-loading", name: "library" },
  { key: "progress-loading", name: "progress" },
] as const;

export function AppLoadingShell({
  width = 599,
}: Readonly<{ width?: number }>) {
  const expanded = classifyWidth(width) === "expanded";

  return (
    <View
      style={[
        styles.loadingShell,
        expanded && styles.loadingShellExpanded,
      ]}
    >
      <View style={styles.loadingContent}>
        <TodayScreen launchState="booting" />
      </View>
      <AppTabs
        disabled
        navigation={{
          emit: () => ({ defaultPrevented: false }),
          navigate: () => undefined,
        }}
        position={expanded ? "rail" : "bottom"}
        state={{ index: 0, routes: loadingRoutes }}
      />
    </View>
  );
}

export function TodayScreen({
  launchState: launchStateOverride,
}: Readonly<{
  launchState?: LaunchState;
}>) {
  const context = useLaunchState();
  const launchState = launchStateOverride ?? context.launchState;
  return (
    <SourceBackedTodayScreen
      launchState={launchState}
      onRetry={context.retry}
    />
  );
}

type EmptyRootProps = Readonly<{
  onGoToday: () => void;
}>;

function IntentionalEmptyRoot({
  title,
  heading,
  body,
  onGoToday,
}: EmptyRootProps &
  Readonly<{
    title: string;
    heading: string;
    body: string;
  }>) {
  return (
    <AdaptiveScreen
      primary={
        <>
          <ScreenHeader title={title} />
          <EmptyState
            body={body}
            heading={heading}
            primaryAction={
              <PrimaryAction label="Go to Today" onPress={onGoToday} />
            }
          />
        </>
      }
    />
  );
}

export function LibraryScreen({ onGoToday }: EmptyRootProps) {
  return (
    <IntentionalEmptyRoot
      body="Full plan and exercise management will arrive in a later phase. Full Body Foundation is available from Today."
      heading="Library is not available yet"
      onGoToday={onGoToday}
      title="Library"
    />
  );
}

export function ActiveWorkoutLoadingScreen({
  sessionId,
  onGoBack,
  width,
}: Readonly<{
  sessionId: string;
  onGoBack: () => void;
  width?: number;
}>) {
  const adaptiveWidth = width === undefined ? {} : { width };

  return (
    <AdaptiveScreen
      {...adaptiveWidth}
      constrainActiveWork
      primary={
        <>
          <ScreenHeader
            backAction={onGoBack}
            eyebrow="FOCUSED WORKOUT"
            title="Active Workout"
          />
          <View
            accessibilityLabel={`Workout session ${sessionId}`}
            style={styles.focusedSkeleton}
          >
            <SkeletonBlock height={34} width="72%" />
            <SkeletonBlock height={64} />
            <SkeletonBlock height={64} />
            <SkeletonBlock height={56} />
          </View>
        </>
      }
    />
  );
}

const styles = StyleSheet.create({
  loadingShell: {
    flex: 1,
  },
  loadingShellExpanded: {
    flexDirection: "row-reverse",
  },
  loadingContent: {
    flex: 1,
  },
  focusedSkeleton: {
    gap: space[4],
  },
});
