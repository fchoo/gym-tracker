import { render } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import React from "react";

const mockEditorProps = jest.fn();
const mockRuntime = {
  archiveOwnedPlan: jest.fn(),
  createOwnedPlanDraft: jest.fn(),
  createOwnedPlanId: jest.fn((kind: string) => `${kind}:id`),
  duplicateOwnedPlan: jest.fn(),
  listOwnedPlanExercises: jest.fn(),
  loadOwnedPlan: jest.fn(),
  restoreOwnedPlan: jest.fn(),
  saveOwnedPlan: jest.fn(),
};

jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  router: { back: jest.fn(), replace: jest.fn() },
}));
jest.mock("../../../../src/bootstrap/workoutAppRuntime", () => ({
  useWorkoutAppRuntime: () => mockRuntime,
}));
jest.mock("../../../../src/ui/screens/OwnedPlanEditorScreen", () => ({
  OwnedPlanEditorScreen: (props: unknown) => {
    mockEditorProps(props);
    return null;
  },
}));

import CreateStrengthPlanRoute from "../create-strength";
import { router } from "expo-router";

describe("Strength create route", () => {
  it("injects the owned aggregate callbacks and navigates only after save", async () => {
    await render(<CreateStrengthPlanRoute />);

    const props = mockEditorProps.mock.calls[0]![0] as {
      mode: string;
      createDraft: unknown;
      savePlan: unknown;
      onBack(): void;
      onSaved(planId: string): void;
    };

    expect(props.mode).toBe("create");
    expect(props.createDraft).toBe(mockRuntime.createOwnedPlanDraft);
    expect(props.savePlan).toBe(mockRuntime.saveOwnedPlan);
    expect(router.replace).not.toHaveBeenCalled();

    props.onBack();
    expect(router.back).toHaveBeenCalledTimes(1);

    props.onSaved("owned-plan:id");
    expect(router.replace).toHaveBeenCalledWith("/library/plan/owned-plan:id/edit");
  });
});
