import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { afterEach, describe, expect, it, jest } from "@jest/globals";
import React from "react";

jest.mock("../components/ConfirmationDialog", () => {
  const React = require("react") as typeof import("react");
  const { Pressable, Text, View } = require("react-native") as typeof import("react-native");
  return {
    ConfirmationDialog: ({
      visible,
      heading,
      body,
      cancelLabel,
      confirmLabel,
      onCancel,
      onConfirm,
    }: Readonly<{
      visible: boolean;
      heading: string;
      body: string;
      cancelLabel: string;
      confirmLabel: string;
      onCancel(): void;
      onConfirm(): void;
    }>) => visible ? <View>
      <Text>{heading}</Text>
      <Text>{body}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={cancelLabel} onPress={onCancel} />
      <Pressable accessibilityRole="button" accessibilityLabel={confirmLabel} onPress={onConfirm} />
    </View> : null,
  };
});

import type { OwnedPlanSnapshot } from "../../platform/sqlite/repositories/ownedPlanRepository";
import { OwnedPlanDetailScreen } from "../screens/OwnedPlanDetailScreen";
import { AppearanceProvider } from "../theme";

const plan = {
  id: "owned-strength-1",
  name: "Strength base",
  revision: 3,
  lifecycle: "ready",
  graphStatus: "valid",
  missingRequirement: null,
  isActive: false,
  hasInProgressWorkout: false,
  days: [
    { id: "day-1", name: "Day A", ordinal: 0, exercises: [] },
    { id: "day-2", name: "Day B", ordinal: 1, exercises: [] },
  ],
  scheduleDefaults: null,
} as unknown as OwnedPlanSnapshot;

async function renderDetail(overrides: Partial<React.ComponentProps<typeof OwnedPlanDetailScreen>> = {}) {
  const props: React.ComponentProps<typeof OwnedPlanDetailScreen> = {
    planId: plan.id,
    loadPlan: jest.fn(async () => plan),
    duplicatePlan: jest.fn(async () => ({
      outcome: "committed" as const,
      operation: "duplicate" as const,
      plan: { ...plan, id: "owned-strength-copy", name: "Strength base Copy" },
      currentWorkoutUnaffected: true,
      invalidations: [],
    })),
    archivePlan: jest.fn(async () => ({
      outcome: "committed" as const,
      operation: "archive" as const,
      plan: { ...plan, lifecycle: "archived" as const },
      currentWorkoutUnaffected: true,
      invalidations: [],
    })),
    restorePlan: jest.fn(async () => ({
      outcome: "committed" as const,
      operation: "restore" as const,
      plan,
      currentWorkoutUnaffected: true,
      invalidations: [],
    })),
    onBack: jest.fn(),
    onEdit: jest.fn(),
    onSchedule: jest.fn(),
    onDuplicated: jest.fn(),
    ...overrides,
  };
  return { ...props, ...(await render(<AppearanceProvider><OwnedPlanDetailScreen {...props} /></AppearanceProvider>)) };
}

describe("OwnedPlanDetailScreen", () => {
  afterEach(cleanup);

  it("projects source-backed Strength facts before presenting any mutation action", async () => {
    await renderDetail();

    expect(await screen.findByText("Strength base")).toBeOnTheScreen();
    expect(screen.getByText("INACTIVE")).toBeOnTheScreen();
    expect(screen.getByText("Training days · 2")).toBeOnTheScreen();
    expect(screen.getByText("Completed history is immutable.")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Edit plan" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Edit schedule" })).toBeOnTheScreen();
  });

  it("confirms duplicate and keeps the fresh copy inactive before navigating", async () => {
    const detail = await renderDetail();
    await screen.findByText("Strength base");

    fireEvent.press(screen.getByRole("button", { name: "Duplicate plan" }));
    expect(await screen.findByText("Review duplicate")).toBeOnTheScreen();
    fireEvent.press(screen.getByRole("button", { name: "Confirm duplicate" }));

    expect(detail.duplicatePlan).toHaveBeenCalledWith({
      sourcePlanId: plan.id,
      expectedRevision: plan.revision,
      name: "Strength base Copy",
    });
    await waitFor(() => {
      expect(detail.onDuplicated).toHaveBeenCalledWith("owned-strength-copy");
    });
  });

  it("cancels archive with no write and applies visible lifecycle only after read-back", async () => {
    const detail = await renderDetail();
    await screen.findByText("Strength base");

    fireEvent.press(screen.getByRole("button", { name: "Archive plan" }));
    expect(await screen.findByText("Review archive")).toBeOnTheScreen();
    fireEvent.press(screen.getByRole("button", { name: "Cancel lifecycle review" }));
    expect(detail.archivePlan).not.toHaveBeenCalled();

    fireEvent.press(screen.getByRole("button", { name: "Archive plan" }));
    fireEvent.press(await screen.findByRole("button", { name: "Confirm archive" }));
    expect(await screen.findByText("ARCHIVED")).toBeOnTheScreen();
    expect(screen.getByText("Completed history is immutable.")).toBeOnTheScreen();
  });

});
