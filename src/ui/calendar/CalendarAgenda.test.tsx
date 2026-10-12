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
    const rendered = await render(
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
    expect(JSON.stringify(rendered.toJSON())).not.toMatch(/garmin_connect_account|owner-a/u);
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

  it("never renders or announces private Garmin source identity", async () => {
    const rendered = await render(
      <AppearanceProvider>
        <CalendarAgenda
          {...common}
          events={[{
            id: "activity-local-1", source: "imported_activity", sport: "running", status: "imported",
            title: "Outdoor run", displaySummary: "5.00 km · 26:00", sourceLabel: "Garmin",
            sourceIdentity: { sourceKind: "garmin_connect_account", accountNamespace: "private-owner", externalActivityId: "external-private-1" },
            localDate: parseLocalDate("2026-11-01"), timeZone: "Asia/Singapore", scheduleId: null,
            scheduleVersionId: null, planId: null, slotId: null, revision: null, state: "imported",
            destination: { kind: "activity", activityId: "activity-local-1" },
          }]}
        />
      </AppearanceProvider>,
    );
    const renderedText = JSON.stringify(rendered.toJSON());
    expect(screen.getByText("Garmin")).toBeOnTheScreen();
    expect(renderedText).not.toMatch(/garmin_connect_account|private-owner|external-private-1/u);
  });
});
