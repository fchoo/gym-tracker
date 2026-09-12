import {
  router,
  type Href,
} from "expo-router";
import React, {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  useWorkoutAppRuntime,
} from "../../src/bootstrap/workoutAppRuntime";
import {
  type RestAlertPreferences,
} from "../../src/domains/rest";
import {
  SettingsScreen,
} from "../../src/ui/screens/SettingsScreen";

const DEFAULT_REST_ALERT_PREFERENCES: RestAlertPreferences = Object.freeze({
  soundEnabled: true,
  vibrationEnabled: true,
});

export default function MoreRoute() {
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
    <SettingsScreen
      notificationPermission={runtime.notificationPermission}
      onBack={() => router.back()}
      onChangeRestAlertPreferences={async (nextPreferences) => {
        const result = await runtime.setRestAlertPreferences(nextPreferences);
        setPreferences(result.preferences);
        return result;
      }}
      onOpenDataAndRecovery={() =>
        router.push("/more/data-and-recovery" as Href)}
      onOpenNotificationSettings={runtime.openRestNotificationSettings}
      onOpenRemovedSessions={() =>
        router.push("/more/removed-sessions" as Href)}
      preferences={preferences}
      restAlertPreferencesLoading={loading}
    />
  );
}
