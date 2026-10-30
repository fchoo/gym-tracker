import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import {
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import React from "react";
import { StyleSheet } from "react-native";

import type { ImportedActivityDetail } from "../../domains/activities/activityDetails";
import { ImportedActivityDetailScreen } from "../screens/ImportedActivityDetailScreen";
import { AppearanceProvider } from "../theme";

const outdoorDetail: ImportedActivityDetail = Object.freeze({
  activityType: "Outdoor run",
  confirmedLocalDate: "2026-10-04",
  distance: "5.00 km",
  elapsed: "26:00",
  secondaryDuration: Object.freeze({ label: "Moving", value: "24:35" }),
  averagePace: Object.freeze({ basis: "Moving time", value: "4:55/km" }),
  route: Object.freeze({
    kind: "available",
    segments: Object.freeze([Object.freeze([
      Object.freeze({ latitudeE6: 1_352_100, longitudeE6: 103_819_800 }),
      Object.freeze({ latitudeE6: 1_353_200, longitudeE6: 103_821_100 }),
    ])]),
  }),
  averageHeartRate: "152 bpm",
  laps: Object.freeze([Object.freeze({
    lap: "1",
    time: Object.freeze({ basis: "Moving time", value: "4:55" }),
    pace: Object.freeze({ basis: "Moving time", value: "4:55/km" }),
  })]),
  fidelity: Object.freeze({
    kind: "source_laps",
    heading: "Source laps",
    body: "Lap and summary facts come from accepted source fields.",
  }),
});

async function renderScreen(overrides: Partial<React.ComponentProps<typeof ImportedActivityDetailScreen>> = {}) {
  const props: React.ComponentProps<typeof ImportedActivityDetailScreen> = {
    state: { kind: "ready", detail: outdoorDetail },
    onBack: jest.fn(),
    onMatch: jest.fn(),
    onRetry: jest.fn(),
    ...overrides,
  };
  const rendered = await render(
      <AppearanceProvider>
        <ImportedActivityDetailScreen {...props} />
      </AppearanceProvider>,
    );
  return {
    ...rendered,
    props,
  };
}

describe("ImportedActivityDetailScreen accepted outdoor activity", () => {
  it("moves Calendar-origin initial focus to Back", async () => {
    await renderScreen({ mode: "calendar" });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Back to Calendar agenda" })).toHaveProp(
        "hasTVPreferredFocus",
        true,
      );
    });
    expect(screen.getByTestId("activity-detail-heading")).not.toHaveProp(
      "hasTVPreferredFocus",
      true,
    );
  });

  it("renders factual summary, validated route alternative, optional HR, laps, and fidelity in order", async () => {
    await renderScreen();

    expect(screen.getByRole("header", { name: "Activity detail" })).toBeTruthy();
    expect(screen.getByText("Outdoor run")).toBeTruthy();
    expect(screen.getByText("2026-10-04")).toBeTruthy();
    expect(screen.getByText("5.00 km")).toBeTruthy();
    expect(screen.getByText("26:00")).toBeTruthy();
    expect(screen.getByText("24:35")).toBeTruthy();
    expect(screen.getAllByText("4:55/km")).toHaveLength(2);
    expect(screen.getByLabelText("Route from 2 validated source positions in 1 segment.")).toBeTruthy();
    expect(screen.getByLabelText("Average heart rate. 152 bpm.")).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Lap" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Time" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Pace" })).toBeTruthy();
    expect(screen.getByText("Source laps")).toBeTruthy();
    expect(screen.queryByText(/987654321|must-never-render|garmin_connect_account/u)).toBeNull();
  });

  it("keeps the only history action read-only and delegates matching explicitly", async () => {
    const { props } = await renderScreen();

    fireEvent.press(screen.getByRole("button", { name: "Match to scheduled workout" }));

    expect(props.onMatch).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: /edit|delete|remove|replace/u })).toBeNull();
  });

  it("removes management actions when a reused screen changes to Calendar mode", async () => {
    const onMatch = jest.fn();
    const rendered = await render(
      <AppearanceProvider>
        <ImportedActivityDetailScreen
          mode="management"
          onBack={jest.fn()}
          onMatch={onMatch}
          onRetry={jest.fn()}
          state={{ kind: "ready", detail: outdoorDetail }}
        />
      </AppearanceProvider>,
    );
    expect(screen.getByRole("button", { name: "Match to scheduled workout" })).toBeOnTheScreen();

    await rendered.rerender(
      <AppearanceProvider>
        <ImportedActivityDetailScreen
          mode="calendar"
          onBack={jest.fn()}
          onRetry={jest.fn()}
          state={{ kind: "ready", detail: outdoorDetail }}
        />
      </AppearanceProvider>,
    );
    expect(screen.queryByRole("button", { name: "Match to scheduled workout" })).toBeNull();
    expect(StyleSheet.flatten(screen.getByTestId("activity-detail-title-text").props.style)).toMatchObject({ fontFamily: "ArchivoVariable", fontSize: 22, fontWeight: "800" });
    expect(StyleSheet.flatten(screen.getByText("2026-10-04").props.style)).toMatchObject({ fontFamily: "IBMPlexMono_400Regular", fontSize: 16, fontWeight: "400" });
  });

  it.each([
    [{ kind: "loading" } as const, "Loading activity details"],
    [{ kind: "missing" } as const, "Activity not found"],
    [{ kind: "projection_error", code: "accepted_payload_unavailable" } as const, "Activity details unavailable"],
  ])("keeps the Calendar Back label and heading role in the %s path", async (state, expectedText) => {
    await renderScreen({ mode: "calendar", state });

    expect(screen.getByText(expectedText)).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Back to Calendar agenda" })).toBeOnTheScreen();
    expect(StyleSheet.flatten(screen.getByTestId("activity-detail-title-text").props.style)).toMatchObject({ fontFamily: "ArchivoVariable", fontSize: 22, fontWeight: "800" });
    if (state.kind !== "loading") {
      expect(StyleSheet.flatten(screen.getByText(expectedText).props.style)).toMatchObject({ fontFamily: "ArchivoVariable", fontSize: 22, fontWeight: "800" });
    }
  });
});

describe("ImportedActivityDetailScreen missing-channel and reflow matrix", () => {
  it("renders treadmill No route and never draws stray source positions or a missing HR row", async () => {
    await renderScreen({
      state: {
        kind: "ready",
        detail: {
          activityType: "Treadmill run",
          confirmedLocalDate: outdoorDetail.confirmedLocalDate,
          distance: outdoorDetail.distance,
          elapsed: "26:00",
          secondaryDuration: { label: "Moving", value: "24:35" },
          averagePace: { basis: "Moving time", value: "4:55/km" },
          route: { kind: "none" },
          laps: outdoorDetail.laps,
          fidelity: outdoorDetail.fidelity,
        },
      },
    });

    expect(screen.getByText("No route")).toBeTruthy();
    expect(screen.queryByTestId("activity-detail-route")).toBeNull();
    expect(screen.queryByText("Average heart rate")).toBeNull();
  });

  it("renders Route unavailable and Laps unavailable without zero-value substitutes", async () => {
    await renderScreen({
      state: {
        kind: "ready",
        detail: {
          activityType: outdoorDetail.activityType,
          confirmedLocalDate: outdoorDetail.confirmedLocalDate,
          distance: outdoorDetail.distance,
          route: { kind: "unavailable" },
          laps: [],
          fidelity: outdoorDetail.fidelity,
        },
      },
    });

    expect(screen.getByText("Route unavailable")).toBeTruthy();
    expect(screen.getByText("Laps unavailable")).toBeTruthy();
    expect(screen.queryByText("0:00")).toBeNull();
    expect(screen.queryByText("0 bpm")).toBeNull();
  });

  it("announces missing lap cells as unavailable and keeps exact headers", async () => {
    await renderScreen({
      state: {
        kind: "ready",
        detail: {
          ...outdoorDetail,
          laps: [{ lap: "7" }],
        },
      },
    });

    expect(screen.getByRole("row", {
      name: "Lap 7. Time Unavailable. Pace Unavailable.",
    })).toBeTruthy();
    expect(screen.getAllByText("Unavailable")).toHaveLength(2);
    expect(screen.getByRole("columnheader", { name: "Lap" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Time" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Pace" })).toBeTruthy();
  });

  it("stacks label/value lap cells at compact width as the 200% text alternative", async () => {
    await renderScreen({ width: 360 });

    expect(screen.getByTestId("activity-detail-lap-row-0")).toHaveStyle({
      flexDirection: "column",
    });
    expect(screen.getAllByTestId("activity-detail-lap-cell-label")).toHaveLength(3);
  });
});

describe("ImportedActivityDetailScreen route states and shared shell", () => {
  it("keeps revision decisions modal, reports stale/save failures, and retries explicitly", async () => {
    let rejectAccept: ((error: Error) => void) | undefined;
    const onAcceptRevision = jest.fn(() => new Promise<void>((_resolve, reject) => {
      rejectAccept = reject;
    }));
    const onKeepRevision = jest.fn(async () => {
      throw new Error("save failed");
    });
    const onBack = jest.fn();
    const onRetry = jest.fn();
    await renderScreen({
      onAcceptRevision,
      onBack,
      onKeepRevision,
      onRetry,
      state: {
        kind: "revision_review",
        review: {
          activityId: "activity-1",
          acceptedRevision: 1,
          proposedRevision: 2,
          expectedProposedSha256: "a".repeat(64),
          changedFields: [{ field: "distance", accepted: "5.00 km", proposed: "5.01 km" }],
        },
      },
    });

    await fireEvent.press(screen.getByRole("button", { name: "Use updated facts" }));
    await fireEvent.press(screen.getByRole("button", { name: "Go back" }));
    expect(onBack).not.toHaveBeenCalled();
    await act(async () => rejectAccept?.(new Error("stale")));
    expect(await screen.findByText("Revision needs review")).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole("button", { name: "Keep current facts" }));
    expect(await screen.findByText("Revision decision failed")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Retry activity details" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  const cases: readonly Readonly<{
    state: React.ComponentProps<typeof ImportedActivityDetailScreen>["state"];
    heading: string;
    retryable: boolean;
  }>[] = [
    { state: { kind: "loading" }, heading: "Loading activity details", retryable: false },
    { state: { kind: "missing" }, heading: "Activity not found", retryable: false },
    { state: { kind: "removed" }, heading: "Activity removed", retryable: false },
    { state: { kind: "projection_error", code: "accepted_payload_unavailable" }, heading: "Activity details unavailable", retryable: true },
    {
      state: {
        kind: "revision_review",
        review: {
          activityId: "activity-local-01",
          acceptedRevision: 2,
          proposedRevision: 3,
          expectedProposedSha256: "b".repeat(64),
          changedFields: [
            { field: "distance_meters", accepted: "5000", proposed: "5050" },
          ],
        },
      },
      heading: "Source revision needs review",
      retryable: true,
    },
  ];
  for (const { state, heading, retryable } of cases) {
    it(`renders ${state.kind} without fabricated detail`, async () => {
      const onRetry = jest.fn();
      await renderScreen({ state, onRetry });

      expect(screen.getByText(heading)).toBeTruthy();
      expect(screen.getByRole("button", { name: "Go back" })).toBeOnTheScreen();
      if (state.kind === "missing") {
        expect(StyleSheet.flatten(screen.getByText(heading).props.style)).toMatchObject({ fontSize: 20, fontWeight: "800" });
      }
      expect(screen.queryByText("5.00 km")).toBeNull();
      expect(screen.queryByText("152 bpm")).toBeNull();
      expect(screen.queryByTestId("activity-detail-route")).toBeNull();
      expect(screen.queryByRole("button", { name: "Match to scheduled workout" })).toBeNull();
      const retry = screen.queryByRole("button", { name: "Retry activity details" });
      expect(retry === null).toBe(!retryable);
      if (retry !== null) {
        fireEvent.press(retry);
        expect(onRetry).toHaveBeenCalledTimes(1);
      }
    });
  }

  it("uses shared Appearance, closes it before Back, and retains 48dp actions", async () => {
    const { props } = await renderScreen({ width: 390 });

    expect(screen.getByLabelText("compact layout")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Go back" })).toHaveStyle({
      minHeight: 48,
      minWidth: 48,
    });
    await fireEvent.press(screen.getByRole("button", { name: "Appearance" }));
    expect(await screen.findByRole("radio", { name: "System" })).toBeTruthy();
    const closeAppearance = screen.getAllByRole("button", { name: "Close appearance" }).at(-1);
    expect(closeAppearance).toBeDefined();
    await fireEvent.press(closeAppearance!);
    expect(screen.queryByRole("radio", { name: "System" })).toBeNull();
    fireEvent.press(screen.getByRole("button", { name: "Go back" }));
    expect(props.onBack).toHaveBeenCalledTimes(1);
  });
});
