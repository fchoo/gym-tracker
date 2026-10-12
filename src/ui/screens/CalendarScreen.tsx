import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type TextStyle,
} from "react-native";

import { addLocalDays, parseLocalDate, type LocalDate } from "../../domains/scheduling";
import {
  addLocalMonthsClamped,
  calendarGridForMonth,
  startOfLocalMonth,
} from "../../domains/scheduling/localDate";
import type { CalendarEventDestination, CalendarRange, CalendarReadPort } from "../calendar/calendarPorts";
import { CalendarAgenda, type CalendarAgendaHandle, type CalendarAgendaRowHandle } from "../calendar/CalendarAgenda";
import { CalendarMonthViewport, type CalendarWeekGeometry } from "../calendar/CalendarMonthViewport";
import { CalendarWeekRow } from "../calendar/CalendarWeekRow";
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
import { space, typeScale, useAppTheme } from "../theme";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;
const MONDAY_FIRST = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const NOOP = () => undefined;

type CalendarScreenProps = Readonly<{
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
  const { width: safeWidth } = useWindowDimensions();
  const parsedToday = parseLocalDate(today);
  const [month, setMonth] = useState(() => startOfLocalMonth(parseLocalDate(initialDate)));
  const selectedDateRef = useRef<LocalDate>(parseLocalDate(initialDate));
  const [selectedDate, setSelectedDate] = useState(() => selectedDateRef.current);
  const [range, setRange] = useState<CalendarRange | null>(null);
  const [lastGoodMonth, setLastGoodMonth] = useState(() => startOfLocalMonth(parseLocalDate(initialDate)));
  const [lastGoodSelectedDate, setLastGoodSelectedDate] = useState(() => parseLocalDate(initialDate));
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [retryGeneration, setRetryGeneration] = useState(0);
  const [isCalendarKeyOpen, setCalendarKeyOpen] = useState(false);
  const [calendarTransition, setCalendarTransition] = useState<CalendarTransitionState>(() => createCalendarTransitionState({
    currentMonthId: initialDate.slice(0, 7),
    selectedLocalDate: initialDate,
    reducedMotion: reduceMotion,
  }));
  const [calendarCommand, setCalendarCommand] = useState<CalendarMotionCommand | null>(null);
  const [weekMeasurements, setWeekMeasurements] = useState<ReadonlyMap<LocalDate, CalendarWeekGeometry>>(() => new Map());
  const requestGeneration = useRef(0);
  const layoutGeneration = useRef(0);
  const calendarTransitionRef = useRef(calendarTransition);
  const pendingMonthRef = useRef<Readonly<{ month: LocalDate; selectedDate: LocalDate }> | null>(null);
  const infoActionRef = useRef<View>(null);
  const collapseActionRef = useRef<View>(null);
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
  const weekRows = useMemo(() => calendarGridForMonth(month), [month]);
  const grid = useMemo(() => weekRows.flat(), [weekRows]);
  const rangeInput = useMemo(() => ({
    startLocalDate: grid[0]!,
    endLocalDateExclusive: addLocalDays(grid[grid.length - 1]!, 8),
  }), [grid]);

  useEffect(() => {
    const request = requestGeneration.current + 1;
    requestGeneration.current = request;
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
      })
      .catch((nextError: unknown) => {
        if (!active || request !== requestGeneration.current) {
          return;
        }
        setError(nextError instanceof Error ? nextError : new Error("Calendar query failed"));
      })
      .finally(() => {
        if (active && request === requestGeneration.current) {
          setIsLoading(false);
        }
      });

    return () => { active = false; };
  }, [loadCalendarRange, month, rangeInput, retryGeneration]);

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
      pendingMonthRef.current = Object.freeze({ month: startOfLocalMonth(nextDate), selectedDate: nextDate });
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

  const navigateMonth = (direction: -1 | 1) => {
    const next = nextMonth(month, direction);
    if (next === null) {
      return;
    }
    dispatchCalendarTransition({
      type: "move",
      direction: direction === 1 ? "next" : "previous",
      targetMonthId: next.slice(0, 7),
      targetSelectedLocalDate: addLocalMonthsClamped(selectedDateRef.current, direction),
    });
  };

  const returnToToday = () => {
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

  const moveSelection = (date: LocalDate) => {
    if (date.slice(0, 7) !== month.slice(0, 7)) {
      dispatchCalendarTransition({
        type: "move",
        direction: date > selectedDateRef.current ? "next" : "previous",
        targetMonthId: date.slice(0, 7),
        targetSelectedLocalDate: date,
      });
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
    if (retained === null) return;

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
    setRetryGeneration((generation) => generation + 1);

    const frame = requestAnimationFrame(() => {
      agendaRef.current?.scrollTo(retained.agendaOffset);
      const target = agendaRowRefs.current.get(retained.eventId) ?? collapseActionRef.current;
      if (target === undefined || target === null) return;
      target.focus?.();
      AccessibilityInfo.sendAccessibilityEvent(target, "focus");
    });
    return () => cancelAnimationFrame(frame);
  }, [returnFocusGeneration]);

  const recordWeekGeometry = useCallback((weekStart: LocalDate, geometry: Readonly<{ y: number; height: number }>) => {
    if (!Number.isFinite(geometry.y) || !Number.isFinite(geometry.height) || geometry.height <= 0) return;
    setWeekMeasurements((current) => {
      const existing = current.get(weekStart);
      if (existing?.y === geometry.y && existing.height === geometry.height) return current;
      const next = new Map(current);
      next.set(weekStart, Object.freeze({ ...geometry, generation: layoutGeneration.current }));
      return next;
    });
  }, []);

  const visibleMonth = range !== null && (isLoading || error !== null)
    ? lastGoodMonth
    : month;
  const visibleSelectedDate = range !== null && (isLoading || error !== null)
    ? lastGoodSelectedDate
    : selectedDate;
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
      selectedGeometry: weekMeasurements.get(selectedWeek[0]!) ?? null,
      followingGeometry: weekMeasurements.get(followingWeek[0]!) ?? null,
    });
  const calendarInset = Math.min(18, Math.max(0, (safeWidth - 348) / 2));
  const adaptiveScreenInset = safeWidth < 600 ? space[4] : safeWidth < 840 ? space[6] : space[8];

  const header = (
    <ScreenHeader
      {...(headingRef === undefined ? {} : { ref: headingRef as React.Ref<View> })}
      actions={[
        (
          <FocusablePressable
            accessibilityLabel="Open Calendar key"
            accessibilityRole="button"
            key="calendar-key"
            onPress={() => setCalendarKeyOpen(true)}
            ref={infoActionRef}
            style={({ pressed }) => [
              styles.infoAction,
              {
                backgroundColor: pressed ? colors.surface : "transparent",
                borderColor: colors.line,
              },
            ]}
          >
            <Text accessible={false} style={[typeScale.bodyStrong as TextStyle, { color: colors.textPrimary }]}>i</Text>
          </FocusablePressable>
        ),
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
    />
  );

  const eventsByDate = new Map<LocalDate, readonly CalendarRange["events"][number][]>();
  for (const event of range?.events ?? []) {
    eventsByDate.set(event.localDate, [...(eventsByDate.get(event.localDate) ?? []), event]);
  }
  const previous = nextMonth(month, -1);
  const following = nextMonth(month, 1);
  const titleBaseMonth = calendarTransition.phase === "settling"
    ? monthIdDate(calendarTransition.currentMonthId)
    : month;
  const titleMonth = calendarTransition.titlePanel === "previous" ? nextMonth(titleBaseMonth, -1)
    : calendarTransition.titlePanel === "next" ? nextMonth(titleBaseMonth, 1)
      : titleBaseMonth;
  const selectedEvents = (range?.events ?? []).filter((event) => event.localDate === visibleSelectedDate);

  return (
    <AdaptiveScreen
      onRequestBack={requestCalendarBack}
      scrollable={false}
      primary={(
        <View style={styles.screen}>
          {header}
          <View style={styles.navigation}>
            <IconAction accessibilityLabel={previous === null ? "Previous month unavailable" : `Show ${monthLabel(previous)}`} disabled={previous === null} icon="back" onPress={() => navigateMonth(-1)} />
            <Text accessibilityRole="header" style={[typeScale.sectionTitle as TextStyle, { color: colors.textPrimary }]}>{monthLabel(titleMonth ?? month)}</Text>
            <FocusablePressable
              accessibilityHint="Returns the Calendar selection to the current local date"
              accessibilityLabel={`Return to today, ${fullDate(parsedToday)}`}
              accessibilityRole="button"
              onPress={returnToToday}
              style={({ pressed }) => [
                styles.todayAction,
                { backgroundColor: pressed ? colors.actionPressed : colors.action },
              ]}
            >
              <Text style={[typeScale.bodyStrong as TextStyle, { color: colors.onAction }]}>Today</Text>
            </FocusablePressable>
            <IconAction accessibilityLabel={following === null ? "Next month unavailable" : `Show ${monthLabel(following)}`} disabled={following === null} icon="forward" onPress={() => navigateMonth(1)} />
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
              calendarTransition.mode === "focused" && styles.focusedGridRegion,
              {
                marginHorizontal: -adaptiveScreenInset,
                paddingHorizontal: calendarInset,
              },
            ]}
          >
            <View style={styles.weekdayRow}>{MONDAY_FIRST.map((day) => <Text key={day} style={[typeScale.label as TextStyle, styles.weekday, { color: colors.textSecondary }]}>{day}</Text>)}</View>
            {range === null ? (
              <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.skeletonMonth}>
                <Text accessibilityLiveRegion="polite" style={styles.visuallyHidden}>Loading Calendar</Text>
                <SkeletonBlock height={52} />
                <SkeletonBlock height={340} />
              </View>
            ) : (
              <CalendarMonthViewport
                command={calendarCommand}
                focusedWeek={focusedWeek}
                month={visibleMonth}
                onCancel={() => dispatchCalendarTransition({ type: "invalidate" })}
                onComplete={(epoch) => dispatchCalendarTransition({ type: "settle-complete", epoch })}
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
                      eventsByDate={eventsByDate}
                      hidden={hidden}
                      key={dates[0]}
                      month={panelMonth}
                      onLayout={(event) => recordWeekGeometry(dates[0]!, event.nativeEvent.layout)}
                      onMoveDate={(date) => { if (interactive) moveSelection(date); }}
                      onPressDate={(date) => {
                        if (!interactive) return;
                        const weekStart = dates[0]!;
                        if (calendarTransition.mode === "focused" && weekStart !== selectedStart) {
                          dispatchCalendarTransition({ type: "select-adjacent", localDate: date, targetMonthId: date.slice(0, 7) });
                        } else {
                          moveSelection(date);
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
                    eventsByDate={eventsByDate}
                    month={visibleMonth}
                    onMoveDate={(date) => { if (interactive) moveSelection(date); }}
                    onPressDate={(date) => {
                      if (!interactive) return;
                      moveSelection(date);
                      dispatchCalendarTransition({ type: "expand" });
                    }}
                    selectedDate={visibleSelectedDate}
                    today={parsedToday}
                  />
                )}
                transition={calendarTransition}
              />
            )}
          </View>
          {calendarTransition.mode !== "focused" ? null : (
            <View style={styles.agendaRegion}>
              <FocusablePressable
                accessibilityLabel="Collapse day and return to month"
                accessibilityRole="button"
                onKeyDown={(event) => {
                  if (event.nativeEvent.key === "Escape") requestCalendarBack();
                }}
                onPress={() => dispatchCalendarTransition({ type: "collapse" })}
                ref={collapseActionRef}
                style={({ pressed }) => [
                  styles.collapseAction,
                  { backgroundColor: pressed ? colors.surfaceSubtle : colors.surface, borderColor: colors.line },
                ]}
              >
                <Text style={[typeScale.label as TextStyle, { color: colors.textPrimary }]}>Collapse day and return to month</Text>
              </FocusablePressable>
              <CalendarAgenda
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
          )}
          <BottomSheet
            cancelLabel="Close Calendar key"
            heading="Calendar key"
            onCancel={() => setCalendarKeyOpen(false)}
            restoreFocusRef={infoActionRef}
            visible={isCalendarKeyOpen}
          >
            <Text style={[typeScale.body as TextStyle, { color: colors.textSecondary }]}>Color identifies the activity. Fill and border style identify its status.</Text>
            <View style={styles.keyGroup}>
              <Text style={[typeScale.label as TextStyle, styles.keyGroupTitle, { color: colors.textSecondary }]}>ACTIVITY</Text>
              <View style={styles.keyItems}>
                <Text style={[typeScale.body as TextStyle, { color: colors.calendarStrengthTextLight }]}>Strength</Text>
                <Text style={[typeScale.body as TextStyle, { color: colors.blue }]}>Running</Text>
              </View>
            </View>
            <View style={styles.keyGroup}>
              <Text style={[typeScale.label as TextStyle, styles.keyGroupTitle, { color: colors.textSecondary }]}>STATUS</Text>
              <View style={styles.keyItems}>
                <Text style={[typeScale.body as TextStyle, styles.completeKey, { borderColor: colors.textPrimary, color: colors.textPrimary }]}>Complete</Text>
                <Text style={[typeScale.body as TextStyle, styles.partialKey, { borderColor: colors.textPrimary, color: colors.textPrimary }]}>Partial</Text>
                <Text style={[typeScale.body as TextStyle, styles.plannedKey, { borderColor: colors.textPrimary, color: colors.textPrimary }]}>Planned</Text>
              </View>
            </View>
          </BottomSheet>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  agendaRegion: { flex: 1, gap: 10, minHeight: 0 },
  collapseAction: { alignItems: "flex-start", borderWidth: 1, justifyContent: "center", minHeight: 48, paddingHorizontal: 10 },
  completeKey: { backgroundColor: "rgba(22, 107, 76, 0.12)", borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4 },
  focusedGridRegion: { flex: 0, maxHeight: 260 },
  gridRegion: { flex: 1, gap: 2, minHeight: 0 },
  infoAction: { alignItems: "center", borderRadius: 24, borderWidth: 1, height: 48, justifyContent: "center", width: 48 },
  keyGroup: { gap: 8 },
  keyGroupTitle: { fontWeight: "800", letterSpacing: 0.6 },
  keyItems: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  navigation: { alignItems: "center", flexDirection: "row", gap: 3, justifyContent: "space-between", minHeight: 52 },
  partialKey: { backgroundColor: "rgba(141, 93, 0, 0.12)", borderStyle: "dotted", borderWidth: 2, paddingHorizontal: 8, paddingVertical: 3 },
  plannedKey: { backgroundColor: "transparent", borderStyle: "dashed", borderWidth: 2, paddingHorizontal: 8, paddingVertical: 3 },
  screen: { flex: 1, gap: 10 },
  skeletonMonth: { gap: 8 },
  todayAction: { alignItems: "center", borderRadius: 8, height: 48, justifyContent: "center", minWidth: 76, paddingHorizontal: 8 },
  weekday: { flex: 1, textAlign: "center" },
  weekdayRow: { flexDirection: "row", gap: 2 },
  visuallyHidden: { height: 0, opacity: 0, width: 0 },
});
