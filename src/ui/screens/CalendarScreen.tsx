import React, {
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  StyleSheet,
  Text,
  View,
  type TextStyle,
} from "react-native";

import type {
  CalendarDayState,
  CalendarMonth,
  HistoryProgress,
  HistorySessionSummary,
} from "../../domains/history";
import {
  addLocalDays,
  parseLocalDate,
  type LocalDate,
} from "../../domains/scheduling";
import {
  weekdayForLocalDate,
} from "../../domains/scheduling/localDate";
import {
  ContentCard,
  FocusablePressable,
  IconAction,
  PrimaryAction,
  ScreenHeader,
  SkeletonBlock,
} from "../components";
import {
  AdaptiveScreen,
} from "../layout/AdaptiveScreen";
import {
  radius,
  space,
  typeScale,
  useAppTheme,
} from "../theme";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const WEEKDAY_INDEX = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
} as const;

type CalendarScreenProps = Readonly<{
  initialDate: string;
  loadCalendarMonth(input: Readonly<{
    month: string;
    selectedDate: string;
    today: string;
  }>): Promise<CalendarMonth>;
  onOpenSession(sessionId: string): void;
  today?: string;
  width?: number;
}>;

function monthStart(value: LocalDate): LocalDate {
  return parseLocalDate(value.slice(0, 8) + "01");
}

function nextMonth(value: LocalDate, direction: -1 | 1): LocalDate {
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const total = year * 12 + month - 1 + direction;
  const nextYear = Math.floor(total / 12);
  const nextMonthNumber = (total % 12) + 1;
  return parseLocalDate(
    nextYear.toString().padStart(4, "0")
      + "-"
      + nextMonthNumber.toString().padStart(2, "0")
      + "-01",
  );
}

function daysInMonth(value: LocalDate): number {
  return Number(addLocalDays(nextMonth(value, 1), -1).slice(8, 10));
}

function monthLabel(value: LocalDate): string {
  return (MONTH_NAMES[Number(value.slice(5, 7)) - 1] ?? "")
    + " " + value.slice(0, 4);
}

function dateLabel(value: LocalDate): string {
  return Number(value.slice(8, 10))
    + " " + (MONTH_NAMES[Number(value.slice(5, 7)) - 1] ?? "")
    + " " + value.slice(0, 4);
}

function stateLabel(state: CalendarDayState): string {
  switch (state) {
    case "completed": return "Completed";
    case "partial": return "Partial";
    case "manual": return "Manual";
    case "planned_not_completed": return "Planned, not completed";
    case "today": return "Today";
  }
}

function stateGlyph(state: CalendarDayState): string {
  switch (state) {
    case "completed": return "✓";
    case "partial": return "◐";
    case "manual": return "M";
    case "planned_not_completed": return "–";
    case "today": return "•";
  }
}

function progressLabel(label: string, progress: HistoryProgress): string {
  const percent = progress.percent === null ? "" : " (" + progress.percent + "%)";
  return label + " · " + progress.completed + "/" + progress.planned + percent;
}

function titleForSession(session: HistorySessionSummary): string {
  const context = [session.planName, session.dayName].filter(Boolean).join(" · ");
  return context === "" ? session.sourceLabel : context;
}

function timeLabel(instantMs: number, timezone: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
      timeZone: timezone,
    }).format(new Date(instantMs));
  } catch {
    return "Time unavailable";
  }
}

function CalendarGrid({
  month,
  days,
  selectedDate,
  onSelectDate,
}: Readonly<{
  month: LocalDate;
  days: CalendarMonth["days"];
  selectedDate: LocalDate;
  onSelectDate(value: LocalDate): void;
}>) {
  const { colors } = useAppTheme();
  const statesByDate = useMemo(
    () => new Map(days.map((day) => [day.localDate, day.states])),
    [days],
  );
  const firstWeekday = WEEKDAY_INDEX[weekdayForLocalDate(month)];
  const cells: React.ReactNode[] = [];

  for (let index = 0; index < firstWeekday; index += 1) {
    cells.push(<View key={"blank-" + index} style={styles.dayBlank} />);
  }
  for (let day = 1; day <= daysInMonth(month); day += 1) {
    const date = parseLocalDate(month.slice(0, 8) + day.toString().padStart(2, "0"));
    const states = statesByDate.get(date) ?? [];
    const selected = date === selectedDate;
    const accessibilityLabel = [dateLabel(date), ...states.map(stateLabel)].join(". ") + ".";
    cells.push(
      <FocusablePressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        focusable
        key={date}
        onPress={() => onSelectDate(date)}
        style={({ pressed }: { pressed: boolean }) => [
          styles.dayCell,
          {
            backgroundColor: selected
              ? colors.contentCardSelected
              : pressed ? colors.contentCardPressed : colors.contentCard,
            borderColor: selected ? colors.action : colors.contentCardBorder,
          },
        ]}
      >
        <Text style={[typeScale.label as TextStyle, { color: colors.contentCardText }]}>
          {day}
        </Text>
        {states.length === 0 ? null : (
          <Text
            numberOfLines={1}
            style={[typeScale.secondary as TextStyle, { color: colors.contentCardTextSecondary }]}
          >
            {states.map(stateGlyph).join(" ")}
          </Text>
        )}
      </FocusablePressable>,
    );
  }
  return (
    <View accessibilityLabel="Calendar month grid" style={styles.grid} testID="calendar-month-grid">
      {WEEKDAYS.map((day) => (
        <Text key={day} style={[typeScale.label as TextStyle, styles.weekday, { color: colors.textSecondary }]}>
          {day}
        </Text>
      ))}
      {cells}
    </View>
  );
}

function SelectedDateSessions({
  selectedDate,
  days,
  sessions,
  onOpenSession,
}: Readonly<{
  selectedDate: LocalDate;
  days: CalendarMonth["days"];
  sessions: CalendarMonth["sessions"];
  onOpenSession(sessionId: string): void;
}>) {
  const { colors } = useAppTheme();
  const selectedStates = days.find((day) => day.localDate === selectedDate)?.states ?? [];
  return (
    <View style={styles.selectedSection}>
      <Text accessibilityRole="header" style={[typeScale.sectionTitle as TextStyle, { color: colors.textPrimary }]}>
        {dateLabel(selectedDate)}
      </Text>
      {selectedStates.length === 0 ? null : (
        <Text style={[typeScale.secondary as TextStyle, { color: colors.textSecondary }]}>
          {selectedStates.map(stateLabel).join(" · ")}
        </Text>
      )}
      {sessions.length === 0 ? (
        <Text style={[typeScale.body as TextStyle, { color: colors.textSecondary }]}>
          No sessions on {dateLabel(selectedDate)}
        </Text>
      ) : sessions.map((session) => (
        <FocusablePressable
          accessibilityLabel={"Open workout details for " + titleForSession(session)}
          accessibilityRole="button"
          focusable
          key={session.id}
          onPress={() => onOpenSession(session.id)}
          style={({ pressed }: { pressed: boolean }) => [styles.sessionPressable, { opacity: pressed ? 0.86 : 1 }]}
        >
          <ContentCard style={styles.sessionCard} testID={"calendar-session-card-" + session.id}>
            <Text style={[typeScale.bodyStrong as TextStyle, { color: colors.contentCardText }]}>
              {titleForSession(session)}
            </Text>
            <Text style={[typeScale.secondary as TextStyle, { color: colors.contentCardTextSecondary }]}>
              {session.status === "partial" ? "Partial" : session.status === "manual_visit" ? "Manual" : "Completed"}
              {" · "}{timeLabel(session.effective.startedAtMs, session.effective.timezone)}
            </Text>
            <Text style={[typeScale.secondary as TextStyle, { color: colors.contentCardTextSecondary }]}>
              {progressLabel("Exercises", session.exerciseProgress)}
            </Text>
            <Text style={[typeScale.secondary as TextStyle, { color: colors.contentCardTextSecondary }]}>
              {progressLabel("Working sets", session.workingSetProgress)}
            </Text>
          </ContentCard>
        </FocusablePressable>
      ))}
    </View>
  );
}

export function CalendarScreen({
  initialDate,
  loadCalendarMonth,
  onOpenSession,
  today = initialDate,
  width,
}: CalendarScreenProps) {
  const { colors } = useAppTheme();
  const parsedInitial = parseLocalDate(initialDate);
  const parsedToday = parseLocalDate(today);
  const [month, setMonth] = useState(() => monthStart(parsedInitial));
  const [selectedDate, setSelectedDate] = useState(parsedInitial);
  const [snapshot, setSnapshot] = useState<CalendarMonth | null>(null);
  const [failed, setFailed] = useState(false);
  const [requestKey, setRequestKey] = useState(0);
  const adaptiveWidth = width === undefined ? {} : { width };

  useEffect(() => {
    let active = true;
    setFailed(false);
    setSnapshot(null);
    void loadCalendarMonth({ month, selectedDate, today: parsedToday }).then((next) => {
      if (active) {
        setSnapshot(next);
      }
    }).catch(() => {
      if (active) {
        setFailed(true);
      }
    });
    return () => { active = false; };
  }, [loadCalendarMonth, month, parsedToday, requestKey, selectedDate]);

  const selectDate = (next: LocalDate) => {
    setSelectedDate(next);
    const nextDateMonth = monthStart(next);
    if (nextDateMonth !== month) {
      setMonth(nextDateMonth);
    }
  };

  const changeMonth = (direction: -1 | 1) => {
    const next = nextMonth(month, direction);
    const selectedDay = Math.min(Number(selectedDate.slice(8, 10)), daysInMonth(next));
    setMonth(next);
    setSelectedDate(parseLocalDate(next.slice(0, 8) + selectedDay.toString().padStart(2, "0")));
  };

  if (failed) {
    return (
      <AdaptiveScreen
        {...adaptiveWidth}
        primary={
          <>
            <ScreenHeader title="Calendar could not be loaded" />
            <Text style={[typeScale.body as TextStyle, { color: colors.textSecondary }]}>
              Your workout history was not changed. Try loading Calendar again.
            </Text>
            <PrimaryAction label="Retry Calendar" onPress={() => setRequestKey((value) => value + 1)} />
          </>
        }
      />
    );
  }

  if (snapshot === null) {
    return (
      <AdaptiveScreen
        {...adaptiveWidth}
        primary={
          <>
            <ScreenHeader title="Calendar" />
            <SkeletonBlock height={42} width="72%" />
            <SkeletonBlock height={300} />
            <SkeletonBlock height={136} />
          </>
        }
      />
    );
  }

  const primary = (
    <>
      <ScreenHeader title="Calendar" />
      <View style={styles.monthHeader}>
        <IconAction accessibilityLabel={"Show " + monthLabel(nextMonth(snapshot.month, -1))} icon="back" onPress={() => changeMonth(-1)} />
        <Text
          accessibilityRole="header"
          style={[typeScale.sectionTitle as TextStyle, { color: colors.textPrimary }]}
        >
          {monthLabel(snapshot.month)}
        </Text>
        <IconAction accessibilityLabel={"Show " + monthLabel(nextMonth(snapshot.month, 1))} icon="forward" onPress={() => changeMonth(1)} />
      </View>
      <CalendarGrid
        days={snapshot.days}
        month={snapshot.month}
        onSelectDate={selectDate}
        selectedDate={snapshot.selectedDate}
      />
    </>
  );
  const selected = (
    <SelectedDateSessions
      days={snapshot.days}
      onOpenSession={onOpenSession}
      selectedDate={snapshot.selectedDate}
      sessions={snapshot.sessions}
    />
  );
  return <AdaptiveScreen {...adaptiveWidth} primary={primary} secondary={selected} />;
}

const styles = StyleSheet.create({
  dayBlank: { minHeight: 64, width: "14.285%" },
  dayCell: {
    borderRadius: radius.standard,
    borderWidth: StyleSheet.hairlineWidth,
    gap: space[1],
    justifyContent: "space-between",
    minHeight: 64,
    padding: space[2],
    width: "14.285%",
  },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  monthHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  selectedSection: { gap: space[2] },
  sessionCard: { gap: space[1] },
  sessionPressable: { borderRadius: radius.standard },
  weekday: { textAlign: "center", width: "14.285%" },
});
