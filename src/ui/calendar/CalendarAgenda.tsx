import React, { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type TextStyle,
} from "react-native";

import type { CalendarEventDestination, CalendarRange } from "./calendarPorts";
import { FocusablePressable } from "../components";
import { space, typeScale, useAppTheme } from "../theme";

type CalendarAgendaEvent = CalendarRange["events"][number];

export type CalendarAgendaRowHandle = View & Readonly<{ focus?: () => void }>;

export type CalendarAgendaHandle = Readonly<{
  scrollTo(offset: number): void;
}>;

type CalendarAgendaProps = Readonly<{
  events: readonly CalendarAgendaEvent[];
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
    case "imported": return "Imported";
    case "matched": return "Matched";
  }
}

function resultOrTargetLabel(event: CalendarAgendaEvent): string {
  switch (event.status) {
    case "completed": return "Completed result";
    case "partial": return "Partial result";
    case "planned": return "Planned target";
    case "imported": return "Imported result";
    case "matched": return "Matched result";
  }
}

/** One read-only full-width target per source event. */
export const CalendarAgenda = forwardRef<CalendarAgendaHandle, CalendarAgendaProps>(
  function CalendarAgenda({
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
      return (
        <View accessibilityLabel="No workout. No scheduled or imported activity for this date." style={[styles.empty, { borderColor: colors.line }]}>
          <Text accessibilityRole="header" style={[typeScale.bodyStrong as TextStyle, { color: colors.textPrimary }]}>No workout</Text>
          <Text style={[typeScale.body as TextStyle, { color: colors.textSecondary }]}>No scheduled or imported activity for this date.</Text>
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
          const label = [event.title, resultOrTargetLabel(event), `${sport} · ${status}`, event.sourceLabel, "Open details"].join(". ");
          return (
            <FocusablePressable
              accessibilityHint="Opens read-only details"
              accessibilityLabel={label}
              accessibilityRole="button"
              key={event.id}
              onKeyDown={(event) => {
                if (event.nativeEvent.key === "Escape") onRequestBack();
              }}
              onPress={() => {
                if (activeEventIdRef.current !== null) return;
                activeEventIdRef.current = event.id;
                onActivateEvent(event.id);
                onOpenEvent(event.destination);
              }}
              ref={(node) => {
                if (node === null) rowRefs.current.delete(event.id);
                else rowRefs.current.set(event.id, node as CalendarAgendaRowHandle);
              }}
              style={({ pressed }) => [
                styles.row,
                { backgroundColor: pressed ? colors.surfaceSubtle : colors.surface, borderColor: colors.line },
              ]}
              testID={`calendar-agenda-event-${event.id}`}
            >
              <View style={[styles.rail, { backgroundColor: event.sport === "strength" ? colors.orange : colors.blue }]} />
              <View style={styles.copy}>
                <Text numberOfLines={undefined} style={[typeScale.bodyStrong as TextStyle, { color: colors.textPrimary }]}>{event.title}</Text>
                <Text numberOfLines={undefined} style={[typeScale.body as TextStyle, { color: colors.textSecondary }]}>{resultOrTargetLabel(event)}</Text>
                <Text numberOfLines={undefined} style={[typeScale.label as TextStyle, { color: colors.textSecondary }]}>{`${sport} · ${status}`}</Text>
                <Text numberOfLines={undefined} style={[typeScale.label as TextStyle, { color: colors.textSecondary }]}>{event.sourceLabel}</Text>
              </View>
              <Text accessible={false} style={[typeScale.sectionTitle as TextStyle, styles.chevron, { color: colors.textSecondary }]}>›</Text>
            </FocusablePressable>
          );
        })}
      </ScrollView>
    );
  },
);

const styles = StyleSheet.create({
  chevron: { minWidth: 24, textAlign: "center" },
  content: { gap: 10, paddingBottom: space[4] },
  copy: { flex: 1, gap: 2, minWidth: 0, paddingVertical: 10 },
  empty: { borderWidth: 1, gap: 6, padding: 10 },
  rail: { alignSelf: "stretch", minHeight: 82, width: 5 },
  row: { alignItems: "center", borderWidth: 1, flexDirection: "row", gap: 10, minHeight: 82, paddingRight: 10 },
  scroll: { flex: 1, minHeight: 0 },
});
