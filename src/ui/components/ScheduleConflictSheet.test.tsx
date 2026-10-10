import { fireEvent, render, screen } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import React from "react";

import { AppearanceProvider } from "../theme";
import { ScheduleConflictSheet } from "./ScheduleConflictSheet";

const preview = {
  running: {
    occurrenceId: "running-opportunity-1",
    planId: "running-plan",
    planName: "10K base",
    scheduleId: "running-schedule",
    scheduleVersionId: "running-version-1",
    scheduleRevision: 4,
    occurrenceRevision: 1,
    localDate: "2026-11-09",
    movedLocalDate: "2026-11-10",
  },
  strength: {
    occurrenceId: "strength-opportunity-1",
    planId: "strength-plan",
    planName: "Upper body",
    scheduleId: "strength-schedule",
    scheduleVersionId: "strength-version-3",
    scheduleRevision: 7,
    occurrenceRevision: 2,
    localDate: "2026-11-09",
    movedLocalDate: "2026-11-10",
  },
  confirmationToken: "schedule-collision-preview-v1:test",
} as const;

describe("ScheduleConflictSheet", () => {
  it("keeps every factual choice unselected until the owner reviews Move run", () => {
    const onConfirm = jest.fn();
    render(
      <AppearanceProvider>
        <ScheduleConflictSheet
          onCancel={jest.fn()}
          onConfirm={onConfirm}
          preview={preview}
          visible
        />
      </AppearanceProvider>,
    );

    expect(screen.getByRole("radio", { name: "Move run · 2026-11-10" }))
      .toHaveAccessibilityState({ checked: false });
    expect(screen.getByRole("radio", { name: "Move strength · 2026-11-10" }))
      .toHaveAccessibilityState({ checked: false });
    expect(screen.getByRole("radio", { name: "Keep both · 2026-11-09" }))
      .toHaveAccessibilityState({ checked: false });

    fireEvent.press(screen.getByRole("radio", { name: "Move run · 2026-11-10" }));

    expect(screen.getByText("Review schedule change")).toBeOnTheScreen();
    expect(screen.getByText("10K base · 2026-11-09 → 2026-11-10")).toBeOnTheScreen();
    expect(screen.getByText("Upper body · 2026-11-09 → 2026-11-09")).toBeOnTheScreen();
    fireEvent.press(screen.getByRole("button", { name: "Confirm schedule change" }));
    expect(onConfirm).toHaveBeenCalledWith({ choice: "move_running", preview });
  });
});
