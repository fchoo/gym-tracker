import React from "react";
import {
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type TextStyle,
} from "react-native";

import { addLocalDays, type LocalDate } from "../../domains/scheduling";
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
  hidden = false,
  onLayout,
  onMoveDate,
  onPressDate,
  selectedDate,
  today,
}: Readonly<{
  dates: readonly LocalDate[];
  eventsByDate: ReadonlyMap<LocalDate, readonly CalendarEvent[]>;
  month: LocalDate;
  hidden?: boolean;
  onLayout?(event: LayoutChangeEvent): void;
  onMoveDate(date: LocalDate): void;
  onPressDate(date: LocalDate, events: readonly CalendarEvent[]): void;
  selectedDate: LocalDate;
  today: LocalDate;
}>) {
  const { colors } = useAppTheme();

  return (
    <View
      accessibilityElementsHidden={hidden}
      importantForAccessibility={hidden ? "no-hide-descendants" : "yes"}
      onLayout={onLayout}
      style={[styles.row, hidden && styles.hidden]}
      testID="calendar-week-row"
    >
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
            onKeyDown={(event) => {
              const key = event.nativeEvent.key;
              const days = key === "ArrowLeft" ? -1
                : key === "ArrowRight" ? 1
                  : key === "ArrowUp" ? -7
                    : key === "ArrowDown" ? 7
                      : null;
              if (days !== null) {
                onMoveDate(addLocalDays(date, days));
                return;
              }
              if (key === "Enter" || key === " " || key === "Select") {
                onPressDate(date, events);
              }
            }}
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
            <View style={[styles.dateTrack, date === today && { borderColor: colors.blue }]}>
              <Text style={[typeScale.label as TextStyle, { color: colors.textPrimary }]}>{Number(date.slice(8, 10))}</Text>
            </View>
            <View style={styles.events}>
              {presentation.visualEvents.map((event, index) => (
                <Text
                  accessible={false}
                  key={event.id}
                  numberOfLines={1}
                  style={[
                    typeScale.secondary as TextStyle,
                    styles.eventChip,
                    event.status === "planned"
                      ? styles.plannedChip
                      : event.status === "partial"
                        ? styles.partialChip
                        : styles.completeChip,
                    {
                      backgroundColor: event.status === "planned"
                        ? "transparent"
                        : event.status === "partial"
                          ? colors.yellowBg
                          : colors.greenBg,
                      borderColor: event.sport === "strength" ? colors.orange : colors.blue,
                      color: event.sport === "strength" ? colors.calendarStrengthTextLight : colors.blue,
                    },
                  ]}
                >
                  {event.title}{index === 1 && presentation.overflowCount > 0 ? ` +${presentation.overflowCount}` : ""}
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
    gap: 0,
    minHeight: sizes.minimumTarget,
    paddingHorizontal: 2,
    paddingVertical: 3,
  },
  completeChip: { borderStyle: "solid", borderWidth: 1 },
  dateTrack: { alignItems: "flex-start", borderColor: "transparent", borderRadius: 14, borderWidth: 2, height: 28, justifyContent: "center", paddingHorizontal: 2 },
  eventChip: { borderRadius: 3, fontSize: 11, fontWeight: "800", height: 17, lineHeight: 14, overflow: "hidden", paddingHorizontal: 2 },
  events: { gap: 2, height: 36 },
  hidden: { opacity: 0 },
  partialChip: { borderStyle: "dotted", borderWidth: 2 },
  plannedChip: { borderStyle: "dashed", borderWidth: 2 },
  row: { flexDirection: "row", gap: 2 },
});
