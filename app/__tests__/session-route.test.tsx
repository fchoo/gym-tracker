import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import React from "react";
import { StyleSheet, type StyleProp, type TextStyle } from "react-native";

import { WorkoutOutcomeConflictError, type SessionDetail } from "../../src/domains/workout";

const mockBack = jest.fn();
const mockGetSessionDetail = jest.fn<() => Promise<SessionDetail>>();
const mockGetSessionDetailAtRevision = jest.fn<() => Promise<SessionDetail>>();
const mockLoadCalendarSessionDetail = jest.fn<() => Promise<SessionDetail | null>>();
const mockUseWorkoutAppRuntime = jest.fn(() => ({
  getSessionDetail: mockGetSessionDetail,
  getSessionDetailAtRevision: mockGetSessionDetailAtRevision,
  ...mockMutationCommands,
  workoutRefreshGeneration: 0,
}));
const mockMutationCommands = {
  addExercise: jest.fn(), addWarmup: jest.fn(), addWorkingSet: jest.fn(), adjustRest: jest.fn(), completeSet: jest.fn(), completeWarmup: jest.fn(),
  discardWorkout: jest.fn(), finishCompleted: jest.fn(), finishPartial: jest.fn(), removeExercise: jest.fn(), removeHistorySession: jest.fn(), removeWarmup: jest.fn(),
  removeWorkingSet: jest.fn(), reorderExercises: jest.fn(), replaceExercise: jest.fn(), resumePartialWorkout: jest.fn(), resumeRest: jest.fn(),
  reviseCompletedSet: jest.fn(), saveZeroSetWorkout: jest.fn(), setWorkoutPreferences: jest.fn(), skipExercise: jest.fn(), skipRest: jest.fn(),
  startManualRest: jest.fn(), updateActiveSetDraft: jest.fn(), updateSessionExerciseDefaultRest: jest.fn(), updateWarmupDraft: jest.fn(),
};
let mockParams: Readonly<{ sessionId?: string | readonly string[]; origin?: string | readonly string[]; sourceRevision?: string | readonly string[] }> = {
  sessionId: "calendar-session",
  origin: "calendar",
};

jest.mock("expo-router", () => ({
  router: { back: (...args: readonly unknown[]) => mockBack(...args), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => mockParams,
}));
jest.mock("../../src/bootstrap/workoutAppRuntime", () => ({
  useCalendarSessionReadPort: () => ({
    loadCalendarSessionDetail: mockLoadCalendarSessionDetail,
  }),
  useWorkoutAppRuntime: () => mockUseWorkoutAppRuntime(),
}));
jest.mock("../../src/ui/calendar/CalendarReadOnlyWorkout", () => ({
  CalendarReadOnlyWorkout: ({ detail, onGoBack }: { detail: SessionDetail; onGoBack(): void }) => {
    const { Pressable, Text } = require("react-native") as typeof import("react-native");
    return <><Text>{`Calendar facts ${detail.id}`}</Text><Pressable accessibilityRole="button" accessibilityLabel="Toggle disclosure" /><Pressable accessibilityRole="button" accessibilityLabel="Back to Calendar agenda" onPress={onGoBack} /></>;
  },
}));
jest.mock("../../src/ui/screens/SessionDetailScreen", () => ({
  SessionDetailScreen: ({ onCorrectWorkout, onRemoveFromHistory, onResume }: { onCorrectWorkout?(): void; onRemoveFromHistory?(): void; onResume(): void }) => {
    const { Pressable, Text } = require("react-native") as typeof import("react-native");
    return <><Text>Management details</Text>{onCorrectWorkout ? <Pressable accessibilityLabel="Correct workout" onPress={onCorrectWorkout} /> : null}{onRemoveFromHistory ? <Pressable accessibilityLabel="Remove from history" onPress={onRemoveFromHistory} /> : null}<Pressable accessibilityLabel="Resume workout" onPress={onResume} /></>;
  },
}));
jest.mock("../../src/ui/components", () => {
  const { Pressable, Text } = require("react-native") as typeof import("react-native");
  return {
    EmptyState: ({ heading, headingStyle, primaryAction }: { heading: string; headingStyle?: StyleProp<TextStyle>; primaryAction?: React.ReactNode }) => <><Text style={headingStyle}>{heading}</Text>{primaryAction}</>,
    PrimaryAction: ({ label, onPress }: { label: string; onPress(): void }) => <Pressable accessibilityLabel={label} accessibilityRole="button" onPress={onPress} />,
    ScreenHeader: ({ title, titleStyle }: { title: string; titleStyle?: StyleProp<TextStyle> }) => <Text style={titleStyle}>{title}</Text>,
    SkeletonBlock: () => null,
  };
});
jest.mock("../../src/ui/layout/AdaptiveScreen", () => ({ AdaptiveScreen: ({ primary }: { primary: React.ReactNode }) => primary }));

import SessionDetailRoute from "../session/[sessionId]";

const detail = {
  id: "calendar-session", status: "completed", statusLabel: "Complete", sourceLabel: "Manual visit", planName: null, dayName: null,
  localDate: "2026-10-13", timezone: "Asia/Singapore", startedAtMs: 0, endedAtMs: 1, durationMs: 1, revision: 2, modifiedFromPlan: false,
  exerciseProgress: { completed: 1, planned: 1, percent: 100 }, workingSetProgress: { completed: 1, planned: 1, percent: 100 }, exercises: [], nonLoadOutcomes: [], recommendations: [], recommendationStatus: "none", resumable: false, readOnly: true,
} as unknown as SessionDetail;

describe("SessionDetailRoute", () => {
  beforeEach(() => { mockBack.mockReset(); mockGetSessionDetail.mockReset(); mockGetSessionDetailAtRevision.mockReset(); mockLoadCalendarSessionDetail.mockReset(); mockUseWorkoutAppRuntime.mockClear(); Object.values(mockMutationCommands).forEach((command) => command.mockReset()); mockParams = { sessionId: "calendar-session", origin: "calendar" }; });

  it("opens an exact Calendar session through the query-only facts branch", async () => {
    mockLoadCalendarSessionDetail.mockResolvedValue(detail);
    const sourceDigest = JSON.stringify(detail);
    const rendered = await render(<SessionDetailRoute />);
    expect(await screen.findByText("Calendar facts calendar-session")).toBeOnTheScreen();
    expect(mockLoadCalendarSessionDetail).toHaveBeenCalledWith("calendar-session");
    expect(mockUseWorkoutAppRuntime).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Correct workout")).toBeNull();
    expect(screen.queryByLabelText("Remove from history")).toBeNull();
    screen.getByRole("button", { name: "Toggle disclosure" });
    rendered.unmount();
    expect(JSON.stringify(detail)).toBe(sourceDigest);
    Object.values(mockMutationCommands).forEach((command) => expect(command).not.toHaveBeenCalled());
  });

  it("fails closed for missing or array Calendar identities", async () => {
    mockParams = { sessionId: ["calendar-session", "other"], origin: "calendar" };
    await render(<SessionDetailRoute />);
    await waitFor(() => expect(screen.getByText("Workout details unavailable")).toBeOnTheScreen());
    expect(StyleSheet.flatten(screen.getByText("Workout details").props.style)).toMatchObject({ fontSize: 22, fontWeight: "800" });
    expect(StyleSheet.flatten(screen.getByText("Workout details unavailable").props.style)).toMatchObject({ fontSize: 22, fontWeight: "800" });
    expect(mockLoadCalendarSessionDetail).not.toHaveBeenCalled();
  });

  it.each(["unknown", ["calendar"]] as const)(
    "rejects untrusted origin %p without acquiring either runtime",
    async (origin) => {
      mockParams = { sessionId: "calendar-session", origin };
      await render(<SessionDetailRoute />);
      expect(await screen.findByText("Workout details unavailable")).toBeOnTheScreen();
      expect(mockLoadCalendarSessionDetail).not.toHaveBeenCalled();
      expect(mockUseWorkoutAppRuntime).not.toHaveBeenCalled();
    },
  );

  it("keeps retryable Calendar read failures distinct from a missing session", async () => {
    mockLoadCalendarSessionDetail
      .mockRejectedValueOnce(new Error("sqlite unavailable"))
      .mockResolvedValueOnce(detail);
    await render(<SessionDetailRoute />);

    expect(await screen.findByText("Workout details could not be loaded")).toBeOnTheScreen();
    expect(screen.queryByText("Workout details unavailable")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Retry workout details" }));
    expect(await screen.findByText("Calendar facts calendar-session")).toBeOnTheScreen();
    expect(mockLoadCalendarSessionDetail).toHaveBeenNthCalledWith(1, "calendar-session");
    expect(mockLoadCalendarSessionDetail).toHaveBeenNthCalledWith(2, "calendar-session");
  });

  it("maps only the typed not-found result to the unavailable state", async () => {
    mockLoadCalendarSessionDetail.mockRejectedValueOnce(
      new WorkoutOutcomeConflictError("workout_session_not_found"),
    );
    await render(<SessionDetailRoute />);

    expect(await screen.findByText("Workout details unavailable")).toBeOnTheScreen();
    expect(screen.queryByText("Workout details could not be loaded")).toBeNull();
  });

  it.each(["in_progress", "voided", "discarded", "manual_visit", "zero_sets"] as const)(
    "renders %s Calendar deep links as unavailable history",
    async () => {
      mockLoadCalendarSessionDetail.mockResolvedValue(null);
      await render(<SessionDetailRoute />);

      expect(await screen.findByText("Workout details unavailable")).toBeOnTheScreen();
      expect(screen.queryByText("Calendar facts calendar-session")).toBeNull();
      expect(mockLoadCalendarSessionDetail).toHaveBeenCalledWith("calendar-session");
    },
  );

  it("retains management commands outside the explicit Calendar origin", async () => {
    mockParams = { sessionId: "calendar-session" };
    mockGetSessionDetail.mockResolvedValue(detail);
    await render(<SessionDetailRoute />);
    expect(await screen.findByText("Management details")).toBeOnTheScreen();
    expect(screen.getByLabelText("Correct workout")).toBeOnTheScreen();
    expect(screen.getByLabelText("Remove from history")).toBeOnTheScreen();
    expect(mockUseWorkoutAppRuntime).toHaveBeenCalled();
  });

  it("loads the exact Progress source revision at the destination", async () => {
    mockParams = { sessionId: "calendar-session", origin: "progress", sourceRevision: "2" };
    mockGetSessionDetailAtRevision.mockResolvedValue(detail);

    await render(<SessionDetailRoute />);

    expect(await screen.findByText("Management details")).toBeOnTheScreen();
    expect(mockGetSessionDetailAtRevision).toHaveBeenCalledWith("calendar-session", 2);
    expect(mockGetSessionDetail).not.toHaveBeenCalled();
  });

  it.each([
    "workout_source_revision_mismatch",
    "workout_source_removed",
    "workout_session_not_found",
  ])("fails closed when the exact Progress source is %s", async (code) => {
    mockParams = { sessionId: "calendar-session", origin: "progress", sourceRevision: "2" };
    mockGetSessionDetailAtRevision.mockRejectedValue(new WorkoutOutcomeConflictError(code));

    await render(<SessionDetailRoute />);

    expect(await screen.findByText("Workout source unavailable")).toBeOnTheScreen();
    expect(screen.queryByText("Management details")).toBeNull();
  });

  it.each([undefined, "0", "-1", "not-a-revision", ["2"]] as const)(
    "rejects invalid Progress source revision %p before acquiring the runtime",
    async (sourceRevision) => {
      mockParams = {
        sessionId: "calendar-session",
        origin: "progress",
        ...(sourceRevision === undefined ? {} : { sourceRevision }),
      };
      await render(<SessionDetailRoute />);
      expect(await screen.findByText("Workout details unavailable")).toBeOnTheScreen();
      expect(mockGetSessionDetailAtRevision).not.toHaveBeenCalled();
    },
  );

  it("hides stale management facts and commands while reused session params load", async () => {
    mockParams = { sessionId: "calendar-session" };
    mockGetSessionDetail.mockResolvedValueOnce(detail);
    const rendered = await render(<SessionDetailRoute />);
    expect(await screen.findByText("Management details")).toBeOnTheScreen();

    let resolveSecond: ((value: SessionDetail) => void) | undefined;
    mockGetSessionDetail.mockImplementationOnce(() => new Promise((resolve) => {
      resolveSecond = resolve;
    }));
    mockParams = { sessionId: "second-session" };
    await rendered.rerender(<SessionDetailRoute />);

    await waitFor(() => expect(mockGetSessionDetail).toHaveBeenLastCalledWith("second-session"));
    expect(screen.queryByText("Management details")).toBeNull();
    expect(screen.queryByLabelText("Correct workout")).toBeNull();
    expect(screen.queryByLabelText("Remove from history")).toBeNull();

    await act(async () => resolveSecond?.({ ...detail, id: "second-session" }));
    expect(await screen.findByText("Management details")).toBeOnTheScreen();
  });
});
