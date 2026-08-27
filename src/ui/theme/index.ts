import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  AccessibilityInfo,
  Appearance,
  type ColorSchemeName,
} from "react-native";

export const fontFamilies = {
  interfaceRegular: "SourceSans3_400Regular",
  interfaceSemiBold: "SourceSans3_600SemiBold",
  numericRegular: "IBMPlexMono_400Regular",
  numericSemiBold: "IBMPlexMono_600SemiBold",
} as const;

export const appFonts = {
  SourceSans3_400Regular:
    require("@expo-google-fonts/source-sans-3/400Regular/SourceSans3_400Regular.ttf"),
  SourceSans3_600SemiBold:
    require("@expo-google-fonts/source-sans-3/600SemiBold/SourceSans3_600SemiBold.ttf"),
  IBMPlexMono_400Regular:
    require("@expo-google-fonts/ibm-plex-mono/400Regular/IBMPlexMono_400Regular.ttf"),
  IBMPlexMono_600SemiBold:
    require("@expo-google-fonts/ibm-plex-mono/600SemiBold/IBMPlexMono_600SemiBold.ttf"),
} as const;

export const space = {
  1: 4,
  2: 8,
  4: 16,
  6: 24,
  8: 32,
  12: 48,
  16: 64,
} as const;

export const radius = {
  standard: 8,
  emphasized: 12,
  full: 999,
} as const;

export const sizes = {
  minimumTarget: 48,
  primaryAction: 56,
  numericControlMinimum: 56,
  numericControlMaximum: 64,
  readableWorkoutWidth: 720,
  readableDetailWidth: 960,
  icon: 24,
  inlineIcon: 20,
  focusRing: 2,
} as const;

export const typeScale = {
  displayTimer: {
    fontFamily: fontFamilies.numericSemiBold,
    fontSize: 52,
    lineHeight: 56,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  targetValue: {
    fontFamily: fontFamilies.numericSemiBold,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  screenTitle: {
    fontFamily: fontFamilies.interfaceSemiBold,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "600",
  },
  sectionTitle: {
    fontFamily: fontFamilies.interfaceSemiBold,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "600",
  },
  body: {
    fontFamily: fontFamilies.interfaceRegular,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "400",
  },
  bodyStrong: {
    fontFamily: fontFamilies.interfaceSemiBold,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "600",
  },
  secondary: {
    fontFamily: fontFamilies.interfaceRegular,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "400",
  },
  label: {
    fontFamily: fontFamilies.interfaceSemiBold,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
};

export const themes = {
  light: {
    canvas: "#F1F3F4",
    contentCard: "#FFFFFF",
    contentCardBorder: "#DADCE0",
    contentCardDisabled: "#E8EAED",
    contentCardPressed: "#F8F9FA",
    contentCardSelected: "#E8F0FE",
    contentCardStatusCompleted: "#7BE0AA",
    contentCardText: "#202124",
    contentCardTextSecondary: "#5F6368",
    surface: "#F8F9FA",
    surfaceSubtle: "#E8EAED",
    textPrimary: "#171A1C",
    textSecondary: "#5D656B",
    divider: "#C9CED2",
    action: "#155EEF",
    actionPressed: "#004EEB",
    onAction: "#FFFFFF",
    completed: "#1F7A4D",
    timerAttention: "#B54708",
    destructive: "#B42318",
    errorSurface: "#FEE4E2",
    focusRing: "#155EEF",
  },
  dark: {
    canvas: "#202124",
    contentCard: "#121212",
    contentCardBorder: "#3C4043",
    contentCardDisabled: "#1F2326",
    contentCardPressed: "#1A1D1F",
    contentCardSelected: "#263238",
    contentCardStatusCompleted: "#84E6B1",
    contentCardText: "#E8EAED",
    contentCardTextSecondary: "#BDC1C6",
    surface: "#171B1E",
    surfaceSubtle: "#20262A",
    textPrimary: "#F4F6F7",
    textSecondary: "#AEB7BD",
    divider: "#394146",
    action: "#70A0FF",
    actionPressed: "#8DB3FF",
    onAction: "#071225",
    completed: "#56C88A",
    timerAttention: "#FFB45C",
    destructive: "#FF746A",
    errorSurface: "#3A1C1B",
    focusRing: "#9CBFFF",
  },
} as const;

export type ThemeColors = (typeof themes)[keyof typeof themes];

export const motion = {
  standard: {
    setCommitMs: 140,
    dockTransitionMs: 200,
    opacityTransitions: true,
    positionTransitions: true,
    scaleTransitions: false,
  },
  reduced: {
    setCommitMs: 0,
    dockTransitionMs: 0,
    opacityTransitions: true,
    positionTransitions: false,
    scaleTransitions: false,
  },
} as const;

export type AppearancePreference = "System" | "Light" | "Dark";
export type ResolvedColorScheme = "light" | "dark";

export interface AppearanceStore {
  read(): unknown;
  write(value: "Light" | "Dark" | null): void;
}

export function createMemoryAppearanceStore(
  initialValue: unknown = null,
): AppearanceStore {
  let value = initialValue;

  return {
    read: () => value,
    write: (nextValue) => {
      value = nextValue;
    },
  };
}

const processAppearanceStore = createMemoryAppearanceStore();

function parseAppearancePreference(value: unknown): AppearancePreference {
  return value === "Light" || value === "Dark" ? value : "System";
}

export function resolveColorScheme(
  preference: unknown,
  systemScheme: ColorSchemeName | null | undefined,
): ResolvedColorScheme {
  const parsedPreference = parseAppearancePreference(preference);
  if (parsedPreference === "Light") {
    return "light";
  }
  if (parsedPreference === "Dark") {
    return "dark";
  }

  return systemScheme === "dark" ? "dark" : "light";
}

type AppThemeValue = Readonly<{
  appearance: AppearancePreference;
  colorScheme: ResolvedColorScheme;
  colors: ThemeColors;
  motion: (typeof motion)[keyof typeof motion];
  reduceMotion: boolean;
  setAppearance: (preference: AppearancePreference) => void;
}>;

const AppThemeContext = createContext<AppThemeValue | null>(null);

type AppearanceProviderProps = Readonly<{
  children: React.ReactNode;
  reduceMotion?: boolean;
  store?: AppearanceStore;
}>;

export function AppearanceProvider({
  children,
  reduceMotion: reduceMotionOverride,
  store = processAppearanceStore,
}: AppearanceProviderProps) {
  const [appearance, setAppearanceState] = useState<AppearancePreference>(() =>
    parseAppearancePreference(store.read()),
  );
  const [systemScheme, setSystemScheme] = useState<
    ColorSchemeName | null | undefined
  >(() => Appearance.getColorScheme());
  const [systemReduceMotion, setSystemReduceMotion] = useState(false);

  useEffect(() => {
    const appearanceSubscription = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(colorScheme);
    });
    const motionSubscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setSystemReduceMotion,
    );
    void AccessibilityInfo.isReduceMotionEnabled().then(setSystemReduceMotion);

    return () => {
      appearanceSubscription.remove();
      motionSubscription.remove();
    };
  }, []);

  const setAppearance = useCallback(
    (preference: AppearancePreference) => {
      const validatedPreference = parseAppearancePreference(preference);
      store.write(
        validatedPreference === "System" ? null : validatedPreference,
      );
      setAppearanceState(validatedPreference);
    },
    [store],
  );

  const colorScheme = resolveColorScheme(appearance, systemScheme);
  const reduceMotion = reduceMotionOverride ?? systemReduceMotion;
  const value = useMemo<AppThemeValue>(
    () => ({
      appearance,
      colorScheme,
      colors: themes[colorScheme],
      motion: reduceMotion ? motion.reduced : motion.standard,
      reduceMotion,
      setAppearance,
    }),
    [appearance, colorScheme, reduceMotion, setAppearance],
  );

  return React.createElement(AppThemeContext.Provider, { value }, children);
}

export function useAppTheme(): AppThemeValue {
  const value = useContext(AppThemeContext);
  if (value === null) {
    throw new Error("useAppTheme must be used within AppearanceProvider");
  }

  return value;
}
