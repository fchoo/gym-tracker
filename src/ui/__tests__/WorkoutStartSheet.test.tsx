import { render, screen } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import React from "react";

import type { ActivatedPlanDay } from "../../domains/plans";
import { WorkoutStartSheet } from "../components/WorkoutStartSheet";
import { AppearanceProvider } from "../theme";

const planDays = [
  { id: "alternate-a", name: "Full Body A" },
  { id: "scheduled-b", name: "Full Body B" },
  { id: "alternate-c", name: "Full Body C" },
] as unknown as readonly ActivatedPlanDay[];

describe("WorkoutStartSheet", () => {
  it("orders the scheduled day before real alternatives, empty start, and return", async () => {
    const rendered = await render(
      <AppearanceProvider>
        <WorkoutStartSheet
          onClose={jest.fn()}
          onStartDay={jest.fn()}
          onStartEmpty={jest.fn()}
          planDays={planDays}
          scheduledDayId="scheduled-b"
          visible
        />
      </AppearanceProvider>,
    );
    const tree = JSON.stringify(rendered.toJSON());
    expect(tree.indexOf("Start Full Body B")).toBeLessThan(tree.indexOf("Start Full Body A"));
    expect(tree.indexOf("Start Full Body A")).toBeLessThan(tree.indexOf("Start Full Body C"));
    expect(tree.indexOf("Start Full Body C")).toBeLessThan(tree.indexOf("Start empty workout"));
    expect(tree.indexOf("Start empty workout")).toBeLessThan(tree.indexOf("Return to Workout"));
    expect(screen.getByTestId("scheduled-start-option")).toBeOnTheScreen();
  });
});
