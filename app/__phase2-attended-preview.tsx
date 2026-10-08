import Constants from "expo-constants";
import * as Font from "expo-font";
import {
  Redirect,
  useLocalSearchParams,
} from "expo-router";
import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  StyleSheet,
  Text,
  type LayoutChangeEvent,
  type TextLayoutEvent,
  type TextStyle,
  useWindowDimensions,
  View,
} from "react-native";

import {
  pendingPromise,
  phase2ExercisePartialItems,
  phase2ExercisePartialSnapshot,
  phase2ExerciseRecentItems,
  phase2PlanPartialSnapshot,
  phase2SetCorrectionPreviewView,
  phase2SetMutationPreviewCommands,
  phase2SetMutationPreviewView,
  phase2TodayPlanManyView,
  phase2TodayPlanEmptyView,
  phase2TodayPlanOneView,
  previewSectionPreference,
  resolvePhase2AttendedPreviewRoute,
  type Phase2CalendarPreviewVariant,
  type Phase2AttendedPreviewScenario,
  type Phase2SetMutationPreviewVariant,
  type Phase2TodayPlanPreviewVariant,
} from "../src/testing/phase2AttendedPreviewFixtures";
import { PHASE14_FONT_PROOF } from "../src/testing/phase14FontProof";
import {
  AppearanceSheet,
  CalendarField,
  IconAction,
  InlineNotice,
  PrimaryAction,
  RestAlertSettingsSheet,
  ScreenHeader,
  SecondaryAction,
} from "../src/ui/components";
import { AdaptiveScreen } from "../src/ui/layout/AdaptiveScreen";
import { ActiveWorkoutScreen } from "../src/ui/screens/ActiveWorkoutScreen";
import { LibraryScreen } from "../src/ui/screens/LibraryScreen";
import type {
  LibraryExerciseItem,
  LibraryExerciseSearchResult,
} from "../src/ui/screens/LibraryScreen";
import {
  AppLoadingShell,
} from "../src/ui/screens/RootScreens";
import { TodayScreen } from "../src/ui/screens/TodayScreen";
import { useAppTheme } from "../src/ui/theme";

const noOp = () => undefined;
const persistedPreferenceChange = async (preferences: Readonly<{
  soundEnabled: boolean;
  vibrationEnabled: boolean;
}>) => ({ status: "persisted" as const, preferences });
const rejectedPreferenceChange = async () => {
  throw new Error("preview preference write rejected");
};

const loadExerciseSnapshot = async () => phase2ExercisePartialSnapshot;
const loadPlanSnapshot = async () => phase2PlanPartialSnapshot;
const loadLibraryPending = () => pendingPromise<
  typeof phase2PlanPartialSnapshot
>();
const listNoRecentExercises = async () => [] as const;
const listPartialRecentExercises = async () => phase2ExerciseRecentItems;
const searchExercisesPending = () => pendingPromise<{
  state: "page";
  items: typeof phase2ExercisePartialItems;
  nextCursor: null;
}>();
const PREVIEW_NEXT_CURSOR = "phase2-preview-next";

type PreviewExerciseSearchInput = Parameters<
  React.ComponentProps<typeof LibraryScreen>["searchExercises"]
>[0];

function searchPartialExercises(
  input: PreviewExerciseSearchInput,
): readonly LibraryExerciseItem[] {
  const query = input.query.trim().toLocaleLowerCase();
  const filters = input.filters ?? {};
  const visibility = filters.visibility ?? [];
  const includes = <Value,>(
    values: readonly Value[] | undefined,
    candidate: Value,
  ) => values === undefined || values.length === 0 || values.includes(candidate);
  const overlaps = (
    values: readonly string[] | undefined,
    candidates: readonly string[],
  ) => values === undefined
    || values.length === 0
    || values.some((value) => candidates.includes(value));
  return phase2ExercisePartialItems.filter((item) => {
    const textMatches = query.length === 0
      || item.canonicalName.toLocaleLowerCase().includes(query)
      || item.matchedAlias?.displayText.toLocaleLowerCase().includes(query)
        === true;
    const visibilityMatches = visibility.length === 0
      ? item.availability === "available" && !item.hidden && !item.archived
      : visibility.some((value) => value === "available"
        ? item.availability === "available" && !item.hidden && !item.archived
        : value === "unavailable"
          ? item.availability === "unavailable"
          : value === "hidden" ? item.hidden : item.archived);
    return textMatches
      && visibilityMatches
      && includes(filters.origins, item.origin)
      && includes(filters.exerciseTypes, item.exerciseType)
      && overlaps(filters.muscles, item.muscles)
      && overlaps(filters.equipment, item.equipment)
      && includes(filters.recent, item.recentAtMs !== null)
      && includes(filters.favorite, item.favorite);
  });
}
const setPreviewFavorite = async (exerciseId: string, favorite: boolean) => ({
  exerciseId,
  favorite,
  preferenceRevision: 1,
});

function ScenarioFrame({
  children,
  scenario,
  variant,
}: Readonly<{
  children: React.ReactNode;
  scenario: Phase2AttendedPreviewScenario;
  variant?: string;
}>) {
  const { colors } = useAppTheme();
  return (
    <View
      style={[styles.frame, { backgroundColor: colors.canvas }]}
      testID={`phase2-attended-preview-${scenario}`}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        style={styles.identifier}
        testID={[
          "phase2-attended-preview-identifier",
          scenario,
          variant ?? "default",
        ].join("-")}
      />
      <View style={styles.preview}>{children}</View>
    </View>
  );
}

function UnknownPreview() {
  return (
    <View style={styles.frame} testID="phase2-attended-preview-unknown">
      <AdaptiveScreen
        primary={(
          <>
            <ScreenHeader title="Unknown preview" />
            <Text>Choose one exact Phase 2 attended-preview scenario.</Text>
          </>
        )}
      />
    </View>
  );
}

// React Native 0.86's TextStyle omits the variable-axis 890 value. Keep the
// exact source value in this proof-only harness instead of silently rounding it.
const phase14TitleStyle = {
  fontFamily: PHASE14_FONT_PROOF.oracle.fontFamily,
  fontSize: PHASE14_FONT_PROOF.oracle.fontSizePx,
  fontStretch: PHASE14_FONT_PROOF.oracle.fontStretch,
  fontWeight: `${PHASE14_FONT_PROOF.oracle.fontWeight}`,
  letterSpacing: PHASE14_FONT_PROOF.oracle.fontSizePx
    * PHASE14_FONT_PROOF.oracle.letterSpacingEm,
  lineHeight: PHASE14_FONT_PROOF.oracle.lineHeightPx,
} as unknown as TextStyle;

function Phase14FontProofPreview() {
  const { fontScale } = useWindowDimensions();
  const fontLoaded = (() => {
    try {
      return Font.isLoaded(PHASE14_FONT_PROOF.oracle.fontFamily);
    } catch {
      return false;
    }
  })();
  const [layoutObservation, setLayoutObservation] = useState(() => ({
    availableWidthPx: null as number | null,
    blockWidthPx: null as number | null,
    blockHeightPx: null as number | null,
    lineAdvancesPx: [] as readonly number[],
    lineHeightsPx: [] as readonly number[],
    lineBaselinesPx: [] as readonly {
      ascenderPx: number;
      descenderPx: number;
      yPx: number;
      heightPx: number;
      baselineOffsetPx: number;
    }[],
    textBounds: null as { x: number; y: number; width: number; height: number } | null,
    containerBounds: null as { x: number; y: number; width: number; height: number } | null,
    wrapBreakpoints: [] as readonly string[],
  }));
  const captureContainerLayout = useCallback((event: LayoutChangeEvent) => {
    const layout = event.nativeEvent.layout;
    setLayoutObservation((current) => ({ ...current, availableWidthPx: layout.width, containerBounds: layout }));
  }, []);
  const captureTitleLayout = useCallback((event: LayoutChangeEvent) => {
    const layout = event.nativeEvent.layout;
    setLayoutObservation((current) => ({ ...current, textBounds: layout }));
  }, []);
  const captureTextLayout = useCallback((event: TextLayoutEvent) => {
    const lines = event.nativeEvent.lines;
    const next = {
      blockWidthPx: Math.max(0, ...lines.map((line) => line.width)),
      blockHeightPx: lines.reduce((height, line) => height + line.height, 0),
      lineAdvancesPx: lines.map((line) => line.width),
      lineHeightsPx: lines.map((line) => line.height),
      lineBaselinesPx: lines.map((line) => ({
        ascenderPx: line.ascender,
        descenderPx: line.descender,
        yPx: line.y,
        heightPx: line.height,
        baselineOffsetPx: line.y + line.ascender,
      })),
      wrapBreakpoints: lines.map((line) => line.text.trim()),
    };
    setLayoutObservation((current) => ({ ...current, ...next }));
  }, []);
  return (
    <View style={styles.phase14Proof} testID="phase14-font-proof-root">
      <Text style={styles.phase14ProofLabel}>Development Test · Phase 14</Text>
      <Text testID="phase14-font-proof-family">
        {`${PHASE14_FONT_PROOF.oracle.fontFamily} ${fontLoaded ? "loaded" : "pending"}`}
      </Text>
      <View
        onLayout={captureContainerLayout}
        style={{ maxWidth: PHASE14_FONT_PROOF.oracle.contentMaxWidthPx }}
        testID="phase14-font-proof-title-container"
      >
      <Text
        accessibilityLabel="Phase 14 font axis oracle title"
        onTextLayout={captureTextLayout}
        onLayout={captureTitleLayout}
        style={phase14TitleStyle}
        testID="phase14-font-proof-title"
      >
        {PHASE14_FONT_PROOF.oracle.sourceText}
      </Text>
      </View>
      {PHASE14_FONT_PROOF.cases.map((proofCase) => (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          key={proofCase.id}
          pointerEvents="none"
          testID={`phase14-font-proof-measurement-${proofCase.id}`}
        />
      ))}
      <Text testID="phase14-font-proof-observation">
        {JSON.stringify({
          ...layoutObservation,
          family: PHASE14_FONT_PROOF.oracle.fontFamily,
          fontLoaded,
          fontScale,
        })}
      </Text>
      <Text testID="phase14-font-proof-overlay-inputs">
        {`Revision 18 · 57px · condensed · wght 890 · -0.07em · ${PHASE14_FONT_PROOF.oracle.approvedHtmlSha256}`}
      </Text>
    </View>
  );
}

const AlertSettingsLauncher = forwardRef<View, Readonly<{
  onFocusRestored(): void;
  onPress(): void;
}>>(function AlertSettingsLauncher({ onFocusRestored, onPress }, ref) {
  const launcherRef = useRef<View>(null);
  useImperativeHandle(ref, () => ({
    focus() {
      launcherRef.current?.focus();
      onFocusRestored();
    },
  }) as View, [onFocusRestored]);

  return (
    <IconAction
      accessibilityHint="Opens appearance and rest-alert settings"
      accessibilityLabel="Appearance and rest-alert settings"
      icon="more"
      onPress={onPress}
      ref={launcherRef}
    />
  );
});

function AlertSettingsPreview({ loading }: Readonly<{ loading: boolean }>) {
  const [appearanceVisible, setAppearanceVisible] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [preferencesLoading, setPreferencesLoading] = useState(false);
  const [focusRestored, setFocusRestored] = useState(0);
  const launcherRef = useRef<View>(null);
  const readPreferences = useCallback(() => {
    if (!loading) {
      return Promise.resolve();
    }
    setPreferencesLoading(true);
    return pendingPromise<void>();
  }, [loading]);
  return (
    <>
      <AdaptiveScreen
        primary={(
          <>
            <ScreenHeader
              action={(
                <AlertSettingsLauncher
                  onFocusRestored={() => setFocusRestored((count) => count + 1)}
                  onPress={() => {
                    setSettingsVisible(true);
                    void readPreferences();
                  }}
                  ref={launcherRef}
                />
              )}
              title="Today"
            />
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              pointerEvents="none"
              style={styles.identifier}
              testID={`alert-settings-focus-restored-${focusRestored}`}
            />
          </>
        )}
      />
      <RestAlertSettingsSheet
        loading={preferencesLoading}
        notificationPermission="denied"
        onChange={loading
          ? persistedPreferenceChange
          : rejectedPreferenceChange}
        onClose={() => setSettingsVisible(false)}
        onOpenAppearance={() => {
          setSettingsVisible(false);
          setAppearanceVisible(true);
        }}
        onOpenNotificationSettings={noOp}
        preferences={{ soundEnabled: true, vibrationEnabled: false }}
        restoreFocusRef={launcherRef}
        visible={settingsVisible}
      />
      <AppearanceSheet
        onClose={() => setAppearanceVisible(false)}
        restoreFocusRef={launcherRef}
        visible={appearanceVisible}
      />
    </>
  );
}

function CalendarCardinalityPreview({
  variant,
}: Readonly<{ variant: Phase2CalendarPreviewVariant }>) {
  const [value, setValue] = useState(variant === "zero"
    ? ""
    : variant === "one" ? "2028-02-29" : "2028-03-04");
  const changeValue = useCallback((next: string) => setValue(next), []);
  const properties = variant === "zero"
    ? {
        defaultDate: "2028-02-28",
        label: "Zero selected date",
        maximumDate: "2028-03-08",
        minimumDate: "2028-02-28",
      }
    : variant === "one"
      ? {
          defaultDate: "2028-02-29",
          label: "One confirmed date",
          maximumDate: "2028-03-08",
          minimumDate: "2028-02-28",
        }
      : {
          defaultDate: "2028-03-04",
          label: "Many enabled dates",
          maximumDate: "2028-03-08",
          minimumDate: "2028-03-01",
        };

  return (
    <AdaptiveScreen
      primary={(
        <CalendarField
          allowEmpty
          {...properties}
          onChange={changeValue}
          value={value}
        />
      )}
    />
  );
}

function LibraryPreview({
  scenario,
}: Readonly<{
  scenario: Extract<
    Phase2AttendedPreviewScenario,
    `library-${string}`
  >;
}>) {
  const exercises = scenario.startsWith("library-exercise");
  const loading = scenario.endsWith("-loading");
  const error = scenario.endsWith("-error");
  const pageFailure = error || scenario.endsWith("-partial");
  const planRefreshCount = useRef(0);
  const exercisePageCount = useRef(0);
  const loadLibrary = useCallback(() => {
    if (exercises) {
      return loadExerciseSnapshot();
    }
    if (loading) {
      return loadLibraryPending();
    }
    return loadPlanSnapshot();
  }, [exercises, loading]);
  const refreshLibrary = useCallback(() => {
    planRefreshCount.current += 1;
    if (error && planRefreshCount.current === 1) {
      return Promise.reject(new Error("preview library refresh rejected"));
    }
    return exercises ? loadExerciseSnapshot() : loadPlanSnapshot();
  }, [error, exercises]);
  const searchExercises = useCallback(async (
    input: PreviewExerciseSearchInput,
  ): Promise<LibraryExerciseSearchResult> => {
    if (loading) {
      return searchExercisesPending();
    }
    const items = searchPartialExercises(input);
    if (input.cursor !== null && input.cursor !== undefined) {
      exercisePageCount.current += 1;
      if (pageFailure && exercisePageCount.current === 1) {
        throw new Error("preview exercise page rejected");
      }
      return { state: "page", items: [], nextCursor: null };
    }
    return {
      state: "page",
      items,
      nextCursor: pageFailure ? PREVIEW_NEXT_CURSOR : null,
    };
  }, [loading, pageFailure]);

  return (
    <LibraryScreen
      listRecentExercises={exercises
        ? listPartialRecentExercises
        : listNoRecentExercises}
      loadLibrary={loadLibrary}
      onCreateExercise={noOp}
      onCreatePlan={noOp}
      onOpenExercise={noOp}
      onOpenPlan={noOp}
      onOpenStarter={noOp}
      onOpenTemplateUpdate={noOp}
      refreshLibrary={refreshLibrary}
      searchExercises={searchExercises}
      setExerciseFavorite={setPreviewFavorite}
      setSection={previewSectionPreference}
    />
  );
}

function SetMutationLoadingPreview({
  variant,
}: Readonly<{ variant: Phase2SetMutationPreviewVariant }>) {
  const view = variant === "correction"
    ? phase2SetCorrectionPreviewView
    : phase2SetMutationPreviewView;
  return (
    <ActiveWorkoutScreen
      commands={phase2SetMutationPreviewCommands}
      nowMs={() => 1_800_000_000_000}
      onFinishLater={noOp}
      onGoBack={noOp}
      sessionId={view.id}
      view={view}
    />
  );
}

function TodayPlanCardinalityPreview({
  variant,
}: Readonly<{ variant: Phase2TodayPlanPreviewVariant }>) {
  const view = variant === "zero"
    ? phase2TodayPlanEmptyView
    : variant === "one" ? phase2TodayPlanOneView : phase2TodayPlanManyView;
  return (
    <ActiveWorkoutScreen
      commands={phase2SetMutationPreviewCommands}
      nowMs={() => 1_800_000_000_000}
      onFinishLater={noOp}
      onGoBack={noOp}
      sessionId={view.id}
      view={view}
    />
  );
}

function scenarioContent(
  scenario: Phase2AttendedPreviewScenario,
  windowWidth: number,
  variant: string | undefined,
) {
  switch (scenario) {
    case "alert-settings-loading":
      return <AlertSettingsPreview loading />;
    case "alert-settings-error":
      return <AlertSettingsPreview loading={false} />;
    case "calendar-zero-one-many":
      return <CalendarCardinalityPreview variant={variant as Phase2CalendarPreviewVariant} />;
    case "global-card-loading":
      return <TodayScreen launchState="booting" />;
    case "library-exercise-card-loading":
    case "library-exercise-card-error":
    case "library-exercise-card-partial":
    case "library-plan-card-loading":
    case "library-plan-card-error":
    case "library-plan-card-partial":
      return <LibraryPreview scenario={scenario} />;
    case "root-nav-loading":
      return <AppLoadingShell width={windowWidth} />;
    case "set-mutations-loading":
      return <SetMutationLoadingPreview variant={variant as Phase2SetMutationPreviewVariant} />;
    case "todays-plan-empty":
      return <TodayPlanCardinalityPreview variant="zero" />;
    case "todays-plan-loading":
      return <AppLoadingShell width={windowWidth} />;
    case "todays-plan-zero-one-many":
      return <TodayPlanCardinalityPreview variant={variant as Phase2TodayPlanPreviewVariant} />;
  }
}

function ScenarioPreview({
  scenario,
  variant,
}: Readonly<{
  scenario: Phase2AttendedPreviewScenario;
  variant?: string;
}>) {
  const { width } = useWindowDimensions();
  return (
    <ScenarioFrame
      scenario={scenario}
      {...(variant === undefined ? {} : { variant })}
    >
      {scenarioContent(scenario, width, variant)}
    </ScenarioFrame>
  );
}

export default function Phase2AttendedPreviewRoute() {
  const parameters = useLocalSearchParams<{
    scenario?: string | string[];
    variant?: string | string[];
  }>();
  const enabled =
    Constants.expoConfig?.extra?.nativeContractsEnabled === true;
  const route = resolvePhase2AttendedPreviewRoute(
    parameters.scenario,
    parameters.variant,
  );

  if (!enabled) {
    return <Redirect href="/" />;
  }
  if (parameters.scenario === "phase14-font-axis"
    && parameters.variant === undefined) {
    return <Phase14FontProofPreview />;
  }
  if (route === null) {
    return <UnknownPreview />;
  }
  const variant = route.variant ?? undefined;
  return (
    <ScenarioPreview
      key={`${route.scenario}:${variant ?? "default"}`}
      scenario={route.scenario}
      {...(variant === undefined ? {} : { variant })}
    />
  );
}

const styles = StyleSheet.create({
  frame: {
    flex: 1,
  },
  identifier: {
    height: 0,
    position: "absolute",
    width: 0,
  },
  preview: {
    flex: 1,
  },
  phase14Proof: {
    flex: 1,
    maxWidth: PHASE14_FONT_PROOF.oracle.contentMaxWidthPx,
    padding: 16,
  },
  phase14ProofLabel: {
    marginBottom: 16,
  },
});
