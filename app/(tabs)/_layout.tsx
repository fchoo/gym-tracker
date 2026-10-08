import { Tabs } from "expo-router";
import { useWindowDimensions } from "react-native";
import React, { useEffect, useRef, useState } from "react";
import { router, type Href } from "expo-router";

import {
  AppTabs,
} from "../../src/ui/components";
import { AppRootShell } from "../../src/ui/shell/AppRootShell";
import { AppSettingsContent } from "../../src/ui/screens/SettingsScreen";
import {
  rootBackBehavior,
} from "../../src/ui/screens/RootScreens";
import {
  useWorkoutAppRuntime,
} from "../../src/bootstrap/workoutAppRuntime";
import type { RestAlertPreferences } from "../../src/domains/rest";
import { useAppTheme } from "../../src/ui/theme";

const DEFAULT_REST_ALERT_PREFERENCES: RestAlertPreferences = Object.freeze({
  soundEnabled: true,
  vibrationEnabled: true,
});

function RootSettingsContent() {
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
      onOpenDataAndRecovery={() => router.push("/more/data-and-recovery" as Href)}
      onOpenNotificationSettings={runtime.openRestNotificationSettings}
      onOpenRemovedSessions={() => router.push("/more/removed-sessions" as Href)}
      preferences={preferences}
      restAlertPreferencesLoading={loading}
    />
  );
}

export default function RootTabsLayout() {
  const { launchState } = useWorkoutAppRuntime();
  const { colors } = useAppTheme();
  const tabBarPosition = "bottom";
  return (
    <AppRootShell settingsContent={<RootSettingsContent />}>
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
  );
}
