import { fireEvent, render } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import React from "react";

import {
  FactualHistoryChart,
  projectFactualVisualSeries,
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

  it("keeps zero and one factual observations truthful without a zero path or directional claim", async () => {
    const empty = await render(<AppearanceProvider><FactualHistoryChart series={{ ...twoEffortSeries, points: [] }} /></AppearanceProvider>);
    expect(empty.getByText("No effort recorded")).toBeTruthy();
    expect(empty.queryByTestId("factual-history-chart")).toBeNull();
    expect(empty.getByLabelText(/0 factual points.*goal line absent/u)).toBeTruthy();

    const sparse = await render(<AppearanceProvider><FactualHistoryChart series={{ ...twoEffortSeries, points: [twoEffortSeries.points[0]!] }} /></AppearanceProvider>);
    expect(sparse.getByText("More data needed")).toBeTruthy();
    expect(sparse.getAllByText("12:06")).toHaveLength(2);
    expect(sparse.getByLabelText(/1 factual points/u)).toBeTruthy();
  });

  it("splits invalid gaps and samples only decoration while retaining factual source identity", () => {
    const gap = Object.freeze({ ...twoEffortSeries, points: Object.freeze([
      twoEffortSeries.points[0]!,
      Object.freeze({ ...twoEffortSeries.points[0]!, activityId: null, evidence: null, sourceRevision: null, status: "removed" as const, targetAtDateSeconds: null, valueSeconds: null }),
      twoEffortSeries.points[1]!,
    ]) });
    const projection = projectFactualVisualSeries(gap);
    expect(projection.actualSegments).toHaveLength(2);
    expect(projection.actualSegments.flat().map((entry) => entry.point.activityId)).toEqual(["activity-august", "activity-september"]);

    const longSeries: ProgressFactualSeries = Object.freeze({ ...twoEffortSeries, points: Object.freeze(Array.from({ length: 400 }, (_, index) => Object.freeze({
      ...twoEffortSeries.points[index === 399 ? 1 : 0]!,
      activityId: `activity-${index}`,
      localDate: `2026-09-${String((index % 28) + 1).padStart(2, "0")}`,
      sourceRevision: index + 1,
      valueSeconds: 1_000 - index,
    }))) });
    const sampled = projectFactualVisualSeries(longSeries).actualSegments.flat();
    expect(sampled.length).toBeLessThanOrEqual(120);
    expect(sampled[0]?.point.activityId).toBe("activity-0");
    expect(sampled.at(-1)?.point.activityId).toBe("activity-399");
    expect(sampled.some((entry) => entry.point.valueSeconds === 601)).toBe(true);
  });

  it("suppresses old or incompatible source actions and stacks facts at 200 percent text", async () => {
    const renderNative = require("react-native") as typeof import("react-native");
    const dimensions = jest.spyOn(renderNative, "useWindowDimensions").mockReturnValue({ fontScale: 2, height: 430, scale: 1, width: 932 });
    try {
      const series = Object.freeze({ ...twoEffortSeries, points: Object.freeze([
        twoEffortSeries.points[0]!,
        Object.freeze({ ...twoEffortSeries.points[1]!, status: "corrected_effective" as const }),
      ]) });
      const rendered = await render(<AppearanceProvider><FactualHistoryChart onOpenSource={jest.fn()} series={series} /></AppearanceProvider>);
      expect(rendered.getByTestId("factual-history-facts")).toHaveStyle({ flexDirection: "column" });
      await fireEvent.press(rendered.getByRole("button", { name: "Show history data" }));
      expect(rendered.getAllByRole("button", { name: "Open source" })).toHaveLength(1);
      expect(rendered.getByText("Corrected effective fact")).toBeTruthy();
    } finally {
      dimensions.mockRestore();
    }
  });
});
