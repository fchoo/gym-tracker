import { fireEvent, render } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import React from "react";

import {
  FactualHistoryChart,
  factualChartY,
  formatFactualDuration,
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
    expect(rendered.getAllByText("10:54")[0]).toHaveStyle({ fontFamily: "IBMPlexMono_400Regular", fontSize: 16, fontWeight: "400" });
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

    const semanticOverflow: ProgressFactualSeries = Object.freeze({
      ...twoEffortSeries,
      points: Object.freeze(Array.from({ length: 241 }, (_, index) => Object.freeze({
        ...twoEffortSeries.points[0]!,
        activityId: `extremum-${index}`,
        sourceRevision: index + 1,
        valueSeconds: index % 2 === 0 ? 600 : 900,
        targetAtDateSeconds: 750,
      }))),
    });
    const retainedSemantic = projectFactualVisualSeries(semanticOverflow).actualSegments.flat();
    expect(retainedSemantic).toHaveLength(241);
    expect(retainedSemantic.map(({ point }) => point.activityId)).toEqual(
      semanticOverflow.points.map(({ activityId }) => activityId),
    );
  });

  it("draws higher-is-better improvements upward and labels exact equality as At target", async () => {
    expect(factualChartY(50, 40, 50, false)).toBeLessThan(factualChartY(40, 40, 50, false));
    expect(factualChartY(40, 40, 50, true)).toBeLessThan(factualChartY(50, 40, 50, true));
    const strength = Object.freeze({
      ...twoEffortSeries,
      fasterIsLower: false,
      metricLabel: "Bench Press load",
      directionLabel: "Higher comparable load is better.",
      currentTargetSeconds: 50,
      unitLabel: "kg",
      points: Object.freeze([
        Object.freeze({ ...twoEffortSeries.points[0]!, valueSeconds: 40, targetAtDateSeconds: 45 }),
        Object.freeze({ ...twoEffortSeries.points[1]!, valueSeconds: 50, targetAtDateSeconds: 50 }),
      ]),
    });
    const rendered = await render(<AppearanceProvider><FactualHistoryChart formatValue={(value) => value === null ? "—" : `${value} kg`} series={strength} /></AppearanceProvider>);
    expect(rendered.getByText("At target")).toBeTruthy();
    expect(rendered.getByLabelText(/Higher comparable load is better/u)).toBeTruthy();
  });

  it("formats shared durations consistently across minute and hour boundaries", () => {
    expect(formatFactualDuration(3_599)).toBe("59:59");
    expect(formatFactualDuration(3_600)).toBe("1:00:00");
    expect(formatFactualDuration(86_399)).toBe("23:59:59");
  });

  it("pages the complete factual data equivalent without truncating source actions", async () => {
    const series: ProgressFactualSeries = Object.freeze({
      ...twoEffortSeries,
      points: Object.freeze(Array.from({ length: 205 }, (_, index) => Object.freeze({
        ...twoEffortSeries.points[0]!,
        activityId: `page-${index}`,
        sourceRevision: index + 1,
        valueSeconds: 700 - index,
      }))),
    });
    const rendered = await render(<AppearanceProvider><FactualHistoryChart onOpenSource={jest.fn()} series={series} /></AppearanceProvider>);
    await fireEvent.press(rendered.getByRole("button", { name: "Show history data" }));
    expect(rendered.getAllByRole("button", { name: "Open source" })).toHaveLength(100);
    await fireEvent.press(rendered.getByRole("button", { name: "Show more history data" }));
    expect(rendered.getAllByRole("button", { name: "Open source" })).toHaveLength(200);
    await fireEvent.press(rendered.getByRole("button", { name: "Show more history data" }));
    expect(rendered.getAllByRole("button", { name: "Open source" })).toHaveLength(205);
    expect(rendered.queryByRole("button", { name: "Show more history data" })).toBeNull();
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
