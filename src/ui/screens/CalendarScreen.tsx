import React, { useEffect, useMemo, useRef, useState } from "react";
import {
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
import { CalendarWeekRow } from "../calendar/CalendarWeekRow";
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

type CalendarScreenProps = Readonly<{
  initialDate: string;
  loadCalendarRange: CalendarReadPort["loadCalendarRange"];
  onOpenEvent(destination: CalendarEventDestination): void;
  onOpenSettings?(): void;
  today?: string;
  headingRef?: React.RefObject<RootFocusTarget | null>;
  settingsActionRef?: React.RefObject<RootFocusTarget | null>;
  settingsActionNativeID?: string;
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

export function CalendarScreen({
  initialDate,
  loadCalendarRange,
  onOpenEvent,
  onOpenSettings = () => undefined,
  today = initialDate,
  headingRef,
  settingsActionNativeID,
  settingsActionRef,
}: CalendarScreenProps) {
  const { colors } = useAppTheme();
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
  const requestGeneration = useRef(0);
  const infoActionRef = useRef<View>(null);
  const weekRows = useMemo(() => calendarGridForMonth(month), [month]);
  const grid = useMemo(() => weekRows.flat(), [weekRows]);
  const rangeInput = useMemo(() => ({
    startLocalDate: grid[0]!,
    endLocalDateExclusive: addLocalDays(grid[grid.length - 1]!, 1),
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

  const navigateMonth = (direction: -1 | 1) => {
    const next = nextMonth(month, direction);
    if (next === null) {
      return;
    }
    setMonth(next);
    selectDate(addLocalMonthsClamped(selectedDate, direction));
  };

  const returnToToday = () => {
    setMonth(startOfLocalMonth(parsedToday));
    selectDate(parsedToday);
  };

  const moveSelection = (date: LocalDate) => {
    selectDate(date);
    if (date.slice(0, 7) !== month.slice(0, 7)) {
      setMonth(startOfLocalMonth(date));
    }
  };

  const visibleMonth = range !== null && (isLoading || error !== null)
    ? lastGoodMonth
    : month;
  const visibleSelectedDate = range !== null && (isLoading || error !== null)
    ? lastGoodSelectedDate
    : selectedDate;
  const visibleWeekRows = visibleMonth === month
    ? weekRows
    : calendarGridForMonth(visibleMonth);
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

  return (
    <AdaptiveScreen
      scrollable={false}
      primary={(
        <View style={styles.screen}>
          {header}
          <View style={styles.navigation}>
            <IconAction accessibilityLabel={previous === null ? "Previous month unavailable" : `Show ${monthLabel(previous)}`} disabled={previous === null} icon="back" onPress={() => navigateMonth(-1)} />
            <Text accessibilityRole="header" style={[typeScale.sectionTitle as TextStyle, { color: colors.textPrimary }]}>{monthLabel(month)}</Text>
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
            ) : visibleWeekRows.map((dates) => (
              <CalendarWeekRow
                dates={dates}
                eventsByDate={eventsByDate}
                key={dates[0]}
                month={visibleMonth}
                onMoveDate={(date) => moveSelection(date)}
                onPressDate={(date, events) => {
                  moveSelection(date);
                  const first = events[0];
                  if (first !== undefined) onOpenEvent(first.destination);
                }}
                selectedDate={visibleSelectedDate}
                today={parsedToday}
              />
            ))}
          </View>
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
  completeKey: { backgroundColor: "rgba(22, 107, 76, 0.12)", borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4 },
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
