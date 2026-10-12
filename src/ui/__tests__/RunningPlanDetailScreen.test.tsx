import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import React from "react";

import type { RunningPlanAggregate } from "../../domains/running/contracts";
import type { RunningLifecyclePreview } from "../../domains/running/lifecycle";
import { RunningPlanDetailScreen } from "../screens/RunningPlanDetailScreen";
import { AppearanceProvider } from "../theme";

const plan: RunningPlanAggregate = {
  version: 1, id: "running-1", name: "10K base", revision: 3, active: false, lifecycle: "inactive", createdAtMs: 1,
  goal: { version: 1, id: "goal-1", planId: "running-1", revision: 3, goalDistanceMeters: 10000, targetDurationMs: 3_600_000, trainingDays: ["Monday", "Wednesday"], createdAtMs: 1 },
  sessions: [
    { slot: { id: "slot-2", rootId: "slot-2", weekday: "Monday", revision: 1, ordinal: 1 }, session: { version: 1, id: "session-2", rootId: "session-2", planId: "running-1", sessionKind: "tempo", revision: 1, createdAtMs: 1, phases: [{ ordinal: 0, kind: "work", steps: [{ ordinal: 0, kind: "duration", durationMs: 60_000 }] }], contextual: { format: "continuous", work: { durationMs: 60_000 } } } },
    { slot: { id: "slot-1", rootId: "slot-1", weekday: "Monday", revision: 1, ordinal: 0 }, session: { version: 1, id: "session-1", rootId: "session-1", planId: "running-1", sessionKind: "recovery", revision: 1, createdAtMs: 1, phases: [{ ordinal: 0, kind: "work", steps: [{ ordinal: 0, kind: "duration", durationMs: 60_000 }] }], advisoryTarget: { rpe: 3 }, contextual: {} } },
  ],
};

const lifecyclePreview: RunningLifecyclePreview = {
  action: "activate", planId: "running-1", planName: "10K base", expectedPlanRevision: 3,
  expectedScheduleRevision: 1, lifecycle: "inactive", activeWorkout: false, activeRunning: null,
  confirmationToken: "running-lifecycle-preview-v1:test",
};

const collisionPreview = {
  running: { occurrenceId: "running-opportunity", planId: "running-1", planName: "10K base", scheduleId: "running-schedule", scheduleVersionId: "running-v1", scheduleRevision: 2, occurrenceRevision: 1, localDate: "2026-11-09", movedLocalDate: "2026-11-10" },
  strength: { occurrenceId: "strength-opportunity", planId: "strength-1", planName: "Upper body", scheduleId: "strength-schedule", scheduleVersionId: "strength-v1", scheduleRevision: 3, occurrenceRevision: 2, localDate: "2026-11-09", movedLocalDate: "2026-11-10" },
  confirmationToken: "schedule-collision-preview-v1:test",
} as const;

let consoleError: jest.Spied<typeof console.error>;
beforeEach(() => {
  consoleError = jest.spyOn(console, "error").mockImplementation((message: unknown, ...rest: unknown[]) => {
    if (typeof message === "string" && message.includes("testing environment is not configured to support act")) return;
    // Keep this guard narrow: a new component error still fails the focused suite.
    throw new Error([message, ...rest].map(String).join(" "));
  });
});
afterEach(() => consoleError.mockRestore());

describe("RunningPlanDetailScreen", () => {
  it("loads and renders only the exact Calendar-scheduled session revision", async () => {
    const loadPlan = jest.fn(async () => plan);
    await render(<AppearanceProvider><RunningPlanDetailScreen planId="running-1" sessionId="session-2" loadPlan={loadPlan} mode="calendar" onBack={jest.fn()} /></AppearanceProvider>);

    expect(await screen.findByText("Scheduled session")).toBeOnTheScreen();
    expect(screen.getByText("Monday · Tempo")).toBeOnTheScreen();
    expect(screen.queryByText("Monday · Recovery")).toBeNull();
    expect(loadPlan).toHaveBeenCalledWith("running-1", "session-2");
  });

  it("activates the one Garmin handoff without replacing loaded plan facts", async () => {
    const onGarmin = jest.fn();
    await render(<AppearanceProvider><RunningPlanDetailScreen planId="running-1" loadPlan={jest.fn(async () => plan)} onBack={jest.fn()} onEdit={jest.fn()} onNewSession={jest.fn()} onEditSession={jest.fn()} onGarmin={onGarmin} createLifecycleRequestId={() => "lifecycle-1"} previewLifecycle={jest.fn(async () => lifecyclePreview)} confirmLifecycle={jest.fn(async () => plan)} /></AppearanceProvider>);

    expect(await screen.findByText("10K base")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Sync Garmin / match activity" }));

    expect(onGarmin).toHaveBeenCalledTimes(1);
    expect(screen.getByText("10K base")).toBeOnTheScreen();
    expect(screen.getByText("Monday · Tempo")).toBeOnTheScreen();
  });

  it("shows factual inactive goal, pace, zero-safe facts, and stable same-day slot order", async () => {
    await render(<AppearanceProvider><RunningPlanDetailScreen planId="running-1" loadPlan={jest.fn(async () => plan)} onBack={jest.fn()} onEdit={jest.fn()} onNewSession={jest.fn()} onEditSession={jest.fn()} onGarmin={jest.fn()} createLifecycleRequestId={() => "lifecycle-1"} previewLifecycle={jest.fn(async () => lifecyclePreview)} confirmLifecycle={jest.fn(async () => ({ ...plan, lifecycle: "active" as const, active: true }))} /></AppearanceProvider>);
    await screen.findByText("INACTIVE");
    expect(screen.getByText("Goal distance")).toBeOnTheScreen();
    expect(screen.getByText("10000 m")).toBeOnTheScreen();
    expect(screen.getByText("6:00 / km")).toBeOnTheScreen();
    expect(screen.getByText("Monday · Recovery")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Sync Garmin / match activity" })).toBeOnTheScreen();
  });

  it("shows an explicit empty weekly structure without creating a session", async () => {
    await render(<AppearanceProvider><RunningPlanDetailScreen planId="running-1" loadPlan={jest.fn(async () => ({ ...plan, sessions: [] }))} onBack={jest.fn()} onEdit={jest.fn()} onNewSession={jest.fn()} onEditSession={jest.fn()} onGarmin={jest.fn()} createLifecycleRequestId={() => "lifecycle-1"} previewLifecycle={jest.fn(async () => lifecyclePreview)} confirmLifecycle={jest.fn(async () => ({ ...plan, lifecycle: "active" as const, active: true }))} /></AppearanceProvider>);
    expect(await screen.findByText("No sessions yet")).toBeOnTheScreen();
    expect(screen.getByText("Add a Recovery, Long run, Progression, Tempo, Intervals, Hills, or Fartlek session.")).toBeOnTheScreen();
  });

  it("distinguishes a retryable load failure from a contextual not-found result", async () => {
    const loadPlan = jest.fn(async () => { throw new Error("sqlite unavailable"); });
    await render(<AppearanceProvider><RunningPlanDetailScreen planId="running-1" loadPlan={loadPlan} onBack={jest.fn()} onEdit={jest.fn()} onNewSession={jest.fn()} onEditSession={jest.fn()} onGarmin={jest.fn()} createLifecycleRequestId={() => "lifecycle-1"} previewLifecycle={jest.fn(async () => lifecyclePreview)} confirmLifecycle={jest.fn(async () => plan)} /></AppearanceProvider>);
    expect(await screen.findByText("Running plan could not be loaded")).toBeOnTheScreen();
    fireEvent.press(screen.getByRole("button", { name: "Retry loading Running plan" }));
    await waitFor(() => expect(loadPlan).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("Running plan not found")).not.toBeOnTheScreen();
  });

  it("requires a reviewed sport-scoped lifecycle confirmation, retains review after failure, and updates only from readback", async () => {
    const previewLifecycle = jest.fn(async (): Promise<RunningLifecyclePreview> => ({
      ...lifecyclePreview,
      activeRunning: { planId: "other-running", planName: "Other Running", planRevision: 8, scheduleId: "other-schedule", scheduleRevision: 4 },
    }));
    let confirmationAttempts = 0;
    const confirmLifecycle = jest.fn(async (): Promise<RunningPlanAggregate> => {
      confirmationAttempts += 1;
      if (confirmationAttempts === 1) throw new Error("stale");
      return { ...plan, active: true, lifecycle: "active", revision: 4 };
    });
    await render(<AppearanceProvider><RunningPlanDetailScreen planId="running-1" loadPlan={jest.fn(async () => plan)} onBack={jest.fn()} onEdit={jest.fn()} onNewSession={jest.fn()} onEditSession={jest.fn()} onGarmin={jest.fn()} createLifecycleRequestId={() => "lifecycle-1"} previewLifecycle={previewLifecycle} confirmLifecycle={confirmLifecycle} /></AppearanceProvider>);
    await screen.findByText("INACTIVE");
    fireEvent.press(screen.getByRole("button", { name: "Preview activation" }));
    expect(await screen.findByText("Activate 10K base?")).toBeOnTheScreen();
    expect(screen.getByText(/active Running schedule for Other Running/)).toBeOnTheScreen();
    fireEvent.press(screen.getByRole("button", { name: "Activate plan" }));
    expect(await screen.findByText("Running lifecycle needs attention")).toBeOnTheScreen();
    expect(screen.getByText("Activate 10K base?")).toBeOnTheScreen();
    fireEvent.press(screen.getByRole("button", { name: "Activate plan" }));
    expect(await screen.findByText("ACTIVE")).toBeOnTheScreen();
    expect(confirmLifecycle).toHaveBeenCalledWith(expect.objectContaining({ requestId: "lifecycle-1", preview: expect.objectContaining({ planId: "running-1" }) }));
  });

  it("retains a stale schedule collision review and requires an explicit reload", async () => {
    const previewScheduleCollisionForPlan = jest.fn(async () => collisionPreview);
    const commitScheduleCollisionChoice = jest.fn(async () => { throw new Error("schedule_collision_revision_conflict"); });
    await render(<AppearanceProvider><RunningPlanDetailScreen planId="running-1" loadPlan={jest.fn(async () => plan)} onBack={jest.fn()} onEdit={jest.fn()} onNewSession={jest.fn()} onEditSession={jest.fn()} onGarmin={jest.fn()} createLifecycleRequestId={() => "lifecycle-1"} previewLifecycle={jest.fn(async () => lifecyclePreview)} confirmLifecycle={jest.fn(async () => plan)} createCollisionRequestId={() => "collision-request"} previewScheduleCollisionForPlan={previewScheduleCollisionForPlan} commitScheduleCollisionChoice={commitScheduleCollisionChoice} /></AppearanceProvider>);
    await screen.findByText("INACTIVE");
    fireEvent.press(screen.getByRole("button", { name: "Review schedule collision" }));
    expect(await screen.findByText("Monday conflict")).toBeOnTheScreen();
    fireEvent.press(screen.getByRole("radio", { name: "Move run · 2026-11-10" }));
    fireEvent.press(await screen.findByRole("button", { name: "Confirm schedule change" }));
    expect(await screen.findByText("Schedule collision needs attention")).toBeOnTheScreen();
    expect(screen.getByText("Schedule changed while you were reviewing. Check the latest dates and choose again.")).toBeOnTheScreen();
    expect(commitScheduleCollisionChoice).toHaveBeenCalledWith(expect.objectContaining({ requestId: "collision-request", preview: collisionPreview }));
  });
});
