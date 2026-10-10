import { render } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import React from "react";

const mockCreateInactivePlan = jest.fn(async ({ plan }: { plan: { id: string } }) => ({ id: plan.id }));
const mockEditorProps = jest.fn();
jest.mock("expo-router", () => ({ Stack: { Screen: () => null }, router: { back: jest.fn(), replace: jest.fn() }, }));
jest.mock("../../../../src/bootstrap/runningPlanRuntime", () => ({ useRunningPlanRuntime: () => ({ createId: (kind: string) => `${kind}:id`, createInactivePlan: mockCreateInactivePlan }), }));
jest.mock("../../../../src/ui/screens/RunningPlanEditorScreen", () => ({ RunningPlanEditorScreen: (props: unknown) => { mockEditorProps(props); return null; } }));
import CreateRunningPlanRoute from "../create";
import { router } from "expo-router";

describe("Running create route", () => {
  it("injects only runtime callbacks and replaces to the committed Running detail identity", async () => {
    await render(<CreateRunningPlanRoute />);
    const props = mockEditorProps.mock.calls[0]![0] as { initialDraft: { id: string }; savePlan(input: { id: string }): Promise<{ id: string }>; onSaved(id: string): void };
    await expect(props.savePlan(props.initialDraft)).resolves.toEqual({ id: "running-plan:id" });
    props.onSaved("running-plan:id");
    expect(mockCreateInactivePlan).toHaveBeenCalledWith({ plan: props.initialDraft });
    expect(router.replace).toHaveBeenCalledWith("/library/running/running-plan:id");
  });
});
