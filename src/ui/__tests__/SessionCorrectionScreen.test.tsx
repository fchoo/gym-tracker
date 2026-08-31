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

import type {
  HistoryCorrectionEditorState,
} from "../../domains/history";
import {
  HistoryCorrectionConflictError,
} from "../../domains/history";
import {
  AppearanceProvider,
  createMemoryAppearanceStore,
  themes,
} from "../theme";
import {
  SessionCorrectionScreen,
} from "../screens/SessionCorrectionScreen";

const identity = {
  profile: "load_reps" as const,
  contractVersion: 1,
  exerciseMetricGeneration: 1,
};

const state: HistoryCorrectionEditorState = {
  effectiveRevision: 8,
  snapshot: {
    version: 1,
    session: {
      id: "session-1",
      source: "manual",
      status: "completed",
      planId: null,
      planDayId: null,
      planName: null,
      dayName: null,
      localDate: "2026-08-24",
      timezone: "Asia/Singapore",
      startedAtMs: 1_724_428_800_000,
      completedAtMs: 1_724_429_160_000,
      ownerNote: null,
    },
    exercises: [{
      id: "exercise-1",
      exerciseId: "bench-press",
      name: "Bench press",
      ordinal: 0,
      status: "completed",
      metricIdentity: identity,
      effort: "on_target",
      sets: [{
        id: "set-1",
        kind: "working",
        ordinal: 0,
        status: "completed",
        target: {
          version: 1,
          profile: "load_reps",
          loadGrams: 60_000,
          minReps: 6,
          maxReps: 8,
          incrementGrams: 2_500,
          perSide: false,
        },
        observation: {
          version: 1,
          profile: "load_reps",
          loadGrams: 60_000,
          reps: 8,
          source: "manual",
        },
        completedAtMs: 1_724_429_160_000,
      }],
    }],
  },
  auditEvents: [{
    id: "audit-1",
    effectiveRevision: 8,
    eventType: "correction",
    fieldIdentity: "session.ownerNote",
    before: null,
    after: "Form cue changed",
    occurredAtMs: 1_724_429_170_000,
  }],
};

type Props = React.ComponentProps<typeof SessionCorrectionScreen>;

async function renderScreen(
  overrides: Partial<Props> = {},
  appearanceStore = createMemoryAppearanceStore(),
) {
  const props: Props = {
    sessionId: "session-1",
    loadCorrectionSession: jest.fn(async () => state),
    listAvailableExercises: jest.fn(async () => [{
      exerciseId: "incline-press",
      name: "Incline press",
      metricIdentity: identity,
    }]),
    correctSession: jest.fn(async () => ({
      effectiveRevision: 9,
      snapshot: state.snapshot,
    })),
    onBack: jest.fn(),
    onSaved: jest.fn(),
    ...overrides,
  };
  await render(
    <AppearanceProvider store={appearanceStore}>
      <SessionCorrectionScreen {...props} />
    </AppearanceProvider>,
  );
  return props;
}

describe("SessionCorrectionScreen", () => {
  it("shows stable loading geometry before source-backed correction data arrives", async () => {
    let resolve: ((value: HistoryCorrectionEditorState) => void) | undefined;
    await renderScreen({
      loadCorrectionSession: jest.fn(() => new Promise<HistoryCorrectionEditorState>((next) => {
        resolve = next;
      })),
    });

    expect(screen.getByTestId("session-correction-skeleton")).toBeOnTheScreen();
    resolve?.(state);
    expect(await screen.findByRole("header", {
      name: "Correct workout",
    })).toBeOnTheScreen();
  });

  it("renders separate warm-up/working editing controls and adds only correction-owned set identities", async () => {
    await renderScreen();

    expect(await screen.findByText("Bench press")).toBeOnTheScreen();
    expect(screen.getByText("Working set 1")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", {
      name: "Change set 1 to warm-up",
    }));
    expect(screen.getByText("Warm-up 1")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", {
      name: "Add set to Bench press",
    }));
    expect(screen.getByText("Working set 2")).toBeOnTheScreen();
  });

  it("keeps a selected correction date private until Apply Date", async () => {
    await renderScreen();
    await screen.findByText("Bench press");

    await fireEvent.press(screen.getByRole("button", {
      name: "Workout date",
    }));
    await fireEvent.press(screen.getByRole("button", {
      name: "Select 2026-08-25",
    }));
    await fireEvent.press(screen.getByRole("button", {
      name: "Keep Original Date",
    }));

    expect(screen.getByRole("button", { name: "Workout date" }))
      .toHaveTextContent("2026-08-24");

    await fireEvent.press(screen.getByRole("button", {
      name: "Workout date",
    }));
    await fireEvent.press(screen.getByRole("button", {
      name: "Select 2026-08-25",
    }));
    await fireEvent.press(screen.getByRole("button", {
      name: "Apply Date",
    }));

    expect(screen.getByRole("button", { name: "Workout date" }))
      .toHaveTextContent("2026-08-25");
  });

  it("validates a malformed numeric correction before attempting a save", async () => {
    const props = await renderScreen();
    await screen.findByText("Bench press");
    await fireEvent.changeText(screen.getByLabelText("Working set 1 load kg"), "not a number");
    await fireEvent.press(screen.getByRole("button", {
      name: "Save correction",
    }));

    expect(screen.getByText("Enter a valid number for Working set 1 load kg."))
      .toBeOnTheScreen();
    expect(props.correctSession).not.toHaveBeenCalled();
  });

  it("retains the local draft after a conflict and reloads only on the explicit owner action", async () => {
    const loadCorrectionSession = jest.fn(async () => state);
    const correctSession = jest.fn(async () => {
      throw new HistoryCorrectionConflictError();
    });
    await renderScreen({ loadCorrectionSession, correctSession });
    await screen.findByText("Bench press");
    await fireEvent.changeText(screen.getByLabelText("Owner note"), "Keep this draft");
    await fireEvent.press(screen.getByRole("button", {
      name: "Save correction",
    }));

    expect(await screen.findByText("Workout changed elsewhere"))
      .toBeOnTheScreen();
    expect(screen.getByDisplayValue("Keep this draft")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", {
      name: "Reload workout",
    }));
    await waitFor(() => expect(loadCorrectionSession).toHaveBeenCalledTimes(2));
  });

  it("keeps a failed save and the owner draft visible, then acknowledges only after the commit result", async () => {
    const correctSession = jest.fn<Props["correctSession"]>()
      .mockRejectedValueOnce(new Error("storage unavailable"))
      .mockResolvedValueOnce({ effectiveRevision: 9, snapshot: state.snapshot });
    const onSaved = jest.fn();
    await renderScreen({ correctSession, onSaved });
    await screen.findByText("Bench press");
    await fireEvent.changeText(screen.getByLabelText("Owner note"), "Retain me");
    await fireEvent.press(screen.getByRole("button", { name: "Save correction" }));

    expect(await screen.findByText("Save failed"))
      .toBeOnTheScreen();
    expect(screen.getByDisplayValue("Retain me")).toBeOnTheScreen();
    expect(onSaved).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("button", { name: "Save correction" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith("session-1"));
  });

  it("keeps audit payloads collapsed until explicitly requested and uses the theme card surface", async () => {
    await renderScreen({}, createMemoryAppearanceStore("Dark"));
    await screen.findByText("Bench press");

    expect(screen.queryByText("Form cue changed")).not.toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", {
      name: "Show correction history",
    }));
    expect(screen.getByText("Owner note · No value → Form cue changed"))
      .toBeOnTheScreen();
    expect(screen.getByTestId("session-correction-screen"))
      .toHaveStyle({ backgroundColor: themes.dark.canvas });
  });
});
