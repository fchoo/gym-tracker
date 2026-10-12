import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import {
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import React from "react";

import { AppearanceProvider } from "../../../src/ui/theme";
import RootTabsLayout from "../_layout";

let mockPathname = "/";
const mockPush = jest.fn();
const mockNavigate = jest.fn();
const mockRequestAndroidViewFocus = jest.fn<
  (nativeID: string) => Promise<boolean>
>(async () => true);

jest.mock("../../../src/bootstrap/androidViewFocus", () => ({
  requestAndroidViewFocus: (nativeID: string) =>
    mockRequestAndroidViewFocus(nativeID),
}));

const todayView = {
  state: "scheduled" as const,
  planId: "plan-copy",
  planName: "Full Body Foundation",
  dayId: "day-a",
  dayName: "Full Body A",
  estimateMinutes: 48,
  exercises: [{
    exerciseId: "squat",
    name: "Back Squat",
    metricProfile: "load_reps" as const,
    nextTarget: "60 kg × 8",
    history: null,
    recommendationStatus: "none" as const,
  }],
};

const calendarMonth = {
  month: "2026-08-01",
  selectedDate: "2026-08-24",
  days: [{
    localDate: "2026-08-24",
    states: ["completed", "manual", "today"] as const,
  }],
  sessions: [{
    id: "session-1",
    status: "completed" as const,
    source: "scheduled_day" as const,
    sourceLabel: "Planned day",
    planName: "Full Body Foundation",
    dayName: "Full Body A",
    original: {
      localDate: "2026-08-24",
      timezone: "Asia/Singapore",
      startedAtMs: 1_724_428_800_000,
      completedAtMs: 1_724_429_160_000,
      creationTimezoneOffsetMinutes: 480,
    },
    effective: {
      lifecycle: "active" as const,
      localDate: "2026-08-24",
      timezone: "Asia/Singapore",
      startedAtMs: 1_724_428_800_000,
      completedAtMs: 1_724_429_160_000,
      revision: 1,
    },
    exerciseProgress: { completed: 1, planned: 2, percent: 50 },
    workingSetProgress: { completed: 2, planned: 3, percent: 67 },
  }],
};

const librarySnapshot = {
  sectionPreference: {
    section: "plans" as const,
    revision: 0,
  },
  plans: {
    active: null,
    owned: [],
    starters: [{
      id: "full-body-foundation",
      name: "Full Body Foundation",
      daysPerWeek: 3,
      goal: "General strength",
      experience: "Beginner / returning",
      equipment: ["Barbell", "Bench", "Dumbbell"],
      estimateMinutes: 48,
    }],
  },
};

const progressProjection = {
  state: "current" as const,
  window: { start: "2026-08-10", end: "2026-08-24" },
  summary: {
    scheduledOpportunities: { completed: 2, planned: 3 },
    workingSets: { completed: 5, planned: 6 },
    improvingCount: 1,
    holdingCount: 0,
    baselineCount: 0,
    attentionCount: 0,
    sourceReferences: {
      scheduledOpportunities: { sessionIds: ["session-1"], exerciseIds: [], exercises: [] },
      workingSets: { sessionIds: ["session-1"], exerciseIds: [], exercises: [] },
      exerciseStatuses: { sessionIds: ["session-1"], exerciseIds: [], exercises: [] },
      attention: { sessionIds: [], exerciseIds: [], exercises: [] },
    },
  },
  records: [],
  exercises: [],
  trend: [],
  attention: [],
  recommendations: [],
  stateSourceReferences: {
    sessionIds: ["session-1"],
    exerciseIds: [],
    exercises: [],
  },
};

const mockRuntime = {
  actionFailure: undefined,
  failure: undefined,
  launchState: "trusted" as const,
  view: todayView,
  planDays: [{ id: "day-a", name: "Full Body A", ordinal: 0 }],
  notificationPermission: "granted" as const,
  workoutRefreshGeneration: 0,
  contentUpdateResult: undefined,
  contentUpdateFailed: undefined,
  scheduleToday: undefined,
  retry: jest.fn(),
  activatePlan: jest.fn(),
  resumePartialWorkout: jest.fn(async () => undefined),
  startEmptyWorkout: jest.fn(async () => "session-empty"),
  recordTrainAnyway: jest.fn(async () => null),
  startPlanDay: jest.fn(async () => "session-planned"),
  consumeDateOverride: jest.fn(async () => null),
  chooseTimeZone: jest.fn(async () => undefined),
  refresh: jest.fn(async () => undefined),
  readRestAlertPreferences: jest.fn(async () => ({
    soundEnabled: true,
    vibrationEnabled: true,
  })),
  setRestAlertPreferences: jest.fn(async (preferences: {
    soundEnabled: boolean;
    vibrationEnabled: boolean;
  }) => ({
    status: "persisted" as const,
    preferences,
  })),
  openRestNotificationSettings: jest.fn(),
  loadProgress: jest.fn(async (input: Readonly<{
    period: "4_weeks" | "12_weeks" | "all_time";
    nowLocalDate: string;
  }>) => ({
    period: input.period,
    freshness: "current" as const,
    projection: progressProjection,
  })),
  acceptRecommendation: jest.fn(async () => ({ status: "accepted" as const })),
  keepCurrentTarget: jest.fn(async () => ({ status: "kept" as const })),
  loadCalendarMonth: jest.fn(async (input: Readonly<{
    month: string;
    selectedDate: string;
    today: string;
  }>) => ({
    ...calendarMonth,
    month: input.month,
    selectedDate: input.selectedDate,
  })),
  loadCalendarRange: jest.fn(async () => Object.freeze({
    days: Object.freeze([]),
    events: Object.freeze([]),
  })),
  loadLibrary: jest.fn(async () => librarySnapshot),
  listLibraryRecentExercises: jest.fn(async () => []),
  searchLibraryExercises: jest.fn(async () => ({
    state: "page" as const,
    items: [],
    nextCursor: null,
  })),
  setLibraryExerciseFavorite: jest.fn(async () => ({
    exerciseId: "exercise-1",
    favorite: true,
    preferenceRevision: 1,
  })),
  setLibrarySection: jest.fn(async (section: "plans" | "exercises") => ({
    section,
    revision: 1,
  })),
};

jest.mock("expo-router", () => {
  const NativeReact = require("react") as typeof import("react");
  const { View: MockView } = require("react-native") as typeof import("react-native");

  function Tabs({
    children,
    screenOptions,
    tabBar,
  }: {
    children: React.ReactNode;
    screenOptions: {
      sceneStyle?: unknown;
      tabBarPosition?: "bottom" | "left";
    };
    tabBar: (props: {
      navigation: {
        emit: () => { defaultPrevented: boolean };
        navigate: (name: string) => void;
      };
      state: {
        index: number;
        routes: readonly { key: string; name: string }[];
      };
    }) => React.ReactNode;
  }) {
    const routes = [
      { key: "index", name: "index" },
      { key: "calendar", name: "calendar" },
      { key: "library", name: "library" },
      { key: "progress", name: "progress" },
    ] as const;
    const routeIndex = mockPathname.startsWith("/calendar")
      ? 1
      : mockPathname.startsWith("/library")
        ? 2
        : mockPathname.startsWith("/progress")
          ? 3
          : 0;
    return NativeReact.createElement(
      MockView,
      {
        style: {
          flex: 1,
          flexDirection: screenOptions.tabBarPosition === "left"
            ? "row"
            : "column",
        },
        testID: "root-tabs-integration",
      },
      tabBar({
        navigation: {
          emit: () => ({ defaultPrevented: false }),
          navigate: (name: string) => mockNavigate(name),
        },
        state: {
          index: routeIndex,
          routes,
        },
      }),
      children,
    );
  }

  Tabs.Screen = ({ name }: Readonly<{ name: string }>) => {
    const activeName = mockPathname.startsWith("/calendar")
      ? "calendar"
      : mockPathname.startsWith("/library")
        ? "library"
        : mockPathname.startsWith("/progress")
          ? "progress"
          : "index";
    if (name !== activeName) {
      return null;
    }
    if (name === "index") {
      const Route = require("../index").default as React.ComponentType;
      return <Route />;
    }
    if (name === "calendar") {
      const Route = require("../calendar").default as React.ComponentType;
      return <Route />;
    }
    if (name === "library") {
      const Route = require("../library").default as React.ComponentType;
      return <Route />;
    }
    const Route = require("../progress").default as React.ComponentType;
    return <Route />;
  };

  return {
    __esModule: true,
    Tabs,
    router: {
      push: (...args: [string]) => mockPush(...args),
    },
    useFocusEffect: (effect: () => void | (() => void)) => {
      NativeReact.useEffect(() => effect(), [effect]);
    },
    usePathname: () => mockPathname,
    useRouter: () => ({
      push: (...args: [string]) => mockPush(...args),
    }),
  };
});

jest.mock("../../../src/bootstrap/workoutAppRuntime", () => ({
  useCalendarRangeReadPort: () => Object.freeze({
    loadCalendarRange: mockRuntime.loadCalendarRange,
  }),
  useWorkoutAppRuntime: () => mockRuntime,
}));

describe("RootTabsLayout root settings integration", () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockPathname = "/";
    mockPush.mockReset();
    mockRequestAndroidViewFocus.mockClear();
    mockRuntime.readRestAlertPreferences.mockClear();
  });

  it("keeps Workout as the visible and semantic index root heading", async () => {
    await render(
      <AppearanceProvider>
        <RootTabsLayout />
      </AppearanceProvider>,
    );

    expect(await screen.findByRole("header", { name: "Workout" }))
      .toBeOnTheScreen();
    expect(screen.queryByRole("header", { name: "Today" })).toBeNull();
    expect(screen.queryByLabelText("Root contextual actions")).toBeNull();
  });

  it("opens one shared App Settings sheet from each real root header icon", async () => {
    const rendered = await render(
      <AppearanceProvider>
        <RootTabsLayout />
      </AppearanceProvider>,
    );

    for (const root of [
      { pathname: "/", heading: "Workout", nativeID: "root-settings-trigger-index" },
      { pathname: "/calendar", heading: "Calendar", nativeID: "root-settings-trigger-calendar" },
      { pathname: "/library", heading: "Library", nativeID: "root-settings-trigger-library" },
      { pathname: "/progress", heading: "Progress", nativeID: "root-settings-trigger-progress" },
    ] as const) {
      await act(async () => {
        mockPathname = root.pathname;
        rendered.rerender(
          <AppearanceProvider>
            <RootTabsLayout />
          </AppearanceProvider>,
        );
      });

      await waitFor(() => {
        expect(screen.getByRole("header", { name: root.heading }))
          .toBeOnTheScreen();
      });
      const settingsAction = screen.getByRole("button", { name: "Open App Settings" });
      expect(settingsAction).toHaveProp("nativeID", root.nativeID);

      await fireEvent.press(settingsAction);
      expect(screen.getAllByRole("header", { name: "App Settings" }))
        .toHaveLength(1);
      await fireEvent.press(screen.getByRole("button", { name: "Close App Settings" }));
      await waitFor(() => {
        expect(screen.queryByRole("header", { name: "App Settings" }))
          .toBeNull();
      });
      await waitFor(() => expect(mockRequestAndroidViewFocus)
        .toHaveBeenLastCalledWith(root.nativeID));
    }
  });
});
