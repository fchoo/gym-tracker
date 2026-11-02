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
  type TextStyle,
} from "react-native";

import { PHASE14_FONT_PROOF } from "../../testing/phase14FontProof";

export const fontFamilies = {
  interfaceRegular: "ArchivoVariable",
  interfaceEmphasis: "ArchivoVariable",
  numericRegular: "IBMPlexMono_400Regular",
} as const;

export const appFonts = {
  // Proof-only mapping. Phase 14-02 must establish native variable-axis fidelity
  // before any production typography adopts this family.
  ArchivoVariable:
    require("../../../assets/fonts/Archivo-VariableFont_wdth,wght.ttf"),
  IBMPlexMono_400Regular:
    require("@expo-google-fonts/ibm-plex-mono/400Regular/IBMPlexMono_400Regular.ttf"),
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
  deepRouteHeader: 64,
  collectionRow: 88,
  activePlanRow: 120,
  numericControlMinimum: 56,
  numericControlMaximum: 64,
  readableWorkoutWidth: 720,
  readableDetailWidth: 960,
  icon: 24,
  inlineIcon: 20,
  focusRing: 3,
  focusClearance: 4,
} as const;

const revision18EditorialWorkoutTitleLetterSpacing =
  PHASE14_FONT_PROOF.oracle.fontSizePx
  * PHASE14_FONT_PROOF.oracle.letterSpacingEm;

export const typeScale = {
  // Revision 18's `.rest-clock` is the sole non-editorial numeric display
  // exception: 30px IBM Plex Mono with the inherited 1.35 line-height.
  displayTimer: {
    fontFamily: fontFamilies.numericRegular,
    fontSize: 30,
    lineHeight: 41,
    fontWeight: "400",
    fontVariant: ["tabular-nums"] as TextStyle["fontVariant"],
  },
  targetValue: {
    fontFamily: fontFamilies.numericRegular,
    fontSize: 20,
    lineHeight: 24,
    fontWeight: "400",
    fontVariant: ["tabular-nums"],
  },
  screenTitle: {
    fontFamily: fontFamilies.interfaceEmphasis,
    fontSize: 20,
    lineHeight: 24,
    fontWeight: "800",
  },
  sectionTitle: {
    fontFamily: fontFamilies.interfaceEmphasis,
    fontSize: 20,
    lineHeight: 24,
    fontWeight: "800",
  },
  body: {
    fontFamily: fontFamilies.interfaceRegular,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "400",
  },
  bodyStrong: {
    fontFamily: fontFamilies.interfaceEmphasis,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "800",
  },
  bodyNumeric: {
    fontFamily: fontFamilies.numericRegular,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "400",
    fontVariant: ["tabular-nums"] as TextStyle["fontVariant"],
  },
  secondary: {
    fontFamily: fontFamilies.interfaceRegular,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "400",
  },
  secondaryNumeric: {
    fontFamily: fontFamilies.numericRegular,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "400",
    fontVariant: ["tabular-nums"] as TextStyle["fontVariant"],
  },
  label: {
    fontFamily: fontFamilies.interfaceRegular,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "400",
  },
  editorialWorkoutTitle: {
    fontFamily: fontFamilies.interfaceEmphasis,
    fontSize: 57,
    lineHeight: 49,
    fontWeight: "890",
    fontStretch: "condensed",
    letterSpacing: revision18EditorialWorkoutTitleLetterSpacing,
  },
};

export const calendarTypeScale = {
  event: {
    fontFamily: fontFamilies.interfaceEmphasis,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "800",
    letterSpacing: -0.44,
  },
  metadata: {
    fontFamily: fontFamilies.interfaceRegular,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "400",
  },
  body: {
    fontFamily: fontFamilies.interfaceRegular,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "400",
  },
  bodyStrong: {
    fontFamily: fontFamilies.interfaceEmphasis,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "800",
  },
  numeric: {
    fontFamily: fontFamilies.numericRegular,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "400",
    fontVariant: ["tabular-nums"] as TextStyle["fontVariant"],
  },
  heading: {
    fontFamily: fontFamilies.interfaceEmphasis,
    fontSize: 22,
    lineHeight: 26,
    fontWeight: "800",
    letterSpacing: -0.55,
  },
} as const;

export function colorWithAlpha(hex: string, opacity: number): string {
  if (!/^#[0-9a-f]{6}$/iu.test(hex) || !Number.isFinite(opacity)) return hex;
  const alpha = Math.max(0, Math.min(255, Math.round(opacity * 255)));
  return `${hex}${alpha.toString(16).padStart(2, "0").toUpperCase()}`;
}

/**
 * Phase 15 Workout semantics intentionally differ from the shared Phase 14
 * shell. Keep the shell's calibrated Archivo 800/890 proof above intact;
 * Workout surfaces consume these four logical roles instead.
 */
export const workoutTypeScale = {
  body: {
    fontFamily: fontFamilies.interfaceRegular,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "400",
  },
  emphasis: {
    fontFamily: fontFamilies.interfaceEmphasis,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: "700",
  },
  numericEmphasis: {
    fontFamily: fontFamilies.numericRegular,
    fontSize: 30,
    lineHeight: 33,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  editorialWorkoutTitle: {
    fontFamily: fontFamilies.interfaceEmphasis,
    fontSize: 57,
    // Archivo's 878-unit ascent and 210-unit descent need 62.016px at 57px.
    // Round up so native line boxes keep descenders at every font scale.
    lineHeight: 63,
    fontWeight: "700",
    fontStretch: "condensed",
    letterSpacing: revision18EditorialWorkoutTitleLetterSpacing,
  },
  // Named compatibility aliases retain the four Workout semantic roles while
  // letting feature surfaces state their intended content role clearly.
  displayTimer: {
    fontFamily: fontFamilies.numericRegular,
    fontSize: 30,
    lineHeight: 33,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  targetValue: {
    fontFamily: fontFamilies.numericRegular,
    fontSize: 30,
    lineHeight: 33,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  screenTitle: {
    fontFamily: fontFamilies.interfaceEmphasis,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: "700",
  },
  sectionTitle: {
    fontFamily: fontFamilies.interfaceEmphasis,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: "700",
  },
  bodyStrong: {
    fontFamily: fontFamilies.interfaceEmphasis,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: "700",
  },
  secondary: {
    fontFamily: fontFamilies.interfaceRegular,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "400",
  },
  label: {
    fontFamily: fontFamilies.interfaceRegular,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "400",
  },
};

export const themes = {
  light: {
    paper: "#FFFAF0", bone: "#F4F0E6", ink: "#0D0C0A", quiet: "#655F56", clay: "#D8C3AB",
    surface: "#F0EADF", raised: "#FFFAF0", line: "#CEC6B8", lightLine: "#CEC6B8", dark: "#FFFAF0",
    text: "#0D0C0A", muted: "#655F56", orange: "#D97820", orangeDark: "#281306",
    green: "#166B4C", greenBg: "#DCECDF", yellow: "#8D5D00", yellowBg: "#FFF0C2",
    blue: "#195FAE", blueBg: "#DCE9F9", toastBg: "#FFFAF0", toastBorder: "#CEC6B8", toastText: "#0D0C0A", toastAccent: "#166B4C",
    dangerSource: "#FF8279", calendarStrengthTextLight: "#9B470B",
    canvas: "#FFFAF0", contentCard: "#F0EADF", contentCardBorder: "#CEC6B8", contentCardDisabled: "#F4F0E6", contentCardPressed: "#F4F0E6", contentCardSelected: "#DCE9F9", contentCardStatusCompleted: "#166B4C", contentCardText: "#0D0C0A", contentCardTextSecondary: "#655F56", surfaceSubtle: "#F4F0E6", textPrimary: "#0D0C0A", textSecondary: "#655F56", divider: "#CEC6B8", action: "#195FAE", actionPressed: "#195FAE", onAction: "#FFFAF0", workoutPrimaryAction: "#D97820", workoutPrimaryActionPressed: "#D97820", onWorkoutPrimaryAction: "#281306", completed: "#166B4C", timerAttention: "#8D5D00",
    destructive: "#B42318",
    errorSurface: "#FEE4E2",
    focusRing: "#195FAE",
  },
  dark: {
    paper: "#080808", bone: "#151515", ink: "#F7F7F2", quiet: "#AAA9A2", clay: "#6D665C",
    surface: "#151515", raised: "#202020", line: "#333330", lightLine: "#333330", dark: "#080808",
    text: "#F7F7F2", muted: "#AAA9A2", orange: "#D97820", orangeDark: "#281306",
    green: "#72DF92", greenBg: "#14271A", yellow: "#F0C84B", yellowBg: "#2A2410",
    blue: "#71AAFF", blueBg: "#14243B", toastBg: "#202020", toastBorder: "#3D423E", toastText: "#F7F7F2", toastAccent: "#72DF92",
    dangerSource: "#FF8279", calendarStrengthTextLight: "#D97820",
    canvas: "#080808", contentCard: "#151515", contentCardBorder: "#333330", contentCardDisabled: "#151515", contentCardPressed: "#202020", contentCardSelected: "#14243B", contentCardStatusCompleted: "#72DF92", contentCardText: "#F7F7F2", contentCardTextSecondary: "#AAA9A2", surfaceSubtle: "#151515", textPrimary: "#F7F7F2", textSecondary: "#AAA9A2", divider: "#333330", action: "#71AAFF", actionPressed: "#71AAFF", onAction: "#080808", workoutPrimaryAction: "#D97820", workoutPrimaryActionPressed: "#D97820", onWorkoutPrimaryAction: "#281306", completed: "#72DF92", timerAttention: "#F0C84B", destructive: "#FF8279", errorSurface: "#2A2410", focusRing: "#71AAFF",
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
  write(value: "Light" | "Dark" | null): unknown;
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

function appearanceValueFromReadResult(value: unknown): unknown {
  if (
    typeof value === "object"
    && value !== null
    && "status" in value
    && value.status === "ready"
    && "value" in value
  ) {
    return value.value;
  }

  return value;
}

function appearanceWriteSucceeded(value: unknown): boolean {
  return !(typeof value === "object" && value !== null && "status" in value && value.status === "failed");
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
    parseAppearancePreference(appearanceValueFromReadResult(store.read())),
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
      const writeResult = store.write(
        validatedPreference === "System" ? null : validatedPreference,
      );
      if (!appearanceWriteSucceeded(writeResult)) {
        return;
      }
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
