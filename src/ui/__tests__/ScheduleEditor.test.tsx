import {
  fireEvent,
  render,
  renderHook,
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
  ScheduleRuntimeSource,
  ScheduleEditorSnapshot,
  ScheduleSaveDraft,
} from "../../bootstrap/scheduleRuntime";
import {
  createScheduleRuntimeAdapter,
  useScheduleRuntime,
} from "../../bootstrap/scheduleRuntime";
import {
  ScheduleBindingEditor,
} from "../components";
import {
  ScheduleEditorScreen,
} from "../screens/ScheduleEditorScreen";
import {
  TodayScreen,
} from "../screens/TodayScreen";
import {
  AppearanceProvider,
} from "../theme";

function scheduleSnapshot(
  overrides: Partial<ScheduleEditorSnapshot> = {},
): ScheduleEditorSnapshot {
  return {
    planId: "plan-owner",
    planName: "Owner Strength",
    planRevision: 8,
    graphStatus: "valid",
    missingRequirement: null,
    days: [
      { id: "day-a", name: "Strength A", ordinal: 0 },
      { id: "day-b", name: "Strength B", ordinal: 1 },
    ],
    todayLocalDate: "2026-08-19",
    deviceTimeZone: "Asia/Singapore",
    scheduleId: "schedule-owner",
    scheduleRevision: 7,
    scheduleLifecycle: "active",
    activeSchedule: {
      kind: "pair",
      planId: "plan-owner",
      planRevision: 8,
      scheduleId: "schedule-owner",
      scheduleRevision: 7,
    },
    current: {
      id: "version-current",
      versionNumber: 2,
      effectiveLocalDate: "2026-08-01",
      mode: "weekday",
      timeZone: "Asia/Singapore",
      rotationPointer: null,
      bindings: [
        {
          ordinal: 0,
          weekIndex: 0,
          weekday: "Monday",
          planDayId: "day-a",
        },
        {
          ordinal: 1,
          weekIndex: 0,
          weekday: "Thursday",
          planDayId: "day-b",
        },
      ],
    },
    ...overrides,
  };
}

async function renderEditor(
  overrides: Partial<
    React.ComponentProps<typeof ScheduleEditorScreen>
  > = {},
) {
  const saved = scheduleSnapshot({
    planRevision: 9,
    scheduleRevision: 8,
    current: {
      id: "version-saved",
      versionNumber: 3,
      effectiveLocalDate: "2026-08-19",
      mode: "rotation",
      timeZone: "Asia/Singapore",
      rotationPointer: 0,
      bindings: [
        { ordinal: 0, planDayId: "day-a" },
        { ordinal: 1, planDayId: "day-b" },
      ],
    },
  });
  const props: React.ComponentProps<typeof ScheduleEditorScreen> = {
    loadSchedule: jest.fn(async () => scheduleSnapshot()),
    onBack: jest.fn(),
    onSaved: jest.fn(),
    planId: "plan-owner",
    saveSchedule: jest.fn(async () => saved),
    ...overrides,
  };
  return {
    props,
    rendered: await render(
      <AppearanceProvider>
        <ScheduleEditorScreen {...props} />
      </AppearanceProvider>,
    ),
  };
}

describe("schedule editor tracer", () => {
  it("allows a valid unscheduled owned plan to confirm its first schedule", async () => {
    const saveSchedule = jest.fn(async () => scheduleSnapshot());
    await renderEditor({
      loadSchedule: jest.fn(async () => scheduleSnapshot({
        scheduleId: null,
        scheduleRevision: null,
        scheduleLifecycle: null,
        current: null,
      })),
      saveSchedule,
    });

    const save = await screen.findByRole("button", { name: "Save schedule" });
    expect(save).toBeEnabled();
    await fireEvent.press(save);
    expect(screen.getByRole("header", { name: "Save this schedule?" }))
      .toBeOnTheScreen();
    expect(screen.getByText(
      /Your current active plan and schedule will be retained and marked inactive\./u,
    )).toBeOnTheScreen();
    const saveActions = screen.getAllByRole("button", {
      name: "Save schedule",
    });
    await fireEvent.press(saveActions[saveActions.length - 1]!);
    await waitFor(() => expect(saveSchedule).toHaveBeenCalledWith({
      planId: "plan-owner",
      scheduleId: null,
      expectedPlanRevision: 8,
      expectedScheduleRevision: null,
      expectedActivePair: scheduleSnapshot().activeSchedule,
      before: null,
      todayLocalDate: "2026-08-19",
      next: {
        effectiveLocalDate: "2026-08-19",
        mode: "weekday",
        timeZone: "Asia/Singapore",
        bindings: [
          {
            ordinal: 0,
            weekIndex: 0,
            weekday: "Monday",
            planDayId: "day-a",
          },
          {
            ordinal: 1,
            weekIndex: 0,
            weekday: "Wednesday",
            planDayId: "day-b",
          },
        ],
      },
    }));
  });

  it("keeps the complete draft local and commits only with exact Save schedule", async () => {
    const saveSchedule = jest.fn(async (
      input: ScheduleSaveDraft,
    ) => scheduleSnapshot({
      planRevision: 9,
      scheduleRevision: 8,
      current: {
        id: "version-saved",
        versionNumber: 3,
        effectiveLocalDate: input.next.effectiveLocalDate,
        mode: "rotation",
        timeZone: input.next.timeZone,
        rotationPointer: 0,
        bindings: input.next.bindings,
      },
    }));
    const onSaved = jest.fn();
    await renderEditor({ saveSchedule, onSaved });

    expect(await screen.findByRole("header", { name: "Edit schedule" }))
      .toBeOnTheScreen();
    expect(screen.getByRole("header", { name: "Before" }))
      .toBeOnTheScreen();
    expect(screen.getByText("Weekday · Asia/Singapore"))
      .toBeOnTheScreen();
    expect(screen.getAllByText("Monday · Strength A")).toHaveLength(2);
    expect(screen.getAllByText("Thursday · Strength B")).toHaveLength(2);
    expect(screen.getByRole("header", { name: "After" }))
      .toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Effective date" }))
      .toHaveTextContent("2026-08-19");

    await fireEvent.press(screen.getByRole("radio", { name: "Rotation" }));
    await fireEvent.press(screen.getByRole("button", {
      name: "Move Strength B up",
    }));
    expect(saveSchedule).not.toHaveBeenCalled();
    expect(screen.getByText("1. Strength B")).toBeOnTheScreen();
    expect(screen.getByText("2. Strength A")).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole("button", {
      name: "Save schedule",
    }));
    expect(saveSchedule).not.toHaveBeenCalled();
    expect(screen.getByRole("header", { name: "Save this schedule?" }))
      .toBeOnTheScreen();
    expect(screen.getByText(
      "This change applies from the selected effective date. Earlier dates, sessions, planned opportunities, and history will not change.",
    )).toBeOnTheScreen();
    expect(screen.queryByText(
      "Your current active plan and schedule will be retained and marked inactive.",
    )).not.toBeOnTheScreen();

    const saveActions = screen.getAllByRole("button", {
      name: "Save schedule",
    });
    await fireEvent.press(saveActions[saveActions.length - 1]!);

    await waitFor(() => expect(saveSchedule).toHaveBeenCalledTimes(1));
    expect(saveSchedule).toHaveBeenCalledWith({
      planId: "plan-owner",
      scheduleId: "schedule-owner",
      expectedPlanRevision: 8,
      expectedScheduleRevision: 7,
      expectedActivePair: scheduleSnapshot().activeSchedule,
      before: scheduleSnapshot().current,
      todayLocalDate: "2026-08-19",
      next: {
        effectiveLocalDate: "2026-08-19",
        mode: "rotation",
        timeZone: "Asia/Singapore",
        bindings: [
          { ordinal: 0, planDayId: "day-b" },
          { ordinal: 1, planDayId: "day-a" },
        ],
      },
    });
    expect(onSaved).toHaveBeenCalledWith("plan-owner");
  });
});

describe("schedule runtime adapter", () => {
  it("forwards every schedule command and refreshes committed mutations", async () => {
    const refresh = jest.fn(async () => undefined);
    const snapshot = scheduleSnapshot();
    const today = {
      scheduleId: "schedule-owner",
      scheduleRevision: 7,
      planId: "plan-owner",
      planRevision: 8,
      localDate: "2026-08-19",
      timeZone: "Asia/Singapore",
      mode: "rotation" as const,
      planDays: snapshot.days,
      scheduleToday: {
        localDate: "2026-08-19",
        mode: "rotation" as const,
        currentDayName: "Strength A",
        nextDayName: "Strength B",
        opportunityState: "pending" as const,
        overrideState: null,
        missedLabel: null,
        timezonePrompt: null,
      },
      view: {
        state: "rest_day" as const,
        planId: "plan-owner",
        planName: "Owner Strength",
        nextDayId: "day-a",
        nextDayName: "Strength A",
        nextLocalDate: "2026-08-20",
      },
    };
    const source: ScheduleRuntimeSource = {
      actOnToday: jest.fn(async () => today),
      chooseTimeZone: jest.fn(async () => today),
      completeScheduledSession: jest.fn(async () => today),
      consumeDateOverride: jest.fn(async () => snapshot),
      loadSchedule: jest.fn(async () => snapshot),
      loadToday: jest.fn(async () => today),
      markWeekdayMissed: jest.fn(async () => today),
      recordTrainAnyway: jest.fn(async () => today),
      saveSchedule: jest.fn(async () => snapshot),
      setDateOverride: jest.fn(async () => snapshot),
      refresh,
    };
    const adapter = createScheduleRuntimeAdapter(source);

    await expect(adapter.loadSchedule("plan-owner")).resolves.toBe(snapshot);
    await expect(adapter.loadToday(1)).resolves.toBe(today);
    await adapter.actOnToday("repeat");
    await adapter.chooseTimeZone(
      "Keep current timezone",
      "America/New_York",
    );
    await adapter.completeScheduledSession("session-1");
    await adapter.consumeDateOverride("2026-08-19");
    await adapter.markWeekdayMissed("2026-08-18");
    await adapter.recordTrainAnyway({
      workout: { kind: "empty", planDayId: null },
      advanceRotation: false,
    });
    await adapter.saveSchedule({
      planId: "plan-owner",
      scheduleId: "schedule-owner",
      expectedPlanRevision: 8,
      expectedScheduleRevision: 7,
      expectedActivePair: snapshot.activeSchedule,
      before: snapshot.current,
      todayLocalDate: "2026-08-19",
      next: {
        effectiveLocalDate: "2026-08-19",
        mode: "rotation",
        timeZone: "Asia/Singapore",
        bindings: [{ ordinal: 0, planDayId: "day-a" }],
      },
    });
    await adapter.setDateOverride({
      localDate: "2026-08-19",
      replacement: { kind: "skip" },
    });

    expect(refresh).toHaveBeenCalledTimes(8);
  });

  it("memoizes the hook adapter and supports a runtime without refresh", async () => {
    const snapshot = scheduleSnapshot();
    const source = {
      actOnToday: jest.fn(),
      chooseTimeZone: jest.fn(),
      completeScheduledSession: jest.fn(),
      consumeDateOverride: jest.fn(),
      loadSchedule: jest.fn(async () => snapshot),
      loadToday: jest.fn(),
      markWeekdayMissed: jest.fn(),
      recordTrainAnyway: jest.fn(),
      saveSchedule: jest.fn(async () => snapshot),
      setDateOverride: jest.fn(),
    } as unknown as ScheduleRuntimeSource;
    const rendered = await renderHook(() => useScheduleRuntime(source));
    const first = rendered.result.current;

    rendered.rerender(undefined);
    expect(rendered.result.current).toBe(first);
    await expect(first.saveSchedule({
      planId: "plan-owner",
      scheduleId: "schedule-owner",
      expectedPlanRevision: 8,
      expectedScheduleRevision: 7,
      expectedActivePair: snapshot.activeSchedule,
      before: snapshot.current,
      todayLocalDate: "2026-08-19",
      next: {
        effectiveLocalDate: "2026-08-19",
        mode: "rotation",
        timeZone: "Asia/Singapore",
        bindings: [{ ordinal: 0, planDayId: "day-a" }],
      },
    })).resolves.toBe(snapshot);
  });
});

describe("schedule binding editor", () => {
  it("changes, removes, and adds Weekday bindings through accessible controls", async () => {
    const onWeekdayBindings = jest.fn();
    await render(
      <AppearanceProvider>
        <ScheduleBindingEditor
          days={[
            { id: "day-a", name: "Strength A", ordinal: 0 },
            { id: "day-b", name: "Strength B", ordinal: 1 },
          ]}
          mode="weekday"
          onRotationBindings={jest.fn()}
          onWeekdayBindings={onWeekdayBindings}
          rotationBindings={[]}
          weekdayBindings={[
            {
              ordinal: 0,
              weekIndex: 0,
              weekday: "Monday",
              planDayId: "day-a",
            },
            {
              ordinal: 1,
              weekIndex: 0,
              weekday: "Thursday",
              planDayId: "day-b",
            },
          ]}
        />
      </AppearanceProvider>,
    );

    await fireEvent.press(screen.getByRole("radio", {
      name: "Strength A: Tuesday",
    }));
    expect(onWeekdayBindings).toHaveBeenLastCalledWith([{
      ordinal: 0,
      weekIndex: 0,
      weekday: "Tuesday",
      planDayId: "day-a",
    }, {
      ordinal: 1,
      weekIndex: 0,
      weekday: "Thursday",
      planDayId: "day-b",
    }]);
    await fireEvent.press(screen.getByRole("button", {
      name: "Remove Strength A binding",
    }));
    expect(onWeekdayBindings).toHaveBeenLastCalledWith([{
      ordinal: 0,
      weekIndex: 0,
      weekday: "Thursday",
      planDayId: "day-b",
    }]);
    await fireEvent.press(screen.getByRole("button", {
      name: "Add weekday binding",
    }));
    expect(onWeekdayBindings).toHaveBeenLastCalledWith([
      {
        ordinal: 0,
        weekIndex: 0,
        weekday: "Monday",
        planDayId: "day-a",
      },
      {
        ordinal: 1,
        weekIndex: 0,
        weekday: "Thursday",
        planDayId: "day-b",
      },
      {
        ordinal: 2,
        weekIndex: 0,
        weekday: "Tuesday",
        planDayId: "day-a",
      },
    ]);
  });
});

describe("schedule editor and Today expansion", () => {
  it("preserves edits after save failure and retries from the safe notice", async () => {
    const saveSchedule = jest.fn<
      React.ComponentProps<typeof ScheduleEditorScreen>["saveSchedule"]
    >()
      .mockRejectedValueOnce(new Error("private_failure"))
      .mockResolvedValueOnce(scheduleSnapshot({
        planRevision: 9,
        scheduleRevision: 8,
      }));
    await renderEditor({ saveSchedule });

    await fireEvent.changeText(
      await screen.findByLabelText("Schedule timezone"),
      "Australia/Sydney",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Effective date" }));
    await fireEvent.press(screen.getByRole("button", {
      name: "Select 2026-08-20",
    }));
    await fireEvent.press(screen.getByRole("button", { name: "Keep Original Date" }));
    expect(screen.getByRole("button", { name: "Effective date" }))
      .toHaveTextContent("2026-08-19");
    await fireEvent.press(screen.getByRole("button", { name: "Effective date" }));
    await fireEvent.press(screen.getByRole("button", {
      name: "Select 2026-08-20",
    }));
    await fireEvent.press(screen.getByRole("button", { name: "Apply Date" }));
    await fireEvent.press(screen.getByRole("button", {
      name: "Save schedule",
    }));
    await fireEvent.press(screen.getAllByRole("button", {
      name: "Save schedule",
    }).at(-1)!);

    expect(await screen.findByText("Schedule could not be saved"))
      .toBeOnTheScreen();
    expect(screen.getByDisplayValue("Australia/Sydney")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Effective date" }))
      .toHaveTextContent("2026-08-20");
    await fireEvent.press(screen.getByRole("button", { name: "Retry" }));
    expect(screen.getByRole("header", { name: "Save this schedule?" }))
      .toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", {
      name: "Keep editing",
    }));
    expect(screen.queryByRole("header", { name: "Save this schedule?" }))
      .not.toBeOnTheScreen();
  });

  it("creates and cancels Rest day and Skip overrides without silent writes", async () => {
    const setDateOverride = jest.fn(async () => scheduleSnapshot({
      dateOverride: {
        version: 1,
        state: "pending",
        id: "override-new",
        revision: 1,
        localDate: "2026-08-19" as never,
        selection: { kind: "skip" },
      },
    }));
    await renderEditor({ setDateOverride });

    await fireEvent.press(await screen.findByRole("button", {
      name: "Override with Rest day",
    }));
    expect(screen.getByRole("header", { name: "Set this date override?" }))
      .toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", {
      name: "Keep current override",
    }));
    expect(setDateOverride).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole("button", {
      name: "Override with Skip",
    }));
    await fireEvent.press(screen.getByRole("button", {
      name: "Save override",
    }));
    await waitFor(() => expect(setDateOverride).toHaveBeenCalledWith({
      localDate: "2026-08-19",
      replacement: { kind: "skip" },
    }));
  });

  it("invokes Weekday Skip and alternate empty start callbacks explicitly", async () => {
    const onWeekdaySkip = jest.fn();
    const onStartEmpty = jest.fn();
    const ExpandedToday = TodayScreen as React.ComponentType<any>;
    await render(
      <AppearanceProvider>
        <ExpandedToday
          launchState="trusted"
          onStartEmpty={onStartEmpty}
          onWeekdaySkip={onWeekdaySkip}
          planDays={[
            { id: "day-a", name: "Strength A", ordinal: 0 },
          ]}
          scheduleToday={{
            localDate: "2026-08-19",
            mode: "weekday",
            currentDayName: "Strength A",
            nextDayName: null,
            opportunityState: "pending",
            overrideState: null,
            missedLabel: null,
            timezonePrompt: null,
          }}
          view={{
            state: "scheduled",
            planId: "plan-owner",
            planName: "Owner Strength",
            dayId: "day-a",
            dayName: "Strength A",
            estimateMinutes: 45,
            exercises: [],
          }}
        />
      </AppearanceProvider>,
    );

    await fireEvent.press(screen.getByRole("button", { name: "Skip" }));
    expect(onWeekdaySkip).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole("button", {
      name: "Choose another day",
    }));
    await fireEvent.press(screen.getByRole("button", {
      name: "Start empty workout",
    }));
    expect(onStartEmpty).toHaveBeenCalledWith(false);
  });

  it("maps Repeat, Skip, and Advance to explicit confirmed schedule commands", async () => {
    const actOnSchedule = jest.fn(async () => undefined);
    const ExpandedToday = TodayScreen as React.ComponentType<any>;
    await render(
      <AppearanceProvider>
        <ExpandedToday
          actOnSchedule={actOnSchedule}
          launchState="trusted"
          planDays={[
            { id: "day-a", name: "Strength A", ordinal: 0 },
            { id: "day-b", name: "Strength B", ordinal: 1 },
          ]}
          scheduleToday={{
            mode: "rotation",
            currentDayName: "Strength A",
            nextDayName: "Strength B",
            opportunityState: "pending",
          }}
          view={{
            state: "scheduled",
            planId: "plan-owner",
            planName: "Owner Strength",
            dayId: "day-a",
            dayName: "Strength A",
            estimateMinutes: 45,
            exercises: [],
          }}
        />
      </AppearanceProvider>,
    );

    for (const action of ["Repeat", "Skip", "Advance"] as const) {
      await fireEvent.press(screen.getByRole("button", { name: action }));
      expect(screen.getByRole("header", {
        name: `${action} Strength A?`,
      })).toBeOnTheScreen();
      expect(screen.getByText(
        action === "Repeat"
          ? /Strength A.*Strength A/u
          : /Strength A.*Strength B/u,
      )).toBeOnTheScreen();
      const confirmations = screen.getAllByRole("button", { name: action });
      await fireEvent.press(confirmations[confirmations.length - 1]!);
      await waitFor(() =>
        expect(actOnSchedule).toHaveBeenLastCalledWith(action.toLowerCase())
      );
    }
  });

  it("requires explicit rotation advancement for Train anyway", async () => {
    const start = jest.fn();
    const ExpandedToday = TodayScreen as React.ComponentType<any>;
    await render(
      <AppearanceProvider>
        <ExpandedToday
          launchState="trusted"
          onStartPlanDay={start}
          planDays={[
            { id: "day-a", name: "Strength A", ordinal: 0 },
            { id: "day-b", name: "Strength B", ordinal: 1 },
          ]}
          scheduleToday={{
            mode: "rotation",
            currentDayName: "Strength A",
            nextDayName: "Strength B",
            opportunityState: "rest_day",
          }}
          view={{
            state: "rest_day",
            planId: "plan-owner",
            planName: "Owner Strength",
            nextDayId: "day-a",
            nextDayName: "Strength A",
            nextLocalDate: "2026-08-20",
          }}
        />
      </AppearanceProvider>,
    );

    await fireEvent.press(screen.getByRole("button", { name: "Train anyway" }));
    const explicit = screen.getByRole("checkbox", {
      name: "Advance rotation after this workout",
    });
    expect(explicit).not.toBeChecked();
    await fireEvent.press(screen.getByRole("button", {
      name: "Start Strength A",
    }));
    expect(start).toHaveBeenLastCalledWith("day-a", "rest_day", false);

    await fireEvent.press(screen.getByRole("button", { name: "Train anyway" }));
    await fireEvent.press(explicit);
    await fireEvent.press(screen.getByRole("button", {
      name: "Start Strength A",
    }));
    expect(start).toHaveBeenLastCalledWith("day-a", "rest_day", true);
  });

  it("confirms pending override replacement and keeps Used override immutable", async () => {
    const pending = scheduleSnapshot({
      dateOverride: {
        id: "override-today",
        state: "pending",
        revision: 1,
        localDate: "2026-08-19",
        selection: { kind: "rest_day" },
      },
    } as Partial<ScheduleEditorSnapshot>);
    const setDateOverride = jest.fn(async () => ({
      ...pending,
      dateOverride: {
        id: "override-today",
        state: "pending" as const,
        revision: 2,
        localDate: "2026-08-19" as const,
        selection: { kind: "plan_day" as const, planDayId: "day-b" },
      },
    }));
    const ExpandedEditor = ScheduleEditorScreen as React.ComponentType<any>;
    const rendered = await render(
      <AppearanceProvider>
        <ExpandedEditor
          loadSchedule={jest.fn(async () => pending)}
          onBack={jest.fn()}
          onSaved={jest.fn()}
          planId="plan-owner"
          saveSchedule={jest.fn()}
          setDateOverride={setDateOverride}
        />
      </AppearanceProvider>,
    );

    expect(await screen.findByText("Rest day")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", {
      name: "Override with Strength B",
    }));
    expect(screen.getByRole("header", {
      name: "Replace this date override?",
    })).toBeOnTheScreen();
    expect(screen.getByText(/Rest day.*Strength B/u)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", {
      name: "Replace override",
    }));
    await waitFor(() => expect(setDateOverride).toHaveBeenCalledWith({
      localDate: "2026-08-19",
      replacement: { kind: "plan_day", planDayId: "day-b" },
      confirmation: "replace_pending_override",
    }));

    await rendered.rerender(
      <AppearanceProvider>
        <ExpandedEditor
          loadSchedule={jest.fn(async () => ({
            ...pending,
            dateOverride: {
              ...pending.dateOverride,
              state: "consumed",
              revision: 2,
              opportunityId: "used-opportunity",
            },
          }))}
          onBack={jest.fn()}
          onSaved={jest.fn()}
          planId="plan-owner"
          saveSchedule={jest.fn()}
          setDateOverride={setDateOverride}
        />
      </AppearanceProvider>,
    );
    expect(await screen.findByText("Used")).toBeOnTheScreen();
    expect(screen.queryByRole("button", {
      name: "Override with Strength B",
    })).not.toBeOnTheScreen();
  });

  it("shows exact prospective timezone choices and neutral missed copy", async () => {
    const chooseTimeZone = jest.fn(async () => undefined);
    const ExpandedToday = TodayScreen as React.ComponentType<any>;
    await render(
      <AppearanceProvider reduceMotion>
        <ExpandedToday
          chooseScheduleTimeZone={chooseTimeZone}
          launchState="trusted"
          planDays={[]}
          scheduleToday={{
            mode: "weekday",
            currentDayName: null,
            nextDayName: "Strength A",
            opportunityState: "rest_day",
            missedLabel: "Planned but not completed",
            timezonePrompt: {
              storedTimeZone: "America/Los_Angeles — very long stored timezone label",
              deviceTimeZone: "Asia/Singapore",
            },
          }}
          view={{
            state: "rest_day",
            planId: "plan-owner",
            planName: "Owner Strength",
            nextDayId: "day-a",
            nextDayName: "Strength A",
            nextLocalDate: "2026-08-20",
          }}
          width={599}
        />
      </AppearanceProvider>,
    );

    expect(screen.getByText("Planned but not completed")).toBeOnTheScreen();
    expect(screen.getByText(/America\/Los_Angeles/u)).toBeOnTheScreen();
    expect(screen.getByText(/Asia\/Singapore/u)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", {
      name: "Follow device timezone from today",
    }));
    await waitFor(() =>
      expect(chooseTimeZone).toHaveBeenCalledWith(
        "Follow device timezone from today",
      )
    );
    await fireEvent.press(screen.getByRole("button", {
      name: "Keep current timezone",
    }));
    expect(chooseTimeZone).toHaveBeenCalledWith("Keep current timezone");
    expect(screen.getByTestId("adaptive-screen")).toHaveProp(
      "accessibilityLabel",
      "compact layout",
    );
  });

  it("covers loading, error, invalid, many-day, long-text, adaptive, and keyboard states", async () => {
    let resolveLoad:
      | ((value: ScheduleEditorSnapshot | null) => void)
      | undefined;
    const loadSchedule = jest.fn(() =>
      new Promise<ScheduleEditorSnapshot | null>((resolve) => {
        resolveLoad = resolve;
      })
    );
    const { rendered } = await renderEditor({ loadSchedule, width: 840 });
    expect(screen.getByTestId("schedule-editor-loading")).toBeOnTheScreen();
    expect(screen.getByTestId("schedule-editor")).toHaveProp(
      "accessibilityLabel",
      "expanded layout",
    );
    resolveLoad?.(null);
    expect(await screen.findByText("Schedule could not be loaded"))
      .toBeOnTheScreen();

    const longName =
      "A very long strength and conditioning plan day name for overflow";
    const missing =
      "Add at least one exercise with valid targets before scheduling this plan.";
    await rendered.rerender(
      <AppearanceProvider reduceMotion>
        <ScheduleEditorScreen
          loadSchedule={jest.fn(async () => scheduleSnapshot({
            graphStatus: "missing_valid_target",
            missingRequirement: missing,
            days: [
              { id: "day-a", name: longName, ordinal: 0 },
              { id: "day-b", name: "Strength B", ordinal: 1 },
              { id: "day-c", name: "Strength C", ordinal: 2 },
              { id: "day-d", name: "Strength D", ordinal: 3 },
              { id: "day-e", name: "Strength E", ordinal: 4 },
            ],
            current: null,
          }))}
          onBack={jest.fn()}
          onSaved={jest.fn()}
          planId="plan-owner"
          saveSchedule={jest.fn(async () => scheduleSnapshot())}
          width={600}
        />
      </AppearanceProvider>,
    );
    expect((await screen.findAllByText(new RegExp(longName, "u"))).length)
      .toBeGreaterThanOrEqual(1);
    expect(screen.getByText(missing)).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Save schedule" }))
      .toBeDisabled();
    expect(screen.getByTestId("schedule-editor")).toHaveProp(
      "accessibilityLabel",
      "medium layout",
    );

    const rotation = screen.getByRole("radio", { name: "Rotation" });
    await fireEvent(rotation, "keyDown", {
      nativeEvent: { key: "Enter" },
    });
    expect(rotation).toBeSelected();
    const move = screen.getByRole("button", { name: `Move ${longName} down` });
    expect(move).toHaveStyle({ minHeight: 48 });
    await fireEvent(move, "keyDown", { nativeEvent: { key: " " } });
    expect(screen.getByText(`2. ${longName}`)).toBeOnTheScreen();
  });
});
