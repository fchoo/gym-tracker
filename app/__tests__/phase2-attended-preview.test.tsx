import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { Dimensions } from "react-native";
import {
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import React from "react";

import {
  PHASE2_ATTENDED_PREVIEW_SCENARIOS,
  PHASE2_ATTENDED_PREVIEW_ROUTES,
  phase2ExerciseRecentItems,
  phase2SetCorrectionPreviewView,
  phase2SetMutationPreviewCommands,
  phase2TodayPlanManyView,
  phase2TodayPlanOneView,
  workoutView,
} from "../../src/testing/phase2AttendedPreviewFixtures";
import { AppearanceProvider } from "../../src/ui/theme";

let mockNativeContractsEnabled = true;
let mockParameters: {
  scenario?: string | string[];
  variant?: string | string[];
} = {};
const mockReplace = jest.fn();

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: {
        get nativeContractsEnabled() {
          return mockNativeContractsEnabled;
        },
      },
    },
  },
}));

jest.mock("expo-router", () => ({
  Redirect: ({ href }: { href: string }) => {
    const { View } = require("react-native") as typeof import("react-native");
    return (
      <View
        accessibilityLabel={`Redirect to ${href}`}
        testID="phase2-attended-preview-redirect"
      />
    );
  },
  router: { replace: (...args: unknown[]) => mockReplace(...args) },
  useLocalSearchParams: () => mockParameters,
}));

import Phase2AttendedPreviewRoute from "../__phase2-attended-preview";

async function renderRoute() {
  return render(
    <AppearanceProvider>
      <Phase2AttendedPreviewRoute />
    </AppearanceProvider>,
  );
}

describe("Phase2AttendedPreviewRoute", () => {
  beforeEach(() => {
    mockNativeContractsEnabled = true;
    mockParameters = {};
    Dimensions.set({
      screen: { fontScale: 1, height: 900, scale: 1, width: 599 },
      window: { fontScale: 1, height: 900, scale: 1, width: 599 },
    });
    mockReplace.mockReset();
  });

  it("exposes exactly the canonical reviewed scenarios and routes once", () => {
    expect(PHASE2_ATTENDED_PREVIEW_SCENARIOS).toHaveLength(15);
    expect(new Set(PHASE2_ATTENDED_PREVIEW_SCENARIOS).size).toBe(15);
    expect(PHASE2_ATTENDED_PREVIEW_ROUTES).toHaveLength(22);
    expect(new Set(PHASE2_ATTENDED_PREVIEW_ROUTES.map(({ scenario, variant }) =>
      `${scenario}:${variant ?? "default"}`
    )).size).toBe(PHASE2_ATTENDED_PREVIEW_ROUTES.length);
  });

  it("redirects unless the exact native-contract build flag is true", async () => {
    mockNativeContractsEnabled = false;
    mockParameters = { scenario: "root-nav-loading" };

    await renderRoute();

    expect(screen.getByTestId("phase2-attended-preview-redirect"))
      .toHaveProp("accessibilityLabel", "Redirect to /");
    expect(screen.queryByText("root-nav-loading"))
      .not.toBeOnTheScreen();
  });

  it.each<[string, { scenario?: string | string[]; variant?: string | string[] }]>([
    ["missing", {}],
    ["unknown", { scenario: "not-a-preview" }],
    ["array", { scenario: ["root-nav-loading"] }],
    ["invalid calendar variant", {
      scenario: "calendar-zero-one-many",
      variant: "all",
    }],
    ["missing calendar variant", {
      scenario: "calendar-zero-one-many",
    }],
    ["array calendar variant", {
      scenario: "calendar-zero-one-many",
      variant: ["zero"],
    }],
    ["variant on a scalar scenario", {
      scenario: "root-nav-loading",
      variant: "zero",
    }],
    ["missing Today's plan variant", {
      scenario: "todays-plan-zero-one-many",
    }],
    ["invalid Today's plan variant", {
      scenario: "todays-plan-zero-one-many",
      variant: "four",
    }],
    ["missing set-mutation variant", {
      scenario: "set-mutations-loading",
    }],
    ["invalid set-mutation variant", {
      scenario: "set-mutations-loading",
      variant: "complete",
    }],
    ["array set-mutation variant", {
      scenario: "set-mutations-loading",
      variant: ["add-warmup"],
    }],
  ])("fails closed for a %s scenario parameter", async (_name, parameters) => {
    mockParameters = parameters;

    await renderRoute();

    expect(screen.getByRole("header", { name: "Unknown preview" }))
      .toBeOnTheScreen();
    expect(screen.getByTestId("phase2-attended-preview-unknown"))
      .toBeOnTheScreen();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it.each(PHASE2_ATTENDED_PREVIEW_ROUTES)(
    "gives $scenario:$variant a unique root and non-heading identifier",
    async ({ scenario, variant }) => {
      mockParameters = variant === null ? { scenario } : { scenario, variant };

      const rendered = await renderRoute();

      expect(screen.queryByRole("header", { name: scenario }))
        .not.toBeOnTheScreen();
      expect(screen.getByTestId(`phase2-attended-preview-${scenario}`))
        .toBeOnTheScreen();
      expect(screen.getByTestId([
        "phase2-attended-preview-identifier",
        scenario,
        variant ?? "default",
      ].join("-"), { includeHiddenElements: true })).toBeOnTheScreen();
      await rendered.unmount();
    },
  );

  it("renders the loading alert settings and interactive error recovery states", async () => {
    mockParameters = { scenario: "alert-settings-loading" };
    const rendered = await renderRoute();

    await fireEvent.press(screen.getByRole("button", {
      name: "Appearance and rest-alert settings",
    }));
    expect(screen.getByRole("progressbar", {
      name: "Loading rest alert settings",
    })).toBeOnTheScreen();

    mockParameters = { scenario: "alert-settings-error" };
    await rendered.rerender(
      <AppearanceProvider>
        <Phase2AttendedPreviewRoute />
      </AppearanceProvider>,
    );
    await fireEvent.press(screen.getByRole("button", {
      name: "Appearance and rest-alert settings",
    }));
    await fireEvent.press(screen.getByRole("switch", { name: "Rest sound" }));

    expect(await screen.findByRole("alert"))
      .toHaveTextContent("Rest alert setting was not saved");
  });

  it("dismisses alert settings with Close and Android Back and restores the launcher", async () => {
    mockParameters = { scenario: "alert-settings-error" };
    await renderRoute();
    const launcher = screen.getByRole("button", {
      name: "Appearance and rest-alert settings",
    });

    expect(launcher).toHaveProp("focusable", true);
    await fireEvent.press(launcher);
    await fireEvent.press(screen.getByRole("button", {
      name: "Close rest alerts",
    }));
    expect(screen.queryByRole("header", { name: "Rest alerts" }))
      .not.toBeOnTheScreen();
    expect(screen.getByRole("button", {
      name: "Appearance and rest-alert settings",
    })).toHaveProp("accessibilityState", expect.objectContaining({
      disabled: false,
    }));

    await fireEvent.press(launcher);
    await fireEvent(
      screen.getByTestId("rest-alert-settings-sheet-content"),
      "requestClose",
    );
    expect(screen.queryByRole("header", { name: "Rest alerts" }))
      .not.toBeOnTheScreen();
    expect(screen.getByTestId("alert-settings-focus-restored-2", {
      includeHiddenElements: true,
    })).toBeOnTheScreen();

    await fireEvent.press(launcher);
    await fireEvent.press(screen.getByRole("button", { name: "Appearance" }));
    await fireEvent.press(screen.getByRole("radio", { name: "Dark" }));
    expect(screen.getByRole("radio", { name: "Dark" }))
      .toHaveProp("accessibilityState", expect.objectContaining({
        selected: true,
      }));
  });

  it.each(["zero", "one", "many"] as const)(
    "renders only the %s production calendar surface from the exact variant",
    async (variant) => {
      mockParameters = { scenario: "calendar-zero-one-many", variant };

      await renderRoute();

      const label = variant === "zero"
        ? "Choose date"
        : variant === "one"
          ? "One confirmed date"
          : "Many enabled dates";
      expect(screen.getByRole("button", { name: label })).toBeOnTheScreen();
      expect(screen.queryByRole("button", { name: "Show zero" }))
        .not.toBeOnTheScreen();
      expect(screen.queryByRole("button", { name: "Show one" }))
        .not.toBeOnTheScreen();
      expect(screen.queryByRole("button", { name: "Show many" }))
        .not.toBeOnTheScreen();
      await fireEvent.press(screen.getByRole("button", { name: label }));
      if (variant === "zero") {
        expect(screen.getByRole("button", { name: "Confirm date" }))
          .toHaveProp("accessibilityState", expect.objectContaining({
            disabled: true,
          }));
        expect(screen.getByRole("button", { name: "Select 2028-02-28" }))
          .toHaveProp("accessibilityState", expect.objectContaining({
            disabled: false,
            selected: false,
          }));
      } else if (variant === "one") {
        expect(screen.getByRole("button", { name: "Select 2028-02-29" }))
          .toHaveProp("accessibilityState", expect.objectContaining({
            selected: true,
          }));
      } else {
        expect(screen.getByRole("button", { name: "Select 2028-03-01" }))
          .toHaveProp("accessibilityState", expect.objectContaining({
            disabled: false,
          }));
        expect(screen.getByRole("button", { name: "Select 2028-03-31" }))
          .toHaveProp("accessibilityState", expect.objectContaining({
            disabled: true,
          }));
      }
    },
  );

  it.each<[number, number, number, string]>([
    [839, 420, 1, "root-navigation-bottom"],
    [840, 420, 1, "root-navigation-rail"],
    [839, 420, 2, "root-navigation-bottom"],
    [840, 420, 2, "root-navigation-rail"],
  ])(
    "selects %sdp structure at %sdp landscape height and fontScale %s",
    async (width, height, fontScale, navigationTestId) => {
      Dimensions.set({
        screen: { fontScale, height, scale: 1, width },
        window: { fontScale, height, scale: 1, width },
      });
      mockParameters = { scenario: "root-nav-loading" };

      await renderRoute();

      expect(screen.getByTestId(navigationTestId)).toBeOnTheScreen();
      expect(screen.queryByTestId(
        navigationTestId === "root-navigation-bottom"
          ? "root-navigation-rail"
          : "root-navigation-bottom",
      )).not.toBeOnTheScreen();
      expect(screen.getByRole("tab", { name: "Today" }))
        .toHaveProp("accessibilityState", expect.objectContaining({
          disabled: true,
        }));
    },
  );

  it("renders Library loading, error, and partial truth through in-memory ports", async () => {
    mockParameters = { scenario: "library-plan-card-loading" };
    const rendered = await renderRoute();
    expect(screen.getAllByTestId(/library-skeleton-/u, {
      includeHiddenElements: true,
    })).toHaveLength(6);

    mockParameters = { scenario: "library-plan-card-error" };
    await rendered.rerender(
      <AppearanceProvider>
        <Phase2AttendedPreviewRoute />
      </AppearanceProvider>,
    );
    await fireEvent.changeText(screen.getByLabelText("Search plans"), "travel");
    await fireEvent.press(screen.getByRole("button", {
      name: /Travel strength draft/u,
    }));
    await act(async () => {
      screen.getByTestId("library-screen-scroll")
        .props.refreshControl.props.onRefresh();
    });
    expect(await screen.findByRole("button", {
      name: "Retry Library refresh",
    })).toBeOnTheScreen();
    expect(screen.getByDisplayValue("travel")).toBeOnTheScreen();
    expect(screen.getByTestId("library-plan-card-preview-draft-plan"))
      .toHaveProp("accessibilityState", expect.objectContaining({
        selected: true,
      }));
    await fireEvent.press(screen.getByRole("button", {
      name: "Retry Library refresh",
    }));
    expect(await screen.findByTestId("library-plan-card-preview-draft-plan"))
      .toBeOnTheScreen();
    expect(screen.getByDisplayValue("travel")).toBeOnTheScreen();
    expect(screen.queryByTestId("library-plan-card-preview-active-plan"))
      .not.toBeOnTheScreen();

    mockParameters = { scenario: "library-plan-card-partial" };
    await rendered.rerender(
      <AppearanceProvider>
        <Phase2AttendedPreviewRoute />
      </AppearanceProvider>,
    );
    expect(await screen.findByTestId("library-plan-card-preview-active-plan"))
      .toBeOnTheScreen();
    expect(screen.getByText("One day still needs equipment review."))
      .toBeOnTheScreen();

    mockParameters = { scenario: "library-exercise-card-loading" };
    await rendered.rerender(
      <AppearanceProvider>
        <Phase2AttendedPreviewRoute />
      </AppearanceProvider>,
    );
    expect(await screen.findByTestId("exercise-skeleton-1", {
      includeHiddenElements: true,
    })).toBeOnTheScreen();

    mockParameters = { scenario: "library-exercise-card-error" };
    await rendered.rerender(
      <AppearanceProvider>
        <Phase2AttendedPreviewRoute />
      </AppearanceProvider>,
    );
    expect(await screen.findAllByTestId(
      "library-exercise-card-preview-exercise-available",
    )).toHaveLength(3);
    await fireEvent.changeText(
      screen.getByLabelText("Search exercises"),
      "barbell",
    );
    await fireEvent.press(screen.getByRole("checkbox", { name: "Filters" }));
    await fireEvent.press(screen.getByRole("checkbox", {
      name: "Origin: Bundled",
    }));
    await fireEvent.press(screen.getByRole("button", { name: "Show results" }));
    expect(await screen.findByRole("button", {
      name: "Load more exercises",
    })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", {
      name: "Load more exercises",
    }));
    expect(await screen.findByRole("button", {
      name: "Retry loading more exercises",
    })).toBeOnTheScreen();
    expect(screen.getByDisplayValue("barbell")).toBeOnTheScreen();
    expect(screen.getByRole("checkbox", {
      name: "Origin: Bundled selected",
    }))
      .toBeOnTheScreen();
    expect(screen.getByTestId(
      "library-exercise-card-preview-exercise-available",
    )).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", {
      name: "Retry loading more exercises",
    }));
    await waitFor(() => {
      expect(screen.queryByRole("button", {
        name: "Retry loading more exercises",
      })).not.toBeOnTheScreen();
    });

    mockParameters = { scenario: "library-exercise-card-partial" };
    await rendered.rerender(
      <AppearanceProvider>
        <Phase2AttendedPreviewRoute />
      </AppearanceProvider>,
    );
    expect(await screen.findAllByTestId(
      "library-exercise-card-preview-exercise-available",
    )).toHaveLength(3);
    expect(screen.queryByTestId(
      "library-exercise-card-preview-exercise-unavailable",
    )).not.toBeOnTheScreen();
    expect(screen.queryByTestId(
      "library-exercise-card-preview-exercise-hidden",
    )).not.toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("checkbox", { name: "Filters" }));
    for (const label of [
      "Visibility: Unavailable",
      "Visibility: Hidden",
      "Visibility: Archived",
    ]) {
      await fireEvent.press(screen.getByRole("checkbox", { name: label }));
    }
    await fireEvent.press(screen.getByRole("button", { name: "Show results" }));
    expect(await screen.findByTestId(
      "library-exercise-card-preview-exercise-unavailable",
    )).toBeOnTheScreen();
    expect(screen.getByText("Unavailable")).toBeOnTheScreen();
    expect(screen.getByText("Archived · Hidden")).toBeOnTheScreen();
    expect(screen.getByText("Matched alias: Single-arm cable row"))
      .toBeOnTheScreen();
    expect(screen.queryByText(
      /kinetic-place\.exercises-db.*revision preview-r1.*MIT/u,
    )).not.toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", {
      name: "Load more exercises",
    }));
    expect(await screen.findByRole("button", {
      name: "Retry loading more exercises",
    })).toBeOnTheScreen();
    expect(screen.getByTestId(
      "library-exercise-card-preview-exercise-unavailable",
    )).toBeOnTheScreen();
    expect(screen.getByTestId(
      "library-exercise-card-preview-exercise-hidden",
    )).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", {
      name: "Retry loading more exercises",
    }));
    await waitFor(() => {
      expect(screen.queryByRole("button", {
        name: "Retry loading more exercises",
      })).not.toBeOnTheScreen();
    });
  });

  it.each<[
    "add-warmup" | "copy-warmup" | "add-working",
    "addWarmup" | "copyPreviousWarmup" | "addWorkingSet",
    "Add warm-up" | "Copy previous warm-up" | "Add working set",
  ]>([
    ["add-warmup", "addWarmup", "Add warm-up"],
    ["copy-warmup", "copyPreviousWarmup", "Copy previous warm-up"],
    ["add-working", "addWorkingSet", "Add working set"],
  ])(
    "keeps %s pending, busy, and duplicate-safe without changing cardinality",
    async (variant, commandName, actionName) => {
      mockParameters = { scenario: "set-mutations-loading", variant };
      const command = jest.spyOn(phase2SetMutationPreviewCommands, commandName);

      await renderRoute();
      const beforeRows = screen.getAllByTestId(/(?:warmup-W|working-set-).*?-row/u)
        .length;
      expect(screen.getByRole("header", { name: "Back Squat" }))
        .toBeOnTheScreen();
      const action = screen.getByRole("button", { name: actionName });
      await fireEvent.press(action);
      await fireEvent.press(action);

      expect(command).toHaveBeenCalledTimes(1);
      expect(action).toHaveProp("accessibilityState", expect.objectContaining({
        busy: true,
        disabled: true,
      }));
      expect(screen.getAllByTestId(/(?:warmup-W|working-set-).*?-row/u))
        .toHaveLength(beforeRows);
      command.mockRestore();
    },
  );

  it("uses a completed set and keeps correction pending and duplicate-safe", async () => {
    mockParameters = { scenario: "set-mutations-loading", variant: "correction" };
    const correction = jest.spyOn(
      phase2SetMutationPreviewCommands,
      "reviseCompletedSet",
    );

    await renderRoute();
    expect(phase2SetCorrectionPreviewView.progress.completedWorkingSets)
      .toBeGreaterThan(0);
    const beforeRows = screen.getAllByTestId(/(?:warmup-W|working-set-).*?-row/u)
      .length;
    expect(screen.getByRole("header", { name: "Back Squat" }))
      .toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", {
      name: "Edit completed set 1",
    }));
    const save = screen.getByRole("button", {
      name: "Save correction for completed set 1",
    });
    await fireEvent.press(save);
    await fireEvent.press(save);

    expect(correction).toHaveBeenCalledTimes(1);
    expect(save).toHaveProp("accessibilityState", expect.objectContaining({
      busy: true,
      disabled: true,
    }));
    expect(screen.getAllByTestId(/(?:warmup-W|working-set-).*?-row/u))
      .toHaveLength(beforeRows);
    correction.mockRestore();
  });

  it.each<["zero" | "one" | "many", number]>([
    ["zero", 0],
    ["one", 1],
    ["many", 4],
  ])(
    "renders only the %s production Today's-plan surface",
    async (variant, count) => {
      mockParameters = { scenario: "todays-plan-zero-one-many", variant };

      await renderRoute();

      if (count === 0) {
        expect(screen.getByText("No exercises in today's plan"))
          .toBeOnTheScreen();
      } else {
        expect(screen.getAllByTestId(/today-plan-exercise-preview-exercise-/u))
          .toHaveLength(count);
        if (variant === "many") {
          for (const state of ["Current", "Completed", "Planned", "Skipped"]) {
            expect(screen.getByText(state)).toBeOnTheScreen();
          }
        }
      }
      expect(screen.queryByRole("button", { name: /Show .* exercises/u }))
        .not.toBeOnTheScreen();
    },
  );

  it("derives representative many-plan status and progress from every exercise", () => {
    expect(() => workoutView([])).toThrow(
      "phase2_preview_workout_requires_exercise",
    );
    expect(phase2TodayPlanOneView.progress).toEqual({
      completedWorkingSets: 0,
      totalWorkingSets: 2,
    });
    expect(phase2TodayPlanManyView.progress).toEqual({
      completedWorkingSets: 2,
      totalWorkingSets: 8,
    });
    expect(phase2TodayPlanManyView.exercises.map((exercise) => ({
      sets: exercise.workingSets.length,
      status: exercise.status,
    }))).toEqual([
      { sets: 2, status: "active" },
      { sets: 2, status: "completed" },
      { sets: 2, status: "planned" },
      { sets: 2, status: "skipped" },
    ]);
  });

  it("makes Today's-plan Return and Review actions navigate in memory", async () => {
    mockParameters = { scenario: "todays-plan-zero-one-many", variant: "many" };
    const manyRendered = await renderRoute();
    const beforeProgress = phase2TodayPlanManyView.progress;

    await fireEvent.press(screen.getByRole("button", {
      name: /2\. Bench Press\. Completed\. Open for review/u,
    }));
    expect(screen.getByText("Reviewing another exercise"))
      .toBeOnTheScreen();
    expect(screen.getByRole("header", { name: "Bench Press" }))
      .toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", {
      name: "Return to current exercise",
    }));
    expect(screen.getByRole("header", { name: "Back Squat" }))
      .toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Go back" }));
    expect(screen.getAllByTestId(/today-plan-exercise-preview-exercise-/u))
      .toHaveLength(4);
    await manyRendered.unmount();

    mockParameters = { scenario: "todays-plan-zero-one-many", variant: "zero" };
    const rendered = await renderRoute();
    await fireEvent.press(screen.getByRole("button", {
      name: "Return to active workout",
    }));
    expect(screen.getByRole("header", { name: "Empty workout" }))
      .toBeOnTheScreen();
    expect(screen.getByText("Empty workout in progress")).toBeOnTheScreen();
    expect(screen.queryByRole("header", { name: "Back Squat" }))
      .not.toBeOnTheScreen();
    expect(screen.queryByTestId(/(?:warmup-W|working-set-).*?-row/u))
      .not.toBeOnTheScreen();
    expect(phase2TodayPlanManyView.progress).toBe(beforeProgress);
    await rendered.unmount();

    mockParameters = { scenario: "todays-plan-zero-one-many", variant: "one" };
    const oneRendered = await renderRoute();
    await fireEvent.press(screen.getByRole("button", {
      name: /1\. Back Squat\. Current\. Open for review/u,
    }));
    expect(screen.getByRole("header", { name: "Back Squat" }))
      .toBeOnTheScreen();
    expect(screen.getAllByTestId(/working-set-.*-row/u)).toHaveLength(2);
    await oneRendered.unmount();
  });

  it("makes the dedicated empty-plan Return action navigate in memory", async () => {
    mockParameters = { scenario: "todays-plan-empty" };
    await renderRoute();

    await fireEvent.press(screen.getByRole("button", {
      name: "Return to active workout",
    }));

    expect(screen.getByRole("header", { name: "Empty workout" }))
      .toBeOnTheScreen();
    expect(screen.getByText("Empty workout in progress")).toBeOnTheScreen();
    expect(screen.queryByRole("header", { name: "Back Squat" }))
      .not.toBeOnTheScreen();
    expect(screen.queryByTestId(/(?:warmup-W|working-set-).*?-row/u))
      .not.toBeOnTheScreen();
  });

  it("keeps Recent limited to eligible visible exercise fixtures", () => {
    expect(phase2ExerciseRecentItems).toHaveLength(1);
    expect(phase2ExerciseRecentItems.every((item) =>
      item.recentAtMs !== null
      && item.availability === "available"
      && !item.hidden
      && !item.archived
    )).toBe(true);
  });

  it("remounts scenario-owned state when navigation changes", async () => {
    mockParameters = { scenario: "todays-plan-zero-one-many", variant: "many" };
    const rendered = await renderRoute();
    expect(screen.getAllByTestId(/today-plan-exercise-preview-exercise-/u))
      .toHaveLength(4);

    mockParameters = { scenario: "global-card-loading" };
    await rendered.rerender(
      <AppearanceProvider>
        <Phase2AttendedPreviewRoute />
      </AppearanceProvider>,
    );
    mockParameters = { scenario: "todays-plan-zero-one-many", variant: "one" };
    await rendered.rerender(
      <AppearanceProvider>
        <Phase2AttendedPreviewRoute />
      </AppearanceProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("today-plan-exercise-preview-exercise-1"))
        .toBeOnTheScreen();
    });
  });
});
