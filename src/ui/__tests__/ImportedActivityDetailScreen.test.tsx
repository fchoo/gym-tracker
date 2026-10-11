import {
  fireEvent,
  render,
  screen,
} from "@testing-library/react-native";
import {
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import React from "react";

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
});

describe("ImportedActivityDetailScreen missing-channel and reflow matrix", () => {
  it("renders treadmill No route and never draws stray source positions or a missing HR row", async () => {
    await renderScreen({
      state: {
        kind: "ready",
        detail: {
          ...outdoorDetail,
          activityType: "Treadmill run",
          route: { kind: "none" },
          averageHeartRate: undefined,
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
          ...outdoorDetail,
          elapsed: undefined,
          secondaryDuration: undefined,
          averagePace: undefined,
          route: { kind: "unavailable" },
          averageHeartRate: undefined,
          laps: [],
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
