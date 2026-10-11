import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import React from "react";

import type { GarminActivitySourcePort } from "../../domains/activities/garminActivitySourcePort";
import type { GarminSyncCoordinator } from "../../platform/garmin/garminSyncContracts";
import type { GarminActivityListItem } from "../garmin/useGarminConnectionController";
import { GarminSyncScreen } from "../screens/GarminSyncScreen";
import { AppearanceProvider } from "../theme";

const activity: GarminActivityListItem = Object.freeze({
  activityId: "local-activity-1",
  title: "Morning run",
  activityType: "Running",
  confirmedLocalDate: "2026-10-10",
  summary: "5.0 km · 28 min",
  matchState: "unmatched",
  revisionState: "accepted",
});

const counts = Object.freeze({
  pages: 1,
  discoveredActivities: 1,
  attemptedActivities: 1,
  newActivities: 1,
  unchangedActivities: 0,
  reviewActivities: 0,
  failedActivities: 0,
});

async function renderScreen(input: Readonly<{
  source: GarminActivitySourcePort;
  coordinator?: GarminSyncCoordinator;
  loadActivities?: () => Promise<readonly GarminActivityListItem[]>;
}>) {
  const onOpenActivity = jest.fn();
  await render(
    <AppearanceProvider>
      <GarminSyncScreen
        coordinator={input.coordinator ?? { syncNow: async () => ({ kind: "success", counts }) }}
        loadActivities={input.loadActivities ?? (async () => [activity])}
        onOpenActivity={onOpenActivity}
        source={input.source}
      />
    </AppearanceProvider>,
  );
  return { onOpenActivity };
}

describe("GarminSyncScreen connection tracer", () => {
  it("moves from disconnected credentials through MFA to a connected source-backed list", async () => {
    const login = jest.fn(async () => ({
      kind: "mfa_required" as const,
      challenge_handle: "opaque-continuation-handle-1234",
      generation: 4,
    }));
    const resumeMfa = jest.fn(async () => ({
      kind: "connected" as const,
      account_namespace: "private-account-namespace",
      generation: 5,
    }));
    const source: GarminActivitySourcePort = {
      connectionState: async () => ({ kind: "disconnected" }),
      login,
      resumeMfa,
      logout: async () => undefined,
      listRunningSummaries: async () => ({ items: [] }),
      readActivity: async () => { throw new Error("not used"); },
    };
    const { onOpenActivity } = await renderScreen({ source });

    expect(await screen.findByText("Garmin not connected")).toBeOnTheScreen();
    expect(screen.getByText("Morning run")).toBeOnTheScreen();
    fireEvent.press(screen.getByRole("button", { name: "Connect Garmin" }));
    fireEvent.changeText(screen.getByLabelText("Email"), "owner@example.test");
    fireEvent.changeText(screen.getByLabelText("Password"), "transient-input");
    fireEvent.press(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByText("One-time code")).toBeOnTheScreen();
    fireEvent.changeText(screen.getByLabelText("One-time code"), "transient-code");
    fireEvent.press(screen.getByRole("button", { name: "Verify" }));

    expect(await screen.findByText("Connected to Garmin")).toBeOnTheScreen();
    expect(login).toHaveBeenCalledTimes(1);
    expect(resumeMfa).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByRole("button", { name: "Open Morning run" }));
    expect(onOpenActivity).toHaveBeenCalledWith("local-activity-1");
  });

  it("disables duplicate credential submission and preserves email after invalid credentials", async () => {
    const login = jest.fn(async () => {
      const error = new Error("private provider detail") as Error & { code: string };
      error.name = "GarminActivityAdapterError";
      error.code = "invalid_credentials";
      throw error;
    });
    const source: GarminActivitySourcePort = {
      connectionState: async () => ({ kind: "disconnected" }),
      login,
      resumeMfa: async () => ({ kind: "disconnected" }),
      logout: async () => undefined,
      listRunningSummaries: async () => ({ items: [] }),
      readActivity: async () => { throw new Error("not used"); },
    };
    await renderScreen({ source });

    fireEvent.press(await screen.findByRole("button", { name: "Connect Garmin" }));
    fireEvent.changeText(screen.getByLabelText("Email"), "owner@example.test");
    fireEvent.changeText(screen.getByLabelText("Password"), "transient-input");
    const continueAction = screen.getByRole("button", { name: "Continue" });
    fireEvent.press(continueAction);
    fireEvent.press(continueAction);

    expect(await screen.findByText("Check your email and password, then try again.")).toBeOnTheScreen();
    expect(screen.getByLabelText("Email")).toHaveProp("value", "owner@example.test");
    expect(login).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByLabelText("Password")).toHaveProp("value", ""));
    expect(screen.queryByText("private provider detail")).not.toBeOnTheScreen();
  });
});
