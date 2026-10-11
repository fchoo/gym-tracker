import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import {
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import React from "react";

import type {
  ImportedActivityDetail,
  ImportedActivityDetailReadResult,
} from "../../src/domains/activities/activityDetails";
import { AppearanceProvider } from "../../src/ui/theme";

const mockBack = jest.fn();
const mockPush = jest.fn();
const mockLoadImportedActivityDetail = jest.fn<
  (activityId: string) => Promise<ImportedActivityDetailReadResult>
>();
let mockParams: Readonly<{
  activityId?: string | readonly string[];
  origin?: string | readonly string[];
  returnToken?: string | readonly string[];
}> = {};

jest.mock("expo-router", () => ({
  router: {
    back: (...args: readonly unknown[]) => mockBack(...args),
    push: (...args: readonly unknown[]) => mockPush(...args),
  },
  useLocalSearchParams: () => mockParams,
}));

jest.mock("../../src/bootstrap/workoutAppRuntime", () => ({
  useWorkoutAppRuntime: () => ({
    loadImportedActivityDetail: mockLoadImportedActivityDetail,
  }),
}));

import ImportedActivityDetailRoute, {
  createImportedActivityDetailHref,
} from "../garmin/activity/[activityId]";

const detail: ImportedActivityDetail = Object.freeze({
  activityType: "Outdoor run",
  confirmedLocalDate: "2026-10-04",
  distance: "5.00 km",
  elapsed: "26:00",
  route: Object.freeze({ kind: "unavailable" }),
  laps: Object.freeze([]),
  fidelity: Object.freeze({
    kind: "source_summary",
    heading: "Source summary",
    body: "Summary facts come from accepted source fields.",
  }),
});

async function renderRoute() {
  return render(
    <AppearanceProvider>
      <ImportedActivityDetailRoute />
    </AppearanceProvider>,
  );
}

describe("ImportedActivityDetailRoute local identity boundary", () => {
  beforeEach(() => {
    mockBack.mockReset();
    mockPush.mockReset();
    mockLoadImportedActivityDetail.mockReset();
    mockParams = {
      activityId: "activity-local-01",
      origin: "calendar",
      returnToken: "calendar:day:2026-10-04:agenda-1",
    };
    mockLoadImportedActivityDetail.mockResolvedValue({ kind: "ready", detail });
  });

  it("loads exactly one validated local activity and uses stack Back", async () => {
    await renderRoute();

    await waitFor(() => {
      expect(mockLoadImportedActivityDetail).toHaveBeenCalledTimes(1);
      expect(mockLoadImportedActivityDetail).toHaveBeenCalledWith("activity-local-01");
    });
    expect(screen.getByText("Outdoor run")).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: "Go back" }));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it.each([
    "987654321",
    "garmin-987654321",
    "external_activity_id:987654321",
    "activity local 01",
    `activity-${"x".repeat(129)}`,
  ])("rejects non-local route identity %s without fallback lookup", async (activityId) => {
    mockParams = { activityId, origin: "calendar" };
    await renderRoute();

    expect(await screen.findByText("Activity not found")).toBeTruthy();
    expect(mockLoadImportedActivityDetail).not.toHaveBeenCalled();
  });

  it("retries the same validated local ID after a bounded projection failure", async () => {
    mockLoadImportedActivityDetail
      .mockRejectedValueOnce(new Error("bounded-read-failed"))
      .mockResolvedValueOnce({ kind: "ready", detail });
    await renderRoute();

    expect(await screen.findByText("Activity details unavailable")).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: "Retry activity details" }));
    expect(await screen.findByText("Outdoor run")).toBeTruthy();
    expect(mockLoadImportedActivityDetail).toHaveBeenNthCalledWith(1, "activity-local-01");
    expect(mockLoadImportedActivityDetail).toHaveBeenNthCalledWith(2, "activity-local-01");
  });

  it("routes matching with only the same opaque local ID", async () => {
    await renderRoute();
    expect(await screen.findByText("Outdoor run")).toBeTruthy();

    fireEvent.press(screen.getByRole("button", { name: "Match to scheduled workout" }));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/garmin/match/[activityId]",
      params: { activityId: "activity-local-01" },
    });
  });
});

describe("createImportedActivityDetailHref calendar producer contract", () => {
  it("publishes only the bounded calendar origin and return token", () => {
    expect(createImportedActivityDetailHref({
      activityId: "activity-local-01",
      origin: "calendar",
      returnToken: "calendar:day:2026-10-04:agenda-1",
    })).toEqual({
      pathname: "/garmin/activity/[activityId]",
      params: {
        activityId: "activity-local-01",
        origin: "calendar",
        returnToken: "calendar:day:2026-10-04:agenda-1",
      },
    });
  });

  it.each([
    { activityId: "987654321", origin: "calendar" },
    { activityId: "activity-local-01", origin: "provider" },
    { activityId: "activity-local-01", origin: "calendar", returnToken: "https://arbitrary.example" },
    { activityId: "activity-local-01", origin: "calendar", returnToken: `calendar:${"x".repeat(120)}` },
  ])("rejects unbounded or provider-facing params %#", (input) => {
    expect(() => createImportedActivityDetailHref(input as never)).toThrow("imported_activity_route_invalid");
  });
});
