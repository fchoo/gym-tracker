import React, { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { ChevronRight } from "lucide-react-native";
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type TextStyle,
} from "react-native";

import type { CalendarDay, CalendarEventDestination, CalendarRange } from "./calendarPorts";
import { FocusablePressable } from "../components";
import { calendarTypeScale, space, typeScale, useAppTheme } from "../theme";

type CalendarAgendaEvent = CalendarRange["events"][number];

export type CalendarAgendaRowHandle = View & Readonly<{ focus?: () => void }>;

export type CalendarAgendaHandle = Readonly<{
  scrollTo(offset: number): void;
}>;

type CalendarAgendaProps = Readonly<{
  events: readonly CalendarAgendaEvent[];
  day?: CalendarDay;
  onActivateEvent(eventId: string): void;
  onOpenEvent(destination: CalendarEventDestination): void;
  onRequestBack(): void;
  onScrollOffsetChange(offset: number): void;
  resetActivationKey: number;
  rowRefs: React.MutableRefObject<Map<string, CalendarAgendaRowHandle>>;
}>;

function statusLabel(event: CalendarAgendaEvent): string {
  switch (event.status) {
    case "completed": return "Complete";
    case "partial": return "Partial";
    case "planned": return "Planned";
    case "imported":
    case "matched": return "Complete";
  }
}

/** One read-only full-width target per source event. */
export const CalendarAgenda = forwardRef<CalendarAgendaHandle, CalendarAgendaProps>(
  function CalendarAgenda({
    day,
    events,
    onActivateEvent,
    onOpenEvent,
    onRequestBack,
    onScrollOffsetChange,
    resetActivationKey,
    rowRefs,
  }, ref) {
    const { colors } = useAppTheme();
    const scrollRef = useRef<ScrollView>(null);
    const activeEventIdRef = useRef<string | null>(null);

    useImperativeHandle(ref, () => Object.freeze({
      scrollTo(offset: number) {
        scrollRef.current?.scrollTo({ animated: false, x: 0, y: Math.max(0, offset) });
      },
    }), []);

    useEffect(() => {
      activeEventIdRef.current = null;
    }, [resetActivationKey]);

    if (events.length === 0) {
      const rest = day?.kind === "rest" && day.restSummary !== null;
      return (
        <View accessibilityLabel={rest ? `No workout. Recovery is the plan. ${day.restSummary}` : "No workout. No scheduled or imported activity for this date."} style={[styles.empty, { borderColor: colors.line }]}>
          <Text accessibilityRole="header" style={[typeScale.bodyStrong as TextStyle, { color: colors.textPrimary }]}>No workout</Text>
          {rest ? <>
            <Text style={[typeScale.bodyStrong as TextStyle, { color: colors.textPrimary }]}>Recovery is the plan</Text>
            <Text style={[typeScale.body as TextStyle, { color: colors.textSecondary }]}>{day.restSummary}</Text>
          </> : <Text style={[typeScale.body as TextStyle, { color: colors.textSecondary }]}>No scheduled or imported activity for this date.</Text>}
        </View>
      );
    }

    return (
      <ScrollView
        accessibilityLabel={`${events.length} scheduled or imported event${events.length === 1 ? "" : "s"}`}
        contentContainerStyle={styles.content}
        onScroll={(event: NativeSyntheticEvent<NativeScrollEvent>) => onScrollOffsetChange(event.nativeEvent.contentOffset.y)}
        ref={scrollRef}
        scrollEventThrottle={16}
        style={styles.scroll}
        testID="calendar-agenda-scroll"
      >
        {events.map((event) => {
          const sport = event.sport === "strength" ? "Strength" : "Running";
          const status = statusLabel(event);
          const label = [event.title, event.displaySummary, `${sport} · ${status}`, event.sourceLabel, "Open details"].join(". ");
          const activate = () => {
            if (activeEventIdRef.current !== null) return;
            activeEventIdRef.current = event.id;
            onActivateEvent(event.id);
            onOpenEvent(event.destination);
          };
          return (
            <FocusablePressable
              accessibilityHint="Opens read-only details"
              accessibilityLabel={label}
              accessibilityRole="button"
              key={event.id}
              onKeyDown={(event) => {
                if (event.nativeEvent.key === "Escape") {
                  onRequestBack();
                } else if (event.nativeEvent.key === "Enter" || event.nativeEvent.key === " ") {
                  activate();
                }
              }}
              onPress={activate}
              ref={(node) => {
                if (node === null) rowRefs.current.delete(event.id);
                else rowRefs.current.set(event.id, node as CalendarAgendaRowHandle);
              }}
              style={({ pressed }) => [
                styles.row,
                { backgroundColor: pressed ? colors.surfaceSubtle : "transparent", borderBottomColor: colors.line },
              ]}
              testID={`calendar-agenda-event-${event.id}`}
            >
              <View style={[styles.rail, { backgroundColor: event.sport === "strength" ? colors.orange : colors.blue }]} />
              <View style={styles.copy}>
                <Text numberOfLines={undefined} style={[calendarTypeScale.bodyStrong as TextStyle, { color: colors.textPrimary }]}>{event.title}</Text>
                <Text numberOfLines={undefined} style={[calendarTypeScale.body as TextStyle, { color: colors.textSecondary }]}>{event.displaySummary}</Text>
                <Text numberOfLines={undefined} style={[calendarTypeScale.metadata as TextStyle, { color: colors.textSecondary }]}>{`${sport} · ${status}`}</Text>
                <Text numberOfLines={undefined} style={[calendarTypeScale.metadata as TextStyle, { color: colors.textSecondary }]}>{event.sourceLabel}</Text>
              </View>
              <ChevronRight accessible={false} color={colors.textSecondary} size={24} strokeWidth={2} />
            </FocusablePressable>
          );
        })}
      </ScrollView>
    );
  },
);

const styles = StyleSheet.create({
  content: { paddingBottom: space[4] },
  copy: { flex: 1, gap: 2, minWidth: 0, paddingVertical: 10 },
  empty: { borderWidth: 1, gap: space[1], padding: 10 },
  rail: { alignSelf: "stretch", minHeight: 82, width: 5 },
  row: { alignItems: "center", borderBottomWidth: 1, borderWidth: 0, flexDirection: "row", gap: 10, minHeight: 82, paddingRight: 10 },
  scroll: { flex: 1, minHeight: 0 },
});
