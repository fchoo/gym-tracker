import React from "react";
import {
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type TextStyle,
  type View as NativeView,
} from "react-native";

import { addLocalDays, type LocalDate } from "../../domains/scheduling";
import {
  calendarDayAccessibilityLabel,
  calendarDayPresentation,
  orderedCalendarEvents,
} from "../../domains/history/calendar";
import type { CalendarDay, CalendarEvent } from "./calendarPorts";
import { FocusablePressable } from "../components";
import { calendarTypeScale, colorWithAlpha, radius, sizes, useAppTheme } from "../theme";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

function fullDate(value: LocalDate): string {
  return `${Number(value.slice(8, 10))} ${MONTH_NAMES[Number(value.slice(5, 7)) - 1] ?? ""} ${value.slice(0, 4)}`;
}

export type CalendarTrackMetrics = Readonly<{
  chipMinHeight: number;
  dateTrackMinHeight: number;
  eventTrackMinHeight: number;
  rowMinHeight: number;
}>;

export type CalendarDateCellHandle = NativeView & Readonly<{ focus?: () => void }>;

export function calendarTrackMetrics(fontScale: number): CalendarTrackMetrics {
  const scale = Number.isFinite(fontScale) ? Math.max(1, fontScale) : 1;
  const chipMinHeight = scale === 1 ? 17 : Math.ceil(14 * scale + 4);
  const dateTrackMinHeight = Math.max(28, Math.ceil(22 * scale + 6));
  const eventTrackMinHeight = Math.max(36, chipMinHeight * 2 + 2);
  return Object.freeze({
    chipMinHeight,
    dateTrackMinHeight,
    eventTrackMinHeight,
    rowMinHeight: Math.max(70, dateTrackMinHeight + eventTrackMinHeight + 6),
  });
}

export function CalendarWeekRow({
  dates,
  daysByDate,
  disabled = false,
  eventsByDate,
  fontScale = 1,
  month,
  hidden = false,
  onLayout,
  onDateRef,
  onMoveDate,
  onPressDate,
  selectedDate,
  today,
}: Readonly<{
  dates: readonly LocalDate[];
  daysByDate?: ReadonlyMap<LocalDate, CalendarDay>;
  disabled?: boolean;
  eventsByDate: ReadonlyMap<LocalDate, readonly CalendarEvent[]>;
  fontScale?: number;
  month: LocalDate;
  hidden?: boolean;
  onLayout?(event: LayoutChangeEvent): void;
  onDateRef?(date: LocalDate, node: CalendarDateCellHandle | null): void;
  onMoveDate(date: LocalDate): void;
  onPressDate(date: LocalDate, events: readonly CalendarEvent[]): void;
  selectedDate: LocalDate;
  today: LocalDate;
}>) {
  const { colors } = useAppTheme();
  const metrics = calendarTrackMetrics(fontScale);

  return (
    <View
      accessibilityElementsHidden={hidden}
      importantForAccessibility={hidden ? "no-hide-descendants" : "yes"}
      onLayout={onLayout}
      style={[styles.row, { minHeight: metrics.rowMinHeight }, hidden && styles.hidden]}
      testID={`calendar-week-row-${dates[0]}`}
    >
      {dates.map((date) => {
        const events = orderedCalendarEvents(eventsByDate.get(date) ?? []);
        const presentation = calendarDayPresentation(events);
        const day = daysByDate?.get(date);
        const isRest = events.length === 0 && day?.kind === "rest";
        const outsideMonth = date.slice(0, 7) !== month.slice(0, 7);
        const selected = date === selectedDate;
        const label = calendarDayAccessibilityLabel({
          date: fullDate(date),
          events,
          isOutsideMonth: outsideMonth,
          isRest,
          isSelected: selected,
          isToday: date === today,
        });

        return (
          <FocusablePressable
            accessibilityLabel={label}
            accessibilityRole="button"
            accessibilityState={{ disabled, selected }}
            disabled={disabled}
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
            ref={(node) => onDateRef?.(date, node as CalendarDateCellHandle | null)}
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
            <View
              style={[styles.dateTrack, { minHeight: metrics.dateTrackMinHeight }, date === today && { borderColor: colors.blue }]}
              testID={`calendar-date-track-${date}`}
            >
              <Text
                style={[calendarTypeScale.numeric as TextStyle, { color: colors.textPrimary }]}
                testID={`calendar-date-number-${date}`}
              >
                {Number(date.slice(8, 10))}
              </Text>
            </View>
            <View style={[styles.events, { minHeight: metrics.eventTrackMinHeight }]} testID={`calendar-event-track-${date}`}>
              {presentation.visualEvents.map((event, index) => {
                const visualStatus = event.status === "partial" || event.status === "planned" ? event.status : "completed";
                const sportColor = event.sport === "strength" ? colors.orange : colors.blue;
                return (
                <View
                  accessible={false}
                  key={event.id}
                  style={[
                    styles.eventChip,
                    { minHeight: metrics.chipMinHeight },
                    visualStatus === "planned"
                      ? styles.plannedChip
                      : visualStatus === "partial"
                        ? styles.partialChip
                        : styles.completeChip,
                    {
                      backgroundColor: visualStatus === "completed" ? colorWithAlpha(sportColor, 0.14) : "transparent",
                      borderColor: sportColor,
                    },
                  ]}
                  testID={`calendar-event-chip-${event.id}`}
                >
                  {visualStatus === "partial" ? (
                    <View
                      style={[styles.partialFill, { backgroundColor: colorWithAlpha(sportColor, 0.18) }]}
                      testID={`calendar-event-partial-fill-${event.id}`}
                    />
                  ) : null}
                  <Text
                    numberOfLines={1}
                    style={[
                      calendarTypeScale.event as TextStyle,
                      styles.eventChipText,
                      { color: event.sport === "strength" ? colors.calendarStrengthTextLight : colors.blue },
                    ]}
                  >
                    {event.title}{index === 1 && presentation.overflowCount > 0 ? ` +${presentation.overflowCount}` : ""}
                  </Text>
                </View>
              );})}
              {isRest ? <Text accessible={false} style={[calendarTypeScale.body as TextStyle, styles.restDash, { color: colors.textSecondary }]} testID={`calendar-rest-${date}`}>—</Text> : null}
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
  dateTrack: { alignItems: "flex-start", borderColor: "transparent", borderRadius: 14, borderWidth: 2, justifyContent: "center", paddingHorizontal: 2 },
  eventChip: { borderRadius: 3, justifyContent: "center", overflow: "hidden", paddingHorizontal: 2, position: "relative" },
  eventChipText: { zIndex: 1 },
  events: { gap: 2, position: "relative" },
  hidden: { opacity: 0 },
  partialChip: { borderStyle: "dotted", borderWidth: 2 },
  partialFill: { bottom: 0, left: 0, position: "absolute", top: 0, width: "50%" },
  plannedChip: { borderStyle: "dashed", borderWidth: 2 },
  restDash: { textAlign: "center" },
  row: { flex: 1, flexDirection: "row", gap: 2 },
});
