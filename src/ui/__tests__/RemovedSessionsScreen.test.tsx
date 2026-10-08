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
  HistoryLifecycleResult,
  RemovedHistorySession,
} from "../../domains/history";
import {
  RESTORE_HISTORY_CONFIRMATION,
  parseHistoryLocalDate,
} from "../../domains/history";
import {
  RemovedSessionsScreen,
} from "../screens/RemovedSessionsScreen";
import {
  AppearanceProvider,
} from "../theme";
import {
  SemanticToastProvider,
} from "../components/SemanticToast";

const removedSession: RemovedHistorySession = {
  id: "removed-session",
  sourceLabel: "Manual visit",
  planName: "Full Body Foundation",
  dayName: "Full Body A",
  localDate: parseHistoryLocalDate("2026-08-25"),
  timezone: "Asia/Singapore",
  effectiveRevision: 3,
  removedAtMs: 1_724_429_170_000,
  workingSetProgress: { completed: 2, planned: 3, percent: 67 },
};

type Props = React.ComponentProps<typeof RemovedSessionsScreen>;

async function renderScreen(overrides: Partial<Props> = {}) {
  const props = {
    loadRemovedSessions: jest.fn(async () => [removedSession]),
    onBack: jest.fn(),
    onRestored: jest.fn(async (_sessionId: string): Promise<void> => undefined),
    restoreSession: jest.fn(async () => ({
      effectiveRevision: 4,
      lifecycle: "active" as const,
    })),
    ...overrides,
  } satisfies Props;

  await render(
    <AppearanceProvider>
      <SemanticToastProvider>
        <RemovedSessionsScreen {...props} />
      </SemanticToastProvider>
    </AppearanceProvider>,
  );
  return props;
}

describe("RemovedSessionsScreen", () => {
  it("uses stable loading geometry before the source-backed removed-session read resolves", async () => {
    let resolve: ((value: readonly RemovedHistorySession[]) => void) | undefined;
    await renderScreen({
      loadRemovedSessions: jest.fn(() => new Promise<readonly RemovedHistorySession[]>((next) => {
        resolve = next;
      })),
    });

    expect(screen.getByTestId("removed-sessions-skeleton")).toBeOnTheScreen();
    expect(screen.getByTestId("removed-sessions-skeleton")).toHaveProp(
      "accessibilityElementsHidden",
      true,
    );
    expect(screen.getByRole("progressbar", { name: "Loading removed sessions" }))
      .toBeOnTheScreen();
    resolve?.([]);
    expect(await screen.findByText("No removed sessions")).toBeOnTheScreen();
  });

  it("uses exact empty and retry copy while preserving unchanged saved-workout facts", async () => {
    const loadRemovedSessions = jest
      .fn<Promise<readonly RemovedHistorySession[]>, []>()
      .mockRejectedValueOnce(new Error("read unavailable"))
      .mockResolvedValueOnce([]);
    const props = await renderScreen({ loadRemovedSessions });

    expect(await screen.findByText("Removed sessions could not be loaded"))
      .toBeOnTheScreen();
    expect(screen.getByText(
      "Your saved workouts were not changed. Retry loading removed sessions.",
    )).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", {
      name: "Retry loading removed sessions",
    }));
    expect(await screen.findByText("No removed sessions")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Return to App Settings" }))
      .toBeOnTheScreen();
    expect(loadRemovedSessions).toHaveBeenCalledTimes(2);
    expect(props.onBack).not.toHaveBeenCalled();
  });

  it("renders zero, one, and many source rows in stable removed-time order with full restore labels", async () => {
    const newerSession: RemovedHistorySession = {
      ...removedSession,
      id: "newer-session",
      sourceLabel: "Newer manual visit",
      planName: null,
      dayName: null,
      removedAtMs: removedSession.removedAtMs + 1,
    };
    await renderScreen({ loadRemovedSessions: jest.fn(async () => [removedSession, newerSession]) });

    expect(await screen.findByText("Newer manual visit")).toBeOnTheScreen();
    const rows = screen.getAllByTestId(/removed-session-/u);
    expect(rows.map((row) => row.props.testID)).toEqual([
      "removed-session-newer-session",
      "removed-session-removed-session",
    ]);
    expect(screen.getByRole("button", { name: "Restore Newer manual visit" }))
      .toBeOnTheScreen();
    expect(screen.getByRole("button", {
      name: "Restore Full Body Foundation · Full Body A",
    })).toBeOnTheScreen();
  });

  it("shows source-backed retained context and waits for explicit restore confirmation", async () => {
    const props = await renderScreen();

    expect(await screen.findByText("Full Body Foundation · Full Body A"))
      .toBeOnTheScreen();
    expect(screen.getByText("2026-08-25")).toBeOnTheScreen();
    expect(screen.getByText("Working sets · 2/3 (67%)")).toBeOnTheScreen();
    expect(screen.getByText(/Removed · /u)).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole("button", {
      name: "Restore Full Body Foundation · Full Body A",
    }));
    expect(screen.getByRole("header", { name: "Restore this workout?" }))
      .toBeOnTheScreen();
    expect(screen.getByText(
      "Full Body Foundation · Full Body A (revision 3) returns to ordinary Calendar, history, records, and recommendations after the saved restore commits.",
    )).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Keep session removed" }))
      .toBeOnTheScreen();
    expect(props.restoreSession).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole("button", {
      name: "Restore workout",
    }));
    await waitFor(() => expect(props.restoreSession).toHaveBeenCalledWith({
      sessionId: "removed-session",
      expectedEffectiveRevision: 3,
      confirmation: RESTORE_HISTORY_CONFIRMATION,
    }));
    await waitFor(() => expect(props.onRestored).toHaveBeenCalledWith("removed-session"));
  });

  it("keeps the selected identity visible while busy and announces success only after callback and reload", async () => {
    let resolveRestore: (() => void) | undefined;
    let resolveCallback: (() => void) | undefined;
    let loadCount = 0;
    const props = await renderScreen({
      loadRemovedSessions: jest.fn(async () => {
        loadCount += 1;
        if (loadCount === 1) return [removedSession];
        return [];
      }),
      onRestored: jest.fn(() => new Promise<void>((resolve) => {
        resolveCallback = resolve;
      })),
      restoreSession: jest.fn(() => new Promise<HistoryLifecycleResult>((resolve) => {
        resolveRestore = () => resolve({ effectiveRevision: 4, lifecycle: "active" as const });
      })),
    });
    await screen.findByText("Full Body Foundation · Full Body A");

    await fireEvent.press(screen.getByRole("button", {
      name: "Restore Full Body Foundation · Full Body A",
    }));
    await fireEvent.press(screen.getByRole("button", { name: "Restore workout" }));

    expect(screen.getByRole("header", { name: "Restore this workout?" }))
      .toBeOnTheScreen();
    expect(screen.getByText("Full Body Foundation · Full Body A"))
      .toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Restore workout" }))
      .toHaveProp("accessibilityState", expect.objectContaining({ busy: true }));
    expect(screen.queryByText("Workout restored")).not.toBeOnTheScreen();

    resolveRestore?.();
    await waitFor(() => expect(props.onRestored).toHaveBeenCalledWith("removed-session"));
    expect(screen.queryByText("Workout restored")).not.toBeOnTheScreen();
    resolveCallback?.();

    expect(await screen.findByText("Workout restored")).toBeOnTheScreen();
    expect(screen.queryByText("Full Body Foundation · Full Body A")).not.toBeOnTheScreen();
  });

  it("keeps the retained card visible after a restore failure and offers a retry-safe outcome", async () => {
    const props = await renderScreen({
      restoreSession: jest.fn(async () => {
        throw new Error("storage unavailable");
      }),
    });
    await screen.findByText("Full Body Foundation · Full Body A");

    await fireEvent.press(screen.getByRole("button", {
      name: "Restore Full Body Foundation · Full Body A",
    }));
    await fireEvent.press(screen.getByRole("button", {
      name: "Restore workout",
    }));

    expect(await screen.findByText(
      "Restore failed. The workout remains removed. Try restore again when ready.",
    )).toBeOnTheScreen();
    expect(screen.getByText("Full Body Foundation · Full Body A"))
      .toBeOnTheScreen();
    expect(props.onRestored).not.toHaveBeenCalled();
  });
});
