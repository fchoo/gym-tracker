import Constants from "expo-constants";
import { useFonts } from "expo-font";
import { Stack, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { StyleSheet, useWindowDimensions } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import {
  AppLoadingShell,
  StartupReadinessGate,
} from "../src/ui/screens/RootScreens";
import {
  productionWorkoutAppRuntimeDependencies,
  useWorkoutAppRuntime,
  WorkoutAppRuntimeProvider,
} from "../src/bootstrap/workoutAppRuntime";
import {
  productionAppearanceStore,
} from "../src/bootstrap/appearancePreference";
import {
  AppearanceProvider,
  appFonts,
  createMemoryAppearanceStore,
  useAppTheme,
} from "../src/ui/theme";

const attendedPreviewAppearanceStore = createMemoryAppearanceStore();
const phase6GestureSmokeAppearanceStore = createMemoryAppearanceStore();

function RootNavigator() {
  const runtime = useWorkoutAppRuntime();
  const { colorScheme } = useAppTheme();

  return (
    <StartupReadinessGate
      launchState={runtime.launchState}
      notificationPermission={runtime.notificationPermission}
      onContinueWithoutAlerts={() => undefined}
      onOpenSettings={() => {
        void runtime.openRestNotificationSettings();
      }}
      onRequestPermission={runtime.requestRestNotificationPermission}
    >
      <>
        <Stack
          initialRouteName="(tabs)"
          screenOptions={{
            animation: "fade",
            headerShown: false,
          }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="workout/[sessionId]" />
          <Stack.Screen name="workout-plan/[sessionId]" />
          <Stack.Screen name="completion/[sessionId]" />
          <Stack.Screen name="session/[sessionId]" />
          <Stack.Screen name="session/[sessionId]/correct" />
          <Stack.Screen name="exercise-history/[exerciseId]" />
          <Stack.Screen name="more/index" />
          <Stack.Screen name="more/removed-sessions" />
          <Stack.Screen name="index" redirect />
        </Stack>
        <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
      </>
    </StartupReadinessGate>
  );
}

function AttendedPreviewNavigator() {
  return (
    <Stack
      initialRouteName="__phase2-attended-preview"
      screenOptions={{
        animation: "none",
        headerShown: false,
      }}
    >
      <Stack.Screen name="__phase2-attended-preview" />
    </Stack>
  );
}

function Phase6GestureSmokeNavigator() {
  return (
    <Stack
      initialRouteName="__phase6-gesture-smoke"
      screenOptions={{
        animation: "none",
        headerShown: false,
      }}
    >
      <Stack.Screen name="__phase6-gesture-smoke" />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(appFonts);
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const attendedPreviewEnabled =
    Constants.expoConfig?.extra?.nativeContractsEnabled === true
    && pathname === "/__phase2-attended-preview";
  const phase6GestureSmokeEnabled =
    Constants.expoConfig?.extra?.nativeContractsEnabled === true
    && pathname === "/__phase6-gesture-smoke";

  if (!fontsLoaded && fontError === null) {
    return (
      <GestureHandlerRootView style={styles.root} testID="gesture-handler-root">
        <SafeAreaProvider>
          <AppearanceProvider store={attendedPreviewEnabled
            ? attendedPreviewAppearanceStore
            : phase6GestureSmokeEnabled
              ? phase6GestureSmokeAppearanceStore
            : productionAppearanceStore}
          >
            <AppLoadingShell width={width} />
          </AppearanceProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  if (attendedPreviewEnabled) {
    return (
      <GestureHandlerRootView style={styles.root} testID="gesture-handler-root">
        <SafeAreaProvider>
          <AppearanceProvider store={attendedPreviewAppearanceStore}>
            <AttendedPreviewNavigator />
          </AppearanceProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  if (phase6GestureSmokeEnabled) {
    return (
      <GestureHandlerRootView style={styles.root} testID="gesture-handler-root">
        <SafeAreaProvider>
          <AppearanceProvider store={phase6GestureSmokeAppearanceStore}>
            <Phase6GestureSmokeNavigator />
          </AppearanceProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={styles.root} testID="gesture-handler-root">
      <SafeAreaProvider>
        <AppearanceProvider store={productionAppearanceStore}>
          <WorkoutAppRuntimeProvider
            dependencies={productionWorkoutAppRuntimeDependencies}
          >
            <RootNavigator />
          </WorkoutAppRuntimeProvider>
        </AppearanceProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
