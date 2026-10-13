import {
  act,
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
import type { GarminRevisionReviewDetail } from "../../src/bootstrap/workoutAppRuntime";
import { AppearanceProvider } from "../../src/ui/theme";

const mockBack = jest.fn();
const mockPush = jest.fn();
const mockLoadImportedActivityDetail = jest.fn<
  (activityId: string, sourceRevision?: number) => Promise<ImportedActivityDetailReadResult>
>();
const mockLoadGarminRevisionReview = jest.fn<
  (activityId: string) => Promise<GarminRevisionReviewDetail | null>
>();
const mockResolveGarminRevision = jest.fn();
let mockParams: Readonly<{
  activityId?: string | readonly string[];
  origin?: string | readonly string[];
  returnToken?: string | readonly string[];
  sourceRevision?: string | readonly string[];
}> = {};
let mockShellProps: Readonly<Record<string, unknown>> = {};
let pendingLoads: Array<Readonly<{
  resolve(result: ImportedActivityDetailReadResult): void;
  reject(error: Error): void;
}>> = [];

jest.mock("expo-router", () => ({
  router: {
    back: (...args: readonly unknown[]) => mockBack(...args),
    push: (...args: readonly unknown[]) => mockPush(...args),
  },
  useFocusEffect: (effect: () => void | (() => void)) => {
    effect();
  },
  useLocalSearchParams: () => mockParams,
}));

jest.mock("../../src/bootstrap/workoutAppRuntime", () => ({
  useCalendarActivityReadPort: () => ({
    loadGarminRevisionReview: mockLoadGarminRevisionReview,
    loadImportedActivityDetail: mockLoadImportedActivityDetail,
  }),
  useWorkoutAppRuntime: () => ({
    loadGarminRevisionReview: mockLoadGarminRevisionReview,
    loadImportedActivityDetail: mockLoadImportedActivityDetail,
    resolveGarminRevision: mockResolveGarminRevision,
  }),
}));

jest.mock("../../src/ui/garmin/GarminRouteShell", () => ({
  GarminRouteShell: (props: Readonly<Record<string, unknown>>) => {
    const ReactModule = require("react") as typeof import("react");
    const { View: MockView } = require("react-native") as typeof import("react-native");
    mockShellProps = props;
    return ReactModule.createElement(
      MockView,
      { testID: "garmin-route-shell" },
      props.children as React.ReactNode,
    );
  },
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

async function settleNextLoad(result: ImportedActivityDetailReadResult) {
  const pending = pendingLoads.shift();
  if (pending === undefined) throw new Error("missing_pending_activity_load");
  await act(async () => pending.resolve(result));
}

async function failNextLoad(error: Error) {
  const pending = pendingLoads.shift();
  if (pending === undefined) throw new Error("missing_pending_activity_load");
  await act(async () => pending.reject(error));
}

describe("ImportedActivityDetailRoute local identity boundary", () => {
  beforeEach(() => {
    mockBack.mockReset();
    mockPush.mockReset();
    mockLoadImportedActivityDetail.mockReset();
    mockLoadGarminRevisionReview.mockReset();
    mockResolveGarminRevision.mockReset();
    pendingLoads = [];
    mockParams = {
      activityId: "activity-local-01",
      origin: "calendar",
      returnToken: "calendar:day:2026-10-04:agenda-1",
    };
    mockShellProps = {};
    mockLoadImportedActivityDetail.mockImplementation(() => new Promise((resolve, reject) => {
      pendingLoads.push({ resolve, reject });
    }));
  });

  it("loads exactly one validated local activity and uses stack Back", async () => {
    await renderRoute();
    expect(screen.getByTestId("garmin-route-shell")).toBeTruthy();
    expect(mockShellProps.origin).toBe("calendar");

    await waitFor(() => {
      expect(mockLoadImportedActivityDetail).toHaveBeenCalledTimes(1);
      expect(mockLoadImportedActivityDetail).toHaveBeenCalledWith("activity-local-01");
    });
    await settleNextLoad({ kind: "ready", detail });
    expect(screen.getByText("Outdoor run")).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: "Back to Calendar agenda" }));
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

  it.each([
    { origin: "workout", returnToken: "calendar:day:2026-10-04:agenda-1" },
    { origin: "calendar", returnToken: "https://arbitrary.example" },
    { origin: ["calendar"], returnToken: "calendar:day:2026-10-04:agenda-1" },
    { origin: "provider" },
    { origin: ["workout"] },
  ])("rejects invalid Calendar route context %# without loading or redirecting", async ({ origin, returnToken }) => {
    mockParams = {
      activityId: "activity-local-01",
      origin,
      ...(returnToken === undefined ? {} : { returnToken }),
    };

    await renderRoute();

    expect(await screen.findByText("Activity not found")).toBeTruthy();
    expect(mockLoadImportedActivityDetail).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it.each(["workout", "library", "progress"] as const)(
    "accepts Garmin detail opened from the %s root without a calendar token",
    async (origin) => {
      mockParams = { activityId: "activity-local-01", origin };
      await renderRoute();

      expect(mockShellProps.origin).toBe(origin);
      await waitFor(() => expect(mockLoadImportedActivityDetail).toHaveBeenCalledWith("activity-local-01"));
    },
  );

  it("loads the exact accepted revision requested by Progress", async () => {
    mockParams = {
      activityId: "activity-local-01",
      origin: "progress",
      sourceRevision: "7",
    };
    await renderRoute();

    await waitFor(() => expect(mockLoadImportedActivityDetail)
      .toHaveBeenCalledWith("activity-local-01", 7));
  });

  it("retries the same validated local ID after a bounded projection failure", async () => {
    await renderRoute();

    await failNextLoad(new Error("bounded-read-failed"));
    expect(await screen.findByText("Activity details unavailable")).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: "Retry activity details" }));
    await waitFor(() => expect(mockLoadImportedActivityDetail).toHaveBeenCalledTimes(2));
    await settleNextLoad({ kind: "ready", detail });
    expect(await screen.findByText("Outdoor run")).toBeTruthy();
    expect(mockLoadImportedActivityDetail).toHaveBeenNthCalledWith(1, "activity-local-01");
    expect(mockLoadImportedActivityDetail).toHaveBeenNthCalledWith(2, "activity-local-01");
  });

  it("routes matching with only the same opaque local ID", async () => {
    mockParams = { activityId: "activity-local-01", origin: "workout" };
    await renderRoute();
    await settleNextLoad({ kind: "ready", detail });
    expect(await screen.findByText("Outdoor run")).toBeTruthy();

    fireEvent.press(screen.getByRole("button", { name: "Match to scheduled workout" }));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/garmin/match/[activityId]",
      params: {
        activityId: "activity-local-01",
        origin: "workout",
        returnFocusToken: "match:activity-local-01",
      },
    });
  });

  it("hides stale activity facts and actions while reused route params load", async () => {
    mockParams = { activityId: "activity-local-01", origin: "workout" };
    const rendered = await renderRoute();
    await settleNextLoad({ kind: "ready", detail });
    expect(await screen.findByText("Outdoor run")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Match to scheduled workout" })).toBeOnTheScreen();

    mockParams = { activityId: "activity-local-02", origin: "workout" };
    await rendered.rerender(
      <AppearanceProvider>
        <ImportedActivityDetailRoute />
      </AppearanceProvider>,
    );

    await waitFor(() => expect(mockLoadImportedActivityDetail).toHaveBeenLastCalledWith("activity-local-02"));
    expect(screen.getByText("Loading activity details")).toBeOnTheScreen();
    expect(screen.queryByText("Outdoor run")).toBeNull();
    expect(screen.queryByRole("button", { name: "Match to scheduled workout" })).toBeNull();

    await settleNextLoad({ kind: "ready", detail: { ...detail, activityType: "Treadmill run" } });
    expect(await screen.findByText("Treadmill run")).toBeOnTheScreen();
  });

  it("keeps Calendar-origin revision review query-only", async () => {
    mockLoadGarminRevisionReview.mockResolvedValueOnce({
      activityId: "activity-local-01",
      acceptedRevision: 1,
      proposedRevision: 2,
      expectedProposedSha256: "a".repeat(64),
      changedFields: [{ field: "distance", accepted: "5.00 km", proposed: "5.01 km" }],
    });
    await renderRoute();
    await settleNextLoad({ kind: "revision_review" });

    expect(await screen.findByText("Source revision needs review")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Use updated facts" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Keep current facts" })).toBeNull();
    expect(mockResolveGarminRevision).not.toHaveBeenCalled();
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

  it.each(["workout", "library", "progress"] as const)(
    "publishes a validated %s origin without a calendar token",
    (origin) => {
      expect(createImportedActivityDetailHref({
        activityId: "activity-local-01",
        origin,
      })).toEqual({
        pathname: "/garmin/activity/[activityId]",
        params: {
          activityId: "activity-local-01",
          origin,
        },
      });
    },
  );

  it("binds a Progress source link to its accepted local revision", () => {
    expect(createImportedActivityDetailHref({
      activityId: "activity-local-01",
      origin: "progress",
      sourceRevision: 7,
    })).toEqual({
      pathname: "/garmin/activity/[activityId]",
      params: {
        activityId: "activity-local-01",
        origin: "progress",
        sourceRevision: "7",
      },
    });
  });

  it.each([
    { activityId: "987654321", origin: "calendar" },
    { activityId: "activity-local-01", origin: "provider" },
    { activityId: "activity-local-01", origin: "workout", returnToken: "calendar:day:2026-10-04:agenda-1" },
    { activityId: "activity-local-01", origin: "calendar", returnToken: "https://arbitrary.example" },
    { activityId: "activity-local-01", origin: "calendar", returnToken: `calendar:${"x".repeat(120)}` },
  ])("rejects unbounded or provider-facing params %#", (input) => {
    expect(() => createImportedActivityDetailHref(input as never)).toThrow("imported_activity_route_invalid");
  });
});
