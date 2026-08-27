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
    onRestored: jest.fn(),
    restoreSession: jest.fn(async () => ({
      effectiveRevision: 4,
      lifecycle: "active" as const,
    })),
    ...overrides,
  } satisfies Props;

  await render(
    <AppearanceProvider>
      <RemovedSessionsScreen {...props} />
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
    resolve?.([]);
    expect(await screen.findByText("No removed sessions")).toBeOnTheScreen();
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
