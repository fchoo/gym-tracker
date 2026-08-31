import {
  act,
  fireEvent,
  render,
  screen,
} from "@testing-library/react-native";
import {
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import React from "react";
import {
  Appearance,
  BackHandler,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";

import {
  AdaptiveScreen,
  classifyWidth,
} from "../layout/AdaptiveScreen";
import {
  ActionCluster,
  AppTabs,
  AppearanceSheet,
  ConfirmationSheet,
  ContentCard,
  EmptyState,
  ExerciseRow,
  IconAction,
  InlineNotice,
  MetricSummary,
  PlanActivationRow,
  PrimaryAction,
  RootFailureState,
  ScreenHeader,
  SecondaryAction,
  SectionHeader,
  SkeletonBlock,
} from "../components";
import {
  WorkoutStartSheet,
} from "../components/WorkoutStartSheet";
import {
  AppearanceProvider,
  createMemoryAppearanceStore,
  fontFamilies,
  motion,
  radius,
  resolveColorScheme,
  space,
  themes,
  typeScale,
  useAppTheme,
} from "../theme";
import {
  ActiveWorkoutLoadingScreen,
  AppLoadingShell,
  LaunchStateProvider,
  LibraryScreen,
  StartupReadinessGate,
  TodayScreen,
  rootBackBehavior,
  useLaunchState,
} from "../screens/RootScreens";

function ThemeProbe() {
  const theme = useAppTheme();

  return (
    <>
      <Text testID="appearance-mode">{theme.appearance}</Text>
      <Text testID="resolved-scheme">{theme.colorScheme}</Text>
      <Text testID="canvas-color">{theme.colors.canvas}</Text>
      <Text testID="motion-mode">
        {theme.motion.positionTransitions ? "position" : "opacity-only"}
      </Text>
    </>
  );
}

function LaunchProbe() {
  const { launchState, retry } = useLaunchState();

  return (
    <>
      <Text testID="launch-state">{launchState}</Text>
      <PrimaryAction label="Retry launch" onPress={retry} />
    </>
  );
}

function contrastRatio(foreground: string, background: string): number {
  const relativeLuminance = (hex: string) => {
    const match = /^#([0-9A-F]{2})([0-9A-F]{2})([0-9A-F]{2})$/.exec(hex);
    if (match === null) {
      throw new Error(`Invalid color token: ${hex}`);
    }
    const [, redHex = "", greenHex = "", blueHex = ""] = match;
    const toLinear = (channel: number): number =>
      channel <= 0.03928
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4;
    const linearRed = toLinear(Number.parseInt(redHex, 16) / 255);
    const linearGreen = toLinear(Number.parseInt(greenHex, 16) / 255);
    const linearBlue = toLinear(Number.parseInt(blueHex, 16) / 255);
    return 0.2126 * linearRed + 0.7152 * linearGreen + 0.0722 * linearBlue;
  };
  const [lighter = 0, darker = 0] = [
    relativeLuminance(foreground),
    relativeLuminance(background),
  ].sort((left, right) => right - left);

  return (lighter + 0.05) / (darker + 0.05);
}

describe("Plan 01-02 UI foundation", () => {
  it("encodes the approved spacing, radius, type, color, and motion tokens", () => {
    expect(space).toEqual({
      1: 4,
      2: 8,
      4: 16,
      6: 24,
      8: 32,
      12: 48,
      16: 64,
    });
    expect(radius).toEqual({
      standard: 8,
      emphasized: 12,
      full: 999,
    });
    expect(typeScale).toEqual(
      expect.objectContaining({
        displayTimer: expect.objectContaining({
          fontFamily: fontFamilies.numericSemiBold,
          fontSize: 52,
          lineHeight: 56,
        }),
        targetValue: expect.objectContaining({
          fontFamily: fontFamilies.numericSemiBold,
          fontSize: 28,
          lineHeight: 34,
        }),
        screenTitle: expect.objectContaining({
          fontFamily: fontFamilies.interfaceSemiBold,
          fontSize: 28,
          lineHeight: 34,
        }),
        body: expect.objectContaining({
          fontFamily: fontFamilies.interfaceRegular,
          fontSize: 16,
          lineHeight: 22,
        }),
      }),
    );
    expect(themes.light).toEqual(
      expect.objectContaining({
        canvas: "#F1F3F4",
        contentCard: "#FFFFFF",
        contentCardText: "#202124",
        contentCardTextSecondary: "#5F6368",
        action: "#155EEF",
        completed: "#1F7A4D",
        timerAttention: "#B54708",
        destructive: "#B42318",
      }),
    );
    expect(themes.dark).toEqual(
      expect.objectContaining({
        canvas: "#202124",
        contentCard: "#121212",
        contentCardText: "#E8EAED",
        contentCardTextSecondary: "#BDC1C6",
        action: "#70A0FF",
        completed: "#56C88A",
        timerAttention: "#FFB45C",
        destructive: "#FF746A",
      }),
    );
    expect(motion.standard.positionTransitions).toBe(true);
    expect(motion.reduced.positionTransitions).toBe(false);
    expect(motion.reduced.scaleTransitions).toBe(false);
  });

  it("inverts content cards across Gmail-like neutral light and dark canvases", () => {
    for (const colors of [themes.light, themes.dark]) {
      expect(colors).toEqual(
        expect.objectContaining({
          contentCard: expect.stringMatching(/^#[0-9A-F]{6}$/),
          contentCardBorder: expect.stringMatching(/^#[0-9A-F]{6}$/),
          contentCardDisabled: expect.stringMatching(/^#[0-9A-F]{6}$/),
          contentCardPressed: expect.stringMatching(/^#[0-9A-F]{6}$/),
          contentCardSelected: expect.stringMatching(/^#[0-9A-F]{6}$/),
          contentCardText: expect.stringMatching(/^#[0-9A-F]{6}$/),
          contentCardTextSecondary: expect.stringMatching(/^#[0-9A-F]{6}$/),
        }),
      );
      expect(contrastRatio(colors.contentCardText, colors.contentCard)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(colors.contentCardTextSecondary, colors.contentCard)).toBeGreaterThanOrEqual(4.5);
      expect(colors.canvas).not.toBe(colors.contentCard);
    }

    expect(themes.light.contentCard).toBe("#FFFFFF");
    expect(themes.light.contentCardText).toBe("#202124");
    expect(themes.dark.contentCard).toBe("#121212");
    expect(themes.dark.contentCardText).toBe("#E8EAED");
  });

  it("renders a flat ContentCard and right-edge ActionCluster without allowing card nesting", async () => {
    await render(
      <AppearanceProvider>
        <ContentCard focused selected status="completed" testID="selected-content-card">
          <Text>Scannable content</Text>
        </ContentCard>
        <ContentCard disabled pressed testID="disabled-content-card">
          <Text>Disabled content</Text>
        </ContentCard>
        <ActionCluster testID="content-card-actions">
          <SecondaryAction label="Review" onPress={jest.fn()} />
          <SecondaryAction label="Archive" onPress={jest.fn()} />
        </ActionCluster>
      </AppearanceProvider>,
    );

    expect(screen.getByTestId("selected-content-card")).toHaveStyle({
      backgroundColor: themes.light.contentCardSelected,
      borderColor: themes.light.contentCardStatusCompleted,
      outlineColor: themes.light.focusRing,
      outlineWidth: 2,
    });
    expect(screen.getByTestId("disabled-content-card")).toHaveStyle({
      backgroundColor: themes.light.contentCardDisabled,
      opacity: 0.62,
    });
    expect(screen.getByTestId("content-card-actions")).toHaveStyle({
      alignItems: "stretch",
      flexDirection: "row",
      justifyContent: "flex-end",
    });
    expect(screen.getByRole("button", { name: "Review" })).toHaveStyle({
      minHeight: 48,
    });
    expect(screen.getByRole("button", { name: "Archive" })).toHaveStyle({
      minHeight: 48,
    });

    await expect(render(
      <AppearanceProvider>
        <ContentCard>
          <ContentCard>
            <Text>Nested card</Text>
          </ContentCard>
        </ContentCard>
      </AppearanceProvider>,
    )).rejects.toThrow("ContentCard cannot be nested");
  });

  it("validates appearance preferences and follows the system only in System mode", () => {
    expect(resolveColorScheme("System", "dark")).toBe("dark");
    expect(resolveColorScheme("System", null)).toBe("light");
    expect(resolveColorScheme("Light", "dark")).toBe("light");
    expect(resolveColorScheme("Dark", "light")).toBe("dark");
    expect(resolveColorScheme("stale-value", "dark")).toBe("dark");
  });

  it("defaults to System and persists only explicit Light or Dark overrides", async () => {
    jest.spyOn(Appearance, "getColorScheme").mockReturnValue("dark");
    const store = createMemoryAppearanceStore();

    await render(
      <AppearanceProvider store={store}>
        <ThemeProbe />
        <AppearanceSheet visible onClose={jest.fn()} />
      </AppearanceProvider>,
    );

    expect(screen.getByTestId("appearance-mode")).toHaveTextContent("System");
    expect(screen.getByTestId("resolved-scheme")).toHaveTextContent("dark");
    expect(screen.getByRole("radio", { name: "System" })).toBeSelected();

    await fireEvent.press(screen.getByRole("radio", { name: "Light" }));
    expect(screen.getByTestId("appearance-mode")).toHaveTextContent("Light");
    expect(screen.getByTestId("resolved-scheme")).toHaveTextContent("light");
    expect(store.read()).toBe("Light");

    await fireEvent.press(screen.getByRole("radio", { name: "System" }));
    expect(store.read()).toBeNull();
  });

  it("treats a malformed injected appearance preference as selected System", async () => {
    jest.spyOn(Appearance, "getColorScheme").mockReturnValue("dark");
    const store = createMemoryAppearanceStore("malformed");

    await render(
      <AppearanceProvider store={store}>
        <ThemeProbe />
        <AppearanceSheet visible onClose={jest.fn()} />
      </AppearanceProvider>,
    );

    expect(screen.getByTestId("appearance-mode")).toHaveTextContent("System");
    expect(screen.getByTestId("resolved-scheme")).toHaveTextContent("dark");
    expect(screen.getByRole("radio", { name: "System" })).toBeSelected();
  });

  it("rehydrates an explicit override from the injected persistent store", async () => {
    jest.spyOn(Appearance, "getColorScheme").mockReturnValue("light");
    const processStore = createMemoryAppearanceStore();
    const firstRender = await render(
      <AppearanceProvider store={processStore}>
        <AppearanceSheet visible onClose={jest.fn()} />
      </AppearanceProvider>,
    );

    await fireEvent.press(screen.getByRole("radio", { name: "Dark" }));
    expect(processStore.read()).toBe("Dark");
    await firstRender.unmount();

    const remount = await render(
      <AppearanceProvider store={processStore}>
        <ThemeProbe />
      </AppearanceProvider>,
    );
    expect(screen.getByTestId("appearance-mode")).toHaveTextContent("Dark");
    await remount.unmount();

    await render(
      <AppearanceProvider store={createMemoryAppearanceStore()}>
        <ThemeProbe />
      </AppearanceProvider>,
    );
    expect(screen.getByTestId("appearance-mode")).toHaveTextContent("System");
  });

  it("selects compact, medium, and expanded width contracts at exact boundaries", () => {
    expect(classifyWidth(599)).toBe("compact");
    expect(classifyWidth(600)).toBe("medium");
    expect(classifyWidth(839)).toBe("medium");
    expect(classifyWidth(840)).toBe("expanded");
  });

  const adaptiveCases: ReadonlyArray<
    readonly ["compact" | "medium" | "expanded", number, number]
  > = [
    ["compact", 599, 16],
    ["medium", 600, 24],
    ["expanded", 840, 32],
  ];

  it.each(adaptiveCases)(
    "keeps active work and its dock together in the %s layout",
    async (widthClass, width, horizontalInset) => {
      await render(
        <AppearanceProvider>
          <AdaptiveScreen
            width={width}
            primary={<Text>Current exercise</Text>}
            secondary={<Text>Comparable history</Text>}
            dock={<PrimaryAction label="Complete Set 1" onPress={jest.fn()} />}
          />
        </AppearanceProvider>,
      );

      const layout = screen.getByTestId("adaptive-screen");
      const activeRegion = screen.getByTestId("adaptive-primary-region");
      const dock = screen.getByTestId("adaptive-dock");
      expect(layout).toHaveProp("accessibilityLabel", `${widthClass} layout`);
      expect(layout).toHaveStyle({ paddingHorizontal: horizontalInset });
      expect(activeRegion).toContainElement(screen.getByText("Current exercise"));
      expect(dock).toContainElement(
        screen.getByRole("button", { name: "Complete Set 1" }),
      );
    },
  );

  it("keeps every edge inside the safe area while an expanded layout fills its scene", async () => {
    await render(
      <AppearanceProvider>
        <AdaptiveScreen
          primary={<Text>Expanded content</Text>}
          scrollable={false}
          width={840}
        />
      </AppearanceProvider>,
    );

    const safeArea = screen.getByText("Expanded content").parent?.parent?.parent;
    expect(safeArea).toBeDefined();
    expect(safeArea).toHaveProp("edges", {
      bottom: "additive",
      left: "additive",
      right: "additive",
      top: "additive",
    });
    expect(safeArea).toHaveStyle({ flex: 1 });
    expect(screen.getByTestId("adaptive-screen")).toHaveProp(
      "accessibilityLabel",
      "expanded layout",
    );
    expect(screen.getByTestId("adaptive-screen")).toHaveStyle({
      flex: 1,
      width: "100%",
    });
  });

  it("restores a saved scroll offset only when the restore key changes", async () => {
    const scrollTo = jest.spyOn(
      ScrollView.prototype,
      "scrollTo",
    ).mockImplementation(() => undefined);
    const rendered = await render(
      <AppearanceProvider>
        <AdaptiveScreen
          primary={<Text>Plans</Text>}
          scrollOffset={0}
          scrollRestoreKey="plans"
        />
      </AppearanceProvider>,
    );

    expect(scrollTo).not.toHaveBeenCalled();
    await rendered.rerender(
      <AppearanceProvider>
        <AdaptiveScreen
          primary={<Text>Plans updated</Text>}
          scrollOffset={240}
          scrollRestoreKey="plans"
        />
      </AppearanceProvider>,
    );
    expect(scrollTo).not.toHaveBeenCalled();

    await rendered.rerender(
      <AppearanceProvider>
        <AdaptiveScreen
          primary={<Text>Exercises</Text>}
          scrollOffset={320}
          scrollRestoreKey="exercises"
        />
      </AppearanceProvider>,
    );
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith({
      animated: false,
      x: 0,
      y: 320,
    });
    scrollTo.mockRestore();
  });

  it.each(adaptiveCases)(
    "attaches one controlled refresh seam to the owning ScrollView in the %s layout",
    async (widthClass, width) => {
      const onRefresh = jest.fn();
      await render(
        <AppearanceProvider>
          <AdaptiveScreen
            onRefresh={onRefresh}
            primary={<Text>{widthClass} library</Text>}
            refreshing
            width={width}
          />
        </AppearanceProvider>,
      );

      const scroll = screen.getByTestId("adaptive-screen-scroll");
      expect(screen.queryAllByTestId("adaptive-screen-scroll")).toHaveLength(1);
      expect(scroll).toHaveProp("keyboardShouldPersistTaps", "handled");
      expect(scroll).toHaveProp("scrollEventThrottle", 16);
      expect(scroll.props.refreshControl).toBeDefined();
      expect(scroll.props.refreshControl.type).toBe(RefreshControl);
      expect(scroll.props.refreshControl.props.refreshing).toBe(true);

      scroll.props.refreshControl.props.onRefresh();
      expect(onRefresh).toHaveBeenCalledTimes(1);
    },
  );

  it("leaves the owning ScrollView without refresh control when no controlled handler is supplied", async () => {
    await render(
      <AppearanceProvider>
        <AdaptiveScreen primary={<Text>Static Library</Text>} />
      </AppearanceProvider>,
    );

    expect(screen.queryAllByTestId("adaptive-screen-scroll")).toHaveLength(1);
    expect(screen.getByTestId("adaptive-screen-scroll").props.refreshControl)
      .toBeUndefined();
  });

  it("enforces minimum targets, wrapping labels, and vertical large-text metrics", async () => {
    await render(
      <AppearanceProvider>
        <PrimaryAction
          label="Activate Full Body Foundation"
          onPress={jest.fn()}
        />
        <IconAction
          accessibilityLabel="More settings and information"
          icon="more"
          onPress={jest.fn()}
        />
        <MetricSummary
          forceStacked
          label="Completed working sets"
          value="12"
        />
      </AppearanceProvider>,
    );

    expect(
      screen.getByRole("button", { name: "Activate Full Body Foundation" }),
    ).toHaveStyle({ minHeight: 56 });
    expect(
      screen.getByText("Activate Full Body Foundation").props.numberOfLines,
    ).toBeUndefined();
    expect(
      screen.getByRole("button", { name: "More settings and information" }),
    ).toHaveStyle({ minHeight: 48, minWidth: 48 });
    expect(screen.getByTestId("metric-summary")).toHaveStyle({
      flexDirection: "column",
    });
  });

  it("pairs semantic color with icon and text while hiding skeletons", async () => {
    await render(
      <AppearanceProvider>
        <InlineNotice
          body="Your values are still here."
          heading="Set not saved"
          tone="error"
        />
        <SkeletonBlock height={56} testID="action-skeleton" />
      </AppearanceProvider>,
    );

    expect(screen.getByText("Set not saved")).toBeOnTheScreen();
    expect(screen.getAllByLabelText("Error").length).toBeGreaterThan(0);
    expect(
      screen.getByTestId("action-skeleton", { includeHiddenElements: true }),
    ).toHaveProp(
      "importantForAccessibility",
      "no-hide-descendants",
    );
    expect(
      screen.getByTestId("action-skeleton", { includeHiddenElements: true }),
    ).toHaveProp("accessible", false);
  });

  it("removes position and scale movement when reduced motion is enabled", async () => {
    await render(
      <AppearanceProvider reduceMotion>
        <ThemeProbe />
      </AppearanceProvider>,
    );

    expect(screen.getByTestId("motion-mode")).toHaveTextContent("opacity-only");
  });

  it("fails closed when theme values are consumed outside the provider", async () => {
    await expect(render(<ThemeProbe />)).rejects.toThrow(
      "useAppTheme must be used within AppearanceProvider",
    );
  });

  it("supports non-scroll compact content without optional panes or a dock", async () => {
    await render(
      <AppearanceProvider>
        <AdaptiveScreen
          primary={<Text>Only primary content</Text>}
          scrollable={false}
          width={599}
        />
      </AppearanceProvider>,
    );

    expect(screen.getByText("Only primary content")).toBeOnTheScreen();
    expect(screen.queryByTestId("adaptive-secondary-region")).not.toBeOnTheScreen();
    expect(screen.queryByTestId("adaptive-dock")).not.toBeOnTheScreen();
  });

  it("handles hardware back through the owning adaptive route and removes the listener", async () => {
    const remove = jest.fn();
    const onRequestBack = jest.fn();
    const addEventListener = jest.spyOn(BackHandler, "addEventListener")
      .mockReturnValue({ remove });
    const rendered = await render(
      <AppearanceProvider>
        <AdaptiveScreen
          onRequestBack={onRequestBack}
          primary={<Text>Focused route</Text>}
        />
      </AppearanceProvider>,
    );
    const listener = addEventListener.mock.calls[0]?.[1];

    expect(listener?.(undefined as never)).toBe(true);
    expect(onRequestBack).toHaveBeenCalledTimes(1);
    await act(async () => {
      rendered.unmount();
    });
    expect(remove).toHaveBeenCalledTimes(1);
    addEventListener.mockRestore();
  });
});

describe("Plan 01-02 route shell", () => {
  const routes = [
    { key: "today-key", name: "index" },
    { key: "calendar-key", name: "calendar" },
    { key: "library-key", name: "library" },
    { key: "progress-key", name: "progress" },
  ] as const;

  it("renders Today, Calendar, Library, and Progress as visible tabs in locked order", async () => {
    await render(
      <AppearanceProvider>
        <AppTabs
          navigation={{
            emit: () => ({ defaultPrevented: false }),
            navigate: jest.fn(),
          }}
          state={{ index: 0, routes }}
        />
      </AppearanceProvider>,
    );

    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.props.accessibilityLabel)).toEqual([
      "Today",
      "Calendar",
      "Library",
      "Progress",
    ]);
    expect(screen.getByRole("tab", { name: "Today" })).toBeSelected();
    for (const label of ["Today", "Calendar", "Library", "Progress"]) {
      expect(screen.getByText(label)).toBeOnTheScreen();
    }
    expect(screen.getByText("Library")).toHaveStyle({
      lineHeight: 22,
      paddingBottom: 2,
      paddingHorizontal: 4,
    });
  });

  it("reflows four complete root destinations into two accessible rows for 200% text", async () => {
    const navigate = jest.fn();
    await render(
      <AppearanceProvider>
        <AppTabs
          compactLayout="two-row"
          navigation={{
            emit: () => ({ defaultPrevented: false }),
            navigate,
          }}
          state={{ index: 2, routes }}
        />
      </AppearanceProvider>,
    );

    const rootNavigation = screen.getByLabelText(
      "Root navigation bottom two rows",
    );
    expect(rootNavigation).toHaveStyle({
      flexWrap: "wrap",
    });
    expect(screen.getAllByRole("tab").map((tab) => tab.props.accessibilityLabel))
      .toEqual(["Today", "Calendar", "Library", "Progress"]);
    expect(screen.getByRole("tab", { name: "Library" })).toBeSelected();

    for (const label of ["Today", "Calendar", "Library", "Progress"]) {
      const tab = screen.getByRole("tab", { name: label });
      expect(tab).toHaveStyle({
        minHeight: 64,
        minWidth: 48,
        width: "50%",
      });
      expect(screen.getByText(label).props.numberOfLines).toBeUndefined();
    }

    const progress = screen.getByRole("tab", { name: "Progress" });
    await fireEvent(progress, "focus");
    expect(progress).toHaveStyle({ outlineWidth: 2 });
    await fireEvent(progress, "keyDown", {
      nativeEvent: { key: "Enter" },
    });
    expect(navigate).toHaveBeenCalledWith("progress");
  });

  it("checks notification readiness before entering the trusted app", async () => {
    const requestPermission = jest.fn(async () => "granted" as const);
    const continueWithoutAlerts = jest.fn();
    await render(
      <AppearanceProvider>
        <StartupReadinessGate
          launchState="trusted"
          notificationPermission="undetermined"
          onContinueWithoutAlerts={continueWithoutAlerts}
          onOpenSettings={jest.fn()}
          onRequestPermission={requestPermission}
        >
          <Text>Today content</Text>
        </StartupReadinessGate>
      </AppearanceProvider>,
    );

    expect(screen.getByRole("header", { name: "Set up workout alerts" }))
      .toBeOnTheScreen();
    expect(screen.queryByText("Today content")).not.toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole("button", { name: "Enable notifications" }),
    );
    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Today content")).toBeOnTheScreen();
  });

  it("allows denied or declined notification readiness without blocking workouts", async () => {
    const openSettings = jest.fn();
    const continueWithoutAlerts = jest.fn();
    await render(
      <AppearanceProvider>
        <StartupReadinessGate
          launchState="trusted"
          notificationPermission="undetermined"
          onContinueWithoutAlerts={continueWithoutAlerts}
          onOpenSettings={openSettings}
          onRequestPermission={jest.fn(async () => "denied" as const)}
        >
          <Text>Today content</Text>
        </StartupReadinessGate>
      </AppearanceProvider>,
    );

    await fireEvent.press(
      screen.getByRole("button", { name: "Enable notifications" }),
    );
    expect(screen.getByRole("button", { name: "Open notification settings" }))
      .toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole("button", { name: "Open notification settings" }),
    );
    expect(openSettings).toHaveBeenCalledTimes(1);
    await fireEvent.press(
      screen.getByRole("button", { name: "Continue without alerts" }),
    );
    expect(continueWithoutAlerts).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Today content")).toBeOnTheScreen();
  });

  it("does not block an already-denied user on every relaunch", async () => {
    await render(
      <AppearanceProvider>
        <StartupReadinessGate
          launchState="trusted"
          notificationPermission="denied"
          onContinueWithoutAlerts={jest.fn()}
          onOpenSettings={jest.fn()}
          onRequestPermission={jest.fn(async () => "denied" as const)}
        >
          <Text>Today content</Text>
        </StartupReadinessGate>
      </AppearanceProvider>,
    );

    expect(screen.getByText("Today content")).toBeOnTheScreen();
    expect(screen.queryByRole("header", { name: "Set up workout alerts" }))
      .not.toBeOnTheScreen();
  });

  it("renders an immediate structured shell while fonts load", async () => {
    await render(
      <AppearanceProvider>
        <AppLoadingShell width={599} />
      </AppearanceProvider>,
    );

    expect(screen.getByRole("header", { name: "Today" })).toBeOnTheScreen();
    expect(
      screen.getAllByTestId(/today-skeleton/, { includeHiddenElements: true }),
    ).toHaveLength(6);
    expect(screen.getAllByRole("tab")).toHaveLength(4);
    for (const tab of screen.getAllByRole("tab")) {
      expect(tab).toBeDisabled();
    }
  });

  it("uses the expanded loading-shell rail contract", async () => {
    await render(
      <AppearanceProvider>
        <AppLoadingShell width={840} />
      </AppearanceProvider>,
    );

    expect(screen.getByLabelText("Root navigation rail")).toHaveStyle({
      width: 112,
    });
  });

  it("announces all root destinations as unavailable while launch is untrusted", async () => {
    const navigate = jest.fn();
    await render(
      <AppearanceProvider>
        <AppTabs
          disabled
          navigation={{
            emit: () => ({ defaultPrevented: false }),
            navigate,
          }}
          state={{ index: 0, routes }}
        />
      </AppearanceProvider>,
    );

    for (const tab of screen.getAllByRole("tab")) {
      expect(tab).toBeDisabled();
    }
    await fireEvent.press(screen.getByRole("tab", { name: "Calendar" }));
    expect(navigate).not.toHaveBeenCalled();
  });

  it("renders structured Today shell placeholders without stale workout facts", async () => {
    await render(
      <AppearanceProvider>
        <TodayScreen launchState="booting" />
      </AppearanceProvider>,
    );

    expect(screen.getByRole("header", { name: "Today" })).toBeOnTheScreen();
    expect(
      screen.getByRole("button", { name: "Appearance and rest-alert settings" }),
    ).toBeDisabled();
    expect(
      screen.getAllByTestId(/today-skeleton/, { includeHiddenElements: true }),
    ).toHaveLength(6);
    expect(screen.queryByText(/kg|reps|workout in progress/i)).not.toBeOnTheScreen();
  });

  it("keeps trusted Today structural without unapproved future-phase copy", async () => {
    await render(
      <AppearanceProvider>
        <TodayScreen launchState="trusted" />
      </AppearanceProvider>,
    );

    expect(
      screen.getAllByTestId(/today-skeleton/, { includeHiddenElements: true }),
    ).toHaveLength(6);
    expect(screen.queryByText(/workout data ready/i)).not.toBeOnTheScreen();
    expect(
      screen.queryByText(/workout repository lands/i),
    ).not.toBeOnTheScreen();
  });

  it("drives failed, retry, default, and auto-trusted launch states", async () => {
    const failedRender = await render(
      <AppearanceProvider>
        <LaunchStateProvider initialState="failed">
          <TodayScreen />
          <LaunchProbe />
        </LaunchStateProvider>
      </AppearanceProvider>,
    );

    expect(
      screen.getByRole("header", { name: "Workout data could not be opened" }),
    ).toBeOnTheScreen();
    expect(screen.getByTestId("launch-state")).toHaveTextContent("failed");
    await fireEvent.press(
      screen.getByRole("button", { name: "Retry opening workout data" }),
    );
    expect(screen.getByTestId("launch-state")).toHaveTextContent("booting");
    await failedRender.unmount();

    const autoTrustRender = await render(
      <AppearanceProvider>
        <LaunchStateProvider autoTrust>
          <LaunchProbe />
        </LaunchStateProvider>
      </AppearanceProvider>,
    );
    expect(screen.getByTestId("launch-state")).toHaveTextContent("trusted");
    await autoTrustRender.unmount();

    await render(
      <AppearanceProvider>
        <LaunchProbe />
      </AppearanceProvider>,
    );
    expect(screen.getByTestId("launch-state")).toHaveTextContent("booting");
    await fireEvent.press(screen.getByRole("button", { name: "Retry launch" }));
    expect(screen.getByTestId("launch-state")).toHaveTextContent("booting");
  });

  const emptyRootCases: ReadonlyArray<
    readonly [
      string,
      React.ComponentType<{ onGoToday: () => void }>,
      string,
      string,
    ]
  > = [
    [
      "Library",
      LibraryScreen,
      "Library is not available yet",
      "Full plan and exercise management will arrive in a later phase. Full Body Foundation is available from Today.",
    ],
  ];

  it.each(emptyRootCases)(
    "renders only the exact intentional %s empty destination",
    async (destination, ScreenComponent, heading, body) => {
      const goToday = jest.fn();
      await render(
        <AppearanceProvider>
          <ScreenComponent onGoToday={goToday} />
        </AppearanceProvider>,
      );

      expect(
        screen.getByRole("header", { name: destination }),
      ).toBeOnTheScreen();
      expect(screen.getByRole("header", { name: heading })).toBeOnTheScreen();
      expect(screen.getByText(body)).toBeOnTheScreen();
      await fireEvent.press(
        screen.getByRole("button", { name: "Go to Today" }),
      );
      expect(goToday).toHaveBeenCalledTimes(1);
      expect(screen.queryByText(/search|filter|chart|create/i)).not.toBeOnTheScreen();
    },
  );

  it("keeps the focused workout outside root navigation at every width", async () => {
    for (const width of [599, 600, 840]) {
      const { unmount } = await render(
        <AppearanceProvider>
          <ActiveWorkoutLoadingScreen
            onGoBack={jest.fn()}
            sessionId="session-01"
            width={width}
          />
        </AppearanceProvider>,
      );

      expect(
        screen.getByRole("header", { name: "Active Workout" }),
      ).toBeOnTheScreen();
      expect(screen.queryByRole("tablist")).not.toBeOnTheScreen();
      expect(
        screen.queryByText(/working-set interface arrives/i),
      ).not.toBeOnTheScreen();
      await unmount();
    }
  });

  it("dismisses Appearance before root history and restores the invoking action", async () => {
    await render(
      <AppearanceProvider>
        <TodayScreen launchState="trusted" />
      </AppearanceProvider>,
    );

    await fireEvent.press(
      screen.getByRole("button", { name: "Appearance and rest-alert settings" }),
    );
    expect(screen.getByRole("header", { name: "Rest alerts" })).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole("button", { name: "Close rest alerts" }),
    );
    expect(
      screen.queryByRole("header", { name: "Rest alerts" }),
    ).not.toBeOnTheScreen();
    expect(
      screen.getByRole("button", { name: "Appearance and rest-alert settings" }),
    ).toBeOnTheScreen();

    await fireEvent.press(
      screen.getByRole("button", { name: "Appearance and rest-alert settings" }),
    );
    expect(screen.getByRole("header", { name: "Rest alerts" })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Appearance" }));
    expect(
      screen.queryByRole("header", { name: "Rest alerts" }),
    ).not.toBeOnTheScreen();
    expect(screen.getByRole("header", { name: "Appearance" })).toBeOnTheScreen();
    expect(screen.getByTestId("appearance-sheet-content")).toHaveProp(
      "keyboardShouldPersistTaps",
      "handled",
    );
    expect(screen.getByTestId("appearance-sheet-content")).toHaveStyle({
      maxHeight: "90%",
    });

    await fireEvent(
      screen.getByRole("header", { name: "Appearance" }),
      "requestClose",
    );
    expect(
      screen.queryByRole("header", { name: "Appearance" }),
    ).not.toBeOnTheScreen();
    expect(
      screen.getByRole("button", { name: "Appearance and rest-alert settings" }),
    ).toBeOnTheScreen();
  });

  it("locks root Android Back behavior to route history before exit", () => {
    expect(rootBackBehavior).toBe("history");
  });
});

describe("Plan 01-02 shared component vocabulary", () => {
  it("covers actions, headers, empty states, notices, and root failure recovery", async () => {
    const retry = jest.fn();
    const secondary = jest.fn();

    await render(
      <AppearanceProvider>
        <ScreenHeader
          action={<Text>Header action</Text>}
          backAction={secondary}
          eyebrow="PLANNED WORKOUT"
          title="Today"
        />
        <SectionHeader
          action={<Text>Section action</Text>}
          supportingText="Supporting evidence"
          title="Next target"
        />
        <EmptyState
          body="Nothing to show."
          heading="Empty"
          primaryAction={
            <PrimaryAction label="Primary" onPress={retry} />
          }
          secondaryAction={
            <SecondaryAction
              destructive
              label="Secondary"
              onPress={secondary}
            />
          }
        />
        <InlineNotice
          body="Saved."
          heading="Committed"
          tone="completed"
        />
        <InlineNotice
          body="Timer expired."
          heading="Attention"
          tone="attention"
        />
        <InlineNotice
          body="Information."
          heading="Note"
        />
        <RootFailureState correlationCode="GT-STORE-001" onRetry={retry} />
      </AppearanceProvider>,
    );

    await fireEvent.press(screen.getByRole("button", { name: "Go back" }));
    await fireEvent.press(screen.getByRole("button", { name: "Primary" }));
    await fireEvent.press(screen.getByRole("button", { name: "Secondary" }));
    await fireEvent.press(
      screen.getByRole("button", { name: "View diagnostic code" }),
    );
    expect(screen.getByText("Storage · GT-STORE-001")).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole("button", { name: "View diagnostic code" }),
    );
    expect(screen.queryByText("Storage · GT-STORE-001")).not.toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole("button", { name: "Retry opening workout data" }),
    );

    expect(retry).toHaveBeenCalledTimes(2);
    expect(secondary).toHaveBeenCalledTimes(2);
    expect(screen.getAllByLabelText("Completed").length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText("Attention").length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText("Information").length).toBeGreaterThan(0);
  });

  it("covers confirmation, selectable plan/exercise rows, and tab navigation branches", async () => {
    const cancel = jest.fn();
    const confirm = jest.fn();
    const activate = jest.fn();
    const selectExercise = jest.fn();
    const navigate = jest.fn();
    const emit = jest.fn(() => ({ defaultPrevented: false }));
    const routes = [
      { key: "today-key", name: "index" },
      { key: "calendar-key", name: "calendar" },
      { key: "library-key", name: "library" },
      { key: "progress-key", name: "progress" },
    ] as const;

    const confirmation = await render(
      <AppearanceProvider>
        <ConfirmationSheet
          body="This cannot be undone."
          cancelLabel="Cancel"
          confirmLabel="Discard"
          destructive
          heading="Discard workout?"
          onCancel={cancel}
          onConfirm={confirm}
          visible
        />
        <PlanActivationRow onPress={activate} />
        <ExerciseRow
          history="40 kg × 8"
          name="Back Squat"
          nextTarget="42.5 kg × 8"
        />
        <ExerciseRow
          history="40 kg × 8"
          name="Bench Press"
          nextTarget="42.5 kg × 8"
          onPress={selectExercise}
          recommendationState="Suggestion pending"
        />
        <AppTabs
          navigation={{ emit, navigate }}
          position="rail"
          state={{ index: 0, routes }}
        />
      </AppearanceProvider>,
    );

    await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
    await fireEvent.press(screen.getByRole("button", { name: "Discard" }));
    await fireEvent.press(
      screen.getByRole("button", {
        name: /Full Body Foundation\. 3 days per week/,
      }),
    );
    await fireEvent.press(
      screen.getByRole("button", {
        name: /Bench Press\. Next target 42\.5 kg × 8/,
      }),
    );
    await fireEvent.press(screen.getByRole("tab", { name: "Today" }));
    await fireEvent.press(screen.getByRole("tab", { name: "Calendar" }));

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(activate).toHaveBeenCalledTimes(1);
    expect(selectExercise).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledTimes(2);
    expect(navigate).toHaveBeenCalledWith("calendar");

    await confirmation.unmount();
  });

  it("covers prevented, missing, keyboard, busy, and disabled action branches", async () => {
    const navigate = jest.fn();
    const preventedEmit = jest.fn(() => ({ defaultPrevented: true }));
    const action = jest.fn();

    await render(
      <AppearanceProvider>
        <AppTabs
          navigation={{ emit: preventedEmit, navigate }}
          state={{
            index: 0,
            routes: [
              { key: "today-key", name: "index" },
              { key: "calendar-key", name: "calendar" },
            ],
          }}
        />
        <SecondaryAction label="Keyboard action" onPress={action} />
        <SecondaryAction disabled label="Disabled action" onPress={action} />
        <PrimaryAction busy label="Busy action" onPress={action} />
      </AppearanceProvider>,
    );

    await fireEvent.press(screen.getByRole("tab", { name: "Calendar" }));
    await fireEvent.press(screen.getByRole("tab", { name: "Progress" }));
    expect(preventedEmit).toHaveBeenCalledTimes(1);
    expect(navigate).not.toHaveBeenCalled();

    const keyboardAction = screen.getByRole("button", {
      name: "Keyboard action",
    });
    await fireEvent(keyboardAction, "keyDown", {
      nativeEvent: { key: "Escape" },
    });
    await fireEvent(keyboardAction, "keyDown", {
      nativeEvent: { key: "Enter" },
    });
    await fireEvent(keyboardAction, "keyDown", {
      nativeEvent: { key: " " },
    });
    await fireEvent(
      screen.getByRole("button", { name: "Disabled action" }),
      "keyDown",
      { nativeEvent: { key: "Enter" } },
    );
    expect(action).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "Busy action" })).toBeDisabled();
  });

  it("renders a visible focus ring and keyboard-activates the starter plan", async () => {
    const action = jest.fn();
    const activate = jest.fn();

    await render(
      <AppearanceProvider>
        <PrimaryAction
          label="Focused primary action"
          onPress={action}
        />
        <PlanActivationRow onPress={activate} />
      </AppearanceProvider>,
    );

    const primary = screen.getByRole("button", {
      name: "Focused primary action",
    });
    await fireEvent(primary, "focus");
    expect(primary).toHaveStyle({
      outlineColor: themes.light.focusRing,
      outlineWidth: 2,
    });
    await fireEvent(primary, "blur");
    expect(primary).toHaveStyle({ outlineWidth: 0 });

    const plan = screen.getByRole("button", {
      name: /Full Body Foundation\. 3 days per week/,
    });
    await fireEvent(plan, "keyDown", {
      nativeEvent: { key: "Enter" },
    });
    await fireEvent(plan, "keyDown", {
      nativeEvent: { key: " " },
    });
    expect(activate).toHaveBeenCalledTimes(2);
  });

  it("restores invoking focus when modal sheets are cancelled", async () => {
    const focus = jest.fn();
    const restoreFocusRef = {
      current: { focus } as unknown as View,
    };
    const cancel = jest.fn();
    const confirmation = await render(
      <AppearanceProvider>
        <ConfirmationSheet
          body="No changes are applied."
          cancelLabel="Keep training"
          confirmLabel="Continue"
          heading="Confirm action"
          onCancel={cancel}
          onConfirm={jest.fn()}
          restoreFocusRef={restoreFocusRef}
          visible
        />
      </AppearanceProvider>,
    );

    expect(screen.getByTestId("confirmation-sheet-content")).toHaveStyle({
      maxHeight: "90%",
    });
    await fireEvent.press(
      screen.getByRole("button", { name: "Keep training" }),
    );
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(focus).toHaveBeenCalledTimes(1);
    await confirmation.unmount();

    const close = jest.fn();
    await render(
      <AppearanceProvider>
        <WorkoutStartSheet
          onClose={close}
          onStartDay={jest.fn()}
          onStartEmpty={jest.fn()}
          planDays={[{ id: "day-a", name: "Full Body A", ordinal: 0 }]}
          restoreFocusRef={restoreFocusRef}
          visible
        />
      </AppearanceProvider>,
    );
    await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
    expect(close).toHaveBeenCalledTimes(1);
    expect(focus).toHaveBeenCalledTimes(2);
  });

  it("keeps later workout controls out of the Phase 1 foundation vocabulary", () => {
    const componentSource = require("node:fs").readFileSync(
      require("node:path").join(__dirname, "../components/index.ts"),
      "utf8",
    );

    for (const futureControl of [
      "TargetValue",
      "SetRow",
      "WarmupSetRow",
      "WorkoutActionDock",
      "RecommendationSurface",
      "RestDock",
    ]) {
      expect(componentSource).not.toContain(`export function ${futureControl}`);
    }
  });
});
