import React from "react";
import {
  StyleSheet,
  Text,
  View,
  type TextStyle,
} from "react-native";

import type { LocalDate } from "../../domains/scheduling";
import {
  calendarDayAccessibilityLabel,
  calendarDayPresentation,
  orderedCalendarEvents,
} from "../../domains/history/calendar";
import type { CalendarEvent } from "./calendarPorts";
import { FocusablePressable } from "../components";
import { radius, sizes, typeScale, useAppTheme } from "../theme";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

function fullDate(value: LocalDate): string {
  return `${Number(value.slice(8, 10))} ${MONTH_NAMES[Number(value.slice(5, 7)) - 1] ?? ""} ${value.slice(0, 4)}`;
}

export function CalendarWeekRow({
  dates,
  eventsByDate,
  month,
  onPressDate,
  selectedDate,
  today,
}: Readonly<{
  dates: readonly LocalDate[];
  eventsByDate: ReadonlyMap<LocalDate, readonly CalendarEvent[]>;
  month: LocalDate;
  onPressDate(date: LocalDate, events: readonly CalendarEvent[]): void;
  selectedDate: LocalDate;
  today: LocalDate;
}>) {
  const { colors } = useAppTheme();

  return (
    <View style={styles.row} testID="calendar-week-row">
      {dates.map((date) => {
        const events = orderedCalendarEvents(eventsByDate.get(date) ?? []);
        const presentation = calendarDayPresentation(events);
        const outsideMonth = date.slice(0, 7) !== month.slice(0, 7);
        const selected = date === selectedDate;
        const label = calendarDayAccessibilityLabel({
          date: fullDate(date),
          events,
          isOutsideMonth: outsideMonth,
          isSelected: selected,
          isToday: date === today,
        });

        return (
          <FocusablePressable
            accessibilityLabel={label}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            key={date}
            onPress={() => onPressDate(date, events)}
            style={({ pressed }: { pressed: boolean }) => [
              styles.cell,
              {
                backgroundColor: selected ? colors.blueBg : pressed ? colors.surface : colors.paper,
                borderColor: selected ? colors.blue : colors.line,
                opacity: outsideMonth ? 0.5 : 1,
              },
            ]}
            testID={`calendar-day-${date}`}
          >
            <Text style={[typeScale.label as TextStyle, { color: colors.textPrimary }]}>{Number(date.slice(8, 10))}</Text>
            <View style={styles.events}>
              {presentation.visualEvents.map((event) => (
                <Text
                  accessible={false}
                  key={event.id}
                  numberOfLines={1}
                  style={[
                    typeScale.secondary as TextStyle,
                    styles.eventChip,
                    { color: event.sport === "strength" ? colors.calendarStrengthTextLight : colors.blue },
                  ]}
                >
                  {event.title}
                </Text>
              ))}
            </View>
          </FocusablePressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  cell: {
    borderRadius: radius.standard,
    borderWidth: 1,
    flex: 1,
    gap: 2,
    minHeight: sizes.minimumTarget,
    paddingHorizontal: 2,
    paddingVertical: 3,
  },
  eventChip: { fontSize: 11, lineHeight: 14, fontWeight: "800" },
  events: { gap: 2, minHeight: 36 },
  row: { flexDirection: "row", gap: 2 },
});
