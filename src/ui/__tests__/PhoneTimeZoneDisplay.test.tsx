import React from "react";
import { render, waitFor } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import { AppearanceProvider } from "../theme";
import { ImportedActivityDetailScreen } from "../screens/ImportedActivityDetailScreen";
import { CalendarReadOnlyWorkout } from "../calendar/CalendarReadOnlyWorkout";
import { SessionDetailScreen } from "../screens/SessionDetailScreen";
import { GarminSyncScreen } from "../screens/GarminSyncScreen";
import type { SessionDetail } from "../../domains/workout";

let mockZone = "Asia/Singapore";
jest.mock("../time/useDeviceTimeZone", () => ({ useDeviceTimeZone: () => mockZone }));
const instant = Date.parse("2026-10-25T01:30:00Z");
const session = Object.freeze({ id: "session-timezone", status: "completed", statusLabel: "Complete", sourceLabel: "Workout",
  planName: "Foundation", dayName: "Day A", localDate: "2026-10-24", timezone: "America/New_York", startedAtMs: instant,
  endedAtMs: instant + 60000, durationMs: 60000, revision: 1, modifiedFromPlan: false, corrected: false,
  exerciseProgress: { completed: 0, planned: 0, percent: null }, workingSetProgress: { completed: 0, planned: 0, percent: null },
  exercises: [], nonLoadOutcomes: [], recommendations: [], recommendationStatus: "none", resumable: false, readOnly: true,
}) as SessionDetail;

describe("current phone timezone across activity pages", () => {
  it("renders activity detail in the phone zone and changes display without changing source dates", async () => {
    mockZone = "Asia/Singapore";
    const detail = Object.freeze({ activityType: "Outdoor run", confirmedLocalDate: "2026-10-24", startedAtMs: instant,
      distance: "5 km", route: { kind: "none" as const }, laps: [], fidelity: { kind: "source_summary" as const, heading: "Source summary", body: "Accepted facts" } });
    const content = () => <AppearanceProvider><ImportedActivityDetailScreen state={{ kind: "ready", detail }} onBack={() => {}} onRetry={() => {}} /></AppearanceProvider>;
    const view = await render(content());
    expect(view.getByText("2026-10-25 09:30 · Asia/Singapore")).toBeTruthy();
    mockZone = "America/New_York";
    await view.rerender(content());
    expect(view.getByText("2026-10-24 21:30 · America/New_York")).toBeTruthy();
    expect(detail.confirmedLocalDate).toBe("2026-10-24");
    expect(detail.startedAtMs).toBe(instant);
    await view.unmount();
  });
  it("uses the same current-zone timestamp in Calendar workout detail and history detail", async () => {
    mockZone = "Asia/Singapore";
    const calendar = await render(<AppearanceProvider><CalendarReadOnlyWorkout detail={session} onGoBack={() => {}} /></AppearanceProvider>);
    expect(calendar.getByText("2026-10-25 09:30")).toBeTruthy();
    await calendar.unmount();
    const history = await render(<AppearanceProvider><SessionDetailScreen detail={session} onGoBack={() => {}} onOpenExerciseHistory={() => {}} /></AppearanceProvider>);
    expect(history.getByText(/2026-10-25 09:30/u)).toBeTruthy();
    expect(session.timezone).toBe("America/New_York");
    expect(session.localDate).toBe("2026-10-24");
    await history.unmount();
  });
  it("shows the imported list date and last-sync timestamp in the phone timezone", async () => {
    mockZone = "Asia/Singapore";
    const source = { connectionState: async () => ({ kind: "connected" as const, account_namespace: "timezone-test", generation: 1 }),
      restoreSession: async () => ({ kind: "connected" as const, account_namespace: "timezone-test", generation: 1 }),
      login: async () => ({ kind: "disconnected" as const }), resumeMfa: async () => ({ kind: "disconnected" as const }),
      logout: async () => {}, listRunningSummaries: async () => ({ items: [] }), readActivity: async () => { throw new Error("unused"); } };
    const counts = { pages: 1, discoveredActivities: 1, attemptedActivities: 1, newActivities: 1, unchangedActivities: 0, reviewActivities: 0, failedActivities: 0 };
    const view = await render(<AppearanceProvider><GarminSyncScreen source={source} coordinator={{ syncNow: async () => ({ kind: "success", counts }) }}
      loadActivities={async () => [{ activityId: "activity-timezone", title: "Run", activityType: "Running", confirmedLocalDate: "2026-10-24", startedAtMs: instant }]}
      loadLastSuccessfulSync={async () => ({ attemptId: "sync-timezone", completedAtMs: instant, counts })} onOpenActivity={() => {}} /></AppearanceProvider>);
    await waitFor(() => expect(view.getByText("Running · 2026-10-25")).toBeTruthy());
    expect(view.getByText("Last successful sync: 2026-10-25 09:30")).toBeTruthy();
    await view.unmount();
  });
});
