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
import * as ReactNative from "react-native";
import { StyleSheet } from "react-native";
import { Gesture } from "react-native-gesture-handler";

import type { CalendarRange, CalendarReadPort } from "../calendar/calendarPorts";
import { CalendarScreen } from "../screens/CalendarScreen";
import { AppearanceProvider } from "../theme";

const range = Object.freeze({
  events: Object.freeze([Object.freeze({
    id: "strength-opportunity-1",
    source: "strength",
    sport: "strength",
    status: "planned",
    title: "Full body progression, week 12",
    displaySummary: "Full body progression · 3 working sets planned",
    sourceLabel: "Strength",
    localDate: "2026-08-24",
    timeZone: "Asia/Singapore",
    scheduleId: "schedule-1",
    scheduleVersionId: "version-1",
    planId: "plan-1",
    slotId: null,
    revision: 1,
    state: "planned",
    destination: Object.freeze({
      kind: "occurrence",
      occurrenceId: "strength-opportunity-1",
    }),
  })]),
}) as CalendarRange;

const completedStrengthRange = Object.freeze({
  events: Object.freeze([Object.freeze({
    ...range.events[0],
    id: "strength-session-1",
    state: "completed",
    status: "completed",
    destination: Object.freeze({
      kind: "session" as const,
      sessionId: "strength-session-1",
    }),
  })]),
}) as CalendarRange;

const agendaRange = Object.freeze({
  events: Object.freeze([
    Object.freeze({
      ...completedStrengthRange.events[0],
      id: "partial-strength-1",
      state: "partial",
      status: "partial",
      destination: Object.freeze({ kind: "session" as const, sessionId: "partial-strength-1" }),
    }),
    Object.freeze({
      ...range.events[0],
      id: "planned-strength-1",
      destination: Object.freeze({ kind: "occurrence" as const, occurrenceId: "planned-strength-1" }),
    }),
    Object.freeze({
      ...range.events[0],
      id: "planned-running-1",
      source: "running" as const,
      sport: "running" as const,
      sourceLabel: "Tempo",
      title: "Tempo progression",
      destination: Object.freeze({ kind: "plan" as const, planId: "running-plan-1", sessionId: "session-revision-1" }),
    }),
    Object.freeze({
      ...range.events[0],
      id: "imported-running-1",
      source: "imported_activity" as const,
      sport: "running" as const,
      sourceLabel: "Garmin",
      status: "imported" as const,
      state: "imported",
      title: "Outdoor run",
      destination: Object.freeze({ kind: "activity" as const, activityId: "activity-1" }),
    }),
  ]),
}) as CalendarRange;

async function measureFocusedRows(selectedStart: string, followingStart: string): Promise<void> {
  const measure = async (testID: string, y: number) => {
    const row = await waitFor(() => {
      // Expansion hides the measured month rows behind visible week overlays.
      const interactiveRow = screen.getAllByTestId(testID, { includeHiddenElements: true })
        .find((candidate) => typeof candidate.props.onLayout === "function");
      if (interactiveRow === undefined) throw new Error(`missing interactive row ${testID}`);
      return interactiveRow;
    });
    await fireEvent(row, "layout", { nativeEvent: { layout: { height: 70, width: 360, x: 0, y } } });
  };
  await measure(`calendar-week-row-${selectedStart}`, 280);
  await measure(`calendar-week-row-${followingStart}`, 350);
}

async function measureAugustFocusedRows(): Promise<void> {
  await measureFocusedRows("2026-08-24", "2026-08-31");
}

describe("CalendarScreen", () => {
  it("records one mounted drag-expand-collapse diagnostic sequence", async () => {
    const createPan = Gesture.Pan.bind(Gesture);
    let latestPan: unknown;
    const panSpy = jest.spyOn(Gesture, "Pan").mockImplementation(() => {
      latestPan = createPan();
      return latestPan as ReturnType<typeof Gesture.Pan>;
    });
    const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
    const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
    let frameCallback: ((timestamp: number) => void) | undefined;
    globalThis.requestAnimationFrame = jest.fn((callback: (timestamp: number) => void) => {
      frameCallback = callback;
      return 1;
    });
    globalThis.cancelAnimationFrame = jest.fn();
    const producer = {
      recordQuery: jest.fn(),
      recordInteraction: jest.fn(),
      exportResult: jest.fn(() => Object.freeze({
        producer: "v12-calendar-native-diagnostics/v1" as const,
        native_execution: "EXECUTED" as const,
        query_samples: Object.freeze([]),
        interaction_samples: Object.freeze([]),
      })),
    };
    try {
      await render(
        <AppearanceProvider>
          <CalendarScreen
            diagnostics={{ producer, request: { querySamples: 0, interactionSamples: 1 } }}
            initialDate="2026-08-24"
            loadCalendarRange={jest.fn(async () => range)}
            onOpenEvent={jest.fn()}
            today="2026-08-24"
          />
        </AppearanceProvider>,
      );
      await screen.findByText("Full body progression, week 12");
      await fireEvent(screen.getByTestId("calendar-month-viewport"), "layout", {
        nativeEvent: { layout: { height: 500, width: 400, x: 0, y: 0 } },
      });
      const handlers = (latestPan as { handlers: {
        onBegin?: () => void;
        onEnd?: (event: Readonly<{ translationX: number; translationY: number }>, success: boolean) => void;
      } }).handlers;
      await act(async () => {
        handlers.onBegin?.();
        handlers.onEnd?.({ translationX: -100, translationY: 0 }, true);
        frameCallback?.(16);
        frameCallback?.(33);
      });
      expect(await screen.findByText("Sep 2026")).toBeOnTheScreen();
      await measureFocusedRows("2026-08-31", "2026-09-07");
      await fireEvent.press(screen.getByTestId("calendar-day-2026-09-01"));
      const collapse = await screen.findByRole("button", { name: "Collapse day and return to month" });
      await fireEvent.press(collapse);

      await waitFor(() => expect(producer.recordInteraction).toHaveBeenCalledTimes(1));
      expect(producer.recordInteraction).toHaveBeenCalledWith(expect.objectContaining({
        frameWorkMs: expect.arrayContaining([expect.any(Number)]),
        missedFrames: expect.any(Number),
        refreshRateHz: expect.any(Number),
        profilerOverheadMs: expect.any(Number),
      }));
      expect(producer.exportResult).toHaveBeenCalledTimes(1);
    } finally {
      panSpy.mockRestore();
      globalThis.requestAnimationFrame = originalRequestAnimationFrame;
      globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
    }
  });

  it("orders Back, geometry rejection, and inert preview input", async () => {
    let requestBack: Parameters<typeof ReactNative.BackHandler.addEventListener>[1] | undefined;
    const hardwareBackEvent = {} as ReactNative.HardwareBackPressEvent;
    const removeBack = jest.fn();
    const backSpy = jest.spyOn(ReactNative.BackHandler, "addEventListener").mockImplementation((_event, callback) => {
      requestBack = callback;
      return { remove: removeBack };
    });
    const onRequestRootBack = jest.fn();
    try {
      const rendered = await render(
        <AppearanceProvider>
          <CalendarScreen
            initialDate="2026-08-24"
            loadCalendarRange={jest.fn(async () => range)}
            onOpenEvent={jest.fn()}
            onRequestRootBack={onRequestRootBack}
            today="2026-08-24"
          />
        </AppearanceProvider>,
      );
      await screen.findByText("Full body progression, week 12");
      const row = screen.getAllByTestId("calendar-week-row-2026-08-24")
        .find((candidate) => typeof candidate.props.onLayout === "function")!;
      await fireEvent(row, "layout", { nativeEvent: { layout: { height: 0, width: 360, x: 0, y: Number.NaN } } });
      await fireEvent(row, "layout", { nativeEvent: { layout: { height: 70, width: 360, x: 0, y: 280 } } });
      await fireEvent(row, "layout", { nativeEvent: { layout: { height: 70, width: 360, x: 0, y: 280 } } });

      const hiddenPreview = screen.getAllByTestId("calendar-day-2026-06-29", { includeHiddenElements: true })[0]!;
      await fireEvent(hiddenPreview, "keyDown", { nativeEvent: { key: "ArrowRight" } });
      await fireEvent.press(hiddenPreview);

      await act(async () => { expect(requestBack?.(hardwareBackEvent)).toBe(true); });
      expect(onRequestRootBack).toHaveBeenCalledTimes(1);
      await fireEvent.press(screen.getByRole("button", { name: "Open Calendar key" }));
      await act(async () => { expect(requestBack?.(hardwareBackEvent)).toBe(true); });
      expect(screen.queryByRole("header", { name: "Calendar key" })).toBeNull();
      expect(onRequestRootBack).toHaveBeenCalledTimes(1);

      await measureAugustFocusedRows();
      await fireEvent.press(screen.getByTestId("calendar-day-2026-08-24"));
      await fireEvent(screen.getByTestId("calendar-agenda-scroll"), "scroll", {
        nativeEvent: { contentOffset: { x: 0, y: 18 } },
      });
      await act(async () => { expect(requestBack?.(hardwareBackEvent)).toBe(true); });
      expect(screen.queryByRole("button", { name: "Collapse day and return to month" })).toBeNull();
      expect(onRequestRootBack).toHaveBeenCalledTimes(1);
      await rendered.unmount();
      expect(removeBack).toHaveBeenCalled();
    } finally {
      backSpy.mockRestore();
    }
  });

  it("moves Today across months through the same settled destination", async () => {
    const loadCalendarRange = jest.fn(async () => range);
    await render(
      <AppearanceProvider>
        <CalendarScreen
          initialDate="2026-08-24"
          loadCalendarRange={loadCalendarRange}
          onOpenEvent={jest.fn()}
          today="2026-10-13"
        />
      </AppearanceProvider>,
    );
    await screen.findByText("Full body progression, week 12");
    await fireEvent.press(screen.getByRole("button", { name: "Return to today, 13 October 2026" }));
    expect(await screen.findByText("Oct 2026")).toBeOnTheScreen();
    await waitFor(() => expect(loadCalendarRange).toHaveBeenLastCalledWith({
      startLocalDate: "2026-08-31",
      endLocalDateExclusive: "2026-12-14",
    }));
  });

  it("keeps a same-month Today selection as the source for later clamped navigation", async () => {
    await render(
      <AppearanceProvider>
        <CalendarScreen
          initialDate="2026-08-24"
          loadCalendarRange={jest.fn(async () => range)}
          onOpenEvent={jest.fn()}
          today="2026-08-31"
        />
      </AppearanceProvider>,
    );
    await screen.findByText("Full body progression, week 12");

    await fireEvent.press(screen.getByRole("button", { name: "Return to today, 31 August 2026" }));
    await fireEvent.press(screen.getByRole("button", { name: "Show September 2026" }));

    await screen.findByText("Sep 2026");
    await waitFor(() => expect(screen.getAllByTestId("calendar-day-2026-09-30").some((node) => node.props.accessibilityState?.selected === true)).toBe(true));
  });

  it("records bounded source-backed query aggregates through the routed diagnostics producer", async () => {
    const producer = {
      recordQuery: jest.fn(),
      recordInteraction: jest.fn(),
      exportResult: jest.fn(() => Object.freeze({
        producer: "v12-calendar-native-diagnostics/v1" as const,
        native_execution: "EXECUTED" as const,
        query_samples: Object.freeze([]),
        interaction_samples: Object.freeze([]),
      })),
    };
    await render(
      <AppearanceProvider>
        <CalendarScreen
          diagnostics={{ producer, request: { querySamples: 1, interactionSamples: 0 } }}
          initialDate="2026-08-24"
          loadCalendarRange={jest.fn(async () => range)}
          onOpenEvent={jest.fn()}
          today="2026-08-24"
        />
      </AppearanceProvider>,
    );
    await screen.findByText("Full body progression, week 12");
    expect(producer.recordQuery).toHaveBeenCalledWith({
      durationMs: expect.any(Number),
      eventCount: 1,
      importedCount: 0,
      planCount: 1,
    });
    expect(producer.exportResult).toHaveBeenCalledTimes(1);
  });

  it("opens one completed Strength agenda target without giving the date cell a nested event action", async () => {
    const onOpenEvent = jest.fn();
    const loadCalendarRange = jest.fn(async () => completedStrengthRange);

    await render(
      <AppearanceProvider>
        <CalendarScreen
          initialDate="2026-08-24"
          loadCalendarRange={loadCalendarRange}
          onOpenEvent={onOpenEvent}
          today="2026-08-24"
        />
      </AppearanceProvider>,
    );

    expect(await screen.findByRole("header", { name: "Calendar" }))
      .toBeOnTheScreen();
    expect(screen.getByText("Mon")).toBeOnTheScreen();
    expect(screen.getByText("Full body progression, week 12")).toBeOnTheScreen();
    expect(StyleSheet.flatten(screen.getByTestId("calendar-event-chip-strength-session-1").props.style)).toMatchObject({
      backgroundColor: "#D9782024",
      borderColor: "#D97820",
      borderStyle: "solid",
      borderWidth: 1,
    });

    const day = screen.getByRole("button", {
      name: /24 August 2026.*Full body progression, week 12.*Strength.*Complete/u,
    });
    await measureAugustFocusedRows();
    await fireEvent.press(day);

    expect(onOpenEvent).not.toHaveBeenCalled();
    expect(screen.getByTestId("calendar-month-viewport").children.flatMap((child) => {
      if (typeof child !== "object" || child === null || !("props" in child)) return [];
      const testID = (child as { props: Readonly<{ testID?: unknown }> }).props.testID;
      return typeof testID === "string" && testID.startsWith("calendar-focused-") ? [testID] : [];
    })).toEqual([
      "calendar-focused-selected-week",
      "calendar-focused-agenda",
      "calendar-focused-following-week",
    ]);
    const agendaTarget = await screen.findByTestId("calendar-agenda-event-strength-session-1");
    await fireEvent.press(agendaTarget);

    expect(onOpenEvent).toHaveBeenCalledTimes(1);
    expect(onOpenEvent).toHaveBeenCalledWith(
      completedStrengthRange.events[0]!.destination,
      "strength-session-1",
    );
    expect(loadCalendarRange).toHaveBeenCalledWith({
      startLocalDate: "2026-06-29",
      endLocalDateExclusive: "2026-10-12",
    });
  });

  it("keeps events at both adjacent-panel outer boundaries in the rendered previews", async () => {
    const boundaryRange = Object.freeze({
      events: Object.freeze([
        Object.freeze({
          ...range.events[0],
          id: "previous-boundary",
          localDate: "2026-06-29",
          title: "Previous boundary session",
          destination: Object.freeze({ kind: "occurrence" as const, occurrenceId: "previous-boundary" }),
        }),
        Object.freeze({
          ...range.events[0],
          id: "next-boundary",
          localDate: "2026-10-04",
          title: "Next boundary session",
          destination: Object.freeze({ kind: "occurrence" as const, occurrenceId: "next-boundary" }),
        }),
      ]),
    }) as CalendarRange;
    const loadCalendarRange = jest.fn(async () => boundaryRange);

    await render(
      <AppearanceProvider>
        <CalendarScreen
          initialDate="2026-08-24"
          loadCalendarRange={loadCalendarRange}
          onOpenEvent={jest.fn()}
          today="2026-08-24"
        />
      </AppearanceProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("calendar-event-chip-previous-boundary", { includeHiddenElements: true })).toBeOnTheScreen();
      expect(screen.getByTestId("calendar-event-chip-next-boundary", { includeHiddenElements: true })).toBeOnTheScreen();
    });
    expect(loadCalendarRange).toHaveBeenCalledWith({
      startLocalDate: "2026-06-29",
      endLocalDateExclusive: "2026-10-12",
    });
  });

  it("keeps Previous, Today, Next, and the modal-only Calendar key reachable", async () => {
    const loadCalendarRange = jest.fn(async () => range);

    await render(
      <AppearanceProvider>
        <CalendarScreen
          initialDate="2026-08-24"
          loadCalendarRange={loadCalendarRange}
          onOpenEvent={jest.fn()}
          today="2026-08-24"
        />
      </AppearanceProvider>,
    );

    expect(await screen.findByRole("button", { name: "Return to today, 24 August 2026" }))
      .toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Return to today, 24 August 2026" }))
      .toHaveStyle({ backgroundColor: "transparent" });
    expect(screen.getByRole("button", { name: "Show July 2026" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Show September 2026" })).toBeOnTheScreen();
    expect(StyleSheet.flatten(screen.getByTestId("screen-header-actions").props.style)).toMatchObject({ flexDirection: "row", gap: 2 });
    expect(screen.queryByText("i", { exact: true })).toBeNull();
    expect(StyleSheet.flatten(screen.getByTestId("calendar-month-title").props.style)).toMatchObject({ fontFamily: "ArchivoVariable", fontSize: 22 });
    expect(StyleSheet.flatten(screen.getAllByTestId("calendar-date-number-2026-08-24")[0]!.props.style)).toMatchObject({ fontFamily: "IBMPlexMono_400Regular", fontSize: 16 });

    await fireEvent.press(screen.getByRole("button", { name: "Open Calendar key" }));

    expect(screen.getByRole("header", { name: "Calendar key" })).toBeOnTheScreen();
    expect(StyleSheet.flatten(screen.getByText("Calendar key").props.style)).toMatchObject({
      fontFamily: "ArchivoVariable",
      fontSize: 22,
      fontWeight: "800",
    });
    expect(screen.getByTestId("bottom-sheet-header")).toHaveStyle({ paddingHorizontal: 14 });
    expect(StyleSheet.flatten(screen.getByTestId("bottom-sheet-scroll").props.contentContainerStyle)).toMatchObject({ paddingHorizontal: 14 });
    expect(screen.getByText("Color identifies the activity. Fill and border style identify its status."))
      .toBeOnTheScreen();
    expect(screen.getByText("ACTIVITY")).toBeOnTheScreen();
    expect(screen.getByTestId("calendar-key-strength-swatch")).toHaveStyle({ backgroundColor: "#D97820", borderRadius: 2, height: 8, width: 24 });
    expect(screen.getByTestId("calendar-key-running-swatch")).toHaveStyle({ backgroundColor: "#195FAE", borderRadius: 2, height: 8, width: 24 });
    expect(screen.getByText("STATUS")).toBeOnTheScreen();
    expect(screen.queryByText("Complete", { exact: true })).not.toBeNull();
    expect(StyleSheet.flatten(screen.getByTestId("calendar-key-complete").props.style).backgroundColor).toBe("#0D0C0A24");
    expect(screen.getByTestId("calendar-key-complete")).toHaveStyle({ height: 13, width: 22 });
    expect(screen.getByTestId("calendar-key-complete")).not.toHaveTextContent("Complete");
    expect(StyleSheet.flatten(screen.getByTestId("calendar-key-partial-fill").props.style).backgroundColor).toBe("#0D0C0A2E");
    expect(screen.getByTestId("calendar-key-partial")).toHaveStyle({ height: 13, width: 22 });
    expect(screen.getByTestId("calendar-key-partial")).not.toHaveTextContent("Partial");
    expect(StyleSheet.flatten(screen.getByTestId("calendar-key-planned").props.style).backgroundColor).toBe("transparent");
    expect(screen.getByTestId("calendar-key-planned")).toHaveStyle({ height: 13, width: 22 });
    expect(screen.getByTestId("calendar-key-planned")).not.toHaveTextContent("Planned");

    await fireEvent.press(screen.getByRole("button", { name: "Close Calendar key" }));
    expect(screen.queryByRole("header", { name: "Calendar key" })).toBeNull();
  });

  it("renders the exact transparent 9dp date atom and centered 28dp today ring", async () => {
    await render(
      <AppearanceProvider>
        <CalendarScreen
          initialDate="2026-08-24"
          loadCalendarRange={jest.fn(async () => range)}
          onOpenEvent={jest.fn()}
          onOpenSettings={jest.fn()}
          today="2026-08-24"
        />
      </AppearanceProvider>,
    );
    const ordinary = await screen.findByTestId("calendar-day-2026-08-25");
    const todayTrack = screen.getByTestId("calendar-date-track-2026-08-24");
    const eventTrack = screen.getByTestId("calendar-event-track-2026-08-24");
    expect(ordinary).toHaveStyle({ borderColor: "transparent", borderRadius: 9, borderWidth: 1 });
    expect(todayTrack).toHaveStyle({ alignItems: "center", alignSelf: "center", borderWidth: 2, width: 28 });
    expect(eventTrack).toHaveStyle({ marginTop: 2 });
  });

  it("moves arrow focus to the selected civil date and transfers focus through expand and Collapse", async () => {
    await render(
      <AppearanceProvider>
        <CalendarScreen
          initialDate="2026-08-24"
          loadCalendarRange={jest.fn(async () => range)}
          onOpenEvent={jest.fn()}
          today="2026-08-24"
        />
      </AppearanceProvider>,
    );
    await screen.findByText("Full body progression, week 12");

    await fireEvent(screen.getByTestId("calendar-day-2026-08-24"), "keyDown", { nativeEvent: { key: "ArrowRight" } });
    await waitFor(() => expect(screen.getAllByTestId("calendar-day-2026-08-25").some((node) => node.props.hasTVPreferredFocus === true)).toBe(true));
    const focusedDate = screen.getAllByTestId("calendar-day-2026-08-25").find((node) => node.props.hasTVPreferredFocus === true)!;
    await fireEvent(focusedDate, "focus");
    expect(focusedDate).toHaveStyle({ outlineOffset: 4, outlineWidth: 3 });

    await measureAugustFocusedRows();
    await fireEvent.press(screen.getByTestId("calendar-day-2026-08-25"));
    const collapse = await screen.findByRole("button", { name: "Collapse day and return to month" });
    expect(collapse).toHaveStyle({ height: 48, position: "absolute", right: 0, top: 0, width: 48 });
    expect(screen.getByTestId("calendar-agenda-heading")).toContainElement(collapse);
    await waitFor(() => expect(collapse).toHaveProp("hasTVPreferredFocus", true));

    await fireEvent(collapse, "keyDown", { nativeEvent: { key: "Enter" } });
    await waitFor(() => expect(screen.getAllByTestId("calendar-day-2026-08-25").some((node) => node.props.hasTVPreferredFocus === true)).toBe(true));
  });

  it("renders sport-tinted status geometry and source-backed rest facts independently", async () => {
    const visual = await render(
      <AppearanceProvider>
        <CalendarScreen
          initialDate="2026-08-24"
          loadCalendarRange={jest.fn(async () => agendaRange)}
          onOpenEvent={jest.fn()}
          today="2026-08-24"
        />
      </AppearanceProvider>,
    );
    await screen.findByText("Full body progression, week 12");
    expect(StyleSheet.flatten(screen.getByTestId("calendar-event-chip-partial-strength-1").props.style)).toMatchObject({
      backgroundColor: "transparent",
      borderColor: "#D97820",
      borderStyle: "dotted",
      borderWidth: 2,
    });
    expect(StyleSheet.flatten(screen.getByTestId("calendar-event-partial-fill-partial-strength-1").props.style).backgroundColor).toBe("#D978202E");
    expect(StyleSheet.flatten(screen.getByTestId("calendar-event-chip-planned-strength-1").props.style)).toMatchObject({
      backgroundColor: "transparent",
      borderStyle: "dashed",
      borderWidth: 2,
    });

    const restRange = Object.freeze({
      events: Object.freeze([]),
      days: Object.freeze([{ localDate: "2026-08-24", kind: "rest", restSummary: "Full body plan. Nothing to resume or review." }]),
    }) as unknown as CalendarRange;
    await visual.rerender(
      <AppearanceProvider>
        <CalendarScreen
          initialDate="2026-08-24"
          loadCalendarRange={jest.fn(async () => restRange)}
          onOpenEvent={jest.fn()}
          today="2026-08-24"
        />
      </AppearanceProvider>,
    );
    expect(await screen.findByTestId("calendar-rest-2026-08-24")).toHaveTextContent("—");
    expect(screen.getByRole("button", { name: /24 August 2026.*Rest day.*No workout/u })).toBeOnTheScreen();
    await measureAugustFocusedRows();
    await fireEvent.press(screen.getByTestId("calendar-day-2026-08-24"));
    expect(await screen.findByText("Recovery is the plan")).toBeOnTheScreen();
    expect(screen.getByText("Full body plan. Nothing to resume or review.")).toBeOnTheScreen();
  });

  it("waits for the authoritative return refresh before focusing a surviving row or selected-date fallback", async () => {
    const removedRange = Object.freeze({
      events: Object.freeze([]),
      days: Object.freeze([{ localDate: "2026-08-24", kind: "empty", restSummary: null }]),
    }) as unknown as CalendarRange;
    const loadCalendarRange = jest.fn<() => Promise<CalendarRange>>()
      .mockResolvedValueOnce(completedStrengthRange)
      .mockResolvedValueOnce(removedRange);
    const rendered = await render(
      <AppearanceProvider>
        <CalendarScreen
          initialDate="2026-08-24"
          loadCalendarRange={loadCalendarRange}
          onOpenEvent={jest.fn()}
          returnFocusGeneration={0}
          today="2026-08-24"
        />
      </AppearanceProvider>,
    );
    await screen.findByText("Full body progression, week 12");
    await measureAugustFocusedRows();
    await fireEvent.press(screen.getByTestId("calendar-day-2026-08-24"));
    await fireEvent.press(await screen.findByTestId("calendar-agenda-event-strength-session-1"));

    await rendered.rerender(
      <AppearanceProvider>
        <CalendarScreen
          initialDate="2026-08-24"
          loadCalendarRange={loadCalendarRange}
          onOpenEvent={jest.fn()}
          returnFocusGeneration={1}
          today="2026-08-24"
        />
      </AppearanceProvider>,
    );

    await waitFor(() => expect(loadCalendarRange).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getAllByTestId("calendar-day-2026-08-24").some((node) => node.props.hasTVPreferredFocus === true)).toBe(true));
    expect(screen.queryByTestId("calendar-agenda-event-strength-session-1")).toBeNull();
  });

  it("routes focused Next, Today, and Previous through collapse, selection, remeasurement, and expansion", async () => {
    await render(
      <AppearanceProvider>
        <CalendarScreen
          initialDate="2026-08-24"
          loadCalendarRange={jest.fn(async () => range)}
          onOpenEvent={jest.fn()}
          today="2026-08-24"
        />
      </AppearanceProvider>,
    );
    await screen.findByText("Full body progression, week 12");
    await measureAugustFocusedRows();
    await fireEvent.press(screen.getByTestId("calendar-day-2026-08-24"));

    await fireEvent.press(screen.getByRole("button", { name: "Show September 2026" }));
    await screen.findByText("Sep 2026");
    await measureFocusedRows("2026-09-21", "2026-09-28");
    await waitFor(() => expect(screen.getAllByTestId("calendar-day-2026-09-24").some((node) => node.props.hasTVPreferredFocus === true)).toBe(true));
    expect(screen.getByTestId("calendar-focused-agenda")).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole("button", { name: "Return to today, 24 August 2026" }));
    await screen.findByText("Aug 2026");
    await measureAugustFocusedRows();
    await waitFor(() => expect(screen.getAllByTestId("calendar-day-2026-08-24").some((node) => node.props.hasTVPreferredFocus === true)).toBe(true));

    await fireEvent.press(screen.getByRole("button", { name: "Show July 2026" }));
    await screen.findByText("Jul 2026");
    await measureFocusedRows("2026-07-20", "2026-07-27");
    await waitFor(() => expect(screen.getAllByTestId("calendar-day-2026-07-24").some((node) => node.props.hasTVPreferredFocus === true)).toBe(true));
  });

  it("keeps all selected-date agenda identities in source order and exposes no management command", async () => {
    await render(
      <AppearanceProvider>
        <CalendarScreen
          initialDate="2026-08-24"
          loadCalendarRange={jest.fn(async () => agendaRange)}
          onOpenEvent={jest.fn()}
          today="2026-08-24"
        />
      </AppearanceProvider>,
    );

    await measureAugustFocusedRows();
    await fireEvent.press(await screen.findByRole("button", { name: /24 August 2026.*4 scheduled or imported events/u }));

    expect(await screen.findByLabelText("4 scheduled or imported events")).toBeOnTheScreen();
    expect(screen.getAllByTestId(/calendar-agenda-event/u).map((node) => node.props.testID)).toEqual([
      "calendar-agenda-event-partial-strength-1",
      "calendar-agenda-event-planned-strength-1",
      "calendar-agenda-event-planned-running-1",
      "calendar-agenda-event-imported-running-1",
    ]);
    expect(screen.queryByText(/resume|correct|remove|match workout/u)).toBeNull();
  });

  it("restores the retained expanded month after Calendar returns from a detail route", async () => {
    const onOpenEvent = jest.fn();
    const loadCalendarRange = jest.fn(async () => completedStrengthRange);
    const rendered = await render(
      <AppearanceProvider>
        <CalendarScreen
          initialDate="2026-08-24"
          loadCalendarRange={loadCalendarRange}
          onOpenEvent={onOpenEvent}
          returnFocusGeneration={0}
          today="2026-08-24"
        />
      </AppearanceProvider>,
    );

    await measureAugustFocusedRows();
    await fireEvent.press(await screen.findByRole("button", { name: /24 August 2026.*Complete/u }));
    await fireEvent.press(await screen.findByRole("button", { name: /Full body progression.*Open details/u }));
    await fireEvent.press(screen.getByRole("button", { name: "Show September 2026" }));
    expect(await screen.findByText("Sep 2026")).toBeOnTheScreen();

    await rendered.rerender(
      <AppearanceProvider>
        <CalendarScreen
          initialDate="2026-08-24"
          loadCalendarRange={loadCalendarRange}
          onOpenEvent={onOpenEvent}
          returnFocusGeneration={1}
          today="2026-08-24"
        />
      </AppearanceProvider>,
    );

    expect(await screen.findByText("Aug 2026")).toBeOnTheScreen();
    await waitFor(() => {
      expect(loadCalendarRange).toHaveBeenLastCalledWith({
        startLocalDate: "2026-06-29",
        endLocalDateExclusive: "2026-10-12",
      });
    });
    expect(onOpenEvent).toHaveBeenCalledTimes(1);
  });

  it("refreshes the retained source range when a Calendar-origin detail returns without changing month", async () => {
    const onOpenEvent = jest.fn();
    const loadCalendarRange = jest.fn(async () => completedStrengthRange);
    const rendered = await render(
      <AppearanceProvider>
        <CalendarScreen
          initialDate="2026-08-24"
          loadCalendarRange={loadCalendarRange}
          onOpenEvent={onOpenEvent}
          returnFocusGeneration={0}
          today="2026-08-24"
        />
      </AppearanceProvider>,
    );

    await measureAugustFocusedRows();
    await fireEvent.press(await screen.findByRole("button", { name: /24 August 2026.*Complete/u }));
    await fireEvent.press(await screen.findByRole("button", { name: /Full body progression.*Open details/u }));
    const callsBeforeReturn = loadCalendarRange.mock.calls.length;

    await rendered.rerender(
      <AppearanceProvider>
        <CalendarScreen
          initialDate="2026-08-24"
          loadCalendarRange={loadCalendarRange}
          onOpenEvent={onOpenEvent}
          returnFocusGeneration={1}
          today="2026-08-24"
        />
      </AppearanceProvider>,
    );

    await waitFor(() => expect(loadCalendarRange.mock.calls.length).toBeGreaterThan(callsBeforeReturn));
  });

  it("refreshes on root refocus before any detail visit", async () => {
    const loadCalendarRange = jest.fn(async () => range);
    const rendered = await render(
      <AppearanceProvider>
        <CalendarScreen
          initialDate="2026-08-24"
          loadCalendarRange={loadCalendarRange}
          onOpenEvent={jest.fn()}
          returnFocusGeneration={0}
          today="2026-08-24"
        />
      </AppearanceProvider>,
    );
    await screen.findByText("Full body progression, week 12");
    const callsBeforeRefocus = loadCalendarRange.mock.calls.length;

    await rendered.rerender(
      <AppearanceProvider>
        <CalendarScreen
          initialDate="2026-08-24"
          loadCalendarRange={loadCalendarRange}
          onOpenEvent={jest.fn()}
          returnFocusGeneration={1}
          today="2026-08-24"
        />
      </AppearanceProvider>,
    );

    await waitFor(() => expect(loadCalendarRange.mock.calls.length).toBeGreaterThan(callsBeforeRefocus));
    expect(screen.getByText("Aug 2026")).toBeOnTheScreen();
  });

  it("consumes detail return state once and keeps the owner's later month on root refocus", async () => {
    const loadCalendarRange = jest.fn(async () => completedStrengthRange);
    const rendered = await render(
      <AppearanceProvider>
        <CalendarScreen
          initialDate="2026-08-24"
          loadCalendarRange={loadCalendarRange}
          onOpenEvent={jest.fn()}
          returnFocusGeneration={0}
          today="2026-08-24"
        />
      </AppearanceProvider>,
    );
    await measureAugustFocusedRows();
    await fireEvent.press(await screen.findByRole("button", { name: /24 August 2026.*Complete/u }));
    await fireEvent.press(await screen.findByRole("button", { name: /Full body progression.*Open details/u }));
    await rendered.rerender(
      <AppearanceProvider>
        <CalendarScreen
          initialDate="2026-08-24"
          loadCalendarRange={loadCalendarRange}
          onOpenEvent={jest.fn()}
          returnFocusGeneration={1}
          today="2026-08-24"
        />
      </AppearanceProvider>,
    );
    expect(await screen.findByText("Aug 2026")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Show September 2026" }));
    expect(await screen.findByText("Sep 2026")).toBeOnTheScreen();
    const callsBeforeRootReturn = loadCalendarRange.mock.calls.length;

    await rendered.rerender(
      <AppearanceProvider>
        <CalendarScreen
          initialDate="2026-08-24"
          loadCalendarRange={loadCalendarRange}
          onOpenEvent={jest.fn()}
          returnFocusGeneration={2}
          today="2026-08-24"
        />
      </AppearanceProvider>,
    );

    await waitFor(() => expect(loadCalendarRange.mock.calls.length).toBeGreaterThan(callsBeforeRootReturn));
    expect(screen.getByText("Sep 2026")).toBeOnTheScreen();
    expect(screen.queryByText("Aug 2026")).toBeNull();
  });

  it("retains the last good month during refresh and retries the exact failed range", async () => {
    let rejectNextRange: ((error: Error) => void) | undefined;
    const loadCalendarRange = jest.fn() as jest.MockedFunction<CalendarReadPort["loadCalendarRange"]>;
    loadCalendarRange
      .mockResolvedValueOnce(range)
      .mockImplementationOnce(() => new Promise<CalendarRange>((_resolve, reject) => {
        rejectNextRange = reject;
      }))
      .mockResolvedValueOnce(range);

    await render(
      <AppearanceProvider>
        <CalendarScreen
          initialDate="2026-08-24"
          loadCalendarRange={loadCalendarRange}
          onOpenEvent={jest.fn()}
          today="2026-08-24"
        />
      </AppearanceProvider>,
    );

    expect(await screen.findByText("Full body progression, week 12")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Show September 2026" }));

    expect(screen.getByText("Updating Calendar")).toBeOnTheScreen();
    expect(screen.getByText("Full body progression, week 12")).toBeOnTheScreen();
    expect(screen.getByText("Aug 2026")).toBeOnTheScreen();
    expect(screen.queryByText("Sep 2026")).toBeNull();
    expect(screen.getByRole("button", { name: "Show July 2026" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Show September 2026" })).toBeDisabled();

    rejectNextRange?.(new Error("offline"));

    expect(await screen.findByText("Calendar could not be loaded")).toBeOnTheScreen();
    expect(screen.getByText("Your saved workouts were not changed. Try loading Calendar again."))
      .toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Show July 2026" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Show September 2026" })).toBeEnabled();

    await fireEvent.press(screen.getByRole("button", { name: "Retry Calendar" }));

    await waitFor(() => {
      expect(loadCalendarRange).toHaveBeenLastCalledWith({
        startLocalDate: "2026-06-29",
        endLocalDateExclusive: "2026-10-12",
      });
    });
  });

  it("restores the exact selected day through a failed adjacent-month load and retry", async () => {
    let rejectNextRange: ((error: Error) => void) | undefined;
    const loadCalendarRange = jest.fn() as jest.MockedFunction<CalendarReadPort["loadCalendarRange"]>;
    loadCalendarRange
      .mockResolvedValueOnce(range)
      .mockImplementationOnce(() => new Promise<CalendarRange>((_resolve, reject) => { rejectNextRange = reject; }))
      .mockResolvedValueOnce(range);
    await render(
      <AppearanceProvider>
        <CalendarScreen initialDate="2026-08-24" loadCalendarRange={loadCalendarRange} onOpenEvent={jest.fn()} today="2026-08-24" />
      </AppearanceProvider>,
    );
    expect(await screen.findByText("Full body progression, week 12")).toBeOnTheScreen();
    await measureAugustFocusedRows();
    await fireEvent.press(screen.getByTestId("calendar-day-2026-08-25"));
    expect(screen.getByText("25 August 2026")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Show September 2026" }));

    rejectNextRange?.(new Error("offline"));
    expect(await screen.findByText("Calendar could not be loaded")).toBeOnTheScreen();
    expect(screen.getByText("25 August 2026")).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole("button", { name: "Retry Calendar" }));
    await waitFor(() => expect(loadCalendarRange).toHaveBeenCalledTimes(3));
    expect(screen.getByText("25 August 2026")).toBeOnTheScreen();
  });

  it("mounts a vertically scrollable full-height month with scaled tracks in compact landscape", async () => {
    const dimensions = jest.spyOn(ReactNative, "useWindowDimensions").mockReturnValue({
      fontScale: 2,
      height: 360,
      scale: 1,
      width: 800,
    });
    try {
      await render(
        <AppearanceProvider>
          <CalendarScreen
            initialDate="2026-08-24"
            loadCalendarRange={jest.fn(async () => range)}
            onOpenEvent={jest.fn()}
            today="2026-08-24"
          />
        </AppearanceProvider>,
      );

      expect(await screen.findByTestId("calendar-vertical-scroll")).toHaveProp("scrollEnabled", true);
      expect(StyleSheet.flatten(screen.getAllByTestId("calendar-date-track-2026-08-24")[0]!.props.style).minHeight).toBe(50);
      expect(StyleSheet.flatten(screen.getAllByTestId("calendar-event-track-2026-08-24")[0]!.props.style).minHeight).toBe(66);
      expect(screen.getByRole("button", { name: /24 August 2026.*Full body progression/u })).toBeOnTheScreen();
      expect(screen.getByRole("button", { name: "Return to today, 24 August 2026" })).toBeOnTheScreen();
    } finally {
      dimensions.mockRestore();
    }
  });

  it("preserves the 48/minmax/76/48 month controls at 360dp and 200 percent text", async () => {
    const dimensions = jest.spyOn(ReactNative, "useWindowDimensions").mockReturnValue({
      fontScale: 2,
      height: 800,
      scale: 1,
      width: 360,
    });
    try {
      await render(
        <AppearanceProvider>
          <CalendarScreen
            initialDate="2026-08-24"
            loadCalendarRange={jest.fn(async () => range)}
            onOpenEvent={jest.fn()}
            today="2026-08-24"
          />
        </AppearanceProvider>,
      );

      expect(await screen.findByTestId("calendar-month-navigation")).toHaveStyle({ gap: 3 });
      expect(screen.getByTestId("calendar-month-previous-slot")).toHaveStyle({ width: 48 });
      expect(screen.getByTestId("calendar-month-title-slot")).toHaveStyle({ flex: 1, minWidth: 0 });
      expect(screen.getByTestId("calendar-month-today-slot")).toHaveStyle({ width: 76 });
      expect(screen.getByTestId("calendar-month-next-slot")).toHaveStyle({ width: 48 });
      expect(screen.getByTestId("calendar-month-title")).toHaveProp("numberOfLines", 1);
      expect(screen.getByTestId("calendar-month-title")).toHaveProp("ellipsizeMode", "tail");
      expect(screen.getByTestId("calendar-month-title")).toHaveProp("accessibilityLabel", "August 2026");
      expect(screen.getByTestId("calendar-month-title")).toHaveTextContent("Aug 2026");
      expect(screen.getByRole("button", { name: "Choose month and year, August 2026" })).toBeOnTheScreen();

      const previous = screen.getByRole("button", { name: "Show July 2026" });
      const today = screen.getByRole("button", { name: "Return to today, 24 August 2026" });
      const next = screen.getByRole("button", { name: "Show September 2026" });
      expect(previous).toHaveStyle({ height: 48, width: 48 });
      expect(today).toHaveStyle({ minHeight: 48, width: 76 });
      expect(next).toHaveStyle({ height: 48, width: 48 });
      expect(previous).toBeEnabled();
      expect(today).toBeEnabled();
      expect(next).toBeEnabled();
      await fireEvent.press(today);
      expect(screen.getByTestId("calendar-month-title")).toHaveTextContent("Aug 2026");
    } finally {
      dimensions.mockRestore();
    }
  });

  it("reserves a reachable focused agenda row at 200 percent text in compact height", async () => {
    const dimensions = jest.spyOn(ReactNative, "useWindowDimensions").mockReturnValue({
      fontScale: 2,
      height: 360,
      scale: 1,
      width: 800,
    });
    const onOpenEvent = jest.fn();
    try {
      await render(
        <AppearanceProvider>
          <CalendarScreen
            initialDate="2026-08-24"
            loadCalendarRange={jest.fn(async () => range)}
            onOpenEvent={onOpenEvent}
            today="2026-08-24"
          />
        </AppearanceProvider>,
      );
      await measureAugustFocusedRows();
      await fireEvent.press(await screen.findByRole("button", { name: /24 August 2026.*Full body progression/u }));

      const scroll = screen.getByTestId("calendar-vertical-scroll");
      expect(StyleSheet.flatten(scroll.props.contentContainerStyle).minHeight).toBe(618);
      const agendaRow = await screen.findByTestId("calendar-agenda-event-strength-opportunity-1");
      expect(agendaRow).toBeOnTheScreen();
      const agendaRailStyle = StyleSheet.flatten(screen.getByTestId("calendar-agenda-rail-strength-opportunity-1").props.style);
      expect(agendaRailStyle).toMatchObject({ alignSelf: "stretch", minHeight: 62, width: 5 });
      expect(agendaRailStyle.height).toBeUndefined();
      expect(screen.getByTestId("calendar-agenda-detail-strength-opportunity-1")).toHaveStyle({ marginTop: 3 });
      expect(screen.getByTestId("calendar-agenda-metadata-strength-opportunity-1")).toHaveStyle({ columnGap: 8, marginTop: 4, rowGap: 3 });
      await fireEvent.press(agendaRow);
      expect(onOpenEvent).toHaveBeenCalledWith(range.events[0]!.destination, "strength-opportunity-1");
    } finally {
      dimensions.mockRestore();
    }
  });
});
