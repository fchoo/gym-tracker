import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View, type TextStyle } from "react-native";

import { addLocalDays, parseLocalDate, type LocalDate } from "../../domains/scheduling";
import { weekdayForLocalDate } from "../../domains/scheduling/localDate";
import type { CalendarEventDestination, CalendarRange, CalendarReadPort } from "../calendar/calendarPorts";
import { CalendarWeekRow } from "../calendar/CalendarWeekRow";
import { IconAction, ScreenHeader, SkeletonBlock } from "../components";
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

function startOfMonth(value: LocalDate): LocalDate {
  return parseLocalDate(`${value.slice(0, 8)}01`);
}

function monthLabel(value: LocalDate): string {
  return `${MONTH_NAMES[Number(value.slice(5, 7)) - 1] ?? ""} ${value.slice(0, 4)}`;
}

function mondayGridStart(value: LocalDate): LocalDate {
  const weekday = weekdayForLocalDate(value);
  const mondayOffset = weekday === "Sunday" ? 6 : ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].indexOf(weekday);
  return addLocalDays(value, -mondayOffset);
}

function sixWeekGrid(value: LocalDate): readonly LocalDate[] {
  const start = mondayGridStart(startOfMonth(value));
  return Array.from({ length: 42 }, (_, offset) => addLocalDays(start, offset));
}

function nextMonth(value: LocalDate, direction: -1 | 1): LocalDate | null {
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7)) + direction;
  const nextYear = month === 0 ? year - 1 : month === 13 ? year + 1 : year;
  const nextMonth = month === 0 ? 12 : month === 13 ? 1 : month;
  if (nextYear < 1 || nextYear > 9_999) return null;
  return parseLocalDate(`${String(nextYear).padStart(4, "0")}-${String(nextMonth).padStart(2, "0")}-01`);
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
  const parsedToday = parseLocalDate(today);
  const [month, setMonth] = useState(() => startOfMonth(parseLocalDate(initialDate)));
  const [selectedDate, setSelectedDate] = useState(() => parseLocalDate(initialDate));
  const [range, setRange] = useState<CalendarRange | null>(null);
  const grid = useMemo(() => sixWeekGrid(month), [month]);
  const rangeInput = useMemo(() => ({
    startLocalDate: grid[0]!,
    endLocalDateExclusive: addLocalDays(grid[grid.length - 1]!, 1),
  }), [grid]);

  useEffect(() => {
    let current = true;
    setRange(null);
    void loadCalendarRange(rangeInput).then((next) => {
      if (current) setRange(next);
    });
    return () => { current = false; };
  }, [loadCalendarRange, rangeInput]);

  const header = (
    <ScreenHeader
      {...(headingRef === undefined ? {} : { ref: headingRef as React.Ref<View> })}
      action={(
        <IconAction
          accessibilityLabel="Open App Settings"
          icon="settings"
          nativeID={settingsActionNativeID}
          onPress={onOpenSettings}
          ref={settingsActionRef as React.Ref<View>}
        />
      )}
      title="Calendar"
    />
  );

  if (range === null) {
    return <AdaptiveScreen primary={<>{header}<Text accessibilityLiveRegion="polite" style={styles.visuallyHidden}>Loading Calendar</Text><SkeletonBlock height={52} /><SkeletonBlock height={340} /></>} />;
  }

  const eventsByDate = new Map<LocalDate, readonly CalendarRange["events"][number][]>();
  for (const event of range.events) {
    eventsByDate.set(event.localDate, [...(eventsByDate.get(event.localDate) ?? []), event]);
  }
  const previous = nextMonth(month, -1);
  const following = nextMonth(month, 1);

  return (
    <AdaptiveScreen
      primary={(
        <>
          {header}
          <View style={styles.navigation}>
            <IconAction accessibilityLabel={previous === null ? "Previous month unavailable" : `Show ${monthLabel(previous)}`} disabled={previous === null} icon="back" onPress={() => previous !== null && setMonth(previous)} />
            <Text accessibilityRole="header" style={[typeScale.sectionTitle as TextStyle, { color: colors.textPrimary }]}>{monthLabel(month)}</Text>
            <IconAction accessibilityLabel={following === null ? "Next month unavailable" : `Show ${monthLabel(following)}`} disabled={following === null} icon="forward" onPress={() => following !== null && setMonth(following)} />
          </View>
          <View accessibilityLabel="Calendar month grid" style={styles.grid}>
            <View style={styles.weekdayRow}>{MONDAY_FIRST.map((day) => <Text key={day} style={[typeScale.label as TextStyle, styles.weekday, { color: colors.textSecondary }]}>{day}</Text>)}</View>
            {[0, 1, 2, 3, 4, 5].map((row) => <CalendarWeekRow dates={grid.slice(row * 7, row * 7 + 7)} eventsByDate={eventsByDate} key={grid[row * 7]} month={month} onPressDate={(date, events) => { setSelectedDate(date); const first = events[0]; if (first !== undefined) onOpenEvent(first.destination); }} selectedDate={selectedDate} today={parsedToday} />)}
          </View>
        </>
      )}
    />
  );
}

const styles = StyleSheet.create({
  grid: { gap: 2 },
  navigation: { alignItems: "center", flexDirection: "row", gap: 3, justifyContent: "space-between", minHeight: 52 },
  weekday: { flex: 1, textAlign: "center" },
  weekdayRow: { flexDirection: "row", gap: 2 },
  visuallyHidden: { height: 0, opacity: 0, width: 0 },
});
