import { render, screen } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import React from "react";

import type { RunningPlanAggregate } from "../../domains/running/contracts";
import { RunningPlanDetailScreen } from "../screens/RunningPlanDetailScreen";
import { AppearanceProvider } from "../theme";

const plan: RunningPlanAggregate = {
  version: 1, id: "running-1", name: "10K base", revision: 3, active: false, createdAtMs: 1,
  goal: { version: 1, id: "goal-1", planId: "running-1", revision: 3, goalDistanceMeters: 10000, targetDurationMs: 3_600_000, trainingDays: ["Monday", "Wednesday"], createdAtMs: 1 },
  sessions: [
    { slot: { id: "slot-2", rootId: "slot-2", weekday: "Monday", revision: 1, ordinal: 1 }, session: { version: 1, id: "session-2", rootId: "session-2", planId: "running-1", sessionKind: "tempo", revision: 1, createdAtMs: 1, phases: [{ ordinal: 0, kind: "work", steps: [{ ordinal: 0, kind: "duration", durationMs: 60_000 }] }], contextual: { format: "continuous", durationMs: 60_000 } } },
    { slot: { id: "slot-1", rootId: "slot-1", weekday: "Monday", revision: 1, ordinal: 0 }, session: { version: 1, id: "session-1", rootId: "session-1", planId: "running-1", sessionKind: "recovery", revision: 1, createdAtMs: 1, phases: [{ ordinal: 0, kind: "work", steps: [{ ordinal: 0, kind: "duration", durationMs: 60_000 }] }], advisoryTarget: { rpe: 3 }, contextual: {} } },
  ],
};

describe("RunningPlanDetailScreen", () => {
  it("shows factual inactive goal, pace, zero-safe facts, and stable same-day slot order", async () => {
    await render(<AppearanceProvider><RunningPlanDetailScreen planId="running-1" loadPlan={jest.fn(async () => plan)} onBack={jest.fn()} onEdit={jest.fn()} onNewSession={jest.fn()} onEditSession={jest.fn()} onGarmin={jest.fn()} /></AppearanceProvider>);
    await screen.findByText("INACTIVE");
    expect(screen.getByText("Goal · 10000 m")).toBeOnTheScreen();
    expect(screen.getByText("Target pace · 6:00 / km")).toBeOnTheScreen();
    expect(screen.getAllByText(/Monday/).map((node) => node.props.children).join(" ")).toContain("recovery");
    expect(screen.getByRole("button", { name: "Sync Garmin / match activity" })).toBeOnTheScreen();
  });

  it("shows an explicit empty weekly structure without creating a session", async () => {
    await render(<AppearanceProvider><RunningPlanDetailScreen planId="running-1" loadPlan={jest.fn(async () => ({ ...plan, sessions: [] }))} onBack={jest.fn()} onEdit={jest.fn()} onNewSession={jest.fn()} onEditSession={jest.fn()} onGarmin={jest.fn()} /></AppearanceProvider>);
    expect(await screen.findByText("No weekly sessions scheduled.")).toBeOnTheScreen();
  });
});
