import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View, type TextStyle } from "react-native";

import { addLocalDays, parseLocalDate, type LocalDate } from "../../domains/scheduling";
import {
  addLocalMonthsClamped,
  calendarGridForMonth,
  startOfLocalMonth,
} from "../../domains/scheduling/localDate";
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

function monthLabel(value: LocalDate): string {
  return `${MONTH_NAMES[Number(value.slice(5, 7)) - 1] ?? ""} ${value.slice(0, 4)}`;
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
  const parsedToday = parseLocalDate(today);
  const [month, setMonth] = useState(() => startOfLocalMonth(parseLocalDate(initialDate)));
  const [selectedDate, setSelectedDate] = useState(() => parseLocalDate(initialDate));
  const [range, setRange] = useState<CalendarRange | null>(null);
  const weekRows = useMemo(() => calendarGridForMonth(month), [month]);
  const grid = useMemo(() => weekRows.flat(), [weekRows]);
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
            {weekRows.map((dates) => <CalendarWeekRow dates={dates} eventsByDate={eventsByDate} key={dates[0]} month={month} onPressDate={(date, events) => { setSelectedDate(date); const first = events[0]; if (first !== undefined) onOpenEvent(first.destination); }} selectedDate={selectedDate} today={parsedToday} />)}
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
