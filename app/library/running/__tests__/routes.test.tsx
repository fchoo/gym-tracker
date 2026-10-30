import { render } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import React from "react";

const mockCreateInactivePlan = jest.fn(async ({ plan }: { plan: { id: string } }) => ({ id: plan.id }));
const mockEditorProps = jest.fn();
const mockDetailProps = jest.fn();
jest.mock("expo-router", () => ({ Stack: { Screen: () => null }, router: { back: jest.fn(), replace: jest.fn(), push: jest.fn() }, useLocalSearchParams: () => ({ planId: "running-plan:id" }) }));
jest.mock("../../../../src/bootstrap/runningPlanRuntime", () => ({ useRunningPlanRuntime: () => ({ createId: (kind: string) => `${kind}:id`, createInactivePlan: mockCreateInactivePlan, loadPlan: async () => ({ id: "running-plan:id", goal: { trainingDays: ["Monday"] }, sessions: [] }), savePlan: async (draft: { id: string }) => draft }), }));
jest.mock("../../../../src/bootstrap/workoutAppRuntime", () => ({ useWorkoutAppRuntime: () => ({ createPhase17ActionRequestId: async (_label: string, productionRequestId: string) => productionRequestId }) }));
jest.mock("../../../../src/ui/screens/RunningPlanEditorScreen", () => ({ RunningPlanEditorScreen: (props: unknown) => { mockEditorProps(props); return null; } }));
jest.mock("../../../../src/ui/screens/RunningPlanDetailScreen", () => ({ RunningPlanDetailScreen: (props: unknown) => { mockDetailProps(props); return null; } }));
import CreateRunningPlanRoute from "../create";
import RunningPlanDetailRoute from "../[planId]";
import EditRunningPlanRoute from "../[planId]/edit";
import { router } from "expo-router";

describe("Running create route", () => {
  it("injects only runtime callbacks and replaces to the committed Running detail identity", async () => {
    await render(<CreateRunningPlanRoute />);
    const props = mockEditorProps.mock.calls[0]![0] as { initialDraft: { id: string }; savePlan(input: { id: string }): Promise<{ id: string }>; onSaved(id: string): void };
    await expect(props.savePlan(props.initialDraft)).resolves.toEqual({ id: "running-plan:id" });
    props.onSaved("running-plan:id");
    expect(mockCreateInactivePlan).toHaveBeenCalledWith({
      plan: props.initialDraft,
      requestId: "running-plan-create:id",
    });
    expect(router.replace).toHaveBeenCalledWith("/library/running/running-plan:id");
  });
});

describe("Running editor route", () => {
  it("normalizes identity and delegates revision-safe save and child navigation to the runtime", async () => {
    await render(<EditRunningPlanRoute />);
    const props = mockEditorProps.mock.calls.at(-1)![0] as { title: string; onOpenSession(id?: string): void };
    expect(props.title).toBe("Edit Running plan");
    props.onOpenSession(); props.onOpenSession("session-root");
    expect(router.push).toHaveBeenCalledWith("/library/running/running-plan:id/session/new");
    expect(router.push).toHaveBeenCalledWith("/library/running/running-plan:id/session/session-root");
  });
});

describe("Running detail route", () => {
  it("normalizes the plan identity and leaves all facts and commands with the runtime", async () => {
    await render(<RunningPlanDetailRoute />);
    const props = mockDetailProps.mock.calls[0]![0] as { planId: string; onEdit(): void; onNewSession(): void; onEditSession(id: string): void };
    expect(props.planId).toBe("running-plan:id");
    props.onEdit(); props.onNewSession(); props.onEditSession("session-root");
    expect(router.push).toHaveBeenCalledWith("/library/running/running-plan:id/edit");
    expect(router.push).toHaveBeenCalledWith("/library/running/running-plan:id/session/new");
    expect(router.push).toHaveBeenCalledWith("/library/running/running-plan:id/session/session-root");
  });
});
