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
import {
  Appearance,
} from "react-native";

import {
  createLibrarySectionPreferencePort,
} from "../../bootstrap/workoutAppRuntime";
import type {
  ContentUpdateResult,
} from "../../domains/content/catalog";
import type {
  SqliteKernel,
  SqliteTransactionExecutor,
} from "../../platform/sqlite";
import {
  LibraryScreen,
  type LibraryBrowseSnapshot,
  type LibraryExerciseItem,
  type LibrarySectionPreference,
} from "../screens/LibraryScreen";
import {
  AppearanceProvider,
  createMemoryAppearanceStore,
  themes,
} from "../theme";

const starterPlans = [
  {
    id: "full-body-foundation",
    name: "Full Body Foundation",
    daysPerWeek: 2,
    goal: "General strength, basic hypertrophy, and consistency",
    experience: "Beginner / returning",
    equipment: ["Barbell", "Bench", "Dumbbell"],
    estimateMinutes: 48,
  },
  {
    id: "upper-lower",
    name: "Upper / Lower",
    daysPerWeek: 4,
    goal: "Balanced strength and hypertrophy",
    experience: "Intermediate",
    equipment: ["Barbell", "Cable", "Machine"],
    estimateMinutes: 55,
  },
] as const;

function exercise(
  overrides: Partial<LibraryExerciseItem> = {},
): LibraryExerciseItem {
  return {
    exerciseId: "exercise-1",
    canonicalName: "Barbell Bench Press",
    matchedAlias: null,
    exerciseType: "strength",
    origin: "bundled",
    originLabel: "Built-in",
    availability: "available",
    favorite: false,
    hidden: false,
    archived: false,
    recentAtMs: null,
    muscles: ["chest", "triceps"],
    equipment: ["barbell", "bench"],
    source: {
      namespace: "kinetic-place.exercises-db",
      revision: "1783421f",
      license: "MIT",
      attribution: "Copyright (c) 2026 Kinetic.place",
    },
    ...overrides,
  };
}

function snapshot(
  section: LibrarySectionPreference["section"] = "plans",
): LibraryBrowseSnapshot {
  return {
    sectionPreference: {
      section,
      revision: section === "plans" ? 0 : 1,
    },
    plans: {
      active: null,
      owned: [],
      starters: starterPlans,
    },
  };
}

function contentUpdate(
  overrides: Partial<ContentUpdateResult> = {},
): ContentUpdateResult {
  return {
    outcome: "committed",
    revision: 2,
    packSha256: "a".repeat(64),
    added: 3,
    updated: 2,
    newlyUnavailable: 1,
    invalidationScopes: [{ scope: "exercise-library" }],
    ...overrides,
  };
}

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<Value>((next, fail) => {
    resolve = next;
    reject = fail;
  });
  return { promise, reject, resolve };
}

async function renderLibrary(
  overrides: Partial<React.ComponentProps<typeof LibraryScreen>> = {},
  appearanceStore = createMemoryAppearanceStore(),
) {
  const props: React.ComponentProps<typeof LibraryScreen> = {
    loadLibrary: jest.fn(async () => snapshot()),
    listRecentExercises: jest.fn(async () => []),
    onCreateExercise: jest.fn(),
    onCreatePlan: jest.fn(),
    onOpenExercise: jest.fn(),
    onOpenPlan: jest.fn(),
    onReviewChanges: jest.fn(),
    searchExercises: jest.fn(async () => ({
      state: "page" as const,
      items: [],
      nextCursor: null,
    })),
    setExerciseFavorite: jest.fn(async () => ({
      exerciseId: "exercise-1",
      favorite: true,
      preferenceRevision: 1,
    })),
    setSection: jest.fn(async (section: LibrarySectionPreference["section"]) => ({
      section,
      revision: 1,
    })),
    ...overrides,
  };

  return {
    props,
    rendered: await render(
      <AppearanceProvider store={appearanceStore}>
        <LibraryScreen {...props} />
      </AppearanceProvider>,
    ),
  };
}

describe("LibraryScreen section state", () => {
  it("groups active, owned, and starter plans into flat high-contrast content cards", async () => {
    const onOpenPlan = jest.fn();
    const onOpenStarter = jest.fn();
    const onOpenTemplateUpdate = jest.fn();
    const active = {
      id: "active-plan",
      name: "Active Plan With A Deliberately Long Name That Must Reflow At Large Text",
      daysPerWeek: 3,
      status: "Active" as const,
      scheduleSummary: "Weekday schedule",
      templateUpdateTemplateId: "full-body-foundation",
    };
    const owned = {
      id: "owned-plan",
      name: "Owned Plan",
      daysPerWeek: 2,
      status: "Draft" as const,
      scheduleSummary: "Not scheduled",
    };
    const starter = {
      ...starterPlans[0],
      id: "starter-plan",
    };

    await renderLibrary({
      loadLibrary: jest.fn(async () => ({
        ...snapshot(),
        plans: { active, owned: [owned], starters: [starter] },
      })),
      onOpenPlan,
      onOpenStarter,
      onOpenTemplateUpdate,
    });

    for (const planId of ["active-plan", "owned-plan", "starter-plan"]) {
      expect(await screen.findByTestId("library-plan-card-" + planId))
        .toHaveStyle({
          backgroundColor: themes.light.contentCard,
          borderColor: planId === "active-plan"
            ? themes.light.contentCardStatusCompleted
            : themes.light.contentCardBorder,
          borderWidth: 0.5,
          minHeight: 48,
        });
    }
    const activePlan = screen.getByRole("button", {
      name: /Active Plan With A Deliberately Long Name.*Active/u,
    });
    expect(activePlan).toHaveStyle({ minHeight: 48 });
    await fireEvent.press(activePlan);
    expect(onOpenPlan).toHaveBeenCalledWith("active-plan");

    const starterPlan = screen.getByRole("button", {
      name: /Full Body Foundation.*General strength/u,
    });
    await fireEvent.press(starterPlan);
    expect(onOpenStarter).toHaveBeenCalledWith("starter-plan");

    const update = screen.getByRole("button", {
      name: "Template update available for Active Plan With A Deliberately Long Name That Must Reflow At Large Text",
    });
    expect(update).toHaveStyle({ minHeight: 48 });
    await fireEvent.press(update);
    expect(onOpenTemplateUpdate).toHaveBeenCalledWith({
      ownedPlanId: "active-plan",
      templateId: "full-body-foundation",
    });
  });

  it("opens Plans on first use with exact controls and stable section order", async () => {
    const { rendered } = await renderLibrary();

    expect(await screen.findByRole("header", { name: "Library" }))
      .toBeOnTheScreen();
    expect(
      screen.getByRole("tab", { name: "Plans" }).props.accessibilityState,
    ).toMatchObject({ selected: true });
    expect(screen.getByRole("tab", { name: "Exercises" }))
      .toHaveProp("accessibilityState", expect.objectContaining({
        selected: false,
      }));
    expect(screen.getByLabelText("Search plans")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Create my own" }))
      .toBeOnTheScreen();

    const tree = rendered.toJSON();
    const serialized = JSON.stringify(tree);
    expect(serialized.indexOf("Active Plan"))
      .toBeLessThan(serialized.indexOf("My Plans"));
    expect(serialized.indexOf("My Plans"))
      .toBeLessThan(serialized.indexOf("Starter Plans"));
    expect(screen.getByText("Choose a starter plan")).toBeOnTheScreen();
    expect(screen.getByText("No personal plans yet")).toBeOnTheScreen();
    expect(screen.getByText("Full Body Foundation")).toBeOnTheScreen();
  });

  it("waits for the committed section preference before exposing Exercises", async () => {
    const write = deferred<LibrarySectionPreference>();
    const setSection = jest.fn(() => write.promise);
    await renderLibrary({ setSection });

    await screen.findByLabelText("Search plans");
    await fireEvent.press(screen.getByRole("tab", { name: "Exercises" }));

    expect(setSection).toHaveBeenCalledWith("exercises", 0);
    expect(
      screen.getByRole("tab", { name: "Plans" }).props.accessibilityState,
    ).toMatchObject({ selected: true });
    expect(screen.getByRole("tab", { name: "Exercises" }))
      .toHaveProp("accessibilityState", expect.objectContaining({
        busy: true,
        selected: false,
      }));

    write.resolve({ section: "exercises", revision: 1 });

    expect(await screen.findByLabelText("Search exercises"))
      .toBeOnTheScreen();
    expect(screen.getByRole("tab", { name: "Exercises" }))
      .toHaveProp("accessibilityState", expect.objectContaining({
        selected: true,
      }));
    expect(screen.getByRole("button", { name: "Create custom exercise" }))
      .toBeOnTheScreen();
  });

  it("restores each section in process and resets transients after restart", async () => {
    const loadLibrary = jest.fn(async () => snapshot("exercises"));
    const selectedExercise = exercise({
      canonicalName: "Selected Press",
    });
    const openExercise = jest.fn();
    const { props, rendered } = await renderLibrary({
      loadLibrary,
      onOpenExercise: openExercise,
      searchExercises: jest.fn(async () => ({
        state: "page" as const,
        items: [selectedExercise],
        nextCursor: null,
      })),
      setSection: jest.fn(async (
        section: LibrarySectionPreference["section"],
        revision: number,
      ) => ({
        section,
        revision: revision + 1,
      })),
    });

    const exerciseSearch = await screen.findByLabelText("Search exercises");
    const exerciseRow = await screen.findByRole("button", {
      name: /Selected Press.*Built-in/u,
    });
    await fireEvent.press(exerciseRow);
    expect(openExercise).toHaveBeenCalledWith("exercise-1");
    await fireEvent.scroll(screen.getByTestId("library-screen-scroll"), {
      nativeEvent: { contentOffset: { x: 0, y: 240 } },
    });
    expect(screen.getByTestId("library-screen-scroll"))
      .not.toHaveProp("contentOffset");
    await fireEvent.changeText(exerciseSearch, "press");
    await fireEvent.press(screen.getByRole("button", { name: "Filter" }));
    await fireEvent.press(screen.getByRole("checkbox", {
      name: "Equipment: Barbell",
    }));
    await fireEvent.press(screen.getByRole("button", { name: "Show results" }));
    await fireEvent.press(screen.getByRole("tab", { name: "Plans" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Search plans")).toBeOnTheScreen()
    );
    await fireEvent.changeText(screen.getByLabelText("Search plans"), "upper");
    await fireEvent.press(screen.getByRole("tab", { name: "Exercises" }));

    expect(await screen.findByDisplayValue("press")).toBeOnTheScreen();
    expect(screen.getByRole("button", {
      name: "Remove Equipment: Barbell",
    })).toBeOnTheScreen();
    expect(
      (await screen.findByRole("button", {
        name: /Selected Press.*Built-in/u,
      })).props.accessibilityState,
    ).toMatchObject({ selected: true });
    expect(screen.getByTestId("library-exercise-card-exercise-1"))
      .toHaveStyle({
        backgroundColor: themes.light.contentCardSelected,
        borderColor: themes.light.contentCardBorder,
      });
    expect(screen.getByTestId("library-screen-scroll"))
      .not.toHaveProp("contentOffset");

    await rendered.unmount();
    await render(
      <AppearanceProvider>
        <LibraryScreen {...props} />
      </AppearanceProvider>,
    );

    expect(await screen.findByLabelText("Search exercises"))
      .toHaveProp("value", "");
    expect(screen.queryByRole("button", {
      name: "Remove Equipment: Barbell",
    })).not.toBeOnTheScreen();
    expect(screen.getByRole("tab", { name: "Exercises" }))
      .toHaveProp("accessibilityState", expect.objectContaining({
        selected: true,
      }));
    expect(loadLibrary).toHaveBeenCalledTimes(2);
  });
});

describe("Library section preference authority", () => {
  function preferenceKernel(commitGate?: Promise<void>): SqliteKernel {
    let row: Readonly<{
      value_version: number;
      value_json: string;
      revision: number;
    }> | undefined;
    let writeQueue = Promise.resolve();
    const transaction: SqliteTransactionExecutor = {
      async execute(sql, parameters = []) {
        if (sql.includes("INSERT INTO app_settings")) {
          row = {
            value_version: 1,
            value_json: String(parameters[1]),
            revision: Number(parameters[2]),
          };
          return { changes: 1, lastInsertRowId: 0 };
        }
        if (sql.includes("UPDATE app_settings")) {
          const expectedRevision = Number(parameters[4]);
          if (row?.revision !== expectedRevision) {
            return { changes: 0, lastInsertRowId: 0 };
          }
          row = {
            value_version: 1,
            value_json: String(parameters[0]),
            revision: Number(parameters[1]),
          };
          return { changes: 1, lastInsertRowId: 0 };
        }
        throw new Error("unexpected_preference_execute");
      },
      async queryAll<Row>() {
        return (row === undefined ? [] : [row]) as unknown as readonly Row[];
      },
    };
    return {
      async write<Result>(
        command: (
          transaction: SqliteTransactionExecutor,
        ) => Promise<Result>,
      ) {
        const result = writeQueue.then(async () => {
          const value = await command(transaction);
          await commitGate;
          return value;
        });
        writeQueue = result.then(() => undefined, () => undefined);
        return result;
      },
      async queryAll<Row>() {
        return (row === undefined ? [] : [row]) as unknown as readonly Row[];
      },
      async connectionConfiguration() {
        throw new Error("not_used");
      },
      async close() {
        return undefined;
      },
    };
  }

  it("defaults to Plans and replays the same committed value idempotently", async () => {
    const port = createLibrarySectionPreferencePort(
      preferenceKernel(),
      () => 1_787_000_000_000,
    );

    expect(await port.read()).toEqual({ section: "plans", revision: 0 });
    expect(await port.write("exercises", 0)).toEqual({
      section: "exercises",
      revision: 1,
    });
    expect(await port.write("exercises", 0)).toEqual({
      section: "exercises",
      revision: 1,
    });
    expect(await port.read()).toEqual({
      section: "exercises",
      revision: 1,
    });
  });

  it("acknowledges after commit and rejects a different stale concurrent write", async () => {
    const commit = deferred<void>();
    const port = createLibrarySectionPreferencePort(
      preferenceKernel(commit.promise),
      () => 1_787_000_000_000,
    );
    let acknowledged = false;
    const first = port.write("exercises", 0).then((result) => {
      acknowledged = true;
      return result;
    });
    const stale = port.write("plans", 0);

    await Promise.resolve();
    expect(acknowledged).toBe(false);
    commit.resolve();

    await expect(first).resolves.toEqual({
      section: "exercises",
      revision: 1,
    });
    await expect(stale).rejects.toThrow(
      "library_section_preference_conflict",
    );
  });
});

describe("LibraryScreen exercise browse", () => {
  it("renders Favorites, Recent, and All Exercises with public row semantics", async () => {
    const favorite = exercise({
      favorite: true,
      canonicalName: "Favorite Bench Press",
    });
    const recent = exercise({
      exerciseId: "exercise-recent",
      canonicalName: "Recent Cable Row",
      recentAtMs: 1_787_000_000_000,
      equipment: ["cable"],
      muscles: ["back"],
    });
    const alias = exercise({
      exerciseId: "exercise-alias",
      canonicalName: "Overhead Press",
      matchedAlias: {
        id: 4,
        displayText: "Military press",
        label: "Matched alias: Military press",
      },
      source: {
        namespace: "kinetic-place.exercises-db",
        revision: "1783421f",
        license: "MIT",
        attribution:
          "Copyright (c) 2026 Kinetic.place with a deliberately long attribution that must wrap without clipping.",
      },
    });
    const archived = exercise({
      archived: true,
      canonicalName: "Archived Hidden Custom Press",
      exerciseId: "exercise-archived",
      hidden: true,
      origin: "custom",
      originLabel: "Custom",
      source: null,
    });
    await renderLibrary({
      loadLibrary: jest.fn(async () => snapshot("exercises")),
      listRecentExercises: jest.fn(async () => [recent]),
      searchExercises: jest.fn(async () => ({
        state: "page" as const,
        items: [favorite, recent, alias, archived],
        nextCursor: null,
      })),
    });

    expect(await screen.findByRole("header", { name: "Favorites" }))
      .toBeOnTheScreen();
    expect(screen.getByRole("header", { name: "Recent" })).toBeOnTheScreen();
    expect(screen.getByRole("header", { name: "All Exercises" }))
      .toBeOnTheScreen();
    for (const exerciseId of [
      "exercise-1",
      "exercise-recent",
      "exercise-alias",
      "exercise-archived",
    ]) {
      for (const card of screen.getAllByTestId(
        "library-exercise-card-" + exerciseId,
      )) {
        expect(card).toHaveStyle({
          backgroundColor: themes.light.contentCard,
          borderColor: exerciseId === "exercise-archived"
            ? themes.light.timerAttention
            : themes.light.contentCardBorder,
        });
      }
    }
    expect(screen.getAllByRole("button", {
      name: /Favorite Bench Press.*Built-in.*Favorite/u,
    })).toHaveLength(2);
    expect(screen.getAllByRole("button", {
      name: "Remove Favorite Bench Press from favorites",
    })).toHaveLength(2);
    expect(screen.getByText("Matched alias: Military press"))
      .toBeOnTheScreen();
    expect(screen.getByText("Archived · Hidden")).toBeOnTheScreen();
    expect(screen.getByRole("button", {
      name: /Archived Hidden Custom Press.*Custom.*Archived.*Hidden/u,
    })).toBeOnTheScreen();
    expect(screen.getAllByText(/Copyright \(c\) 2026 Kinetic\.place/u).length)
      .toBeGreaterThan(0);
  });

  it("uses semantic exercise-card colors for System, Light, and Dark appearances", async () => {
    const appearance = jest.spyOn(Appearance, "getColorScheme")
      .mockReturnValue("dark");
    const cases = [
      {
        colors: themes.dark,
        persistedPreference: null,
      },
      {
        colors: themes.light,
        persistedPreference: "Light" as const,
      },
      {
        colors: themes.dark,
        persistedPreference: "Dark" as const,
      },
    ];

    for (const { colors, persistedPreference } of cases) {
      const { rendered } = await renderLibrary(
        {
          loadLibrary: jest.fn(async () => snapshot("exercises")),
          searchExercises: jest.fn(async () => ({
            state: "page" as const,
            items: [exercise()],
            nextCursor: null,
          })),
        },
        createMemoryAppearanceStore(persistedPreference),
      );

      expect(await screen.findByTestId("library-exercise-card-exercise-1"))
        .toHaveStyle({
          backgroundColor: colors.contentCard,
          borderColor: colors.contentCardBorder,
        });
      await rendered.unmount();
    }

    appearance.mockRestore();
  });

  it("keeps ranked rows and filters when loading the next page fails", async () => {
    const firstPage = Array.from({ length: 30 }, (_, index) =>
      exercise({
        exerciseId: `exercise-${index + 1}`,
        canonicalName: `Press ${String(index + 1).padStart(2, "0")}`,
      })
    );
    const searchExercises = jest.fn(async (input: {
      cursor?: string | null;
    }) => {
      if (input.cursor === "next-30") {
        throw new Error("page_failed");
      }
      return {
        state: "page" as const,
        items: firstPage,
        nextCursor: "next-30",
      };
    });
    await renderLibrary({
      loadLibrary: jest.fn(async () => snapshot("exercises")),
      searchExercises,
    });

    const search = await screen.findByLabelText("Search exercises");
    await fireEvent.changeText(search, "press—and (hold): \"OR\"");
    await waitFor(() => expect(screen.getByText("Press 01")).toBeOnTheScreen());
    expect(screen.getByTestId("library-exercise-card-exercise-1"))
      .toHaveStyle({ backgroundColor: themes.light.contentCard });
    await fireEvent.press(screen.getByRole("button", {
      name: "Load more exercises",
    }));

    expect(await screen.findByText(
      "More exercises could not be loaded. Your current results and filters are unchanged.",
    )).toBeOnTheScreen();
    expect(screen.getByText("Press 01")).toBeOnTheScreen();
    expect(screen.getByDisplayValue("press—and (hold): \"OR\""))
      .toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Retry loading more exercises" }))
      .toBeOnTheScreen();
  });

  it("ignores a stale page success after the exercise query changes", async () => {
    const stalePage = deferred<Readonly<{
      state: "page";
      items: readonly LibraryExerciseItem[];
      nextCursor: null;
    }>>();
    const searchExercises = jest.fn(async (input: {
      query: string;
      filters?: Readonly<{ favorite?: readonly boolean[] }>;
      cursor?: string | null;
    }) => {
      if (input.cursor === "old-next") {
        return stalePage.promise;
      }
      if (input.filters?.favorite?.includes(true)) {
        return { state: "page" as const, items: [], nextCursor: null };
      }
      return {
        state: "page" as const,
        items: [exercise({
          exerciseId: input.query === "new" ? "new-result" : "old-result",
          canonicalName: input.query === "new" ? "New result" : "Old result",
        })],
        nextCursor: input.query === "new" ? null : "old-next",
      };
    });
    await renderLibrary({
      loadLibrary: jest.fn(async () => snapshot("exercises")),
      searchExercises,
    });

    expect(await screen.findByText("Old result")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", {
      name: "Load more exercises",
    }));
    await fireEvent.changeText(screen.getByLabelText("Search exercises"), "new");
    expect(await screen.findByText("New result")).toBeOnTheScreen();

    await act(async () => {
      stalePage.resolve({
        state: "page",
        items: [exercise({
          exerciseId: "stale-page-result",
          canonicalName: "Stale page result",
        })],
        nextCursor: null,
      });
      await stalePage.promise;
    });
    expect(screen.queryByText("Stale page result")).not.toBeOnTheScreen();
    expect(screen.getByText("New result")).toBeOnTheScreen();
  });

  it("ignores a stale page failure after exercise filters change", async () => {
    const stalePage = deferred<Readonly<{
      state: "page";
      items: readonly LibraryExerciseItem[];
      nextCursor: null;
    }>>();
    const searchExercises = jest.fn(async (input: {
      query: string;
      filters?: Readonly<{
        favorite?: readonly boolean[];
        visibility?: readonly string[];
      }>;
      cursor?: string | null;
    }) => {
      if (input.cursor === "old-next") {
        return stalePage.promise;
      }
      if (input.filters?.favorite?.includes(true)) {
        return { state: "page" as const, items: [], nextCursor: null };
      }
      return {
        state: "page" as const,
        items: [exercise({
          availability: input.filters?.visibility?.includes("unavailable")
            ? "unavailable"
            : "available",
          canonicalName: input.filters?.visibility?.includes("unavailable")
            ? "Filtered result"
            : "Old result",
        })],
        nextCursor: input.filters?.visibility?.includes("unavailable")
          ? null
          : "old-next",
      };
    });
    await renderLibrary({
      loadLibrary: jest.fn(async () => ({
        ...snapshot("exercises"),
        exerciseFilterOptions: {
          exerciseTypes: [],
          muscles: [],
          equipment: [],
        },
      })),
      searchExercises,
    });

    expect(await screen.findByText("Old result")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", {
      name: "Load more exercises",
    }));
    await fireEvent.press(screen.getByRole("button", { name: "Filter" }));
    await fireEvent.press(screen.getByRole("checkbox", {
      name: "Visibility: Unavailable",
    }));
    await fireEvent.press(screen.getByRole("button", { name: "Show results" }));
    expect(await screen.findByText("Filtered result")).toBeOnTheScreen();

    await act(async () => {
      stalePage.reject(new Error("stale_page_failed"));
      await stalePage.promise.catch(() => undefined);
    });
    expect(screen.queryByText(/More exercises could not be loaded/u))
      .not.toBeOnTheScreen();
    expect(screen.getByText("Filtered result")).toBeOnTheScreen();
  });

  it("acknowledges Favorite only after the committed preference result", async () => {
    const write = deferred<Readonly<{
      exerciseId: string;
      favorite: boolean;
      preferenceRevision: number;
    }>>();
    await renderLibrary({
      loadLibrary: jest.fn(async () => snapshot("exercises")),
      searchExercises: jest.fn(async () => ({
        state: "page" as const,
        items: [exercise()],
        nextCursor: null,
      })),
      setExerciseFavorite: jest.fn(() => write.promise),
    });

    const add = await screen.findByRole("button", {
      name: "Add Barbell Bench Press to favorites",
    });
    await fireEvent.press(add);
    expect(screen.getByRole("button", {
      name: "Add Barbell Bench Press to favorites",
    })).toBeDisabled();
    expect(screen.queryByRole("button", {
      name: "Remove Barbell Bench Press from favorites",
    })).not.toBeOnTheScreen();

    write.resolve({
      exerciseId: "exercise-1",
      favorite: true,
      preferenceRevision: 1,
    });
    expect(await screen.findAllByRole("button", {
      name: "Remove Barbell Bench Press from favorites",
    })).toHaveLength(2);
  });

  it("supports keyboard activation, clear search, filter overflow, and focus restoration", async () => {
    const setSection = jest.fn(async (
      section: LibrarySectionPreference["section"],
      revision: number,
    ) => ({ section, revision: revision + 1 }));
    await renderLibrary({
      loadLibrary: jest.fn(async () => ({
        ...snapshot(),
        exerciseFilterOptions: {
          exerciseTypes: ["strength", "cardio"],
          muscles: ["chest", "back"],
          equipment: ["barbell", "cable"],
        },
      })),
      setSection,
    });

    const exercises = await screen.findByRole("tab", { name: "Exercises" });
    await fireEvent(exercises, "keyDown", {
      nativeEvent: { key: "Enter" },
    });
    expect(setSection).toHaveBeenCalledWith("exercises", 0);
    const search = await screen.findByLabelText("Search exercises");
    await fireEvent.changeText(search, "press");
    await fireEvent.press(screen.getByRole("button", {
      name: "Clear search exercises",
    }));
    expect(screen.getByLabelText("Search exercises")).toHaveProp("value", "");

    const filter = screen.getByRole("button", { name: "Filter" });
    await fireEvent(filter, "focus");
    expect(filter).toHaveStyle({ outlineWidth: 2 });
    await fireEvent(filter, "keyDown", {
      nativeEvent: { key: " " },
    });
    expect(screen.getByTestId("library-filter-sheet")).toHaveStyle({
      maxHeight: "90%",
    });
    expect(screen.getByTestId("library-filter-sheet")).toHaveProp(
      "keyboardShouldPersistTaps",
      "handled",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByTestId("library-filter-sheet")).not.toBeOnTheScreen();
  });

  it("forwards Favorite Recent Unavailable and taxonomy filters without widening SQL", async () => {
    const searchExercises = jest.fn(async () => ({
      state: "page" as const,
      items: [],
      nextCursor: null,
    }));
    await renderLibrary({
      loadLibrary: jest.fn(async () => ({
        ...snapshot("exercises"),
        exerciseFilterOptions: {
          exerciseTypes: ["strength"],
          muscles: ["chest"],
          equipment: ["barbell"],
        },
      })),
      searchExercises,
    });

    await screen.findByLabelText("Search exercises");
    await fireEvent.press(screen.getByRole("button", { name: "Filter" }));
    for (const label of [
      "Exercise type: Strength",
      "Muscle: Chest",
      "Equipment: Barbell",
      "Visibility: Unavailable",
      "Recent use: Recent",
      "Favorite status: Favorite",
    ]) {
      await fireEvent.press(screen.getByRole("checkbox", { name: label }));
    }
    await fireEvent.press(screen.getByRole("button", { name: "Show results" }));

    await waitFor(() => expect(searchExercises).toHaveBeenCalledWith({
      query: "",
      cursor: null,
      filters: {
        exerciseTypes: ["strength"],
        muscles: ["chest"],
        equipment: ["barbell"],
        visibility: ["unavailable"],
        recent: [true],
        favorite: [true],
      },
    }));
    expect(screen.getByRole("button", { name: "Clear filters" }))
      .toBeOnTheScreen();
  });
});

describe("LibraryScreen committed content update and UI truths", () => {
  it("shows D-50 only for a committed result and dismisses that revision", async () => {
    const review = jest.fn();
    const { rendered, props } = await renderLibrary({
      contentUpdateResult: contentUpdate(),
      onReviewChanges: review,
    });

    expect(await screen.findByText("Exercise library updated"))
      .toBeOnTheScreen();
    expect(screen.getByText("3 added · 2 updated · 1 unavailable"))
      .toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", {
      name: "Review changes",
    }));
    expect(review).toHaveBeenCalledWith(contentUpdate());
    await fireEvent.press(screen.getByRole("button", {
      name: "Dismiss exercise library update",
    }));
    expect(screen.queryByText("Exercise library updated"))
      .not.toBeOnTheScreen();

    await rendered.rerender(
      <AppearanceProvider>
        <LibraryScreen
          {...props}
          contentUpdateResult={contentUpdate()}
        />
      </AppearanceProvider>,
    );
    expect(screen.queryByText("Exercise library updated"))
      .not.toBeOnTheScreen();

    await rendered.rerender(
      <AppearanceProvider>
        <LibraryScreen
          {...props}
          contentUpdateResult={contentUpdate({ revision: 3 })}
        />
      </AppearanceProvider>,
    );
    expect(screen.getByText("Exercise library updated")).toBeOnTheScreen();
  });

  it("keeps stable controls through loading and safe error recovery", async () => {
    const load = deferred<LibraryBrowseSnapshot>();
    const { rendered } = await renderLibrary({
      loadLibrary: jest.fn(() => load.promise),
    });

    expect(screen.getByRole("header", { name: "Library" })).toBeOnTheScreen();
    expect(screen.getByRole("tab", { name: "Plans" })).toBeOnTheScreen();
    expect(screen.getByLabelText("Search plans")).toBeOnTheScreen();
    expect(screen.getAllByTestId(/library-skeleton/u, {
      includeHiddenElements: true,
    })).toHaveLength(6);
    await rendered.unmount();

    await renderLibrary({
      loadLibrary: jest.fn(async () => {
        throw new Error("load_failed");
      }),
    });
    expect(await screen.findByText(
      "Library could not be loaded. Your plans and exercises were not changed. Try again.",
    )).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Retry Library" }))
      .toBeOnTheScreen();
  });

  it("preserves committed plan state while a bounded refresh is pending", async () => {
    const refresh = deferred<LibraryBrowseSnapshot>();
    const loadLibrary = jest.fn<() => Promise<LibraryBrowseSnapshot>>()
      .mockResolvedValueOnce(snapshot("plans"))
      .mockImplementationOnce(() => refresh.promise)
      .mockResolvedValueOnce(snapshot("plans"));
    await renderLibrary({ loadLibrary });

    const search = await screen.findByLabelText("Search plans");
    await fireEvent.changeText(search, "upper");
    await fireEvent.press(screen.getByRole("button", {
      name: "Refresh Library",
    }));
    expect(screen.getByRole("button", { name: "Refresh Library" }))
      .toHaveProp("accessibilityState", expect.objectContaining({
        busy: true,
        disabled: true,
      }));
    expect(screen.getByDisplayValue("upper")).toBeOnTheScreen();
    expect(screen.getByText("Upper / Lower")).toBeOnTheScreen();

    refresh.resolve(snapshot("plans"));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Refresh Library" }))
        .toHaveProp("accessibilityState", expect.objectContaining({
          busy: false,
          disabled: false,
        }));
    });
  });

  it("keeps selected plan and query after refresh failure, then retries in place", async () => {
    const loadLibrary = jest.fn<() => Promise<LibraryBrowseSnapshot>>()
      .mockResolvedValueOnce(snapshot("plans"))
      .mockRejectedValueOnce(new Error("refresh_failed"))
      .mockResolvedValueOnce(snapshot("plans"));
    await renderLibrary({ loadLibrary });

    const search = await screen.findByLabelText("Search plans");
    await fireEvent.changeText(search, "upper");
    await fireEvent.press(screen.getByRole("button", { name: "Upper / Lower. 4 days per week · 55 min. 4 days. Balanced strength and hypertrophy · Intermediate · Barbell, Cable, Machine" }));
    await fireEvent.press(screen.getByRole("button", {
      name: "Refresh Library",
    }));

    expect(await screen.findByText(
      "Library could not be refreshed. Your current content, selection, search, and filters are unchanged.",
    )).toBeOnTheScreen();
    expect(screen.getByDisplayValue("upper")).toBeOnTheScreen();
    expect(screen.getByTestId("library-plan-card-upper-lower"))
      .toHaveProp("accessibilityState", expect.objectContaining({
        selected: true,
      }));

    await fireEvent.press(screen.getByRole("button", {
      name: "Retry Library refresh",
    }));
    await waitFor(() => {
      expect(loadLibrary).toHaveBeenCalledTimes(3);
      expect(screen.queryByText(/could not be refreshed/u)).not.toBeOnTheScreen();
    });
    expect(screen.getByDisplayValue("upper")).toBeOnTheScreen();
    expect(screen.getByTestId("library-plan-card-upper-lower"))
      .toHaveProp("accessibilityState", expect.objectContaining({
        selected: true,
      }));
  });

  it("does not let an older refresh overwrite a newer section preference", async () => {
    const refresh = deferred<LibraryBrowseSnapshot>();
    const setSection = jest.fn(async () => ({
      section: "exercises" as const,
      revision: 1,
    }));
    await renderLibrary({
      loadLibrary: jest.fn(async () => snapshot("plans")),
      refreshLibrary: jest.fn(() => refresh.promise),
      setSection,
    });

    await screen.findByLabelText("Search plans");
    await fireEvent.press(screen.getByRole("button", {
      name: "Refresh Library",
    }));
    await fireEvent.press(screen.getByRole("tab", { name: "Exercises" }));
    expect(await screen.findByLabelText("Search exercises"))
      .toBeOnTheScreen();

    await act(async () => {
      refresh.resolve(snapshot("plans"));
      await refresh.promise;
    });
    expect(screen.getByRole("tab", { name: "Exercises" }))
      .toHaveProp("accessibilityState", expect.objectContaining({
        selected: true,
      }));
    expect(setSection).toHaveBeenCalledTimes(1);
  });

  it("single-flights initial retry and ignores an older load failure", async () => {
    const retry = deferred<LibraryBrowseSnapshot>();
    const initialLoad = jest.fn<() => Promise<LibraryBrowseSnapshot>>()
      .mockRejectedValueOnce(new Error("initial_failed"))
      .mockImplementationOnce(() => retry.promise);
    const { rendered, props } = await renderLibrary({
      loadLibrary: initialLoad,
    });

    const retryAction = await screen.findByRole("button", {
      name: "Retry Library",
    });
    await fireEvent.press(retryAction);
    await fireEvent.press(retryAction);
    expect(initialLoad).toHaveBeenCalledTimes(2);
    expect(retryAction).toHaveProp("accessibilityState", expect.objectContaining({
      busy: true,
      disabled: true,
    }));

    const newerLoad = jest.fn(async () => snapshot("plans"));
    await rendered.rerender(
      <AppearanceProvider>
        <LibraryScreen {...props} loadLibrary={newerLoad} />
      </AppearanceProvider>,
    );
    expect(await screen.findByText("Upper / Lower")).toBeOnTheScreen();

    await act(async () => {
      retry.reject(new Error("stale_retry_failed"));
      await retry.promise.catch(() => undefined);
    });
    expect(screen.queryByText("Library could not be loaded"))
      .not.toBeOnTheScreen();
    expect(screen.getByText("Upper / Lower")).toBeOnTheScreen();
  });

  it("keeps the prior Library usable when a content update fails", async () => {
    await renderLibrary({
      contentUpdateFailed: true,
      loadLibrary: jest.fn(async () => snapshot("exercises")),
      searchExercises: jest.fn(async () => ({
        state: "page" as const,
        items: [exercise()],
        nextCursor: null,
      })),
    });

    expect(await screen.findByText(
      "Exercise content could not be updated. The previous library is still available.",
    )).toBeOnTheScreen();
    expect(await screen.findByText("Barbell Bench Press")).toBeOnTheScreen();
    expect(screen.queryByText("Exercise library updated"))
      .not.toBeOnTheScreen();
  });

  it.each([599, 600, 840])(
    "uses adaptive %i width with 48dp controls and non-color states",
    async (width) => {
      await renderLibrary({
        loadLibrary: jest.fn(async () => snapshot("exercises")),
        searchExercises: jest.fn(async () => ({
          state: "page" as const,
          items: [exercise({
            availability: "unavailable",
            canonicalName:
              "Very long unavailable built-in unilateral overhead pressing exercise name",
          })],
          nextCursor: null,
        })),
        width,
      });

      expect(await screen.findByText("Unavailable")).toBeOnTheScreen();
      expect(screen.getByTestId("library-exercise-card-exercise-1"))
        .toHaveStyle({
          borderColor: themes.light.timerAttention,
        });
      expect(screen.getByRole("button", {
        name: "Add Very long unavailable built-in unilateral overhead pressing exercise name to favorites",
      })).toHaveStyle({
        minHeight: 48,
        minWidth: 48,
      });
      expect(screen.getByTestId("library-screen")).toHaveProp(
        "accessibilityLabel",
        width < 600 ? "compact layout" : width < 840
          ? "medium layout"
          : "expanded layout",
      );
      expect(screen.getByRole("tab", { name: "Exercises" })).toHaveStyle({
        minHeight: 48,
      });
      expect(screen.getByRole("button", { name: "Filter" })).toHaveStyle({
        minHeight: 48,
      });
    },
  );

  it("uses immediate reduced-motion section replacement", async () => {
    const props: React.ComponentProps<typeof LibraryScreen> = {
      ...(await renderLibrary()).props,
      loadLibrary: jest.fn(async () => snapshot()),
    };
    await screen.unmount();
    await render(
      <AppearanceProvider reduceMotion>
        <LibraryScreen {...props} />
      </AppearanceProvider>,
    );

    await screen.findByLabelText("Search plans");
    await fireEvent.press(screen.getByRole("tab", { name: "Exercises" }));
    expect(await screen.findByLabelText("Search exercises"))
      .toBeOnTheScreen();
  });
});
