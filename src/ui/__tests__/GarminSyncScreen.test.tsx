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
    await fireEvent.press(screen.getByRole("button", { name: "Connect Garmin" }));
    await fireEvent.changeText(await screen.findByLabelText("Email"), "owner@example.test");
    await fireEvent.changeText(screen.getByLabelText("Password"), "transient-input");
    await fireEvent.press(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByText("One-time code")).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByTestId("garmin-mfa-code-input"), "transient-code");
    await fireEvent.press(screen.getByRole("button", { name: "Verify" }));

    expect(await screen.findByText("Connected to Garmin")).toBeOnTheScreen();
    expect(login).toHaveBeenCalledTimes(1);
    expect(resumeMfa).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole("button", { name: "Open Morning run" }));
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

    await fireEvent.press(await screen.findByRole("button", { name: "Connect Garmin" }));
    await fireEvent.changeText(await screen.findByLabelText("Email"), "owner@example.test");
    await fireEvent.changeText(screen.getByLabelText("Password"), "transient-input");
    const continueAction = screen.getByRole("button", { name: "Continue" });
    await fireEvent.press(continueAction);
    await fireEvent.press(continueAction);

    expect(await screen.findByText("Check your email and password, then try again.")).toBeOnTheScreen();
    expect(screen.getByLabelText("Email")).toHaveProp("value", "owner@example.test");
    expect(login).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByLabelText("Password")).toHaveProp("defaultValue", ""));
    expect(screen.queryByText("private provider detail")).not.toBeOnTheScreen();
  });
});

function connectedSource(): GarminActivitySourcePort {
  return {
    connectionState: async () => ({ kind: "connected", account_namespace: "private-account-namespace", generation: 1 }),
    login: async () => ({ kind: "connected", account_namespace: "private-account-namespace", generation: 1 }),
    resumeMfa: async () => ({ kind: "connected", account_namespace: "private-account-namespace", generation: 1 }),
    logout: async () => undefined,
    listRunningSummaries: async () => ({ items: [] }),
    readActivity: async () => { throw new Error("not used"); },
  };
}

describe("GarminSyncScreen committed sync presentation", () => {
  it.each([
    [1, "1 new activity committed."],
    [2, "2 new activities committed."],
    [0, "Your imported history is up to date."],
  ] as const)("renders committed new count %s with correct grammar", async (newActivities, expected) => {
    await renderScreen({
      source: connectedSource(),
      coordinator: { syncNow: async () => ({ kind: "success", counts: { ...counts, newActivities } }) },
    });
    await fireEvent.press(await screen.findByRole("button", { name: "Sync now" }));
    expect(await screen.findByText(expected)).toBeOnTheScreen();
    expect(screen.getByText("Morning run")).toBeOnTheScreen();
  });

  it("shows revision review and partial committed counts without replacing prior rows", async () => {
    await renderScreen({
      source: connectedSource(),
      coordinator: {
        syncNow: async () => ({
          kind: "partial",
          counts: { ...counts, newActivities: 1, reviewActivities: 1, failedActivities: 1 },
          failure: { code: "offline", retryable: true },
        }),
      },
    });
    await fireEvent.press(await screen.findByRole("button", { name: "Sync now" }));

    expect(await screen.findByText("Sync partly completed")).toBeOnTheScreen();
    expect(screen.getByText("2 activities committed before the connection was interrupted.")).toBeOnTheScreen();
    expect(screen.getByText("1 activity needs review.")).toBeOnTheScreen();
    expect(screen.getByText("Morning run")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Retry Garmin sync" })).toBeOnTheScreen();
  });

  it("keeps accepted rows while a committed source revision waits for review", async () => {
    await renderScreen({
      source: connectedSource(),
      coordinator: {
        syncNow: async () => ({
          kind: "success",
          counts: { ...counts, newActivities: 0, reviewActivities: 1 },
        }),
      },
    });
    await fireEvent.press(await screen.findByRole("button", { name: "Sync now" }));

    expect(await screen.findByText("Needs review")).toBeOnTheScreen();
    expect(screen.getByText("1 activity needs review.")).toBeOnTheScreen();
    expect(screen.getByText("Morning run")).toBeOnTheScreen();
  });

  it.each([
    ["offline", "You are offline", "Retry Garmin sync"],
    ["temporary_failure", "Garmin is temporarily unavailable", "Retry Garmin sync"],
    ["sign_in_required", "Sign in to Garmin again", "Sign in again"],
    ["data_access_denied", "Garmin data access was denied", "Sign in again"],
    ["rate_limited", "Garmin asked us to wait", "Retry Garmin sync"],
    ["timeout", "Garmin took too long to respond", "Retry Garmin sync"],
    ["malformed_response", "Garmin returned data this app could not use", null],
  ] as const)("renders distinct %s recovery while retaining history", async (code, heading, action) => {
    await renderScreen({
      source: connectedSource(),
      coordinator: {
        syncNow: async () => ({
          kind: "failure",
          counts: { ...counts, newActivities: 0, attemptedActivities: 0 },
          failure: { code, retryable: action === "Retry Garmin sync", ...(code === "rate_limited" ? { retryAfterMs: 60_000 } : {}) },
        }),
      },
    });
    await fireEvent.press(await screen.findByRole("button", { name: "Sync now" }));

    expect(await screen.findByText(heading)).toBeOnTheScreen();
    expect(screen.getByText("Morning run")).toBeOnTheScreen();
    if (code === "rate_limited") {
      expect(screen.getByText("Retry after 1 minute. No automatic retry will run.")).toBeOnTheScreen();
    }
    if (action === null) {
      expect(screen.queryByRole("button", { name: "Retry Garmin sync" })).not.toBeOnTheScreen();
    } else {
      expect(screen.getByRole("button", { name: action })).toBeOnTheScreen();
    }
  });
});
