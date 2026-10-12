import { render, screen } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import React from "react";

import { parseLocalDate } from "../../domains/scheduling/localDate";
import { AppearanceProvider } from "../theme";
import { CalendarAgenda } from "./CalendarAgenda";

const rowRefs = { current: new Map() };
const common = {
  onActivateEvent: jest.fn(),
  onOpenEvent: jest.fn(),
  onRequestBack: jest.fn(),
  onScrollOffsetChange: jest.fn(),
  resetActivationKey: 0,
  rowRefs,
};

describe("CalendarAgenda factual copy", () => {
  it("renders the source-backed result summary verbatim", async () => {
    await render(
      <AppearanceProvider>
        <CalendarAgenda
          {...common}
          events={[{
            id: "completed", source: "strength", sport: "strength", status: "completed",
            title: "Full body A", displaySummary: "3 of 4 working sets completed", sourceLabel: "Strength",
            localDate: parseLocalDate("2026-11-01"), timeZone: "Asia/Singapore", scheduleId: "schedule",
            scheduleVersionId: "version", planId: "plan", slotId: null, revision: 1, state: "completed",
            destination: { kind: "session", sessionId: "session" },
          }]}
        />
      </AppearanceProvider>,
    );
    expect(screen.getByText("3 of 4 working sets completed")).toBeOnTheScreen();
    expect(screen.queryByText("Completed result")).toBeNull();
  });

  it("distinguishes a source-backed rest day from an empty date", async () => {
    const rendered = await render(
      <AppearanceProvider>
        <CalendarAgenda
          {...common}
          day={{ localDate: parseLocalDate("2026-11-02"), kind: "rest", restSummary: "Full body plan. Nothing to resume or review." }}
          events={[]}
        />
      </AppearanceProvider>,
    );
    expect(screen.getByText("Recovery is the plan")).toBeOnTheScreen();
    expect(screen.getByText("Full body plan. Nothing to resume or review.")).toBeOnTheScreen();

    await rendered.rerender(
      <AppearanceProvider>
        <CalendarAgenda
          {...common}
          day={{ localDate: parseLocalDate("2026-11-03"), kind: "empty", restSummary: null }}
          events={[]}
        />
      </AppearanceProvider>,
    );
    expect(screen.getByText("No scheduled or imported activity for this date.")).toBeOnTheScreen();
    expect(screen.queryByText("Recovery is the plan")).toBeNull();
  });
});
