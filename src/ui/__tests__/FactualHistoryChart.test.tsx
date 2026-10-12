import { fireEvent, render } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import React from "react";

import {
  FactualHistoryChart,
  type ProgressFactualSeries,
} from "../components/FactualHistoryChart";
import { AppearanceProvider } from "../theme";

const twoEffortSeries: ProgressFactualSeries = Object.freeze({
  distanceMeters: 2_400,
  rangeLabel: "All time",
  unitLabel: "elapsed time",
  fasterIsLower: true,
  points: Object.freeze([
    Object.freeze({
      activityId: "activity-august",
      evidence: "source_summary" as const,
      localDate: "2026-08-04",
      sourceRevision: 3,
      status: "accepted_current" as const,
      targetAtDateSeconds: 720,
      timeBasis: "elapsed" as const,
      valueSeconds: 726,
    }),
    Object.freeze({
      activityId: "activity-september",
      evidence: "source_laps" as const,
      localDate: "2026-09-04",
      sourceRevision: 4,
      status: "accepted_current" as const,
      targetAtDateSeconds: 660,
      timeBasis: "elapsed" as const,
      valueSeconds: 654,
    }),
  ]),
});

describe("FactualHistoryChart", () => {
  it("renders accepted chronological facts, a separate goal line, and the equivalent factual data", async () => {
    const onOpenSource = jest.fn();
    const rendered = await render(
      <AppearanceProvider>
        <FactualHistoryChart onOpenSource={onOpenSource} series={twoEffortSeries} />
      </AppearanceProvider>,
    );

    expect(rendered.getByText("Latest")).toBeTruthy();
    expect(rendered.getByText("Best")).toBeTruthy();
    expect(rendered.getByText("Target")).toBeTruthy();
    expect(rendered.getByText("Gap")).toBeTruthy();
    expect(rendered.getByText("Goal 11:00")).toBeTruthy();
    expect(rendered.getByLabelText(/2\.4 km.*All time.*2 factual points.*Faster is lower.*goal line present/u)).toBeTruthy();

    await fireEvent.press(rendered.getByRole("button", { name: "Show history data" }));
    expect(rendered.getByText("4 August 2026")).toBeTruthy();
    expect(rendered.getByText("12:06 · elapsed time")).toBeTruthy();
    expect(rendered.getByText("11:00")).toBeTruthy();
    expect(rendered.getByText("Accepted/current · source summary")).toBeTruthy();

    await fireEvent.press(rendered.getAllByRole("button", { name: "Open source" })[0]!);
    expect(onOpenSource).toHaveBeenCalledWith({ activityId: "activity-august", sourceRevision: 3 });
  });
});
