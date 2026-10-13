import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronUp } from "lucide-react-native";
import {
  AccessibilityInfo,
  AppState,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type TextStyle,
} from "react-native";

import { addLocalDays, parseLocalDate, type LocalDate } from "../../domains/scheduling";
import type {
  Phase16CalendarDiagnosticsProducer,
  Phase16CalendarDiagnosticsRequest,
  Phase16CalendarStage,
} from "../../bootstrap/phase16CalendarTestControls";
import {
  addLocalMonthsClamped,
  calendarGridForMonth,
  startOfLocalMonth,
} from "../../domains/scheduling/localDate";
import type { CalendarEventDestination, CalendarRange, CalendarReadPort } from "../calendar/calendarPorts";
import { CalendarAgenda, type CalendarAgendaHandle, type CalendarAgendaRowHandle } from "../calendar/CalendarAgenda";
import {
  CalendarMonthViewport,
  calendarHorizontalInsetForSafeWidth,
  calendarWeekGeometryForGeneration,
  type CalendarWeekGeometry,
} from "../calendar/CalendarMonthViewport";
import { CalendarWeekRow, type CalendarDateCellHandle } from "../calendar/CalendarWeekRow";
import {
  createCalendarTransitionState,
  transitionCalendar,
  type CalendarMotionCommand,
  type CalendarTransitionEvent,
  type CalendarTransitionState,
} from "../calendar/calendarTransitionController";
import {
  FocusablePressable,
  IconAction,
  InlineNotice,
  PrimaryAction,
  ScreenHeader,
  SkeletonBlock,
} from "../components";
import { BottomSheet } from "../components/BottomSheet";
import { AdaptiveScreen } from "../layout/AdaptiveScreen";
import type { RootFocusTarget } from "../shell/rootFocus";
import { calendarTypeScale, colorWithAlpha, space, typeScale, useAppTheme } from "../theme";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;
const MONDAY_FIRST = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const MAX_DIAGNOSTIC_FRAMES = 10_000;
const NOOP = () => undefined;

type CalendarScreenProps = Readonly<{
  diagnostics?: Phase16CalendarDiagnosticsRuntime;
  diagnosticStage?: Phase16CalendarStage;
  initialDate: string;
  loadCalendarRange: CalendarReadPort["loadCalendarRange"];
  onOpenEvent(destination: CalendarEventDestination, returnEventId?: string): void;
  onOpenSettings?(): void;
  today?: string;
  headingRef?: React.RefObject<RootFocusTarget | null>;
  settingsActionRef?: React.RefObject<RootFocusTarget | null>;
  settingsActionNativeID?: string;
  onRequestRootBack?(): void;
  returnFocusGeneration?: number;
}>;

export type Phase16CalendarDiagnosticsRuntime = Readonly<{
  producer: Phase16CalendarDiagnosticsProducer;
  request: Phase16CalendarDiagnosticsRequest;
}>;

function monthLabel(value: LocalDate): string {
  return `${MONTH_NAMES[Number(value.slice(5, 7)) - 1] ?? ""} ${value.slice(0, 4)}`;
}

function fullDate(value: LocalDate): string {
  return `${Number(value.slice(8, 10))} ${MONTH_NAMES[Number(value.slice(5, 7)) - 1] ?? ""} ${value.slice(0, 4)}`;
}

function nextMonth(value: LocalDate, direction: -1 | 1): LocalDate | null {
  try {
    return startOfLocalMonth(addLocalMonthsClamped(value, direction));
  } catch {
    return null;
  }
}

function monthIdDate(monthId: string): LocalDate {
  return `${monthId}-01` as LocalDate;
}

export function CalendarScreen({
  diagnostics,
  diagnosticStage,
  initialDate,
  loadCalendarRange,
  onOpenEvent,
  onOpenSettings = () => undefined,
  today = initialDate,
  headingRef,
  settingsActionNativeID,
  settingsActionRef,
  onRequestRootBack = NOOP,
  returnFocusGeneration = 0,
}: CalendarScreenProps) {
  const { colors, reduceMotion } = useAppTheme();
  const { fontScale, height: safeHeight, width: safeWidth } = useWindowDimensions();
  const parsedToday = parseLocalDate(today);
  const [month, setMonth] = useState(() => startOfLocalMonth(parseLocalDate(initialDate)));
  const selectedDateRef = useRef<LocalDate>(parseLocalDate(initialDate));
  const [selectedDate, setSelectedDate] = useState(() => selectedDateRef.current);
  const [range, setRange] = useState<CalendarRange | null>(null);
  const [lastGoodMonth, setLastGoodMonth] = useState(() => startOfLocalMonth(parseLocalDate(initialDate)));
  const [lastGoodSelectedDate, setLastGoodSelectedDate] = useState(() => parseLocalDate(initialDate));
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [refreshCompletion, setRefreshCompletion] = useState<Readonly<{
    generation: number;
    range: CalendarRange | null;
  }> | null>(null);
  const [retryGeneration, setRetryGeneration] = useState(0);
  const [isCalendarKeyOpen, setCalendarKeyOpen] = useState(false);
  const [calendarTransition, setCalendarTransition] = useState<CalendarTransitionState>(() => createCalendarTransitionState({
    currentMonthId: initialDate.slice(0, 7),
    selectedLocalDate: initialDate,
    reducedMotion: reduceMotion,
  }));
  const [calendarCommand, setCalendarCommand] = useState<CalendarMotionCommand | null>(null);
  const [weekMeasurements, setWeekMeasurements] = useState<ReadonlyMap<LocalDate, CalendarWeekGeometry>>(() => new Map());
  const [layoutGeneration, setLayoutGeneration] = useState(0);
  const requestGeneration = useRef(0);
  const diagnosticState = useRef<{
    producer: Phase16CalendarDiagnosticsProducer | null;
    querySamples: number;
    interactionSamples: number;
    exported: boolean;
  }>({ producer: null, querySamples: 0, interactionSamples: 0, exported: false });
  const diagnosticFrameProbe = useRef<{
    frameIntervals: number[];
    frameWorkMs: number[];
    lastTimestamp: number | null;
    maxProfilerOverheadMs: number;
    raf: number;
  } | null>(null);
  const calendarTransitionRef = useRef(calendarTransition);
  const pendingMonthRef = useRef<Readonly<{ month: LocalDate; selectedDate: LocalDate }> | null>(null);
  const infoActionRef = useRef<View>(null);
  const collapseActionRef = useRef<View>(null);
  const dateCellRefs = useRef(new Map<LocalDate, CalendarDateCellHandle>());
  const pendingDateFocusRef = useRef<LocalDate | null>(null);
  const pendingCollapseFocusRef = useRef(false);
  const agendaRef = useRef<CalendarAgendaHandle>(null);
  const agendaRowRefs = useRef(new Map<string, CalendarAgendaRowHandle>());
  const agendaOffsetRef = useRef(0);
  const calendarReturnRef = useRef<Readonly<{
    month: LocalDate;
    selectedDate: LocalDate;
    mode: CalendarTransitionState["mode"];
    agendaOffset: number;
    eventId: string;
  }> | null>(null);
  const pendingReturnFocusRef = useRef<Readonly<{
    retained: NonNullable<typeof calendarReturnRef.current>;
    requestGeneration: number;
  }> | null>(null);
  const suppressNextRangeRequestRef = useRef(false);
  const lastGoodTransitionRef = useRef(calendarTransitionRef.current);
  const weekRows = useMemo(() => calendarGridForMonth(month), [month]);
  const grid = useMemo(() => weekRows.flat(), [weekRows]);
  const rangeInput = useMemo(() => {
    const previousPanel = calendarGridForMonth(nextMonth(month, -1) ?? month).flat();
    const nextPanel = calendarGridForMonth(nextMonth(month, 1) ?? month).flat();
    return {
      startLocalDate: previousPanel[0] ?? grid[0]!,
      endLocalDateExclusive: addLocalDays(nextPanel[nextPanel.length - 1] ?? grid[grid.length - 1]!, 8),
    };
  }, [grid, month]);

  const currentDiagnosticState = useCallback(() => {
    if (diagnostics === undefined) return null;
    if (diagnosticState.current.producer !== diagnostics.producer) {
      diagnosticState.current = {
        producer: diagnostics.producer,
        querySamples: 0,
        interactionSamples: 0,
        exported: false,
      };
    }
    return diagnosticState.current;
  }, [diagnostics]);

  const exportCompletedDiagnostics = useCallback(() => {
    const state = currentDiagnosticState();
    if (diagnostics === undefined || state === null || state.exported
      || state.querySamples !== diagnostics.request.querySamples
      || state.interactionSamples !== diagnostics.request.interactionSamples) return;
    state.exported = true;
    diagnostics.producer.exportResult();
  }, [currentDiagnosticState, diagnostics]);

  const recordDiagnosticInteraction = useCallback((sample: Parameters<Phase16CalendarDiagnosticsProducer["recordInteraction"]>[0]) => {
    const state = currentDiagnosticState();
    if (diagnostics === undefined || state === null || state.interactionSamples >= diagnostics.request.interactionSamples) return;
    diagnostics.producer.recordInteraction(sample);
    state.interactionSamples += 1;
    exportCompletedDiagnostics();
  }, [currentDiagnosticState, diagnostics, exportCompletedDiagnostics]);

  const diagnosticFrameTick = useCallback((timestamp: number) => {
    const probe = diagnosticFrameProbe.current;
    if (probe === null) return;
    if (probe.frameIntervals.length >= MAX_DIAGNOSTIC_FRAMES) {
      cancelAnimationFrame(probe.raf);
      diagnosticFrameProbe.current = null;
      return;
    }
    if (probe.lastTimestamp !== null) probe.frameIntervals.push(Math.max(0, timestamp - probe.lastTimestamp));
    probe.lastTimestamp = timestamp;
    probe.raf = requestAnimationFrame(diagnosticFrameTick);
  }, []);

  const cancelDiagnosticInteraction = useCallback(() => {
    if (diagnosticFrameProbe.current !== null) cancelAnimationFrame(diagnosticFrameProbe.current.raf);
    diagnosticFrameProbe.current = null;
  }, []);

  const startDiagnosticInteraction = useCallback(() => {
    if (diagnostics === undefined) return;
    cancelDiagnosticInteraction();
    const probe = {
      frameIntervals: [] as number[],
      frameWorkMs: [] as number[],
      lastTimestamp: null as number | null,
      maxProfilerOverheadMs: 0,
      raf: 0,
    };
    diagnosticFrameProbe.current = probe;
    probe.raf = requestAnimationFrame(diagnosticFrameTick);
  }, [cancelDiagnosticInteraction, diagnosticFrameTick, diagnostics]);

  const finishDiagnosticInteraction = useCallback(() => {
    const probe = diagnosticFrameProbe.current;
    diagnosticFrameProbe.current = null;
    if (probe === null) return;
    cancelAnimationFrame(probe.raf);
    if (probe.frameWorkMs.length === 0) return;
    const sortedIntervals = [...probe.frameIntervals].sort((left, right) => left - right);
    const medianInterval = sortedIntervals[Math.floor(sortedIntervals.length / 2)] ?? (1_000 / 60);
    const refreshRateHz = medianInterval <= 0 ? 60 : Math.min(240, 1_000 / medianInterval);
    const missedFrames = probe.frameIntervals.reduce((total, duration) => (
      total + Math.max(0, Math.round(duration / Math.max(medianInterval, 1)) - 1)
    ), 0);
    recordDiagnosticInteraction({
      frameWorkMs: Object.freeze([...probe.frameWorkMs]),
      missedFrames,
      refreshRateHz,
      profilerOverheadMs: probe.maxProfilerOverheadMs,
    });
  }, [recordDiagnosticInteraction]);

  const recordDiagnosticRender = useCallback((
    _id: string,
    _phase: "mount" | "update" | "nested-update",
    actualDuration: number,
  ) => {
    const callbackStartedAt = globalThis.performance?.now() ?? Date.now();
    const probe = diagnosticFrameProbe.current;
    if (probe === null) return;
    if (probe.frameWorkMs.length >= MAX_DIAGNOSTIC_FRAMES) {
      cancelDiagnosticInteraction();
      return;
    }
    probe.frameWorkMs.push(Math.max(0, actualDuration));
    probe.maxProfilerOverheadMs = Math.max(
      probe.maxProfilerOverheadMs,
      (globalThis.performance?.now() ?? Date.now()) - callbackStartedAt,
    );
  }, [cancelDiagnosticInteraction]);

  useEffect(() => cancelDiagnosticInteraction, [cancelDiagnosticInteraction]);

  useEffect(() => {
    if (suppressNextRangeRequestRef.current) {
      suppressNextRangeRequestRef.current = false;
      return undefined;
    }
    const request = requestGeneration.current + 1;
    requestGeneration.current = request;
    const queryStartedAt = globalThis.performance?.now() ?? Date.now();
    let active = true;

    setIsLoading(true);
    setError(null);
    void Promise.resolve()
      .then(() => loadCalendarRange(rangeInput))
      .then((next) => {
        if (!active || request !== requestGeneration.current) {
          return;
        }
        setRange(next);
        setLastGoodMonth(month);
        setLastGoodSelectedDate(selectedDateRef.current);
        lastGoodTransitionRef.current = calendarTransitionRef.current;
        setRefreshCompletion(Object.freeze({ generation: request, range: next }));
        if (diagnostics !== undefined) {
          const current = currentDiagnosticState();
          if (current !== null && current.querySamples < diagnostics.request.querySamples) {
            diagnostics.producer.recordQuery({
              durationMs: Math.max(0, (globalThis.performance?.now() ?? Date.now()) - queryStartedAt),
              eventCount: next.events.length,
              planCount: new Set(next.events.flatMap(({ planId }) => planId === null ? [] : [planId])).size,
              importedCount: next.events.filter(({ source }) => source === "imported_activity").length,
            });
            current.querySamples += 1;
            exportCompletedDiagnostics();
          }
        }
      })
      .catch((nextError: unknown) => {
        if (!active || request !== requestGeneration.current) {
          return;
        }
        setError(nextError instanceof Error ? nextError : new Error("Calendar query failed"));
        const rollback = Object.freeze({
          ...lastGoodTransitionRef.current,
          currentMonthId: lastGoodMonth.slice(0, 7),
          selectedLocalDate: lastGoodSelectedDate,
          phase: "idle" as const,
          titlePanel: "current" as const,
          dragDx: 0,
          pendingMonthId: null,
          pendingSelectedLocalDate: null,
          epoch: calendarTransitionRef.current.epoch + 1,
        });
        calendarTransitionRef.current = rollback;
        setCalendarTransition(rollback);
        setCalendarCommand(null);
        if (month !== lastGoodMonth) {
          suppressNextRangeRequestRef.current = true;
          setMonth(lastGoodMonth);
        }
        selectedDateRef.current = lastGoodSelectedDate;
        setSelectedDate(lastGoodSelectedDate);
        setRefreshCompletion(Object.freeze({ generation: request, range: null }));
      })
      .finally(() => {
        if (active && request === requestGeneration.current) {
          setIsLoading(false);
        }
      });

    return () => { active = false; };
  }, [currentDiagnosticState, diagnostics, exportCompletedDiagnostics, loadCalendarRange, month, rangeInput, retryGeneration]);

  const selectDate = (date: LocalDate) => {
    selectedDateRef.current = date;
    setSelectedDate(date);
  };

  const dispatchCalendarTransition = useCallback((event: CalendarTransitionEvent) => {
    const previousState = calendarTransitionRef.current;
    const result = transitionCalendar(previousState, event);
    calendarTransitionRef.current = result.state;
    setCalendarTransition(result.state);
    setCalendarCommand(result.commands[0] ?? null);

    if (result.commands.some((command) => command.kind === "request-back")) {
      onRequestRootBack();
      return;
    }

    if (previousState.currentMonthId !== result.state.currentMonthId) {
      const nextDate = parseLocalDate(result.state.selectedLocalDate);
      const pending = Object.freeze({ month: startOfLocalMonth(nextDate), selectedDate: nextDate });
      if (result.state.phase === "adjacent-measuring" || result.state.reducedMotion) {
        pendingMonthRef.current = null;
        setWeekMeasurements(new Map());
        setLayoutGeneration((generation) => generation + 1);
        setMonth(pending.month);
        selectDate(pending.selectedDate);
      } else {
        pendingMonthRef.current = pending;
      }
    } else if (previousState.selectedLocalDate !== result.state.selectedLocalDate) {
      selectDate(parseLocalDate(result.state.selectedLocalDate));
    }

    const pending = pendingMonthRef.current;
    if (pending !== null && (
      result.state.reducedMotion
      || (event.type === "settle-complete" && result.state.phase === "idle")
    )) {
      pendingMonthRef.current = null;
      setMonth(pending.month);
      selectDate(pending.selectedDate);
    }
  }, [onRequestRootBack]);

  useEffect(() => {
    dispatchCalendarTransition({ type: "set-reduced-motion", reducedMotion: reduceMotion });
  }, [dispatchCalendarTransition, reduceMotion]);

  const invalidateLayout = useCallback(() => {
    cancelDiagnosticInteraction();
    setWeekMeasurements(new Map());
    setLayoutGeneration((generation) => generation + 1);
    dispatchCalendarTransition({ type: "invalidate" });
  }, [cancelDiagnosticInteraction, dispatchCalendarTransition]);

  useEffect(() => {
    invalidateLayout();
  }, [fontScale, invalidateLayout, safeHeight, safeWidth]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active") invalidateLayout();
    });
    return () => subscription.remove();
  }, [invalidateLayout]);

  const navigateMonth = (direction: -1 | 1) => {
    const next = nextMonth(month, direction);
    if (next === null) {
      return;
    }
    const targetDate = addLocalMonthsClamped(selectedDateRef.current, direction);
    if (calendarTransitionRef.current.mode === "focused") {
      pendingDateFocusRef.current = targetDate;
      dispatchCalendarTransition({ type: "select-adjacent", localDate: targetDate, targetMonthId: next.slice(0, 7) });
    } else {
      dispatchCalendarTransition({
        type: "move",
        direction: direction === 1 ? "next" : "previous",
        targetMonthId: next.slice(0, 7),
        targetSelectedLocalDate: targetDate,
      });
    }
  };

  const returnToToday = () => {
    if (calendarTransitionRef.current.mode === "focused") {
      pendingDateFocusRef.current = parsedToday;
      dispatchCalendarTransition({ type: "select-adjacent", localDate: parsedToday, targetMonthId: parsedToday.slice(0, 7) });
      return;
    }
    if (parsedToday.slice(0, 7) === month.slice(0, 7)) {
      selectDate(parsedToday);
      return;
    }
    dispatchCalendarTransition({
      type: "move",
      direction: parsedToday > selectedDateRef.current ? "next" : "previous",
      targetMonthId: parsedToday.slice(0, 7),
      targetSelectedLocalDate: parsedToday,
    });
  };

  const moveSelection = (date: LocalDate, restoreFocus = false) => {
    if (restoreFocus) pendingDateFocusRef.current = date;
    if (date.slice(0, 7) !== month.slice(0, 7)) {
      if (calendarTransitionRef.current.mode === "focused") {
        dispatchCalendarTransition({ type: "select-adjacent", localDate: date, targetMonthId: date.slice(0, 7) });
      } else {
        dispatchCalendarTransition({
          type: "move",
          direction: date > selectedDateRef.current ? "next" : "previous",
          targetMonthId: date.slice(0, 7),
          targetSelectedLocalDate: date,
        });
      }
      return;
    }
    selectDate(date);
  };

  const requestCalendarBack = useCallback(() => {
    if (isCalendarKeyOpen) {
      setCalendarKeyOpen(false);
      infoActionRef.current?.focus?.();
      return;
    }
    dispatchCalendarTransition({ type: "back" });
  }, [dispatchCalendarTransition, isCalendarKeyOpen]);

  useEffect(() => {
    if (returnFocusGeneration === 0) return;
    const retained = calendarReturnRef.current;
    calendarReturnRef.current = null;
    if (retained === null) {
      setRetryGeneration((generation) => generation + 1);
      return;
    }

    const restoredTransition = Object.freeze({
      ...calendarTransitionRef.current,
      currentMonthId: retained.month.slice(0, 7),
      selectedLocalDate: retained.selectedDate,
      mode: retained.mode,
      phase: "idle" as const,
      titlePanel: "current" as const,
      dragDx: 0,
      epoch: calendarTransitionRef.current.epoch + 1,
      pendingMonthId: null,
      pendingSelectedLocalDate: null,
    });
    calendarTransitionRef.current = restoredTransition;
    setCalendarTransition(restoredTransition);
    setCalendarCommand(null);
    setMonth(retained.month);
    selectDate(retained.selectedDate);
    pendingReturnFocusRef.current = Object.freeze({
      retained,
      requestGeneration: requestGeneration.current + 1,
    });
    setRetryGeneration((generation) => generation + 1);
  }, [returnFocusGeneration]);

  const focusTarget = useCallback((target: (View & Readonly<{ focus?: () => void }>) | null | undefined) => {
    if (target === undefined || target === null) return;
    target.focus?.();
    AccessibilityInfo.sendAccessibilityEvent(target, "focus");
  }, []);

  useEffect(() => {
    const pending = pendingReturnFocusRef.current;
    if (pending === null || refreshCompletion === null || refreshCompletion.generation < pending.requestGeneration) return;
    pendingReturnFocusRef.current = null;
    const eventStillExists = refreshCompletion.range?.events.some((event) => (
      event.id === pending.retained.eventId && event.localDate === pending.retained.selectedDate
    )) === true;
    if (eventStillExists) agendaRef.current?.scrollTo(pending.retained.agendaOffset);
    const target = eventStillExists
      ? agendaRowRefs.current.get(pending.retained.eventId)
      : dateCellRefs.current.get(pending.retained.selectedDate);
    focusTarget(target ?? dateCellRefs.current.get(pending.retained.selectedDate));
    if (!eventStillExists) {
      AccessibilityInfo.announceForAccessibility("Calendar refreshed. The previous event is no longer available.");
    }
  }, [focusTarget, refreshCompletion]);

  useEffect(() => {
    if (!pendingCollapseFocusRef.current || calendarTransition.mode !== "focused") return;
    pendingCollapseFocusRef.current = false;
    focusTarget(collapseActionRef.current);
  }, [calendarTransition.mode, focusTarget]);

  useEffect(() => {
    const pendingDate = pendingDateFocusRef.current;
    if (pendingDate === null || calendarTransition.phase !== "idle") return;
    const target = dateCellRefs.current.get(pendingDate);
    if (target === undefined) return;
    pendingDateFocusRef.current = null;
    focusTarget(target);
  }, [calendarTransition.mode, calendarTransition.phase, focusTarget, layoutGeneration, selectedDate]);

  const recordWeekGeometry = useCallback((weekStart: LocalDate, geometry: Readonly<{ y: number; height: number }>) => {
    if (!Number.isFinite(geometry.y) || !Number.isFinite(geometry.height) || geometry.height <= 0) return;
    setWeekMeasurements((current) => {
      const existing = current.get(weekStart);
      if (existing?.y === geometry.y && existing.height === geometry.height) return current;
      const next = new Map(current);
      next.set(weekStart, Object.freeze({ ...geometry, generation: layoutGeneration }));
      return next;
    });
  }, [layoutGeneration]);

  const visibleMonth = range !== null && (isLoading || error !== null)
    ? lastGoodMonth
    : month;
  const visibleSelectedDate = range !== null && (isLoading || error !== null)
    ? lastGoodSelectedDate
    : selectedDate;
  const interactionDisabled = range !== null && isLoading;
  const visibleWeekRows = visibleMonth === month
    ? weekRows
    : calendarGridForMonth(visibleMonth);
  const selectedWeek = visibleWeekRows.find((dates) => dates.includes(visibleSelectedDate));
  const followingWeek = selectedWeek?.map((date) => addLocalDays(date, 7));
  const focusedWeek = selectedWeek === undefined || followingWeek === undefined
    ? null
    : Object.freeze({
      selectedDates: selectedWeek,
      followingDates: followingWeek,
      selectedGeometry: calendarWeekGeometryForGeneration(weekMeasurements.get(selectedWeek[0]!), layoutGeneration),
      followingGeometry: calendarWeekGeometryForGeneration(weekMeasurements.get(followingWeek[0]!), layoutGeneration),
    });

  useEffect(() => {
    if (calendarTransition.phase !== "adjacent-measuring"
      || focusedWeek?.selectedGeometry === null
      || focusedWeek?.followingGeometry === null
      || focusedWeek === null) return;
    dispatchCalendarTransition({ type: "layout-ready" });
  }, [calendarTransition.phase, dispatchCalendarTransition, focusedWeek]);
  const calendarInset = calendarHorizontalInsetForSafeWidth(safeWidth);
  const adaptiveScreenInset = safeWidth < 600 ? space[4] : safeWidth < 840 ? space[6] : space[8];

  const header = (
    <ScreenHeader
      {...(headingRef === undefined ? {} : { ref: headingRef as React.Ref<View> })}
      actions={[
        <IconAction
          accessibilityLabel="Open Calendar key"
          icon="info"
          key="calendar-key"
          onPress={() => setCalendarKeyOpen(true)}
          ref={infoActionRef}
          testID="calendar-info-action"
        />,
        <IconAction
          accessibilityLabel="Open App Settings"
          icon="settings"
          key="settings"
          nativeID={settingsActionNativeID}
          onPress={onOpenSettings}
          ref={settingsActionRef as React.Ref<View>}
        />,
      ]}
      title="Calendar"
      titleStyle={calendarTypeScale.heading as TextStyle}
    />
  );

  const eventsByDate = new Map<LocalDate, readonly CalendarRange["events"][number][]>();
  for (const event of range?.events ?? []) {
    eventsByDate.set(event.localDate, [...(eventsByDate.get(event.localDate) ?? []), event]);
  }
  const daysByDate = new Map((range?.days ?? []).map((day) => [day.localDate, day] as const));
  const previous = nextMonth(visibleMonth, -1);
  const following = nextMonth(visibleMonth, 1);
  const titleBaseMonth = calendarTransition.phase === "settling"
    ? monthIdDate(calendarTransition.currentMonthId)
    : visibleMonth;
  const titleMonth = calendarTransition.titlePanel === "previous" ? nextMonth(titleBaseMonth, -1)
    : calendarTransition.titlePanel === "next" ? nextMonth(titleBaseMonth, 1)
      : titleBaseMonth;
  const visibleMonthLabel = monthLabel(titleMonth ?? month);
  const selectedEvents = (range?.events ?? []).filter((event) => event.localDate === visibleSelectedDate);
  const selectedDay = range?.days?.find((day) => day.localDate === visibleSelectedDate);
  const registerDateCell = (date: LocalDate, node: CalendarDateCellHandle | null) => {
    if (node === null) dateCellRefs.current.delete(date);
    else dateCellRefs.current.set(date, node);
  };
  const collapseCalendar = () => {
    pendingDateFocusRef.current = selectedDateRef.current;
    dispatchCalendarTransition({ type: "collapse" });
  };
  const agendaRegion = (
    <View style={styles.agendaRegion} testID="calendar-agenda-region">
      <View style={[styles.agendaHeading, { borderColor: colors.textPrimary }]} testID="calendar-agenda-heading">
        <Text accessibilityRole="header" style={[calendarTypeScale.heading as TextStyle, { color: colors.textPrimary }]}>{fullDate(visibleSelectedDate)}</Text>
        <Text style={[calendarTypeScale.metadata as TextStyle, { color: colors.textSecondary }]}>
          {selectedEvents.length === 0
            ? "No workout"
            : `${selectedEvents.length} scheduled or imported event${selectedEvents.length === 1 ? "" : "s"}`}
        </Text>
        <FocusablePressable
          accessibilityLabel="Collapse day and return to month"
          accessibilityRole="button"
          disabled={interactionDisabled}
          onKeyDown={(event) => {
            if (event.nativeEvent.key === "Escape") requestCalendarBack();
            else if (event.nativeEvent.key === "Enter" || event.nativeEvent.key === " " || event.nativeEvent.key === "Select") collapseCalendar();
          }}
          onPress={collapseCalendar}
          ref={collapseActionRef}
          style={({ pressed }) => [
            styles.collapseAction,
            { backgroundColor: pressed ? colors.surfaceSubtle : "transparent" },
          ]}
        >
          <ChevronUp accessible={false} color={colors.textPrimary} size={24} strokeWidth={2} />
        </FocusablePressable>
      </View>
      <CalendarAgenda
        {...(selectedDay === undefined ? {} : { day: selectedDay })}
        events={selectedEvents}
        onActivateEvent={(eventId) => {
          calendarReturnRef.current = Object.freeze({
            month,
            selectedDate: selectedDateRef.current,
            mode: calendarTransitionRef.current.mode,
            agendaOffset: agendaOffsetRef.current,
            eventId,
          });
        }}
        onOpenEvent={(destination) => onOpenEvent(destination, calendarReturnRef.current?.eventId)}
        onRequestBack={requestCalendarBack}
        onScrollOffsetChange={(offset) => { agendaOffsetRef.current = offset; }}
        ref={agendaRef}
        resetActivationKey={returnFocusGeneration}
        rowRefs={agendaRowRefs}
      />
    </View>
  );

  return (
    <AdaptiveScreen
      onRequestBack={requestCalendarBack}
      scrollable={false}
      primary={(
        <React.Profiler id="phase16-calendar" onRender={recordDiagnosticRender}>
        <View style={styles.screen}>
          {header}
          <View style={styles.navigation} testID="calendar-month-navigation">
            <View style={styles.monthNavigationAction} testID="calendar-month-previous-slot">
              <IconAction accessibilityLabel={previous === null ? "Previous month unavailable" : `Show ${monthLabel(previous)}`} disabled={interactionDisabled || previous === null} icon="back" onPress={() => navigateMonth(-1)} />
            </View>
            <View style={styles.monthTitleSlot} testID="calendar-month-title-slot">
              <Text
                accessibilityLabel={visibleMonthLabel}
                accessibilityRole="header"
                ellipsizeMode="tail"
                numberOfLines={1}
                style={[calendarTypeScale.heading as TextStyle, styles.monthTitle, { color: colors.textPrimary }]}
                testID="calendar-month-title"
              >
                {visibleMonthLabel}
              </Text>
            </View>
            <View style={styles.monthTodaySlot} testID="calendar-month-today-slot">
              <FocusablePressable
                accessibilityHint="Returns the Calendar selection to the current local date"
                accessibilityLabel={`Return to today, ${fullDate(parsedToday)}`}
                accessibilityRole="button"
                disabled={interactionDisabled}
                onPress={returnToToday}
                style={({ pressed }) => [
                  styles.todayAction,
                  { backgroundColor: pressed ? colors.surfaceSubtle : "transparent" },
                ]}
              >
                <Text style={[typeScale.bodyStrong as TextStyle, styles.todayLabel, { color: colors.blue }]}>Today</Text>
              </FocusablePressable>
            </View>
            <View style={styles.monthNavigationAction} testID="calendar-month-next-slot">
              <IconAction accessibilityLabel={following === null ? "Next month unavailable" : `Show ${monthLabel(following)}`} disabled={interactionDisabled || following === null} icon="forward" onPress={() => navigateMonth(1)} />
            </View>
          </View>
          {isLoading && range !== null ? <Text accessibilityLiveRegion="polite" style={[typeScale.label as TextStyle, { color: colors.textSecondary }]}>Updating Calendar</Text> : null}
          {error === null ? null : (
            <InlineNotice
              action={<PrimaryAction label="Retry Calendar" onPress={() => setRetryGeneration((value) => value + 1)} />}
              body="Your saved workouts were not changed. Try loading Calendar again."
              heading="Calendar could not be loaded"
              tone="error"
            />
          )}
          <View
            accessibilityElementsHidden={isCalendarKeyOpen}
            accessibilityLabel="Calendar month grid"
            importantForAccessibility={isCalendarKeyOpen ? "no-hide-descendants" : "yes"}
            pointerEvents={isCalendarKeyOpen ? "none" : "auto"}
            style={[
              styles.gridRegion,
              {
                marginHorizontal: -adaptiveScreenInset,
                paddingHorizontal: calendarInset,
              },
            ]}
          >
            <View style={styles.weekdayRow}>{MONDAY_FIRST.map((day) => <Text key={day} style={[calendarTypeScale.numeric as TextStyle, styles.weekday, { color: colors.textSecondary }]}>{day}</Text>)}</View>
            {range === null ? (
              <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.skeletonMonth}>
                <Text accessibilityLiveRegion="polite" style={styles.visuallyHidden}>Loading Calendar</Text>
                <SkeletonBlock height={52} />
                <SkeletonBlock height={340} />
              </View>
            ) : (
              <CalendarMonthViewport
                agenda={agendaRegion}
                command={calendarCommand}
                {...(diagnosticStage === undefined ? {} : { diagnosticStage })}
                disabled={interactionDisabled}
                fontScale={fontScale}
                focusedWeek={focusedWeek}
                layoutGeneration={layoutGeneration}
                month={visibleMonth}
                onCancel={invalidateLayout}
                onComplete={(epoch) => dispatchCalendarTransition({ type: "settle-complete", epoch })}
                {...(diagnostics === undefined ? {} : {
                  onInteractionDiagnosticComplete: finishDiagnosticInteraction,
                  onInteractionDiagnosticStart: startDiagnosticInteraction,
                })}
                onPreview={(dx, viewportWidth) => dispatchCalendarTransition({ type: "drag", dx, dy: 0, viewportWidth })}
                onRelease={({ dx, dy, targetMonthId, viewportWidth }) => dispatchCalendarTransition({
                  type: "release",
                  dx,
                  dy,
                  targetMonthId,
                  targetSelectedLocalDate: addLocalMonthsClamped(
                    selectedDateRef.current,
                    targetMonthId > calendarTransitionRef.current.currentMonthId ? 1 : -1,
                  ),
                  viewportWidth,
                })}
                renderMonth={(panelMonth, interactive) => {
                  const panelWeeks = calendarGridForMonth(panelMonth);
                  const focusedStable = calendarTransition.mode === "focused";
                  const morphingWeek = calendarCommand?.kind === "settle-week";
                  const followingStart = focusedWeek?.followingDates[0];
                  const selectedStart = focusedWeek?.selectedDates[0];
                  const renderRow = (dates: readonly LocalDate[], hidden: boolean) => (
                    <CalendarWeekRow
                      dates={dates}
                      daysByDate={daysByDate}
                      disabled={interactionDisabled}
                      eventsByDate={eventsByDate}
                      fontScale={fontScale}
                      hidden={hidden}
                      key={dates[0]}
                      month={panelMonth}
                      {...(interactive ? { onLayout: (event: LayoutChangeEvent) => recordWeekGeometry(dates[0]!, event.nativeEvent.layout) } : {})}
                      {...(interactive && !hidden ? { onDateRef: registerDateCell } : {})}
                      onMoveDate={(date) => { if (interactive) moveSelection(date, true); }}
                      onPressDate={(date) => {
                        if (!interactive) return;
                        const weekStart = dates[0]!;
                        if (calendarTransition.mode === "focused" && weekStart !== selectedStart) {
                          pendingDateFocusRef.current = date;
                          dispatchCalendarTransition({ type: "select-adjacent", localDate: date, targetMonthId: date.slice(0, 7) });
                        } else {
                          moveSelection(date);
                          pendingCollapseFocusRef.current = true;
                          dispatchCalendarTransition({ type: "expand" });
                        }
                      }}
                      selectedDate={visibleSelectedDate}
                      today={parsedToday}
                    />
                  );
                  return (
                    <>
                      {panelWeeks.map((dates) => renderRow(
                        dates,
                        interactive && (focusedStable || (morphingWeek && (dates[0] === selectedStart || dates[0] === followingStart))),
                      ))}
                      {interactive && (focusedStable || morphingWeek) && followingWeek !== undefined && !panelWeeks.some((dates) => dates[0] === followingWeek[0])
                        ? renderRow(followingWeek, true)
                        : null}
                    </>
                  );
                }}
                renderWeek={(dates, interactive) => (
                  <CalendarWeekRow
                    dates={dates}
                    daysByDate={daysByDate}
                    disabled={interactionDisabled}
                    eventsByDate={eventsByDate}
                    fontScale={fontScale}
                    month={visibleMonth}
                    {...(interactive ? { onDateRef: registerDateCell } : {})}
                    onMoveDate={(date) => { if (interactive) moveSelection(date, true); }}
                    onPressDate={(date) => {
                      if (!interactive) return;
                      if (dates[0] !== focusedWeek?.selectedDates[0]) {
                        pendingDateFocusRef.current = date;
                        dispatchCalendarTransition({ type: "select-adjacent", localDate: date, targetMonthId: date.slice(0, 7) });
                      } else {
                        moveSelection(date, true);
                      }
                    }}
                    selectedDate={visibleSelectedDate}
                    today={parsedToday}
                  />
                )}
                transition={calendarTransition}
                weekCount={visibleWeekRows.length}
              />
            )}
          </View>
          <BottomSheet
            cancelLabel="Close Calendar key"
            heading="Calendar key"
            headingStyle={calendarTypeScale.heading as TextStyle}
            horizontalInset={14}
            onCancel={() => setCalendarKeyOpen(false)}
            restoreFocusRef={infoActionRef}
            visible={isCalendarKeyOpen}
          >
            <Text style={[calendarTypeScale.body as TextStyle, { color: colors.textSecondary }]}>Color identifies the activity. Fill and border style identify its status.</Text>
            <View style={styles.keyGroup}>
              <Text style={[typeScale.label as TextStyle, styles.keyGroupTitle, { color: colors.textSecondary }]}>ACTIVITY</Text>
              <View style={styles.keyItems}>
                <View style={styles.activityKeyItem}>
                  <View style={[styles.activitySwatch, { backgroundColor: colors.orange }]} testID="calendar-key-strength-swatch" />
                  <Text style={[typeScale.body as TextStyle, { color: colors.calendarStrengthTextLight }]}>Strength</Text>
                </View>
                <View style={styles.activityKeyItem}>
                  <View style={[styles.activitySwatch, { backgroundColor: colors.blue }]} testID="calendar-key-running-swatch" />
                  <Text style={[typeScale.body as TextStyle, { color: colors.blue }]}>Running</Text>
                </View>
              </View>
            </View>
            <View style={styles.keyGroup}>
              <Text style={[typeScale.label as TextStyle, styles.keyGroupTitle, { color: colors.textSecondary }]}>STATUS</Text>
              <View style={styles.keyItems}>
                <View style={styles.statusKeyItem}>
                  <View style={[styles.statusSwatch, styles.completeKey, { backgroundColor: colorWithAlpha(colors.textPrimary, 0.14), borderColor: colors.textPrimary }]} testID="calendar-key-complete" />
                  <Text style={[calendarTypeScale.body as TextStyle, { color: colors.textPrimary }]}>Complete</Text>
                </View>
                <View style={styles.statusKeyItem}>
                  <View style={[styles.statusSwatch, styles.partialKey, { borderColor: colors.textPrimary }]} testID="calendar-key-partial">
                    <View style={[styles.keyPartialFill, { backgroundColor: colorWithAlpha(colors.textPrimary, 0.18) }]} testID="calendar-key-partial-fill" />
                  </View>
                  <Text style={[calendarTypeScale.body as TextStyle, { color: colors.textPrimary }]}>Partial</Text>
                </View>
                <View style={styles.statusKeyItem}>
                  <View style={[styles.statusSwatch, styles.plannedKey, { borderColor: colors.textPrimary }]} testID="calendar-key-planned" />
                  <Text style={[calendarTypeScale.body as TextStyle, { color: colors.textPrimary }]}>Planned</Text>
                </View>
              </View>
            </View>
          </BottomSheet>
        </View>
        </React.Profiler>
      )}
    />
  );
}

const styles = StyleSheet.create({
  agendaRegion: { flex: 1, gap: 10, minHeight: 0 },
  activityKeyItem: { alignItems: "center", flexDirection: "row", gap: 4 },
  activitySwatch: { borderRadius: 2, height: 8, width: 24 },
  agendaHeading: { borderBottomWidth: 2, gap: 4, minHeight: 62, paddingBottom: 8, paddingRight: 48, position: "relative" },
  collapseAction: { alignItems: "center", height: 48, justifyContent: "center", position: "absolute", right: 0, top: 0, width: 48 },
  completeKey: { borderWidth: 1 },
  gridRegion: { flex: 1, gap: 2, minHeight: 0 },
  keyPartialFill: { bottom: 0, left: 0, position: "absolute", top: 0, width: "50%" },
  keyGroup: { gap: 8 },
  keyGroupTitle: { fontWeight: "800", letterSpacing: 0.6 },
  keyItems: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  monthNavigationAction: { width: 48 },
  monthTitle: { flexShrink: 1, textAlign: "center" },
  monthTitleSlot: { alignItems: "center", flex: 1, minWidth: 0 },
  monthTodaySlot: { width: 76 },
  navigation: { alignItems: "center", flexDirection: "row", gap: 3, minHeight: 52 },
  partialKey: { borderStyle: "dotted", borderWidth: 2 },
  plannedKey: { backgroundColor: "transparent", borderStyle: "dashed", borderWidth: 2 },
  screen: { flex: 1, gap: 10 },
  skeletonMonth: { gap: 8 },
  statusKeyItem: { alignItems: "center", flexDirection: "row", gap: 4 },
  statusSwatch: { height: 13, overflow: "hidden", position: "relative", width: 22 },
  todayAction: { alignItems: "center", borderRadius: 8, justifyContent: "center", minHeight: 48, paddingHorizontal: 8, width: 76 },
  todayLabel: { textAlign: "center" },
  weekday: { flex: 1, textAlign: "center" },
  weekdayRow: { flexDirection: "row", gap: 2 },
  visuallyHidden: { height: 0, opacity: 0, width: 0 },
});
