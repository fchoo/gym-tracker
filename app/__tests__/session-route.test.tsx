import { render, screen, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import React from "react";

import type { SessionDetail } from "../../src/domains/workout";

const mockBack = jest.fn();
const mockGetSessionDetail = jest.fn<() => Promise<SessionDetail>>();
const mockRemoveHistorySession = jest.fn();
let mockParams: Readonly<{ sessionId?: string | readonly string[]; origin?: string | readonly string[] }> = {
  sessionId: "calendar-session",
  origin: "calendar",
};

jest.mock("expo-router", () => ({
  router: { back: (...args: readonly unknown[]) => mockBack(...args), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => mockParams,
}));
jest.mock("../../src/bootstrap/workoutAppRuntime", () => ({
  useWorkoutAppRuntime: () => ({
    getSessionDetail: mockGetSessionDetail,
    removeHistorySession: mockRemoveHistorySession,
    resumePartialWorkout: jest.fn(),
    workoutRefreshGeneration: 0,
  }),
}));
jest.mock("../../src/ui/calendar/CalendarReadOnlyWorkout", () => ({
  CalendarReadOnlyWorkout: ({ detail, onGoBack }: { detail: SessionDetail; onGoBack(): void }) => {
    const { Pressable, Text } = require("react-native") as typeof import("react-native");
    return <><Text>{`Calendar facts ${detail.id}`}</Text><Pressable accessibilityRole="button" accessibilityLabel="Back to Calendar agenda" onPress={onGoBack} /></>;
  },
}));
jest.mock("../../src/ui/screens/SessionDetailScreen", () => ({
  SessionDetailScreen: ({ onCorrectWorkout, onRemoveFromHistory, onResume }: { onCorrectWorkout?(): void; onRemoveFromHistory?(): void; onResume(): void }) => {
    const { Pressable, Text } = require("react-native") as typeof import("react-native");
    return <><Text>Management details</Text>{onCorrectWorkout ? <Pressable accessibilityLabel="Correct workout" onPress={onCorrectWorkout} /> : null}{onRemoveFromHistory ? <Pressable accessibilityLabel="Remove from history" onPress={onRemoveFromHistory} /> : null}<Pressable accessibilityLabel="Resume workout" onPress={onResume} /></>;
  },
}));
jest.mock("../../src/ui/components", () => ({ EmptyState: ({ heading }: { heading: string }) => heading, PrimaryAction: () => null, ScreenHeader: () => null, SkeletonBlock: () => null }));
jest.mock("../../src/ui/layout/AdaptiveScreen", () => ({ AdaptiveScreen: ({ primary }: { primary: React.ReactNode }) => primary }));

import SessionDetailRoute from "../session/[sessionId]";

const detail = {
  id: "calendar-session", status: "completed", statusLabel: "Complete", sourceLabel: "Manual visit", planName: null, dayName: null,
  localDate: "2026-10-13", timezone: "Asia/Singapore", startedAtMs: 0, endedAtMs: 1, durationMs: 1, revision: 2, modifiedFromPlan: false,
  exerciseProgress: { completed: 1, planned: 1, percent: 100 }, workingSetProgress: { completed: 1, planned: 1, percent: 100 }, exercises: [], nonLoadOutcomes: [], recommendations: [], recommendationStatus: "none", resumable: false, readOnly: true,
} as unknown as SessionDetail;

describe("SessionDetailRoute", () => {
  beforeEach(() => { mockBack.mockReset(); mockGetSessionDetail.mockReset(); mockRemoveHistorySession.mockReset(); mockParams = { sessionId: "calendar-session", origin: "calendar" }; });

  it("opens an exact Calendar session through the query-only facts branch", async () => {
    mockGetSessionDetail.mockResolvedValue(detail);
    render(<SessionDetailRoute />);
    expect(await screen.findByText("Calendar facts calendar-session")).toBeOnTheScreen();
    expect(mockGetSessionDetail).toHaveBeenCalledWith("calendar-session");
    expect(screen.queryByLabelText("Correct workout")).toBeNull();
    expect(screen.queryByLabelText("Remove from history")).toBeNull();
    expect(mockRemoveHistorySession).not.toHaveBeenCalled();
  });

  it("fails closed for missing or array Calendar identities", async () => {
    mockParams = { sessionId: ["calendar-session", "other"], origin: "calendar" };
    render(<SessionDetailRoute />);
    await waitFor(() => expect(screen.getByText("Workout details unavailable")).toBeOnTheScreen());
    expect(mockGetSessionDetail).not.toHaveBeenCalled();
  });

  it("retains management commands outside the explicit Calendar origin", async () => {
    mockParams = { sessionId: "calendar-session" };
    mockGetSessionDetail.mockResolvedValue(detail);
    render(<SessionDetailRoute />);
    expect(await screen.findByText("Management details")).toBeOnTheScreen();
    expect(screen.getByLabelText("Correct workout")).toBeOnTheScreen();
  });
});
