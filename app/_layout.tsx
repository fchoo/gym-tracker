import React from "react";
import Constants from "expo-constants";
import { useFonts } from "expo-font";
import { Redirect, Stack, useLocalSearchParams, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  Keyboard,
  StyleSheet,
  useWindowDimensions,
  type KeyboardEvent,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import {
  AppLoadingShell,
  StartupReadinessGate,
} from "../src/ui/screens/RootScreens";
import {
  RootFailureState,
  type RootLaunchFailure,
} from "../src/ui/screens/RootFailureState";
import {
  productionWorkoutAppRuntimeDependencies,
  useWorkoutAppRuntime,
  WorkoutAppRuntimeProvider,
} from "../src/bootstrap/workoutAppRuntime";
import { RunningPlanRuntimeProvider } from "../src/bootstrap/runningPlanRuntime";
import {
  productionAppearanceStore,
} from "../src/bootstrap/appearancePreference";
import {
  AppearanceProvider,
  appFonts,
  createMemoryAppearanceStore,
  useAppTheme,
} from "../src/ui/theme";
import {
  SemanticToastProvider,
} from "../src/ui/components/SemanticToast";
import {
  createPhase20VisualRuntimeDependencies,
} from "../src/testing/phase20VisualFixtureRuntime";
import {
  PHASE20_VISUAL_ROUTE,
  phase20VisualGate,
} from "../src/testing/phase20VisualRequest";
import {
  createPhase20CalendarRuntimeDependencies,
  phase20CalendarEvidencePathRequested,
  resolvePhase20CalendarIsolatedRuntime,
} from "../src/testing/phase20CalendarRuntime";
import {
  createStrictIsolatedWorkoutRuntimeDependencies,
  resolveV12RecoveryIsolatedRuntime,
} from "../src/testing/isolatedWorkoutRuntime";

const attendedPreviewAppearanceStore = createMemoryAppearanceStore();
const phase6GestureSmokeAppearanceStore = createMemoryAppearanceStore();
const isolatedNativeAppearanceStore = createMemoryAppearanceStore();
const APPROVED_ROOT_HEADER_HEIGHT = 56;
const APPROVED_ROOT_NAVIGATION_HEIGHT = 74;

type KeyboardFrame = KeyboardEvent["endCoordinates"];

function keyboardBottomOverlap(
  frame: KeyboardFrame | undefined,
  viewportHeight: number,
): number {
  if (frame === undefined || !Number.isFinite(viewportHeight) || viewportHeight <= 0) {
    return 0;
  }
  if (Number.isFinite(frame.screenY)) {
    return Math.min(viewportHeight, Math.max(0, viewportHeight - frame.screenY));
  }
  return Math.min(viewportHeight, Math.max(0, frame.height));
}

export function ProductionToastBoundary({
  children,
  dockAvoidance = 0,
}: Readonly<{
  children: React.ReactNode;
  dockAvoidance?: number;
}>) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [keyboardFrame, setKeyboardFrame] = React.useState<KeyboardFrame | undefined>(
    () => typeof Keyboard.metrics === "function" ? Keyboard.metrics() : undefined,
  );

  React.useEffect(() => {
    const showSubscription = Keyboard.addListener(
      "keyboardDidShow",
      (event) => setKeyboardFrame(event.endCoordinates),
    );
    const frameSubscription = Keyboard.addListener(
      "keyboardDidChangeFrame",
      (event) => setKeyboardFrame(event.endCoordinates),
    );
    const hideSubscription = Keyboard.addListener(
      "keyboardDidHide",
      () => setKeyboardFrame(undefined),
    );
    return () => {
      showSubscription.remove();
      frameSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  const topAvoidance = Math.max(0, insets.top) + APPROVED_ROOT_HEADER_HEIGHT;
  const bottomAvoidance = Math.max(
    Math.max(0, insets.bottom) + APPROVED_ROOT_NAVIGATION_HEIGHT,
    keyboardBottomOverlap(keyboardFrame, height),
    Math.max(0, dockAvoidance),
  );

  return (
    <SemanticToastProvider
      bottomAvoidance={bottomAvoidance}
      topAvoidance={topAvoidance}
    >
      {children}
    </SemanticToastProvider>
  );
}

function RootNavigator() {
  const runtime = useWorkoutAppRuntime();
  const { colorScheme } = useAppTheme();

  const navigator = (
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
          <Stack.Screen name="completion/[sessionId]" />
          <Stack.Screen name="session/[sessionId]" />
          <Stack.Screen name="session/[sessionId]/correct" />
          <Stack.Screen name="exercise-history/[exerciseId]" />
          <Stack.Screen name="garmin/index" />
          <Stack.Screen name="garmin/activity/[activityId]" />
          <Stack.Screen name="garmin/match/[activityId]" />
          <Stack.Screen name="more/index" />
          <Stack.Screen name="more/data-and-recovery" />
          <Stack.Screen name="more/automatic-backup-settings" />
          <Stack.Screen name="more/manual-encrypted-backup" />
          <Stack.Screen name="more/drive-backup-privacy" />
          <Stack.Screen name="more/removed-sessions" />
          <Stack.Screen name="__phase14-source-state-proof" />
          <Stack.Screen name="__phase14-toast-proof" />
          <Stack.Screen name="__phase12-google-auth-smoke" />
          <Stack.Screen name="__phase12-google-cleanup" />
          <Stack.Screen name="__phase18-garmin-proof" />
          <Stack.Screen name="__phase18-garmin-adversarial" />
          <Stack.Screen name="index" redirect />
        </Stack>
        <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
      </>
    </StartupReadinessGate>
  );
  return runtime.runningPlanRuntime === null ? navigator : (
    <RunningPlanRuntimeProvider runtime={runtime.runningPlanRuntime}>
      {navigator}
    </RunningPlanRuntimeProvider>
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

function Phase12CleanupNavigator() {
  return (
    <Stack
      initialRouteName="__phase12-google-cleanup"
      screenOptions={{ animation: "none", headerShown: false }}
    >
      <Stack.Screen name="__phase12-google-cleanup" />
    </Stack>
  );
}

function Phase12GoogleAuthSmokeNavigator() {
  return (
    <Stack
      initialRouteName="__phase12-google-auth-smoke"
      screenOptions={{ animation: "none", headerShown: false }}
    >
      <Stack.Screen name="__phase12-google-auth-smoke" />
    </Stack>
  );
}

function Phase18GarminProofNavigator() {
  return (
    <Stack
      initialRouteName="__phase18-garmin-proof"
      screenOptions={{ animation: "none", headerShown: false }}
    >
      <Stack.Screen name="__phase18-garmin-proof" />
    </Stack>
  );
}

function Phase18GarminAdversarialNavigator() {
  return (
    <Stack
      initialRouteName="__phase18-garmin-adversarial"
      screenOptions={{ animation: "none", headerShown: false }}
    >
      <Stack.Screen name="__phase18-garmin-adversarial" />
    </Stack>
  );
}

function V12ProductionGarminNavigator() {
  return (
    <Stack
      initialRouteName="__v12-production-garmin"
      screenOptions={{ animation: "none", headerShown: false }}
    >
      <Stack.Screen name="__v12-production-garmin" />
    </Stack>
  );
}

function NativeContractsNavigator() {
  return (
    <Stack
      initialRouteName="__native-contracts"
      screenOptions={{ animation: "none", headerShown: false }}
    >
      <Stack.Screen name="__native-contracts" />
    </Stack>
  );
}

function V12NativeAcceptanceNavigator() {
  return (
    <Stack
      initialRouteName="native-acceptance/[shard]"
      screenOptions={{ animation: "none", headerShown: false }}
    >
      <Stack.Screen name="native-acceptance/[shard]" />
    </Stack>
  );
}

function Phase20VisualNavigator() {
  return (
    <Stack
      initialRouteName="__phase20-visual-probe"
      screenOptions={{ animation: "none", headerShown: false }}
    >
      <Stack.Screen name="__phase20-visual-probe" />
    </Stack>
  );
}

function Phase20QualityNavigator() {
  return (
    <Stack
      initialRouteName="__phase20-quality-probe"
      screenOptions={{ animation: "none", headerShown: false }}
    >
      <Stack.Screen name="__phase20-quality-probe" />
    </Stack>
  );
}

function V12ProductionRecoveryNavigator() {
  return (
    <Stack
      initialRouteName="__v12-production-recovery"
      screenOptions={{ animation: "none", headerShown: false }}
    >
      <Stack.Screen name="__v12-production-recovery" />
    </Stack>
  );
}

function PreRuntimeFailure({
  category,
  onRetry,
}: Readonly<{
  category: Extract<RootLaunchFailure["category"], "appearance" | "font">;
  onRetry: () => void;
}>) {
  const correlationCode = category === "font" ? "GT-FONT01" : "GT-APPEAR01";

  return (
    <GestureHandlerRootView style={styles.root} testID="gesture-handler-root">
      <SafeAreaProvider>
        <AppearanceProvider store={createMemoryAppearanceStore()}>
          <RootFailureState
            failure={{
              category,
              code: `${category}_startup_failed`,
              correlationCode,
              retryable: true,
            }}
            onRetry={onRetry}
          />
        </AppearanceProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default function RootLayout() {
  const [preRuntimeRetryGeneration, setPreRuntimeRetryGeneration] = React.useState(0);
  const retryPreRuntime = React.useCallback(() => {
    setPreRuntimeRetryGeneration((current) => current + 1);
  }, []);

  return (
    <RootLayoutAttempt
      key={preRuntimeRetryGeneration}
      onRetryPreRuntime={retryPreRuntime}
    />
  );
}

function RootLayoutAttempt({
  onRetryPreRuntime,
}: Readonly<{
  onRetryPreRuntime: () => void;
}>) {
  const [fontsLoaded, fontError] = useFonts(appFonts);
  const nativeContractsEnabled =
    Constants.expoConfig?.extra?.nativeContractsEnabled === true;
  const nativeContractSuite = Constants.expoConfig?.extra?.nativeContractSuite;
  const phase14FontProofEnabled = nativeContractsEnabled
    && nativeContractSuite === "phase14-font-proof";
  const pathname = usePathname();
  const searchParams = useLocalSearchParams() as Readonly<Record<string, unknown>>;
  const phase20VisualPath = pathname === PHASE20_VISUAL_ROUTE;
  const attendedPreviewPath = pathname === "/__phase2-attended-preview";
  const phase6GestureSmokePath = pathname === "/__phase6-gesture-smoke";
  const phase12CleanupPath = pathname === "/__phase12-google-cleanup";
  const phase12GoogleAuthSmokePath = pathname === "/__phase12-google-auth-smoke";
  const phase18GarminProofPath = pathname === "/__phase18-garmin-proof";
  const phase18GarminAdversarialPath = pathname === "/__phase18-garmin-adversarial";
  const v12ProductionGarminPath = pathname === "/__v12-production-garmin";
  const v12ProductionRecoveryPath = pathname === "/__v12-production-recovery";
  const v12NativeContractsPath = pathname === "/__native-contracts";
  const v12NativeAcceptancePath = pathname.startsWith("/native-acceptance/");
  const phase20QualityPath = pathname === "/__phase20-quality-probe";
  const phase20CalendarEvidencePath = phase20CalendarEvidencePathRequested(searchParams);
  const nativeIdentity = {
    packageName: Constants.expoConfig?.android?.package,
    buildProfile: Constants.expoConfig?.extra?.buildProfile,
    nativeContractsEnabled,
    suite: nativeContractSuite,
  } as const;
  const phase20CalendarRuntime = resolvePhase20CalendarIsolatedRuntime(
    nativeIdentity,
    searchParams,
  );
  const phase20CalendarDependencies = React.useMemo(
    () => phase20CalendarRuntime === null
      ? null
      : createPhase20CalendarRuntimeDependencies(phase20CalendarRuntime.databaseName),
    [phase20CalendarRuntime?.databaseName],
  );
  const v12ProductionRecoveryRuntime = resolveV12RecoveryIsolatedRuntime({
    ...nativeIdentity,
    nonce: searchParams.nonce,
    caseId: searchParams.caseId,
    stepId: searchParams.stepId,
    cutId: searchParams.cutId,
  }, searchParams.phase);
  const v12ProductionRecoveryDependencies = React.useMemo(
    () => v12ProductionRecoveryRuntime === null
      ? null
      : createStrictIsolatedWorkoutRuntimeDependencies(v12ProductionRecoveryRuntime),
    [v12ProductionRecoveryRuntime?.databaseName],
  );
  const phase20VisualRequest = phase20VisualGate({
    buildProfile: Constants.expoConfig?.extra?.buildProfile,
    nativeContractsEnabled,
    nativeContractSuite,
    pathname,
    params: searchParams,
  });
  const phase20VisualDependencies = React.useMemo(
    () => phase20VisualRequest === null || phase20VisualRequest.mode === "reset"
      ? null
      : createPhase20VisualRuntimeDependencies(phase20VisualRequest),
    [phase20VisualRequest?.configuration, phase20VisualRequest?.mode, phase20VisualRequest?.nonce, phase20VisualRequest?.state],
  );
  const phase20VisualAppearanceStore = React.useMemo(
    () => createMemoryAppearanceStore(
      phase20VisualRequest?.appearance === "Light" || phase20VisualRequest?.appearance === "Dark"
        ? phase20VisualRequest.appearance
        : null,
    ),
    [phase20VisualRequest?.appearance, phase20VisualRequest?.nonce],
  );
  const { width } = useWindowDimensions();
  const attendedPreviewEnabled = phase14FontProofEnabled || attendedPreviewPath;
  const isolatedNativeRoute = attendedPreviewEnabled
    || phase6GestureSmokePath
    || phase12CleanupPath
    || phase12GoogleAuthSmokePath
    || phase18GarminProofPath
    || phase18GarminAdversarialPath
    || v12NativeContractsPath
    || v12NativeAcceptancePath
    || phase20VisualPath
    || phase20QualityPath
    || v12ProductionGarminPath
    || v12ProductionRecoveryPath
    || phase20CalendarEvidencePath;
  const failClosedFontRoute = phase20VisualPath
    || phase20QualityPath
    || v12NativeAcceptancePath
    || v12ProductionGarminPath
    || v12ProductionRecoveryPath
    || phase20CalendarEvidencePath;
  const fontLoadingAppearanceStore = attendedPreviewEnabled
    ? attendedPreviewAppearanceStore
    : phase6GestureSmokePath
      ? phase6GestureSmokeAppearanceStore
      : phase20VisualPath
        ? phase20VisualAppearanceStore
        : isolatedNativeRoute
          ? isolatedNativeAppearanceStore
          : productionAppearanceStore;
  const appearanceRead = !isolatedNativeRoute && fontsLoaded && fontError === null
    ? productionAppearanceStore.read()
    : null;

  if ((!isolatedNativeRoute || failClosedFontRoute) && !fontsLoaded && fontError !== null) {
    return <PreRuntimeFailure category="font" onRetry={onRetryPreRuntime} />;
  }

  if (
    !isolatedNativeRoute
    && typeof appearanceRead === "object"
    && appearanceRead !== null
    && "status" in appearanceRead
    && appearanceRead.status === "failed"
  ) {
    return <PreRuntimeFailure category="appearance" onRetry={onRetryPreRuntime} />;
  }

  if (!fontsLoaded && fontError === null) {
    return (
      <GestureHandlerRootView style={styles.root} testID="gesture-handler-root">
        <SafeAreaProvider>
          <AppearanceProvider store={fontLoadingAppearanceStore}>
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

  if (phase6GestureSmokePath) {
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

  if (phase12CleanupPath) {
    return (
      <GestureHandlerRootView style={styles.root} testID="gesture-handler-root">
        <SafeAreaProvider>
          <AppearanceProvider store={isolatedNativeAppearanceStore}>
            <Phase12CleanupNavigator />
          </AppearanceProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  if (phase12GoogleAuthSmokePath) {
    return (
      <GestureHandlerRootView style={styles.root} testID="gesture-handler-root">
        <SafeAreaProvider>
          <AppearanceProvider store={isolatedNativeAppearanceStore}>
            <Phase12GoogleAuthSmokeNavigator />
          </AppearanceProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  if (phase18GarminProofPath) {
    return (
      <GestureHandlerRootView style={styles.root} testID="gesture-handler-root">
        <SafeAreaProvider>
          <AppearanceProvider store={isolatedNativeAppearanceStore}>
            <Phase18GarminProofNavigator />
          </AppearanceProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  if (phase18GarminAdversarialPath) {
    return (
      <GestureHandlerRootView style={styles.root} testID="gesture-handler-root">
        <SafeAreaProvider>
          <AppearanceProvider store={isolatedNativeAppearanceStore}>
            <Phase18GarminAdversarialNavigator />
          </AppearanceProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  if (v12ProductionGarminPath) {
    return (
      <GestureHandlerRootView style={styles.root} testID="gesture-handler-root">
        <SafeAreaProvider>
          <AppearanceProvider store={isolatedNativeAppearanceStore}>
            <V12ProductionGarminNavigator />
          </AppearanceProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  if (v12NativeContractsPath) {
    return (
      <GestureHandlerRootView style={styles.root} testID="gesture-handler-root">
        <SafeAreaProvider>
          <AppearanceProvider store={isolatedNativeAppearanceStore}>
            <NativeContractsNavigator />
          </AppearanceProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  if (v12NativeAcceptancePath) {
    return (
      <GestureHandlerRootView style={styles.root} testID="gesture-handler-root">
        <SafeAreaProvider>
          <AppearanceProvider store={isolatedNativeAppearanceStore}>
            <V12NativeAcceptanceNavigator />
          </AppearanceProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  if (phase20VisualPath) {
    return (
      <GestureHandlerRootView style={styles.root} testID="gesture-handler-root">
        <SafeAreaProvider>
          <AppearanceProvider store={phase20VisualAppearanceStore}>
            {phase20VisualDependencies === null ? (
              <Phase20VisualNavigator />
            ) : (
              <WorkoutAppRuntimeProvider dependencies={phase20VisualDependencies}>
                <ProductionToastBoundary>
                  <Phase20VisualNavigator />
                </ProductionToastBoundary>
              </WorkoutAppRuntimeProvider>
            )}
          </AppearanceProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  if (phase20QualityPath) {
    return (
      <GestureHandlerRootView style={styles.root} testID="gesture-handler-root">
        <SafeAreaProvider>
          <AppearanceProvider store={isolatedNativeAppearanceStore}>
            <Phase20QualityNavigator />
          </AppearanceProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  if (v12ProductionRecoveryPath) {
    return (
      <GestureHandlerRootView style={styles.root} testID="gesture-handler-root">
        <SafeAreaProvider>
          <AppearanceProvider store={isolatedNativeAppearanceStore}>
            {v12ProductionRecoveryDependencies === null ? (
              <Redirect href="/" />
            ) : (
              <WorkoutAppRuntimeProvider dependencies={v12ProductionRecoveryDependencies}>
                <V12ProductionRecoveryNavigator />
              </WorkoutAppRuntimeProvider>
            )}
          </AppearanceProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  if (phase20CalendarEvidencePath) {
    return (
      <GestureHandlerRootView style={styles.root} testID="gesture-handler-root">
        <SafeAreaProvider>
          <AppearanceProvider store={isolatedNativeAppearanceStore}>
            {phase20CalendarDependencies === null ? (
              <Redirect href="/" />
            ) : (
              <WorkoutAppRuntimeProvider dependencies={phase20CalendarDependencies}>
                <ProductionToastBoundary>
                  <RootNavigator />
                </ProductionToastBoundary>
              </WorkoutAppRuntimeProvider>
            )}
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
            <ProductionToastBoundary>
              <RootNavigator />
            </ProductionToastBoundary>
          </WorkoutAppRuntimeProvider>
        </AppearanceProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
