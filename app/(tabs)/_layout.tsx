import { Tabs, usePathname, useRouter, type Href } from "expo-router";
import { View } from "react-native";
import React, { useEffect, useRef, useState } from "react";

import {
  AppTabs,
} from "../../src/ui/components";
import { AppRootShell } from "../../src/ui/shell/AppRootShell";
import { AppSettingsContent } from "../../src/ui/screens/SettingsScreen";
import { requestAndroidViewFocus } from "../../src/bootstrap/androidViewFocus";
import {
  rootBackBehavior,
} from "../../src/ui/screens/RootScreens";
import {
  useWorkoutAppRuntime,
} from "../../src/bootstrap/workoutAppRuntime";
import type { RestAlertPreferences } from "../../src/domains/rest";
import { useAppTheme } from "../../src/ui/theme";
import {
  RootHeadingRefsProvider,
  type RootOrigin,
  type RootRouteKey,
} from "../../src/ui/shell/rootFocus";

const DEFAULT_REST_ALERT_PREFERENCES: RestAlertPreferences = Object.freeze({
  soundEnabled: true,
  vibrationEnabled: true,
});

export function RootSettingsContent({
  onNavigate,
  onRegisterOrigin,
  removedSessionsTriggerRef,
  dataAndRecoveryTriggerRef,
}: Readonly<{
  onNavigate: () => void;
  onRegisterOrigin: (trigger: React.RefObject<View | null>) => void;
  removedSessionsTriggerRef: React.RefObject<View | null>;
  dataAndRecoveryTriggerRef: React.RefObject<View | null>;
}>) {
  const router = useRouter();
  const runtime = useWorkoutAppRuntime();
  const [preferences, setPreferences] = useState<RestAlertPreferences>(
    DEFAULT_REST_ALERT_PREFERENCES,
  );
  const [loading, setLoading] = useState(false);
  const readGenerationRef = useRef(0);

  useEffect(() => {
    if (runtime.launchState !== "trusted") {
      readGenerationRef.current += 1;
      setLoading(false);
      return undefined;
    }
    const generation = readGenerationRef.current + 1;
    readGenerationRef.current = generation;
    let active = true;
    setLoading(true);
    Promise.resolve().then(() => runtime.readRestAlertPreferences()).then(
      (savedPreferences) => {
        if (active && generation === readGenerationRef.current) {
          setPreferences(savedPreferences);
        }
      },
      () => undefined,
    ).finally(() => {
      if (active && generation === readGenerationRef.current) {
        setLoading(false);
      }
    });
    return () => { active = false; };
  }, [
    runtime.launchState,
    runtime.readRestAlertPreferences,
    runtime.workoutRefreshGeneration,
  ]);

  return (
    <AppSettingsContent
      notificationPermission={runtime.notificationPermission}
      onChangeRestAlertPreferences={async (nextPreferences) => {
        const result = await runtime.setRestAlertPreferences(nextPreferences);
        setPreferences(result.preferences);
        return result;
      }}
      dataAndRecoveryTriggerRef={dataAndRecoveryTriggerRef}
      onOpenDataAndRecovery={() => {
        onRegisterOrigin(dataAndRecoveryTriggerRef);
        router.push("/more/data-and-recovery" as Href);
      }}
      onNavigate={onNavigate}
      onOpenNotificationSettings={runtime.openRestNotificationSettings}
      onRefreshPreciseRestAlarms={runtime.refreshPreciseRestAlarms}
      onOpenRemovedSessions={() => {
        onRegisterOrigin(removedSessionsTriggerRef);
        router.push("/more/removed-sessions" as Href);
      }}
      preferences={preferences}
      removedSessionsTriggerRef={removedSessionsTriggerRef}
      restAlertPreferencesLoading={loading}
    />
  );
}

function rootFromPathname(pathname: string): RootRouteKey | undefined {
  if (pathname === "/" || pathname === "/index") {
    return "index";
  }
  if (pathname.startsWith("/calendar")) {
    return "calendar";
  }
  if (pathname.startsWith("/library")) {
    return "library";
  }
  if (pathname.startsWith("/progress")) {
    return "progress";
  }
  return undefined;
}

export default function RootTabsLayout() {
  const { launchState } = useWorkoutAppRuntime();
  const { colors } = useAppTheme();
  const pathname = usePathname();
  const settingsTriggerRef = useRef<View>(null);
  const removedSessionsTriggerRef = useRef<View>(null);
  const dataAndRecoveryTriggerRef = useRef<View>(null);
  const headingRefs = useRef({
    index: React.createRef<View>(),
    calendar: React.createRef<View>(),
    library: React.createRef<View>(),
    progress: React.createRef<View>(),
  }).current;
  const [origin, setOrigin] = useState<RootOrigin | undefined>(undefined);
  const activeRoot = rootFromPathname(pathname);
  const lastRootRef = useRef<RootRouteKey>("index");
  if (activeRoot !== undefined) {
    lastRootRef.current = activeRoot;
  }
  const tabBarPosition = "bottom";

  const registerOrigin = React.useCallback((trigger: React.RefObject<View | null>) => {
    setOrigin({
      root: lastRootRef.current,
      trigger,
    });
  }, []);

  return (
    <RootHeadingRefsProvider headingRefs={headingRefs}>
      <AppRootShell
        currentPath={pathname}
        headingRefs={headingRefs}
        onConsumeOrigin={() => setOrigin(undefined)}
        requestNativeFocus={requestAndroidViewFocus}
        settingsContent={(closeSettings) => (
          <RootSettingsContent
            dataAndRecoveryTriggerRef={dataAndRecoveryTriggerRef}
            onNavigate={closeSettings}
            onRegisterOrigin={registerOrigin}
            removedSessionsTriggerRef={removedSessionsTriggerRef}
          />
        )}
        settingsTriggerRef={settingsTriggerRef}
        {...(activeRoot === undefined ? {} : { activeRoot })}
        {...(origin === undefined ? {} : { origin })}
      >
        <Tabs
          backBehavior={rootBackBehavior}
          initialRouteName="index"
          screenOptions={{
            headerShown: false,
            sceneStyle: { backgroundColor: colors.canvas },
            tabBarPosition,
          }}
          tabBar={(props) => (
            <AppTabs
              disabled={launchState !== "trusted"}
              insets={props.insets}
              navigation={props.navigation}
              state={props.state}
            />
          )}
        >
          <Tabs.Screen name="index" options={{ title: "Workout" }} />
          <Tabs.Screen name="calendar" options={{ title: "Calendar" }} />
          <Tabs.Screen name="library" options={{ title: "Library" }} />
          <Tabs.Screen name="progress" options={{ title: "Progress" }} />
        </Tabs>
      </AppRootShell>
    </RootHeadingRefsProvider>
  );
}
