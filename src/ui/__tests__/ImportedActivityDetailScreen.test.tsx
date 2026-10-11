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

function renderScreen(overrides: Partial<React.ComponentProps<typeof ImportedActivityDetailScreen>> = {}) {
  const props: React.ComponentProps<typeof ImportedActivityDetailScreen> = {
    state: { kind: "ready", detail: outdoorDetail },
    onBack: jest.fn(),
    onMatch: jest.fn(),
    onRetry: jest.fn(),
    ...overrides,
  };
  return {
    ...render(
      <AppearanceProvider>
        <ImportedActivityDetailScreen {...props} />
      </AppearanceProvider>,
    ),
    props,
  };
}

describe("ImportedActivityDetailScreen accepted outdoor activity", () => {
  it("renders factual summary, validated route alternative, optional HR, laps, and fidelity in order", () => {
    renderScreen();

    expect(screen.getByRole("header", { name: "Activity detail" })).toBeTruthy();
    expect(screen.getByText("Outdoor run")).toBeTruthy();
    expect(screen.getByText("2026-10-04")).toBeTruthy();
    expect(screen.getByText("5.00 km")).toBeTruthy();
    expect(screen.getByText("26:00")).toBeTruthy();
    expect(screen.getByText("24:35")).toBeTruthy();
    expect(screen.getByText("4:55/km")).toBeTruthy();
    expect(screen.getByLabelText("Route from 2 validated source positions in 1 segment.")).toBeTruthy();
    expect(screen.getByLabelText("Average heart rate. 152 bpm.")).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Lap" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Time" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Pace" })).toBeTruthy();
    expect(screen.getByText("Source laps")).toBeTruthy();
    expect(screen.queryByText(/987654321|must-never-render|garmin_connect_account/u)).toBeNull();
  });

  it("keeps the only history action read-only and delegates matching explicitly", () => {
    const { props } = renderScreen();

    fireEvent.press(screen.getByRole("button", { name: "Match to scheduled workout" }));

    expect(props.onMatch).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: /edit|delete|remove|replace/u })).toBeNull();
  });
});
