import { fireEvent, render, screen } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import React from "react";

import { WorkoutDaySelector } from "../components/WorkoutDaySelector";
import { AppearanceProvider } from "../theme";

const items = ["Mon", "Tue", "Wed", "Thu", "Fri"].map((label) => ({
  id: label.toLowerCase(), label, detail: `${label} preview`,
}));

describe("WorkoutDaySelector", () => {
  it.each([
    ["ArrowRight", "tue"], ["ArrowLeft", "mon"], ["Home", "mon"], ["End", "fri"],
  ])("moves the read-only preview with %s", async (key, expected) => {
    const select = jest.fn();
    await render(<AppearanceProvider><WorkoutDaySelector items={items} selectedId="mon" onSelect={select} /></AppearanceProvider>);
    await fireEvent(screen.getByRole("tab", { name: /Preview Mon/u }), "keyDown", { nativeEvent: { key } });
    expect(select).toHaveBeenCalledWith(expected);
  });

  it("uses selected semantics and 48dp-compatible targets without any mutation props", async () => {
    await render(<AppearanceProvider><WorkoutDaySelector items={items} selectedId="wed" onSelect={jest.fn()} /></AppearanceProvider>);
    expect(screen.getByRole("tab", { name: /Preview Wed/u })).toBeSelected();
    expect(screen.getByTestId("workout-day-preview-wed")).toHaveStyle({ minHeight: 56 });
    expect(screen.getByTestId("workout-day-preview-wed")).toHaveProp("focusable", true);
    expect(screen.getByTestId("workout-day-preview-mon")).toHaveProp("focusable", false);
    expect(Object.keys(WorkoutDaySelector)).not.toContain("onReorder");
  });
});
