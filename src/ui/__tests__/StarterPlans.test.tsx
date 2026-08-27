import {
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

import starterPlansAsset from "../../../assets/content/starter-plans.v2.json";
import starterPlansAcceptanceAsset from "../../../artifacts/review/phase2/starter-plans-acceptance.json";
import {
  createStarterPlanRuntimeCatalog,
} from "../../bootstrap/starterPlanRuntime";
import type {
  AcceptedStarterTemplate,
} from "../../domains/plans";
import {
  LibraryScreen,
  type LibraryBrowseSnapshot,
  type LibrarySectionPreference,
} from "../screens/LibraryScreen";
import {
  StarterPlanDetailScreen,
} from "../screens/StarterPlanDetailScreen";
import {
  StarterActivationScreen,
  type StarterActivationPreview,
} from "../screens/StarterActivationScreen";
import {
  TemplateUpdateScreen,
  type TemplateUpdatePreview,
} from "../screens/TemplateUpdateScreen";
import {
  AppearanceProvider,
} from "../theme";

const prettyBytes = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const hashByBytes = new Map([
  [
    prettyBytes(starterPlansAsset),
    "8c1fbd0f6a114e5c5f9fa7ae2c4edf8f32d46890397b7488e65c768bea4126f4",
  ],
  [
    prettyBytes(starterPlansAcceptanceAsset),
    "22052f2e1dbda90122d141e5d2888a3e7579d77c92be395a36bd5fb1ebe3f2e5",
  ],
]);

async function acceptedCatalog() {
  return createStarterPlanRuntimeCatalog({
    starterPackBytes: prettyBytes(starterPlansAsset),
    acceptanceBytes: prettyBytes(starterPlansAcceptanceAsset),
    sha256: async (value) => hashByBytes.get(value) ?? "0".repeat(64),
  });
}

function escapedPattern(value: string): RegExp {
  return new RegExp(value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u");
}

function snapshot(
  starters: LibraryBrowseSnapshot["plans"]["starters"],
): LibraryBrowseSnapshot {
  return {
    sectionPreference: {
      section: "plans",
      revision: 0,
    },
    plans: {
      active: null,
      owned: [],
      starters,
    },
  };
}

async function renderLibrary(
  overrides: Partial<React.ComponentProps<typeof LibraryScreen>> = {},
) {
  const catalog = await acceptedCatalog();
  const props: React.ComponentProps<typeof LibraryScreen> = {
    loadLibrary: jest.fn(async () => snapshot(catalog.summaries)),
    listRecentExercises: jest.fn(async () => []),
    onCreateExercise: jest.fn(),
    onCreatePlan: jest.fn(),
    onOpenExercise: jest.fn(),
    onOpenPlan: jest.fn(),
    onOpenStarter: jest.fn(),
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
    setSection: jest.fn(async (
      section: LibrarySectionPreference["section"],
      revision: number,
    ) => ({
      section,
      revision: revision + 1,
    })),
    ...overrides,
  };
  return {
    catalog,
    props,
    rendered: await render(
      <AppearanceProvider>
        <LibraryScreen {...props} />
      </AppearanceProvider>,
    ),
  };
}

async function renderDetail(
  template: AcceptedStarterTemplate | null,
  overrides: Partial<React.ComponentProps<typeof StarterPlanDetailScreen>> = {},
) {
  const props: React.ComponentProps<typeof StarterPlanDetailScreen> = {
    loadStarterPlan: jest.fn(async () => template),
    onActivate: jest.fn(),
    onBack: jest.fn(),
    templateId: template?.id ?? "missing-template",
    ...overrides,
  };
  return {
    props,
    rendered: await render(
      <AppearanceProvider>
        <StarterPlanDetailScreen {...props} />
      </AppearanceProvider>,
    ),
  };
}

describe("starter discovery", () => {
  it("uses the six accepted templates in stable order and opens a starter without losing Library state", async () => {
    const { catalog, props, rendered } = await renderLibrary();

    expect(await screen.findByRole("header", { name: "Starter Plans" }))
      .toBeOnTheScreen();
    expect(catalog.summaries).toHaveLength(6);
    const serialized = JSON.stringify(rendered.toJSON());
    for (const [index, starter] of catalog.summaries.entries()) {
      expect(screen.getByRole("button", {
        name: escapedPattern(starter.name),
      })).toBeOnTheScreen();
      if (index > 0) {
        expect(serialized.indexOf(catalog.summaries[index - 1]!.name))
          .toBeLessThan(serialized.indexOf(starter.name));
      }
    }

    await fireEvent.changeText(screen.getByLabelText("Search plans"), "gym");
    await fireEvent.scroll(screen.getByTestId("library-screen-scroll"), {
      nativeEvent: { contentOffset: { x: 0, y: 320 } },
    });
    await fireEvent.press(screen.getByRole("button", {
      name: /Gym Body-Part Split/u,
    }));
    expect(props.onOpenStarter).toHaveBeenCalledWith("gym-body-part-split");

    expect(screen.getByLabelText("Search plans")).toHaveProp("value", "gym");
    expect(screen.getByTestId("library-screen-scroll"))
      .not.toHaveProp("contentOffset");
  });

  it("combines Goal, Experience, Days per week, and Equipment filters with deterministic Why this fits copy", async () => {
    await renderLibrary();
    await screen.findByText("Gym Body-Part Split");

    await fireEvent.press(screen.getByRole("button", { name: "Filter" }));
    await fireEvent.press(screen.getByRole("checkbox", {
      name: "Experience: Intermediate",
    }));
    await fireEvent.press(screen.getByRole("checkbox", {
      name: "Days per week: 5",
    }));
    await fireEvent.press(screen.getByRole("checkbox", {
      name: "Equipment: Barbell",
    }));
    await fireEvent.press(screen.getByRole("button", { name: "Show results" }));

    expect(screen.getByText("Gym Body-Part Split")).toBeOnTheScreen();
    expect(screen.getByText(
      "Why this fits: Intermediate experience · 5 days per week · Barbell equipment",
    )).toBeOnTheScreen();
    expect(screen.queryByText("Full Body Foundation")).not.toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Clear filters" }))
      .toBeOnTheScreen();

    await fireEvent.press(screen.getByRole("button", {
      name: "Clear filters",
    }));
    expect(await screen.findByText("Full Body Foundation")).toBeOnTheScreen();
    expect(screen.getAllByText(/Body|Upper|Push|Strength|Equipment/u).length)
      .toBeGreaterThanOrEqual(6);
  });

  it("keeps stable controls through loading, error, empty, and long starter states", async () => {
    const pending = new Promise<LibraryBrowseSnapshot>(() => undefined);
    const { rendered } = await renderLibrary({
      loadLibrary: jest.fn(() => pending),
    });
    expect(screen.getByRole("header", { name: "Library" })).toBeOnTheScreen();
    for (const index of [1, 2, 3, 4, 5, 6]) {
      expect(screen.getByTestId(
        `library-skeleton-${index}`,
        { includeHiddenElements: true },
      ))
        .toBeOnTheScreen();
    }

    await rendered.rerender(
      <AppearanceProvider>
        <LibraryScreen
          loadLibrary={jest.fn(async () => {
            throw new Error("safe failure");
          })}
          listRecentExercises={jest.fn(async () => [])}
          onCreateExercise={jest.fn()}
          onCreatePlan={jest.fn()}
          onOpenExercise={jest.fn()}
          onOpenPlan={jest.fn()}
          onOpenStarter={jest.fn()}
          searchExercises={jest.fn(async () => ({
            state: "page" as const,
            items: [],
            nextCursor: null,
          }))}
          setExerciseFavorite={jest.fn(async () => ({
            exerciseId: "exercise-1",
            favorite: true,
            preferenceRevision: 1,
          }))}
          setSection={jest.fn(async (
            section: LibrarySectionPreference["section"],
            revision: number,
          ) => ({
            section,
            revision: revision + 1,
          }))}
        />
      </AppearanceProvider>,
    );
    expect(await screen.findByText(
      "Library could not be loaded. Your plans and exercises were not changed. Try again.",
    )).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Retry Library" }))
      .toBeOnTheScreen();
  });

  it("exposes Template update available as a separate owned-row action", async () => {
    const catalog = await acceptedCatalog();
    const onOpenPlan = jest.fn();
    const onOpenTemplateUpdate = jest.fn();
    await renderLibrary({
      loadLibrary: jest.fn(async () => ({
        ...snapshot(catalog.summaries),
        plans: {
          active: {
            id: "legacy-copy",
            name: "Full Body Foundation",
            daysPerWeek: 3,
            status: "Active" as const,
            scheduleSummary: "Active Weekday schedule",
            templateUpdateTemplateId: "full-body-foundation",
          },
          owned: [],
          starters: catalog.summaries,
        },
      })),
      onOpenPlan,
      onOpenTemplateUpdate,
    });

    const update = await screen.findByRole("button", {
      name: "Template update available for Full Body Foundation",
    });
    expect(screen.getByText("Template update available")).toBeOnTheScreen();
    await fireEvent.press(update);
    expect(onOpenTemplateUpdate).toHaveBeenCalledWith({
      ownedPlanId: "legacy-copy",
      templateId: "full-body-foundation",
    });
    expect(onOpenPlan).not.toHaveBeenCalled();
  });
});

describe("starter detail", () => {
  it("renders all accepted D-20 facts and exact D-55 weekday weighted detail", async () => {
    const catalog = await acceptedCatalog();
    const bodyPart = catalog.templates.find(
      ({ id }) => id === "gym-body-part-split",
    )!;
    await renderDetail(bodyPart);

    expect(await screen.findByRole("header", {
      name: "Gym Body-Part Split",
    })).toBeOnTheScreen();
    expect(screen.getByText(bodyPart.goal)).toBeOnTheScreen();
    expect(screen.getByText("Intermediate")).toBeOnTheScreen();
    expect(screen.getByText("55 minutes")).toBeOnTheScreen();
    expect(screen.getByText(
      "Barbell · Bench · Cable · Dumbbell · Machine · Squat Rack",
    )).toBeOnTheScreen();
    expect(screen.getByText(bodyPart.progressionSummary)).toBeOnTheScreen();
    expect(screen.getByText(
      "Monday Chest · Tuesday Back · Wednesday Shoulders · Thursday Legs · Friday Arms",
    )).toBeOnTheScreen();

    for (const day of bodyPart.days) {
      expect(screen.getByRole("header", { name: day.displayName }))
        .toBeOnTheScreen();
      for (const occurrence of day.exercises) {
        expect(screen.getByText(occurrence.catalogName)).toBeOnTheScreen();
        expect(screen.getAllByText(
          `${occurrence.target.plannedSets} sets · Load + reps · ${occurrence.restSeconds}s rest`,
        ).length).toBeGreaterThan(0);
      }
    }
    expect(bodyPart.days).toHaveLength(5);
    expect(bodyPart.days.every(({ exercises }) => exercises.length === 4))
      .toBe(true);
    expect(bodyPart.days.flatMap(({ exercises }) => exercises).every(
      ({ metricIdentity, metricOverride }) =>
        metricIdentity.profile === "load_reps" && metricOverride === null,
    )).toBe(true);
    expect(screen.queryByText(/bodyweight|substitution/iu)).not
      .toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Activate plan" }))
      .toHaveStyle({ minHeight: 56 });
  });

  it("preserves complete long source notes and uses compact push versus expanded detail pane semantics", async () => {
    const catalog = await acceptedCatalog();
    const template = catalog.templates[0]!;
    const longText = `${template.sourceNotes[0]!.text} ${"source ".repeat(80)}`;
    const longTemplate: AcceptedStarterTemplate = {
      ...template,
      sourceNotes: [
        {
          ...template.sourceNotes[0]!,
          text: longText,
        },
      ],
    };
    const { rendered } = await renderDetail(longTemplate, { width: 920 });

    expect(await screen.findByText(longText)).toBeOnTheScreen();
    expect(screen.getByLabelText("expanded layout")).toBeOnTheScreen();
    expect(screen.getByTestId("adaptive-secondary-region")).toBeOnTheScreen();

    await rendered.rerender(
      <AppearanceProvider>
        <StarterPlanDetailScreen
          loadStarterPlan={jest.fn(async () => longTemplate)}
          onActivate={jest.fn()}
          onBack={jest.fn()}
          templateId={longTemplate.id}
          width={390}
        />
      </AppearanceProvider>,
    );
    await waitFor(() =>
      expect(screen.getByLabelText("compact layout")).toBeOnTheScreen()
    );
    expect(screen.queryByTestId("adaptive-secondary-region")).not
      .toBeOnTheScreen();
  });

  it("keeps the heading and recovery actions stable for detail loading, empty, and error states", async () => {
    const pending = new Promise<AcceptedStarterTemplate | null>(
      () => undefined,
    );
    const { rendered } = await renderDetail(null, {
      loadStarterPlan: jest.fn(() => pending),
    });

    expect(screen.getByRole("header", { name: "Starter plan" }))
      .toBeOnTheScreen();
    for (const index of [1, 2, 3, 4, 5]) {
      expect(screen.getByTestId(
        `starter-detail-skeleton-${index}`,
        { includeHiddenElements: true },
      ))
        .toBeOnTheScreen();
    }

    await rendered.rerender(
      <AppearanceProvider>
        <StarterPlanDetailScreen
          loadStarterPlan={jest.fn(async () => {
            throw new Error("safe failure");
          })}
          onActivate={jest.fn()}
          onBack={jest.fn()}
          templateId="missing-template"
        />
      </AppearanceProvider>,
    );
    expect(await screen.findByText(
      "Starter plan could not be loaded. Your Library was not changed. Try again.",
    )).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Retry" })).toBeOnTheScreen();

    await rendered.rerender(
      <AppearanceProvider>
        <StarterPlanDetailScreen
          loadStarterPlan={jest.fn(async () => null)}
          onActivate={jest.fn()}
          onBack={jest.fn()}
          templateId="missing-template"
        />
      </AppearanceProvider>,
    );
    expect(await screen.findByText("Starter plan not found")).toBeOnTheScreen();
  });
});

function activationPreview(
  template: AcceptedStarterTemplate,
  overrides: Partial<StarterActivationPreview> = {},
): StarterActivationPreview {
  return {
    template,
    startLocalDate: "2026-08-18",
    timeZone: "Asia/Singapore",
    activeScheduleRevision: null,
    copies: [],
    activeWorkout: null,
    ...overrides,
  };
}

function committedActivation(template: AcceptedStarterTemplate) {
  return {
    outcome: "committed" as const,
    plan: {
      id: "owned-body-part",
      name: template.displayName,
      sourceTemplateId: template.id,
      sourceRevision: template.revision,
      isActive: true as const,
      revision: 1,
    },
    days: template.days.map((day) => ({
      id: `owned:${day.id}`,
      sourceDayId: day.id,
      name: day.displayName,
      ordinal: day.ordinal,
      occurrenceCount: day.exercises.length,
    })),
    schedule: {
      id: "schedule-body-part",
      lifecycle: "active" as const,
      revision: 1,
      version: {
        id: "schedule-body-part:v1",
        versionNumber: 1,
        effectiveLocalDate: "2026-08-19",
        mode: "rotation" as const,
        timeZone: "Asia/Singapore",
        bindings: template.days.map((day, index) => ({
          planDayId: `owned:${day.id}`,
          sourcePlanDayId: day.id,
          ordinal: index,
        })),
      },
    },
    invalidationScopes: [
      { scope: "library-plans" as const },
      { scope: "plan-detail" as const, planId: "owned-body-part" },
      { scope: "today" as const },
    ],
  };
}

async function renderActivation(
  preview: StarterActivationPreview | null,
  overrides: Partial<React.ComponentProps<typeof StarterActivationScreen>> = {},
) {
  const activateStarterPlan = jest.fn(async () => {
    if (preview === null) {
      throw new Error("preview missing");
    }
    return committedActivation(preview.template);
  });
  const props: React.ComponentProps<typeof StarterActivationScreen> = {
    activateStarterPlan,
    loadPreview: jest.fn(async () => preview),
    onActivated: jest.fn(),
    onBack: jest.fn(),
    onDiscard: jest.fn(async () => undefined),
    onFinishPartial: jest.fn(async () => undefined),
    onResume: jest.fn(),
    templateId: preview?.template.id ?? "missing-template",
    ...overrides,
  };
  return {
    props,
    rendered: await render(
      <AppearanceProvider>
        <StarterActivationScreen {...props} />
      </AppearanceProvider>,
    ),
  };
}

describe("starter activation", () => {
  it("edits today-default schedule facts and invokes activation only after confirmation", async () => {
    const catalog = await acceptedCatalog();
    const bodyPart = catalog.templates.find(
      ({ id }) => id === "gym-body-part-split",
    )!;
    const { props } = await renderActivation(activationPreview(bodyPart));

    expect(await screen.findByRole("header", {
      name: "Activate Gym Body-Part Split",
    })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Start date" }))
      .toHaveTextContent("2026-08-18");
    expect(screen.getByRole("radio", { name: "Weekday" })).toHaveProp(
      "accessibilityState",
      expect.objectContaining({ checked: true }),
    );
    expect(screen.getByText(
      "Monday Chest · Tuesday Back · Wednesday Shoulders · Thursday Legs · Friday Arms",
    )).toBeOnTheScreen();
    expect(screen.getByText(bodyPart.progressionSummary)).toBeOnTheScreen();
    expect(screen.getByText(bodyPart.sourceNotes[0]!.text)).toBeOnTheScreen();
    expect(screen.getByText("Bench Press")).toBeOnTheScreen();
    expect(screen.getAllByText(/Load \+ reps/u).length).toBe(20);

    await fireEvent.press(screen.getByRole("button", { name: "Start date" }));
    await fireEvent.press(screen.getByRole("button", {
      name: "Select 2026-08-19",
    }));
    await fireEvent.press(screen.getByRole("button", { name: "Confirm date" }));
    await fireEvent.press(screen.getByRole("radio", { name: "Rotation" }));
    await fireEvent.press(screen.getByRole("button", {
      name: "Move Back up",
    }));
    await fireEvent.press(screen.getByRole("button", { name: "Activate plan" }));

    expect(props.activateStarterPlan).not.toHaveBeenCalled();
    expect(screen.getByRole("header", {
      name: "Activate Gym Body-Part Split?",
    })).toBeOnTheScreen();
    await fireEvent.press(screen.getAllByRole("button", {
      name: "Activate plan",
    }).at(-1)!);

    expect(props.activateStarterPlan).toHaveBeenCalledWith({
      templateId: "gym-body-part-split",
      startLocalDate: "2026-08-19",
      timeZone: "Asia/Singapore",
      mode: "rotation",
      bindings: [
        { planDaySourceId: "body-part-back", ordinal: 0 },
        { planDaySourceId: "body-part-chest", ordinal: 1 },
        { planDaySourceId: "body-part-shoulders", ordinal: 2 },
        { planDaySourceId: "body-part-legs", ordinal: 3 },
        { planDaySourceId: "body-part-arms", ordinal: 4 },
      ],
      copyChoice: null,
      expectedActiveScheduleRevision: null,
    });
    expect(await screen.findByText("Gym Body-Part Split is active"))
      .toBeOnTheScreen();
    expect(screen.getByText(
      "Previous plans and schedules remain available as inactive copies.",
    )).toBeOnTheScreen();
    expect(props.onActivated).toHaveBeenCalledWith("owned-body-part");
  });

  it("requires the exact existing-copy choice and exposes current lifecycle facts", async () => {
    const catalog = await acceptedCatalog();
    const template = catalog.templates[0]!;
    const preview = activationPreview(template, {
      activeScheduleRevision: 4,
      copies: [
        {
          planId: "copy-active",
          name: "Foundation current",
          state: "Active",
          scheduleSummary: "Weekday · Monday, Wednesday, Friday",
          planRevision: 3,
          scheduleRevision: 4,
        },
        {
          planId: "copy-old",
          name: "Foundation old",
          state: "Inactive",
          scheduleSummary: "Rotation · Full Body A, Full Body B",
          planRevision: 2,
          scheduleRevision: 2,
        },
      ],
    });
    const { props } = await renderActivation(preview);

    expect(await screen.findByText("Foundation current")).toBeOnTheScreen();
    expect(screen.getByText("Active")).toBeOnTheScreen();
    expect(screen.getByText("Inactive")).toBeOnTheScreen();
    expect(screen.getByRole("radio", { name: "Reactivate existing copy" }))
      .toBeOnTheScreen();
    expect(screen.getByRole("radio", { name: "Create another copy" }))
      .toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Activate plan" })).toHaveProp(
      "accessibilityState",
      expect.objectContaining({ disabled: true }),
    );

    await fireEvent.press(screen.getByRole("radio", {
      name: "Reactivate existing copy",
    }));
    await fireEvent.press(screen.getByRole("radio", {
      name: /Foundation old.*Inactive/u,
    }));
    await fireEvent.press(screen.getByRole("button", { name: "Activate plan" }));
    await fireEvent.press(screen.getAllByRole("button", {
      name: "Activate plan",
    }).at(-1)!);

    expect(props.activateStarterPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedActiveScheduleRevision: 4,
        copyChoice: {
          type: "reactivate_existing",
          planId: "copy-old",
          expectedPlanRevision: 2,
          expectedScheduleRevision: 2,
        },
      }),
    );
  });

  it("blocks switching during an active workout with exact resolution actions", async () => {
    const catalog = await acceptedCatalog();
    const template = catalog.templates[0]!;
    const preview = activationPreview(template, {
      activeWorkout: {
        sessionId: "session-active",
        sessionRevision: 7,
      },
    });
    const { props } = await renderActivation(preview);

    expect(await screen.findByText(
      "Finish the current workout before switching plans.",
    )).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Activate plan" })).not
      .toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Resume" }));
    await fireEvent.press(screen.getByRole("button", {
      name: "Finish partial",
    }));
    await fireEvent.press(screen.getByRole("button", { name: "Discard" }));
    expect(props.onResume).toHaveBeenCalledWith("session-active");
    expect(props.onFinishPartial).toHaveBeenCalledWith({
      sessionId: "session-active",
      sessionRevision: 7,
    });
    expect(props.onDiscard).toHaveBeenCalledWith({
      sessionId: "session-active",
      sessionRevision: 7,
    });
  });

  it("preserves edits through safe activation errors and stable loading states", async () => {
    const catalog = await acceptedCatalog();
    const template = catalog.templates[0]!;
    const pending = new Promise<StarterActivationPreview | null>(
      () => undefined,
    );
    const { rendered } = await renderActivation(null, {
      loadPreview: jest.fn(() => pending),
    });
    expect(screen.getByRole("header", { name: "Activate starter plan" }))
      .toBeOnTheScreen();
    expect(screen.getByTestId(
      "starter-activation-skeleton-1",
      { includeHiddenElements: true },
    )).toBeOnTheScreen();

    const activateStarterPlan = jest.fn(async () => {
      throw new Error("starter_schedule_revision_conflict");
    });
    await rendered.rerender(
      <AppearanceProvider>
        <StarterActivationScreen
          activateStarterPlan={activateStarterPlan}
          loadPreview={jest.fn(async () => activationPreview(template))}
          onActivated={jest.fn()}
          onBack={jest.fn()}
          onDiscard={jest.fn(async () => undefined)}
          onFinishPartial={jest.fn(async () => undefined)}
          onResume={jest.fn()}
          templateId={template.id}
        />
      </AppearanceProvider>,
    );
    expect(await screen.findByRole("button", { name: "Start date" }))
      .toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Start date" }));
    await fireEvent.press(screen.getByRole("button", {
      name: "Select 2026-08-20",
    }));
    await fireEvent.press(screen.getByRole("button", { name: "Confirm date" }));
    await fireEvent.press(screen.getByRole("button", { name: "Activate plan" }));
    await fireEvent.press(screen.getAllByRole("button", {
      name: "Activate plan",
    }).at(-1)!);
    expect(await screen.findByText(
      "Plan could not be activated. Your current active plan and schedule are unchanged.",
    )).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Start date" }))
      .toHaveTextContent("2026-08-20");
  });
});

function templateUpdatePreview(
  template: AcceptedStarterTemplate,
): TemplateUpdatePreview {
  return {
    ownedPlanId: "owned-foundation",
    ownedPlanName: "My Foundation",
    ownedPlanRevision: 2,
    activeScheduleRevision: 4,
    template,
    sections: [
      {
        title: "Days",
        changes: [
          {
            kind: "Changed",
            detail: "Full Body A renamed to Foundation A",
          },
        ],
      },
      {
        title: "Exercises",
        changes: [
          {
            kind: "Added",
            detail: "Chest-supported row added to Foundation A",
          },
        ],
      },
      {
        title: "Targets",
        changes: [
          {
            kind: "Changed",
            detail: "Bench Press target changed from 8–10 to 6–10 reps",
          },
        ],
      },
      {
        title: "Schedule defaults",
        changes: [
          {
            kind: "Changed",
            detail: "Suggested Friday binding moved to Saturday",
          },
        ],
      },
      {
        title: "Progression policies",
        changes: [
          {
            kind: "Changed",
            detail: "Deadlift increment changed from 5 kg to 2.5 kg",
          },
        ],
      },
    ],
  };
}

describe("starter template update", () => {
  it("shows the full independent-copy diff and exposes only Create new copy", async () => {
    const catalog = await acceptedCatalog();
    const preview = templateUpdatePreview(catalog.templates[0]!);
    const createNewCopy = jest.fn(async () => "owned-foundation-new");
    const onCreated = jest.fn();
    await render(
      <AppearanceProvider>
        <TemplateUpdateScreen
          createNewCopy={createNewCopy}
          loadUpdate={jest.fn(async () => preview)}
          onBack={jest.fn()}
          onCreated={onCreated}
          ownedPlanId="owned-foundation"
          templateId={preview.template.id}
        />
      </AppearanceProvider>,
    );

    expect(await screen.findByText("Template update available"))
      .toBeOnTheScreen();
    for (const section of preview.sections) {
      expect(screen.getByRole("header", { name: section.title }))
        .toBeOnTheScreen();
      expect(screen.getByText(section.changes[0]!.detail)).toBeOnTheScreen();
    }
    expect(screen.getByText(
      "My Foundation stays unchanged. A new independent copy is created for comparison.",
    )).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: /Update existing/u })).not
      .toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", {
      name: "Create new copy",
    }));
    expect(createNewCopy).toHaveBeenCalledWith(preview);
    expect(onCreated).toHaveBeenCalledWith("owned-foundation-new");
    expect(await screen.findByText("New copy created")).toBeOnTheScreen();
    expect(screen.getByText(
      "My Foundation remains unchanged. The new Full Body Foundation copy is inactive and ready for comparison.",
    )).toBeOnTheScreen();
  });

  it("keeps stable loading, no-update, error, overflow, and long diff states", async () => {
    const catalog = await acceptedCatalog();
    const preview = templateUpdatePreview(catalog.templates[0]!);
    const longDetail = `${preview.sections[0]!.changes[0]!.detail} ${
      "accepted source detail ".repeat(70)
    }`;
    const longPreview: TemplateUpdatePreview = {
      ...preview,
      sections: [
        ...preview.sections,
        {
          title: "Source notes",
          changes: [{ kind: "Changed", detail: longDetail }],
        },
      ],
    };
    const { rerender } = await render(
      <AppearanceProvider>
        <TemplateUpdateScreen
          createNewCopy={jest.fn(async () => "new-copy")}
          loadUpdate={jest.fn(async () => longPreview)}
          onBack={jest.fn()}
          onCreated={jest.fn()}
          ownedPlanId="owned-foundation"
          templateId={longPreview.template.id}
        />
      </AppearanceProvider>,
    );
    expect(await screen.findByText(longDetail)).toBeOnTheScreen();

    await rerender(
      <AppearanceProvider>
        <TemplateUpdateScreen
          createNewCopy={jest.fn(async () => "new-copy")}
          loadUpdate={jest.fn(async () => null)}
          onBack={jest.fn()}
          onCreated={jest.fn()}
          ownedPlanId="owned-foundation"
          templateId={longPreview.template.id}
        />
      </AppearanceProvider>,
    );
    expect(await screen.findByText("No template update available"))
      .toBeOnTheScreen();

    await rerender(
      <AppearanceProvider>
        <TemplateUpdateScreen
          createNewCopy={jest.fn(async () => "new-copy")}
          loadUpdate={jest.fn(async () => {
            throw new Error("safe failure");
          })}
          onBack={jest.fn()}
          onCreated={jest.fn()}
          ownedPlanId="owned-foundation"
          templateId={longPreview.template.id}
        />
      </AppearanceProvider>,
    );
    expect(await screen.findByText(
      "Template update could not be loaded. Your existing copy was not changed.",
    )).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Retry" })).toBeOnTheScreen();
  });
});
