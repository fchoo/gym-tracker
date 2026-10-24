import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import React from "react";
import {
  BackHandler,
  Dimensions,
  StyleSheet,
} from "react-native";

import type {
  GarminActivitySourcePort,
  GarminDurableSyncSummary,
} from "../../domains/activities/garminActivitySourcePort";
import type {
  GarminActivityListItem,
  GarminSyncControllerPort,
} from "../garmin/useGarminConnectionController";
import { GarminSyncScreen } from "../screens/GarminSyncScreen";
import {
  AppearanceProvider,
  createMemoryAppearanceStore,
  type AppearanceStore,
} from "../theme";

const activity: GarminActivityListItem = Object.freeze({
  activityId: "local-activity-1",
  title: "Morning run",
  activityType: "Running",
  confirmedLocalDate: "2026-10-10",
  identityCopy: "Accepted source title: Morning run",
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

const morningRunRowName = /Open Morning run\./u;

async function renderScreen(input: Readonly<{
  source: GarminActivitySourcePort;
  coordinator?: GarminSyncControllerPort;
  loadActivities?: () => Promise<readonly GarminActivityListItem[]>;
  loadLastSuccessfulSync?: () => Promise<GarminDurableSyncSummary | null>;
  getPendingDateReview?: React.ComponentProps<typeof GarminSyncScreen>["getPendingDateReview"];
  confirmPendingDateReview?: React.ComponentProps<typeof GarminSyncScreen>["confirmPendingDateReview"];
  appearanceStore?: AppearanceStore;
  reduceMotion?: boolean;
  width?: number;
  onBack?: () => void;
  returnFocusActivityId?: string;
}>) {
  const onOpenActivity = jest.fn();
  const onBack = input.onBack ?? jest.fn();
  const screenProps = {
    coordinator: input.coordinator ?? { syncNow: async () => ({ kind: "success" as const, counts }) },
    loadActivities: input.loadActivities ?? (async () => [activity]),
    ...(input.loadLastSuccessfulSync === undefined
      ? {}
      : { loadLastSuccessfulSync: input.loadLastSuccessfulSync }),
    ...(input.getPendingDateReview === undefined
      ? {}
      : { getPendingDateReview: input.getPendingDateReview }),
    ...(input.confirmPendingDateReview === undefined
      ? {}
      : { confirmPendingDateReview: input.confirmPendingDateReview }),
    onBack,
    onOpenActivity,
    returnFocusActivityId: input.returnFocusActivityId,
    source: input.source,
    width: input.width,
  } as React.ComponentProps<typeof GarminSyncScreen> & Readonly<{
    onBack(): void;
    width?: number;
  }>;
  await render(
    <AppearanceProvider
      {...(input.reduceMotion === undefined ? {} : { reduceMotion: input.reduceMotion })}
      {...(input.appearanceStore === undefined ? {} : { store: input.appearanceStore })}
    >
      <GarminSyncScreen {...screenProps} />
    </AppearanceProvider>,
  );
  return { onBack, onOpenActivity };
}

describe("GarminSyncScreen connection tracer", () => {
  it("publishes a synced row only after the shared commit resolves, then opens its opaque local ID", async () => {
    let committedActivities: readonly GarminActivityListItem[] = [];
    let acknowledgeCommit: (() => void) | undefined;
    const loadActivities = jest.fn(async () => committedActivities);
    const coordinator: GarminSyncControllerPort = {
      syncNow: async () => {
        await new Promise<void>((resolve) => {
          acknowledgeCommit = resolve;
        });
        committedActivities = [activity];
        return { kind: "success", counts };
      },
    };
    const { onOpenActivity } = await renderScreen({
      coordinator,
      loadActivities,
      returnFocusActivityId: "local-activity-1",
      source: connectedSource(),
    });

    expect(await screen.findByText("No imported activities yet.")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Sync now" }));
    expect(screen.getByText("Syncing Garmin activities")).toBeOnTheScreen();
    expect(screen.queryByText("Morning run")).not.toBeOnTheScreen();

    await act(async () => acknowledgeCommit?.());

    expect(await screen.findByText("Morning run")).toBeOnTheScreen();
    const committedRow = screen.getByRole("button", { name: morningRunRowName });
    expect(committedRow).toHaveProp(
      "accessibilityState",
      expect.objectContaining({ selected: true }),
    );
    await fireEvent.press(committedRow);
    expect(onOpenActivity).toHaveBeenCalledWith("local-activity-1");
  });

  it("uses truthful identity copy for visible and accessible imported activity rows", async () => {
    await renderScreen({
      loadActivities: async () => [Object.freeze({
        ...activity,
        title: "Outdoor run",
        identityCopy: "Accepted source title unavailable. Outdoor run on 2026-10-10.",
      })],
      source: connectedSource(),
    });

    expect(await screen.findByText("Accepted source title unavailable. Outdoor run on 2026-10-10.")).toBeOnTheScreen();
    expect(screen.queryByText("Type-only title")).toBeNull();
    expect(screen.getByRole("button", {
      name: /Accepted source title unavailable\. Outdoor run on 2026-10-10\./u,
    })).toBeOnTheScreen();
  });

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
      restoreSession: async () => ({ kind: "disconnected" }),
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
    await fireEvent.press(screen.getByRole("button", { name: morningRunRowName }));
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
      restoreSession: async () => ({ kind: "disconnected" }),
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
    restoreSession: async () => ({ kind: "connected", account_namespace: "private-account-namespace", generation: 1 }),
    login: async () => ({ kind: "connected", account_namespace: "private-account-namespace", generation: 1 }),
    resumeMfa: async () => ({ kind: "connected", account_namespace: "private-account-namespace", generation: 1 }),
    logout: async () => undefined,
    listRunningSummaries: async () => ({ items: [] }),
    readActivity: async () => { throw new Error("not used"); },
  };
}

describe("GarminSyncScreen committed sync presentation", () => {
  const committedCountCases: ReadonlyArray<readonly [number, string]> = [
    [1, "1 new activity committed."],
    [2, "2 new activities committed."],
    [0, "Your imported history is up to date."],
  ];

  it("renders the durable last successful sync before a new attempt starts", async () => {
    await renderScreen({
      source: connectedSource(),
      loadLastSuccessfulSync: async () => ({
        attemptId: "garmin-sync:123000:2:4",
        completedAtMs: 123_000,
        counts: {
          ...counts,
          pages: 2,
          discoveredActivities: 4,
          attemptedActivities: 4,
          newActivities: 1,
          unchangedActivities: 2,
          reviewActivities: 1,
        },
      }),
    });

    expect(await screen.findByText("1 new · 2 unchanged · 1 need review")).toBeOnTheScreen();
    expect(screen.getByText("Last successful sync: 1970-01-01T00:02:03.000Z")).toBeOnTheScreen();
    expect(screen.queryByText("New activities")).not.toBeOnTheScreen();
  });

  it.each(committedCountCases)("renders committed new count %s with correct grammar", async (newActivities, expected) => {
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

  const recoveryCases: ReadonlyArray<readonly [
    "offline" | "temporary_failure" | "sign_in_required" | "data_access_denied" | "rate_limited" | "timeout" | "malformed_response" | "date_confirmation_required",
    string,
    "Retry Garmin sync" | "Sign in again" | null,
  ]> = [
    ["offline", "You are offline", "Retry Garmin sync"],
    ["temporary_failure", "Garmin is temporarily unavailable", "Retry Garmin sync"],
    ["sign_in_required", "Sign in to Garmin again", "Sign in again"],
    ["data_access_denied", "Garmin data access was denied", "Sign in again"],
    ["rate_limited", "Garmin asked us to wait", "Retry Garmin sync"],
    ["timeout", "Garmin took too long to respond", "Retry Garmin sync"],
    ["malformed_response", "Garmin returned data this app could not use", null],
    ["date_confirmation_required", "Confirm the activity date", null],
  ];

  it.each(recoveryCases)("renders distinct %s recovery while retaining history", async (code, heading, action) => {
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

  it("does not present a failed history read as an empty imported history", async () => {
    await renderScreen({
      loadActivities: async () => {
        throw new Error("history-read-failed");
      },
      source: connectedSource(),
    });

    expect(await screen.findByText("Imported history could not be loaded")).toBeOnTheScreen();
    expect(screen.queryByText("No imported activities yet.")).not.toBeOnTheScreen();
  });
});

describe("GarminSyncScreen shared shell and disconnect contracts", () => {
  it("keeps a stable one-line three-column header with an inert back placeholder", async () => {
    await renderScreen({ source: connectedSource() });
    await screen.findByText("Connected to Garmin");

    const header = screen.getByTestId("garmin-three-column-header");
    const placeholder = screen.getByTestId(
      "garmin-inert-back-placeholder",
      { includeHiddenElements: true },
    );
    expect(StyleSheet.flatten(header.props.style)).toMatchObject({
      alignItems: "center",
      flexDirection: "row",
    });
    expect(placeholder).toHaveProp("accessibilityElementsHidden", true);
    expect(placeholder).toHaveProp("importantForAccessibility", "no-hide-descendants");
    expect(screen.getByText("Garmin Sync")).toHaveProp("numberOfLines", 1);
    expect(screen.queryByRole("button", { name: /back/iu })).not.toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Appearance" })).toBeOnTheScreen();
  });

  it("cancels disconnect without writes, then confirms once and retains imported history", async () => {
    const logout = jest.fn(async () => undefined);
    await renderScreen({ source: { ...connectedSource(), logout } });

    await fireEvent.press(await screen.findByRole("button", { name: "Disconnect Garmin" }));
    expect(screen.getByText("Disconnect Garmin?")).toBeOnTheScreen();
    expect(screen.getByText(/Imported activity history remains on this device\./u)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Keep connected" }));
    expect(logout).not.toHaveBeenCalled();
    expect(screen.getByText("Connected to Garmin")).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole("button", { name: "Disconnect Garmin" }));
    const confirmDisconnect = screen.getAllByRole("button", { name: "Disconnect Garmin" }).at(-1);
    expect(confirmDisconnect).toBeDefined();
    await fireEvent.press(confirmDisconnect!);
    expect(await screen.findByText("Garmin not connected")).toBeOnTheScreen();
    expect(logout).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Morning run")).toBeOnTheScreen();
  });

  it("allows confirmed disconnect to invalidate a foreground sync", async () => {
    let releaseSync: ((value: Awaited<ReturnType<GarminSyncControllerPort["syncNow"]>>) => void) | undefined;
    const logout = jest.fn(async () => undefined);
    await renderScreen({
      coordinator: {
        syncNow: async () => new Promise<Awaited<ReturnType<GarminSyncControllerPort["syncNow"]>>>((resolve) => { releaseSync = resolve; }),
      },
      source: { ...connectedSource(), logout },
    });

    await fireEvent.press(await screen.findByRole("button", { name: "Sync now" }));
    expect(await screen.findByText("Syncing Garmin activities")).toBeOnTheScreen();
    const disconnect = screen.getByRole("button", { name: "Disconnect Garmin" });
    expect(disconnect).not.toBeDisabled();
    await fireEvent.press(disconnect);
    const confirmDisconnect = screen.getAllByRole("button", { name: "Disconnect Garmin" }).at(-1);
    expect(confirmDisconnect).toBeDefined();
    await fireEvent.press(confirmDisconnect!);

    expect(await screen.findByText("Garmin not connected")).toBeOnTheScreen();
    expect(logout).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Morning run")).toBeOnTheScreen();
    await act(async () => {
      releaseSync?.({ kind: "success", counts: { ...counts, newActivities: 3 } });
    });
    expect(screen.getByText("Garmin not connected")).toBeOnTheScreen();
  });

  it("uses shared persisted appearance without resetting connected controller state", async () => {
    const appearanceStore = createMemoryAppearanceStore();
    const source = connectedSource();
    const restoreSession = jest.spyOn(source, "restoreSession");
    await renderScreen({ appearanceStore, source });
    expect(await screen.findByText("Connected to Garmin")).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole("button", { name: "Appearance" }));
    await fireEvent.press(screen.getByRole("radio", { name: "Dark" }));
    expect(appearanceStore.read()).toBe("Dark");
    const closeAppearance = screen.getAllByRole("button", { name: "Close appearance" }).at(-1);
    expect(closeAppearance).toBeDefined();
    await fireEvent.press(closeAppearance!);

    expect(screen.getByText("Connected to Garmin")).toBeOnTheScreen();
    expect(screen.getByText("Morning run")).toBeOnTheScreen();
    expect(restoreSession).toHaveBeenCalledTimes(1);
  });

  it("gives Back priority to Appearance and disconnect before the contextual route", async () => {
    const remove = jest.fn();
    const addEventListener = jest.spyOn(BackHandler, "addEventListener").mockReturnValue({ remove });
    const onBack = jest.fn();
    const logout = jest.fn(async () => undefined);
    await renderScreen({ onBack, source: { ...connectedSource(), logout } });
    await screen.findByText("Connected to Garmin");

    await fireEvent.press(screen.getByRole("button", { name: "Appearance" }));
    let listener = addEventListener.mock.calls.at(-1)?.[1];
    await act(async () => {
      expect(listener?.(undefined as never)).toBe(true);
    });
    expect(onBack).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("radio", { name: "System" })).not.toBeOnTheScreen());

    await fireEvent.press(screen.getByRole("button", { name: "Disconnect Garmin" }));
    listener = addEventListener.mock.calls.at(-1)?.[1];
    await act(async () => {
      expect(listener?.(undefined as never)).toBe(true);
    });
    expect(logout).not.toHaveBeenCalled();
    expect(onBack).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByText("Disconnect Garmin?")).not.toBeOnTheScreen());

    listener = addEventListener.mock.calls.at(-1)?.[1];
    await act(async () => {
      expect(listener?.(undefined as never)).toBe(true);
    });
    expect(onBack).toHaveBeenCalledTimes(1);
    addEventListener.mockRestore();
  });

  it("asks for a named timezone instead of pre-filling an offset display label", async () => {
    const confirmPendingDateReview = jest.fn(async () => {
      throw new Error("garmin_envelope_invalid");
    });
    const pendingReview = Object.freeze({
      activityId: "local-activity-1",
      absoluteStartedAtMs: Date.UTC(2026, 9, 10, 1, 0, 0, 120),
      sourceLocalDateTime: "2026-10-10T09:00:00.120",
      sourceUtcOffsetMinutes: 480,
      suggestedLocalDate: "2026-10-10",
      suggestedLocalTime: "09:00:00.120",
      suggestedTimeZone: "UTC+08:00",
      suggestedUtcOffsetMinutes: 480,
    });
    await renderScreen({
      coordinator: {
        syncNow: async () => ({
          kind: "failure",
          counts: { ...counts, newActivities: 0, attemptedActivities: 0 },
          failure: { code: "date_confirmation_required", retryable: false },
        }),
      },
      confirmPendingDateReview,
      getPendingDateReview: () => pendingReview,
      source: connectedSource(),
    });

    await fireEvent.press(await screen.findByRole("button", { name: "Sync now" }));
    await fireEvent.press(await screen.findByRole("button", { name: "Review activity date" }));
    expect(screen.getByLabelText("Time zone")).toHaveProp("value", "");
    expect(screen.getByLabelText("Local date")).toHaveProp("value", "2026-10-10");
    expect(screen.getByLabelText("Local time")).toHaveProp("value", "09:00:00.120");
    expect(screen.getByLabelText("UTC offset minutes")).toHaveProp("value", "480");
    await fireEvent.press(screen.getByRole("button", { name: "Use activity date" }));
    expect(await screen.findByText("Enter the activity's time zone, such as Asia/Singapore.")).toBeOnTheScreen();
    expect(confirmPendingDateReview).not.toHaveBeenCalled();
  });

  it.each(["UTC+08:00", "+08", "+0800", "-08", "Asia/NotAZone", " Asia/Singapore", "Asia/Singapore ", "", "x".repeat(121)])(
    "keeps an invalid timezone %j outside date confirmation",
    async (timeZone) => {
      const confirmPendingDateReview = jest.fn(async () => ({
        kind: "imported" as const,
        activityId: "local-activity-1",
        aggregateRevision: 1,
      }));
      const pendingReview = Object.freeze({
        activityId: "local-activity-1",
        absoluteStartedAtMs: Date.UTC(2026, 9, 10, 1, 0, 0),
        suggestedLocalDate: "2026-10-10",
        suggestedLocalTime: "09:00:00",
        suggestedTimeZone: "Asia/Singapore",
        suggestedUtcOffsetMinutes: 480,
      });
      await renderScreen({
        coordinator: {
          syncNow: async () => ({
            kind: "failure",
            counts: { ...counts, newActivities: 0, attemptedActivities: 0 },
            failure: { code: "date_confirmation_required", retryable: false },
          }),
        },
        confirmPendingDateReview,
        getPendingDateReview: () => pendingReview,
        source: connectedSource(),
      });
      await fireEvent.press(await screen.findByRole("button", { name: "Sync now" }));
      await fireEvent.press(await screen.findByRole("button", { name: "Review activity date" }));
      await fireEvent.changeText(screen.getByLabelText("Time zone"), timeZone);
      await fireEvent.press(screen.getByRole("button", { name: "Use activity date" }));
      expect(await screen.findByText("Enter the activity's time zone, such as Asia/Singapore.")).toBeOnTheScreen();
      expect(confirmPendingDateReview).not.toHaveBeenCalled();
    },
  );

  it("confirms the selected timezone while preserving the reviewed date, time and offset", async () => {
    const review = Object.freeze({
      activityId: "local-activity-1",
      absoluteStartedAtMs: Date.UTC(2026, 9, 10, 1, 0, 0, 120),
      sourceLocalDateTime: "2026-10-10T09:00:00.120",
      sourceUtcOffsetMinutes: 480,
      suggestedLocalDate: "2026-10-10",
      suggestedLocalTime: "09:00:00.120",
      suggestedTimeZone: "UTC+08:00",
      suggestedUtcOffsetMinutes: 480,
    });
    let pendingReview: typeof review | null = review;
    const confirmPendingDateReview = jest.fn(async () => {
      pendingReview = null;
      return { kind: "imported" as const, activityId: "local-activity-1", aggregateRevision: 1 };
    });
    await renderScreen({
      coordinator: {
        syncNow: async () => ({
          kind: "failure",
          counts: { ...counts, newActivities: 0, attemptedActivities: 0 },
          failure: { code: "date_confirmation_required", retryable: false },
        }),
      },
      confirmPendingDateReview,
      getPendingDateReview: () => pendingReview,
      source: connectedSource(),
    });
    await fireEvent.press(await screen.findByRole("button", { name: "Sync now" }));
    await fireEvent.press(await screen.findByRole("button", { name: "Review activity date" }));
    await fireEvent.changeText(screen.getByLabelText("Time zone"), "Asia/Singapore");
    await fireEvent.press(screen.getByRole("button", { name: "Use activity date" }));
    expect(confirmPendingDateReview).toHaveBeenCalledWith({
      kind: "confirmed",
      localDate: "2026-10-10",
      localTime: "09:00:00.120",
      timeZone: "Asia/Singapore",
      utcOffsetMinutes: 480,
    });
    await waitFor(() => expect(screen.queryByText("Confirm activity date")).not.toBeOnTheScreen());
  });

  it("blocks Back and Keep for later while date review confirmation is in flight", async () => {
    const remove = jest.fn();
    const addEventListener = jest.spyOn(BackHandler, "addEventListener").mockReturnValue({ remove });
    let releaseDecision:
      | ((value: { kind: "imported"; activityId: string; aggregateRevision: number }) => void)
      | undefined;
    const pendingReview = Object.freeze({
      activityId: "local-activity-1",
      absoluteStartedAtMs: Date.UTC(2026, 9, 10, 1, 0, 0),
      sourceLocalDateTime: "2026-10-10T09:00:00",
      sourceTimeZone: "Asia/Singapore",
      sourceUtcOffsetMinutes: 480,
      suggestedLocalDate: "2026-10-10",
      suggestedLocalTime: "09:00:00",
      suggestedTimeZone: "Asia/Singapore",
      suggestedUtcOffsetMinutes: 480,
    });
    await renderScreen({
      coordinator: {
        syncNow: async () => ({
          kind: "failure",
          counts: { ...counts, newActivities: 0, attemptedActivities: 0 },
          failure: { code: "date_confirmation_required", retryable: false },
        }),
      },
      confirmPendingDateReview: async () => new Promise((resolve) => {
        releaseDecision = resolve as typeof releaseDecision;
      }),
      getPendingDateReview: () => pendingReview,
      source: connectedSource(),
    });

    await fireEvent.press(await screen.findByRole("button", { name: "Sync now" }));
    await fireEvent.press(await screen.findByRole("button", { name: "Review activity date" }));
    await fireEvent.press(screen.getByRole("button", { name: "Use activity date" }));

    const listener = addEventListener.mock.calls.at(-1)?.[1];
    await act(async () => {
      expect(listener?.(undefined as never)).toBe(true);
    });

    expect(screen.getByText("Confirm activity date")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Keep for later" })).toBeDisabled();

    await act(async () => {
      releaseDecision?.({ kind: "imported", activityId: "local-activity-1", aggregateRevision: 2 });
    });
    addEventListener.mockRestore();
  });

  it.each(["Keep for later", "Back"] as const)(
    "restores date-review focus to the root trigger after %s dismissal",
    async (dismissal) => {
      const remove = jest.fn();
      const addEventListener = jest.spyOn(BackHandler, "addEventListener").mockReturnValue({ remove });
      const pendingReview = Object.freeze({
        activityId: "local-activity-1",
        absoluteStartedAtMs: Date.UTC(2026, 9, 10, 1, 0, 0),
        sourceLocalDateTime: "2026-10-10T09:00:00",
        sourceTimeZone: "Asia/Singapore",
        sourceUtcOffsetMinutes: 480,
        suggestedLocalDate: "2026-10-10",
        suggestedLocalTime: "09:00:00",
        suggestedTimeZone: "Asia/Singapore",
        suggestedUtcOffsetMinutes: 480,
      });
      await renderScreen({
        coordinator: {
          syncNow: async () => ({
            kind: "failure",
            counts: { ...counts, newActivities: 0, attemptedActivities: 0 },
            failure: { code: "date_confirmation_required", retryable: false },
          }),
        },
        getPendingDateReview: () => pendingReview,
        source: connectedSource(),
      });

      await fireEvent.press(await screen.findByRole("button", { name: "Sync now" }));
      const rootTrigger = await screen.findByRole("button", { name: "Review activity date" });
      expect(rootTrigger).toHaveProp("hasTVPreferredFocus", false);
      await fireEvent.press(rootTrigger);

      if (dismissal === "Keep for later") {
        await fireEvent.press(screen.getByRole("button", { name: dismissal }));
      } else {
        const listener = addEventListener.mock.calls.at(-1)?.[1];
        await act(async () => {
          expect(listener?.(undefined as never)).toBe(true);
        });
      }

      await waitFor(() => expect(screen.queryByText("Confirm activity date")).not.toBeOnTheScreen());
      await waitFor(() => expect(
        screen.getByRole("button", { name: "Review activity date" }),
      ).toHaveProp("hasTVPreferredFocus", true));
      addEventListener.mockRestore();
    },
  );

  it("uses Back to cancel MFA before leaving the contextual Garmin route", async () => {
    const remove = jest.fn();
    const addEventListener = jest.spyOn(BackHandler, "addEventListener").mockReturnValue({ remove });
    const onBack = jest.fn();
    const logout = jest.fn(async () => undefined);
    await renderScreen({
      onBack,
      source: {
        ...connectedSource(),
        restoreSession: async () => ({
          kind: "mfa_required",
          challenge_handle: "opaque-continuation-handle-9876",
          generation: 2,
        }),
        logout,
      },
    });
    expect(await screen.findByText("One-time code")).toBeOnTheScreen();

    let listener = addEventListener.mock.calls.at(-1)?.[1];
    await act(async () => {
      expect(listener?.(undefined as never)).toBe(true);
    });
    expect(await screen.findByText("Garmin not connected")).toBeOnTheScreen();
    expect(logout).toHaveBeenCalledTimes(1);
    expect(onBack).not.toHaveBeenCalled();

    listener = addEventListener.mock.calls.at(-1)?.[1];
    await act(async () => {
      expect(listener?.(undefined as never)).toBe(true);
    });
    expect(onBack).toHaveBeenCalledTimes(1);
    addEventListener.mockRestore();
  });

  it("keyboard-activates each full-row target once and ignores D-pad movement", async () => {
    const { onOpenActivity } = await renderScreen({ source: connectedSource() });
    const row = await screen.findByRole("button", { name: morningRunRowName });

    await fireEvent(row, "keyDown", { nativeEvent: { key: "Enter" } });
    await fireEvent(row, "keyDown", { nativeEvent: { key: " " } });
    await fireEvent(row, "keyDown", { nativeEvent: { key: "ArrowDown" } });

    expect(onOpenActivity).toHaveBeenCalledTimes(2);
    expect(onOpenActivity).toHaveBeenNthCalledWith(1, "local-activity-1");
    expect(onOpenActivity).toHaveBeenNthCalledWith(2, "local-activity-1");
  });

  const layoutCases: ReadonlyArray<readonly [number, number, number, "compact" | "medium" | "expanded"]> = [
    [360, 800, 1, "compact"],
    [390, 844, 2, "compact"],
    [600, 960, 1, "medium"],
    [840, 1_080, 1, "expanded"],
    [840, 360, 2, "expanded"],
  ];

  it.each(layoutCases)("keeps required actions and history reachable at %sx%s font %s", async (width, height, fontScale, widthClass) => {
    Dimensions.set({
      screen: { fontScale, height, scale: 1, width },
      window: { fontScale, height, scale: 1, width },
    });
    await renderScreen({ reduceMotion: true, source: connectedSource(), width });

    expect(await screen.findByText("Connected to Garmin")).toBeOnTheScreen();
    expect(screen.getByTestId("garmin-sync-screen")).toHaveProp("accessibilityLabel", `${widthClass} layout`);
    expect(screen.getByText("Garmin Sync")).toHaveProp("numberOfLines", 1);
    for (const action of [
      screen.getByRole("button", { name: "Appearance" }),
      screen.getByRole("button", { name: "Sync now" }),
      screen.getByRole("button", { name: "Disconnect Garmin" }),
      screen.getByRole("button", { name: morningRunRowName }),
    ]) {
      expect(StyleSheet.flatten(action.props.style).minHeight).toBeGreaterThanOrEqual(48);
    }
    expect(screen.getByTestId("garmin-sync-screen-scroll")).not.toHaveProp("horizontal", true);
  });
});
